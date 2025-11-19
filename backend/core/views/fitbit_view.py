

import logging
import requests
import json
from datetime import datetime

from django.shortcuts import redirect
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from core.models import FitbitUserToken, User, FitbitData, Patient
from bson import ObjectId
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from django.http import JsonResponse
from django.utils.timezone import make_aware, is_naive
logger = logging.getLogger(__name__)
FITBIT_API_URL = 'https://api.fitbit.com/1/user/-'
from core.views.fitbit_sync import fetch_fitbit_today_for_user
from django.utils.timezone import is_naive, make_aware, now



def _resolve_patient(patient_id: str):
    """Try Patient.pk first; then Patient.userId."""
    try:
        return Patient.objects.get(pk=patient_id)
    except Exception:
        try:
            return Patient.objects.get(userId=ObjectId(patient_id))
        except Exception:
            return None



def _sleep_minutes(entry: FitbitData) -> int:
    try:
        dur_ms = (entry.sleep.sleep_duration or 0) if entry.sleep else 0
        return int(round(dur_ms / 60000))
    except Exception:
        return 0


def _resolve_patient(request, patient_id: str | None):
    """
    Resolution order:
      1) Path param patient_id (accepts Patient.id OR User.id)
      2) Query param patientId / patient_id (accepts Patient.id OR User.id)
      3) Current Django user -> Mongo User by email/username -> Patient(userId=User)
    """
    # 1) explicit path
    candidate = patient_id or request.GET.get("patientId") or request.GET.get("patient_id")
    if candidate:
        # Try as Patient.id
        try:
            return Patient.objects.get(pk=candidate)
        except Patient.DoesNotExist:
            pass
        # Try as User.id -> Patient(userId=that user)
        try:
            mu = User.objects.get(pk=candidate)
            return Patient.objects.get(userId=mu)
        except (User.DoesNotExist, Patient.DoesNotExist):
            pass

    # 3) infer from authenticated Django user
    dj = getattr(request, "user", None)
    if dj and getattr(dj, "is_authenticated", False):
        # Try by email
        keys = []
        email = getattr(dj, "email", None)
        username = getattr(dj, "username", None)
        if email:
            keys.append({"email": email})
            keys.append({"username": email})
        if username and username != email:
            keys.append({"username": username})
            keys.append({"email": username})

        for filt in keys:
            try:
                mu = User.objects.get(**filt)
                return Patient.objects.get(userId=mu)
            except (User.DoesNotExist, Patient.DoesNotExist):
                continue

    return None

def avg_excluding_zero(values):
    non_zero = [v for v in values if v > 0]
    return sum(non_zero) // len(non_zero) if non_zero else 0


@csrf_exempt
@permission_classes([IsAuthenticated])
def fitbit_summary(request, patient_id=None):
    try:
        # Resolve the patient
        patient = _resolve_patient(request, patient_id)
        if not patient:
            return JsonResponse({"error": "Cannot resolve patient"}, status=400)

        # Retrieve the corresponding user object
        user = User.objects(id=patient.userId.id).first()
        if not user:
            return JsonResponse({"error": "User not found for patient"}, status=404)

        # Fetch today's Fitbit data
        fetch_fitbit_today_for_user(user)

        token = FitbitUserToken.objects(user=patient.userId).first()
        connected = bool(token)

        days = max(1, min(int(request.GET.get("days", 7)), 31))

        end = timezone.now()
        start = (end - timedelta(days=days - 1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        qs = FitbitData.objects(
            user=patient.userId, date__gte=start, date__lte=end
        ).order_by("date")

        daily = []

        # Totals
        steps_tot = []
        act_tot = []
        sleep_tot = []
        inact_tot = []

        valid_days = 0
        last_sync = None

        # Today midnight
        today_start = end.replace(hour=0, minute=0, second=0, microsecond=0)
        minutes_since_midnight = int(
            (end - today_start).total_seconds() // 60
        )

        # ---------- Helper to parse sleep_end ----------
        def _parse_sleep_end(sleep_end_raw, day_start_dt):
            """Convert sleep_end into tz-aware datetime + wake minute."""
            if not sleep_end_raw:
                return None, 0

            # Parse string -> datetime
            if isinstance(sleep_end_raw, str):
                try:
                    sleep_end_raw = sleep_end_raw.replace("Z", "+00:00")
                    sleep_end_dt = datetime.fromisoformat(sleep_end_raw)
                except Exception:
                    return None, 0
            else:
                sleep_end_dt = sleep_end_raw

            # --- ensure sleep_end_dt is timezone aware ---
            if timezone.is_naive(sleep_end_dt):
                sleep_end_dt = timezone.make_aware(
                    sleep_end_dt, timezone.get_current_timezone()
                )

            # --- ensure day_start_dt is timezone aware ---
            if timezone.is_naive(day_start_dt):
                day_start_dt = timezone.make_aware(
                    day_start_dt, timezone.get_current_timezone()
                )

            wake_minute = int((sleep_end_dt - day_start_dt).total_seconds() // 60)
            wake_minute = max(0, min(1440, wake_minute))

            return sleep_end_dt, wake_minute

        # ---------- Build daily ----------
        for d in qs:
            sm = _sleep_minutes(d)
            am = int(d.active_minutes or 0)
            st = int(d.steps or 0)

            print(f"Processing date {d.date}: steps={st}, active_minutes={am}, sleep_minutes={sm}")

            sleep_obj = getattr(d, "sleep", None)
            sleep_end_raw = getattr(sleep_obj, "sleep_end", None)

            # Day start for this record
            day_start = d.date.replace(hour=0, minute=0, second=0, microsecond=0)
            if timezone.is_naive(day_start):
                day_start = timezone.make_aware(day_start, timezone.get_current_timezone())

            _, wake_minute = _parse_sleep_end(sleep_end_raw, day_start)

            # Awake window
            if d.date.date() == today_start.date():
                awake_window = max(0, minutes_since_midnight - wake_minute)
            else:
                awake_window = max(0, 1440 - wake_minute)

            inactivity = max(0, awake_window - am)
            inactivity = min(inactivity, awake_window)

            row = {
                "date": d.date.isoformat(),
                "steps": st,
                "active_minutes": am,
                "sleep_minutes": sm,
                "inactivity_minutes": inactivity,
            }
            daily.append(row)

            # Valid day?
            has_real_data = (
                (d.steps not in (None, 0)) or
                (d.active_minutes not in (None, 0)) or
                (sm not in (None, 0))
            )

            if has_real_data:
                valid_days += 1
                steps_tot.append(st)
                act_tot.append(am)
                sleep_tot.append(sm)          
                inact_tot.append(inactivity)   
            last_sync = d.date


        valid_days = max(1, valid_days)

        # ---------- Today payload ----------
        today_qs = FitbitData.objects(
            user=patient.userId, date__gte=today_start
        ).order_by("-date")
        today = today_qs.first() or qs.order_by("-date").first()

        today_payload = None
        if today:
            sm = _sleep_minutes(today)
            am = int(today.active_minutes or 0)

            sleep_obj = getattr(today, "sleep", None)
            sleep_end_raw = getattr(sleep_obj, "sleep_end", None)

            day_start_today = today.date.replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            if timezone.is_naive(day_start_today):
                day_start_today = timezone.make_aware(
                    day_start_today, timezone.get_current_timezone()
                )

            _, wake_minute_today = _parse_sleep_end(
                sleep_end_raw, day_start_today
            )

            if today.date.date() == today_start.date():
                awake_window_today = max(0, minutes_since_midnight - wake_minute_today)
            else:
                awake_window_today = max(0, 1440 - wake_minute_today)

            im = max(0, awake_window_today - am)
            im = min(im, awake_window_today)

            today_payload = {
                "steps": int(today.steps or 0),
                "active_minutes": am,
                "sleep_minutes": sm,
                "inactivity_minutes": im,
                "resting_heart_rate": (
                    int(today.resting_heart_rate)
                    if today.resting_heart_rate is not None
                    else None
                ),
            }
        return JsonResponse(
            {
                "connected": connected,
                "last_sync": last_sync.isoformat() if last_sync else None,
                "today": today_payload,
                "period": {
                    "days": days,
                    "totals": {
                        "steps": sum(steps_tot),
                        "active_minutes": sum(act_tot),
                        "sleep_minutes": sum(sleep_tot),
                        "inactivity_minutes": sum(inact_tot),
                    },
                    "averages": {
                        "steps": avg_excluding_zero(steps_tot),
                        "active_minutes": avg_excluding_zero(act_tot),
                        "sleep_minutes": avg_excluding_zero(sleep_tot),
                        "inactivity_minutes": avg_excluding_zero(inact_tot),
                    },
                    "daily": daily,
                },
            },
            status=200,
        )

    except Exception as e:
        logger.error("[fitbit_summary] %s", e, exc_info=True)
        return JsonResponse({"error": "Internal Server Error"}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def fitbit_status(request, patient_id):
    connected = FitbitUserToken.objects.filter(user=ObjectId(patient_id)).count() > 0
    logger.info(f"[fitbit_status] Patient {patient_id} connected: {connected}")
    return JsonResponse({'connected': connected})


@csrf_exempt
@permission_classes([IsAuthenticated])
def fitbit_callback(request):
    code = request.GET.get('code')
    state = request.GET.get('state')  # carries patient_id from frontend

    if not code:
        logger.warning("[fitbit_callback] No code returned from Fitbit.")
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=missing_code")

    if not state:
        logger.error("[fitbit_callback] Missing 'state' param (patient_id).")
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=unauthorized")

    try:
        user_id = ObjectId(state)
        user = User.objects.get(id=user_id)
    except Exception as e:
        logger.exception(f"[fitbit_callback] Invalid or missing user: {e}")
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=invalid_user")

    logger.info(f"[fitbit_callback] Received code: {code} for user {user.id}")

    token_url = 'https://api.fitbit.com/oauth2/token'
    client_id = settings.FITBIT_CLIENT_ID
    client_secret = settings.FITBIT_CLIENT_SECRET
    redirect_uri = settings.FITBIT_REDIRECT_URI
    basic_auth = requests.auth.HTTPBasicAuth(client_id, client_secret)

    data = {
        'client_id': client_id,
        'grant_type': 'authorization_code',
        'redirect_uri': redirect_uri,
        'code': code,
    }

    headers = {'Content-Type': 'application/x-www-form-urlencoded'}

    try:
        response = requests.post(token_url, auth=basic_auth, data=data, headers=headers)
        logger.debug(f"[fitbit_callback] Token exchange response: {response.status_code}, {response.text}")

        if response.status_code == 200:
            token_data = response.json()

            FitbitUserToken.objects(user=user).update_one(
                set__access_token=token_data['access_token'],
                set__refresh_token=token_data['refresh_token'],
                set__expires_at=timezone.now() + timedelta(seconds=token_data['expires_in']),
                set__fitbit_user_id=token_data['user_id'],
                upsert=True
            )

            logger.info(f"[fitbit_callback] Fitbit token saved for user {user.id}")
            return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=connected")

        else:
            logger.error(f"[fitbit_callback] Fitbit token exchange failed: {response.text}")
            return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=error")

    except Exception as e:
        logger.exception(f"[fitbit_callback] Exception during token exchange: {e}")
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=error")






@csrf_exempt
@permission_classes([IsAuthenticated])
def get_fitbit_health_data(request, patient_id):
    try:
        patient = Patient.objects.get(id=ObjectId(patient_id))

        # Parse optional time range
        from_str = request.GET.get('from')
        to_str = request.GET.get('to')

        if from_str and to_str:
            from_date = datetime.datetime.strptime(from_str, '%Y-%m-%d').date()
            to_date = datetime.datetime.strptime(to_str, '%Y-%m-%d').date()
        else:
            # Default: last 30 days
            to_date = timezone.now().date()
            from_date = to_date - datetime.timedelta(days=30)

        # Filter by date range and sort
        entries = FitbitData.objects(
            user=patient.userId,
            date__gte=from_date,
            date__lte=to_date
        ).order_by('date')

        data = []
        for entry in entries:
            data.append({
                "date": entry.date.strftime('%Y-%m-%d'),
                "steps": entry.steps,
                "resting_heart_rate": entry.resting_heart_rate,
                "floors": entry.floors,
                "distance": entry.distance,
                "calories": entry.calories,
                "active_minutes": entry.active_minutes,
                "heart_rate_zones": [
                    {
                        "name": zone.name,
                        "minutes": zone.minutes,
                        "caloriesOut": zone.caloriesOut,
                        "min": zone.min,
                        "max": zone.max
                    } for zone in (entry.heart_rate_zones or [])
                ],
                "sleep": {
                    "sleep_duration": entry.sleep.sleep_duration if entry.sleep else None,
                    "sleep_start": entry.sleep.sleep_start if entry.sleep else None,
                    "sleep_end": entry.sleep.sleep_end if entry.sleep else None,
                    "awakenings": entry.sleep.awakenings if entry.sleep else None
                },
                "eda": entry.eda,
                "skin_temperature": entry.skin_temperature,
                "spo2": entry.spo2,
                "breathing_rate": entry.breathing_rate,
                "exercise": entry.exercise
            })

        return JsonResponse({"data": data}, safe=False)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def manual_steps(request, patient_id):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    date = data.get("date")
    steps = data.get("steps")

    if not date or steps is None:
        return JsonResponse({"error": "Missing date or steps"}, status=400)

    try:
        steps = int(steps)
    except (TypeError, ValueError):
        return JsonResponse({"error": "Invalid steps value"}, status=400)

    patient = _resolve_patient(request, patient_id)

    if not patient:
        return JsonResponse({"error": "Patient not found"}, status=404)

    FitbitData.objects(user=patient.userId, date=date).update_one(
        set__steps=steps,
        upsert=True
    )

    return JsonResponse({"success": True, "steps": steps, "date": date}, status=200)

