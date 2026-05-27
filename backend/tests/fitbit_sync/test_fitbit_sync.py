"""
Fitbit sync service tests
=========================

Tests core/views/fitbit_sync.py helper/service functions directly.

Cooldown behaviour
------------------
fetch_fitbit_today_for_user skips the Fitbit API when the token's
last_fetched_at is within FETCH_COOLDOWN_MINUTES (15 min) of now.
Pass bypass_cooldown=True (Celery task) to ignore the window.
"""

from datetime import datetime, timedelta
from unittest.mock import Mock, patch

import mongomock
import pytest
from django.utils import timezone

from core.models import FitbitData, FitbitUserToken, User
from core.views.fitbit_sync import (
    FETCH_COOLDOWN_MINUTES,
    fetch_fitbit_date_range_for_user,
    fetch_fitbit_today_for_user,
    get_valid_access_token,
)


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


def make_user_with_token(expired=False, last_fetched_at=None):
    user = User(
        username=f"u-{datetime.now().timestamp()}",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    exp = timezone.now() - timedelta(minutes=5) if expired else timezone.now() + timedelta(days=7)
    token = FitbitUserToken(
        user=user,
        access_token="old-access",
        refresh_token="old-refresh",
        fitbit_user_id="fu",
        expires_at=exp,
        last_fetched_at=last_fetched_at,
    ).save()
    return user, token


def _all_empty_side_effect(url, headers=None, timeout=None):
    """Return empty-but-valid Fitbit API responses for every endpoint."""
    r = Mock()
    r.status_code = 200
    r.text = "ok"
    mapping = {
        "activities/steps": {"activities-steps": []},
        "activities/floors": {"activities-floors": []},
        "activities/distance": {"activities-distance": []},
        "activities/calories": {"activities-calories": []},
        "minutesVeryActive": {"activities-minutesVeryActive": []},
        "minutesFairlyActive": {"activities-minutesFairlyActive": []},
        "minutesLightlyActive": {"activities-minutesLightlyActive": []},
        "minutesSedentary": {"activities-minutesSedentary": []},
        "active-zone-minutes": {"activities-active-zone-minutes": []},
        "activities/heart": {"activities-heart": []},
        "1d/1sec": {"activities-heart-intraday": {"dataset": []}},
        "/br/": {"br": []},
        "/hrv/": {"hrv": []},
        "/sleep/": {"sleep": []},
        "activities/list.json": {"activities": []},
    }
    for key, payload in mapping.items():
        if key in url:
            r.json.return_value = payload
            return r
    r.json.return_value = {}
    return r


def test_get_valid_access_token_returns_current_when_not_expired():
    user, token = make_user_with_token(expired=False)
    access = get_valid_access_token(user)
    assert access == "old-access"


@patch("core.views.fitbit_sync.requests.post")
def test_get_valid_access_token_refresh_success(mock_post):
    user, token = make_user_with_token(expired=True)

    resp = Mock()
    resp.status_code = 200
    resp.text = "ok"
    resp.json.return_value = {
        "access_token": "new-access",
        "refresh_token": "new-refresh",
        "expires_in": 3600,
    }
    mock_post.return_value = resp

    access = get_valid_access_token(user)
    assert access == "new-access"

    token.reload()
    assert token.access_token == "new-access"
    assert token.refresh_token == "new-refresh"


@patch("core.views.fitbit_sync.requests.post")
def test_get_valid_access_token_refresh_failure_raises(mock_post):
    user, token = make_user_with_token(expired=True)

    resp = Mock()
    resp.status_code = 401
    resp.text = "unauthorized"
    resp.json.return_value = {}
    mock_post.return_value = resp

    with pytest.raises(Exception):
        get_valid_access_token(user)


@patch("core.views.fitbit_sync.requests.post")
def test_get_valid_access_token_invalid_grant_deletes_token(mock_post):
    """invalid_grant means Fitbit permanently revoked the refresh token — delete the record."""
    user, _ = make_user_with_token(expired=True)

    resp = Mock()
    resp.status_code = 400
    resp.text = '{"errors":[{"errorType":"invalid_grant","message":"Refresh token invalid"}],"success":false}'
    resp.json.return_value = {
        "errors": [{"errorType": "invalid_grant", "message": "Refresh token invalid"}],
        "success": False,
    }
    mock_post.return_value = resp

    with pytest.raises(Exception, match="Failed to refresh Fitbit token"):
        get_valid_access_token(user)

    assert FitbitUserToken.objects(user=user).count() == 0


@patch("core.views.fitbit_sync.requests.post")
def test_get_valid_access_token_non_invalid_grant_400_keeps_token(mock_post):
    """Other 400 errors (e.g. expired_token) should NOT delete the token."""
    user, _ = make_user_with_token(expired=True)

    resp = Mock()
    resp.status_code = 400
    resp.text = '{"errors":[{"errorType":"expired_token","message":"Access token expired"}],"success":false}'
    resp.json.return_value = {
        "errors": [{"errorType": "expired_token", "message": "Access token expired"}],
        "success": False,
    }
    mock_post.return_value = resp

    with pytest.raises(Exception, match="Failed to refresh Fitbit token"):
        get_valid_access_token(user)

    assert FitbitUserToken.objects(user=user).count() == 1


def test_fetch_fitbit_today_for_user_no_token_returns_zero():
    user = User(
        username=f"u-{datetime.now().timestamp()}",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    out = fetch_fitbit_today_for_user(user)
    assert out == 0


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_fetch_fitbit_today_for_user_upserts_today(mock_get, mock_get_token):
    user, token = make_user_with_token(expired=False)

    def mk_resp(payload):
        r = Mock()
        r.status_code = 200
        r.json.return_value = payload
        r.text = "ok"
        return r

    def side_effect(url, headers=None, timeout=None):
        if "activities/steps" in url:
            return mk_resp(
                {
                    "activities-steps": [
                        {
                            "dateTime": datetime.now().strftime("%Y-%m-%d"),
                            "value": "1234",
                        }
                    ]
                }
            )
        if "activities/floors" in url:
            return mk_resp({"activities-floors": []})
        if "activities/distance" in url:
            return mk_resp({"activities-distance": []})
        if "activities/calories" in url:
            return mk_resp({"activities-calories": []})
        if "minutesVeryActive" in url:
            return mk_resp({"activities-minutesVeryActive": []})
        if "minutesFairlyActive" in url:
            return mk_resp({"activities-minutesFairlyActive": []})
        if "minutesLightlyActive" in url:
            return mk_resp({"activities-minutesLightlyActive": []})
        if "minutesSedentary" in url:
            return mk_resp({"activities-minutesSedentary": []})
        if "activities/heart" in url:
            return mk_resp({"activities-heart": []})
        if "active-zone-minutes" in url:
            return mk_resp({"activities-active-zone-minutes": []})
        if "/br/" in url:
            return mk_resp({"br": []})
        if "/hrv/" in url:
            return mk_resp({"hrv": []})
        if "/sleep/" in url:
            return mk_resp({"sleep": []})
        if "activities/list.json" in url:
            return mk_resp({"activities": []})
        return mk_resp({})

    mock_get.side_effect = side_effect

    out = fetch_fitbit_today_for_user(user)
    assert out == 1
    assert FitbitData.objects(user=user).count() == 1
    row = FitbitData.objects(user=user).first()
    assert row.steps == 1234


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_fetch_fitbit_today_for_user_does_not_write_empty_row(mock_get, _):
    user, _token = make_user_with_token(expired=False)

    def mk_resp(status=200, payload=None):
        r = Mock()
        r.status_code = status
        r.json.return_value = payload or {}
        r.text = "ok"
        return r

    def side_effect(url, headers=None, timeout=None):
        if "activities/steps" in url:
            return mk_resp(payload={"activities-steps": []})
        if "activities/floors" in url:
            return mk_resp(status=500, payload={})
        if "activities/distance" in url:
            return mk_resp(payload={"activities-distance": []})
        if "activities/calories" in url:
            return mk_resp(payload={"activities-calories": []})
        if "minutesVeryActive" in url:
            return mk_resp(payload={"activities-minutesVeryActive": []})
        if "minutesFairlyActive" in url:
            return mk_resp(payload={"activities-minutesFairlyActive": []})
        if "minutesLightlyActive" in url:
            return mk_resp(payload={"activities-minutesLightlyActive": []})
        if "minutesSedentary" in url:
            return mk_resp(payload={"activities-minutesSedentary": []})
        if "activities/heart/date/" in url and "1d/1sec" not in url:
            return mk_resp(payload={"activities-heart": []})
        if "active-zone-minutes" in url:
            return mk_resp(payload={"activities-active-zone-minutes": []})
        if "/br/date/" in url:
            return mk_resp(payload={"br": []})
        if "/hrv/date/" in url:
            return mk_resp(payload={"hrv": []})
        if "/sleep/date/" in url:
            return mk_resp(payload={"sleep": []})
        if "activities/list.json" in url:
            return mk_resp(payload={"activities": []})
        if "1d/1sec" in url:
            return mk_resp(payload={"activities-heart-intraday": {"dataset": []}})
        return mk_resp(payload={})

    mock_get.side_effect = side_effect

    out = fetch_fitbit_today_for_user(user)
    assert out == 0
    assert FitbitData.objects(user=user).count() == 0


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
@patch("core.views.fitbit_sync.FitbitData.objects")
def test_fetch_fitbit_today_for_user_covers_branches_and_parsing(mock_objects, mock_get, _):
    user, _token = make_user_with_token(expired=False)
    day = datetime.now().strftime("%Y-%m-%d")

    def mk_resp(status=200, payload=None, text="ok"):
        r = Mock()
        r.status_code = status
        r.json.return_value = payload or {}
        r.text = text
        return r

    def side_effect(url, headers=None, timeout=None):
        if "activities/steps" in url:
            # triggers parse exception -> val=0 branch
            return mk_resp(payload={"activities-steps": [{"dateTime": day, "value": "bad"}]})
        if "activities/floors" in url:
            # triggers non-200 warning branch
            return mk_resp(status=500, text="fail")
        if "activities/distance" in url:
            return mk_resp(payload={"activities-distance": [{"dateTime": day, "value": "2"}]})
        if "activities/calories" in url:
            return mk_resp(payload={"activities-calories": [{"dateTime": day, "value": "100"}]})
        if "minutesVeryActive" in url:
            return mk_resp(payload={"activities-minutesVeryActive": [{"dateTime": day, "value": "12"}]})
        if "minutesFairlyActive" in url:
            return mk_resp(payload={"activities-minutesFairlyActive": [{"dateTime": day, "value": "8"}]})
        if "minutesLightlyActive" in url:
            return mk_resp(payload={"activities-minutesLightlyActive": []})
        if "minutesSedentary" in url:
            return mk_resp(payload={"activities-minutesSedentary": []})
        if "activities/heart/date/" in url and "1d/1sec" not in url:
            return mk_resp(
                payload={
                    "activities-heart": [
                        {
                            "dateTime": day,
                            "value": {"restingHeartRate": 60, "heartRateZones": []},
                        }
                    ]
                }
            )
        if "active-zone-minutes" in url:
            return mk_resp(
                payload={"activities-active-zone-minutes": [{"dateTime": day, "value": {"activeZoneMinutes": 25}}]}
            )
        if "/br/date/" in url:
            return mk_resp(payload={"br": [{"dateTime": day, "value": {"breathingRate": 14}}]})
        if "/hrv/date/" in url:
            return mk_resp(payload={"hrv": [{"dateTime": day, "value": {"dailyRmssd": 33}}]})
        if "/sleep/date/" in url:
            # non-numeric duration triggers sleep_minutes_for exception branch
            return mk_resp(
                payload={
                    "sleep": [
                        {
                            "dateOfSleep": day,
                            "duration": "bad",
                            "startTime": "x",
                            "endTime": "y",
                            "awakeningsCount": 1,
                        }
                    ]
                }
            )
        if "activities/list.json" in url:
            return mk_resp(
                payload={
                    "activities": [
                        {
                            "startTime": f"{day}T10:00:00.000",
                            "activityName": "Walk",
                            "duration": 10,
                            "calories": 30,
                        }
                    ]
                }
            )
        return mk_resp(payload={})

    mock_get.side_effect = side_effect

    mock_objects.return_value.update_one.return_value = 1
    out = fetch_fitbit_today_for_user(user)
    assert out == 1
    mock_objects.return_value.update_one.assert_called_once()


# ---------------------------------------------------------------------------
# Wear time calculation
# ---------------------------------------------------------------------------


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_wear_time_stored_from_intraday_hr(mock_get, _):
    """Wear time = distinct minutes with HR > 0 in intraday 1-sec dataset."""
    user, _ = make_user_with_token(expired=False)
    day = datetime.now().strftime("%Y-%m-%d")

    # Build intraday dataset: 3 seconds across 2 minutes with HR, 1 with HR=0
    intraday_dataset = [
        {"time": "08:01:00", "value": 65},
        {"time": "08:01:30", "value": 67},
        {"time": "08:02:00", "value": 70},
        {"time": "08:03:00", "value": 0},  # not worn
    ]

    def mk_resp(payload):
        r = Mock()
        r.status_code = 200
        r.json.return_value = payload
        r.text = "ok"
        return r

    def side_effect(url, headers=None, timeout=None):
        if "1d/1sec" in url:
            return mk_resp({"activities-heart-intraday": {"dataset": intraday_dataset}})
        if "activities/heart" in url:
            return mk_resp({"activities-heart": []})
        if "activities/steps" in url:
            return mk_resp({"activities-steps": [{"dateTime": day, "value": "500"}]})
        if "activities/floors" in url:
            return mk_resp({"activities-floors": []})
        if "activities/distance" in url:
            return mk_resp({"activities-distance": []})
        if "activities/calories" in url:
            return mk_resp({"activities-calories": []})
        if "minutesVeryActive" in url:
            return mk_resp({"activities-minutesVeryActive": []})
        if "minutesFairlyActive" in url:
            return mk_resp({"activities-minutesFairlyActive": []})
        if "minutesLightlyActive" in url:
            return mk_resp({"activities-minutesLightlyActive": []})
        if "minutesSedentary" in url:
            return mk_resp({"activities-minutesSedentary": []})
        if "active-zone-minutes" in url:
            return mk_resp({"activities-active-zone-minutes": []})
        if "/br/" in url:
            return mk_resp({"br": []})
        if "/hrv/" in url:
            return mk_resp({"hrv": []})
        if "/sleep/" in url:
            return mk_resp({"sleep": []})
        if "activities/list.json" in url:
            return mk_resp({"activities": []})
        return mk_resp({})

    mock_get.side_effect = side_effect

    out = fetch_fitbit_today_for_user(user)
    assert out == 1

    row = FitbitData.objects(user=user).first()
    # 08:01 and 08:02 have HR > 0 → 2 minutes worn
    assert row.wear_time_minutes == 2
    # max HR from intraday
    assert row.max_heart_rate == 70


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_wear_time_none_when_no_intraday_data(mock_get, _):
    """wear_time_minutes is None when the intraday endpoint returns no data."""
    user, _ = make_user_with_token(expired=False)
    day = datetime.now().strftime("%Y-%m-%d")

    def mk_empty(payload):
        r = Mock()
        r.status_code = 200
        r.json.return_value = payload
        r.text = "ok"
        return r

    def side_effect(url, headers=None, timeout=None):
        if "1d/1sec" in url:
            return mk_empty({"activities-heart-intraday": {"dataset": []}})
        if "activities/heart" in url:
            return mk_empty({"activities-heart": []})
        if "activities/steps" in url:
            return mk_empty({"activities-steps": [{"dateTime": day, "value": "200"}]})
        if "activities/floors" in url:
            return mk_empty({"activities-floors": []})
        if "activities/distance" in url:
            return mk_empty({"activities-distance": []})
        if "activities/calories" in url:
            return mk_empty({"activities-calories": []})
        if "minutesVeryActive" in url:
            return mk_empty({"activities-minutesVeryActive": []})
        if "minutesFairlyActive" in url:
            return mk_empty({"activities-minutesFairlyActive": []})
        if "minutesLightlyActive" in url:
            return mk_empty({"activities-minutesLightlyActive": []})
        if "minutesSedentary" in url:
            return mk_empty({"activities-minutesSedentary": []})
        if "active-zone-minutes" in url:
            return mk_empty({"activities-active-zone-minutes": []})
        if "/br/" in url:
            return mk_empty({"br": []})
        if "/hrv/" in url:
            return mk_empty({"hrv": []})
        if "/sleep/" in url:
            return mk_empty({"sleep": []})
        if "activities/list.json" in url:
            return mk_empty({"activities": []})
        return mk_empty({})

    mock_get.side_effect = side_effect

    fetch_fitbit_today_for_user(user)
    row = FitbitData.objects(user=user).first()
    assert row.wear_time_minutes is None


# ---------------------------------------------------------------------------
# Sleep: minutes_asleep (actual sleep) vs sleep_duration (time in bed)
# ---------------------------------------------------------------------------


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_minutes_asleep_stored_separately_from_duration(mock_get, _):
    """minutes_asleep matches Fitbit app; sleep_duration includes awake time."""
    user, _ = make_user_with_token(expired=False)
    day = datetime.now().strftime("%Y-%m-%d")

    # 8 hours in bed (28800000 ms), but only 7h15m actually asleep (435 min)
    sleep_entry = {
        "dateOfSleep": day,
        "duration": 28800000,  # 8 hours in ms (time in bed)
        "minutesAsleep": 435,  # 7h15m (what Fitbit app shows)
        "startTime": f"{day}T22:00:00.000",
        "endTime": f"{day}T06:00:00.000",
        "awakeningsCount": 3,
    }

    def mk_resp(payload):
        r = Mock()
        r.status_code = 200
        r.json.return_value = payload
        r.text = "ok"
        return r

    def side_effect(url, headers=None, timeout=None):
        if "/sleep/" in url:
            return mk_resp({"sleep": [sleep_entry]})
        if "1d/1sec" in url:
            return mk_resp({"activities-heart-intraday": {"dataset": []}})
        if "activities/heart" in url:
            return mk_resp({"activities-heart": []})
        if "activities/steps" in url:
            return mk_resp({"activities-steps": [{"dateTime": day, "value": "0"}]})
        if "activities/floors" in url:
            return mk_resp({"activities-floors": []})
        if "activities/distance" in url:
            return mk_resp({"activities-distance": []})
        if "activities/calories" in url:
            return mk_resp({"activities-calories": []})
        if "minutesVeryActive" in url:
            return mk_resp({"activities-minutesVeryActive": []})
        if "minutesFairlyActive" in url:
            return mk_resp({"activities-minutesFairlyActive": []})
        if "minutesLightlyActive" in url:
            return mk_resp({"activities-minutesLightlyActive": []})
        if "minutesSedentary" in url:
            return mk_resp({"activities-minutesSedentary": []})
        if "active-zone-minutes" in url:
            return mk_resp({"activities-active-zone-minutes": []})
        if "/br/" in url:
            return mk_resp({"br": []})
        if "/hrv/" in url:
            return mk_resp({"hrv": []})
        if "activities/list.json" in url:
            return mk_resp({"activities": []})
        return mk_resp({})

    mock_get.side_effect = side_effect

    fetch_fitbit_today_for_user(user)
    row = FitbitData.objects(user=user).first()

    assert row.sleep is not None
    assert row.sleep.sleep_duration == 28800000  # raw time in bed (ms)
    assert row.sleep.minutes_asleep == 435  # actual sleep (matches Fitbit app)
    assert row.sleep.awakenings == 3


# ---------------------------------------------------------------------------
# Cooldown / rate-limit guard
# ---------------------------------------------------------------------------


def test_cooldown_skips_fetch_when_recently_synced():
    """Returns 0 immediately and makes no API calls when last_fetched_at is within the window."""
    recent = timezone.now() - timedelta(minutes=FETCH_COOLDOWN_MINUTES - 5)
    user, _ = make_user_with_token(expired=False, last_fetched_at=recent)

    with patch("core.views.fitbit_sync.requests.get") as mock_get:
        result = fetch_fitbit_today_for_user(user)

    assert result == 0
    mock_get.assert_not_called()


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_cooldown_allows_fetch_when_last_synced_is_stale(mock_get, _):
    """Fetch proceeds when last_fetched_at is older than the cooldown window."""
    stale = timezone.now() - timedelta(minutes=FETCH_COOLDOWN_MINUTES + 5)
    user, _ = make_user_with_token(expired=False, last_fetched_at=stale)
    mock_get.side_effect = _all_empty_side_effect

    fetch_fitbit_today_for_user(user)

    assert mock_get.called


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_cooldown_allows_fetch_when_last_fetched_at_is_none(mock_get, _):
    """Fetch proceeds on the first sync when last_fetched_at has never been set."""
    user, _ = make_user_with_token(expired=False, last_fetched_at=None)
    mock_get.side_effect = _all_empty_side_effect

    fetch_fitbit_today_for_user(user)

    assert mock_get.called


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_bypass_cooldown_proceeds_despite_recent_sync(mock_get, _):
    """bypass_cooldown=True ignores a recent last_fetched_at and hits the API."""
    recent = timezone.now() - timedelta(minutes=FETCH_COOLDOWN_MINUTES - 5)
    user, _ = make_user_with_token(expired=False, last_fetched_at=recent)
    mock_get.side_effect = _all_empty_side_effect

    fetch_fitbit_today_for_user(user, bypass_cooldown=True)

    assert mock_get.called


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_last_fetched_at_stamped_on_token_before_api_calls(mock_get, _):
    """last_fetched_at is written to FitbitUserToken before any API request fires."""
    user, token = make_user_with_token(expired=False, last_fetched_at=None)
    assert token.last_fetched_at is None

    mock_get.side_effect = _all_empty_side_effect
    fetch_fitbit_today_for_user(user)

    token.reload()
    assert token.last_fetched_at is not None


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_last_fetched_at_stamped_even_when_api_returns_429(mock_get, _):
    """last_fetched_at is stamped before the first call, so 429 errors still reset the window."""
    user, token = make_user_with_token(expired=False, last_fetched_at=None)

    error_resp = Mock()
    error_resp.status_code = 429
    error_resp.text = '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'
    error_resp.json.return_value = {}
    mock_get.return_value = error_resp

    fetch_fitbit_today_for_user(user)

    token.reload()
    assert token.last_fetched_at is not None


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_cooldown_handles_naive_last_fetched_at(mock_get, _):
    """A naive (timezone-unaware) last_fetched_at stored in MongoDB is handled correctly."""
    from datetime import timezone as stdlib_tz

    naive_recent = datetime.now(tz=stdlib_tz.utc).replace(tzinfo=None) - timedelta(minutes=5)
    user, _ = make_user_with_token(expired=False, last_fetched_at=naive_recent)

    with patch("core.views.fitbit_sync.requests.get") as mock_get_inner:
        result = fetch_fitbit_today_for_user(user)

    assert result == 0
    mock_get_inner.assert_not_called()


# ---------------------------------------------------------------------------
# Fix regression: active_minutes comes from AZM endpoint, not fallback
# ---------------------------------------------------------------------------


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_active_minutes_uses_azm_not_fallback(mock_get, _):
    """
    Fix regression: when the Fitbit AZM endpoint returns data, active_minutes
    must be set to the AZM value.  Previously the code looked for the wrong
    JSON key ('activities-activeZoneMinutes') so it always silently fell back
    to minutesVeryActive + minutesFairlyActive.
    """
    user, _ = make_user_with_token(expired=False)
    day = datetime.now().strftime("%Y-%m-%d")

    def mk_resp(payload):
        r = Mock()
        r.status_code = 200
        r.json.return_value = payload
        r.text = "ok"
        return r

    def side_effect(url, headers=None, timeout=None):
        if "active-zone-minutes" in url:
            # Correct Fitbit API response format
            return mk_resp({"activities-active-zone-minutes": [{"dateTime": day, "value": {"activeZoneMinutes": 42}}]})
        if "minutesVeryActive" in url:
            # If fallback were used: 10 + 5 = 15 (≠ 42, so we can detect the bug)
            return mk_resp({"activities-minutesVeryActive": [{"dateTime": day, "value": "10"}]})
        if "minutesFairlyActive" in url:
            return mk_resp({"activities-minutesFairlyActive": [{"dateTime": day, "value": "5"}]})
        if "minutesLightlyActive" in url:
            return mk_resp({"activities-minutesLightlyActive": []})
        if "minutesSedentary" in url:
            return mk_resp({"activities-minutesSedentary": []})
        if "activities/steps" in url:
            return mk_resp({"activities-steps": [{"dateTime": day, "value": "1000"}]})
        if "activities/floors" in url:
            return mk_resp({"activities-floors": []})
        if "activities/distance" in url:
            return mk_resp({"activities-distance": []})
        if "activities/calories" in url:
            return mk_resp({"activities-calories": []})
        if "1d/1sec" in url:
            return mk_resp({"activities-heart-intraday": {"dataset": []}})
        if "activities/heart" in url:
            return mk_resp({"activities-heart": []})
        if "/br/" in url:
            return mk_resp({"br": []})
        if "/hrv/" in url:
            return mk_resp({"hrv": []})
        if "/sleep/" in url:
            return mk_resp({"sleep": []})
        if "activities/list.json" in url:
            return mk_resp({"activities": []})
        return mk_resp({})

    mock_get.side_effect = side_effect
    fetch_fitbit_today_for_user(user)

    row = FitbitData.objects(user=user).first()
    # Must be 42 (from AZM), NOT 15 (minutesVeryActive + minutesFairlyActive fallback)
    assert row.active_minutes == 42, (
        f"active_minutes={row.active_minutes}: AZM not used — "
        "check 'activities-active-zone-minutes' key and 'activeZoneMinutes' value field"
    )


@patch("core.views.fitbit_sync.get_valid_access_token", return_value="access")
@patch("core.views.fitbit_sync.requests.get")
def test_active_minutes_falls_back_when_azm_absent(mock_get, _):
    """When AZM endpoint returns no data, fall back to minutesVeryActive + minutesFairlyActive."""
    user, _ = make_user_with_token(expired=False)
    day = datetime.now().strftime("%Y-%m-%d")

    def mk_resp(payload):
        r = Mock()
        r.status_code = 200
        r.json.return_value = payload
        r.text = "ok"
        return r

    def side_effect(url, headers=None, timeout=None):
        if "active-zone-minutes" in url:
            return mk_resp({"activities-active-zone-minutes": []})  # empty → trigger fallback
        if "minutesVeryActive" in url:
            return mk_resp({"activities-minutesVeryActive": [{"dateTime": day, "value": "10"}]})
        if "minutesFairlyActive" in url:
            return mk_resp({"activities-minutesFairlyActive": [{"dateTime": day, "value": "5"}]})
        if "minutesLightlyActive" in url:
            return mk_resp({"activities-minutesLightlyActive": []})
        if "minutesSedentary" in url:
            return mk_resp({"activities-minutesSedentary": []})
        if "activities/steps" in url:
            return mk_resp({"activities-steps": [{"dateTime": day, "value": "1000"}]})
        if "activities/floors" in url:
            return mk_resp({"activities-floors": []})
        if "activities/distance" in url:
            return mk_resp({"activities-distance": []})
        if "activities/calories" in url:
            return mk_resp({"activities-calories": []})
        if "1d/1sec" in url:
            return mk_resp({"activities-heart-intraday": {"dataset": []}})
        if "activities/heart" in url:
            return mk_resp({"activities-heart": []})
        if "/br/" in url:
            return mk_resp({"br": []})
        if "/hrv/" in url:
            return mk_resp({"hrv": []})
        if "/sleep/" in url:
            return mk_resp({"sleep": []})
        if "activities/list.json" in url:
            return mk_resp({"activities": []})
        return mk_resp({})

    mock_get.side_effect = side_effect
    fetch_fitbit_today_for_user(user)

    row = FitbitData.objects(user=user).first()
    assert row.active_minutes == 15  # 10 + 5


# ---------------------------------------------------------------------------
# fetch_fitbit_date_range_for_user — wear_time_minutes / max_heart_rate
# ---------------------------------------------------------------------------


@patch("core.views.fitbit_sync.requests.get")
@patch("core.views.fitbit_sync.get_valid_access_token", return_value="tok")
def test_range_backfill_fills_wear_time_when_intraday_available(mock_tok, mock_get):
    """wear_time_minutes and max_heart_rate are stored when intraday HR returns data."""
    user, _ = make_user_with_token()
    import datetime as _dt

    day = _dt.date.today() - _dt.timedelta(days=1)
    day_str = day.strftime("%Y-%m-%d")

    intraday_dataset = [
        {"time": "08:00:00", "value": 65},
        {"time": "08:01:00", "value": 70},
        {"time": "08:02:00", "value": 0},  # not worn
        {"time": "09:00:00", "value": 120},
    ]

    def mk_resp(body, status=200):
        m = Mock()
        m.status_code = status
        m.json.return_value = body
        return m

    def side_effect(url, **_kw):
        if "1d/1sec" in url:
            return mk_resp({"activities-heart-intraday": {"dataset": intraday_dataset}})
        if "activities/steps" in url:
            return mk_resp({"activities-steps": [{"dateTime": day_str, "value": "500"}]})
        if "activities/heart" in url:
            return mk_resp({"activities-heart": []})
        if "active-zone-minutes" in url:
            return mk_resp({"activities-active-zone-minutes": []})
        if "/br/" in url:
            return mk_resp({"br": []})
        if "/hrv/" in url:
            return mk_resp({"hrv": []})
        if "/sleep/" in url:
            return mk_resp({"sleep": []})
        if "activities/list.json" in url:
            return mk_resp({"activities": []})
        return mk_resp({})

    mock_get.side_effect = side_effect

    result = fetch_fitbit_date_range_for_user(user, day, day)

    assert result == 1
    row = FitbitData.objects(user=user).first()
    assert row.max_heart_rate == 120
    assert row.wear_time_minutes == 3  # 3 unique minute slots with HR > 0


@patch("core.views.fitbit_sync.requests.get")
@patch("core.views.fitbit_sync.get_valid_access_token", return_value="tok")
def test_range_backfill_skips_wear_time_when_intraday_unavailable(mock_tok, mock_get):
    """wear_time_minutes and max_heart_rate are NOT written when intraday returns non-200."""
    user, _ = make_user_with_token()
    import datetime as _dt

    day = _dt.date.today() - _dt.timedelta(days=1)
    day_str = day.strftime("%Y-%m-%d")

    def mk_resp(body, status=200):
        m = Mock()
        m.status_code = status
        m.json.return_value = body
        return m

    def side_effect(url, **_kw):
        if "1d/1sec" in url:
            return mk_resp({}, status=403)  # no intraday access
        if "activities/steps" in url:
            return mk_resp({"activities-steps": [{"dateTime": day_str, "value": "800"}]})
        if "activities/heart" in url:
            return mk_resp({"activities-heart": []})
        if "active-zone-minutes" in url:
            return mk_resp({"activities-active-zone-minutes": []})
        if "/br/" in url:
            return mk_resp({"br": []})
        if "/hrv/" in url:
            return mk_resp({"hrv": []})
        if "/sleep/" in url:
            return mk_resp({"sleep": []})
        if "activities/list.json" in url:
            return mk_resp({"activities": []})
        return mk_resp({})

    mock_get.side_effect = side_effect

    result = fetch_fitbit_date_range_for_user(user, day, day)

    assert result == 1
    row = FitbitData.objects(user=user).first()
    # Fields must be absent (None) — not forced to null by the upsert
    assert row.max_heart_rate is None
    assert row.wear_time_minutes is None


@patch("core.views.fitbit_sync.requests.get")
@patch("core.views.fitbit_sync.get_valid_access_token", return_value="tok")
def test_range_backfill_skips_wear_time_when_intraday_empty(mock_tok, mock_get):
    """wear_time_minutes is NOT written when intraday returns 200 but empty dataset."""
    user, _ = make_user_with_token()
    import datetime as _dt

    day = _dt.date.today() - _dt.timedelta(days=1)
    day_str = day.strftime("%Y-%m-%d")

    def mk_resp(body, status=200):
        m = Mock()
        m.status_code = status
        m.json.return_value = body
        return m

    def side_effect(url, **_kw):
        if "1d/1sec" in url:
            return mk_resp({"activities-heart-intraday": {"dataset": []}})  # empty
        if "activities/steps" in url:
            return mk_resp({"activities-steps": [{"dateTime": day_str, "value": "300"}]})
        if "activities/heart" in url:
            return mk_resp({"activities-heart": []})
        if "active-zone-minutes" in url:
            return mk_resp({"activities-active-zone-minutes": []})
        if "/br/" in url:
            return mk_resp({"br": []})
        if "/hrv/" in url:
            return mk_resp({"hrv": []})
        if "/sleep/" in url:
            return mk_resp({"sleep": []})
        if "activities/list.json" in url:
            return mk_resp({"activities": []})
        return mk_resp({})

    mock_get.side_effect = side_effect

    result = fetch_fitbit_date_range_for_user(user, day, day)

    assert result == 1
    row = FitbitData.objects(user=user).first()
    assert row.wear_time_minutes is None
    assert row.max_heart_rate is None
