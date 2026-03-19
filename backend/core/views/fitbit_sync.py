# core/services/fitbit_sync.py
import datetime
import logging
from datetime import timedelta

import requests
from django.conf import settings
from django.utils import timezone
from django.utils.timezone import is_naive, make_aware, now

from core.models import FitbitData, FitbitUserToken

logger = logging.getLogger(__name__)
FITBIT_API_URL = "https://api.fitbit.com/1/user/-"


def get_valid_access_token(user):
    token = FitbitUserToken.objects.get(user=user)

    if is_naive(token.expires_at):
        token.expires_at = make_aware(token.expires_at)

    if token.expires_at <= timezone.now():
        refresh_url = "https://api.fitbit.com/oauth2/token"
        client_id = settings.FITBIT_CLIENT_ID
        client_secret = settings.FITBIT_CLIENT_SECRET
        basic_auth = requests.auth.HTTPBasicAuth(client_id, client_secret)

        data = {
            "grant_type": "refresh_token",
            "refresh_token": token.refresh_token,
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        try:
            response = requests.post(refresh_url, auth=basic_auth, data=data, headers=headers)
            logger.debug(f"[get_valid_access_token] Refresh token response status: {response.status_code}")
            logger.debug(f"[get_valid_access_token] Response text: {response.text}")

            if response.status_code == 200:
                token_data = response.json()
                token.access_token = token_data["access_token"]
                token.refresh_token = token_data.get("refresh_token", token.refresh_token)
                token.expires_at = timezone.now() + timedelta(seconds=token_data["expires_in"])
                token.save()
                logger.info(f"[get_valid_access_token] Token refreshed for user {user.id}")
            else:
                logger.error(
                    f"[get_valid_access_token] Failed to refresh token. Status: {response.status_code}, Body: {response.text}"
                )
                raise Exception("Failed to refresh Fitbit token")
        except Exception as e:
            logger.exception(f"[get_valid_access_token] Exception while refreshing token: {e}")
            raise

    return token.access_token


def fetch_fitbit_today_for_user(user) -> int:
    """Fetch **today only** for a single user; returns upserted day-count (0|1)."""
    today = datetime.date.today()
    token = FitbitUserToken.objects(user=user).first()
    if not token:
        logger.info(f"[fitbit] no token for user={user}. skip")
        print(f"[fitbit] no token for user={user}. skip")
        return 0

    access_token = get_valid_access_token(user)
    headers = {"Authorization": f"Bearer {access_token}"}
    date_str = today.strftime("%Y-%m-%d")
    date_range = f"{date_str}/{date_str}"

    series = {
        "steps": {},
        "floors": {},
        "distance": {},
        "calories": {},
        "minutesVeryActive": {},
        "minutesFairlyActive": {},
        "minutesLightlyActive": {},
        "minutesSedentary": {},
        "activeZoneMinutes": {},
        "resting_heart_rate": {},
        "heart_rate_zones": {},
    }
    breathing_data, hrv_data, sleep_data, exercise_data = {}, {}, {}, {}

    def fetch_series(series_key: str, url_suffix: str):
        url = f"{FITBIT_API_URL}/{url_suffix}/date/{date_range}.json"
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            logger.warning(f"[fitbit] {series_key} fetch failed user={user}: {resp.text}")
            print(f"[fitbit] {series_key} fetch failed user={user}: {resp.text}")
            return
        payload_key = f"activities-{series_key}"
        for item in resp.json().get(payload_key, []):
            dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
            try:
                val = item.get("value")
                val = int(float(val)) if isinstance(val, str) else val
            except Exception:
                val = 0
            series[series_key][dt] = val

    # Basic time series (today only)
    fetch_series("steps", "activities/steps")
    fetch_series("floors", "activities/floors")
    fetch_series("distance", "activities/distance")
    fetch_series("calories", "activities/calories")
    fetch_series("minutesVeryActive", "activities/minutesVeryActive")
    fetch_series("minutesFairlyActive", "activities/minutesFairlyActive")
    fetch_series("minutesLightlyActive", "activities/minutesLightlyActive")
    fetch_series("minutesSedentary", "activities/minutesSedentary")

    # Heart rate (resting + zones)
    hr_url = f"{FITBIT_API_URL}/activities/heart/date/{date_range}.json"
    hr_resp = requests.get(hr_url, headers=headers, timeout=15)
    if hr_resp.status_code == 200:
        for item in hr_resp.json().get("activities-heart", []):
            dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
            val = item.get("value", {})
            series["resting_heart_rate"][dt] = val.get("restingHeartRate")
            series["heart_rate_zones"][dt] = val.get("heartRateZones")

    # Active Zone Minutes
    azm_url = f"{FITBIT_API_URL}/activities/active-zone-minutes/date/{date_str}/{date_str}.json"
    azm_resp = requests.get(azm_url, headers=headers, timeout=15)
    if azm_resp.status_code == 200:
        for item in azm_resp.json().get("activities-activeZoneMinutes", []):
            dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
            val = item.get("value") or {}
            total = val.get("totalMinutes")
            if total is not None:
                series["activeZoneMinutes"][dt] = int(total)

    # Breathing rate
    br_url = f"{FITBIT_API_URL}/br/date/{date_str}/{date_str}.json"
    br_resp = requests.get(br_url, headers=headers, timeout=15)
    if br_resp.status_code == 200:
        for item in br_resp.json().get("br", []):
            dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
            breathing_data[dt] = item.get("value")

    # HRV
    hrv_url = f"{FITBIT_API_URL}/hrv/date/{date_str}/{date_str}.json"
    hrv_resp = requests.get(hrv_url, headers=headers, timeout=15)
    if hrv_resp.status_code == 200:
        for item in hrv_resp.json().get("hrv", []):
            dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
            hrv_data[dt] = item.get("value")

    # Intraday HR (1-sec) for wear time and max HR
    intraday_hr_map: dict[datetime.date, list] = {}
    intraday_url = f"{FITBIT_API_URL}/activities/heart/date/{date_str}/1d/1sec.json"
    intraday_resp = requests.get(intraday_url, headers=headers, timeout=20)
    if intraday_resp.status_code == 200:
        dataset = intraday_resp.json().get("activities-heart-intraday", {}).get("dataset", [])
        if dataset:
            intraday_hr_map[today] = dataset

    # Sleep
    sleep_url = f"{FITBIT_API_URL}/sleep/date/{date_str}/{date_str}.json"
    sleep_resp = requests.get(sleep_url, headers=headers, timeout=20)
    if sleep_resp.status_code == 200:
        for entry in sleep_resp.json().get("sleep", []):
            dt = datetime.datetime.strptime(entry["dateOfSleep"], "%Y-%m-%d").date()
            sleep_data[dt] = {
                "sleep_duration": entry.get("duration"),
                "minutes_asleep": entry.get("minutesAsleep"),
                "sleep_start": entry.get("startTime"),
                "sleep_end": entry.get("endTime"),
                "awakenings": entry.get("awakeningsCount"),
            }

    # Exercise sessions (filter to today)
    act_url = f"{FITBIT_API_URL}/activities/list.json?afterDate={date_str}&sort=asc&limit=100&offset=0"
    act_resp = requests.get(act_url, headers=headers, timeout=20)
    if act_resp.status_code == 200:
        for activity in act_resp.json().get("activities", []):
            dt = datetime.datetime.strptime(activity["startTime"].split("T")[0], "%Y-%m-%d").date()
            if dt == today:
                exercise_data.setdefault(dt, []).append(
                    {
                        "name": activity.get("activityName"),
                        "duration": activity.get("duration"),
                        "calories": activity.get("calories"),
                    }
                )

    # Upsert just today if we have any data
    def sleep_minutes_for(dt: datetime.date) -> int:
        dur_ms = (sleep_data.get(dt) or {}).get("sleep_duration") or 0
        try:
            return max(0, int(round((dur_ms or 0) / 60000)))
        except Exception:
            return 0

    def wear_time_for(dt: datetime.date) -> int | None:
        dataset = intraday_hr_map.get(dt)
        if not dataset:
            return None
        worn_minutes = {
            entry["time"][:5] for entry in dataset if entry.get("value", 0) > 0  # "HH:MM" — unique minute slots
        }
        return len(worn_minutes)

    all_dates = {today}
    for m in series.values():
        if isinstance(m, dict):
            all_dates |= set(m.keys())
    all_dates |= set(sleep_data.keys())
    all_dates |= set(exercise_data.keys())

    upserted = 0
    for dt in sorted(d for d in all_dates if d == today):
        azm = series["activeZoneMinutes"].get(dt)
        if azm is not None:
            active_minutes = int(azm)
        else:
            va = int(series["minutesVeryActive"].get(dt, 0) or 0)
            fa = int(series["minutesFairlyActive"].get(dt, 0) or 0)
            active_minutes = va + fa

        inactivity_minutes = max(0, 1440 - (active_minutes + sleep_minutes_for(dt)))

        max_hr = None
        if today in intraday_hr_map:
            values = [e.get("value", 0) for e in intraday_hr_map[today] if e.get("value", 0) > 0]
            if values:
                max_hr = max(values)

        FitbitData.objects(user=user, date=dt).update_one(
            set__resting_heart_rate=series["resting_heart_rate"].get(dt),
            set__steps=series["steps"].get(dt),
            set__floors=series["floors"].get(dt),
            set__distance=series["distance"].get(dt),
            set__calories=series["calories"].get(dt),
            set__active_minutes=active_minutes,
            set__max_heart_rate=max_hr,
            set__heart_rate_zones=series["heart_rate_zones"].get(dt),
            set__sleep=sleep_data.get(dt),
            set__exercise=exercise_data.get(dt),
            set__breathing_rate=breathing_data.get(dt),
            set__hrv=hrv_data.get(dt),
            set__inactivity_minutes=inactivity_minutes,
            set__wear_time_minutes=wear_time_for(dt),
            upsert=True,
        )
        upserted += 1

    logger.info(f"[fitbit] stored {upserted} row for user={user} on {date_str}")
    print(f"[fitbit] stored {upserted} row for user={user} on {date_str}")
    return upserted
