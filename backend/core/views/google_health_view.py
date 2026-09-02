# core/views/google_health_view.py
import json
import logging
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlparse

import redis
import requests
from bson import ObjectId
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import redirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import (
    GoogleHealthData,
    GoogleHealthUserToken,
    Patient,
    PatientInterventionLogs,
    PatientVitals,
    User,
)
from core.views.wearable_utils import (
    _default_thresholds,
    _merge_thresholds,
    _resolve_patient,
    _resolve_user_for_fitbit_status,
    avg_excluding_zero,
)


def _parse_sleep_end(sleep_end_raw, day_start_dt):
    """Convert sleep_end string to tz-aware datetime and minutes-since-midnight."""
    if not sleep_end_raw:
        return None, 0
    if isinstance(sleep_end_raw, str):
        try:
            sleep_end_dt = datetime.fromisoformat(sleep_end_raw.replace("Z", "+00:00"))
        except Exception:
            return None, 0
    else:
        sleep_end_dt = sleep_end_raw
    if timezone.is_naive(sleep_end_dt):
        sleep_end_dt = timezone.make_aware(sleep_end_dt, timezone.get_current_timezone())
    if timezone.is_naive(day_start_dt):
        day_start_dt = timezone.make_aware(day_start_dt, timezone.get_current_timezone())
    wake_minute = int((sleep_end_dt - day_start_dt).total_seconds() // 60)
    return sleep_end_dt, max(0, min(1440, wake_minute))


from core.views.google_health_sync import fetch_google_health_today_for_user

logger = logging.getLogger(__name__)

_OAUTH_NONCE_TTL = 600  # seconds — 10 minutes


def _get_redis_client():
    """Return a Redis client built from the Celery broker URL."""
    url = getattr(settings, "CELERY_BROKER_URL", "redis://redis:6379/0")
    parsed = urlparse(url)
    use_ssl = parsed.scheme == "rediss"
    ssl_ca_certs = getattr(settings, "BROKER_USE_SSL", {})
    if isinstance(ssl_ca_certs, dict):
        ssl_ca_certs = ssl_ca_certs.get("ssl_ca_certs")
    return redis.Redis(
        host=parsed.hostname,
        port=parsed.port or 6379,
        db=int((parsed.path or "/0").lstrip("/") or 0),
        password=parsed.password,
        ssl=use_ssl,
        ssl_ca_certs=ssl_ca_certs if use_ssl else None,
        socket_connect_timeout=3,
    )


_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_SCOPES = " ".join(
    [
        "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
        "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
        "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    ]
)


def _sleep_minutes(entry: GoogleHealthData) -> int:
    """Return sleep in minutes, matching what Google Health displays.

    Prefers minutes_asleep (actual sleep, wake phases excluded) over
    sleep_duration (raw time-in-bed).  Legacy records without minutes_asleep
    fall back to sleep_duration / 60 000.
    """
    try:
        if not entry.sleep:
            return 0
        if entry.sleep.minutes_asleep is not None:
            return max(0, int(entry.sleep.minutes_asleep))
        dur_ms = entry.sleep.sleep_duration or 0
        return int(round(dur_ms / 60000))
    except Exception:
        return 0


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def google_health_auth_init(request):
    """Generate a one-time nonce for the OAuth CSRF state parameter.

    The frontend calls this before redirecting to Google, stores the returned
    nonce as ``state=<nonce>:<patientId>`` in the auth URL, and the callback
    validates the nonce against Redis before accepting the authorization code.
    """
    patient_id = request.GET.get("patientId", "")
    if not patient_id:
        return JsonResponse({"error": "patientId required"}, status=400)

    nonce = secrets.token_urlsafe(32)
    try:
        rc = _get_redis_client()
        rc.set(f"oauth_nonce:{nonce}", patient_id, ex=_OAUTH_NONCE_TTL)
    except Exception:
        logger.exception("[google_health_auth_init] Redis unavailable; falling back to no-nonce")
        # If Redis is down, log and continue — a missing nonce is validated
        # in the callback, which will still reject unknown state values.
        pass

    return JsonResponse({"nonce": nonce})


@csrf_exempt
def google_health_callback(request):
    code = request.GET.get("code")
    state = request.GET.get("state", "")  # format: "<nonce>:<patientId>"

    if not code:
        return redirect(f"{settings.FRONTEND_URL}/patient?google_health_status=missing_code")

    if not state:
        return redirect(f"{settings.FRONTEND_URL}/patient?google_health_status=unauthorized")

    # Validate the CSRF nonce stored in Redis.
    # State format: "<nonce>:<patientId>" (patientId may contain colons if a
    # legacy plain ObjectId was passed — we split on the first colon only).
    if ":" in state:
        nonce, patient_id_from_state = state.split(":", 1)
        try:
            rc = _get_redis_client()
            stored = rc.get(f"oauth_nonce:{nonce}")
            if stored is None:
                logger.warning("[google_health_callback] nonce not found or expired: %s", nonce)
                return redirect(f"{settings.FRONTEND_URL}/patient?google_health_status=unauthorized")
            if stored.decode() != patient_id_from_state:
                logger.warning("[google_health_callback] nonce/patientId mismatch")
                return redirect(f"{settings.FRONTEND_URL}/patient?google_health_status=unauthorized")
            rc.delete(f"oauth_nonce:{nonce}")  # one-time use
            user_id_str = patient_id_from_state
        except Exception:
            logger.exception("[google_health_callback] Redis error during nonce validation")
            return redirect(f"{settings.FRONTEND_URL}/patient?google_health_status=error")
    else:
        # Legacy path: state is a plain patientId (no nonce) — reject for security.
        logger.warning("[google_health_callback] state missing nonce component, rejecting")
        return redirect(f"{settings.FRONTEND_URL}/patient?google_health_status=unauthorized")

    try:
        user_id = ObjectId(user_id_str)
        user = User.objects.get(id=user_id)
    except Exception as e:
        logger.exception("[google_health_callback] invalid user: %s", e)
        return redirect(f"{settings.FRONTEND_URL}/patient?google_health_status=invalid_user")

    data = {
        "client_id": settings.GOOGLE_HEALTH_CLIENT_ID,
        "client_secret": settings.GOOGLE_HEALTH_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_HEALTH_REDIRECT_URI,
        "grant_type": "authorization_code",
        "code": code,
    }

    try:
        resp = requests.post(_GOOGLE_TOKEN_URL, data=data, timeout=15)
        if resp.status_code != 200:
            logger.error("[google_health_callback] token exchange failed: %s %s", resp.status_code, resp.text)
            return redirect(f"{settings.FRONTEND_URL}/patient?google_health_status=error")

        td = resp.json()
        GoogleHealthUserToken.objects(user=user).update_one(
            set__access_token=td["access_token"],
            set__refresh_token=td["refresh_token"],
            set__expires_at=timezone.now() + timedelta(seconds=td["expires_in"]),
            set__google_user_id=td.get("sub", ""),
            set__connected_at=timezone.now(),
            set__is_revoked=False,
            set__revoked_at=None,
            upsert=True,
        )
        logger.info("[google_health_callback] token saved for user %s", user.id)

        # Kick off async backfill for this user
        from core.tasks import fetch_google_health_data_async

        fetch_google_health_data_async.delay(str(user.id))

        return redirect(f"{settings.FRONTEND_URL}/patient?google_health_status=connected")

    except Exception as e:
        logger.exception("[google_health_callback] exception: %s", e)
        return redirect(f"{settings.FRONTEND_URL}/patient?google_health_status=error")


@csrf_exempt
@permission_classes([IsAuthenticated])
def google_health_status(request, patient_id):
    user = _resolve_user_for_fitbit_status(patient_id)
    if not user:
        return JsonResponse(
            {
                "connected": False,
                "has_data": False,
                "last_data": None,
                "needs_reconnect": False,
                "days_until_expiry": None,
            }
        )

    token = GoogleHealthUserToken.objects(user=user).first()
    connected = bool(token) and not getattr(token, "is_revoked", False)
    latest = GoogleHealthData.objects(user=user).order_by("-date").first()

    needs_reconnect = False
    days_until_expiry = None
    if token and connected and getattr(token, "connected_at", None):
        connected_at = token.connected_at
        if timezone.is_naive(connected_at):
            connected_at = timezone.make_aware(connected_at)
        elapsed = (timezone.now() - connected_at).days
        days_until_expiry = max(0, 7 - elapsed)
        needs_reconnect = elapsed >= 6

    patient = None
    try:
        from core.models import Patient as _Patient

        patient = _Patient.objects(userId=user).first()
    except Exception:
        pass

    return JsonResponse(
        {
            "connected": connected,
            "has_data": latest is not None,
            "last_data": latest.date.isoformat() if latest else None,
            "needs_reconnect": needs_reconnect,
            "days_until_expiry": days_until_expiry,
            "wearable_device": getattr(patient, "wearable_device", "fitbit") or "fitbit",
        }
    )


@csrf_exempt
@permission_classes([IsAuthenticated])
def google_health_summary(request, patient_id=None):
    try:
        patient = _resolve_patient(request, patient_id)
        if not patient:
            return JsonResponse({"error": "Cannot resolve patient"}, status=400)

        user = User.objects(id=patient.userId.id).first()
        if not user:
            return JsonResponse({"error": "User not found"}, status=404)

        thresholds = _merge_thresholds(patient)
        fetch_google_health_today_for_user(user)

        token = GoogleHealthUserToken.objects(user=patient.userId).first()
        connected = bool(token)

        days = max(1, min(int(request.GET.get("days", 7)), 31))
        end = timezone.now()
        start = (end - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

        qs = GoogleHealthData.objects(user=patient.userId, date__gte=start, date__lte=end).order_by("date")

        vitals_qs = PatientVitals.objects(patientId=patient, date__gte=start, date__lte=end).order_by("-date")
        vitals_by_day = {}
        for v in vitals_qs:
            day_key = v.date.astimezone(timezone.get_current_timezone()).date().isoformat()
            if day_key not in vitals_by_day:
                vitals_by_day[day_key] = {"bp_sys": v.bp_sys, "bp_dia": v.bp_dia, "weight_kg": v.weight_kg}

        daily = []
        steps_tot, act_tot, sleep_tot = [], [], []
        bp_sys_vals, bp_dia_vals, weight_vals = [], [], []
        valid_days = 0
        last_sync = None

        today_start = end.replace(hour=0, minute=0, second=0, microsecond=0)
        minutes_since_midnight = int((end - today_start).total_seconds() // 60)

        covered_days = set()
        for d in qs:
            sm = _sleep_minutes(d)
            am = int(d.active_minutes or 0)
            st = int(d.steps or 0)

            sleep_end_raw = getattr(d.sleep, "sleep_end", None) if d.sleep else None
            day_start = d.date.replace(hour=0, minute=0, second=0, microsecond=0)
            if timezone.is_naive(day_start):
                day_start = timezone.make_aware(day_start, timezone.get_current_timezone())
            _, wake_minute = _parse_sleep_end(sleep_end_raw, day_start)

            day_key = d.date.astimezone(timezone.get_current_timezone()).date().isoformat()
            covered_days.add(day_key)
            vday = vitals_by_day.get(day_key) or {}

            bp_sys = getattr(d, "bp_sys", None) or vday.get("bp_sys")
            bp_dia = getattr(d, "bp_dia", None) or vday.get("bp_dia")
            weight_kg = getattr(d, "weight_kg", None) or vday.get("weight_kg")

            daily.append(
                {
                    "date": d.date.isoformat(),
                    "steps": st,
                    "active_minutes": am,
                    "sleep_minutes": sm,
                    "bp_sys": bp_sys,
                    "bp_dia": bp_dia,
                    "weight_kg": weight_kg,
                }
            )

            has_real = (
                (st not in (None, 0)) or (am not in (None, 0)) or (sm not in (None, 0)) or bp_sys or bp_dia or weight_kg
            )
            if has_real:
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

        # Merge in vitals-only days (no GoogleHealthData row) so they aren't invisible to period.daily/averages.
        for day_key, vday in vitals_by_day.items():
            if day_key in covered_days:
                continue
            bp_sys = vday.get("bp_sys")
            bp_dia = vday.get("bp_dia")
            weight_kg = vday.get("weight_kg")
            if bp_sys is None and bp_dia is None and weight_kg is None:
                continue

            daily.append(
                {
                    "date": f"{day_key}T00:00:00",
                    "steps": 0,
                    "active_minutes": 0,
                    "sleep_minutes": 0,
                    "bp_sys": bp_sys,
                    "bp_dia": bp_dia,
                    "weight_kg": weight_kg,
                }
            )

            valid_days += 1
            steps_tot.append(0)
            act_tot.append(0)
            sleep_tot.append(0)
            if bp_sys is not None:
                bp_sys_vals.append(int(bp_sys))
            if bp_dia is not None:
                bp_dia_vals.append(int(bp_dia))
            if weight_kg is not None:
                weight_vals.append(float(weight_kg))

            # Naive datetime to match last_sync (mongoengine-stored, naive).
            day_dt = datetime.fromisoformat(day_key)
            if last_sync is None or day_dt > last_sync:
                last_sync = day_dt

        daily.sort(key=lambda row: row["date"])

        valid_days = max(1, valid_days)

        today_end = today_start + timedelta(days=1)
        today_qs = GoogleHealthData.objects(user=patient.userId, date__gte=today_start, date__lt=today_end).order_by(
            "-date"
        )
        today_row = today_qs.first()

        # Keyed by the real current day (not today's record) so manual vitals surface even without a device sync.
        vday_today = vitals_by_day.get(timezone.localtime(end).date().isoformat()) or {}

        today_payload = None
        if today_row or vday_today:
            steps_today = int(today_row.steps or 0) if today_row else 0
            active_minutes_today = int(today_row.active_minutes or 0) if today_row else 0
            sleep_minutes_today = _sleep_minutes(today_row) if today_row else 0
            rhr_today = int(today_row.resting_heart_rate) if today_row and today_row.resting_heart_rate else None
            bp_sys_today = (getattr(today_row, "bp_sys", None) if today_row else None) or vday_today.get("bp_sys")
            bp_dia_today = (getattr(today_row, "bp_dia", None) if today_row else None) or vday_today.get("bp_dia")
            weight_today = (getattr(today_row, "weight_kg", None) if today_row else None) or vday_today.get("weight_kg")
            today_payload = {
                "steps": steps_today,
                "active_minutes": active_minutes_today,
                "sleep_minutes": sleep_minutes_today,
                "resting_heart_rate": rhr_today,
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
                        "bp_sys": sum(int(x) for x in bp_sys_vals) if bp_sys_vals else None,
                        "bp_dia": sum(int(x) for x in bp_dia_vals) if bp_dia_vals else None,
                        "weight_kg": sum(weight_vals) if weight_vals else None,
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
        logger.error("[google_health_summary] %s", e, exc_info=True)
        return JsonResponse({"error": "Internal Server Error"}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_google_health_data(request, patient_id):
    try:
        patient = Patient.objects.get(id=ObjectId(patient_id))

        def eu_date(d):
            return d.strftime("%d.%m.%Y")

        from_str = request.GET.get("from")
        to_str = request.GET.get("to")
        if from_str and to_str:
            from_date = datetime.strptime(from_str, "%Y-%m-%d").date()
            to_date = datetime.strptime(to_str, "%Y-%m-%d").date()
        else:
            to_date = timezone.now().date()
            from_date = to_date - timedelta(days=30)

        entries = GoogleHealthData.objects(user=patient.userId, date__gte=from_date, date__lte=to_date).order_by("date")
        vitals_qs = PatientVitals.objects(patientId=patient, date__gte=from_date, date__lte=to_date).order_by("date")
        vitals_by_date = {
            eu_date(v.date): {"weight_kg": v.weight_kg, "bp_sys": v.bp_sys, "bp_dia": v.bp_dia} for v in vitals_qs
        }

        out = []
        for entry in entries:
            key = eu_date(entry.date)
            vitals = vitals_by_date.get(key, {})

            ex_raw = entry.exercise or []
            sessions = ex_raw if isinstance(ex_raw, list) else ex_raw.get("sessions", [])
            exercise_out = {
                "sessions": [
                    {
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

            sleep = None
            if entry.sleep:
                ma = entry.sleep.minutes_asleep
                dur_min = ma if ma is not None else (entry.sleep.sleep_duration or 0) / 60000
                sleep = {
                    "sleep_minutes": dur_min,
                    "sleep_hours": round(dur_min / 60, 2),
                    "minutes_asleep": entry.sleep.minutes_asleep,
                    "sleep_start": entry.sleep.sleep_start,
                    "sleep_end": entry.sleep.sleep_end,
                    "awakenings": entry.sleep.awakenings,
                }

            zones = [
                {
                    "name": z.name,
                    "minutes": z.minutes,
                    "min": z.min,
                    "max": z.max,
                    "range_str": f"{z.min}-{z.max} bpm" if z.min and z.max else None,
                    "caloriesOut": getattr(z, "caloriesOut", None),
                }
                for z in (entry.heart_rate_zones or [])
            ]

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
                    "weight_kg": vitals.get("weight_kg"),
                    "bp_sys": vitals.get("bp_sys"),
                    "bp_dia": vitals.get("bp_dia"),
                }
            )

        return JsonResponse({"data": out}, status=200)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Exception:
        logger.exception("[get_google_health_data] error")
        return JsonResponse({"error": "Internal server error"}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def google_manual_steps(request, patient_id):
    """Write steps directly to GoogleHealthData (no API write — Google Fit REST is read-only)."""
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

    # Parse into a date object and reconstruct the string — this breaks CodeQL's
    # taint chain from json.loads so the query never receives raw user input.
    try:
        from datetime import date as _date_cls

        safe_date = _date_cls.fromisoformat(str(date)).isoformat()
    except (TypeError, ValueError):
        return JsonResponse({"error": "Invalid date format"}, status=400)

    patient = _resolve_patient(request, patient_id)
    if not patient:
        return JsonResponse({"error": "Patient not found"}, status=404)

    GoogleHealthData.objects(user=patient.userId, date=safe_date).update_one(set__steps=steps, upsert=True)
    return JsonResponse({"success": True, "steps": steps, "date": safe_date}, status=200)


@csrf_exempt
@permission_classes([IsAuthenticated])
def google_health_combined_history(request, patient_id):
    """
    Combined wearables + questionnaire + adherence history.
    Uses GoogleHealthData; response shape is identical to health_combined_history
    so the frontend requires no changes.
    """
    import datetime as dt_mod

    try:
        try:
            patient = Patient.objects.get(id=ObjectId(patient_id))
        except Patient.DoesNotExist:
            return JsonResponse({"error": "Patient not found"}, status=404)

        from_str = request.GET.get("from")
        to_str = request.GET.get("to")
        if from_str and to_str:
            from_date = dt_mod.datetime.strptime(from_str, "%Y-%m-%d").date()
            to_date = dt_mod.datetime.strptime(to_str, "%Y-%m-%d").date()
        else:
            to_date = timezone.now().date()
            from_date = to_date - timedelta(days=30)

        gh_qs = GoogleHealthData.objects(user=patient.userId, date__gte=from_date, date__lte=to_date).order_by("date")
        wearable_map = {f.date.strftime("%Y-%m-%d"): f for f in gh_qs}

        # Inject PatientVitals into wearable rows (or create minimal rows)
        vitals_qs = PatientVitals.objects(patientId=patient, date__gte=from_date, date__lte=to_date).order_by("date")
        for v in vitals_qs:
            dkey = v.date.strftime("%Y-%m-%d")
            f = wearable_map.get(dkey)
            if f:
                f.weight_kg = v.weight_kg
                f.bp_sys = v.bp_sys
                f.bp_dia = v.bp_dia
                f.save()
            else:
                fd = GoogleHealthData(
                    user=patient.userId,
                    date=dt_mod.datetime.combine(v.date, dt_mod.datetime.min.time()),
                    weight_kg=v.weight_kg,
                    bp_sys=v.bp_sys,
                    bp_dia=v.bp_dia,
                )
                fd.save()
                wearable_map[dkey] = fd

        wearable_list = []
        for key in sorted(wearable_map.keys()):
            f = wearable_map[key]
            wearable_list.append(
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
                        {"name": z.name, "min": z.min, "max": z.max, "minutes": z.minutes}
                        for z in (f.heart_rate_zones or [])
                    ],
                    "breathing_rate": f.breathing_rate,
                    "hrv": f.hrv,
                    "exercise": f.exercise or {},
                    "weight_kg": f.weight_kg,
                    "bp_sys": f.bp_sys,
                    "bp_dia": f.bp_dia,
                }
            )

        # Questionnaire history
        from core.models import PatientICFRating

        q_qs = PatientICFRating.objects(patientId=patient, date__gte=from_date, date__lte=to_date).order_by("date")
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
                for ans in getattr(entry, "answerKey", None) or []:
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
                        parsed_answers.append({"key": str(ans), "translations": [{"language": "en", "text": str(ans)}]})
                question_obj = getattr(entry, "questionId", None)
                question_key = getattr(question_obj, "questionKey", None) or getattr(q, "icfCode", None) or ""
                question_translations = [
                    {"language": tr.language, "text": tr.text}
                    for tr in (getattr(question_obj, "translations", None) or [])
                ]
                audio_url = getattr(entry, "audio_url", None)
                questionnaire_list.append(
                    {
                        "date": q.date.date().isoformat(),
                        "questionKey": question_key,
                        "answers": parsed_answers,
                        "questionTranslations": question_translations,
                        "comment": getattr(entry, "comment", "") or "",
                        "audio_url": audio_url,
                        "media_urls": [audio_url] if audio_url else [],
                    }
                )

        # Adherence
        logs = PatientInterventionLogs.objects(patientId=patient, date__gte=from_date, date__lte=to_date).order_by(
            "date"
        )
        adherence_list = [
            {
                "date": l.date.date().isoformat(),
                "scheduled": l.scheduled_count,
                "completed": l.completed_count,
                "pct": l.adherence_percentage,
            }
            for l in logs
        ]

        return JsonResponse(
            {"fitbit": wearable_list, "questionnaire": questionnaire_list, "adherence": adherence_list}, status=200
        )

    except Exception:
        logger.exception("[google_health_combined_history] error")
        return JsonResponse({"error": "Internal Server Error"}, status=500)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def google_health_disconnect(request):
    try:
        user = User.objects(id=request.user.id).first()
    except Exception:
        user = None
    if not user:
        return JsonResponse({"ok": False, "error": "User not found"}, status=404)

    deleted_tokens = GoogleHealthUserToken.objects(user=user).delete()
    logger.info("[google_health_disconnect] deleted %s token(s) for user %s", deleted_tokens, user.id)

    # Delete all stored health data for this user on disconnect (GDPR / data minimisation).
    # Data is re-fetched from Google Health whenever the user reconnects.
    deleted_data = GoogleHealthData.objects(user=user).delete()
    logger.info("[google_health_disconnect] deleted %s health records for user %s", deleted_data, user.id)

    return JsonResponse({"ok": True})
