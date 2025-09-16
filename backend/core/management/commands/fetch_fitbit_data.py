import datetime
import logging
import requests
from django.core.management.base import BaseCommand
from core.models import FitbitUserToken, FitbitData
from core.views.fitbit_view import get_valid_access_token

logger = logging.getLogger(__name__)
FITBIT_API_URL = 'https://api.fitbit.com/1/user/-'

class Command(BaseCommand):
    help = 'Fetch extended Fitbit metrics and store in MongoDB without duplicates'

    def handle(self, *args, **kwargs):
        users = FitbitUserToken.objects.all()
        today = datetime.date.today()
        start_date = today - datetime.timedelta(days=30)

        for user_token in users:
            try:
                access_token = get_valid_access_token(user_token.user)
                headers = {'Authorization': f'Bearer {access_token}'}

                date_range = f"{start_date}/{today}"

                # Containers keyed by date
                series = {
                    "steps": {},
                    "floors": {},
                    "distance": {},
                    "calories": {},
                    "minutesVeryActive": {},
                    "minutesFairlyActive": {},
                    "minutesLightlyActive": {},
                    "minutesSedentary": {},
                    "activeZoneMinutes": {},   # total minutes
                    "resting_heart_rate": {},
                    "heart_rate_zones": {},
                }
                breathing_data = {}
                hrv_data = {}
                sleep_data = {}
                exercise_data = {}

                def fetch_series(series_key: str, url_suffix: str):
                    """
                    series_key: the suffix used in Fitbit JSON, e.g. 'steps', 'minutesVeryActive'
                    url_suffix: the path after /-/ e.g. 'activities/steps'
                    """
                    url = f"{FITBIT_API_URL}/{url_suffix}/date/{date_range}.json"
                    resp = requests.get(url, headers=headers)
                    if resp.status_code != 200:
                        logger.warning(f"{series_key} fetch failed for {user_token.user}: {resp.text}")
                        return
                    payload_key = f"activities-{series_key}"
                    for item in resp.json().get(payload_key, []):
                        dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        # Fitbit returns strings; cast safely
                        try:
                            val = item.get("value")
                            # activeZoneMinutes returns dict in a different endpoint (handled below)
                            val = int(float(val)) if isinstance(val, str) else val
                        except Exception:
                            val = 0
                        series[series_key][dt] = val

                # Simple time series
                fetch_series("steps", "activities/steps")
                fetch_series("floors", "activities/floors")
                fetch_series("distance", "activities/distance")
                fetch_series("calories", "activities/calories")

                # Activity minute buckets
                fetch_series("minutesVeryActive", "activities/minutesVeryActive")
                fetch_series("minutesFairlyActive", "activities/minutesFairlyActive")
                fetch_series("minutesLightlyActive", "activities/minutesLightlyActive")
                fetch_series("minutesSedentary", "activities/minutesSedentary")

                # Heart rate (resting + zones)
                hr_url = f"{FITBIT_API_URL}/activities/heart/date/{date_range}.json"
                hr_resp = requests.get(hr_url, headers=headers)
                if hr_resp.status_code == 200:
                    for item in hr_resp.json().get("activities-heart", []):
                        dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        val = item.get("value", {})
                        series["resting_heart_rate"][dt] = val.get("restingHeartRate")
                        series["heart_rate_zones"][dt] = val.get("heartRateZones")
                else:
                    logger.warning(f"Heart rate fetch failed for {user_token.user}: {hr_resp.text}")

                # Active Zone Minutes (preferred if present)
                azm_url = f"{FITBIT_API_URL}/activities/active-zone-minutes/date/{start_date}/{today}.json"
                azm_resp = requests.get(azm_url, headers=headers)
                if azm_resp.status_code == 200:
                    for item in azm_resp.json().get("activities-activeZoneMinutes", []):
                        dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        val = item.get("value") or {}
                        total = val.get("totalMinutes")
                        if total is not None:
                            series["activeZoneMinutes"][dt] = int(total)
                else:
                    logger.warning(f"Active Zone Minutes fetch failed for {user_token.user}: {azm_resp.text}")

                # Breathing rate
                br_url = f"{FITBIT_API_URL}/br/date/{start_date}/{today}.json"
                br_resp = requests.get(br_url, headers=headers)
                if br_resp.status_code == 200:
                    for item in br_resp.json().get("br", []):
                        dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        breathing_data[dt] = item.get("value")
                else:
                    logger.warning(f"Breathing rate fetch failed for {user_token.user}: {br_resp.text}")

                # HRV
                hrv_url = f"{FITBIT_API_URL}/hrv/date/{start_date}/{today}.json"
                hrv_resp = requests.get(hrv_url, headers=headers)
                if hrv_resp.status_code == 200:
                    for item in hrv_resp.json().get("hrv", []):
                        dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        hrv_data[dt] = item.get("value")
                else:
                    logger.warning(f"HRV fetch failed for {user_token.user}: {hrv_resp.text}")

                # Sleep (duration is ms)
                sleep_url = f"{FITBIT_API_URL}/sleep/date/{start_date}/{today}.json"
                sleep_resp = requests.get(sleep_url, headers=headers)
                if sleep_resp.status_code == 200:
                    for entry in sleep_resp.json().get("sleep", []):
                        dt = datetime.datetime.strptime(entry["dateOfSleep"], "%Y-%m-%d").date()
                        sleep_data[dt] = {
                            "sleep_duration": entry.get("duration"),  # ms
                            "sleep_start": entry.get("startTime"),
                            "sleep_end": entry.get("endTime"),
                            "awakenings": entry.get("awakeningsCount"),
                        }
                else:
                    logger.warning(f"Sleep fetch failed for {user_token.user}: {sleep_resp.text}")

                # Exercise sessions
                act_url = f"{FITBIT_API_URL}/activities/list.json?afterDate={start_date}&sort=asc&limit=100&offset=0"
                act_resp = requests.get(act_url, headers=headers)
                if act_resp.status_code == 200:
                    for activity in act_resp.json().get("activities", []):
                        dt = datetime.datetime.strptime(activity["startTime"].split("T")[0], "%Y-%m-%d").date()
                        if start_date <= dt <= today:
                            exercise_data.setdefault(dt, []).append({
                                "name": activity.get("activityName"),
                                "duration": activity.get("duration"),
                                "calories": activity.get("calories"),
                            })
                else:
                    logger.warning(f"Exercise fetch failed for {user_token.user}: {act_resp.text}")

                # Merge dates
                all_dates = set()
                for m in series.values():
                    if isinstance(m, dict):
                        all_dates.update(m.keys())
                all_dates.update(sleep_data.keys())
                all_dates.update(exercise_data.keys())

                def sleep_minutes_for(dt: datetime.date) -> int:
                    dur_ms = (sleep_data.get(dt) or {}).get("sleep_duration") or 0
                    try:
                        return max(0, int(round((dur_ms or 0) / 60000)))
                    except Exception:
                        return 0

                for dt in sorted(all_dates):
                    # 1) Prefer Active Zone Minutes; fallback to fairly+very
                    azm = series["activeZoneMinutes"].get(dt)
                    if azm is not None:
                        active_minutes = int(azm)
                    else:
                        va = int(series["minutesVeryActive"].get(dt, 0) or 0)
                        fa = int(series["minutesFairlyActive"].get(dt, 0) or 0)
                        active_minutes = va + fa

                    # 2) Inactivity (sedentary) or computed fallback
                    sedentary = series["minutesSedentary"].get(dt)
                    inactivity_minutes = max(0, 1440 - (active_minutes + sleep_minutes_for(dt)))

                    FitbitData.objects(user=user_token.user, date=dt).update_one(
                        set__resting_heart_rate=series["resting_heart_rate"].get(dt),
                        set__steps=series["steps"].get(dt),
                        set__floors=series["floors"].get(dt),
                        set__distance=series["distance"].get(dt),
                        set__calories=series["calories"].get(dt),
                        set__active_minutes=active_minutes,
                        set__heart_rate_zones=series["heart_rate_zones"].get(dt),
                        set__sleep=sleep_data.get(dt),
                        set__exercise=exercise_data.get(dt),
                        set__breathing_rate=breathing_data.get(dt),
                        set__hrv=hrv_data.get(dt),
                        # Optional: persist for convenience if your model has it
                        set__inactivity_minutes=inactivity_minutes,
                        upsert=True
                    )
                    logger.info(f"Stored Fitbit data for {user_token.user} on {dt}")

            except Exception as e:
                logger.exception(f"Error fetching Fitbit data for {user_token.user}: {e}")
