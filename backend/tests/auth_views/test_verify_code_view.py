"""
Cleaned authentication verify code view tests (minimal, valid).
"""

import mongomock
import pytest
from mongoengine import connect, disconnect

import json
from datetime import datetime, timedelta

from django.test import Client
from django.utils import timezone

from core.models import SMSVerification, User


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


def test_verify_code_success(mongo_mock):
    user = User(
        username="verifyuser",
        role="Patient",
        email="verify@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    code = "123456"
    SMSVerification(
        userId=str(user.id), code=code, expires_at=timezone.now() + timedelta(minutes=5)
    ).save()

    resp = client.post(
        "/api/auth/verify-code/",
        data=json.dumps({"userId": str(user.id), "verificationCode": code}),
        content_type="application/json",
    )

    assert resp.status_code == 200


def test_verify_code_wrong_code(mongo_mock):
    user = User(
        username="wrongcodeuser",
        role="Patient",
        email="wrongcode@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    SMSVerification(
        userId=str(user.id),
        code="654321",
        expires_at=timezone.now() + timedelta(minutes=5),
    ).save()

    resp = client.post(
        "/api/auth/verify-code/",
        data=json.dumps({"userId": str(user.id), "verificationCode": "000000"}),
        content_type="application/json",
    )

    assert resp.status_code == 400


def test_verify_code_expired(mongo_mock):
    user = User(
        username="expireduser",
        role="Patient",
        email="expired@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    code = "999999"
    SMSVerification(
        userId=str(user.id),
        code=code,
        expires_at=timezone.now() - timedelta(minutes=1),
    ).save()

    resp = client.post(
        "/api/auth/verify-code/",
        data=json.dumps({"userId": str(user.id), "verificationCode": code}),
        content_type="application/json",
    )

    assert resp.status_code == 400
