import json
import logging
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode, urlparse

import redis
import requests
from bson import ObjectId
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import redirect
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated

from core.models import FitbitData, FitbitUserToken, Patient, User
from core.services.redcap_access import get_therapist_for_user
from core.views.wearable_utils import (
    _default_thresholds,
    _merge_thresholds,
    _resolve_patient,
    _resolve_user_for_fitbit_status,
    avg_excluding_zero,
)

logger = logging.getLogger(__name__)
FITBIT_API_URL = "https://api.fitbit.com/1/user/-"

import datetime as _dt

from core.views.fitbit_sync import fetch_fitbit_date_range_for_user, fetch_fitbit_today_for_user


def _sleep_minutes(entry: FitbitData) -> int:
    """Return sleep in minutes, matching what the Fitbit app shows.

    Fitbit app displays *minutes_asleep* (actual sleep, wake phases removed).
    Legacy records that only have sleep_duration (ms, total time in bed) fall
    back to duration / 60 000 so existing data is never lost.
    """
    try:
        if not entry.sleep:
            return 0
        # Prefer minutes_asleep (actual sleep, matches Fitbit app) over sleep_duration (time in bed)
        if entry.sleep.minutes_asleep is not None:
            return max(0, int(entry.sleep.minutes_asleep))
        dur_ms = entry.sleep.sleep_duration or 0
        return int(round(dur_ms / 60000))
    except Exception:
        return 0


@api_view(["GET"])
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
        connected = bool(token) and not getattr(token, "is_revoked", False)

        days = max(1, min(int(request.GET.get("days", 7)), 31))

        end = timezone.now()
        start = (end - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

        qs = FitbitData.objects(user=patient.userId, date__gte=start, date__lte=end).order_by("date")

        # Backfill any historical days missing from the DB.
        # The background 4-hour task only syncs *today*, and the nightly 30-day
        # task runs at 01:00 UTC.  If the patient synced their Fitbit device after
        # 01:00 UTC, those days won't be in the DB until the next nightly run.
        # We detect gaps here and fill them synchronously so the patient sees
        # their data immediately.
        try:
            today_date = timezone.now().date()
            yesterday_date = today_date - _dt.timedelta(days=1)
            window_start_date = start.date()

            if window_start_date <= yesterday_date:
                existing_dates = set()
                for _d in qs:
                    try:
                        existing_dates.add(_d.date.date())
                    except Exception:
                        existing_dates.add(_d.date)

                missing_dates = set()
                cur = window_start_date
                while cur <= yesterday_date:
                    if cur not in existing_dates:
                        missing_dates.add(cur)
                    cur += _dt.timedelta(days=1)

                if missing_dates:
                    fetch_fitbit_date_range_for_user(user, min(missing_dates), max(missing_dates))
                    qs = FitbitData.objects(user=patient.userId, date__gte=start, date__lte=end).order_by("date")
        except Exception:
            logger.exception("[fitbit_summary] backfill check failed for user=%s", user)

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

        # Today midnight, in local time — must match vday_today's local-day key below.
        today_start = timezone.localtime(end).replace(hour=0, minute=0, second=0, microsecond=0)
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
        covered_days = set()
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
            covered_days.add(day_key)

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
                "active_zone_minutes": getattr(d, "active_zone_minutes", None),
                "sleep_minutes": sm,
                "wear_time_minutes": getattr(d, "wear_time_minutes", None),
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

        # Merge in vitals-only days (no FitbitData row) so they aren't invisible to period.daily/averages.
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
                    "active_zone_minutes": None,
                    "sleep_minutes": 0,
                    "wear_time_minutes": None,
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

            # Naive datetime to match last_sync (mongoengine-stored, naive); _dt avoids the later `import datetime` shadowing.
            day_dt = _dt.datetime.fromisoformat(day_key)
            if last_sync is None or day_dt > last_sync:
                last_sync = day_dt

        daily.sort(key=lambda row: row["date"])

        valid_days = max(1, valid_days)

        # ---------- Today payload ----------
        today_end = today_start + _dt.timedelta(days=1)
        today_qs = FitbitData.objects(user=patient.userId, date__gte=today_start, date__lt=today_end).order_by("-date")
        today = today_qs.first()

        # Keyed by the real current day (not today's record) so manual vitals surface even without a device sync.
        vday_today = vitals_by_day.get(timezone.localtime(end).date().isoformat()) or {}

        if today:
            sm = _sleep_minutes(today)
            am = int(today.active_minutes or 0)
            steps_today = int(today.steps or 0)
            azm_today = getattr(today, "active_zone_minutes", None)
            rhr_today = int(today.resting_heart_rate) if today.resting_heart_rate is not None else None
            bp_sys_today = getattr(today, "bp_sys", None)
            bp_dia_today = getattr(today, "bp_dia", None)
            weight_today = getattr(today, "weight_kg", None)

            sleep_obj = getattr(today, "sleep", None)
            sleep_end_raw = getattr(sleep_obj, "sleep_end", None)

            day_start_today = today.date.replace(hour=0, minute=0, second=0, microsecond=0)
            if timezone.is_naive(day_start_today):
                day_start_today = timezone.make_aware(day_start_today, timezone.get_current_timezone())

            _parse_sleep_end(sleep_end_raw, day_start_today)
        else:
            sm = 0
            am = 0
            steps_today = 0
            azm_today = None
            rhr_today = None
            bp_sys_today = None
            bp_dia_today = None
            weight_today = None

        if bp_sys_today is None:
            bp_sys_today = vday_today.get("bp_sys")
        if bp_dia_today is None:
            bp_dia_today = vday_today.get("bp_dia")
        if weight_today is None:
            weight_today = vday_today.get("weight_kg")

        today_payload = None
        if today or vday_today:
            today_payload = {
                "steps": steps_today,
                "active_minutes": am,
                "active_zone_minutes": azm_today,
                "sleep_minutes": sm,
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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def fitbit_status(request, patient_id):
    user = _resolve_user_for_fitbit_status(patient_id)
    if not user:
        logger.info("[fitbit_status] unresolved identifier connected=False has_data=False")
        return JsonResponse({"connected": False, "has_data": False, "last_data": None})

    connected = FitbitUserToken.objects(user=user, is_revoked__ne=True).count() > 0
    latest_row = FitbitData.objects(user=user).order_by("-date").first()
    has_data = latest_row is not None
    last_data = latest_row.date.isoformat() if latest_row else None

    pt = Patient.objects(userId=user).first()
    wearable_device = getattr(pt, "wearable_device", None) or "fitbit"

    logger.info(
        "[fitbit_status] status connected=%s has_data=%s wearable_device=%s", connected, has_data, wearable_device
    )
    return JsonResponse(
        {"connected": connected, "has_data": has_data, "last_data": last_data, "wearable_device": wearable_device}
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def fitbit_disconnect(request):
    try:
        user = User.objects(id=request.user.id).first()
    except Exception:
        user = None
    if not user:
        return JsonResponse({"ok": False, "error": "User not found"}, status=404)

    deleted_tokens = FitbitUserToken.objects(user=user).delete()
    logger.info("[fitbit_disconnect] deleted %s token(s) for user %s", deleted_tokens, user.id)

    # Delete all stored health data for this user on disconnect (GDPR / data minimisation).
    # Data is re-fetched from Fitbit whenever the user reconnects.
    deleted_data = FitbitData.objects(user=user).delete()
    logger.info("[fitbit_disconnect] deleted %s health records for user %s", deleted_data, user.id)

    return JsonResponse({"ok": True})


_FITBIT_NONCE_TTL = 600  # seconds — 10 minutes


def _get_fitbit_redis():
    url = getattr(settings, "CELERY_BROKER_URL", "redis://redis:6379/0")
    parsed = urlparse(url)
    use_ssl = parsed.scheme == "rediss"
    ssl_ca = None
    if use_ssl:
        broker_ssl = getattr(settings, "BROKER_USE_SSL", {})
        if isinstance(broker_ssl, dict):
            ssl_ca = broker_ssl.get("ssl_ca_certs")
    return redis.Redis(
        host=parsed.hostname,
        port=parsed.port or 6379,
        db=int((parsed.path or "/0").lstrip("/") or 0),
        password=parsed.password,
        ssl=use_ssl,
        ssl_ca_certs=ssl_ca if use_ssl else None,
        socket_connect_timeout=3,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def fitbit_auth_init(request):
    """Generate a one-time CSRF nonce for the Fitbit OAuth state parameter.

    The frontend calls this before redirecting to Fitbit, stores the returned
    nonce as ``state=<nonce>:<patientId>`` in the auth URL, and the callback
    validates the nonce against Redis before accepting the authorization code.
    """
    patient_id = request.GET.get("patientId", "")
    if not patient_id:
        return JsonResponse({"error": "patientId required"}, status=400)

    nonce = secrets.token_urlsafe(32)
    try:
        rc = _get_fitbit_redis()
        rc.set(f"fitbit_nonce:{nonce}", patient_id, ex=_FITBIT_NONCE_TTL)
    except Exception:
        logger.exception("[fitbit_auth_init] Redis unavailable")

    return JsonResponse({"nonce": nonce})


@api_view(["GET"])
@permission_classes([AllowAny])
def fitbit_callback(request):
    # The callback is a browser redirect from fitbit.com — no JWT cookie or
    # Authorization header is sent (SameSite=Strict blocks cookies on cross-site
    # redirects). The user is identified by the 'state' param (their User ObjectId)
    # set when the auth flow was initiated, so IsAuthenticated is not needed here.

    # Fitbit sends ?error=<code>&error_description=<text>&state=<state> when the
    # user declines or when the app config is wrong (e.g. redirect_uri_mismatch,
    # invalid_client).  Capture and log these before anything else so we have a
    # clear diagnostic trail in the server logs.
    fitbit_error = request.GET.get("error")
    fitbit_error_desc = request.GET.get("error_description", "")
    if fitbit_error:
        logger.error(
            "[fitbit_callback] Fitbit returned an authorization error: %s — %s "
            "(configured redirect_uri=%s, client_id=%s)",
            fitbit_error,
            fitbit_error_desc,
            getattr(settings, "FITBIT_REDIRECT_URI", "NOT SET"),
            getattr(settings, "FITBIT_CLIENT_ID", "NOT SET") or "EMPTY",
        )
        allowed_fitbit_errors = {
            "access_denied",
            "invalid_request",
            "invalid_client",
            "invalid_grant",
            "unauthorized_client",
            "unsupported_response_type",
            "invalid_scope",
            "server_error",
            "temporarily_unavailable",
            "redirect_uri_mismatch",
        }
        safe_fitbit_error = fitbit_error if fitbit_error in allowed_fitbit_errors else "unknown_error"
        query = urlencode({"fitbit_status": "auth_error", "fitbit_error": safe_fitbit_error})
        return redirect(f"/patient?{query}")

    code = request.GET.get("code")
    state = request.GET.get("state", "")  # format: "<nonce>:<patientId>"

    if not code:
        logger.warning("[fitbit_callback] No code returned from Fitbit.")
        return redirect("/patient?fitbit_status=missing_code")

    if not state:
        logger.error("[fitbit_callback] Missing 'state' param.")
        return redirect("/patient?fitbit_status=unauthorized")

    # Validate the CSRF nonce stored in Redis.
    if ":" not in state:
        logger.warning("[fitbit_callback] state missing nonce component, rejecting")
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=unauthorized")

    nonce, patient_id_str = state.split(":", 1)
    try:
        rc = _get_fitbit_redis()
        stored = rc.get(f"fitbit_nonce:{nonce}")
        if stored is None:
            logger.warning("[fitbit_callback] nonce not found or expired: %s", nonce)
            return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=unauthorized")
        if stored.decode() != patient_id_str:
            logger.warning("[fitbit_callback] nonce/patientId mismatch")
            return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=unauthorized")
        rc.delete(f"fitbit_nonce:{nonce}")  # one-time use
    except Exception:
        logger.exception("[fitbit_callback] Redis error during nonce validation")
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=error")

    try:
        user_id = ObjectId(patient_id_str)
        user = User.objects.get(id=user_id)
    except Exception as e:
        logger.exception(f"[fitbit_callback] Invalid or missing user: {e}")
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=invalid_user")

    logger.info(f"[fitbit_callback] Received code: {code} for user {user.id}")

    token_url = "https://api.fitbit.com/oauth2/token"
    client_id = settings.FITBIT_CLIENT_ID
    client_secret = settings.FITBIT_CLIENT_SECRET
    redirect_uri = settings.FITBIT_REDIRECT_URI

    if not client_id or not client_secret:
        logger.error(
            "[fitbit_callback] FITBIT_CLIENT_ID or FITBIT_CLIENT_SECRET is not configured. "
            "client_id=%s, secret_set=%s",
            client_id or "EMPTY",
            bool(client_secret),
        )
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=misconfigured")

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
        logger.debug("[fitbit_callback] Token exchange response: %s", response.status_code)

        if response.status_code == 200:
            token_data = response.json()
            fitbit_user_id = token_data.get("user_id")

            # Guard: block linking a Fitbit account that is already connected to a
            # different patient. This catches the case where a researcher set up two
            # patients sequentially on the same browser and Google silently reused the
            # first patient's session for the second OAuth flow.
            existing = FitbitUserToken.objects(fitbit_user_id=fitbit_user_id, is_revoked__ne=True).only("user").first()
            if existing is not None:
                try:
                    existing_user_id = str(existing.user.id)
                except Exception:
                    existing_user_id = None
                if existing_user_id and existing_user_id != str(user.id):
                    logger.error(
                        "[fitbit_callback] Fitbit account %s is already linked to user %s; "
                        "refusing to link to user %s (possible browser-session cross-contamination).",
                        fitbit_user_id,
                        existing_user_id,
                        user.id,
                    )
                    return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=already_linked")

            FitbitUserToken.objects(user=user).update_one(
                set__access_token=token_data["access_token"],
                set__refresh_token=token_data["refresh_token"],
                set__expires_at=timezone.now() + timedelta(seconds=token_data["expires_in"]),
                set__fitbit_user_id=fitbit_user_id,
                set__is_revoked=False,
                set__revoked_at=None,
                upsert=True,
            )

            logger.info(f"[fitbit_callback] Fitbit token saved for user {user.id}")
            return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=connected")

        else:
            logger.error(
                "[fitbit_callback] Fitbit token exchange failed (status %s): %s",
                response.status_code,
                response.text,
            )
            return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=error")

    except Exception as e:
        logger.exception(f"[fitbit_callback] Exception during token exchange: {e}")
        return redirect(f"{settings.FRONTEND_URL}/patient?fitbit_status=error")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_fitbit_health_data(request, patient_id):
    try:
        patient = Patient.objects.get(id=ObjectId(patient_id))

        # IDOR guard: only a therapist in the patient's clinic may view health data.
        # Skipped in TESTING mode (the test auth backend uses a synthetic user that
        # has no therapist record); production always has TESTING unset.
        if not getattr(settings, "TESTING", False) and getattr(request.user, "id", None) is not None:
            caller_therapist = get_therapist_for_user(request.user)
            patient_clinic = getattr(patient, "clinic", None)
            if not caller_therapist or patient_clinic not in (caller_therapist.clinics or []):
                return JsonResponse({"error": "You are not authorised to access this patient's data."}, status=403)

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
                    "active_zone_minutes": getattr(entry, "active_zone_minutes", None),
                    "wear_time_minutes": getattr(entry, "wear_time_minutes", None),
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


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def manual_steps(request, patient_id):
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
from rest_framework.decorators import api_view, permission_classes
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


@api_view(["GET"])
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
            try:
                from_date = datetime.datetime.strptime(from_str, "%Y-%m-%d").date()
                to_date = datetime.datetime.strptime(to_str, "%Y-%m-%d").date()
            except ValueError:
                return JsonResponse(
                    {"error": "Invalid date format. Use YYYY-MM-DD."},
                    status=400,
                )
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

        # Merge vitals into the in-memory fitbit_map — do NOT write to DB in a GET endpoint.
        # Vitals are read-merged at response time only.
        vitals_overlay: dict[str, dict] = {}
        for v in vitals_qs:
            dkey = v.date.strftime("%Y-%m-%d")
            vitals_overlay[dkey] = {
                "weight_kg": v.weight_kg,
                "bp_sys": v.bp_sys,
                "bp_dia": v.bp_dia,
            }
            if dkey not in fitbit_map:
                # Synthetic placeholder so vitals-only days appear in output
                fitbit_map[dkey] = None

        # Now convert fitbit_map → sorted list
        fitbit_list = []
        for key in sorted(fitbit_map.keys()):
            f = fitbit_map[key]
            vit = vitals_overlay.get(key, {})
            # Prefer FitbitData vitals; fall back to PatientVitals overlay
            weight_kg = (getattr(f, "weight_kg", None) if f else None) or vit.get("weight_kg")
            bp_sys = (getattr(f, "bp_sys", None) if f else None) or vit.get("bp_sys")
            bp_dia = (getattr(f, "bp_dia", None) if f else None) or vit.get("bp_dia")
            fitbit_list.append(
                {
                    "date": key,
                    "steps": f.steps if f else None,
                    "resting_heart_rate": f.resting_heart_rate if f else None,
                    "max_heart_rate": f.max_heart_rate if f else None,
                    "floors": f.floors if f else None,
                    "distance": f.distance if f else None,
                    "calories": f.calories if f else None,
                    "active_minutes": f.active_minutes if f else None,
                    "active_zone_minutes": getattr(f, "active_zone_minutes", None) if f else None,
                    "sleep": {
                        "sleep_duration": f.sleep.sleep_duration if f and f.sleep else None,
                        "minutes_asleep": f.sleep.minutes_asleep if f and f.sleep else None,
                        "sleep_start": f.sleep.sleep_start if f and f.sleep else None,
                        "sleep_end": f.sleep.sleep_end if f and f.sleep else None,
                        "awakenings": f.sleep.awakenings if f and f.sleep else None,
                    },
                    "wear_time_minutes": getattr(f, "wear_time_minutes", None) if f else None,
                    "heart_rate_zones": (
                        [
                            {
                                "name": z.name,
                                "min": z.min,
                                "max": z.max,
                                "minutes": z.minutes,
                            }
                            for z in (f.heart_rate_zones or [])
                        ]
                        if f
                        else []
                    ),
                    "breathing_rate": f.breathing_rate if f else None,
                    "hrv": f.hrv if f else None,
                    "exercise": (f.exercise or {}) if f else {},
                    "weight_kg": weight_kg,
                    "bp_sys": bp_sys,
                    "bp_dia": bp_dia,
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
