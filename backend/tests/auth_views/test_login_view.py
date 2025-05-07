import mongomock
import pytest
from mongoengine import connect, disconnect

from core.models import Patient, Therapist, User


@pytest.fixture(autouse=True, scope="function")
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


import json
from datetime import datetime

from django.contrib.auth.hashers import make_password
from django.test import Client
from django.urls import reverse

from core.models import Therapist, User

client = Client()


def test_login_success(mongo_mock):
    # Set up user
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
        specializations=["Cardiology"],
        clinics=["Downtown Clinic"],
    ).save()

    # Request
    resp = client.post(
        "/api/auth/login/",
        data=json.dumps({"email": "therapist@example.com", "password": "testpass123"}),
        content_type="application/json",
    )

    assert resp.status_code == 200
    json_data = resp.json()
    assert "access_token" in json_data
    assert json_data["user_type"] == "Therapist"
    assert json_data["full_name"] == "John"


def test_login_wrong_password(mongo_mock):
    user = User(
        username="therapist2",
        role="Therapist",
        email="wrongpass@example.com",
        phone="0000",
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
    assert "Invalid credentials" in resp.json()["error"]


def test_login_inactive_user(mongo_mock):
    user = User(
        username="inactiveuser",
        role="Therapist",
        email="inactive@example.com",
        phone="123",
        pwdhash=make_password("testpass"),
        createdAt=datetime.now(),
        isActive=False,
    ).save()

    resp = client.post(
        "/api/auth/login/",
        data=json.dumps({"email": "inactive@example.com", "password": "testpass"}),
        content_type="application/json",
    )
    assert resp.status_code == 403
    assert "User has not yet been accepted" in resp.json()["error"]


def test_login_user_not_found(mongo_mock):
    resp = client.post(
        "/api/auth/login/",
        data=json.dumps(
            {"email": "doesnotexist@example.com", "password": "irrelevant"}
        ),
        content_type="application/json",
    )
    assert resp.status_code == 404
    assert "User not found" in resp.json()["error"]


def test_login_invalid_json(mongo_mock):
    resp = client.post(
        "/api/auth/login/", data="not-a-json", content_type="application/json"
    )
    assert resp.status_code == 400
    assert "Invalid input format" in resp.json()["error"]
