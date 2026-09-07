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

# Canonical zone names matching the frontend chart (HRZonesStacked.tsx).
# Covers both Fitbit-style names (FAT_BURN etc.) and Google Health v4 names (MODERATE etc.).
_ZONE_NAME_MAP = {
    # Google Health v4 names
    "LIGHT": "Out of Range",
    "MODERATE": "Fat Burn",
    "VIGOROUS": "Cardio",
    "VIGOROUS_PLUS": "Peak",
    # Fitbit-style names (fallback)
    "OUT_OF_RANGE": "Out of Range",
    "FAT_BURN": "Fat Burn",
    "CARDIO": "Cardio",
    "PEAK": "Peak",
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
    return {"date": {"year": d.year, "month": d.month, "day": d.day}}


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
    # The rollup data point has no "value" wrapper — the type-specific data is at the
    # top level alongside "civilStartTime"/"civilEndTime". Return the whole dict.
    return pts[0] if pts else {}


def _list_points(access_token: str, data_type: str, filter_expr: str = "") -> list[dict]:
    """
    GET dataPoints for a data type, optionally with an AIP-160 filter expression.
    Handles pagination. Returns list of raw dataPoint dicts.
    Note: not all data types support filter expressions (e.g. sleep, daily-resting-heart-rate).
    """
    url = f"{_BASE}/dataTypes/{data_type}/dataPoints"
    points = []
    page_token = None

    while True:
        params: dict = {"pageSize": 1000}
        if filter_expr:
            params["filter"] = filter_expr
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


def _prefetch_unfiltered(access_token: str) -> dict:
    """
    Pre-fetch all data for the three types that don't support AIP-160 filters
    (sleep, daily-resting-heart-rate, daily-heart-rate-variability).

    Returns a dict with pre-built lookups:
      {
        "sleep":       {date: [points]},           # keyed by civil date (date the night belongs to)
        "resting_hr":  {date: int|None},           # keyed by civil date
        "hrv":         {date: dict|None},          # keyed by civil date
      }
    Call once per user before iterating over dates; pass the result to _sync_day()
    as the `prefetch` argument to avoid re-fetching on every day.
    """
    # --- sleep: group by civil date (6pm prev to 6pm next = night for date d) ---
    sleep_by_date: dict[datetime.date, list] = {}
    for pt in _list_points(access_token, "sleep"):
        start_str = pt.get("sleep", {}).get("interval", {}).get("startTime", "")
        if not start_str:
            continue
        try:
            start_dt = datetime.datetime.fromisoformat(start_str.replace("Z", "+00:00"))
        except ValueError:
            continue
        # Civil date: if session started after 18:00 UTC, it belongs to the NEXT calendar day
        if start_dt.hour >= 18:
            civil_date = start_dt.date() + timedelta(days=1)
        else:
            civil_date = start_dt.date()
        sleep_by_date.setdefault(civil_date, []).append(pt)

    # --- resting HR: keyed by the date struct ---
    resting_hr_by_date: dict[datetime.date, int] = {}
    for pt in _list_points(access_token, "daily-resting-heart-rate"):
        rhr = pt.get("dailyRestingHeartRate", {})
        pd = rhr.get("date", {})
        try:
            key = datetime.date(pd["year"], pd["month"], pd["day"])
        except (KeyError, ValueError, TypeError):
            continue
        bpm = rhr.get("beatsPerMinute")
        if bpm is not None:
            resting_hr_by_date[key] = int(bpm)

    # --- HRV: keyed by the date struct ---
    hrv_by_date: dict[datetime.date, dict] = {}
    for pt in _list_points(access_token, "daily-heart-rate-variability"):
        hrv_data = pt.get("dailyHeartRateVariability", {})
        pd = hrv_data.get("date", {})
        try:
            key = datetime.date(pd["year"], pd["month"], pd["day"])
        except (KeyError, ValueError, TypeError):
            continue
        rmssd = hrv_data.get("averageHeartRateVariabilityMilliseconds")
        if rmssd is not None:
            hrv_by_date[key] = {"dailyRmssd": rmssd}

    return {
        "sleep": sleep_by_date,
        "resting_hr": resting_hr_by_date,
        "hrv": hrv_by_date,
    }


def _aggregate_sleep(points: list) -> dict | None:
    """Aggregate a list of sleep data points for one night into a single sleep record."""
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
        # All numeric fields in the sleep summary are returned as strings by the API.
        ma = summary.get("minutesAsleep")
        total_minutes_asleep += int(ma) if ma is not None else (dur_ms // 60000)
        # Awakenings: prefer summary.awakenings (live API simple field), then
        # stagesSummary AWAKE count (some API versions return it there).
        aw_direct = summary.get("awakenings")
        if aw_direct is not None:
            aw = int(aw_direct)
        else:
            aw = next(
                (int(sg.get("count") or 0) for sg in summary.get("stagesSummary", []) if sg.get("type") == "AWAKE"),
                0,
            )
        total_awakenings += aw
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


def _fetch_sleep(access_token: str, d: datetime.date) -> dict | None:
    """
    Fetch and aggregate all sleep data points for date d (single-day use).

    For backfills over multiple days, call _prefetch_unfiltered() once and pass
    the result to _sync_day() — this avoids fetching all sleep data on every iteration.

    The sleep data type does not support AIP-160 filter expressions, so all points
    are fetched and filtered client-side by startTime (6pm previous day to 6pm target
    day) to capture overnight sleep for the correct calendar date.
    """
    prev = d - timedelta(days=1)
    prev_cutoff = datetime.datetime.combine(prev, datetime.time(18, 0), tzinfo=datetime.timezone.utc)
    day_cutoff = datetime.datetime.combine(d, datetime.time(18, 0), tzinfo=datetime.timezone.utc)

    all_points = _list_points(access_token, "sleep")
    points = []
    for pt in all_points:
        start_str = pt.get("sleep", {}).get("interval", {}).get("startTime", "")
        if not start_str:
            continue
        try:
            start_dt = datetime.datetime.fromisoformat(start_str.replace("Z", "+00:00"))
        except ValueError:
            continue
        if prev_cutoff <= start_dt < day_cutoff:
            points.append(pt)

    return _aggregate_sleep(points)


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


def _parse_hr_zones(rollup_pt: dict) -> list[HeartRateZone]:
    """
    Parse a time-in-heart-rate-zone rollup data point into HeartRateZone embedded docs.

    Google Health v4 schema (confirmed from live API):
      rollup_pt["timeInHeartRateZone"]["timeInHeartRateZones"] = [
        {"heartRateZone": "LIGHT", "duration": "81480s"},
        ...
      ]
    Duration is a string like "81480s" (seconds); must be converted to minutes.
    """
    zones_raw = rollup_pt.get("timeInHeartRateZone", {}).get("timeInHeartRateZones", [])
    zones = []
    for z in zones_raw:
        raw_name = z.get("heartRateZone", "")
        name = _ZONE_NAME_MAP.get(raw_name, raw_name)
        dur_str = z.get("duration", "0s")
        try:
            seconds = int(str(dur_str).rstrip("s") or 0)
        except ValueError:
            seconds = 0
        minutes = seconds // 60
        if minutes <= 0:
            continue
        zones.append(
            HeartRateZone(
                name=name,
                minutes=minutes,
                min=None,
                max=None,
                caloriesOut=None,
            )
        )
    return zones


def _sync_day(user, access_token: str, d: datetime.date, prefetch: dict | None = None) -> bool:
    """
    Fetch and upsert one day of Google Health data for *user* using the v4 API.
    Returns True if a row was written.

    For multi-day backfills, pass the result of _prefetch_unfiltered(access_token)
    as `prefetch` so that sleep, resting HR, and HRV are not re-fetched on every call.
    """

    def rollup(data_type: str) -> dict:
        return _daily_rollup(access_token, data_type, d)

    # Google Health v4 rollup: data is at the top level of the rollup data point,
    # NOT inside a "value" wrapper. Field names also differ from what the initial
    # implementation assumed — all confirmed from live API responses.

    # ---- Steps ----  steps.countSum (string)
    v = rollup("steps")
    steps_raw = v.get("steps", {}).get("countSum")
    steps = int(steps_raw) if steps_raw is not None else None

    # ---- Calories ---- activeEnergyBurned.kilocaloriesSum (field unconfirmed — no data in test account)
    v = rollup("active-energy-burned")
    cal_raw = v.get("activeEnergyBurned", {}).get("kilocaloriesSum")
    calories = float(cal_raw) if cal_raw is not None else None

    # ---- Distance (mm → km) ---- distance.millimetersSum (string)
    v = rollup("distance")
    mm_raw = v.get("distance", {}).get("millimetersSum")
    distance = round(int(mm_raw) / 1_000_000, 3) if mm_raw is not None else None

    # ---- Floors ---- floors.countSum (string)
    v = rollup("floors")
    floors_raw = v.get("floors", {}).get("countSum")
    floors = int(floors_raw) if floors_raw is not None else None

    # ---- Active minutes ---- sum of activeMinutesRollupByActivityLevel[*].activeMinutesSum
    v = rollup("active-minutes")
    am_total = sum(
        int(level.get("activeMinutesSum") or 0)
        for level in v.get("activeMinutes", {}).get("activeMinutesRollupByActivityLevel", [])
        if level.get("activeMinutesSum") is not None
    )
    active_minutes = am_total if am_total > 0 else None

    # ---- Resting heart rate ----
    # daily-resting-heart-rate does not support dailyRollUp or AIP-160 filters.
    # Use pre-fetched lookup when available; fall back to a full fetch for single-day use.
    if prefetch is not None:
        resting_hr = prefetch["resting_hr"].get(d)
    else:
        resting_hr = None
        for pt in _list_points(access_token, "daily-resting-heart-rate"):
            rhr = pt.get("dailyRestingHeartRate", {})
            pt_date = rhr.get("date", {})
            if pt_date.get("year") == d.year and pt_date.get("month") == d.month and pt_date.get("day") == d.day:
                bpm = rhr.get("beatsPerMinute")
                if bpm is not None:
                    resting_hr = int(bpm)
                break

    # ---- HRV ----
    # daily-heart-rate-variability does not support dailyRollUp or AIP-160 filters.
    # Use pre-fetched lookup when available; fall back to a full fetch for single-day use.
    if prefetch is not None:
        hrv = prefetch["hrv"].get(d)
    else:
        hrv = None
        for pt in _list_points(access_token, "daily-heart-rate-variability"):
            hrv_data = pt.get("dailyHeartRateVariability", {})
            pt_date = hrv_data.get("date", {})
            if pt_date.get("year") == d.year and pt_date.get("month") == d.month and pt_date.get("day") == d.day:
                rmssd = hrv_data.get("averageHeartRateVariabilityMilliseconds")
                if rmssd is not None:
                    hrv = {"dailyRmssd": rmssd}
                break

    # ---- HR zones + wear time ----
    v = rollup("time-in-heart-rate-zone")
    hr_zones = _parse_hr_zones(v)
    # Wear time = total minutes across all zones
    wear_time = sum(z.minutes for z in hr_zones) or None

    # ---- Weight ---- weight.weightGramsAvg (int, grams → kg)
    v = rollup("weight")
    weight_grams = v.get("weight", {}).get("weightGramsAvg")
    weight_kg = round(float(weight_grams) / 1000, 2) if weight_grams is not None else None

    # ---- Sleep ----
    if prefetch is not None:
        sleep_raw = _aggregate_sleep(prefetch["sleep"].get(d, []))
    else:
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
