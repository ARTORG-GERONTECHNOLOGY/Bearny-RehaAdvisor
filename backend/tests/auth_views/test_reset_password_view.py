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
from unittest import mock

from django.test import Client

from core.models import User

client = Client()


@mock.patch("core.views.auth_views.send_mail")
def test_reset_password_success(mock_send_mail, mongo_mock):
    user = User(
        username="testuser",
        role="Patient",
        email="reset@example.com",
        phone="123",
        pwdhash="oldhash",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    resp = client.post(
        "/api/auth/forgot-password/",
        data=json.dumps({"email": "reset@example.com"}),
        content_type="application/json",
    )

    assert resp.status_code == 200
    assert "Password reset successfully" in resp.json()["message"]
    # Assert mail was sent
    mock_send_mail.assert_called_once()
    # Confirm password was updated
    updated_user = User.objects(email="reset@example.com").first()
    assert updated_user.pwdhash != "oldhash"  # Should be changed


def test_reset_password_non_existent_user(mongo_mock):
    resp = client.post(
        "/api/auth/forgot-password/",
        data=json.dumps({"email": "nosuch@example.com"}),
        content_type="application/json",
    )
    assert resp.status_code == 404
    assert "User not found" in resp.json()["error"]


def test_reset_password_missing_email(mongo_mock):
    resp = client.post(
        "/api/auth/forgot-password/",
        data=json.dumps({}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert "Email is required" in resp.json()["error"]
