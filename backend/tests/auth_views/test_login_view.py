"""
Cleaned authentication login view tests (minimal, valid).

These tests focus on exercise of the `/api/auth/login/` endpoint and use
an in-memory mongomock-backed `mongoengine` connection to avoid requiring
an external MongoDB during pytest collection.
"""

import mongomock
import pytest
from mongoengine import connect, disconnect

import json
from datetime import datetime

from django.contrib.auth.hashers import make_password
from django.test import Client

from core.models import Therapist, User


@pytest.fixture(autouse=True)
def mongo_mock():
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


def test_login_success(mongo_mock):
    user = User(
        username="therapist1",
        role="Therapist",
        email="therapist@example.com",
        phone="123456789",
        pwdhash=make_password("testpass123"),
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    Therapist(
        userId=user,
        name="Smith",
        first_name="John",
    ).save()

    resp = client.post(
        "/api/auth/login/",
        data=json.dumps({"email": "therapist@example.com", "password": "testpass123"}),
        content_type="application/json",
    )

    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data.get("user_type") == "Therapist"


def test_login_wrong_password(mongo_mock):
    User(
        username="therapist2",
        role="Therapist",
        email="wrongpass@example.com",
        pwdhash=make_password("correctpass"),
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    resp = client.post(
        "/api/auth/login/",
        data=json.dumps({"email": "wrongpass@example.com", "password": "badpass"}),
        content_type="application/json",
    )
    assert resp.status_code == 401


def test_login_user_not_found(mongo_mock):
    resp = client.post(
        "/api/auth/login/",
        data=json.dumps({"email": "doesnotexist@example.com", "password": "irrelevant"}),
        content_type="application/json",
    )
    assert resp.status_code == 404

