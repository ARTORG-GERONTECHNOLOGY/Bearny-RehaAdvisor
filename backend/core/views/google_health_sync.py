# core/views/google_health_sync.py
import datetime
import logging
from datetime import timedelta
from datetime import timezone as dt_tz

import requests
from django.conf import settings
from django.utils import timezone
from django.utils.timezone import is_naive, make_aware

from core.models import GoogleHealthData, GoogleHealthUserToken, SleepData

logger = logging.getLogger(__name__)

GOOGLE_FIT_BASE = "https://www.googleapis.com/fitness/v1/users/me"
AGGREGATE_URL = f"{GOOGLE_FIT_BASE}/dataset:aggregate"
SESSIONS_URL = f"{GOOGLE_FIT_BASE}/sessions"
TOKEN_URL = "https://oauth2.googleapis.com/token"

# 15-minute bucket size in ms — used for wear time and HR zone approximation
_HR_BUCKET_MS = 15 * 60 * 1000
_DAY_MS = 24 * 60 * 60 * 1000

# Google Fit activity type for sleep
_SLEEP_ACTIVITY_TYPE = 72


def _day_ms(d: datetime.date) -> tuple[int, int]:
    """Return (start_ms, end_ms) for a UTC calendar day."""
    start = datetime.datetime(d.year, d.month, d.day, tzinfo=dt_tz.utc)
    end = start + timedelta(days=1)
    return int(start.timestamp() * 1000), int(end.timestamp() * 1000)


def _ms_to_iso(ms: int) -> str:
    return datetime.datetime.fromtimestamp(ms / 1000, tz=dt_tz.utc).isoformat()


def _fp(point: dict, idx: int = 0) -> float | None:
    """Extract fpVal from a Google Fit data point value list."""
    try:
        return point["value"][idx].get("fpVal")
    except (IndexError, KeyError, TypeError):
        return None


def _int(point: dict, idx: int = 0) -> int | None:
    """Extract intVal from a Google Fit data point value list."""
    try:
        v = point["value"][idx].get("intVal")
        return int(v) if v is not None else None
    except (IndexError, KeyError, TypeError):
        return None


def get_valid_google_access_token(user) -> str:
    token = GoogleHealthUserToken.objects.get(user=user)

    if is_naive(token.expires_at):
        token.expires_at = make_aware(token.expires_at)

    if token.expires_at <= timezone.now():
        data = {
            "client_id": settings.GOOGLE_HEALTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_HEALTH_CLIENT_SECRET,
            "refresh_token": token.refresh_token,
            "grant_type": "refresh_token",
        }
        try:
            resp = requests.post(TOKEN_URL, data=data, timeout=15)
            if resp.status_code == 200:
                td = resp.json()
                token.access_token = td["access_token"]
                token.expires_at = timezone.now() + timedelta(seconds=td["expires_in"])
                token.save()
                logger.info("[google_health] Token refreshed for user %s", user.id)
            else:
                logger.error("[google_health] Token refresh failed %s: %s", resp.status_code, resp.text)
                raise Exception("Failed to refresh Google access token")
        except Exception:
            logger.exception("[google_health] Exception refreshing token for user %s", user.id)
            raise

    return token.access_token


def _aggregate_day(headers: dict, start_ms: int, end_ms: int) -> dict:
    """
    Single aggregate API call covering the full day.
    Returns the parsed bucket dict, or {} on error.
    """
    payload = {
        "startTimeMillis": start_ms,
        "endTimeMillis": end_ms,
        "aggregateBy": [
            {"dataTypeName": "com.google.step_count.delta"},
            {"dataTypeName": "com.google.calories.expended"},
            {"dataTypeName": "com.google.distance.delta"},
            {"dataTypeName": "com.google.floors_climbed"},
            {"dataTypeName": "com.google.heart_rate.summary"},
            {"dataTypeName": "com.google.weight"},
            {"dataTypeName": "com.google.blood_pressure"},
            {"dataTypeName": "com.google.move_minutes.delta"},
        ],
        "bucketByTime": {"durationMillis": end_ms - start_ms},
    }
    resp = requests.post(AGGREGATE_URL, headers=headers, json=payload, timeout=20)
    if resp.status_code != 200:
        logger.warning("[google_health] aggregate failed %s: %s", resp.status_code, resp.text[:200])
        return {}
    buckets = resp.json().get("bucket", [])
    return buckets[0] if buckets else {}


def _extract_point(bucket: dict, data_type: str) -> dict | None:
    """Pull the first data point for a data type from a bucket."""
    for ds in bucket.get("dataset", []):
        if data_type in ds.get("dataSourceId", ""):
            pts = ds.get("point", [])
            if pts:
                return pts[0]
    return None


def _wear_time_and_zones(
    headers: dict, start_ms: int, end_ms: int, max_hr: int | None
) -> tuple[int | None, list[dict]]:
    """
    Query HR in 15-minute buckets. Returns:
      - wear_time_minutes: number of buckets with ≥1 HR sample × 15
      - heart_rate_zones: [{name, minutes, min, max, caloriesOut}] computed
        from each bucket's average HR classified against max_hr thresholds.

    This is the strategy for computing wear time without intraday 1-second data:
    any 15-minute window in which the device recorded at least one heart rate
    sample is counted as 15 minutes of wear. Resolution is 15 minutes (vs
    Fitbit's 1-minute resolution), which is acceptable for daily summaries.
    HR zones are approximated by classifying each worn bucket's average HR.
    """
    payload = {
        "startTimeMillis": start_ms,
        "endTimeMillis": end_ms,
        "aggregateBy": [{"dataTypeName": "com.google.heart_rate.summary"}],
        "bucketByTime": {"durationMillis": _HR_BUCKET_MS},
    }
    resp = requests.post(AGGREGATE_URL, headers=headers, json=payload, timeout=20)
    if resp.status_code != 200:
        logger.warning("[google_health] HR buckets failed %s", resp.status_code)
        return None, []

    zone_minutes: dict[str, int] = {"Out of Range": 0, "Fat Burn": 0, "Cardio": 0, "Peak": 0}
    worn = 0

    for bucket in resp.json().get("bucket", []):
        for ds in bucket.get("dataset", []):
            pts = ds.get("point", [])
            if not pts:
                continue
            worn += 1
            if max_hr and max_hr > 0:
                avg_hr = _fp(pts[0], 0) or 0
                pct = avg_hr / max_hr
                if pct >= 0.85:
                    zone_minutes["Peak"] += 15
                elif pct >= 0.70:
                    zone_minutes["Cardio"] += 15
                elif pct >= 0.50:
                    zone_minutes["Fat Burn"] += 15
                else:
                    zone_minutes["Out of Range"] += 15

    # Canonical Fitbit-style zone boundaries (% of max HR)
    boundaries = {
        "Out of Range": (0, int(max_hr * 0.50) if max_hr else None),
        "Fat Burn": (int(max_hr * 0.50) if max_hr else None, int(max_hr * 0.70) if max_hr else None),
        "Cardio": (int(max_hr * 0.70) if max_hr else None, int(max_hr * 0.85) if max_hr else None),
        "Peak": (int(max_hr * 0.85) if max_hr else None, max_hr),
    }
    zones = [
        {
            "name": name,
            "minutes": zone_minutes[name],
            "min": boundaries[name][0],
            "max": boundaries[name][1],
            "caloriesOut": None,
        }
        for name in ("Out of Range", "Fat Burn", "Cardio", "Peak")
        if zone_minutes[name] > 0
    ]

    return (worn * 15) if worn else None, zones


def _fetch_sleep(headers: dict, start_ms: int, end_ms: int) -> dict | None:
    """Fetch sleep session for the day. Returns a SleepData-compatible dict or None."""
    params = {
        "startTime": _ms_to_iso(start_ms),
        "endTime": _ms_to_iso(end_ms),
        "activityType": _SLEEP_ACTIVITY_TYPE,
    }
    resp = requests.get(SESSIONS_URL, headers=headers, params=params, timeout=20)
    if resp.status_code != 200:
        return None

    sessions = resp.json().get("session", [])
    if not sessions:
        return None

    # Use the longest sleep session for the day
    session = max(sessions, key=lambda s: int(s.get("endTimeMillis", 0)) - int(s.get("startTimeMillis", 0)))
    start = int(session["startTimeMillis"])
    end = int(session["endTimeMillis"])
    duration_ms = end - start
    minutes_asleep = duration_ms // 60000

    return {
        "sleep_duration": duration_ms,
        "minutes_asleep": minutes_asleep,
        "sleep_start": _ms_to_iso(start),
        "sleep_end": _ms_to_iso(end),
        "awakenings": 0,  # not available from sessions endpoint without segment detail
    }


def _fetch_exercise(headers: dict, start_ms: int, end_ms: int) -> list[dict]:
    """Fetch non-sleep exercise sessions for the day."""
    params = {
        "startTime": _ms_to_iso(start_ms),
        "endTime": _ms_to_iso(end_ms),
    }
    resp = requests.get(SESSIONS_URL, headers=headers, params=params, timeout=20)
    if resp.status_code != 200:
        return []

    sessions = []
    for s in resp.json().get("session", []):
        if s.get("activityType") == _SLEEP_ACTIVITY_TYPE:
            continue
        start = int(s.get("startTimeMillis", 0))
        end = int(s.get("endTimeMillis", 0))
        sessions.append(
            {
                "logId": None,
                "name": s.get("name") or s.get("activityType"),
                "startTime": _ms_to_iso(start),
                "duration": end - start,
                "calories": None,
                "averageHeartRate": None,
                "maxHeartRate": None,
                "steps": None,
                "distance": None,
                "elevationGain": None,
                "speed": None,
                "activeZoneMinutes": None,
                "heartRateZones": [],
                "activityLevel": None,
            }
        )
    return sessions


def _sync_day(user, headers: dict, d: datetime.date) -> bool:
    """
    Fetch and upsert one day of Google Health data for *user*.
    Returns True if a row was written.
    """
    start_ms, end_ms = _day_ms(d)

    # ---- Core daily aggregate ----
    bucket = _aggregate_day(headers, start_ms, end_ms)

    def pt(dtype):
        return _extract_point(bucket, dtype)

    # Steps
    p = pt("step_count.delta")
    steps = _int(p) if p else None

    # Calories
    p = pt("calories.expended")
    calories = _fp(p) if p else None

    # Distance (meters → km)
    p = pt("distance.delta")
    distance = round(_fp(p) / 1000, 3) if p and _fp(p) else None

    # Floors
    p = pt("floors_climbed")
    floors = int(_fp(p)) if p and _fp(p) else None

    # Heart rate: avg=value[0], max=value[1], min=value[2]
    p = pt("heart_rate.summary")
    resting_hr = int(_fp(p, 2)) if p and _fp(p, 2) else None  # min HR ≈ resting
    max_hr = int(_fp(p, 1)) if p and _fp(p, 1) else None

    # Weight
    p = pt("weight")
    weight_kg = _fp(p) if p else None

    # Blood pressure
    p = pt("blood_pressure")
    bp_sys = int(_fp(p, 0)) if p and _fp(p, 0) else None
    bp_dia = int(_fp(p, 1)) if p and _fp(p, 1) else None

    # Move minutes (Google's equivalent of active minutes)
    p = pt("move_minutes.delta")
    active_minutes = _int(p) if p else None

    # ---- Wear time + HR zones via 15-min HR buckets ----
    wear_time, hr_zones = _wear_time_and_zones(headers, start_ms, end_ms, max_hr)

    # ---- Sleep session ----
    sleep_raw = _fetch_sleep(headers, start_ms, end_ms)
    sleep_obj = SleepData(**sleep_raw) if sleep_raw else None
    sleep_minutes = (sleep_raw["sleep_duration"] // 60000) if sleep_raw else 0

    # ---- Exercise sessions ----
    exercise = _fetch_exercise(headers, start_ms, end_ms)

    # ---- Inactivity ----
    inactivity = max(0, 1440 - ((active_minutes or 0) + sleep_minutes))

    # Skip writing if there's no data at all
    has_data = any(v is not None for v in [steps, calories, distance, resting_hr, max_hr, sleep_obj, wear_time])
    if not has_data:
        return False

    GoogleHealthData.objects(user=user, date=d).update_one(
        set__steps=steps,
        set__calories=calories,
        set__distance=distance,
        set__floors=floors,
        set__resting_heart_rate=resting_hr,
        set__max_heart_rate=max_hr,
        set__heart_rate_zones=hr_zones,
        set__active_minutes=active_minutes,
        set__inactivity_minutes=inactivity,
        set__sleep=sleep_obj,
        set__exercise=exercise,
        set__wear_time_minutes=wear_time,
        set__weight_kg=weight_kg,
        set__bp_sys=bp_sys,
        set__bp_dia=bp_dia,
        set__breathing_rate=None,
        set__hrv=None,
        upsert=True,
    )
    return True


def fetch_google_health_today_for_user(user) -> int:
    """Fetch today only for a single user. Returns 1 if a row was written, else 0."""
    token = GoogleHealthUserToken.objects(user=user).first()
    if not token:
        logger.info("[google_health] no token for user=%s, skip", user.id)
        return 0

    try:
        access_token = get_valid_google_access_token(user)
    except Exception:
        logger.exception("[google_health] could not get token for user=%s", user.id)
        return 0

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    today = datetime.date.today()
    written = _sync_day(user, headers, today)
    if written:
        logger.info("[google_health] stored today for user=%s", user.id)
    else:
        logger.info("[google_health] no data returned for user=%s on %s", user.id, today)
    return 1 if written else 0
