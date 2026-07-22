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


@patch("core.views.google_health_view.requests.post")
def test_callback_sets_connected_at_on_success(mock_post):
    from core.models import GoogleHealthUserToken, User

    user = User(
        username=f"cb-{ObjectId()}",
        email=f"cb-{ObjectId()}@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    mock_post.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "access_token": "new_access",
            "refresh_token": "new_refresh",
            "expires_in": 3600,
            "sub": "google-sub-123",
        },
    )

    resp = client.get(f"/api/google-health/callback/?code=testcode&state={user.id}")
    assert resp.status_code == 302

    token = GoogleHealthUserToken.objects(user=user).first()
    assert token is not None
    assert token.connected_at is not None
    assert token.is_revoked is False


@patch("core.views.google_health_view.requests.post")
def test_callback_clears_is_revoked_on_reconnect(mock_post):
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

    mock_post.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "access_token": "new_access",
            "refresh_token": "new_refresh",
            "expires_in": 3600,
            "sub": "google-sub-456",
        },
    )

    client.get(f"/api/google-health/callback/?code=testcode&state={user.id}")

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
