"""
Google Health views tests
=========================

Endpoints covered
-----------------
- GET  /api/google-health/status/<patient_id>/
- GET  /api/google-health/callback/

Also covers the sync-layer helper:
- get_valid_google_access_token  (invalid_grant → is_revoked)

Reconnect-banner contract
-------------------------
google_health_status returns:
  connected          bool   — True iff token exists and is not revoked
  needs_reconnect    bool   — True when elapsed >= 6 days (testing-mode 7-day window)
  days_until_expiry  int|null — days remaining; 0 means already at/past 7 days
"""

import json
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
    assert body["days_until_expiry"] == 7


def test_status_token_3_days_old_no_reconnect():
    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=3))
    body = json.loads(_status_as(user.id).content)
    assert body["connected"] is True
    assert body["needs_reconnect"] is False
    assert body["days_until_expiry"] == 4


def test_status_token_6_days_old_needs_reconnect():
    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=6))
    body = json.loads(_status_as(user.id).content)
    assert body["connected"] is True
    assert body["needs_reconnect"] is True
    assert body["days_until_expiry"] == 1


def test_status_token_7_days_old_expired():
    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=7))
    body = json.loads(_status_as(user.id).content)
    assert body["connected"] is True
    assert body["needs_reconnect"] is True
    assert body["days_until_expiry"] == 0


def test_status_token_8_days_old_days_until_expiry_clamped_to_zero():
    user = _make_user()
    _make_token(user, connected_at=timezone.now() - timedelta(days=8))
    body = json.loads(_status_as(user.id).content)
    assert body["needs_reconnect"] is True
    assert body["days_until_expiry"] == 0


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


def test_status_unresolved_identifier_returns_safe_defaults():
    resp = _status_as("not-a-valid-id")
    body = json.loads(resp.content)
    assert body["connected"] is False
    assert body["needs_reconnect"] is False
    assert body["days_until_expiry"] is None


def test_status_includes_wearable_device_field():
    user = _make_user()
    _make_token(user, connected_at=timezone.now())
    body = json.loads(_status_as(user.id).content)
    assert "wearable_device" in body


# ---------------------------------------------------------------------------
# google_health_callback — connected_at and is_revoked reset
# ---------------------------------------------------------------------------


def _mock_redis_for_nonce(nonce, patient_id):
    """Return a mock Redis client that validates a pre-stored nonce."""
    mock_rc = MagicMock()
    mock_rc.get.return_value = str(patient_id).encode()
    mock_rc.delete.return_value = 1
    return mock_rc


@patch("core.views.google_health_view.requests.post")
@patch("core.views.google_health_view._get_redis_client")
def test_callback_sets_connected_at_on_success(mock_redis, mock_post):
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
    assert token.connected_at is not None


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
# google_health_summary — "today" resolution
# ---------------------------------------------------------------------------


@patch("core.views.google_health_view.fetch_google_health_today_for_user")
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


@patch("core.views.google_health_view.fetch_google_health_today_for_user")
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


@patch("core.views.google_health_view.fetch_google_health_today_for_user")
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


@patch("core.views.google_health_view.timezone.now")
@patch("core.views.google_health_view.fetch_google_health_today_for_user")
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


@patch("core.views.google_health_view.fetch_google_health_today_for_user")
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
