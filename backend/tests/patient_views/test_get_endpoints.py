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
    PatientType,
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


def setup_basic_plan(with_plan=True):
    # Therapist
    therapist_user = User(
        username="t1", email="t1@example.com", phone="123", createdAt=datetime.now(), isActive=True
    )
    therapist_user.save()
    therapist = Therapist(
        userId=therapist_user,
        name="Doe",
        first_name="John",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    )
    therapist.save()

    # Patient
    patient_user = User(
        username="p1", email="p1@example.com", phone="456", createdAt=datetime.now(), isActive=True
    )
    patient_user.save()
    patient = Patient(
        userId=patient_user,
        patient_code="PAT001",
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

    intervention = Intervention(
        title="Stretching", description="desc", content_type="Video",external_id="TEST-EXT-001", language="en",
    )
    intervention.save()

    plan = None
    if with_plan:
        assignment = InterventionAssignment(
            interventionId=intervention,
            frequency="Daily",
            notes="",
            dates=[datetime.now() + timedelta(days=i) for i in range(3)],
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


def test_get_patient_plan_success(mongo_mock):
    patient, _, _, _ = setup_basic_plan()
    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list) or isinstance(resp.json(), dict)


def test_get_patient_plan_patient_not_found(mongo_mock):
    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{ObjectId()}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()


def test_get_patient_plan_for_therapist_success(mongo_mock):
    patient, _, _, _ = setup_basic_plan()
    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "interventions" in resp.json() or "message" in resp.json()


def test_get_patient_plan_for_therapist_patient_not_found(mongo_mock):
    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{ObjectId()}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()


def test_get_patient_plan_for_therapist_no_plan(mongo_mock):
    patient, _, _, _ = setup_basic_plan(with_plan=False)
    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "No rehabilitation plan found" in resp.content.decode()


def test_fetch_feedback_questions_intervention_type(mongo_mock):
    # Setup a feedback question
    q = FeedbackQuestion(
        questionSubject="Intervention",
        questionKey="q1",
        translations=[Translation(language="en", text="How was it?")],
        answer_type="text",
    )
    q.save()
    patient, _, _, _ = setup_basic_plan()

    resp = client.get(
        f"/api/patients/get-questions/Intervention/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list) or "questions" in resp.json()


def test_fetch_feedback_questions_invalid_type(mongo_mock):
    patient, _, _, _ = setup_basic_plan()

    resp = client.get(
        f"/api/patients/get-questions/InvalidType/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Invalid questionnaire type" in resp.content.decode()


def test_fetch_feedback_questions_patient_not_found(mongo_mock):
    resp = client.get(
        f"/api/patients/get-questions/Intervention/{ObjectId()}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()
