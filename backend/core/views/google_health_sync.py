# core/views/google_health_sync.py
import datetime
import logging
from datetime import timedelta

import requests
from django.conf import settings
from django.utils import timezone
from django.utils.timezone import is_naive, make_aware

from core.models import GoogleHealthData, GoogleHealthUserToken, HeartRateZone, SleepData

logger = logging.getLogger(__name__)

_BASE = "https://health.googleapis.com/v4/users/me"
_TOKEN_URL = "https://oauth2.googleapis.com/token"

# Canonical zone names matching the frontend chart (HRZonesStacked.tsx)
_ZONE_NAME_MAP = {
    "OUT_OF_RANGE": "Out of Range",
    "FAT_BURN": "Fat Burn",
    "CARDIO": "Cardio",
    "PEAK": "Peak",
    # In case the API returns lowercase or Title Case variants
    "out_of_range": "Out of Range",
    "fat_burn": "Fat Burn",
    "cardio": "Cardio",
    "peak": "Peak",
}


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
            resp = requests.post(_TOKEN_URL, data=data, timeout=15)
            if resp.status_code == 200:
                td = resp.json()
                token.access_token = td["access_token"]
                token.expires_at = timezone.now() + timedelta(seconds=td["expires_in"])
                token.save()
                logger.info("[google_health] Token refreshed for user %s", user.id)
            else:
                logger.error(
                    "[google_health] Token refresh failed %s: %s",
                    resp.status_code,
                    resp.text,
                )
                if "invalid_grant" in resp.text:
                    token.is_revoked = True
                    token.revoked_at = timezone.now()
                    token.save()
                    logger.warning("[google_health] Token revoked (invalid_grant) for user %s", user.id)
                raise Exception("Failed to refresh Google access token")
        except Exception:
            logger.exception("[google_health] Exception refreshing token for user %s", user.id)
            raise

    return token.access_token


def _civil_date(d: datetime.date) -> dict:
    """Convert a date to the CivilDateTime format expected by dailyRollUp."""
    return {"year": d.year, "month": d.month, "day": d.day}


def _daily_rollup(access_token: str, data_type: str, d: datetime.date) -> dict:
    """
    POST dailyRollUp for one data type and one calendar day.
    Returns the first rollupDataPoint's value dict, or {} on error/no data.

    NOTE: Exact nested field names in `value` depend on the data type and must be
    verified against a live API response during initial testing.
    """
    url = f"{_BASE}/dataTypes/{data_type}/dataPoints:dailyRollUp"
    next_day = d + timedelta(days=1)
    body = {
        "range": {
            "start": _civil_date(d),
            "end": _civil_date(next_day),
        },
        "windowSizeDays": 1,
    }
    try:
        resp = requests.post(
            url,
            json=body,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
    except requests.RequestException:
        logger.exception("[google_health] Request error for %s on %s", data_type, d)
        return {}

    if resp.status_code != 200:
        logger.warning(
            "[google_health] dailyRollUp %s failed %s: %s",
            data_type,
            resp.status_code,
            resp.text[:200],
        )
        return {}

    pts = resp.json().get("rollupDataPoints", [])
    return pts[0].get("value", {}) if pts else {}


def _list_points(access_token: str, data_type: str, filter_expr: str) -> list[dict]:
    """
    GET dataPoints for a data type using an AIP-160 filter expression.
    Handles pagination. Returns list of raw dataPoint dicts.
    """
    url = f"{_BASE}/dataTypes/{data_type}/dataPoints"
    points = []
    page_token = None

    while True:
        params: dict = {"filter": filter_expr, "pageSize": 1000}
        if page_token:
            params["pageToken"] = page_token
        try:
            resp = requests.get(
                url,
                params=params,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=20,
            )
        except requests.RequestException:
            logger.exception("[google_health] Request error listing %s", data_type)
            break

        if resp.status_code != 200:
            logger.warning(
                "[google_health] list %s failed %s: %s",
                data_type,
                resp.status_code,
                resp.text[:200],
            )
            break

        body = resp.json()
        points.extend(body.get("dataPoints", []))
        page_token = body.get("nextPageToken")
        if not page_token:
            break

    return points


def _fetch_sleep(access_token: str, d: datetime.date) -> dict | None:
    """
    Fetch and aggregate all sleep data points for date d.

    Filters by civil_start_time from 6pm the previous day to 6pm the target day
    so that overnight sleep is captured for the correct calendar date.

    The Google Health API may return multiple data points for one night (e.g. two
    consecutive sessions or separate stage segments).  All are summed so the result
    matches what Google Health displays, rather than showing only the longest segment.
    """
    prev = d - timedelta(days=1)
    filter_expr = (
        f'sleep.interval.civil_start_time >= "{prev.isoformat()}T18:00:00"'
        f' AND sleep.interval.civil_start_time < "{d.isoformat()}T18:00:00"'
    )
    points = _list_points(access_token, "sleep", filter_expr)
    if not points:
        return None

    total_duration_ms = 0
    total_minutes_asleep = 0
    total_awakenings = 0
    earliest_start: datetime.datetime | None = None
    latest_end: datetime.datetime | None = None

    for pt in points:
        s = pt.get("sleep", {})
        iv = s.get("interval", {})
        summary = s.get("summary", {})
        try:
            start_dt = datetime.datetime.fromisoformat(iv["startTime"].replace("Z", "+00:00"))
            end_dt = datetime.datetime.fromisoformat(iv["endTime"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        dur_ms = int((end_dt - start_dt).total_seconds() * 1000)
        total_duration_ms += dur_ms
        total_minutes_asleep += summary.get("minutesAsleep") or (dur_ms // 60000)
        total_awakenings += summary.get("awakenings") or 0
        if earliest_start is None or start_dt < earliest_start:
            earliest_start = start_dt
        if latest_end is None or end_dt > latest_end:
            latest_end = end_dt

    if not total_duration_ms or earliest_start is None:
        return None

    return {
        "sleep_duration": total_duration_ms,
        "minutes_asleep": total_minutes_asleep,
        "sleep_start": earliest_start.isoformat(),
        "sleep_end": latest_end.isoformat(),
        "awakenings": total_awakenings,
    }


def _fetch_exercise(access_token: str, d: datetime.date) -> list[dict]:
    """Fetch exercise sessions for date d (civil day boundary)."""
    filter_expr = (
        f'exercise.interval.civil_start_time >= "{d.isoformat()}T00:00:00"'
        f' AND exercise.interval.civil_start_time < "{(d + timedelta(days=1)).isoformat()}T00:00:00"'
    )
    points = _list_points(access_token, "exercise", filter_expr)
    sessions = []
    for pt in points:
        ex = pt.get("exercise", {})
        iv = ex.get("interval", {})
        metrics = ex.get("metricsSummary", {})
        try:
            start_dt = datetime.datetime.fromisoformat(iv["startTime"].replace("Z", "+00:00"))
            end_dt = datetime.datetime.fromisoformat(iv["endTime"].replace("Z", "+00:00"))
            duration_ms = int((end_dt - start_dt).total_seconds() * 1000)
        except (KeyError, ValueError):
            continue

        sessions.append(
            {
                "logId": None,
                "name": ex.get("name") or ex.get("activityType") or "Exercise",
                "startTime": iv.get("startTime", ""),
                "duration": duration_ms,
                "calories": metrics.get("calories"),
                "averageHeartRate": metrics.get("averageHeartRate"),
                "maxHeartRate": metrics.get("maxHeartRate"),
                "steps": metrics.get("steps"),
                "distance": (
                    round(metrics["distance"]["meters"] / 1000, 3)
                    if metrics.get("distance", {}).get("meters")
                    else None
                ),
                "elevationGain": None,
                "speed": None,
                "activeZoneMinutes": None,
                "heartRateZones": [],
                "activityLevel": None,
            }
        )
    return sessions


def _parse_hr_zones(value: dict) -> list[HeartRateZone]:
    """
    Parse time-in-heart-rate-zone rollup value into HeartRateZone embedded docs.
    NOTE: The exact nested key name ("timeInHeartRateZone" vs another) should be
    verified against a live API response. Fall back to checking all dict values.
    """
    zones_raw = value.get("timeInHeartRateZone", {}).get("zones", [])

    # Fallback: search one level deep if the top-level key differs
    if not zones_raw:
        for v in value.values():
            if isinstance(v, dict) and "zones" in v:
                zones_raw = v["zones"]
                break

    zones = []
    for z in zones_raw:
        raw_name = z.get("name", "")
        name = _ZONE_NAME_MAP.get(raw_name, raw_name)
        minutes = z.get("minutes") or 0
        if minutes <= 0:
            continue
        zones.append(
            HeartRateZone(
                name=name,
                minutes=minutes,
                min=z.get("minBpm"),
                max=z.get("maxBpm"),
                caloriesOut=None,
            )
        )
    return zones


def _sync_day(user, access_token: str, d: datetime.date) -> bool:
    """
    Fetch and upsert one day of Google Health data for *user* using the v4 API.
    Returns True if a row was written.
    """

    def rollup(data_type: str) -> dict:
        return _daily_rollup(access_token, data_type, d)

    # ---- Steps ----
    v = rollup("steps")
    steps = v.get("steps", {}).get("count")
    if steps is not None:
        steps = int(steps)

    # ---- Calories ----
    v = rollup("active-energy-burned")
    calories = v.get("activeEnergyBurned", {}).get("kilocalories")
    if calories is not None:
        calories = float(calories)

    # ---- Distance (meters → km) ----
    v = rollup("distance")
    raw_m = v.get("distance", {}).get("meters")
    distance = round(raw_m / 1000, 3) if raw_m is not None else None

    # ---- Floors ----
    v = rollup("floors")
    floors = v.get("floors", {}).get("count")
    if floors is not None:
        floors = int(floors)

    # ---- Active minutes ----
    v = rollup("active-minutes")
    # Field name may be "activeMinutes" with "value" or "count"; try both
    am_obj = v.get("activeMinutes", {})
    active_minutes = am_obj.get("value") or am_obj.get("count")
    if active_minutes is not None:
        active_minutes = int(active_minutes)

    # ---- Resting heart rate ----
    v = rollup("daily-resting-heart-rate")
    resting_hr_obj = v.get("dailyRestingHeartRate", {})
    resting_hr = resting_hr_obj.get("beatsPerMinute")
    if resting_hr is not None:
        resting_hr = int(resting_hr)

    # ---- HRV (now available via the new API) ----
    v = rollup("daily-heart-rate-variability")
    hrv_obj = v.get("dailyHeartRateVariability", {})
    rmssd = hrv_obj.get("rmssd")
    hrv = {"dailyRmssd": rmssd} if rmssd is not None else None

    # ---- HR zones + wear time ----
    v = rollup("time-in-heart-rate-zone")
    hr_zones = _parse_hr_zones(v)
    # Wear time = total minutes across all zones
    wear_time = sum(z.minutes for z in hr_zones) or None

    # ---- Weight ----
    v = rollup("weight")
    weight_kg = v.get("weight", {}).get("kilograms")
    if weight_kg is not None:
        weight_kg = float(weight_kg)

    # ---- Sleep ----
    sleep_raw = _fetch_sleep(access_token, d)
    sleep_obj = SleepData(**sleep_raw) if sleep_raw else None
    sleep_minutes = (sleep_raw.get("minutes_asleep") or sleep_raw["sleep_duration"] // 60000) if sleep_raw else 0

    # ---- Exercise sessions ----
    exercise_sessions = _fetch_exercise(access_token, d)
    exercise = {"sessions": exercise_sessions} if exercise_sessions else None

    # ---- Inactivity ----
    inactivity = max(0, 1440 - ((active_minutes or 0) + sleep_minutes))

    # Skip writing if there is no meaningful data for this day
    has_data = any(v is not None for v in [steps, calories, distance, resting_hr, sleep_obj, wear_time, weight_kg])
    if not has_data:
        logger.debug("[google_health] no data for user=%s on %s", user.id, d)
        return False

    GoogleHealthData.objects(user=user, date=d).update_one(
        set__steps=steps,
        set__calories=calories,
        set__distance=distance,
        set__floors=floors,
        set__resting_heart_rate=resting_hr,
        set__max_heart_rate=None,  # no dedicated max-HR data type in v4
        set__heart_rate_zones=hr_zones,
        set__active_minutes=active_minutes,
        set__inactivity_minutes=inactivity,
        set__sleep=sleep_obj,
        set__exercise=exercise,
        set__wear_time_minutes=wear_time,
        set__weight_kg=weight_kg,
        set__bp_sys=None,  # blood pressure not available in confirmed v4 data types
        set__bp_dia=None,
        set__breathing_rate=None,
        set__hrv=hrv,
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

    today = datetime.date.today()
    written = _sync_day(user, access_token, today)
    if written:
        logger.info("[google_health] stored today for user=%s", user.id)
    else:
        logger.info("[google_health] no data returned for user=%s on %s", user.id, today)
    return 1 if written else 0
