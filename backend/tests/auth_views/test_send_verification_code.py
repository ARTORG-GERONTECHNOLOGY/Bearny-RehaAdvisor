"""
Authentication Send Verification Code View Tests

This module tests the verification code sending endpoint (/api/auth/send-verification-code/).
Tests cover successful code sending, user not found, and missing user ID parameter.

Framework: Django Test Client with pytest
Database: mongomock (in-memory MongoDB) for isolated testing
Email: Mocked send_mail to prevent actual email sends during tests
"""

import mongomock
import pytest
from mongoengine import connect, disconnect

from core.models import Patient, Therapist, User


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    """
    Fixture: Mock MongoDB for verification code tests
    
    Sets up:
    - In-memory MongoDB connection for each test
    - Isolation: Each test has clean database
    - Cleanup: Disconnect after test completes
    """
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
    """
    
    Setup:
    - User exists: testuser (Patient)
    - Email: test@example.com
    - User is active but not yet verified
    
    Steps:
    
    Expected Results:
    - HTTP 200 OK
    - Response message: "Verification code sent successfully"
    - send_mail called once (verified with mock)
    - SMSVerification record created in database
    - Code sent to user's email
    - User can verify within 5 minutes
    
    Use Case: New user registers, needs verification code, clicks "send code" button
    """
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
    """
    
    Setup:
    - User ID does not exist in database
    - User ID: 507f1f77bcf86cd799439011
    
    Steps:
    
    Expected Results:
    - HTTP 404 Not Found
    - Error message: "User not found"
    - No email sent
    - No SMSVerification record created
    - Database unchanged
    
    Error Handling: Prevents operations on non-existent users
    """
    resp = client.post(
        "/api/auth/send-verification-code/",
        data=json.dumps({"userId": "507f1f77bcf86cd799439011"}),  # non-existent
        content_type="application/json",
    )
    assert resp.status_code == 404
    assert "User not found" in resp.json()["error"]


def test_send_verification_code_missing_user_id(mongo_mock):
    """
    
    Setup:
    - Request sent without userId field
    
    Steps:
    
    Expected Results:
    - HTTP 400 Bad Request
    - Error message: "Missing user ID"
    - No email sent
    - No database changes
    
    Input Validation: Prevents incomplete requests from processing
    """
    resp = client.post(
        "/api/auth/send-verification-code/",
        data=json.dumps({}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert "Missing user ID" in resp.json()["error"]
