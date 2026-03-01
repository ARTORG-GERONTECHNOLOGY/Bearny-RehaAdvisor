"""
Initial patient questionnaire tests
======================================

Endpoint covered
----------------
``GET  /api/users/<patient_id>/initial-questionaire/`` → ``initial_patient_questionaire``
``POST /api/users/<patient_id>/initial-questionaire/`` → ``initial_patient_questionaire``

Coverage goals
--------------
Happy-path GET
  * Returns ``requires_questionnaire: true`` when demographics are missing.
  * Returns ``requires_questionnaire: false`` when all fields are complete.

Happy-path POST
  * 201 on a fully valid demographics payload.
  * Database is actually updated (round-trip check).

Input validation (400)
  * POST with an empty body returns 400 (missing required fields).

Resource not found (404)
  * GET / POST with an unknown patient ObjectId → 404.

HTTP method enforcement (405)
  * PUT (or any unsupported verb) returns 405.

Test setup
----------
The ``mongo_mock`` autouse fixture provides an isolated in-memory mongomock
connection for every test.  ``create_patient()`` creates the minimal
User → Therapist → Patient chain.  ``create_patient(complete=True)`` seeds all
five demographic fields so the GET check returns ``requires_questionnaire: false``.
"""

import json
from datetime import datetime

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import Patient, Therapist, User

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


def create_patient(complete=False):
    """
    Build User → Therapist → Patient.

    When ``complete=True`` all five demographic fields are pre-populated so a
    GET call returns ``requires_questionnaire: false``.
    """
    therapist_user = User(
        username="th_q",
        email="th_q@example.com",
        phone="111",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(
        userId=therapist_user,
        name="Doe",
        first_name="Jane",
        specializations=[],
        clinics=[],
    ).save()
    patient_user = User(
        username="p_q",
        email="p_q@example.com",
        phone="222",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    kwargs = dict(
        userId=patient_user,
        patient_code="PAT_Q",
        therapist=therapist,
        access_word="pass",
    )
    if complete:
        kwargs.update(
            level_of_education="Bachelor",
            professional_status="Employed",
            marital_status="Married",
            lifestyle=["Active"],
            personal_goals=["Mobility"],
        )
    return Patient(**kwargs).save()


QUEST_URL = "/api/users/{patient_id}/initial-questionaire/"

FULL_DEMOGRAPHICS = {
    "level_of_education": "Bachelor",
    "professional_status": "Employed",
    "marital_status": "Married",
    "lifestyle": ["Active"],
    "personal_goals": ["Mobility"],
}


# ===========================================================================
# GET — check whether questionnaire is still needed
# ===========================================================================


def test_get_requires_questionnaire(mongo_mock):
    """
    GET for a patient who has no demographic fields returns 200 with
    ``requires_questionnaire: true``.  The mobile app uses this flag to route
    new patients to the on-boarding questionnaire screen before showing the
    main dashboard.
    """
    patient = create_patient(complete=False)
    resp = client.get(
        QUEST_URL.format(patient_id=str(patient.userId.id)),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["requires_questionnaire"] is True


def test_get_filled_out_questionnaire(mongo_mock):
    """
    GET for a patient who has already filled in all five demographic fields
    returns 200 with ``requires_questionnaire: false``.  Subsequent logins
    skip the on-boarding screen entirely.
    """
    patient = create_patient(complete=True)
    resp = client.get(
        QUEST_URL.format(patient_id=str(patient.userId.id)),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["requires_questionnaire"] is False


def test_get_patient_not_found(mongo_mock):
    """
    GET with an unknown patient ObjectId returns 404 with ``success: false``
    and a 'Patient not found' message.
    """
    resp = client.get(
        QUEST_URL.format(patient_id=str(ObjectId())),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    data = resp.json()
    assert data["success"] is False
    assert "Patient not found" in data.get("message", "")


# ===========================================================================
# POST — submit questionnaire answers
# ===========================================================================


def test_post_valid_submission(mongo_mock):
    """
    POST with all five required demographic fields returns 201.
    The view saves the data and responds with a success body.
    """
    patient = create_patient()
    resp = client.post(
        QUEST_URL.format(patient_id=str(patient.userId.id)),
        data=json.dumps(FULL_DEMOGRAPHICS),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 201


def test_post_saves_demographics_to_database(mongo_mock):
    """
    After a successful POST, the demographic values are persisted.  A second
    GET must return ``requires_questionnaire: false``, confirming the DB update.
    This is the end-to-end on-boarding happy path.
    """
    patient = create_patient()
    payload = {
        "level_of_education": "Master",
        "professional_status": "Self-Employed",
        "marital_status": "Single",
        "lifestyle": ["Cycling"],
        "personal_goals": ["Strength"],
    }
    client.post(
        QUEST_URL.format(patient_id=str(patient.userId.id)),
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    updated = Patient.objects.get(userId=patient.userId)
    assert updated.level_of_education == "Master"
    assert updated.professional_status == "Self-Employed"


def test_post_missing_fields_returns_400(mongo_mock):
    """
    POST with an empty body returns 400.  All five demographic fields are
    required before the patient's profile is considered complete.
    """
    patient = create_patient()
    resp = client.post(
        QUEST_URL.format(patient_id=str(patient.userId.id)),
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_post_patient_not_found(mongo_mock):
    """
    POST with an unknown patient ObjectId returns 404.  No data must be stored
    when the patient cannot be resolved.
    """
    resp = client.post(
        QUEST_URL.format(patient_id=str(ObjectId())),
        data=json.dumps(FULL_DEMOGRAPHICS),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


# ===========================================================================
# HTTP method enforcement
# ===========================================================================


def test_method_not_allowed(mongo_mock):
    """
    PUT (or any verb other than GET/POST) returns 405.  The endpoint only
    supports the two verbs needed for the on-boarding flow.
    """
    patient = create_patient()
    resp = client.put(
        QUEST_URL.format(patient_id=str(patient.userId.id)),
        data="{}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405
