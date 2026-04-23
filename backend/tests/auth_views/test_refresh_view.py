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
