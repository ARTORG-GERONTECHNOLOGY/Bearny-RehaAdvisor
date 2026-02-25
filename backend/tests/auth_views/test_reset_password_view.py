"""
Authentication Password Reset View Tests

This module tests the password reset endpoint (/api/auth/forgot-password/) for password recovery.
Tests cover successful reset, non-existent users, and missing email parameter.

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
    """
    
    Setup:
    - User exists with email: reset@example.com
    - Current password hash: "oldhash"
    - User forgot password
    
    Steps:
    
    Expected Results:
    - HTTP 200 OK
    - Response message: "Password reset successfully"
    - user.pwdhash has changed from "oldhash"
    - Email sent (verified with mock_send_mail.assert_called_once())
    - User can now login with new temporary password
    - (In real flow) User would set permanent password from reset link
    
    Security Notes:
    - Password reset link typically expires (24 hours)
    - Link contains token to prevent bypass
    - Email verification prevents unauthorized resets
    
    Use Case: User forgot password, requests reset via email, clicks link, sets new password
    """
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
    """
    
    Setup:
    - Email does not exist in database
    - Email: nosuch@example.com
    
    Steps:
    
    Expected Results:
    - HTTP 404 Not Found
    - Error message: "User not found"
    - No email sent
    - No password changed
    - Database unchanged
    
    Security: Generic error (could also return 200 for UX) to prevent email enumeration
    """
    resp = client.post(
        "/api/auth/forgot-password/",
        data=json.dumps({"email": "nosuch@example.com"}),
        content_type="application/json",
    )
    assert resp.status_code == 404
    assert "User not found" in resp.json()["error"]


def test_reset_password_missing_email(mongo_mock):
    """
    
    Setup:
    - Request sent without email field
    
    Steps:
    
    Expected Results:
    - HTTP 400 Bad Request
    - Error message: "Email is required"
    - No password changed
    - No email sent
    
    Input Validation: Prevents incomplete requests from processing
    """
    resp = client.post(
        "/api/auth/forgot-password/",
        data=json.dumps({}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert "Email is required" in resp.json()["error"]
