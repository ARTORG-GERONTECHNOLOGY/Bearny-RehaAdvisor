"""
Fitbit sync service tests
=========================

Tests core/views/fitbit_sync.py helper/service functions directly.
"""

from datetime import datetime, timedelta
from unittest.mock import Mock, patch

import mongomock
import pytest
from django.utils import timezone

from core.models import FitbitData, FitbitUserToken, User
from core.views.fitbit_sync import fetch_fitbit_today_for_user, get_valid_access_token


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


def make_user_with_token(expired=False):
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
    ).save()
    return user, token


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
    mock_post.return_value = resp

    with pytest.raises(Exception):
        get_valid_access_token(user)


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
            return mk_resp({"activities-activeZoneMinutes": []})
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
            return mk_resp(payload={"activities-activeZoneMinutes": [{"dateTime": day, "value": {"totalMinutes": 25}}]})
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
