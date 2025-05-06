import mongomock
import pytest
from mongoengine import connect, disconnect

from core.models import Patient, Therapist, User


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    conn = connect(
        "mongoenginetest",
        host="mongodb://localhost",
        mongo_client_class=mongomock.MongoClient,
    )
    yield conn
    disconnect()


import json
from datetime import datetime
from unittest import mock

from django.test import Client

from core.models import User

client = Client()


@mock.patch("core.views.auth_views.send_mail")
def test_send_verification_code_success(mock_send_mail, mongo_mock):
    user = User(
        username="testuser",
        role="Patient",
        email="test@example.com",
        phone="0000",
        pwdhash="",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    resp = client.post(
        "/api/auth/send-verification-code/",
        data=json.dumps({"userId": str(user.id)}),
        content_type="application/json",
    )

    assert resp.status_code == 200
    assert "Verification code sent successfully" in resp.json()["message"]
    mock_send_mail.assert_called_once()


def test_send_verification_code_user_not_found(mongo_mock):
    resp = client.post(
        "/api/auth/send-verification-code/",
        data=json.dumps({"userId": "507f1f77bcf86cd799439011"}),  # non-existent
        content_type="application/json",
    )
    assert resp.status_code == 404
    assert "User not found" in resp.json()["error"]


def test_send_verification_code_missing_user_id(mongo_mock):
    resp = client.post(
        "/api/auth/send-verification-code/",
        data=json.dumps({}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert "Missing user ID" in resp.json()["error"]
