from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import datetime

from core.management.commands.backfill_lightly_active import Command as BackfillCommand
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
                (SimpleNamespace(name="Run Fetch Fitbit Data Today (4h)"), True),
                (SimpleNamespace(name="Run Fetch Google Health Data"), True),
                (SimpleNamespace(name="Run Fetch Google Health Data Today (4h)"), True),
                (SimpleNamespace(name="Send Due Intervention Push Notifications"), True),
                (SimpleNamespace(name="Sync Wearables to REDCap (nightly)"), True),
            ],
        ) as upsert,
    ):
        cmd.handle()

    assert get_sched.call_count == 3  # midnight + every-4h + hourly schedules
    assert upsert.call_count == 7


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
        return_value=[],
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
                payload={
                    "activities-active-zone-minutes": [{"dateTime": "2026-01-01", "value": {"activeZoneMinutes": 25}}]
                }
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
            return_value=[token],
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
            return FakeResp({"activities-active-zone-minutes": []})
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
            return_value=[token],
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
        assert (
            call.kwargs.get("set__wear_time_minutes") == 2
        ), f"Expected set__wear_time_minutes=2 but got {call.kwargs.get('set__wear_time_minutes')}"


# ---------------------------------------------------------------------------
# backfill_lightly_active tests
# ---------------------------------------------------------------------------


def _make_record(date_str, active_minutes=30, sleep_minutes=None, inactivity_minutes=None, record_id="r1"):
    from types import SimpleNamespace

    sleep = SimpleNamespace(minutes_asleep=sleep_minutes) if sleep_minutes is not None else None
    user = SimpleNamespace(id="u1", patient=SimpleNamespace(patient_code="905-01"))
    return SimpleNamespace(
        id=record_id,
        user=user,
        date=datetime.datetime.strptime(date_str, "%Y-%m-%d").date(),
        active_minutes=active_minutes,
        sleep=sleep,
        inactivity_minutes=inactivity_minutes,
    )


def _api_resp(date_str, value):
    from unittest.mock import MagicMock

    m = MagicMock()
    m.status_code = 200
    m.json.return_value = {"activities-minutesLightlyActive": [{"dateTime": date_str, "value": str(value)}]}
    return m


def _make_qs(records):
    """Return a queryset-like mock backed by the given records list."""
    from unittest.mock import MagicMock

    qs = MagicMock()
    qs.count.return_value = len(records)
    qs.only.return_value = records
    return qs


def _fitbitdata_objects_side_effect(qs_mock, updater):
    """
    FitbitData.objects is called two ways:
      1. FitbitData.objects(lightly_active_minutes=None)  → return the queryset mock
      2. FitbitData.objects(id=…).update_one(…)           → return a mock with update_one
    """

    def _side_effect(*args, **kwargs):
        if "lightly_active_minutes" in kwargs:
            return qs_mock
        return type("R", (), {"update_one": updater})()

    return _side_effect


def test_backfill_no_records_exits_cleanly():
    """Nothing to do → exits without touching the API."""
    from unittest.mock import MagicMock, patch

    qs = _make_qs([])
    with patch(
        "core.management.commands.backfill_lightly_active.FitbitData.objects",
        side_effect=_fitbitdata_objects_side_effect(qs, MagicMock()),
    ):
        BackfillCommand().handle(dry_run=False, patient=None)


def test_backfill_writes_correct_values():
    """active=30, sleep=420, lightly_active=60 → inactivity=930."""
    from unittest.mock import MagicMock, patch

    record = _make_record("2026-01-01", active_minutes=30, sleep_minutes=420, inactivity_minutes=1000)
    qs = _make_qs([record])
    updater = MagicMock()

    with (
        patch(
            "core.management.commands.backfill_lightly_active.FitbitData.objects",
            side_effect=_fitbitdata_objects_side_effect(qs, updater),
        ),
        patch("core.views.fitbit_sync.get_valid_access_token", return_value="tok"),
        patch(
            "core.management.commands.backfill_lightly_active.requests.get",
            return_value=_api_resp("2026-01-01", 60),
        ),
    ):
        BackfillCommand().handle(dry_run=False, patient=None)

    updater.assert_called_once_with(set__lightly_active_minutes=60, set__inactivity_minutes=930)


def test_backfill_dry_run_does_not_write():
    """--dry-run must never call update_one."""
    from unittest.mock import MagicMock, patch

    record = _make_record("2026-01-10", active_minutes=20, sleep_minutes=360, inactivity_minutes=900)
    qs = _make_qs([record])
    updater = MagicMock()

    with (
        patch(
            "core.management.commands.backfill_lightly_active.FitbitData.objects",
            side_effect=_fitbitdata_objects_side_effect(qs, updater),
        ),
        patch("core.views.fitbit_sync.get_valid_access_token", return_value="tok"),
        patch(
            "core.management.commands.backfill_lightly_active.requests.get",
            return_value=_api_resp("2026-01-10", 45),
        ),
    ):
        BackfillCommand().handle(dry_run=True, patient=None)

    updater.assert_not_called()


def test_backfill_skips_user_on_token_error():
    """Token failure → user counted as error, no DB write."""
    from unittest.mock import MagicMock, patch

    qs = _make_qs([_make_record("2026-02-01", active_minutes=10, sleep_minutes=480)])
    updater = MagicMock()

    with (
        patch(
            "core.management.commands.backfill_lightly_active.FitbitData.objects",
            side_effect=_fitbitdata_objects_side_effect(qs, updater),
        ),
        patch("core.views.fitbit_sync.get_valid_access_token", side_effect=Exception("revoked")),
    ):
        BackfillCommand().handle(dry_run=False, patient=None)

    updater.assert_not_called()


def test_backfill_no_sleep_uses_zero():
    """sleep=None → sleep_min defaults to 0; inactivity = 1440-30-50-0 = 1360."""
    from unittest.mock import MagicMock, patch

    record = _make_record("2026-03-01", active_minutes=30, sleep_minutes=None, inactivity_minutes=1410)
    qs = _make_qs([record])
    updater = MagicMock()

    with (
        patch(
            "core.management.commands.backfill_lightly_active.FitbitData.objects",
            side_effect=_fitbitdata_objects_side_effect(qs, updater),
        ),
        patch("core.views.fitbit_sync.get_valid_access_token", return_value="tok"),
        patch(
            "core.management.commands.backfill_lightly_active.requests.get",
            return_value=_api_resp("2026-03-01", 50),
        ),
    ):
        BackfillCommand().handle(dry_run=False, patient=None)

    updater.assert_called_once_with(set__lightly_active_minutes=50, set__inactivity_minutes=1360)


def test_backfill_skips_record_when_api_has_no_matching_date():
    """API returns data for a different date → record left untouched."""
    from unittest.mock import MagicMock, patch

    wrong_date_resp = MagicMock()
    wrong_date_resp.status_code = 200
    wrong_date_resp.json.return_value = {"activities-minutesLightlyActive": [{"dateTime": "2026-04-02", "value": "30"}]}

    qs = _make_qs([_make_record("2026-04-01", active_minutes=20, sleep_minutes=300)])
    updater = MagicMock()

    with (
        patch(
            "core.management.commands.backfill_lightly_active.FitbitData.objects",
            side_effect=_fitbitdata_objects_side_effect(qs, updater),
        ),
        patch("core.views.fitbit_sync.get_valid_access_token", return_value="tok"),
        patch(
            "core.management.commands.backfill_lightly_active.requests.get",
            return_value=wrong_date_resp,
        ),
    ):
        BackfillCommand().handle(dry_run=False, patient=None)

    updater.assert_not_called()
