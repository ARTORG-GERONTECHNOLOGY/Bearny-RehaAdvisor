import json
import logging
from datetime import datetime, timedelta

import requests
from bson import ObjectId
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import redirect
from django.utils import timezone
from django.utils.timezone import is_naive, make_aware
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import FitbitData, FitbitUserToken, Patient, User

logger = logging.getLogger(__name__)
FITBIT_API_URL = "https://api.fitbit.com/1/user/-"
from django.utils.timezone import is_naive, make_aware, now

from core.views.fitbit_sync import fetch_fitbit_today_for_user


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
        thresholds = _merge_thresholds(patient)
        # Fetch today's Fitbit data
        fetch_fitbit_today_for_user(user)

        token = FitbitUserToken.objects(user=patient.userId).first()
        connected = bool(token)

        days = max(1, min(int(request.GET.get("days", 7)), 31))

        end = timezone.now()
        start = (end - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

        qs = FitbitData.objects(user=patient.userId, date__gte=start, date__lte=end).order_by("date")

        # -----------------------------
        # Pull patient vitals (BP) for range
        # Prefer latest entry per day (manual/device/provider)
        # -----------------------------
        vitals_qs = PatientVitals.objects(patientId=patient, date__gte=start, date__lte=end).order_by("-date")

        vitals_by_day = {}  # "YYYY-MM-DD" -> {"bp_sys":..., "bp_dia":..., "weight_kg":...}
        for v in vitals_qs:
            day_key = v.date.astimezone(timezone.get_current_timezone()).date().isoformat()
            if day_key not in vitals_by_day:
                vitals_by_day[day_key] = {
                    "bp_sys": v.bp_sys,
                    "bp_dia": v.bp_dia,
                    "weight_kg": v.weight_kg,
                    "source": getattr(v, "source", None),
                }

        daily = []

        # Totals / averages inputs
        steps_tot = []
        act_tot = []
        sleep_tot = []

        bp_sys_vals = []
        bp_dia_vals = []
        weight_vals = []

        valid_days = 0
        last_sync = None

        # Today midnight
        today_start = end.replace(hour=0, minute=0, second=0, microsecond=0)
        minutes_since_midnight = int((end - today_start).total_seconds() // 60)

        # ---------- Helper to parse sleep_end ----------
        def _parse_sleep_end(sleep_end_raw, day_start_dt):
            """Convert sleep_end into tz-aware datetime + wake minute."""
            if not sleep_end_raw:
                return None, 0

            if isinstance(sleep_end_raw, str):
                try:
                    sleep_end_raw = sleep_end_raw.replace("Z", "+00:00")
                    sleep_end_dt = datetime.fromisoformat(sleep_end_raw)
                except Exception:
                    return None, 0
            else:
                sleep_end_dt = sleep_end_raw

            if timezone.is_naive(sleep_end_dt):
                sleep_end_dt = timezone.make_aware(sleep_end_dt, timezone.get_current_timezone())

            if timezone.is_naive(day_start_dt):
                day_start_dt = timezone.make_aware(day_start_dt, timezone.get_current_timezone())

            wake_minute = int((sleep_end_dt - day_start_dt).total_seconds() // 60)
            wake_minute = max(0, min(1440, wake_minute))
            return sleep_end_dt, wake_minute

        # ---------- Build daily ----------
        for d in qs:
            sm = _sleep_minutes(d)
            am = int(d.active_minutes or 0)
            st = int(d.steps or 0)

            sleep_obj = getattr(d, "sleep", None)
            sleep_end_raw = getattr(sleep_obj, "sleep_end", None)

            # Day start for this record
            day_start = d.date.replace(hour=0, minute=0, second=0, microsecond=0)
            if timezone.is_naive(day_start):
                day_start = timezone.make_aware(day_start, timezone.get_current_timezone())

            _, wake_minute = _parse_sleep_end(sleep_end_raw, day_start)

            # Awake window (still used if you want; but we are NOT returning inactivity anymore)
            if d.date.date() == today_start.date():
                awake_window = max(0, minutes_since_midnight - wake_minute)
            else:
                awake_window = max(0, 1440 - wake_minute)

            # -----------------------------
            # BP & Weight resolution: FitbitData first, else PatientVitals day map
            # -----------------------------
            day_key = d.date.astimezone(timezone.get_current_timezone()).date().isoformat()

            bp_sys = getattr(d, "bp_sys", None)
            bp_dia = getattr(d, "bp_dia", None)

            if bp_sys is None or bp_dia is None:
                vday = vitals_by_day.get(day_key) or {}
                bp_sys = bp_sys if bp_sys is not None else vday.get("bp_sys")
                bp_dia = bp_dia if bp_dia is not None else vday.get("bp_dia")

            weight_kg = getattr(d, "weight_kg", None)

            if weight_kg is None:
                vday = vitals_by_day.get(day_key) or {}
                weight_kg = vday.get("weight_kg")

            row = {
                "date": d.date.isoformat(),
                "steps": st,
                "active_minutes": am,
                "sleep_minutes": sm,
                "bp_sys": bp_sys,
                "bp_dia": bp_dia,
                "weight_kg": weight_kg,
            }
            daily.append(row)

            # Valid day?
            has_real_data = (
                (d.steps not in (None, 0))
                or (d.active_minutes not in (None, 0))
                or (sm not in (None, 0))
                or (bp_sys is not None)
                or (bp_dia is not None)
                or (weight_kg is not None)
            )

            if has_real_data:
                valid_days += 1
                steps_tot.append(st)
                act_tot.append(am)
                sleep_tot.append(sm)

                if bp_sys is not None:
                    bp_sys_vals.append(int(bp_sys))
                if bp_dia is not None:
                    bp_dia_vals.append(int(bp_dia))
                if weight_kg is not None:
                    weight_vals.append(float(weight_kg))

            last_sync = d.date

        valid_days = max(1, valid_days)

        # ---------- Today payload ----------
        today_qs = FitbitData.objects(user=patient.userId, date__gte=today_start).order_by("-date")
        today = today_qs.first() or qs.order_by("-date").first()

        today_payload = None
        if today:
            sm = _sleep_minutes(today)
            am = int(today.active_minutes or 0)

            sleep_obj = getattr(today, "sleep", None)
            sleep_end_raw = getattr(sleep_obj, "sleep_end", None)

            day_start_today = today.date.replace(hour=0, minute=0, second=0, microsecond=0)
            if timezone.is_naive(day_start_today):
                day_start_today = timezone.make_aware(day_start_today, timezone.get_current_timezone())

            _parse_sleep_end(sleep_end_raw, day_start_today)

            # BP & Weight resolution for today
            day_key_today = today.date.astimezone(timezone.get_current_timezone()).date().isoformat()
            bp_sys_today = getattr(today, "bp_sys", None)
            bp_dia_today = getattr(today, "bp_dia", None)
            if bp_sys_today is None or bp_dia_today is None:
                vday = vitals_by_day.get(day_key_today) or {}
                bp_sys_today = bp_sys_today if bp_sys_today is not None else vday.get("bp_sys")
                bp_dia_today = bp_dia_today if bp_dia_today is not None else vday.get("bp_dia")
            weight_today = getattr(today, "weight_kg", None)
            if weight_today is None:
                vday = vitals_by_day.get(day_key_today) or {}
                weight_today = vday.get("weight_kg")

            today_payload = {
                "steps": int(today.steps or 0),
                "active_minutes": am,
                "sleep_minutes": sm,
                "resting_heart_rate": (int(today.resting_heart_rate) if today.resting_heart_rate is not None else None),
                "bp_sys": bp_sys_today,
                "bp_dia": bp_dia_today,
                "weight_kg": weight_today,
            }

        def avg_nums(vals):
            nums = [int(x) for x in vals if x is not None]
            return (sum(nums) / len(nums)) if nums else None

        return JsonResponse(
            {
                "connected": connected,
                "thresholds": thresholds,
                "last_sync": last_sync.isoformat() if last_sync else None,
                "today": today_payload,
                "period": {
                    "days": days,
                    "totals": {
                        "steps": sum(steps_tot),
                        "active_minutes": sum(act_tot),
                        "sleep_minutes": sum(sleep_tot),
                        # BP totals are not very meaningful; keep or remove as you prefer:
                        "bp_sys": (sum([int(x) for x in bp_sys_vals]) if bp_sys_vals else None),
                        "bp_dia": (sum([int(x) for x in bp_dia_vals]) if bp_dia_vals else None),
                        "weight_kg": (sum(weight_vals) if weight_vals else None),
                    },
                    "averages": {
                        "steps": avg_excluding_zero(steps_tot),
                        "active_minutes": avg_excluding_zero(act_tot),
                        "sleep_minutes": avg_excluding_zero(sleep_tot),
                        "bp_sys": avg_nums(bp_sys_vals),
                        "bp_dia": avg_nums(bp_dia_vals),
                        "weight_kg": avg_nums(weight_vals),
                    },
                    "daily": daily,
                },
            },
            status=200,
        )

    except Exception as e:
        logger.error("[fitbit_summary] %s", e, exc_info=True)
        return JsonResponse({"error": "Internal Server Error"}, status=500)


def _default_thresholds():
    return {
        "steps_goal": 10000,
        "active_minutes_green": 30,
        "active_minutes_yellow": 20,
        "sleep_green_min": 7 * 60,
        "sleep_yellow_min": 6 * 60,
        "bp_sys_green_max": 129,
        "bp_sys_yellow_max": 139,
        "bp_dia_green_max": 84,
        "bp_dia_yellow_max": 89,
    }


def _merge_thresholds(patient):
    """
    Merge patient.thresholds into backend defaults.
    If patient has no thresholds or partial thresholds, defaults fill the gaps.
    """
    base = _default_thresholds()

    th = getattr(patient, "thresholds", None)
    if not th:
        return base

    # mongoengine EmbeddedDocument -> attributes
    for k in list(base.keys()):
        v = getattr(th, k, None)
        if v is not None:
            base[k] = v
    return base


@csrf_exempt
@permission_classes([IsAuthenticated])
def fitbit_status(request, patient_id):
    connected = FitbitUserToken.objects.filter(user=ObjectId(patient_id)).count() > 0
    logger.info(f"[fitbit_status] Patient {patient_id} connected: {connected}")
    return JsonResponse({"connected": connected})


@csrf_exempt
@permission_classes([IsAuthenticated])
def fitbit_callback(request):
    code = request.GET.get("code")
    state = request.GET.get("state")  # carries patient_id from frontend

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

    token_url = "https://api.fitbit.com/oauth2/token"
    client_id = settings.FITBIT_CLIENT_ID
    client_secret = settings.FITBIT_CLIENT_SECRET
    redirect_uri = settings.FITBIT_REDIRECT_URI
    basic_auth = requests.auth.HTTPBasicAuth(client_id, client_secret)

    data = {
        "client_id": client_id,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
        "code": code,
    }

    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    try:
        response = requests.post(token_url, auth=basic_auth, data=data, headers=headers)
        logger.debug(f"[fitbit_callback] Token exchange response: {response.status_code}, {response.text}")

        if response.status_code == 200:
            token_data = response.json()

            FitbitUserToken.objects(user=user).update_one(
                set__access_token=token_data["access_token"],
                set__refresh_token=token_data["refresh_token"],
                set__expires_at=timezone.now() + timedelta(seconds=token_data["expires_in"]),
                set__fitbit_user_id=token_data["user_id"],
                upsert=True,
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

        # Convert to european DD.MM.YYYY
        def eu_date(d):
            return d.strftime("%d.%m.%Y")

        # ---- Parse date range ----
        from_str = request.GET.get("from")
        to_str = request.GET.get("to")

        if from_str and to_str:
            from_date = datetime.strptime(from_str, "%Y-%m-%d").date()
            to_date = datetime.strptime(to_str, "%Y-%m-%d").date()
        else:
            to_date = timezone.now().date()
            from_date = to_date - timedelta(days=30)

        # ---- Query FitbitData ----
        fitbit_entries = FitbitData.objects(user=patient.userId, date__gte=from_date, date__lte=to_date).order_by(
            "date"
        )

        # ---- Query Vitals ----
        vitals_qs = PatientVitals.objects(patientId=patient, date__gte=from_date, date__lte=to_date).order_by("date")

        vitals_by_date = {
            eu_date(v.date): {
                "weight_kg": v.weight_kg,
                "bp_sys": v.bp_sys,
                "bp_dia": v.bp_dia,
            }
            for v in vitals_qs
        }

        # ---- Merge output ----
        out = []

        for entry in fitbit_entries:
            key = eu_date(entry.date)
            vitals = vitals_by_date.get(key, {})

            # Normalize exercise data
            ex_raw = entry.exercise or {}
            if isinstance(ex_raw, dict):
                sessions = ex_raw.get("sessions", [])
            elif isinstance(ex_raw, list):
                sessions = ex_raw
            else:
                sessions = []

            exercise_out = {
                "sessions": [
                    {
                        "logId": s.get("logId"),
                        "name": s.get("name"),
                        "duration_min": (s.get("duration") or 0) / 60000,
                        "duration_hr": round(((s.get("duration") or 0) / 60000) / 60, 2),
                        "averageHeartRate": s.get("averageHeartRate"),
                        "maxHeartRate": s.get("maxHeartRate"),
                        "calories": s.get("calories"),
                    }
                    for s in sessions
                ]
            }

            # Sleep normalization
            sleep = None
            if entry.sleep:
                duration_min = (entry.sleep.sleep_duration or 0) / 60000
                sleep = {
                    "sleep_minutes": duration_min,
                    "sleep_hours": round(duration_min / 60, 2),
                    "minutes_asleep": entry.sleep.minutes_asleep,
                    "sleep_start": entry.sleep.sleep_start,
                    "sleep_end": entry.sleep.sleep_end,
                    "awakenings": entry.sleep.awakenings,
                }

            # HR zones
            zones = []
            if entry.heart_rate_zones:
                for z in entry.heart_rate_zones:
                    zones.append(
                        {
                            "name": z.name,
                            "minutes": z.minutes,
                            "min": z.min,
                            "max": z.max,
                            "range_str": (f"{z.min}-{z.max} bpm" if z.min and z.max else None),
                            "caloriesOut": getattr(z, "caloriesOut", None),
                        }
                    )

            out.append(
                {
                    "date": key,
                    "steps": entry.steps,
                    "resting_heart_rate": entry.resting_heart_rate,
                    "floors": entry.floors,
                    "distance": entry.distance,
                    "calories": entry.calories,
                    "active_minutes": entry.active_minutes,
                    "breathing_rate": entry.breathing_rate,
                    "hrv": entry.hrv,
                    "sleep": sleep,
                    "heart_rate_zones": zones,
                    "exercise": exercise_out,
                    # Single-point vitals
                    "weight_kg": vitals.get("weight_kg"),
                    "bp_sys": vitals.get("bp_sys"),
                    "bp_dia": vitals.get("bp_dia"),
                }
            )

        return JsonResponse({"data": out}, status=200)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Exception as e:
        logger.exception("[get_fitbit_health_data] error")
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

    FitbitData.objects(user=patient.userId, date=date).update_one(set__steps=steps, upsert=True)

    return JsonResponse({"success": True, "steps": steps, "date": date}, status=200)


import datetime

from bson import ObjectId
from django.http import JsonResponse

# --------------------------------------------
# HEALTH-COMBINED-HISTORY ENDPOINT
# --------------------------------------------
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import (
    FitbitData,
    Patient,
    PatientInterventionLogs,
    PatientVitals,
    RehabilitationPlan,
    User,
)


# Helper
def _date(d):
    if isinstance(d, datetime.datetime):
        return d.date().strftime("%Y-%m-%d")
    if isinstance(d, datetime.date):
        return d.strftime("%Y-%m-%d")
    return None


@csrf_exempt
@permission_classes([IsAuthenticated])
def health_combined_history(request, patient_id):
    """
    Returns:
    {
        "fitbit": [...],          # FitbitEntry[]
        "questionnaire": [...],   # QuestionnaireEntry[]
        "adherence": [...],       # Adherence entries
    }

    Includes:
       - All FitbitData fields
       - weight_kg, bp_sys, bp_dia (merged from PatientVitals)
    """

    try:
        # -------------------------
        # 1) Resolve Patient
        # -------------------------
        try:
            patient = Patient.objects.get(id=ObjectId(patient_id))
        except Patient.DoesNotExist:
            return JsonResponse({"error": "Patient not found"}, status=404)

        # -------------------------
        # 2) Parse time range
        # -------------------------
        from_str = request.GET.get("from")
        to_str = request.GET.get("to")

        if from_str and to_str:
            from_date = datetime.strptime(from_str, "%Y-%m-%d").date()
            to_date = datetime.strptime(to_str, "%Y-%m-%d").date()
        else:
            to_date = timezone.now().date()
            from_date = to_date - timedelta(days=30)

        # -------------------------
        # 3) Load FitbitData
        # -------------------------
        fitbit_qs = FitbitData.objects(
            user=patient.userId,
            date__gte=from_date,
            date__lte=to_date,
        ).order_by("date")

        # Index by date for merging
        fitbit_map = {}
        for f in fitbit_qs:
            dkey = f.date.strftime("%Y-%m-%d")
            fitbit_map[dkey] = f

        # -------------------------
        # 4) Load PatientVitals
        # -------------------------
        vitals_qs = PatientVitals.objects(
            patientId=patient,
            date__gte=from_date,
            date__lte=to_date,
        ).order_by("date")

        # Merge vitals into FitbitData objects
        for v in vitals_qs:
            dkey = v.date.strftime("%Y-%m-%d")
            f = fitbit_map.get(dkey)

            if f:
                # Update existing FitbitData row
                f.weight_kg = v.weight_kg
                f.bp_sys = v.bp_sys
                f.bp_dia = v.bp_dia
                f.save()
            else:
                # If no FitbitData for that day, create a minimal entry
                fd = FitbitData(
                    user=patient.userId,
                    date=datetime.combine(v.date, datetime.min.time()),
                    weight_kg=v.weight_kg,
                    bp_sys=v.bp_sys,
                    bp_dia=v.bp_dia,
                )
                fd.save()
                fitbit_map[dkey] = fd

        # Now convert fitbit_map → sorted list
        fitbit_list = []
        for key in sorted(fitbit_map.keys()):
            f = fitbit_map[key]
            fitbit_list.append(
                {
                    "date": key,
                    "steps": f.steps,
                    "resting_heart_rate": f.resting_heart_rate,
                    "max_heart_rate": f.max_heart_rate,
                    "floors": f.floors,
                    "distance": f.distance,
                    "calories": f.calories,
                    "active_minutes": f.active_minutes,
                    "sleep": {
                        "sleep_duration": f.sleep.sleep_duration if f.sleep else None,
                        "minutes_asleep": f.sleep.minutes_asleep if f.sleep else None,
                        "sleep_start": f.sleep.sleep_start if f.sleep else None,
                        "sleep_end": f.sleep.sleep_end if f.sleep else None,
                        "awakenings": f.sleep.awakenings if f.sleep else None,
                    },
                    "wear_time_minutes": f.wear_time_minutes,
                    "heart_rate_zones": [
                        {
                            "name": z.name,
                            "min": z.min,
                            "max": z.max,
                            "minutes": z.minutes,
                        }
                        for z in (f.heart_rate_zones or [])
                    ],
                    "breathing_rate": f.breathing_rate,
                    "hrv": f.hrv,
                    "exercise": f.exercise or {},
                    # NEW vitals injected into FitbitEntry[]
                    "weight_kg": f.weight_kg,
                    "bp_sys": f.bp_sys,
                    "bp_dia": f.bp_dia,
                }
            )

        # -------------------------
        # 5) Questionnaire history
        # -------------------------
        q_qs = PatientICFRating.objects(
            patientId=patient,
            date__gte=from_date,
            date__lte=to_date,
        ).order_by("date")

        questionnaire_list = []
        for q in q_qs:
            entries = list(getattr(q, "feedback_entries", None) or [])
            if not entries:
                questionnaire_list.append(
                    {
                        "date": q.date.date().isoformat(),
                        "questionKey": q.icfCode,
                        "answers": [],
                        "questionTranslations": [],
                        "comment": "",
                        "audio_url": None,
                        "media_urls": [],
                    }
                )
                continue

            for entry in entries:
                parsed_answers = []
                for ans in (getattr(entry, "answerKey", None) or []):
                    if hasattr(ans, "key"):
                        parsed_answers.append(
                            {
                                "key": ans.key,
                                "translations": [
                                    {"language": tr.language, "text": tr.text}
                                    for tr in (getattr(ans, "translations", None) or [])
                                ],
                            }
                        )
                    else:
                        parsed_answers.append(
                            {"key": str(ans), "translations": [{"language": "en", "text": str(ans)}]}
                        )

                question_obj = getattr(entry, "questionId", None)
                question_key = (
                    getattr(question_obj, "questionKey", None)
                    or getattr(q, "icfCode", None)
                    or ""
                )
                question_translations = [
                    {"language": tr.language, "text": tr.text}
                    for tr in (getattr(question_obj, "translations", None) or [])
                ]
                audio_url = getattr(entry, "audio_url", None)
                media_urls = [audio_url] if audio_url else []

                questionnaire_list.append(
                    {
                        "date": q.date.date().isoformat(),
                        "questionKey": question_key,
                        "answers": parsed_answers,
                        "questionTranslations": question_translations,
                        "comment": getattr(entry, "comment", "") or "",
                        "audio_url": audio_url,
                        "media_urls": media_urls,
                    }
                )

        # -------------------------
        # 6) Adherence data
        # -------------------------
        logs = PatientInterventionLogs.objects(
            patientId=patient,
            date__gte=from_date,
            date__lte=to_date,
        ).order_by("date")

        adherence_list = []
        for l in logs:
            adherence_list.append(
                {
                    "date": l.date.date().isoformat(),
                    "scheduled": l.scheduled_count,
                    "completed": l.completed_count,
                    "pct": l.adherence_percentage,
                }
            )

        # -------------------------
        # 7) Return everything
        # -------------------------
        return JsonResponse(
            {
                "fitbit": fitbit_list,
                "questionnaire": questionnaire_list,
                "adherence": adherence_list,
            },
            status=200,
        )

    except Exception as e:
        logger.exception("[health_combined_history] error")
        return JsonResponse({"error": str(e)}, status=500)
