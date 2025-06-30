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

                # Initialize data containers
                metrics = {
                    "resting_heart_rate": {},
                    "steps": {},
                    "floors": {},
                    "distance": {},
                    "calories": {},
                    "active_minutes": {},
                    "heart_rate_zones": {},
                }

                def fetch_and_store(url_suffix, field_name, extractor):
                    url = f"{FITBIT_API_URL}/{url_suffix}/date/{date_range}.json"
                    response = requests.get(url, headers=headers)
                    if response.status_code == 200:
                        for item in response.json().get(f"activities-{field_name}", []):
                            date = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                            metrics[field_name][date] = extractor(item)
                    else:
                        logger.warning(f"{field_name} fetch failed for {user_token.user}: {response.text}")

                fetch_and_store("activities/steps", "steps", lambda i: int(i["value"]))
                fetch_and_store("activities/floors", "floors", lambda i: int(i["value"]))
                fetch_and_store("activities/distance", "distance", lambda i: float(i["value"]))
                fetch_and_store("activities/calories", "calories", lambda i: float(i["value"]))
                fetch_and_store("activities/minutesVeryActive", "active_minutes", lambda i: int(i["value"]))

                # Heart rate
                hr_url = f"{FITBIT_API_URL}/activities/heart/date/{date_range}.json"
                hr_resp = requests.get(hr_url, headers=headers)
                if hr_resp.status_code == 200:
                    for item in hr_resp.json().get("activities-heart", []):
                        date = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        val = item.get("value", {})
                        metrics["resting_heart_rate"][date] = val.get("restingHeartRate")
                        metrics["heart_rate_zones"][date] = val.get("heartRateZones")
                else:
                    logger.warning(f"Heart rate fetch failed for {user_token.user}: {hr_resp.text}")
                
                # Breathing rate
                br_url = f"{FITBIT_API_URL}/br/date/{start_date}/{today}.json"
                br_resp = requests.get(br_url, headers=headers)
                breathing_data = {}
                if br_resp.status_code == 200:
                    for item in br_resp.json().get("br", []):
                        date = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        breathing_data[date] = item.get("value")
                else:
                    logger.warning(f"Breathing rate fetch failed for {user_token.user}: {br_resp.text}")

                # HRV
                hrv_url = f"{FITBIT_API_URL}/hrv/date/{start_date}/{today}.json"
                hrv_resp = requests.get(hrv_url, headers=headers)
                hrv_data = {}
                if hrv_resp.status_code == 200:
                    for item in hrv_resp.json().get("hrv", []):
                        date = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        hrv_data[date] = item.get("value")
                else:
                    logger.warning(f"HRV fetch failed for {user_token.user}: {hrv_resp.text}")


                # Sleep
                sleep_data = {}
                sleep_url = f"{FITBIT_API_URL}/sleep/date/{start_date}/{today}.json"
                sleep_resp = requests.get(sleep_url, headers=headers)
                if sleep_resp.status_code == 200:
                    for entry in sleep_resp.json().get("sleep", []):
                        date = datetime.datetime.strptime(entry["dateOfSleep"], "%Y-%m-%d").date()
                        sleep_data[date] = {
                            "sleep_duration": entry.get("duration"),
                            "sleep_start": entry.get("startTime"),
                            "sleep_end": entry.get("endTime"),
                            "awakenings": entry.get("awakeningsCount"),
                        }
                else:
                    logger.warning(f"Sleep fetch failed for {user_token.user}: {sleep_resp.text}")
                

                # Exercise sessions (list + per-date summary)
                exercise_data = {}
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

                # Merge all dates
                all_dates = set()
                for m in metrics.values():
                    all_dates.update(m.keys())
                all_dates.update(sleep_data.keys())
                all_dates.update(exercise_data.keys())

                for date in sorted(all_dates):
                    FitbitData.objects(user=user_token.user, date=date).update_one(
                        set__resting_heart_rate=metrics["resting_heart_rate"].get(date),
                        set__steps=metrics["steps"].get(date),
                        set__floors=metrics["floors"].get(date),
                        set__distance=metrics["distance"].get(date),
                        set__calories=metrics["calories"].get(date),
                        set__active_minutes=metrics["active_minutes"].get(date),
                        set__heart_rate_zones=metrics["heart_rate_zones"].get(date),
                        set__sleep=sleep_data.get(date),
                        set__exercise=exercise_data.get(date),
                        set__breathing_rate=breathing_data.get(date),
                        set__hrv=hrv_data.get(date),
                        upsert=True
                    )

                    logger.info(f"Stored Fitbit data for {user_token.user} on {date}")

            except Exception as e:
                logger.exception(f"Error fetching Fitbit data for {user_token.user}: {e}")
