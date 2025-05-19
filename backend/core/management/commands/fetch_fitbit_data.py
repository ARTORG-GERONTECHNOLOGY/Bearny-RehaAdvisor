import datetime
import logging
import requests
from django.core.management.base import BaseCommand
from django.utils import timezone
from pymongo import MongoClient
from django.conf import settings

from core.models import FitbitUserToken, FitbitData
from core.views.fitbit_view import get_valid_access_token  # reuse your helper

logger = logging.getLogger(__name__)
FITBIT_API_URL = 'https://api.fitbit.com/1/user/-'


class Command(BaseCommand):
    help = 'Fetch Fitbit heart rate and steps for users and store in MongoDB'

    def handle(self, *args, **kwargs):
        users = FitbitUserToken.objects.all()
        today = datetime.date.today()
        start_date = today - datetime.timedelta(days=30)

        for user_token in users:
            try:
                access_token = get_valid_access_token(user_token.user)
                headers = {'Authorization': f'Bearer {access_token}'}

                # Fetch heart rate
                hr_url = f"{FITBIT_API_URL}/activities/heart/date/{start_date}/{today}.json"
                hr_response = requests.get(hr_url, headers=headers)
                hr_map = {}

                if hr_response.status_code == 200:
                    for item in hr_response.json().get("activities-heart", []):
                        date_str = item["dateTime"]
                        date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
                        resting_hr = item.get("value", {}).get("restingHeartRate")
                        if resting_hr is not None:
                            hr_map[date] = resting_hr
                else:
                    logger.warning(f"Heart rate fetch failed for {user_token.user}: {hr_response.text}")

                # Fetch steps
                steps_url = f"{FITBIT_API_URL}/activities/steps/date/{start_date}/{today}.json"
                steps_response = requests.get(steps_url, headers=headers)
                steps_map = {}

                if steps_response.status_code == 200:
                    for item in steps_response.json().get("activities-steps", []):
                        date_str = item["dateTime"]
                        date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
                        steps = int(item.get("value", 0))
                        steps_map[date] = steps
                else:
                    logger.warning(f"Steps fetch failed for {user_token.user}: {steps_response.text}")

                # Merge data and store/update in DB
                all_dates = set(hr_map.keys()).union(steps_map.keys())
                for date in sorted(all_dates):
                    FitbitData.objects(user=user_token.user, date=date).update_one(
                        set__resting_heart_rate=hr_map.get(date),
                        set__steps=steps_map.get(date),
                        upsert=True
                    )
                    logger.info(f"Stored Fitbit data for {user_token.user} on {date}")

            except Exception as e:
                logger.exception(f"Error fetching Fitbit data for {user_token.user}: {e}")
