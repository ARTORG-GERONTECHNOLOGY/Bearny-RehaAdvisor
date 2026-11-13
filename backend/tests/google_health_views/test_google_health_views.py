"""
Google Health views tests
=========================

Endpoints covered
-----------------
- GET  /api/google-health/status/<patient_id>/
- GET  /api/google-health/callback/

Also covers the sync-layer helpers:
- get_valid_google_access_token  (invalid_grant → is_revoked)
- fetch_google_health_today_for_user  (15-minute cooldown, bypass_cooldown)
- queue_google_health_today_sync      (summary queues the sync in Celery)

Status endpoint contract
------------------------
google_health_status returns:
  connected          bool   — True iff token exists and is not revoked
  needs_reconnect    bool   — always False in production (testing-mode 7-day
                              constraint removed after Google approved production access)
  days_until_expiry  null   — always null; production tokens do not expire
"""

import json
import time as _time
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import mongomock
import pytest
from bson import ObjectId
from django.test import Client
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

# Kept before the autouse fixture replaces it, so the probe itself can be tested.
from core.views.google_health_sync import _google_answers as _real_google_answers
from core.views.google_health_view import _OAUTH_NONCE_TTL
from core.views.google_health_view import _probe_hr_scope as _real_probe_hr_scope
from core.views.google_health_view import _probe_sleep_scope as _real_probe_sleep_scope

client = Client()
factory = APIRequestFactory()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    from mongoengine import connect, disconnect
    from mongoengine.connection import _connections

    alias = "default"
    if alias in _connections:
        disconnect(alias)

    conn = connect(
        "mongoenginetest",
        alias=alias,
        host="mongodb://localhost",
        mongo_client_class=mongomock.MongoClient,
    )
    yield conn
    disconnect(alias)


@pytest.fixture(autouse=True)
def no_live_scope_probes():
    # Tests that exercise the probes patch them explicitly; everything else must stay offline.
    with (
        patch("core.views.google_health_view._probe_hr_scope", return_value=None),
        patch("core.views.google_health_view._probe_sleep_scope", return_value=None),
    ):
        yield


@pytest.fixture(autouse=True)
def no_queued_backfills():
    # Clearing the not-linked flag queues a backfill and may check Google; keep both offline.
    with (
        patch("core.tasks.backfill_google_health_on_connect.delay"),
        patch("core.views.google_health_sync._google_answers", return_value=False),
    ):
        yield


def _make_user():
    from core.models import User

    return User(
        username=f"pt-{ObjectId()}",
        email=f"pt-{ObjectId()}@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()


def _make_token(user, connected_at=None, is_revoked=False):
    from core.models import GoogleHealthUserToken

    return GoogleHealthUserToken(
        user=user,
        access_token="access",
        refresh_token="refresh",
        expires_at=timezone.now() + timedelta(hours=1),
        connected_at=connected_at,
        is_revoked=is_revoked,
    ).save()


def _make_patient(user, wearable_device="google_health"):
    from core.models import Patient, Therapist, User

    th_user = User(
        username=f"th-{ObjectId()}",
        email=f"th-{ObjectId()}@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, clinics=["Inselspital"], projects=["COPAIN"]).save()
    return Patient(userId=user, patient_code=f"P-{ObjectId()}", therapist=th, wearable_device=wearable_device).save()


def _status_as(patient_id):
    """Call google_health_status directly, bypassing JWT middleware."""
    from core.views.google_health_view import google_health_status

    req = factory.get(f"/api/google-health/status/{patient_id}/")
    req.user = SimpleNamespace(is_authenticated=True, id=str(patient_id))
    return google_health_status(req, patient_id=str(patient_id))


# ---------------------------------------------------------------------------
# google_health_status — connection state
# ---------------------------------------------------------------------------


def test_status_no_token_returns_not_connected():
    user = _make_user()
    resp = _status_as(user.id)
    body = json.loads(resp.content)
    assert body["connected"] is False
    assert body["needs_reconnect"] is False
    assert body["days_until_expiry"] is None


def test_status_with_fresh_token_connected_no_reconnect():
    user = _make_user()
    _make_token(user, connected_at=timezone.now())
    body = json.loads(_status_as(user.id).content)
    assert body["connected"] is True
    assert body["needs_reconnect"] is False
    assert body["days_until_expiry"] is None


def test_status_token_3_days_old_still_connected():
    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=3))
    body = json.loads(_status_as(user.id).content)
    assert body["connected"] is True
    assert body["needs_reconnect"] is False
    assert body["days_until_expiry"] is None


def test_status_token_6_days_old_still_connected():
    # Production tokens do not expire after 7 days — no reconnect needed.
    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=6))
    body = json.loads(_status_as(user.id).content)
    assert body["connected"] is True
    assert body["needs_reconnect"] is False
    assert body["days_until_expiry"] is None


def test_status_token_7_days_old_still_connected():
    # Production tokens do not expire after 7 days — no reconnect needed.
    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=7))
    body = json.loads(_status_as(user.id).content)
    assert body["connected"] is True
    assert body["needs_reconnect"] is False
    assert body["days_until_expiry"] is None


def test_status_token_8_days_old_still_connected():
    # Production tokens do not expire after 7 days — no reconnect needed.
    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=8))
    body = json.loads(_status_as(user.id).content)
    assert body["connected"] is True
    assert body["needs_reconnect"] is False
    assert body["days_until_expiry"] is None


def test_status_revoked_token_returns_not_connected():
    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=1), is_revoked=True)
    body = json.loads(_status_as(user.id).content)
    assert body["connected"] is False
    assert body["needs_reconnect"] is False


def test_status_token_without_connected_at_no_reconnect():
    """Existing tokens created before connected_at was added must not trigger the banner."""
    user = _make_user()
    _make_token(user, connected_at=None)
    body = json.loads(_status_as(user.id).content)
    assert body["connected"] is True
    assert body["needs_reconnect"] is False
    assert body["days_until_expiry"] is None


def test_status_unresolved_identifier_returns_403():
    # Same answer as an inaccessible patient, so ids can't be probed for existence.
    assert _status_as("not-a-valid-id").status_code == 403


def test_status_includes_wearable_device_field():
    user = _make_user()
    _make_token(user, connected_at=timezone.now())
    body = json.loads(_status_as(user.id).content)
    assert "wearable_device" in body


# ---------------------------------------------------------------------------
# google_health_status — no_data_ever field
# ---------------------------------------------------------------------------


def test_status_no_data_ever_true_when_connected_and_no_data():
    """Connected past the grace period with zero GoogleHealthData rows → no_data_ever=True."""
    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=2))
    body = json.loads(_status_as(user.id).content)
    assert body["no_data_ever"] is True


@patch("core.views.google_health_view._probe_hr_scope")
@patch("core.views.google_health_view._probe_sleep_scope")
def test_status_no_data_ever_false_within_grace_period(mock_sleep, mock_hr):
    """Just connected: the backfill may not have run yet, so no banner and no probes."""
    user = _make_user()
    _make_patient(user)
    _make_token(user, connected_at=timezone.now() - timedelta(hours=1))
    body = json.loads(_status_as(user.id).content)
    assert body["no_data_ever"] is False
    mock_hr.assert_not_called()
    mock_sleep.assert_not_called()


def test_status_no_data_ever_true_for_legacy_token_without_connected_at():
    user = _make_user()
    _make_token(user, connected_at=None)
    body = json.loads(_status_as(user.id).content)
    assert body["no_data_ever"] is True


def test_status_no_data_ever_false_when_data_exists():
    """A row with steps means the device syncs, so no_data_ever=False even past the grace period."""
    from core.models import GoogleHealthData

    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=2))
    GoogleHealthData(user=user, date=timezone.now(), steps=1000).save()
    body = json.loads(_status_as(user.id).content)
    assert body["no_data_ever"] is False


def test_status_no_data_ever_true_when_rows_have_no_steps():
    """Calories-only rows (resting burn) don't prove the device syncs → still no_data_ever=True."""
    from core.models import GoogleHealthData

    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=2))
    GoogleHealthData(user=user, date=timezone.now(), calories=1600.0).save()
    body = json.loads(_status_as(user.id).content)
    assert body["no_data_ever"] is True


def test_status_no_data_ever_false_when_only_sleep_rows_exist():
    """Patients who don't walk can sync sleep without steps; that still counts as a syncing device."""
    from core.models import GoogleHealthData, SleepData

    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=2))
    GoogleHealthData(user=user, date=timezone.now(), sleep=SleepData(minutes_asleep=420)).save()
    body = json.loads(_status_as(user.id).content)
    assert body["no_data_ever"] is False


def test_status_no_data_ever_false_when_only_active_minutes_exist():
    """Workouts without steps (e.g. wheelchair users) still count as a syncing device."""
    from core.models import GoogleHealthData

    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=2))
    GoogleHealthData(user=user, date=timezone.now(), calories=1600.0, active_minutes=25).save()
    body = json.loads(_status_as(user.id).content)
    assert body["no_data_ever"] is False


# ---------------------------------------------------------------------------
# google_health_status — device_stopped_syncing field
# ---------------------------------------------------------------------------


def _device_row(user, days_ago, **fields):
    from core.models import GoogleHealthData

    day = datetime.combine(timezone.localdate() - timedelta(days=days_ago), datetime.min.time())
    return GoogleHealthData(user=user, date=day, **fields).save()


@pytest.mark.parametrize(
    "days_ago, stopped",
    [(0, False), (2, False), (3, True), (10, True)],
)
def test_status_device_stopped_syncing_after_three_days(days_ago, stopped):
    user = _make_user()
    _make_patient(user)
    _make_token(user, connected_at=timezone.now() - timedelta(days=30))
    _device_row(user, days_ago, steps=4000)
    body = json.loads(_status_as(user.id).content)
    assert body["days_since_device_data"] == days_ago
    assert body["device_stopped_syncing"] is stopped


def test_status_device_stopped_syncing_counts_sleep_only_days():
    """Patients who don't walk still sync sleep; that keeps the banner away."""
    from core.models import SleepData

    user = _make_user()
    _make_patient(user)
    _make_token(user, connected_at=timezone.now() - timedelta(days=30))
    _device_row(user, 6, steps=4000)
    _device_row(user, 1, sleep=SleepData(minutes_asleep=420))
    body = json.loads(_status_as(user.id).content)
    assert body["device_stopped_syncing"] is False


@pytest.mark.parametrize("case", ["no_data", "other_device", "not_linked", "not_connected", "just_reconnected"])
def test_status_device_stopped_syncing_false_when_another_state_applies(case):
    from core.models import GoogleHealthUserToken

    user = _make_user()
    _make_patient(user, wearable_device="fitbit" if case == "other_device" else "google_health")
    # A fresh reconnect gets the grace period: the backfill may not have written recent days yet.
    connected_ago = timedelta(hours=1) if case == "just_reconnected" else timedelta(days=30)
    token = _make_token(user, connected_at=timezone.now() - connected_ago, is_revoked=case == "not_connected")
    if case == "not_linked":
        GoogleHealthUserToken.objects(id=token.id).update_one(set__sync_error="not_linked")
    if case != "no_data":
        _device_row(user, 10, steps=4000)
    body = json.loads(_status_as(user.id).content)
    assert body["device_stopped_syncing"] is False


@patch("core.views.google_health_view.get_valid_google_access_token", return_value="tok")
@patch("core.views.google_health_view._probe_hr_scope")
def test_status_device_stopped_syncing_false_when_probe_finds_account_not_linked(mock_hr, mock_token):
    from core.views.google_health_sync import GoogleHealthAccountNotLinked

    mock_hr.side_effect = GoogleHealthAccountNotLinked()
    user = _make_user()
    _make_patient(user)
    _make_token(user, connected_at=timezone.now() - timedelta(days=30))
    _device_row(user, 10, steps=4000)  # no wear time, so the status probes the HR scope
    body = json.loads(_status_as(user.id).content)
    assert body["account_not_linked"] is True
    assert body["device_stopped_syncing"] is False


@patch("core.views.google_health_view._probe_hr_scope")
@patch("core.views.google_health_view._probe_sleep_scope")
def test_status_skips_probes_for_patient_on_another_device(mock_sleep, mock_hr):
    """An old Google token on a Fitbit patient must not cost Google calls on every status request."""
    user = _make_user()
    _make_patient(user, wearable_device="fitbit")
    _make_token(user, connected_at=timezone.now() - timedelta(days=2))
    body = json.loads(_status_as(user.id).content)
    mock_hr.assert_not_called()
    mock_sleep.assert_not_called()
    assert body["hr_scope_ok"] is None


@patch("core.views.google_health_view._probe_hr_scope", return_value=True)
@patch("core.views.google_health_view._probe_sleep_scope")
@patch("core.views.google_health_view.get_valid_google_access_token", return_value="tok")
def test_status_flags_hr_data_missing_when_steps_sync_without_hr(mock_token, mock_sleep, mock_hr):
    """Steps and sleep sync, HR scope is granted, but no wear time → Fitbit isn't writing HR (hr_data_missing)."""
    from core.models import GoogleHealthData, SleepData

    user = _make_user()
    _make_patient(user)
    _make_token(user, connected_at=timezone.now() - timedelta(days=2))
    GoogleHealthData(user=user, date=timezone.now(), steps=3000, sleep=SleepData(minutes_asleep=420)).save()
    body = json.loads(_status_as(user.id).content)
    assert body["hr_scope_ok"] is True
    assert body["hr_data_missing"] is True
    assert body["sleep_scope_ok"] is True
    assert body["no_data_ever"] is False
    mock_sleep.assert_not_called()


@patch("core.views.google_health_view.requests.post")
def test_probe_hr_scope_sends_civil_dates(mock_post):
    """Plain ISO date strings made Google answer every probe with 400 in production."""
    import datetime as _dt

    mock_post.return_value = MagicMock(status_code=200)
    assert _real_probe_hr_scope("tok") is True

    today = _dt.date.today()
    yesterday = today - _dt.timedelta(days=1)
    body = mock_post.call_args.kwargs["json"]
    assert body["range"]["start"] == {"date": {"year": yesterday.year, "month": yesterday.month, "day": yesterday.day}}
    assert body["range"]["end"] == {"date": {"year": today.year, "month": today.month, "day": today.day}}


@pytest.mark.parametrize("status, expected", [(403, False), (401, False), (400, None), (500, None)])
@patch("core.views.google_health_view.requests.post")
def test_probe_hr_scope_maps_status_codes(mock_post, status, expected):
    mock_post.return_value = MagicMock(status_code=status, text="")
    assert _real_probe_hr_scope("tok") is expected


_NOT_LINKED = """{
  "error": {
    "code": 400,
    "message": "The account is not linked to Google Health.",
    "status": "FAILED_PRECONDITION"
  }
}"""


_OTHER_400 = """{
  "error": {
    "code": 400,
    "message": "Request contains an invalid argument.",
    "status": "INVALID_ARGUMENT"
  }
}"""


# Full body as documented at https://developers.google.com/health/troubleshooting.
_NOT_LINKED_WITH_REASON = json.dumps(
    {
        "error": {
            "code": 400,
            "message": "The account is not linked to Google Health.",
            "status": "FAILED_PRECONDITION",
            "details": [
                {
                    "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                    "reason": "ACCOUNT_NOT_LINKED",
                    "domain": "health.googleapis.com",
                    "metadata": {"redirect_uri": "https://fitbit.google.com/auth/signup"},
                }
            ],
        }
    }
)
# Still detected if Google rewords the message.
_REASON_ONLY = json.dumps(
    {
        "error": {
            "code": 400,
            "message": "Reworded.",
            "status": "FAILED_PRECONDITION",
            "details": [{"reason": "ACCOUNT_NOT_LINKED"}],
        }
    }
)


def _google_error(body):
    return MagicMock(status_code=400, text=body, json=lambda: json.loads(body))


@patch("core.views.google_health_view.requests.get")
@patch("core.views.google_health_view.requests.post")
def test_probes_log_googles_reason_on_one_line(mock_post, mock_get, caplog):
    """Google's reason must reach the log so unexpected probe failures can be told apart."""
    mock_post.return_value = _google_error(_OTHER_400)
    mock_get.return_value = _google_error(_OTHER_400)
    with caplog.at_level("WARNING", logger="core.views.google_health_view"):
        assert _real_probe_hr_scope("tok") is None
        assert _real_probe_sleep_scope("tok") is None
    lines = [r.getMessage() for r in caplog.records]
    assert any("probing hr scope" in m and "invalid argument" in m for m in lines)
    assert any("probing sleep scope" in m and "invalid argument" in m for m in lines)
    assert all("\n" not in m for m in lines)


@patch("core.views.google_health_view.requests.get")
@patch("core.views.google_health_view.requests.post")
def test_probes_raise_when_account_not_linked(mock_post, mock_get):
    from core.views.google_health_sync import GoogleHealthAccountNotLinked

    mock_post.return_value = _google_error(_NOT_LINKED)
    mock_get.return_value = _google_error(_NOT_LINKED)
    with pytest.raises(GoogleHealthAccountNotLinked):
        _real_probe_hr_scope("tok")
    with pytest.raises(GoogleHealthAccountNotLinked):
        _real_probe_sleep_scope("tok")


@pytest.mark.parametrize(
    "resp, expected",
    [
        (_google_error(_NOT_LINKED), True),
        (_google_error(_NOT_LINKED_WITH_REASON), True),
        (_google_error(_REASON_ONLY), True),
        (_google_error(_OTHER_400), False),
        (MagicMock(status_code=403, json=lambda: json.loads(_NOT_LINKED)), False),
        (MagicMock(status_code=400, json=MagicMock(side_effect=ValueError)), False),
        (MagicMock(status_code=400, json=lambda: {"error": "invalid_request"}), False),
    ],
)
def test_is_not_linked_response(resp, expected):
    from core.views.google_health_sync import is_not_linked_response

    assert is_not_linked_response(resp) is expected


def test_not_linked_error_has_a_readable_message():
    """Generic error handlers (e.g. backfill_gh_sleep) print str(exc), which must not be empty."""
    from core.views.google_health_sync import GoogleHealthAccountNotLinked

    assert str(GoogleHealthAccountNotLinked()) == "account is not linked to Google Health"


@patch("core.views.google_health_sync.requests.post")
def test_daily_rollup_raises_when_account_not_linked(mock_post):
    import datetime as _dt

    from core.views.google_health_sync import GoogleHealthAccountNotLinked, _daily_rollup

    mock_post.return_value = _google_error(_NOT_LINKED)
    with pytest.raises(GoogleHealthAccountNotLinked):
        _daily_rollup("tok", "steps", _dt.date.today())


@patch("core.views.google_health_sync.requests.get")
def test_list_points_raises_when_account_not_linked(mock_get):
    from core.views.google_health_sync import GoogleHealthAccountNotLinked, _list_points

    mock_get.return_value = _google_error(_NOT_LINKED)
    with pytest.raises(GoogleHealthAccountNotLinked):
        _list_points("tok", "sleep")


@patch("core.views.google_health_sync.requests.post")
def test_sync_day_stops_after_first_not_linked_call(mock_post):
    """One failed call is enough; the other ~12 data types would fail the same way."""
    import datetime as _dt

    from core.views.google_health_sync import GoogleHealthAccountNotLinked, _sync_day

    mock_post.return_value = _google_error(_NOT_LINKED)
    with pytest.raises(GoogleHealthAccountNotLinked):
        _sync_day(_make_user(), "tok", _dt.date.today())
    assert mock_post.call_count == 1


@patch("core.views.google_health_sync._list_points", return_value=[])
@patch("core.views.google_health_sync._daily_rollup")
def test_sync_day_leaves_the_flag_to_the_caller(mock_rollup, mock_list):
    """Backfills write old days one by one; the caller clears the flag once per run."""
    import datetime as _dt

    from core.models import GoogleHealthUserToken
    from core.views.google_health_sync import _sync_day

    mock_rollup.side_effect = lambda tok, data_type, d: {"steps": {"countSum": "1200"}} if data_type == "steps" else {}
    user = _make_user()
    token = _flagged_token(user)

    assert _sync_day(user, "tok", _dt.date.today()) is True
    assert GoogleHealthUserToken.objects.get(id=token.id).sync_error == "not_linked"


def _flagged_token(user):
    from core.models import GoogleHealthUserToken

    token = _make_token(user, connected_at=timezone.now() - timedelta(days=2))
    GoogleHealthUserToken.objects(id=token.id).update_one(set__sync_error="not_linked")
    return GoogleHealthUserToken.objects.get(id=token.id)  # connected_at as stored (ms precision)


@patch("core.views.google_health_view.get_valid_google_access_token")
@patch("core.views.google_health_view._probe_hr_scope")
@patch("core.views.google_health_view._probe_sleep_scope")
def test_status_reports_not_linked_without_calling_google(mock_sleep, mock_hr, mock_token):
    """Status requests only read the flag; the sync clears it once data arrives."""
    from core.models import GoogleHealthUserToken

    user = _make_user()
    _make_patient(user)
    token = _flagged_token(user)
    body = json.loads(_status_as(user.id).content)
    assert body["connected"] is True
    assert body["account_not_linked"] is True
    mock_token.assert_not_called()
    mock_hr.assert_not_called()
    mock_sleep.assert_not_called()
    assert GoogleHealthUserToken.objects.get(id=token.id).sync_error == "not_linked"


@pytest.mark.parametrize("backfill", [True, False])
@patch("core.tasks.backfill_google_health_on_connect.delay")
def test_clear_not_linked_queues_one_backfill(mock_backfill, backfill):
    """Only the call that clears the flag queues it, so concurrent clears can't start two 365-day backfills."""
    from core.views.google_health_sync import clear_account_not_linked

    user = _make_user()
    _flagged_token(user)
    assert clear_account_not_linked(user, backfill=backfill) is True
    assert clear_account_not_linked(user, backfill=backfill) is False
    assert mock_backfill.call_count == (1 if backfill else 0)


@patch("core.tasks.backfill_google_health_on_connect.delay", side_effect=Exception("redis down"))
def test_clear_not_linked_survives_a_queue_failure(mock_backfill, caplog):
    from core.models import GoogleHealthUserToken
    from core.views.google_health_sync import clear_account_not_linked

    user = _make_user()
    token = _flagged_token(user)
    assert clear_account_not_linked(user) is True
    assert GoogleHealthUserToken.objects.get(id=token.id).sync_error is None
    assert any("could not queue backfill" in r.getMessage() for r in caplog.records)


@patch("core.tasks.backfill_google_health_on_connect.delay")
@patch("core.views.google_health_sync._sync_day", return_value=True)
@patch("core.views.google_health_sync.get_valid_google_access_token", return_value="access")
def test_today_sync_that_clears_not_linked_queues_the_backfill(mock_token, mock_sync, mock_backfill):
    """History older than the nightly 30-day resync would otherwise never arrive."""
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, _ = _token_fetched_minutes_ago(60 * 25, sync_error="not_linked")
    assert fetch_google_health_today_for_user(user) == 1
    mock_backfill.assert_called_once_with(str(user.id))


def test_status_account_not_linked_false_by_default():
    user = _make_user()
    _make_patient(user)
    _make_token(user, connected_at=timezone.now() - timedelta(hours=1))
    assert json.loads(_status_as(user.id).content)["account_not_linked"] is False


@patch("core.views.google_health_view._probe_sleep_scope")
@patch("core.views.google_health_view.get_valid_google_access_token", return_value="tok")
def test_status_probe_flags_not_linked_account(mock_token, mock_sleep):
    """Patients who open the page before the next sync still see the banner right away."""
    from core.models import GoogleHealthUserToken
    from core.views.google_health_sync import GoogleHealthAccountNotLinked

    user = _make_user()
    _make_patient(user)
    _make_token(user, connected_at=timezone.now() - timedelta(days=2))
    with patch("core.views.google_health_view._probe_hr_scope", side_effect=GoogleHealthAccountNotLinked):
        body = json.loads(_status_as(user.id).content)
    assert body["account_not_linked"] is True
    assert body["hr_scope_ok"] is None
    assert body["sleep_scope_ok"] is None
    assert GoogleHealthUserToken.objects.get(user=user).sync_error == "not_linked"


def test_status_no_data_ever_false_when_not_connected():
    """Not connected (no token) → no_data_ever=False (not applicable)."""
    user = _make_user()
    body = json.loads(_status_as(user.id).content)
    assert body["no_data_ever"] is False


@patch("core.views.google_health_view._probe_hr_scope", return_value=True)
@patch("core.views.google_health_view._probe_sleep_scope", return_value=True)
@patch("core.views.google_health_view.get_valid_google_access_token", return_value="tok")
def test_status_probes_scopes_when_no_data_ever(mock_token, mock_sleep, mock_hr):
    """When connected but no data, scope probes run to distinguish missing scope from device issue."""
    user = _make_user()
    _make_patient(user)
    _make_token(user, connected_at=timezone.now() - timedelta(days=2))
    body = json.loads(_status_as(user.id).content)
    assert body["no_data_ever"] is True
    assert body["hr_scope_ok"] is True
    assert body["sleep_scope_ok"] is True
    mock_hr.assert_called_once()
    mock_sleep.assert_called_once()


@patch("core.views.google_health_view._probe_hr_scope", return_value=False)
@patch("core.views.google_health_view._probe_sleep_scope", return_value=True)
@patch("core.views.google_health_view.get_valid_google_access_token", return_value="tok")
def test_status_no_data_reports_missing_hr_scope(mock_token, mock_sleep, mock_hr):
    """When no data and HR scope missing (403), hr_scope_ok=False."""
    user = _make_user()
    _make_patient(user)
    _make_token(user, connected_at=timezone.now() - timedelta(days=2))
    body = json.loads(_status_as(user.id).content)
    assert body["no_data_ever"] is True
    assert body["hr_scope_ok"] is False


# ---------------------------------------------------------------------------
# google_health_callback — connected_at and is_revoked reset
# ---------------------------------------------------------------------------


def _mock_redis_for_nonce(nonce, patient_id):
    """Return a mock Redis client that validates a pre-stored nonce."""
    mock_rc = MagicMock()
    mock_rc.get.return_value = str(patient_id).encode()
    mock_rc.delete.return_value = 1
    return mock_rc


@patch("core.tasks.backfill_google_health_on_connect.delay")
@patch("core.tasks.fetch_google_health_data_async.apply_async")
@patch("core.views.google_health_view.requests.post")
@patch("core.views.google_health_view._get_redis_client")
def test_callback_sets_connected_at_on_success(mock_redis, mock_post, mock_today_apply_async, mock_backfill_delay):
    from core.models import GoogleHealthUserToken, User

    user = User(
        username=f"cb-{ObjectId()}",
        email=f"cb-{ObjectId()}@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    nonce = "testnonce123"
    mock_redis.return_value = _mock_redis_for_nonce(nonce, user.id)
    mock_post.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "access_token": "new_access",
            "refresh_token": "new_refresh",
            "expires_in": 3600,
            "sub": "google-sub-123",
        },
    )

    resp = client.get(f"/api/google-health/callback/?code=testcode&state={nonce}:{user.id}")
    assert resp.status_code == 302

    token = GoogleHealthUserToken.objects(user=user).first()
    assert token is not None
    assert token.connected_at is not None
    assert token.is_revoked is False
    # A fresh connection syncs today straight away, ignoring any cooldown left from an earlier connection.
    mock_today_apply_async.assert_called_once_with(args=(str(user.id),), kwargs={"bypass_cooldown": True}, retry=False)


@patch("core.views.google_health_view.requests.post")
@patch("core.views.google_health_view._get_redis_client")
def test_callback_clears_is_revoked_on_reconnect(mock_redis, mock_post):
    from core.models import GoogleHealthUserToken, User

    user = User(
        username=f"rc-{ObjectId()}",
        email=f"rc-{ObjectId()}@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    # Pre-existing revoked token
    GoogleHealthUserToken(
        user=user,
        access_token="old",
        refresh_token="old_refresh",
        expires_at=timezone.now(),
        sync_error="not_linked",
        is_revoked=True,
        revoked_at=timezone.now() - timedelta(days=1),
        connected_at=timezone.now() - timedelta(days=8),
    ).save()

    nonce = "testnonce456"
    mock_redis.return_value = _mock_redis_for_nonce(nonce, user.id)
    mock_post.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "access_token": "new_access",
            "refresh_token": "new_refresh",
            "expires_in": 3600,
            "sub": "google-sub-456",
        },
    )

    client.get(f"/api/google-health/callback/?code=testcode&state={nonce}:{user.id}")

    token = GoogleHealthUserToken.objects(user=user).first()
    assert token.is_revoked is False
    assert token.revoked_at is None
    assert token.sync_error is None
    assert token.connected_at is not None


@pytest.mark.parametrize("set_fails", [False, True])
@patch("core.tasks.backfill_google_health_on_connect.delay")
@patch("core.tasks.fetch_google_health_data_async.apply_async")
@patch("core.views.google_health_view.requests.post")
@patch("core.views.google_health_view._get_redis_client")
def test_callback_records_completed_nonce(
    mock_redis, mock_post, mock_today_apply_async, mock_backfill_delay, set_fails
):
    from core.models import User

    user = User(
        username=f"nd-{ObjectId()}",
        email=f"nd-{ObjectId()}@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    rc = _mock_redis_for_nonce("donenonce", user.id)
    if set_fails:
        rc.set.side_effect = ConnectionError("redis down")
    mock_redis.return_value = rc
    mock_post.return_value = MagicMock(
        status_code=200,
        json=lambda: {"access_token": "a", "refresh_token": "r", "expires_in": 3600},
    )

    resp = client.get(f"/api/google-health/callback/?code=testcode&state=donenonce:{user.id}")

    # A failed write must not turn a successful connect into an error.
    assert "google_health_status=connected" in resp["Location"]
    rc.set.assert_called_once_with("oauth_nonce_done:donenonce", str(user.id), ex=_OAUTH_NONCE_TTL)


@patch("core.tasks.backfill_google_health_on_connect.delay")
@patch("core.tasks.fetch_google_health_data_async.apply_async")
@patch("core.views.google_health_view.requests.post")
@patch("core.views.google_health_view._get_redis_client")
def test_callback_reload_after_success_shows_connected(
    mock_redis, mock_post, mock_today_apply_async, mock_backfill_delay
):
    from core.models import User

    user = User(
        username=f"rl-{ObjectId()}",
        email=f"rl-{ObjectId()}@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    store = {"oauth_nonce:reloadnonce": str(user.id).encode()}
    rc = MagicMock()
    rc.get.side_effect = store.get
    rc.set.side_effect = lambda key, value, ex=None: store.__setitem__(key, value.encode())
    rc.delete.side_effect = lambda key: store.pop(key, None)
    mock_redis.return_value = rc
    mock_post.return_value = MagicMock(
        status_code=200,
        json=lambda: {"access_token": "a", "refresh_token": "r", "expires_in": 3600},
    )
    url = f"/api/google-health/callback/?code=testcode&state=reloadnonce:{user.id}"

    first = client.get(url)
    second = client.get(url)

    assert "google_health_status=connected" in first["Location"]
    assert "google_health_status=connected" in second["Location"]
    assert mock_post.call_count == 1  # the reload doesn't reuse the Google code


@pytest.mark.parametrize(
    "marker, expected_status",
    [
        ("none", "unauthorized"),  # nonce expired or never issued
        ("other_patient", "unauthorized"),
        ("same_patient", "connected"),  # repeat of a sign-in that succeeded
    ],
)
@patch("core.views.google_health_view.requests.post")
@patch("core.views.google_health_view._get_redis_client")
def test_callback_with_used_nonce(mock_redis, mock_post, marker, expected_status):
    patient_id = str(ObjectId())
    done = {"none": None, "other_patient": str(ObjectId()).encode(), "same_patient": patient_id.encode()}
    stored = {
        "oauth_nonce:usednonce": None,
        "oauth_nonce_done:usednonce": done[marker],
    }
    rc = MagicMock()
    rc.get.side_effect = stored.get
    mock_redis.return_value = rc

    resp = client.get(f"/api/google-health/callback/?code=testcode&state=usednonce:{patient_id}")

    assert resp.status_code == 302
    assert f"google_health_status={expected_status}" in resp["Location"]
    mock_post.assert_not_called()


# ---------------------------------------------------------------------------
# get_valid_google_access_token — invalid_grant marks token revoked
# ---------------------------------------------------------------------------


@patch("core.views.google_health_sync.requests.post")
def test_invalid_grant_marks_token_revoked(mock_post):
    from core.models import GoogleHealthUserToken, User
    from core.views.google_health_sync import get_valid_google_access_token

    user = User(
        username=f"ig-{ObjectId()}",
        email=f"ig-{ObjectId()}@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    # Token already expired so refresh is triggered
    GoogleHealthUserToken(
        user=user,
        access_token="expired",
        refresh_token="old_refresh",
        expires_at=timezone.now() - timedelta(hours=2),
        connected_at=timezone.now() - timedelta(days=8),
        is_revoked=False,
    ).save()

    mock_post.return_value = MagicMock(
        status_code=400,
        text='{"error":"invalid_grant","error_description":"Token has been expired or revoked."}',
    )

    with pytest.raises(Exception, match="Failed to refresh"):
        get_valid_google_access_token(user)

    token = GoogleHealthUserToken.objects(user=user).first()
    assert token.is_revoked is True
    assert token.revoked_at is not None


@patch("core.views.google_health_sync.requests.post")
def test_non_invalid_grant_error_does_not_revoke(mock_post):
    from core.models import GoogleHealthUserToken, User
    from core.views.google_health_sync import get_valid_google_access_token

    user = User(
        username=f"ne-{ObjectId()}",
        email=f"ne-{ObjectId()}@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    GoogleHealthUserToken(
        user=user,
        access_token="expired",
        refresh_token="old_refresh",
        expires_at=timezone.now() - timedelta(hours=2),
        connected_at=timezone.now() - timedelta(days=1),
        is_revoked=False,
    ).save()

    mock_post.return_value = MagicMock(
        status_code=500,
        text='{"error":"internal_server_error"}',
    )

    with pytest.raises(Exception):
        get_valid_google_access_token(user)

    token = GoogleHealthUserToken.objects(user=user).first()
    assert token.is_revoked is False


@patch("core.views.google_health_sync.requests.post")
def test_valid_token_not_expired_skips_refresh(mock_post):
    from core.models import GoogleHealthUserToken, User
    from core.views.google_health_sync import get_valid_google_access_token

    user = User(
        username=f"vt-{ObjectId()}",
        email=f"vt-{ObjectId()}@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    # Use a naive datetime far enough in the future that even after make_aware
    # conversion it is still ahead of now() — mongomock strips tzinfo on write.
    far_future = datetime.utcnow() + timedelta(hours=24)
    GoogleHealthUserToken(
        user=user,
        access_token="still_valid",
        refresh_token="refresh",
        expires_at=far_future,
        connected_at=datetime.utcnow(),
        is_revoked=False,
    ).save()

    result = get_valid_google_access_token(user)
    mock_post.assert_not_called()
    assert result == "still_valid"


# ---------------------------------------------------------------------------
# fetch_google_health_today_for_user — 15-minute cooldown
# ---------------------------------------------------------------------------


def _token_fetched_minutes_ago(minutes, sync_error=None):
    user = _make_user()
    token = _make_token(user)
    token.sync_error = sync_error
    if minutes is not None:
        # Naive UTC, as MongoDB returns it.
        token.last_fetched_at = datetime.utcnow() - timedelta(minutes=minutes)
    token.save()
    return user, token


@patch("core.views.google_health_sync._sync_day", return_value=True)
@patch("core.views.google_health_sync.get_valid_google_access_token", return_value="access")
def test_today_sync_skipped_within_cooldown(mock_token, mock_sync):
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, _ = _token_fetched_minutes_ago(5)

    assert fetch_google_health_today_for_user(user) == 0
    mock_token.assert_not_called()
    mock_sync.assert_not_called()


@patch("core.views.google_health_sync._sync_day", return_value=True)
@patch("core.views.google_health_sync.get_valid_google_access_token", return_value="access")
def test_today_sync_runs_after_cooldown_and_restamps(mock_token, mock_sync):
    from core.models import GoogleHealthUserToken
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, token = _token_fetched_minutes_ago(20)
    before = token.last_fetched_at

    assert fetch_google_health_today_for_user(user) == 1
    mock_sync.assert_called_once()
    assert GoogleHealthUserToken.objects.get(id=token.id).last_fetched_at > before


@patch("core.views.google_health_sync._sync_day", return_value=False)
@patch("core.views.google_health_sync.get_valid_google_access_token", return_value="access")
def test_today_sync_first_run_stamps_even_without_data(mock_token, mock_sync):
    from core.models import GoogleHealthUserToken
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, token = _token_fetched_minutes_ago(None)

    assert fetch_google_health_today_for_user(user) == 0
    mock_sync.assert_called_once()
    assert GoogleHealthUserToken.objects.get(id=token.id).last_fetched_at is not None


@patch("core.views.google_health_sync._sync_day", return_value=True)
@patch("core.views.google_health_sync.get_valid_google_access_token", side_effect=Exception("refresh failed"))
def test_today_sync_token_failure_does_not_stamp(mock_token, mock_sync):
    from core.models import GoogleHealthUserToken
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, token = _token_fetched_minutes_ago(None)

    assert fetch_google_health_today_for_user(user) == 0
    mock_sync.assert_not_called()
    assert GoogleHealthUserToken.objects.get(id=token.id).last_fetched_at is None


@patch("core.views.google_health_sync._sync_day", return_value=True)
@patch("core.views.google_health_sync.get_valid_google_access_token", side_effect=Exception("refresh failed"))
def test_today_sync_token_failure_restores_previous_stamp(mock_token, mock_sync):
    from core.models import GoogleHealthUserToken
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, token = _token_fetched_minutes_ago(20)
    before = GoogleHealthUserToken.objects.get(id=token.id).last_fetched_at  # stored value, ms precision

    assert fetch_google_health_today_for_user(user) == 0
    assert GoogleHealthUserToken.objects.get(id=token.id).last_fetched_at == before


@patch("core.views.google_health_sync._sync_day", return_value=True)
def test_today_sync_concurrent_request_skips_while_first_is_running(mock_sync):
    """Three summary requests arrive together on page load; only the first may hit Google."""
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, _ = _token_fetched_minutes_ago(None)
    concurrent_results = []

    def token_while_second_request_arrives(u):
        concurrent_results.append(fetch_google_health_today_for_user(u))
        return "access"

    with patch(
        "core.views.google_health_sync.get_valid_google_access_token",
        side_effect=token_while_second_request_arrives,
    ):
        assert fetch_google_health_today_for_user(user) == 1

    assert concurrent_results == [0]
    mock_sync.assert_called_once()


@patch("core.views.google_health_sync._sync_day", return_value=True)
@patch("core.views.google_health_sync.get_valid_google_access_token", return_value="access")
def test_today_sync_bypass_cooldown_ignores_recent_sync(mock_token, mock_sync):
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, _ = _token_fetched_minutes_ago(5)

    assert fetch_google_health_today_for_user(user, bypass_cooldown=True) == 1
    mock_sync.assert_called_once()


@patch("core.views.google_health_sync._sync_day")
@patch("core.views.google_health_sync.get_valid_google_access_token", return_value="access")
def test_today_sync_flags_not_linked_account(mock_token, mock_sync):
    from core.models import GoogleHealthUserToken
    from core.views.google_health_sync import GoogleHealthAccountNotLinked, fetch_google_health_today_for_user

    mock_sync.side_effect = GoogleHealthAccountNotLinked
    user, token = _token_fetched_minutes_ago(None)

    assert fetch_google_health_today_for_user(user) == 0
    stored = GoogleHealthUserToken.objects.get(id=token.id)
    assert stored.sync_error == "not_linked"
    assert stored.last_fetched_at is not None  # keeps the stamp, so the normal cooldown applies


@patch("core.views.google_health_sync._sync_day", return_value=False)
@patch("core.views.google_health_sync.get_valid_google_access_token", return_value="access")
def test_today_sync_keeps_not_linked_when_google_does_not_answer(mock_token, mock_sync):
    """No row can also mean a Google outage; without a real 200 the flag stays."""
    from core.models import GoogleHealthUserToken
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, token = _token_fetched_minutes_ago(60 * 25, sync_error="not_linked")

    with patch("core.views.google_health_sync._google_answers", return_value=False) as answers:
        assert fetch_google_health_today_for_user(user) == 0
    mock_sync.assert_called_once()
    answers.assert_called_once_with("access")
    assert GoogleHealthUserToken.objects.get(id=token.id).sync_error == "not_linked"


@patch("core.views.google_health_sync._sync_day", return_value=False)
@patch("core.views.google_health_sync.get_valid_google_access_token", return_value="access")
def test_today_sync_clears_not_linked_when_google_answers_without_data(mock_token, mock_sync):
    """A newly linked account may have no data yet; a 200 still proves the link."""
    from core.models import GoogleHealthUserToken
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, token = _token_fetched_minutes_ago(60 * 25, sync_error="not_linked")

    with patch("core.views.google_health_sync._google_answers", return_value=True):
        assert fetch_google_health_today_for_user(user) == 0
    assert GoogleHealthUserToken.objects.get(id=token.id).sync_error is None


@patch("core.views.google_health_sync._sync_day")
@patch("core.views.google_health_sync.get_valid_google_access_token", return_value="access")
def test_today_sync_clears_a_flag_set_while_it_was_running(mock_token, mock_sync):
    """Written data proves the link, even if another path flagged the account mid-sync."""
    from core.models import GoogleHealthUserToken
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, token = _token_fetched_minutes_ago(60 * 25)

    def flagged_meanwhile(*args, **kwargs):
        GoogleHealthUserToken.objects(id=token.id).update_one(set__sync_error="not_linked")
        return True

    mock_sync.side_effect = flagged_meanwhile
    assert fetch_google_health_today_for_user(user) == 1
    assert GoogleHealthUserToken.objects.get(id=token.id).sync_error is None


@patch("core.views.google_health_sync._sync_day", return_value=False)
@patch("core.views.google_health_sync.get_valid_google_access_token", return_value="access")
def test_today_sync_skips_the_extra_check_for_unflagged_accounts(mock_token, mock_sync):
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, _ = _token_fetched_minutes_ago(60 * 25)
    with patch("core.views.google_health_sync._google_answers") as answers:
        fetch_google_health_today_for_user(user)
    answers.assert_not_called()


@pytest.mark.parametrize("status, expected", [(200, True), (400, False), (503, False)])
@patch("core.views.google_health_sync.requests.post")
def test_google_answers_needs_a_real_200(mock_post, status, expected):
    mock_post.return_value = MagicMock(status_code=status)
    assert _real_google_answers("tok") is expected


@patch("core.tasks.backfill_google_health_on_connect.delay")
@patch("core.views.google_health_sync._sync_day", return_value=True)
@patch("core.views.google_health_sync.get_valid_google_access_token", return_value="access")
def test_today_sync_clears_not_linked_once_data_is_written(mock_token, mock_sync, mock_backfill):
    """Any written row, even calories only, proves Google accepts the account."""
    from core.models import GoogleHealthUserToken
    from core.views.google_health_sync import fetch_google_health_today_for_user

    user, token = _token_fetched_minutes_ago(60 * 25, sync_error="not_linked")

    assert fetch_google_health_today_for_user(user) == 1
    assert GoogleHealthUserToken.objects.get(id=token.id).sync_error is None


# ---------------------------------------------------------------------------
# _fetch_sleep — aggregation tests
# ---------------------------------------------------------------------------


def _make_sleep_point(start_iso: str, end_iso: str, minutes_asleep: int, awakenings: int = 0) -> dict:
    """Build a minimal Google Health API sleep dataPoint dict."""
    return {
        "sleep": {
            "interval": {"startTime": start_iso, "endTime": end_iso},
            "summary": {"minutesAsleep": minutes_asleep, "awakenings": awakenings},
        }
    }


@patch("core.views.google_health_sync.requests.get")
def test_fetch_sleep_sums_multiple_sessions(mock_get):
    """Two sleep sessions for one night must be summed, not just the longest taken."""
    import datetime

    from core.views.google_health_sync import _fetch_sleep

    # Session A: 4h 19min in bed, 230 min actually asleep
    pt_a = _make_sleep_point(
        "2026-08-12T23:00:00Z",
        "2026-08-13T03:19:00Z",
        minutes_asleep=230,
        awakenings=2,
    )
    # Session B: 2h 52min in bed, 165 min actually asleep
    pt_b = _make_sleep_point(
        "2026-08-13T03:45:00Z",
        "2026-08-13T06:37:00Z",
        minutes_asleep=165,
        awakenings=1,
    )

    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {"dataPoints": [pt_a, pt_b]},
    )

    result = _fetch_sleep("fake_token", datetime.date(2026, 8, 13))

    assert result is not None
    # sleep_duration: (4h19m + 2h52m) in ms = (259 + 172) * 60_000 = 25_860_000
    assert result["sleep_duration"] == 25_860_000
    # minutes_asleep: 230 + 165 = 395  (≈ 6h 35min)
    assert result["minutes_asleep"] == 395
    assert result["awakenings"] == 3
    # sleep_start is the earliest, sleep_end is the latest
    assert "2026-08-12T23:00:00" in result["sleep_start"]
    assert "2026-08-13T06:37:00" in result["sleep_end"]


@patch("core.views.google_health_sync.requests.get")
def test_fetch_sleep_single_session(mock_get):
    """Single session still works correctly after the aggregation refactor."""
    import datetime

    from core.views.google_health_sync import _fetch_sleep

    pt = _make_sleep_point(
        "2026-08-12T22:30:00Z",
        "2026-08-13T06:30:00Z",
        minutes_asleep=450,
        awakenings=1,
    )
    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {"dataPoints": [pt]},
    )

    result = _fetch_sleep("fake_token", datetime.date(2026, 8, 13))

    assert result is not None
    assert result["sleep_duration"] == 8 * 3_600_000  # 8h in ms
    assert result["minutes_asleep"] == 450
    assert result["awakenings"] == 1


@patch("core.views.google_health_sync.requests.get")
def test_fetch_sleep_no_points_returns_none(mock_get):
    import datetime

    from core.views.google_health_sync import _fetch_sleep

    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {"dataPoints": []},
    )

    assert _fetch_sleep("fake_token", datetime.date(2026, 8, 13)) is None


# ---------------------------------------------------------------------------
# _aggregate_sleep — stagesSummary fallback tests
# (fixtures derived from real inflated production records for patients 901-34 / 901-28)
# ---------------------------------------------------------------------------


def _make_sleep_point_with_stages(start_iso: str, end_iso: str, stages: list) -> dict:
    """Sleep dataPoint WITHOUT minutesAsleep — uses stagesSummary instead."""
    return {
        "sleep": {
            "interval": {"startTime": start_iso, "endTime": end_iso},
            "summary": {"stagesSummary": stages},
        }
    }


def test_aggregate_sleep_uses_stages_when_minutes_asleep_absent():
    """
    When minutesAsleep is absent but stagesSummary is present, actual sleep =
    total_time − AWAKE_minutes.

    Uses the real live API field name "minutes" (confirmed by live inspection of 901-34
    Sep 25 2026 response). The legacy "minutesInStage" field name is also supported.
    """
    from core.views.google_health_sync import _aggregate_sleep

    # Real field name from live API: "minutes" (not "minutesInStage")
    # 901-34 Sep 25 real API payload: AWAKE=112 min; bed=542 min → sleep=430 min.
    # Note: API now also returns minutesAsleep=542 for this night, so this test
    # exercises the fallback by deliberately omitting minutesAsleep.
    point = _make_sleep_point_with_stages(
        "2026-09-24T21:18:00Z",
        "2026-09-25T06:20:00Z",  # 542 min total (real prod interval)
        stages=[
            {"type": "AWAKE", "minutes": "112", "count": "10"},
            {"type": "LIGHT", "minutes": "336", "count": "18"},
            {"type": "DEEP", "minutes": "25", "count": "4"},
            {"type": "REM", "minutes": "69", "count": "9"},
        ],
    )
    result = _aggregate_sleep([point])
    assert result is not None
    assert result["sleep_duration"] == 542 * 60_000
    assert result["minutes_asleep"] == 430  # 542 − 112 AWAKE
    assert result["minutes_asleep"] != result["sleep_duration"] // 60_000


def test_aggregate_sleep_uses_stages_legacy_minutesInStage_field():
    """
    The legacy "minutesInStage" field name (used in older API responses and test
    mocks) is still supported as a fallback alongside the live "minutes" field.
    """
    from core.views.google_health_sync import _aggregate_sleep

    point = _make_sleep_point_with_stages(
        "2026-09-24T21:00:00Z",
        "2026-09-25T06:02:00Z",  # 542 min total
        stages=[
            {"type": "LIGHT", "count": "8", "minutesInStage": "210"},
            {"type": "DEEP", "count": "3", "minutesInStage": "122"},
            {"type": "REM", "count": "4", "minutesInStage": "100"},
            {"type": "AWAKE", "count": "5", "minutesInStage": "110"},
        ],
    )
    result = _aggregate_sleep([point])
    assert result is not None
    assert result["minutes_asleep"] == 432  # 542 − 110
    assert result["minutes_asleep"] != result["sleep_duration"] // 60_000


def test_aggregate_sleep_falls_back_when_no_stages():
    """
    Without minutesAsleep or stagesSummary, fall back to time-in-bed.
    This preserves the existing behaviour for records that truly have no stage data.
    """
    from core.views.google_health_sync import _aggregate_sleep

    point = {
        "sleep": {
            "interval": {
                "startTime": "2026-09-24T22:00:00Z",
                "endTime": "2026-09-25T06:00:00Z",
            },
            "summary": {},
        }
    }
    result = _aggregate_sleep([point])
    assert result is not None
    assert result["minutes_asleep"] == 480  # 8 h fallback — same as time-in-bed


def test_aggregate_sleep_prefers_minutes_asleep_over_stages():
    """
    minutesAsleep wins even when stagesSummary is also present.

    Modelled on patient 901-34 Sep 30 2026 (correct record in prod):
      sleep_duration = 486 min, minutes_asleep = 303 (API returned the field directly).
    """
    from core.views.google_health_sync import _aggregate_sleep

    point = {
        "sleep": {
            "interval": {
                "startTime": "2026-09-29T22:00:00Z",
                "endTime": "2026-09-30T06:06:00Z",  # 486 min
            },
            "summary": {
                "minutesAsleep": "303",
                "stagesSummary": [
                    {"type": "AWAKE", "count": "3", "minutes": "183"},
                    {"type": "LIGHT", "count": "6", "minutes": "303"},
                ],
            },
        }
    }
    result = _aggregate_sleep([point])
    assert result["minutes_asleep"] == 303  # API field wins, not 486−183


def test_sleep_minutes_prefers_minutes_asleep():
    """_sleep_minutes() in google_health_view must use minutes_asleep, not sleep_duration."""
    from types import SimpleNamespace

    from core.views.google_health_view import _sleep_minutes

    entry = SimpleNamespace(
        sleep=SimpleNamespace(
            minutes_asleep=395,  # actual sleep ≈ 6h 35min
            sleep_duration=25_860_000,  # time in bed ≈ 7h 11min
        )
    )
    assert _sleep_minutes(entry) == 395


def test_sleep_minutes_falls_back_to_duration_when_no_minutes_asleep():
    from types import SimpleNamespace

    from core.views.google_health_view import _sleep_minutes

    entry = SimpleNamespace(
        sleep=SimpleNamespace(
            minutes_asleep=None,
            sleep_duration=25_860_000,  # 7h 11min in ms
        )
    )
    assert _sleep_minutes(entry) == 431  # round(25_860_000 / 60_000)


# ---------------------------------------------------------------------------
# queue_google_health_today_sync — summary syncs in Celery, not in the request
# ---------------------------------------------------------------------------


@patch("core.views.google_health_view.queue_google_health_today_sync")
def test_summary_queues_today_sync_instead_of_syncing_inline(mock_queue):
    from core.models import Patient, Therapist, User

    th_user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, clinics=["Inselspital"], projects=["COPAIN"]).save()
    patient_user = _make_user()
    patient = Patient(userId=patient_user, patient_code=f"P-{ObjectId()}", therapist=th).save()

    # Patch both names: an inline sync would call it via the sync module or via a name imported into the view.
    with (
        patch("core.views.google_health_sync.fetch_google_health_today_for_user") as mock_sync,
        patch("core.views.google_health_view.fetch_google_health_today_for_user", create=True) as mock_view_sync,
    ):
        resp = Client().get(f"/api/google-health/summary/{patient.id}/?days=7", HTTP_AUTHORIZATION="Bearer test")

    assert resp.status_code == 200
    mock_queue.assert_called_once()
    assert mock_queue.call_args.args[0].id == patient_user.id
    mock_sync.assert_not_called()
    mock_view_sync.assert_not_called()


@patch("core.tasks.fetch_google_health_data_async.apply_async")
def test_queue_today_sync_respects_cooldown(mock_apply_async):
    """The summary path must not pass bypass_cooldown; only the connect callback does."""
    from core.views.google_health_sync import queue_google_health_today_sync

    user = _make_user()
    _make_token(user)
    queue_google_health_today_sync(user)

    mock_apply_async.assert_called_once_with(args=(str(user.id),), kwargs={"bypass_cooldown": False}, retry=False)


@patch("core.tasks.fetch_google_health_data_async.apply_async", side_effect=Exception("broker down"))
def test_queue_today_sync_broker_error_does_not_break_summary(mock_apply_async):
    from core.views.google_health_sync import queue_google_health_today_sync

    user = _make_user()
    _make_token(user)
    queue_google_health_today_sync(user)  # must not raise

    mock_apply_async.assert_called_once()


@pytest.mark.parametrize("state", ["no_token", "revoked", "synced_recently"])
@patch("core.tasks.fetch_google_health_data_async.apply_async")
def test_queue_today_sync_skips_when_the_task_could_only_skip(mock_apply_async, state):
    """Page loads must not publish a no-op task (and touch Redis) for every summary request."""
    from core.views.google_health_sync import queue_google_health_today_sync

    user = _make_user()
    if state == "revoked":
        _make_token(user, is_revoked=True)
    elif state == "synced_recently":
        token = _make_token(user)
        token.last_fetched_at = timezone.now() - timedelta(minutes=5)
        token.save()

    queue_google_health_today_sync(user)

    mock_apply_async.assert_not_called()


@patch("core.tasks.fetch_google_health_data_async.apply_async")
def test_queue_today_sync_queues_once_the_cooldown_has_passed(mock_apply_async):
    from core.views.google_health_sync import queue_google_health_today_sync

    user = _make_user()
    token = _make_token(user)
    token.last_fetched_at = timezone.now() - timedelta(minutes=20)
    token.save()

    queue_google_health_today_sync(user)

    mock_apply_async.assert_called_once()


@patch("core.tasks.fetch_google_health_data_async.apply_async")
def test_queue_today_sync_on_connect_ignores_the_cooldown(mock_apply_async):
    from core.views.google_health_sync import queue_google_health_today_sync

    user = _make_user()
    token = _make_token(user)
    token.last_fetched_at = timezone.now() - timedelta(minutes=5)
    token.save()

    queue_google_health_today_sync(user, bypass_cooldown=True)

    mock_apply_async.assert_called_once_with(args=(str(user.id),), kwargs={"bypass_cooldown": True}, retry=False)


# ---------------------------------------------------------------------------
# google_health_summary — "today" resolution
# ---------------------------------------------------------------------------


@patch("core.views.google_health_view.queue_google_health_today_sync")
def test_summary_today_ignores_future_dated_manual_entry(mock_fetch):
    """A manually-entered steps count for a future date must not leak into "today"."""
    from core.models import GoogleHealthData, Patient, Therapist, User

    client = Client()

    th_user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, clinics=["Inselspital"], projects=["COPAIN"]).save()
    patient_user = _make_user()
    patient = Patient(userId=patient_user, patient_code=f"P-{ObjectId()}", therapist=th).save()

    now = timezone.now()
    GoogleHealthData(user=patient_user, date=now, steps=1000).save()
    GoogleHealthData(user=patient_user, date=now + timedelta(days=2), steps=9999).save()

    resp = client.get(f"/api/google-health/summary/{patient.id}/?days=7", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["today"]["steps"] == 1000


@patch("core.views.google_health_view.queue_google_health_today_sync")
def test_summary_today_does_not_fall_back_to_past_dated_entry(mock_fetch):
    """When there's no record for today, a past-dated (e.g. manually backfilled)
    entry must not be shown as if it were today's data."""
    from core.models import GoogleHealthData, Patient, Therapist, User

    client = Client()

    th_user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, clinics=["Inselspital"], projects=["COPAIN"]).save()
    patient_user = _make_user()
    patient = Patient(userId=patient_user, patient_code=f"P-{ObjectId()}", therapist=th).save()

    now = timezone.now()
    yesterday = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    GoogleHealthData(user=patient_user, date=yesterday, steps=4321).save()

    resp = client.get(f"/api/google-health/summary/{patient.id}/?days=7", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["today"] is None


@patch("core.views.google_health_view.queue_google_health_today_sync")
def test_summary_today_shows_manual_vitals_when_no_device_data_yet(mock_fetch):
    """A patient who has only logged weight/BP manually today (no device sync
    yet) must still see those values under "today", not a null payload."""
    from core.models import Patient, PatientVitals, Therapist, User

    client = Client()

    th_user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, clinics=["Inselspital"], projects=["COPAIN"]).save()
    patient_user = _make_user()
    patient = Patient(userId=patient_user, patient_code=f"P-{ObjectId()}", therapist=th).save()

    now = timezone.now()
    PatientVitals(patientId=patient, user=patient_user, date=now, bp_sys=118, bp_dia=76, weight_kg=70.5).save()

    resp = client.get(f"/api/google-health/summary/{patient.id}/?days=7", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["today"] is not None
    assert body["today"]["bp_sys"] == 118
    assert body["today"]["bp_dia"] == 76
    assert body["today"]["weight_kg"] == 70.5
    assert body["today"]["steps"] == 0


@pytest.fixture
def process_on_zurich_time(monkeypatch):
    """Run the process on Zurich time like CI and prod; a POSIX rule needs no zoneinfo files."""
    monkeypatch.setenv("TZ", "CET-1CEST,M3.5.0,M10.5.0/3")
    _time.tzset()
    yield
    monkeypatch.undo()
    _time.tzset()


@patch("core.views.google_health_view.timezone.now")
@patch("core.views.google_health_view.queue_google_health_today_sync")
def test_summary_today_shows_vitals_logged_just_after_local_midnight(mock_fetch, mock_now, process_on_zurich_time):
    """Vitals logged at 00:30 Zurich (23:30 UTC the day before) belong to the new local day."""
    from core.models import Patient, PatientVitals, Therapist, User

    # Set before saving — model saves also call timezone.now().
    mock_now.return_value = datetime(2026, 1, 14, 23, 30, tzinfo=dt_timezone.utc)
    th_user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, clinics=["Inselspital"], projects=["COPAIN"]).save()
    patient_user = _make_user()
    patient = Patient(userId=patient_user, patient_code=f"P-{ObjectId()}", therapist=th).save()
    PatientVitals(
        patientId=patient, user=patient_user, date=mock_now.return_value, bp_sys=118, bp_dia=76, weight_kg=70.5
    ).save()

    resp = Client().get(f"/api/google-health/summary/{patient.id}/?days=7", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["today"] is not None
    assert body["today"]["weight_kg"] == 70.5


@patch("core.views.google_health_view.timezone.now")
@patch("core.views.google_health_view.queue_google_health_today_sync")
def test_summary_today_uses_local_not_utc_calendar_day(mock_fetch, mock_now):
    """Just after local midnight, "today" must be keyed by the Zurich calendar
    day, not the (still-previous) UTC day. Regression test for the local-vs-UTC
    day-boundary fix: reverting today_start to end.replace(...) (UTC) makes
    this fail, since the record's UTC instant no longer falls inside the
    (now UTC-midnight-bounded) today window."""
    from core.models import GoogleHealthData, Patient, Therapist, User

    client = Client()

    # 2026-01-14 23:30 UTC == 2026-01-15 00:30 Europe/Zurich (winter, UTC+1):
    # the local day has rolled over to the 15th, but the UTC day has not.
    # Set before any .save() calls below — Patient.save() also calls timezone.now().
    mock_now.return_value = datetime(2026, 1, 14, 23, 30, tzinfo=dt_timezone.utc)

    th_user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, clinics=["Inselspital"], projects=["COPAIN"]).save()
    patient_user = _make_user()
    patient = Patient(userId=patient_user, patient_code=f"P-{ObjectId()}", therapist=th).save()

    GoogleHealthData(user=patient_user, date=datetime(2026, 1, 15, 0, 0, tzinfo=dt_timezone.utc), steps=4242).save()

    resp = client.get(f"/api/google-health/summary/{patient.id}/?days=7", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["today"] is not None
    assert body["today"]["steps"] == 4242


@patch("core.views.google_health_view.queue_google_health_today_sync")
def test_summary_period_daily_includes_vitals_only_day(mock_fetch):
    """A day with only manually-logged BP/weight (no GoogleHealthData row at
    all) must still appear in period.daily, not be silently dropped."""
    from core.models import Patient, PatientVitals, Therapist, User

    client = Client()

    th_user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, clinics=["Inselspital"], projects=["COPAIN"]).save()
    patient_user = _make_user()
    patient = Patient(userId=patient_user, patient_code=f"P-{ObjectId()}", therapist=th).save()

    now = timezone.now()
    PatientVitals(patientId=patient, user=patient_user, date=now, bp_sys=118, bp_dia=76).save()

    resp = client.get(f"/api/google-health/summary/{patient.id}/?days=7", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    daily = body["period"]["daily"]
    assert len(daily) == 1
    assert daily[0]["bp_sys"] == 118
    assert daily[0]["bp_dia"] == 76
    assert daily[0]["steps"] == 0
    assert body["period"]["averages"]["bp_sys"] == 118
