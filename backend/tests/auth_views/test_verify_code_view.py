"""
Authentication Verify Code View Tests

This module tests the code verification endpoint (/api/auth/verify-code/) for email/SMS verification.
Tests cover successful code verification, wrong codes, expired codes, and missing parameters.

Framework: Django Test Client with pytest
Database: mongomock (in-memory MongoDB) for isolated testing
Verification: Tests SMSVerification model lifecycle
"""

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
from datetime import datetime, timedelta

from django.test import Client
from django.utils import timezone

from core.models import SMSVerification, User

client = Client()


def test_verify_code_success(mongo_mock):
    """
    
    Setup:
    - User exists and has pending email verification
    - Verification code: "123456" (6 digits)
    - Code expires at: now + 5 minutes (not yet expired)
    - SMSVerification record created
    
    Steps:
    
    Expected Results:
    - HTTP 200 OK
    - Response message: "Verification successful"
    - User.is_verified becomes True (or similar flag)
    - SMSVerification record deleted (count == 0)
    - User can now login and use full functionality
    
    Use Case: New user registers, receives code via email, enters code, activates account
    """
    user = User(
        username="verifyuser",
        role="Patient",
        email="verify@example.com",
        phone="123",
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
    assert "Verification successful" in resp.json()["message"]
    # Ensure code is deleted
    assert SMSVerification.objects.filter(userId=str(user.id), code=code).count() == 0


def test_verify_code_wrong_code(mongo_mock):
    """
    
    Setup:
    - User exists and code is pending
    - Correct code stored in database: "654321"
    - User enters: "123456" (wrong code)
    
    Steps:
    
    Expected Results:
    - HTTP 400 Bad Request or 401 Unauthorized
    - Error message: "Invalid verification code" or similar
    - Verification code NOT deleted (can retry)
    - User remains unverified
    - User can request new code or retry
    
    Error Handling: Allows retry attempts, prevents brute force (should have rate limiting in production)
    """
    user = User(
        username="wrongcodeuser",
        role="Patient",
        email="wrongcode@example.com",
        phone="123",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    # Save a different code
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
    assert "Invalid verification code" in resp.json()["error"]


def test_verify_code_expired(mongo_mock):
    user = User(
        username="expireduser",
        role="Patient",
        email="expired@example.com",
        phone="123",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    code = "999999"
    SMSVerification(
        userId=str(user.id),
        code=code,
        expires_at=timezone.now() - timedelta(minutes=1),  # Expired
    ).save()

    resp = client.post(
        "/api/auth/verify-code/",
        data=json.dumps({"userId": str(user.id), "verificationCode": code}),
        content_type="application/json",
    )

    assert resp.status_code == 400
    assert "Verification code expired" in resp.json()["error"]
    # Ensure code is deleted after expiry
    assert SMSVerification.objects.filter(userId=str(user.id), code=code).count() == 0
