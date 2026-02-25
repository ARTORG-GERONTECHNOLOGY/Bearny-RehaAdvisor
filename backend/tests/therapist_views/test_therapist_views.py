"""
Therapist Views API Tests

This module tests therapist-facing API endpoints including intervention assignment,
patient monitoring, custom intervention creation, and treatment plan management.

Tests cover:
- Assigning interventions to patients
- Monitoring patient adherence and progress
- Creating custom interventions
- Managing rehabilitation plans
- Error handling and validation

Framework: Django Test Client with pytest
Database: mongomock (in-memory MongoDB) for isolated testing
Models: Therapist, Patient, Intervention, RehabilitationPlan, InterventionAssignment
"""

import json
from datetime import datetime, timedelta

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import (
    DefaultInterventions,
    Intervention,
    InterventionAssignment,
    Patient,
    PatientInterventionLogs,
    PatientType,
    RehabilitationPlan,
    Therapist,
    User,
)

client = Client()


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    """
    Fixture: Mock MongoDB for therapist view tests
    
    Sets up:
    - In-memory MongoDB connection for each test
    - Isolation: Each test has clean database
    - Cleanup: Disconnect after test completes
    - No risk of data pollution between tests
    """
    import mongomock
    from mongoengine import connect, disconnect

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


def create_therapist_with_patients():
    user = User(
        username="therapist",
        email="t@example.com",
        phone="123",
        createdAt=datetime.now(),
    ).save()
    therapist = Therapist(
        userId=user,
        name="Therapist",
        first_name="John",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    ).save()

    patient_user = User(
        username="patient", email="p@example.com", phone="456", createdAt=datetime.now()
    ).save()
    patient = Patient(
        userId=patient_user,
        patient_code="PAT001",
        name="Doe",
        first_name="Jane",
        access_word="word",
        age="30",
        therapist=therapist,
        sex="Male",
        diagnosis=["Stroke"],
        function=["Cardiology"],
        level_of_education="High School",
        professional_status="Employed Full-Time",
        marital_status="Single",
        lifestyle=["Moderate Exercise"],
        personal_goals=["Improved Mobility"],
        reha_end_date=datetime.now() + timedelta(days=30),
    ).save()

    return therapist, patient


def create_rehabilitation_plan(patient):
    intervention = Intervention(
        title="Stretching",
        description="Stretching session",
        content_type="Video",
        patient_types=[
            PatientType(
                type="Cardiology",
                diagnosis="Stroke",
                frequency="Daily",
                include_option=True,
            )
        ],
    ).save()

    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=patient.therapist,
        startDate=datetime.now() - timedelta(days=10),
        endDate=datetime.now() + timedelta(days=20),
        status="active",
        interventions=[],
        createdAt=datetime.now(),
        updatedAt=datetime.now(),
    )
    plan.save()

    return plan, intervention


def test_list_therapist_patients_success():
    therapist, patient = create_therapist_with_patients()
    resp = client.get(
        f"/api/therapists/{therapist.userId.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(p["username"] == patient.userId.username for p in data)


def test_list_therapist_patients_not_found():
    resp = client.get(
        f"/api/therapists/{ObjectId()}/patients/", HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 404
    assert resp.json()["error"] == "Therapist not found"


def test_get_rehabilitation_plan_success():
    therapist, patient = create_therapist_with_patients()
    plan, intervention = create_rehabilitation_plan(patient)

    # Simulate adding intervention assignment to the plan
    plan.interventions.append(
        InterventionAssignment(
            interventionId=intervention,
            frequency="Daily",
            notes="Stretch daily",
            dates=[
                datetime.now() - timedelta(days=5),
                datetime.now(),
                datetime.now() + timedelta(days=5),
            ],
        )
    )

    plan.save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "startDate" in data
    assert "interventions" in data
    # Or other keys you expect


def test_get_rehabilitation_plan_no_plans():
    therapist, patient = create_therapist_with_patients()
    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "rehab_plan" in data
    assert data["rehab_plan"] == []
    assert data["message"] == "No rehabilitation plan found"


def test_get_rehabilitation_plan_patient_not_found():
    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{ObjectId()}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert resp.json()["error"] == "Patient not found"
    data = resp.json()
    assert "error" in data
