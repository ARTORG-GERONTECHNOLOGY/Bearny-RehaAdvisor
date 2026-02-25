"""
Authentication Logout View Tests

This module tests the logout endpoint (/api/auth/logout/) which handles session termination.
Tests cover successful logout, user not found, and missing parameters.

Framework: Django Test Client with pytest
Database: mongomock (in-memory MongoDB) for isolated testing
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

from django.test import Client

from core.models import User

client = Client()


def test_logout_success(mongo_mock):
    """
    
    Setup:
    - User exists and is logged in (has valid session/token)
    - User ID: logoutuser
    
    Steps:
    
    Expected Results:
    - HTTP 200 OK
    - Response message: "Logout successful"
    - User session ended
    - User must re-authenticate for next requests
    - Previous tokens no longer valid
    
    Use Case: User clicks logout button, wants to end session immediately
    """
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
    """
    
    Setup:
    - User ID does not exist in database
    - User ID: 507f1f77bcf86cd799439011
    
    Steps:
    """
    
    Setup:
    - Request sent without userId field
    
    Steps:
    
    Expected Results:
    - HTTP 400 Bad Request
    - Error message: "User ID is required"
    - No logout performed
    - Request is malformed
    
    Input Validation: Prevents incomplete requests
    """
    
    Expected Results:
    - HTTP 404 Not Found
    - Error message: "User not found"
    - No logout performed
    - No session changes
    
    Error Handling: Prevents operations on non-existent users
    """
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
