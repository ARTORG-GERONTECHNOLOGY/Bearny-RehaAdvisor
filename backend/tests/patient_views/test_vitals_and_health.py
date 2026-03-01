"""
Vitals and health-history endpoint tests
=========================================

Endpoints covered
-----------------
``POST /api/patients/vitals/manual/<patient_id>/``        → ``add_manual_vitals``
``GET  /api/patients/vitals/exists/<patient_id>/``        → ``vitals_exists_for_day``
``GET  /api/patients/healthstatus-history/<patient_id>/`` → ``get_patient_healthstatus_history``

Coverage goals
--------------
Happy-path
  * Recording blood-pressure and weight measurements.
  * Checking whether a vitals record already exists for a given date.
  * Fetching the empty health-status history for a new patient.

Input validation (400)
  * Missing vitals fields (no weight, bp_sys, or bp_dia provided).
  * Missing or malformed ``date`` query / body parameter.

Resource not found (404)
  * Unknown patient ObjectId for all three endpoints.

HTTP method enforcement (405)
  * Each endpoint refuses wrong HTTP verbs.

Response shape verification
  * ``add_manual_vitals`` returns ``ok: true`` and the new record ``id``.
  * ``vitals_exists_for_day`` returns ``{"exists": true|false}``.
  * ``get_patient_healthstatus_history`` returns ``{"history": [...]}``.

Test setup
----------
The ``mongo_mock`` autouse fixture provides an isolated in-memory mongomock
connection for every test.  ``create_patient()`` builds the minimum User →
Therapist → Patient chain required by each endpoint.
"""

import json
from datetime import datetime, timedelta
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import FitbitData, Patient, PatientVitals, Therapist, User

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


def create_patient():
    """Create a minimal User → Therapist → Patient chain."""
    therapist_user = User(
        username="th_vit",
        email="th_vit@example.com",
        phone="111",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(
        userId=therapist_user,
        name="Doe",
        first_name="Jane",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    ).save()
    patient_user = User(
        username="p_vit",
        email="p_vit@example.com",
        phone="222",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    return Patient(
        userId=patient_user,
        patient_code="PAT_VIT",
        therapist=therapist,
        access_word="pass",
    ).save()


VITALS_URL = "/api/patients/vitals/manual/{patient_id}/"
EXISTS_URL = "/api/patients/vitals/exists/{patient_id}/"
HISTORY_URL = "/api/patients/healthstatus-history/{patient_id}/"


# ===========================================================================
# add_manual_vitals  —  POST /api/patients/vitals/manual/<patient_id>/
# ===========================================================================


def test_add_manual_vitals_success_with_bp(mongo_mock):
    """
    POST with valid blood-pressure readings (``bp_sys``, ``bp_dia``) returns
    200 with ``ok: true`` and the newly created record ``id``.  Blood pressure
    data is the primary vital sign recorded during cardiac rehabilitation.
    """
    patient = create_patient()
    resp = client.post(
        VITALS_URL.format(patient_id=str(patient.id)),
        data=json.dumps({"bp_sys": 120, "bp_dia": 80}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200, resp.content.decode()
    data = resp.json()
    assert data.get("ok") is True
    assert "id" in data


def test_add_manual_vitals_success_with_weight(mongo_mock):
    """
    POST with a valid ``weight_kg`` returns 200 with ``ok: true``.  Weight is
    an independent vital sign that may be recorded without blood pressure.
    """
    patient = create_patient()
    resp = client.post(
        VITALS_URL.format(patient_id=str(patient.id)),
        data=json.dumps({"weight_kg": 72.5}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200, resp.content.decode()
    assert resp.json().get("ok") is True


def test_add_manual_vitals_no_vitals_provided(mongo_mock):
    """
    POST with an empty body (no ``weight_kg``, ``bp_sys``, or ``bp_dia``)
    returns 400.  At least one measurement is required for the record to be
    clinically meaningful.
    """
    patient = create_patient()
    resp = client.post(
        VITALS_URL.format(patient_id=str(patient.id)),
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "No vitals provided" in resp.content.decode()


def test_add_manual_vitals_patient_not_found(mongo_mock):
    """
    Supplying an unknown patient ObjectId returns 404.  The endpoint must not
    create orphaned vitals records with no associated patient.
    """
    resp = client.post(
        VITALS_URL.format(patient_id=str(ObjectId())),
        data=json.dumps({"weight_kg": 70}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_add_manual_vitals_invalid_date(mongo_mock):
    """
    Supplying a ``date`` value that cannot be parsed as ISO 8601 returns 400.
    Correctly formatted dates are essential for accurate trend analysis.
    """
    patient = create_patient()
    resp = client.post(
        VITALS_URL.format(patient_id=str(patient.id)),
        data=json.dumps({"weight_kg": 70, "date": "not-a-date"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_add_manual_vitals_get_method_not_allowed(mongo_mock):
    """
    GET to the manual-vitals endpoint returns 405.  Only POST is accepted.
    """
    patient = create_patient()
    resp = client.get(
        VITALS_URL.format(patient_id=str(patient.id)),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


# ===========================================================================
# vitals_exists_for_day  —  GET /api/patients/vitals/exists/<patient_id>/
# ===========================================================================


def test_vitals_exists_for_day_false_when_no_data(mongo_mock):
    """
    GET when no vitals have been recorded returns 200 with ``exists: false``.
    The frontend uses this flag to decide whether to show the data-entry form.
    """
    patient = create_patient()
    today = datetime.now().strftime("%Y-%m-%d")
    resp = client.get(
        EXISTS_URL.format(patient_id=str(patient.id)) + f"?date={today}",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert resp.json()["exists"] is False


def test_vitals_exists_for_day_true_after_adding_vitals(mongo_mock):
    """
    After a PatientVitals record is written for today, ``exists`` returns true.
    Confirms the round-trip: record created → check → ``exists: true``.
    """
    patient = create_patient()
    today = datetime.now().strftime("%Y-%m-%d")
    today_dt = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)

    # Write a vitals entry directly (naive datetime, consistent with how
    # vitals_exists_for_day queries: naive day-boundary window)
    PatientVitals(
        user=patient.userId,
        patientId=patient,
        date=today_dt,
        weight_kg=75.0,
    ).save()

    resp = client.get(
        EXISTS_URL.format(patient_id=str(patient.id)) + f"?date={today}",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert resp.json()["exists"] is True


def test_vitals_exists_for_day_patient_not_found(mongo_mock):
    """
    Supplying an unknown patient ObjectId returns 404.
    """
    today = datetime.now().strftime("%Y-%m-%d")
    resp = client.get(
        EXISTS_URL.format(patient_id=str(ObjectId())) + f"?date={today}",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_vitals_exists_for_day_missing_date(mongo_mock):
    """
    Omitting the ``date`` query parameter returns 400.  The endpoint needs an
    explicit date to know which day's window to search.
    """
    patient = create_patient()
    resp = client.get(
        EXISTS_URL.format(patient_id=str(patient.id)),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_vitals_exists_for_day_post_method_not_allowed(mongo_mock):
    """
    POST to the vitals-exists endpoint returns 405.  Only GET is accepted.
    """
    patient = create_patient()
    today = datetime.now().strftime("%Y-%m-%d")
    resp = client.post(
        EXISTS_URL.format(patient_id=str(patient.id)) + f"?date={today}",
        data="{}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


@patch("core.views.patient_views.PatientVitals.objects", side_effect=Exception("db down"))
def test_vitals_exists_for_day_fallback_to_fitbit_data(_, mongo_mock):
    patient = create_patient()
    today_dt = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)
    FitbitData(user=patient.userId, date=today_dt, weight_kg=70.0).save()

    resp = client.get(
        EXISTS_URL.format(patient_id=str(patient.id)) + f"?date={today_dt.strftime('%Y-%m-%d')}",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert resp.json()["exists"] is True


# ===========================================================================
# get_patient_healthstatus_history
# — GET /api/patients/healthstatus-history/<patient_id>/
# ===========================================================================


def test_get_healthstatus_history_success_empty(mongo_mock):
    """
    GET for a patient who has no ICF-rating records returns 200 with an empty
    ``history`` list.  The endpoint must not crash on an empty database.
    """
    patient = create_patient()
    resp = client.get(
        HISTORY_URL.format(patient_id=str(patient.userId.id)),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "history" in data
    assert data["history"] == []


def test_get_healthstatus_history_patient_not_found(mongo_mock):
    """
    Supplying an unknown patient ObjectId returns 404.
    """
    resp = client.get(
        HISTORY_URL.format(patient_id=str(ObjectId())),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_get_healthstatus_history_post_method_not_allowed(mongo_mock):
    """
    POST to the healthstatus-history endpoint returns 405.  Only GET is accepted.
    """
    patient = create_patient()
    resp = client.post(
        HISTORY_URL.format(patient_id=str(patient.userId.id)),
        data="{}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405
