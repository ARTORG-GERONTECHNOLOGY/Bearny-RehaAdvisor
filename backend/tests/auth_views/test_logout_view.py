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

from django.test import Client

from core.models import User

client = Client()


def test_logout_success(mongo_mock):
    user = User(
        username="logoutuser",
        role="Patient",
        email="logout@example.com",
        phone="123",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    resp = client.post(
        "/api/auth/logout/",
        data=json.dumps({"userId": str(user.id)}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    assert "Logout successful" in resp.json()["message"]


def test_logout_user_not_found(mongo_mock):
    resp = client.post(
        "/api/auth/logout/",
        data=json.dumps({"userId": "507f1f77bcf86cd799439011"}),  # Non-existent
        content_type="application/json",
    )
    assert resp.status_code == 404
    assert "User not found" in resp.json()["error"]


def test_logout_missing_user_id(mongo_mock):
    resp = client.post(
        "/api/auth/logout/", data=json.dumps({}), content_type="application/json"
    )
    assert resp.status_code == 400
    assert "User ID is required" in resp.json()["error"]
