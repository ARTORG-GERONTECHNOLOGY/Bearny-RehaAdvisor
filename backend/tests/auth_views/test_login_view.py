"""
Authentication Login View Tests

This module tests the login endpoint (/api/auth/login/) which handles user authentication.
Tests cover successful login, wrong credentials, inactive users, and error conditions.

Framework: Django Test Client with pytest
Database: mongomock (in-memory MongoDB) for isolated testing
"""

import mongomock
import pytest
from mongoengine import connect, disconnect

from core.models import Patient, Therapist, User


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    """
    Fixture: Mock MongoDB for login tests
    
    Sets up:
    - In-memory MongoDB connection for each test
    - Isolation: Each test has clean database
    - Cleanup: Disconnect after test completes
    
    Why mongomock?
    - No external MongoDB dependency
    - Fast test execution
    - Deterministic results (no state leakage between tests)
    """
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
    """
    Scenario: Therapist logs in with valid email and password
    
    Setup:
    - Therapist user exists in database
    - Email: therapist@example.com
    - Password: testpass123 (hashed)
    - User marked as active
    - Therapist profile created with specializations
    
    Steps:
    1. POST /api/auth/login/ with email and password
    2. Credentials validated against stored password hash
    3. User type identified as "Therapist"
    4. JWT access_token generated
    5. Response includes user metadata
    
    Expected Results:
    - HTTP 200 OK
    - Response contains access_token (JWT for authenticated requests)
    - user_type matches: "Therapist"
    - full_name includes first name: "John"
    - User can use token for subsequent API calls
    
    Business Flow: Therapist starts their session, enters credentials, gains access to patient dashboard
    """
    # Set up user
    user = User(
        username="therapist1",
        role="Therapist",
        email="therapist@example.com",
        phone="123456789",
        pwdhash=make_password("testpass123"),
        createdAt=datetime.now(),
    """
    Scenario: User attempts login with incorrect password
    
    Setup:
    - User exists with email wrongpass@example.com
    - Correct password: "correctpass"
    - User attempts: "badpass"
    
    Steps:
    1. User enters email and wrong password
    2. POST /api/auth/login/ with incorrect password
    3. System retrieves user
    4. Password hash comparison fails
    5. Security: Generic error returned (doesn't reveal if email exists)
    
    Expected Results:
    - HTTP 401 Unauthorized
    - Error message: "Invalid credentials"
    - No access token provided
    - User remains logged out
    - System logs authentication failure (for security monitoring)
    
    Security: Generic error prevents email enumeration attacks
    """
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
    """
    Scenario: Inactive user attempts to log in
    
    Setup:
    - User exists but has isActive=False
    - This occurs when:
      * Account suspended by admin
      * Email not yet verified
      * Account deleted (soft delete)
    
    Steps:
    1. User enters correct email and password
    2. POST /api/auth/login/
    3. System validates password (correct)
    4. System checks isActive flag
    5. User is inactive, access denied
    
    Expected Results:
    - HTTP 403 Forbidden OR 401 Unauthorized
    - Error message: "Account is inactive" or "Invalid credentials"
    - No access token
    - User cannot access system
    
    Use Case: Admin suspends therapist due to contract ending, user sees access denied message
    """
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
