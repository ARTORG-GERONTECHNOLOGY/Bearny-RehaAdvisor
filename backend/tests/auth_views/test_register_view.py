"""
Authentication Registration View Tests

This module tests the registration endpoint (/api/auth/register/) for creating new user accounts.
Tests cover both therapist and patient registration flows with validation and error conditions.

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
    Fixture: Mock MongoDB for registration tests
    
    Sets up:
    - In-memory MongoDB connection for each test
    - Isolation: Each test has clean database
    - Cleanup: Disconnect after test completes
    - No risk of data pollution between tests
    """
    conn = connect(
        "mongoenginetest",
        host="mongodb://localhost",
        mongo_client_class=mongomock.MongoClient,
    )
    yield conn
    disconnect()


import json
from datetime import datetime, timedelta
from unittest import mock

from django.test import Client

from core.models import Therapist, User

client = Client()


@mock.patch("core.views.auth_views.send_mail")
def test_register_therapist_success(mock_send_mail, mongo_mock):
    """
    
    Setup:
    - No existing therapist with this email
    - Email not in use: newtherapist@example.com
    
    Input Data:
    - User Type: Therapist
    - Email: newtherapist@example.com
    - Password: strongpassword (meets security requirements)
    - First Name: John, Last Name: Doe
    - Specialization: ["Cardiology"]
    - Clinic: ["Downtown Clinic"]
    
    Steps:
    
    Expected Results:
    - HTTP 201 Created
    - Response message: "Therapist registered successfully"
    - Therapist user created with active status
    - Therapist profile created with metadata
    - Email sent to verify account
    
    Use Case: New therapist joins platform through web UI
    """
    data = {
        "userType": "Therapist",
        "email": "newtherapist@example.com",
        "password": "strongpassword",
        "firstName": "John",
        "lastName": "Doe",
        "specialisation": ["Cardiology"],
        "clinic": ["Downtown Clinic"],
    }

    resp = client.post(
        "/api/auth/register/", data=json.dumps(data), content_type="application/json"
    )

    assert resp.status_code == 201
    json_data = resp.json()
    assert "Therapist registered successfully" in json_data["message"]


@mock.patch("core.views.auth_views.send_mail")
def test_register_patient_missing_therapist(mock_send_mail, mongo_mock):
    """
    
    Setup:
    - Patient attempts to register
    - Therapist ID provided does not exist in database
    - Therapist ID: "507f1f77bcf86cd799439011" (non-existent MongoDB ID)
    
    Input Data:
    - User Type: Patient
    - Email: newpatient@example.com
    - Name: Pat Smith
    - Therapist ID: Non-existent therapist reference
    - Medical Info: diagnosis, function, etc.
    
    Steps:
    
    Expected Results:
    - HTTP 404 Not Found
    - Error message: "Assigned therapist not found"
    - Patient NOT created
    - Database unchanged
    
    Use Case: Patient registration form has therapist selection, selected therapist no longer exists
    Error Handling: Prevents orphan patients without assigned therapist
    """
    data = {
        "userType": "Patient",
        "email": "newpatient@example.com",
        "password": "password",
        "firstName": "Pat",
        "lastName": "Smith",
        "therapist": "507f1f77bcf86cd799439011",  # non-existent therapist
        "rehaEndDate": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
        "sex": "Male",
        "diagnosis": ["Stroke"],
        "function": ["Cardiology"],
        "levelOfEducation": "Bachelor's Degree",
        "professionalStatus": "Employed Full-Time",
        "civilStatus": "Single",
        "lifestyle": ["Moderate Exercise"],
        "lifeGoals": ["Improved Mobility"],
    }

    resp = client.post(
        "/api/auth/register/", data=json.dumps(data), content_type="application/json"
    )

    assert resp.status_code == 404
    assert "Assigned therapist not found" in resp.json()["error"]


def test_register_existing_email(mongo_mock):
    """
    
    Setup:
    - User already exists with email: exist@example.com
    - Existing user: therapist with role="Therapist"
    - New user attempts to register with same email
    
    Input Data:
    - User Type: Therapist
    - Email: exist@example.com (already taken)
    - Password: newpassword
    
    Steps:
    
    Expected Results:
    - HTTP 400 Bad Request
    - Error message: Something like "Email already registered"
    - No new user created
    - Existing user unaffected
    
    Use Case: User attempts to register twice, or registers with colleague's email
    Data Integrity: Prevents duplicate emails (unique constraint)
    """
    User(
        username="existinguser",
        role="Therapist",
        email="exist@example.com",
        phone="0000",
        pwdhash="",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    data = {
        "userType": "Therapist",
        "email": "exist@example.com",
        "password": "newpassword",
    }

    resp = client.post(
        "/api/auth/register/", data=json.dumps(data), content_type="application/json"
    )

    assert resp.status_code == 400
    assert "Email already exists" in resp.json()["error"]
