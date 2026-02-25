"""
Cleaned authentication register view tests (minimal, valid).
"""

import mongomock
import pytest
from mongoengine import connect, disconnect

import json
from datetime import datetime, timedelta
from unittest import mock

from django.test import Client

from core.models import Therapist, User


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


@mock.patch("core.views.auth_views.send_mail")
def test_register_therapist_success(mock_send_mail, mongo_mock):
    data = {
        "userType": "Therapist",
        "email": "newtherapist@example.com",
        "password": "strongpassword",
        "firstName": "John",
        "lastName": "Doe",
    }

    resp = client.post(
        "/api/auth/register/", data=json.dumps(data), content_type="application/json"
    )

    assert resp.status_code == 200


@mock.patch("core.views.auth_views.send_mail")
def test_register_patient_missing_therapist(mock_send_mail, mongo_mock):
    data = {
        "userType": "Patient",
        "email": "newpatient@example.com",
        "password": "password",
        "firstName": "Pat",
        "lastName": "Smith",
        "therapist": "507f1f77bcf86cd799439011",
        "rehaEndDate": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
    }

    resp = client.post(
        "/api/auth/register/", data=json.dumps(data), content_type="application/json"
    )

    assert resp.status_code == 404


def test_register_existing_email(mongo_mock):
    User(
        username="existinguser",
        role="Therapist",
        email="exist@example.com",
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
