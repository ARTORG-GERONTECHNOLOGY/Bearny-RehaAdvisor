"""
Cleaned authentication send verification code tests (minimal, valid).
"""

import mongomock
import pytest
from mongoengine import connect, disconnect

import json
from datetime import datetime
from unittest import mock

from django.test import Client

from core.models import User


@pytest.fixture(autouse=True)
def mongo_mock():
    conn = connect(
        "mongoenginetest",
        host="mongodb://localhost",
        mongo_client_class=mongomock.MongoClient,
    )
    yield conn
    disconnect()


client = Client()


@mock.patch("core.views.auth_views.send_mail")
def test_send_verification_code_success(mock_send_mail, mongo_mock):
    user = User(
        username="testuser",
        role="Patient",
        email="test@example.com",
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
    mock_send_mail.assert_called_once()


def test_send_verification_code_user_not_found(mongo_mock):
    resp = client.post(
        "/api/auth/send-verification-code/",
        data=json.dumps({"userId": "507f1f77bcf86cd799439011"}),
        content_type="application/json",
    )
    assert resp.status_code == 404


def test_send_verification_code_missing_user_id(mongo_mock):
    resp = client.post(
        "/api/auth/send-verification-code/",
        data=json.dumps({}),
        content_type="application/json",
    )
    assert resp.status_code == 400
