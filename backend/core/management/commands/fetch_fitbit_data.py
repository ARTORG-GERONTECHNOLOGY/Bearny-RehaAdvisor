# management/commands/fetch_fitbit_data.py

import datetime
import logging
import requests
from django.core.management.base import BaseCommand
from core.models import (
    FitbitUserToken,
    FitbitData,
    HeartRateZone,
    SleepData,
    ExerciseSession,
    ActivityHeartRateZone,
    ActivityLevel,
)
from core.views.fitbit_sync import get_valid_access_token

logger = logging.getLogger(__name__)
FITBIT_API_URL = "https://api.fitbit.com/1/user/-"


class Command(BaseCommand):
    help = "Fetch extended Fitbit metrics and store in MongoDB (no duplicates)"

    def handle(self, *args, **kwargs):
        users = FitbitUserToken.objects.all()

        today = datetime.date.today()
        start_date = today - datetime.timedelta(days=30)

        for user_token in users:
            try:
                access_token = get_valid_access_token(user_token.user)
                headers = {"Authorization": f"Bearer {access_token}"}

                date_range = f"{start_date}/{today}"

                # ---------------------------
                # DATA BUCKETS
                # ---------------------------
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
                breathing_data = {}
                hrv_data = {}
                sleep_data = {}
                exercise_data = {}
                max_hr_map = {}

                # ---------------------------
                # GENERIC FETCH FUNCTION
                # ---------------------------
                def fetch_series(series_key: str, url_suffix: str):
                    url = f"{FITBIT_API_URL}/{url_suffix}/date/{date_range}.json"
                    resp = requests.get(url, headers=headers)
                    if resp.status_code != 200:
                        logger.warning(f"[{series_key}] fetch failed: {resp.text}")
                        return

                    for item in resp.json().get(f"activities-{series_key}", []):
                        dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        val = item.get("value")
                        try:
                            val = int(float(val)) if isinstance(val, str) else val
                        except:
                            val = 0
                        series[series_key][dt] = val

                # Fetch standard time series
                fetch_series("steps", "activities/steps")
                fetch_series("floors", "activities/floors")
                fetch_series("distance", "activities/distance")
                fetch_series("calories", "activities/calories")
                fetch_series("minutesVeryActive", "activities/minutesVeryActive")
                fetch_series("minutesFairlyActive", "activities/minutesFairlyActive")
                fetch_series("minutesLightlyActive", "activities/minutesLightlyActive")
                fetch_series("minutesSedentary", "activities/minutesSedentary")

                # ---------------------------
                # HEART RATE SUMMARY
                # ---------------------------
                hr_url = f"{FITBIT_API_URL}/activities/heart/date/{date_range}.json"
                hr_resp = requests.get(hr_url, headers=headers)
                if hr_resp.status_code == 200:
                    for item in hr_resp.json().get("activities-heart", []):
                        dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        val = item.get("value", {})
                        series["resting_heart_rate"][dt] = val.get("restingHeartRate")
                        series["heart_rate_zones"][dt] = val.get("heartRateZones")
                else:
                    logger.warning(f"[HR Summary] {hr_resp.text}")

                # ---------------------------
                # MAX HEART RATE (intraday 1-sec)
                # ---------------------------
                for offset in range(31):
                    d = start_date + datetime.timedelta(days=offset)
                    d_str = d.strftime("%Y-%m-%d")

                    url = f"{FITBIT_API_URL}/activities/heart/date/{d_str}/1d/1sec.json"
                    resp = requests.get(url, headers=headers)

                    if resp.status_code != 200:
                        continue

                    dataset = (
                        resp.json()
                        .get("activities-heart-intraday", {})
                        .get("dataset", [])
                    )
                    if dataset:
                        max_hr_map[d] = max(x.get("value", 0) for x in dataset)

                # ---------------------------
                # ACTIVE ZONE MINUTES
                # ---------------------------
                azm_url = f"{FITBIT_API_URL}/activities/active-zone-minutes/date/{date_range}.json"
                azm_resp = requests.get(azm_url, headers=headers)
                if azm_resp.status_code == 200:
                    for item in azm_resp.json().get("activities-activeZoneMinutes", []):
                        dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        total = (item.get("value") or {}).get("totalMinutes")
                        if total is not None:
                            series["activeZoneMinutes"][dt] = int(total)

                # ---------------------------
                # BREATHING RATE
                # ---------------------------
                br_url = f"{FITBIT_API_URL}/br/date/{date_range}.json"
                br_resp = requests.get(br_url, headers=headers)
                if br_resp.status_code == 200:
                    for item in br_resp.json().get("br", []):
                        dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        breathing_data[dt] = item.get("value")

                # ---------------------------
                # HRV
                # ---------------------------
                hrv_url = f"{FITBIT_API_URL}/hrv/date/{date_range}.json"
                hrv_resp = requests.get(hrv_url, headers=headers)
                if hrv_resp.status_code == 200:
                    for item in hrv_resp.json().get("hrv", []):
                        dt = datetime.datetime.strptime(item["dateTime"], "%Y-%m-%d").date()
                        hrv_data[dt] = item.get("value")

                # ---------------------------
                # SLEEP
                # ---------------------------
                sleep_url = f"{FITBIT_API_URL}/sleep/date/{date_range}.json"
                sleep_resp = requests.get(sleep_url, headers=headers)
                if sleep_resp.status_code == 200:
                    for entry in sleep_resp.json().get("sleep", []):
                        dt = datetime.datetime.strptime(entry["dateOfSleep"], "%Y-%m-%d").date()
                        sleep_data[dt] = SleepData(
                            sleep_duration=entry.get("duration"),
                            sleep_start=entry.get("startTime"),
                            sleep_end=entry.get("endTime"),
                            awakenings=entry.get("awakeningsCount"),
                        )

                # ---------------------------
                # EXERCISE SESSIONS (FULL DETAIL)
                # ---------------------------
                act_url = (
                    f"{FITBIT_API_URL}/activities/list.json?"
                    f"afterDate={start_date}&sort=asc&limit=200&offset=0"
                )
                act_resp = requests.get(act_url, headers=headers)

                if act_resp.status_code == 200:
                    for act in act_resp.json().get("activities", []):
                        dt = datetime.datetime.strptime(
                            act["startTime"].split("T")[0], "%Y-%m-%d"
                        ).date()

                        if not (start_date <= dt <= today):
                            continue

                        # Zones
                        zones = [
                            ActivityHeartRateZone(
                                name=z.get("name"),
                                min=z.get("min"),
                                max=z.get("max"),
                                minutes=z.get("minutes"),
                            )
                            for z in (act.get("heartRateZones") or [])
                        ]

                        # Activity level blocks
                        al = act.get("activityLevel", [])
                        level = ActivityLevel(
                            sedentary=al[0]["minutes"] if len(al) > 0 else 0,
                            lightly=al[1]["minutes"] if len(al) > 1 else 0,
                            fairly=al[2]["minutes"] if len(al) > 2 else 0,
                            very=al[3]["minutes"] if len(al) > 3 else 0,
                        )

                        session = ExerciseSession(
                            logId=act.get("logId"),
                            name=act.get("activityName"),
                            startTime=act.get("startTime"),
                            duration=act.get("duration"),
                            calories=act.get("calories"),
                            averageHeartRate=act.get("averageHeartRate"),
                            maxHeartRate=act.get("peakHeartRate"),
                            steps=act.get("steps"),
                            distance=act.get("distance"),
                            elevationGain=act.get("elevationGain"),
                            speed=act.get("speed"),
                            activeZoneMinutes=(
                                act.get("activeZoneMinutes") or {}
                            ).get("totalMinutes"),
                            heartRateZones=zones,
                            activityLevel=level,
                        )

                        exercise_data.setdefault(dt, []).append(session)

                # ---------------------------
                # AGGREGATE ALL DATES
                # ---------------------------
                all_dates = (
                    set().union(*[set(m.keys()) for m in series.values()])
                    | set(sleep_data.keys())
                    | set(exercise_data.keys())
                    | set(max_hr_map.keys())
                )

                def sleep_minutes(dt):
                    sd = sleep_data.get(dt)
                    if not sd:
                        return 0
                    return int((sd.sleep_duration or 0) / 60000)

                # ---------------------------
                # UPSERT DAY-BY-DAY
                # ---------------------------
                for dt in sorted(all_dates):
                    # Active minutes logic
                    azm = series["activeZoneMinutes"].get(dt)
                    if azm is not None:
                        active_minutes = azm
                    else:
                        va = series["minutesVeryActive"].get(dt, 0) or 0
                        fa = series["minutesFairlyActive"].get(dt, 0) or 0
                        active_minutes = va + fa

                    inactivity = max(0, 1440 - (active_minutes + sleep_minutes(dt)))

                    FitbitData.objects(user=user_token.user, date=dt).update_one(
                        set__steps=series["steps"].get(dt),
                        set__floors=series["floors"].get(dt),
                        set__distance=series["distance"].get(dt),
                        set__calories=series["calories"].get(dt),
                        set__resting_heart_rate=series["resting_heart_rate"].get(dt),
                        set__active_minutes=active_minutes,
                        set__inactivity_minutes=inactivity,
                        set__heart_rate_zones=series["heart_rate_zones"].get(dt),
                        set__max_heart_rate=max_hr_map.get(dt),
                        set__sleep=sleep_data.get(dt),
                        set__breathing_rate=breathing_data.get(dt),
                        set__hrv=hrv_data.get(dt),
                        set__exercise=exercise_data.get(dt, []),
                        upsert=True,
                    )

                logger.info(f"[Fitbit Sync] Completed for {user_token.user}")

            except Exception as e:
                logger.exception(f"[Fitbit Sync] ERROR for {user_token.user}: {e}")
