import json
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from bson import ObjectId
from django.test import Client

from core.models import (
    DefaultInterventions,
    FeedbackQuestion,
    Intervention,
    InterventionAssignment,
    Patient,
    PatientInterventionLogs,
    RehabilitationPlan,
    Therapist,
    Translation,
    User,
)

client = Client()


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
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


def setup_patient_with_plan():
    # Create User & Therapist
    therapist_user = User(
        username="t1", email="t1@example.com", phone="123", createdAt=datetime.now()
    )
    therapist_user.save()
    therapist = Therapist(
        userId=therapist_user,
        name="Doe",
        first_name="John",
        specializations=["Cardiology"],
        clinics=["Downtown Clinic"],
    )
    therapist.save()

    # Create Patient
    patient_user = User(
        username="p1", email="p1@example.com", phone="456", createdAt=datetime.now()
    )
    patient_user.save()
    patient = Patient(
        userId=patient_user,
        name="Patient",
        first_name="One",
        access_word="pass",
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
    )
    patient.save()

    # Create Intervention
    intervention = Intervention(
        title="Stretching", description="Stretching exercises", content_type="Video"
    )
    intervention.save()

    # Add Rehab Plan
    assignment = InterventionAssignment(
        interventionId=intervention,
        frequency="Daily",
        notes="",
        dates=[datetime.now() + timedelta(days=i) for i in range(5)],
    )
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime.now(),
        endDate=datetime.now() + timedelta(days=30),
        status="active",
        interventions=[assignment],
    )
    plan.save()

    return patient, therapist, intervention, plan


@patch("core.views.patient_views.getattr", return_value="mocked")
def test_submit_feedback_success_intervention(mock_getattr, mongo_mock):
    patient, therapist, intervention, _ = setup_patient_with_plan()
    FeedbackQuestion.objects.create(
        questionSubject="Intervention",
        questionKey="how_did_it_go",
        answer_type="text",
        translations=[Translation(language="en", text="How did it go?")],
        possibleAnswers=[],
    )

    # Minimal feedback response
    payload = {
        "userId": str(patient.userId.id),
        "interventionId": str(intervention.id),
        "responses": [{"question": "How did it go?", "answer": ["Great"]}],
    }

    resp = client.post(
        "/api/patients/feedback/questionaire/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",  # Mocked auth
    )
    assert resp.status_code in [201, 200]
    assert "Feedback submitted successfully" in resp.content.decode()


def test_submit_feedback_no_responses(mongo_mock):
    patient, _, _, _ = setup_patient_with_plan()

    payload = {"userId": str(patient.userId.id), "interventionId": "", "responses": []}
    resp = client.post(
        "/api/patients/feedback/questionaire/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "No feedback responses provided" in resp.content.decode()


def test_submit_feedback_patient_not_found(mongo_mock):
    FeedbackQuestion.objects.create(
        questionSubject="Intervention",
        questionKey="q_test",
        answer_type="text",
        translations=[Translation(language="en", text="Q?")],
        possibleAnswers=[],
    )

    payload = {
        "userId": str(ObjectId()),  # Non-existent user
        "interventionId": str(ObjectId()),  # Valid ObjectId, but will fail
        "responses": [{"question": "Q?", "answer": ["A"]}],
    }
    resp = client.post(
        "/api/patients/feedback/questionaire/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()


def test_mark_intervention_completed_success(mongo_mock):
    patient, _, intervention, _ = setup_patient_with_plan()
    payload = {
        "patient_id": str(patient.userId.id),
        "intervention_id": str(intervention.id),
    }
    resp = client.post(
        "/api/interventions/complete/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "Marked as completed successfully" in resp.content.decode()


def test_mark_intervention_completed_missing_params(mongo_mock):
    resp = client.post(
        "/api/interventions/complete/",
        data=json.dumps({}),  # Empty payload
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Missing patient_id or intervention_id" in resp.content.decode()


def test_mark_intervention_completed_patient_not_found(mongo_mock):
    _, _, intervention, _ = setup_patient_with_plan()
    payload = {
        "patient_id": str(ObjectId()),  # Non-existent
        "intervention_id": str(intervention.id),
    }
    resp = client.post(
        "/api/interventions/complete/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()


def test_remove_intervention_success(mongo_mock):
    patient, _, intervention, plan = setup_patient_with_plan()
    payload = {"intervention": str(intervention.id), "patientId": str(patient.id)}
    resp = client.post(
        "/api/interventions/remove-from-patient/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "Intervention dates removed successfully" in resp.content.decode()


def test_remove_intervention_missing_params(mongo_mock):
    resp = client.post(
        "/api/interventions/remove-from-patient/",
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Missing required parameters" in resp.content.decode()


def test_remove_intervention_patient_not_found(mongo_mock):
    payload = {"intervention": str(ObjectId()), "patientId": str(ObjectId())}
    resp = client.post(
        "/api/interventions/remove-from-patient/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()
