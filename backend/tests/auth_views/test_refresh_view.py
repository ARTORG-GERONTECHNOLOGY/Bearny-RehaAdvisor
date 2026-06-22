"""
Authentication refresh-token view tests — ``/api/auth/token/refresh/``
=======================================================================

These tests guard the MongoDB-specific refresh flow. The stock simplejwt
refresh serializer looks up the token's ``user_id`` against Django's SQL
``auth.User`` table, which crashes when our JWT contains a Mongo ObjectId
string. The custom refresh view must accept those tokens and rotate them
normally.
"""

import json
from datetime import datetime

import mongomock
import pytest
from django.test import Client
from mongoengine import connect, disconnect
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import User


@pytest.fixture(autouse=True)
def mongo_mock():
    """Provide an isolated in-memory MongoDB for every test in this module."""
    alias = "default"
    from mongoengine.connection import _connections

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


client = Client()

REFRESH_URL = "/api/auth/token/refresh/"


def _post(payload):
    return client.post(
        REFRESH_URL,
        data=json.dumps(payload),
        content_type="application/json",
    )


def _make_user(email="refresh@example.com", is_active=True):
    return User(
        username=email.split("@")[0],
        role="Patient",
        email=email,
        createdAt=datetime.now(),
        isActive=is_active,
    ).save()


def _make_refresh_token(user):
    token = RefreshToken()
    token["user_id"] = str(user.id)
    token["role"] = user.role
    token["username"] = getattr(user, "username", "") or ""
    return str(token)


def test_refresh_token_accepts_mongo_user_id(mongo_mock):
    """
    A refresh token whose ``user_id`` claim is a Mongo ObjectId string should
    return 200 with a fresh access token instead of crashing with a Django ORM
    integer-id lookup error.
    """
    user = _make_user()

    resp = _post({"refresh": _make_refresh_token(user)})

    assert resp.status_code == 200
    data = resp.json()
    assert "access" in data
    assert "refresh" in data


def test_refresh_token_rejects_inactive_mongo_user(mongo_mock):
    """
    Refresh must still deny inactive users even though it no longer uses the
    default Django auth model lookup.
    """
    user = _make_user(email="inactive-refresh@example.com", is_active=False)

    resp = _post({"refresh": _make_refresh_token(user)})

    assert resp.status_code == 401


def test_refresh_token_rotation_does_not_raise_attribute_error(mongo_mock):
    """
    Regression: with ROTATE_REFRESH_TOKENS=True the endpoint previously crashed
    with AttributeError because jwt_refresh.py called refresh.outstand(), which
    does not exist on simplejwt's RefreshToken. The response must be 200 and
    contain a fresh rotated refresh token.
    """
    user = _make_user(email="rotate@example.com")

    resp = _post({"refresh": _make_refresh_token(user)})

    assert resp.status_code == 200, resp.json()
    data = resp.json()
    assert "access" in data
    assert "refresh" in data
    assert data["refresh"] != _make_refresh_token(user), "rotated token should differ"


# ===========================================================================
# Cookie-based refresh (httpOnly cookie auth)
# ===========================================================================


def test_refresh_via_cookie_returns_200(mongo_mock):
    """
    When the frontend sends the refresh token in the ``refresh_token`` httpOnly
    cookie (withCredentials=true, no body), the view must return 200 and a new
    access token — not 400 {"refresh": ["This field is required."]}.

    This was broken on main: MongoTokenRefreshSerializer expected attrs["refresh"]
    from the request body and never checked COOKIES.
    """
    user = _make_user(email="cookie-refresh@example.com")
    raw_token = _make_refresh_token(user)

    resp = client.post(
        REFRESH_URL,
        data="{}",
        content_type="application/json",
        HTTP_COOKIE=f"refresh_token={raw_token}",
    )

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.json()}"
    data = resp.json()
    assert "access" in data, "Response must contain new access token"


def test_refresh_via_cookie_sets_new_access_cookie(mongo_mock):
    """
    A successful cookie-based refresh must set a new ``access_token`` httpOnly
    cookie on the response so the browser has an updated token without JavaScript
    ever touching the raw value.
    """
    user = _make_user(email="cookie-refresh-set@example.com")
    raw_token = _make_refresh_token(user)

    resp = client.post(
        REFRESH_URL,
        data="{}",
        content_type="application/json",
        HTTP_COOKIE=f"refresh_token={raw_token}",
    )

    assert resp.status_code == 200
    assert "access_token" in resp.cookies, "Response must set an access_token cookie"
    cookie = resp.cookies["access_token"]
    assert cookie["httponly"], "access_token cookie must be httpOnly"


def test_refresh_without_body_or_cookie_returns_400(mongo_mock):
    """
    With neither a body ``refresh`` field nor a ``refresh_token`` cookie the
    endpoint must return 400 — not crash and not silently issue a token.

    Uses a fresh client to avoid inheriting cookies set by earlier tests.
    """
    fresh = Client()
    resp = fresh.post(REFRESH_URL, data="{}", content_type="application/json")
    assert resp.status_code == 400
