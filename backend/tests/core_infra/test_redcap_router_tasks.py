from types import SimpleNamespace
from unittest.mock import patch

import pytest

from core.redcap import redcap_export_record
from core.routers import BeatRouter
from core.tasks import (
    backfill_fitbit_on_connect,
    backfill_google_health_on_connect,
    fetch_fitbit_data_async,
    fetch_google_health_data_async,
    run_delete_expired_videos,
    run_fetch_fitbit_data,
    run_fetch_google_health_data_today_all,
    sync_wearables_to_redcap_all,
)


def test_redcap_export_record_success_payload_and_first_record():
    resp = SimpleNamespace(
        raise_for_status=lambda: None,
        json=lambda: [{"record_id": "R1", "gender": "m"}],
    )
    with patch("core.redcap.requests.post", return_value=resp) as mocked:
        out = redcap_export_record("https://rc.example/api/", "TOKEN", "R1", ["record_id", "gender"])

    assert out["record_id"] == "R1"
    kwargs = mocked.call_args.kwargs
    assert kwargs["data"]["token"] == "TOKEN"
    assert kwargs["data"]["records[0]"] == "R1"
    assert kwargs["data"]["fields[0]"] == "record_id"
    assert kwargs["data"]["fields[1]"] == "gender"


def test_redcap_export_record_returns_none_for_empty_data():
    resp = SimpleNamespace(raise_for_status=lambda: None, json=lambda: [])
    with patch("core.redcap.requests.post", return_value=resp):
        out = redcap_export_record("https://rc.example/api/", "TOKEN", "R1", [])
    assert out is None


def test_beat_router_routing_rules():
    router = BeatRouter()
    beat_model = SimpleNamespace(_meta=SimpleNamespace(app_label="django_celery_beat"))
    other_model = SimpleNamespace(_meta=SimpleNamespace(app_label="core"))

    assert router.db_for_read(beat_model) == "beat"
    assert router.db_for_write(beat_model) == "beat"
    assert router.db_for_read(other_model) is None
    assert router.db_for_write(other_model) is None
    assert router.allow_migrate("beat", "django_celery_beat") is True
    assert router.allow_migrate("default", "django_celery_beat") is False
    assert router.allow_migrate("default", "core") is None


def test_tasks_run_delete_and_fetch_success_paths():
    with patch("core.tasks.call_command") as mocked, patch.dict("os.environ", {"ENABLE_MEDIA_AUTO_DELETE": "true"}):
        assert run_delete_expired_videos() == "ok"
        mocked.assert_called_with("delete_expired_videos")

    with patch("core.tasks.call_command") as mocked:
        assert run_fetch_fitbit_data() == "ok"
        mocked.assert_called_with("fetch_fitbit_data")


def test_tasks_run_fetch_fitbit_data_raises_on_failure():
    with patch("core.tasks.call_command", side_effect=RuntimeError("boom")):
        with pytest.raises(RuntimeError):
            run_fetch_fitbit_data()


def test_fetch_fitbit_data_async_calls_sync_when_user_exists():
    fake_qs = SimpleNamespace(first=lambda: "user-doc")
    with (
        patch("core.tasks.User.objects", return_value=fake_qs),
        patch("core.tasks.fetch_fitbit_today_for_user") as mocked,
    ):
        fetch_fitbit_data_async("507f1f77bcf86cd799439011")
    mocked.assert_called_once_with("user-doc", bypass_cooldown=True)


def test_fetch_fitbit_data_async_noop_when_user_missing():
    fake_qs = SimpleNamespace(first=lambda: None)
    with (
        patch("core.tasks.User.objects", return_value=fake_qs),
        patch("core.tasks.fetch_fitbit_today_for_user") as mocked,
    ):
        fetch_fitbit_data_async("507f1f77bcf86cd799439011")
    mocked.assert_not_called()


def test_fetch_google_health_data_async_respects_cooldown_by_default():
    fake_qs = SimpleNamespace(first=lambda: "user-doc")
    with (
        patch("core.tasks.User.objects", return_value=fake_qs),
        patch("core.tasks.fetch_google_health_today_for_user") as mocked,
    ):
        fetch_google_health_data_async("507f1f77bcf86cd799439011")
    mocked.assert_called_once_with("user-doc", bypass_cooldown=False)


def test_fetch_google_health_data_async_passes_bypass_cooldown():
    fake_qs = SimpleNamespace(first=lambda: "user-doc")
    with (
        patch("core.tasks.User.objects", return_value=fake_qs),
        patch("core.tasks.fetch_google_health_today_for_user") as mocked,
    ):
        fetch_google_health_data_async("507f1f77bcf86cd799439011", bypass_cooldown=True)
    mocked.assert_called_once_with("user-doc", bypass_cooldown=True)


def test_fetch_google_health_data_async_ignores_result():
    """Publishing must not subscribe to the Redis result store, or a Redis outage stalls page loads ~20 s."""
    assert fetch_google_health_data_async.ignore_result is True


@pytest.mark.parametrize("task", [backfill_google_health_on_connect, backfill_fitbit_on_connect])
def test_backfill_tasks_sent_from_oauth_callbacks_ignore_result(task):
    """Sent from web requests: storing an unread result would also retry per call when Redis is down."""
    assert task.ignore_result is True


def test_google_health_backfill_stops_when_account_not_linked():
    """A not-linked account would otherwise fail ~13 calls for each of 365 days."""
    from core.views.google_health_sync import GoogleHealthAccountNotLinked

    user = SimpleNamespace(id="u1")
    with (
        patch("core.tasks.User.objects", return_value=SimpleNamespace(first=lambda: user)),
        patch("core.tasks.get_valid_google_access_token", return_value="tok"),
        patch("core.tasks._prefetch_unfiltered", side_effect=GoogleHealthAccountNotLinked),
        patch("core.tasks._sync_day") as sync_day,
        patch("core.tasks.mark_account_not_linked") as mark,
    ):
        backfill_google_health_on_connect("u1")
    sync_day.assert_not_called()
    mark.assert_called_once_with(user)


def test_google_health_backfill_clears_not_linked_without_queueing_itself_again():
    user = SimpleNamespace(id="u1")
    with (
        patch("core.tasks.User.objects", return_value=SimpleNamespace(first=lambda: user)),
        patch("core.tasks.get_valid_google_access_token", return_value="tok"),
        patch("core.tasks._prefetch_unfiltered", return_value={}),
        patch("core.tasks._sync_day", side_effect=[True, False]),
        patch("core.tasks.clear_account_not_linked") as clear,
    ):
        backfill_google_health_on_connect("u1", days=2)
    # backfill=False: the backfill must not queue another copy of itself.
    clear.assert_called_once_with(user, backfill=False)


def test_google_health_today_all_counts_only_users_actually_synced():
    """Users skipped by the cooldown or without data return 0 and must not be reported as synced."""
    tokens = [SimpleNamespace(user=f"user-{i}") for i in range(3)]
    with (
        patch("core.models.GoogleHealthUserToken.objects", return_value=SimpleNamespace(only=lambda *fields: tokens)),
        patch("core.tasks.fetch_google_health_today_for_user", side_effect=[1, 0, Exception("boom")]),
    ):
        result = run_fetch_google_health_data_today_all()
    assert result == {"synced": 1, "errors": 1}


def test_google_health_today_all_reads_all_tokens_before_calling_the_api():
    consumed = []
    consumed_at_fetch = []

    def cursor():
        for i in range(2):
            consumed.append(i)
            yield SimpleNamespace(user=f"user-{i}")

    def fetch(user):
        consumed_at_fetch.append(len(consumed))
        return 1

    with (
        patch("core.models.GoogleHealthUserToken.objects") as objects,
        patch("core.tasks.fetch_google_health_today_for_user", side_effect=fetch),
    ):
        objects.return_value.only.return_value = cursor()
        result = run_fetch_google_health_data_today_all()
    objects.assert_called_once_with(is_revoked__ne=True)
    objects.return_value.only.assert_called_once_with("user")
    assert consumed_at_fetch == [2, 2], "cursor must be exhausted before the slow per-user API calls"
    assert result == {"synced": 2, "errors": 0}


def test_sync_wearables_all_reads_all_patients_before_calling_redcap():
    consumed = []
    consumed_at_export = []

    def cursor():
        for i in range(2):
            consumed.append(i)
            yield SimpleNamespace(project="P1", patient_code=f"PAT-{i}")

    def export(patient, skip_if_populated):
        consumed_at_export.append(len(consumed))
        return {}

    with (
        patch("core.tasks.Patient.objects", return_value=cursor()) as objects,
        patch("core.services.wearables_redcap_service.export_wearables_to_redcap", side_effect=export),
    ):
        result = sync_wearables_to_redcap_all()
    objects.assert_called_once_with(project__ne="")
    assert consumed_at_export == [2, 2], "cursor must be exhausted before the slow per-patient REDCap calls"
    assert result == {"synced": 2, "errors": 0}
