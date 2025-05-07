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
from datetime import datetime, timedelta
from unittest import mock

from django.test import Client

from core.models import Therapist, User

client = Client()


@mock.patch("core.views.auth_views.send_mail")
def test_register_therapist_success(mock_send_mail, mongo_mock):
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
