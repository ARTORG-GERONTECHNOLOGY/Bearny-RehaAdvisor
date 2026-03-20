from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from core.management.commands.fetch_fitbit_data import Command as FetchFitbitCommand
from core.management.commands.seed_periodic_tasks import Command as SeedPeriodicTasksCommand
from core.management.commands.set_celerybeat_every_minute import Command as SetBeatEveryMinuteCommand


def test_seed_periodic_tasks_creates_or_updates_tasks():
    cmd = SeedPeriodicTasksCommand()
    with (
        patch(
            "core.management.commands.seed_periodic_tasks.CrontabSchedule.objects.get_or_create",
            return_value=("sched", True),
        ) as get_sched,
        patch(
            "core.management.commands.seed_periodic_tasks.PeriodicTask.objects.update_or_create",
            side_effect=[
                (SimpleNamespace(name="Run Delete Expired Videos"), True),
                (SimpleNamespace(name="Run Fetch Fitbit Data"), False),
            ],
        ) as upsert,
    ):
        cmd.handle()

    get_sched.assert_called_once()
    assert upsert.call_count == 2


def test_set_celerybeat_every_minute_updates_expected_tasks():
    cmd = SetBeatEveryMinuteCommand()
    t1 = SimpleNamespace(name="Run Delete Expired Videos", crontab=None, enabled=False, crontab_id="c1")
    t1.save = MagicMock()
    t2 = SimpleNamespace(name="Run Fetch Fitbit Data", crontab=None, enabled=False, crontab_id="c2")
    t2.save = MagicMock()

    with (
        patch(
            "core.management.commands.set_celerybeat_every_minute.CrontabSchedule.objects.get_or_create",
            return_value=("sched", True),
        ) as get_sched,
        patch(
            "core.management.commands.set_celerybeat_every_minute.PeriodicTask.objects.get",
            side_effect=[t1, t2],
        ) as get_task,
    ):
        cmd.handle()

    get_sched.assert_called_once()
    assert get_task.call_count == 2
    t1.save.assert_called_once()
    t2.save.assert_called_once()
    assert t1.enabled is True and t2.enabled is True


def test_fetch_fitbit_command_no_users_exits_cleanly():
    cmd = FetchFitbitCommand()
    with patch(
        "core.management.commands.fetch_fitbit_data.FitbitUserToken.objects",
        new=SimpleNamespace(all=lambda: []),
    ):
        cmd.handle()


def test_fetch_fitbit_command_single_user_happy_path_with_mocks():
    cmd = FetchFitbitCommand()
    token = SimpleNamespace(user="u1")

    class FakeResp:
        def __init__(self, status_code=200, payload=None, text=""):
            self.status_code = status_code
            self._payload = payload or {}
            self.text = text

        def json(self):
            return self._payload

    def fake_get(url, headers=None):
        if "activities/list.json" in url:
            return FakeResp(
                payload={
                    "activities": [
                        {
                            "startTime": "2026-01-01T10:00:00.000",
                            "logId": 1,
                            "activityName": "Walk",
                            "duration": 1800000,
                            "calories": 100,
                            "averageHeartRate": 110,
                            "peakHeartRate": 130,
                            "steps": 2000,
                            "distance": 1.5,
                            "elevationGain": 0,
                            "speed": 3.0,
                            "activeZoneMinutes": {"totalMinutes": 20},
                            "heartRateZones": [
                                {
                                    "name": "Fat Burn",
                                    "min": 100,
                                    "max": 130,
                                    "minutes": 20,
                                }
                            ],
                            "activityLevel": [
                                {"minutes": 10},
                                {"minutes": 20},
                                {"minutes": 30},
                                {"minutes": 40},
                            ],
                        }
                    ]
                }
            )
        if "/1d/1sec.json" in url:
            return FakeResp(payload={"activities-heart-intraday": {"dataset": [{"value": 120}, {"value": 140}]}})
        if "activities/active-zone-minutes" in url:
            return FakeResp(
                payload={"activities-activeZoneMinutes": [{"dateTime": "2026-01-01", "value": {"totalMinutes": 25}}]}
            )
        if "/br/date/" in url:
            return FakeResp(payload={"br": [{"dateTime": "2026-01-01", "value": {"breathingRate": 14}}]})
        if "/hrv/date/" in url:
            return FakeResp(payload={"hrv": [{"dateTime": "2026-01-01", "value": {"dailyRmssd": 35}}]})
        if "/sleep/date/" in url:
            return FakeResp(
                payload={
                    "sleep": [
                        {
                            "dateOfSleep": "2026-01-01",
                            "duration": 3600000,
                            "startTime": "2026-01-01T23:00:00.000",
                            "endTime": "2026-01-02T06:00:00.000",
                            "awakeningsCount": 1,
                        }
                    ]
                }
            )
        if "activities/heart/date/" in url:
            return FakeResp(
                payload={
                    "activities-heart": [
                        {
                            "dateTime": "2026-01-01",
                            "value": {
                                "restingHeartRate": 60,
                                "heartRateZones": [
                                    {
                                        "name": "Fat Burn",
                                        "minutes": 20,
                                        "min": 100,
                                        "max": 130,
                                    }
                                ],
                            },
                        }
                    ]
                }
            )

        # generic activities time-series responses
        key = url.split("/activities/")[1].split("/date/")[0]
        field = f"activities-{key}"
        return FakeResp(payload={field: [{"dateTime": "2026-01-01", "value": "10"}]})

    updater = MagicMock()
    objects_mock = MagicMock(return_value=SimpleNamespace(update_one=updater))

    with (
        patch(
            "core.management.commands.fetch_fitbit_data.FitbitUserToken.objects",
            new=SimpleNamespace(all=lambda: [token]),
        ),
        patch(
            "core.management.commands.fetch_fitbit_data.get_valid_access_token",
            return_value="access",
        ),
        patch("core.management.commands.fetch_fitbit_data.requests.get", side_effect=fake_get) as mocked_get,
        patch("core.management.commands.fetch_fitbit_data.FitbitData.objects", objects_mock),
    ):
        cmd.handle()

    assert mocked_get.call_count > 5


def test_fetch_fitbit_command_wear_time_calculated_during_periodic_sync():
    """
    Verify that wear_time_minutes is correctly derived from intraday HR data
    and passed to FitbitData.update_one during the periodic management command.

    Intraday dataset:
      10:05:00 HR=72, 10:05:30 HR=75  → minute slot "10:05" (HR > 0)
      10:06:00 HR=68                   → minute slot "10:06" (HR > 0)
      10:07:00 HR=0                    → not worn — excluded
    Expected wear_time_minutes = 2 (two distinct worn-minute slots).
    """
    cmd = FetchFitbitCommand()
    token = SimpleNamespace(user="u1")

    intraday_dataset = [
        {"time": "10:05:00", "value": 72},
        {"time": "10:05:30", "value": 75},
        {"time": "10:06:00", "value": 68},
        {"time": "10:07:00", "value": 0},  # not worn
    ]

    class FakeResp:
        def __init__(self, payload=None):
            self.status_code = 200
            self._payload = payload or {}
            self.text = "ok"

        def json(self):
            return self._payload

    def fake_get(url, headers=None):
        if "/1d/1sec.json" in url:
            return FakeResp({"activities-heart-intraday": {"dataset": intraday_dataset}})
        if "activities/list.json" in url:
            return FakeResp({"activities": []})
        if "/br/date/" in url:
            return FakeResp({"br": []})
        if "/hrv/date/" in url:
            return FakeResp({"hrv": []})
        if "/sleep/date/" in url:
            return FakeResp({"sleep": []})
        if "activities/heart/date/" in url:
            return FakeResp({"activities-heart": []})
        if "active-zone-minutes" in url:
            return FakeResp({"activities-activeZoneMinutes": []})
        # generic time-series (steps, floors, distance, calories, minutesVeryActive, …)
        if "/activities/" in url:
            key = url.split("/activities/")[1].split("/date/")[0]
            return FakeResp({f"activities-{key}": []})
        return FakeResp({})

    updater = MagicMock()
    objects_mock = MagicMock(return_value=SimpleNamespace(update_one=updater))

    with (
        patch(
            "core.management.commands.fetch_fitbit_data.FitbitUserToken.objects",
            new=SimpleNamespace(all=lambda: [token]),
        ),
        patch(
            "core.management.commands.fetch_fitbit_data.get_valid_access_token",
            return_value="access",
        ),
        patch("core.management.commands.fetch_fitbit_data.requests.get", side_effect=fake_get),
        patch("core.management.commands.fetch_fitbit_data.FitbitData.objects", objects_mock),
    ):
        cmd.handle()

    # update_one must have been called for every day that has intraday data (31 days)
    assert updater.call_count == 31

    # Every call must carry set__wear_time_minutes=2 (10:05 and 10:06 are the two worn slots)
    for call in updater.call_args_list:
        assert call.kwargs.get("set__wear_time_minutes") == 2, (
            f"Expected set__wear_time_minutes=2 but got {call.kwargs.get('set__wear_time_minutes')}"
        )
