"""
Patient GET-endpoint tests
===========================

Endpoints covered
-----------------
``GET /api/patients/rehabilitation-plan/patient/<patient_id>/``  → ``get_patient_plan``
``GET /api/patients/rehabilitation-plan/therapist/<patient_id>/`` → ``get_patient_plan_for_therapist``
``GET /api/patients/get-questions/<type>/<patient_id>/``          → ``get_feedback_questions``
``GET /api/patients/get-questions/<type>/<patient_id>/<iid>/``    → ``get_feedback_questions`` (with intervention)

Coverage goals
--------------
Happy-path
  * Retrieving the patient plan (with plan, without plan).
  * Retrieving the therapist view of a patient's plan.
  * Fetching feedback questions for 'Intervention' and 'Healthstatus' types.
  * Fetching questions with the optional ``intervention_id`` path segment.

Resource not found (404)
  * Unknown patient ObjectId for all three endpoints.

Input validation (400)
  * Unsupported ``questionaire_type`` string → 400.
  * Malformed ``patient_id`` (non-ObjectId) → 400.

HTTP method enforcement (405)
  * Each endpoint refuses POST requests.

Test setup
----------
The ``mongo_mock`` autouse fixture provides a fresh in-memory MongoDB for
every test.  ``setup_basic_plan(with_plan=True|False)`` creates the full
User → Therapist → Patient → optional RehabilitationPlan chain.
"""

from datetime import datetime, timedelta
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import (
    FeedbackQuestion,
    Intervention,
    InterventionAssignment,
    Patient,
    RehabilitationPlan,
    Therapist,
    Translation,
    User,
)

client = Client()


# ---------------------------------------------------------------------------
# Fixtures and helpers
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    """Isolated in-memory MongoDB for every test."""
    from mongoengine import connect, disconnect
    from mongoengine.connection import _connections

    alias = "default"
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
    """
    Create User → Therapist → Patient and optionally a RehabilitationPlan.

    Returns ``(patient, therapist, intervention, plan)``; ``plan`` is ``None``
    when ``with_plan=False``.
    """
    therapist_user = User(
        username="t1",
        email="t1@example.com",
        phone="123",
        createdAt=datetime.now(),
        isActive=True,
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

    patient_user = User(
        username="p1",
        email="p1@example.com",
        phone="456",
        createdAt=datetime.now(),
        isActive=True,
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
        title="Stretching",
        description="desc",
        content_type="Video",
        external_id="TEST-EXT-001",
        language="en",
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


# ===========================================================================
# get_patient_plan  —  GET /api/patients/rehabilitation-plan/patient/<id>/
# ===========================================================================


def test_get_patient_plan_success(mongo_mock):
    """
    GET for an existing patient with an active plan returns 200 with a
    JSON body (list or dict).
    """
    patient, _, _, _ = setup_basic_plan()
    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list) or isinstance(resp.json(), dict)


def test_get_patient_plan_patient_not_found(mongo_mock):
    """
    GET with an unknown patient ObjectId returns 404 with 'Patient not found'.
    """
    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{ObjectId()}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()


def test_get_patient_plan_post_method_not_allowed(mongo_mock):
    """
    POST to the patient-plan endpoint returns 405.  Only GET is accepted.
    """
    patient, _, _, _ = setup_basic_plan()
    resp = client.post(
        f"/api/patients/rehabilitation-plan/patient/{patient.userId.id}/",
        data="{}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


# ===========================================================================
# get_patient_plan_for_therapist
# — GET /api/patients/rehabilitation-plan/therapist/<patient_id>/
# ===========================================================================


def test_get_patient_plan_for_therapist_success(mongo_mock):
    """
    GET for a patient (identified by Patient ObjectId) with an active plan
    returns 200 with an ``interventions`` key or a success body.  Therapists
    use this view to see adherence-annotated intervention lists.
    """
    patient, _, _, _ = setup_basic_plan()
    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "interventions" in body or "message" in body


def test_get_patient_plan_for_therapist_patient_not_found(mongo_mock):
    """
    GET with an unknown Patient ObjectId returns 404 with 'Patient not found'.
    """
    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{ObjectId()}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()


def test_get_patient_plan_for_therapist_no_plan(mongo_mock):
    """
    GET for a patient who has no RehabilitationPlan returns 200 with a
    'No rehabilitation plan found' message.  The therapist view must not
    crash for new patients who have not yet been assigned a plan.
    """
    patient, _, _, _ = setup_basic_plan(with_plan=False)
    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "No rehabilitation plan found" in resp.content.decode()


def test_get_patient_plan_for_therapist_post_method_not_allowed(mongo_mock):
    """
    POST to the therapist-plan endpoint returns 405.  Only GET is accepted.
    """
    patient, _, _, _ = setup_basic_plan()
    resp = client.post(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        data="{}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


# ===========================================================================
# get_feedback_questions  —  GET /api/patients/get-questions/<type>/<id>/
# ===========================================================================


def test_fetch_feedback_questions_intervention_type(mongo_mock):
    """
    GET for type 'Intervention' returns 200.  The frontend uses this list to
    build the post-session feedback form shown after each intervention.
    """
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


def test_fetch_feedback_questions_healthstatus_type(mongo_mock):
    """
    GET for type 'Healthstatus' returns 200.  The Healthstatus questionnaire
    is shown periodically (not after every intervention) and collects ICF-based
    wellbeing ratings.
    """
    patient, _, _, _ = setup_basic_plan()
    resp = client.get(
        f"/api/patients/get-questions/Healthstatus/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200


def test_fetch_feedback_questions_with_intervention_id_in_url(mongo_mock):
    """
    GET with the optional ``intervention_id`` path segment returns 200.
    When an intervention id is supplied the view can append a video-feedback
    question if the assignment's ``require_video_feedback`` flag is set.
    """
    q = FeedbackQuestion(
        questionSubject="Intervention",
        questionKey="q_vid",
        translations=[Translation(language="en", text="Rate this?")],
        answer_type="text",
    )
    q.save()
    patient, _, intervention, _ = setup_basic_plan()
    resp = client.get(
        f"/api/patients/get-questions/Intervention/{patient.userId.id}/{intervention.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200


def test_fetch_feedback_questions_invalid_type(mongo_mock):
    """
    GET with an unrecognised ``questionaire_type`` returns 400 with
    'Invalid questionnaire type'.  The type controls which question bank is
    loaded; an unknown value must be rejected before any DB query.
    """
    patient, _, _, _ = setup_basic_plan()
    resp = client.get(
        f"/api/patients/get-questions/InvalidType/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Invalid questionnaire type" in resp.content.decode()


def test_fetch_feedback_questions_patient_not_found(mongo_mock):
    """
    GET with an unknown patient ObjectId returns 404 with 'Patient not found'.
    """
    resp = client.get(
        f"/api/patients/get-questions/Intervention/{ObjectId()}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()


def test_fetch_feedback_questions_post_method_not_allowed(mongo_mock):
    """
    POST to the questions endpoint returns 405.  Only GET is accepted.
    """
    patient, _, _, _ = setup_basic_plan()
    resp = client.post(
        f"/api/patients/get-questions/Intervention/{patient.userId.id}/",
        data="{}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


def test_fetch_feedback_questions_invalid_patient_id(mongo_mock):
    """
    GET with a ``patient_id`` that is not a valid ObjectId returns 400 with
    'Invalid patient id'.  The endpoint must validate the format before
    attempting a DB lookup.
    """
    resp = client.get(
        "/api/patients/get-questions/Intervention/not-an-objectid/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
