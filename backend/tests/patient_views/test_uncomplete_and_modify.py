"""
Uncomplete and modify-intervention endpoint tests
==================================================

Endpoints covered
-----------------
``POST /api/interventions/uncomplete/``   → ``unmark_intervention_completed``
``POST /api/interventions/modify-patient/`` → ``modify_intervention_from_date``

Coverage goals
--------------
Happy-path
  * Unmarking a previously completed intervention for today.
  * Graceful response when there is no completion log for the requested day.
  * Modifying an existing assignment with ``keep_current: true`` (flag-only
    update, no schedule regeneration).

Input validation (400)
  * Missing required fields for both endpoints.
  * Invalid date / effectiveFrom formats.
  * Missing ``schedule`` when ``keep_current`` is false.

Resource not found (404)
  * Unknown patient ObjectId.
  * Intervention not assigned to the patient (modify endpoint).
  * No rehabilitation plan for the patient.

HTTP method enforcement (405)
  * Both endpoints refuse GET requests.

Test setup
----------
``setup_patient_with_plan()`` creates the full chain:
User → Therapist → Patient → Intervention → RehabilitationPlan (with one
InterventionAssignment).  Each test gets a fresh isolated mongomock DB via the
``mongo_mock`` autouse fixture.
"""

import json
from datetime import datetime, timedelta
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.test import Client
from django.utils import timezone

from core.models import (
    Intervention,
    InterventionAssignment,
    Patient,
    RehabilitationPlan,
    Therapist,
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


def setup_patient_with_plan():
    """Create User → Therapist → Patient → Intervention → RehabilitationPlan."""
    therapist_user = User(
        username="th_uc",
        email="th_uc@example.com",
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
        username="p_uc",
        email="p_uc@example.com",
        phone="222",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    patient = Patient(
        userId=patient_user,
        patient_code="PAT_UC",
        therapist=therapist,
        access_word="pass",
    ).save()
    intervention = Intervention(
        external_id="uc_test_001",
        language="en",
        title="Yoga",
        description="Yoga session",
        content_type="Video",
    ).save()
    assignment = InterventionAssignment(
        interventionId=intervention,
        frequency="Daily",
        dates=[datetime.now() + timedelta(days=i) for i in range(3)],
    )
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime.now(),
        endDate=datetime.now() + timedelta(days=30),
        status="active",
        interventions=[assignment],
    ).save()
    return patient, therapist, intervention, plan


UNCOMPLETE_URL = "/api/interventions/uncomplete/"
MODIFY_URL = "/api/interventions/modify-patient/"


# ===========================================================================
# unmark_intervention_completed  —  POST /api/interventions/uncomplete/
# ===========================================================================


def test_unmark_intervention_completed_success(mongo_mock):
    """
    Given a completed log for today, POST removes the 'completed' status and
    returns 200 with an 'Unmarked' message.  This is the inverse of
    ``mark_intervention_completed``: the patient can undo an accidental
    completion tap before the therapist reviews progress.
    """
    patient, _, intervention, _ = setup_patient_with_plan()

    # First mark it completed so there is a log to unmark
    client.post(
        "/api/interventions/complete/",
        data=json.dumps(
            {
                "patient_id": str(patient.userId.id),
                "intervention_id": str(intervention.id),
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    today = timezone.localdate().isoformat()
    resp = client.post(
        UNCOMPLETE_URL,
        data=json.dumps(
            {
                "patient_id": str(patient.userId.id),
                "intervention_id": str(intervention.id),
                "date": today,
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200, resp.content.decode()
    assert "Unmarked" in resp.json().get("message", "")


def test_unmark_intervention_completed_no_log_for_day(mongo_mock):
    """
    When there is no completion log for the given day the view returns 200
    with 'No completion log for this day' rather than raising an error.
    The frontend uses this non-error response to silently handle races where
    the patient taps uncomplete on an already-unmarked item.
    """
    patient, _, intervention, _ = setup_patient_with_plan()
    five_days_ago = (timezone.localdate() - timedelta(days=5)).isoformat()

    resp = client.post(
        UNCOMPLETE_URL,
        data=json.dumps(
            {
                "patient_id": str(patient.userId.id),
                "intervention_id": str(intervention.id),
                "date": five_days_ago,
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "No completion log" in resp.json().get("message", "")


def test_unmark_intervention_completed_missing_params(mongo_mock):
    """
    Omitting any of the three required fields (``patient_id``,
    ``intervention_id``, ``date``) returns 400 with a descriptive error.
    All three are needed to uniquely identify the log to remove.
    """
    resp = client.post(
        UNCOMPLETE_URL,
        data=json.dumps({"patient_id": str(ObjectId())}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Missing required fields" in resp.content.decode()


def test_unmark_intervention_completed_patient_not_found(mongo_mock):
    """
    Supplying an unknown patient ObjectId returns 404.  The endpoint must not
    modify any state when the patient cannot be resolved.
    """
    resp = client.post(
        UNCOMPLETE_URL,
        data=json.dumps(
            {
                "patient_id": str(ObjectId()),
                "intervention_id": str(ObjectId()),
                "date": timezone.localdate().isoformat(),
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_unmark_intervention_completed_invalid_date(mongo_mock):
    """
    Sending a ``date`` value that cannot be parsed as YYYY-MM-DD returns 400.
    An invalid date would make the day-boundary window calculation impossible.
    """
    patient, _, intervention, _ = setup_patient_with_plan()
    resp = client.post(
        UNCOMPLETE_URL,
        data=json.dumps(
            {
                "patient_id": str(patient.userId.id),
                "intervention_id": str(intervention.id),
                "date": "not-a-date",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_unmark_intervention_completed_get_method_not_allowed(mongo_mock):
    """
    GET to the uncomplete endpoint returns 405.  Only POST is accepted.
    """
    resp = client.get(UNCOMPLETE_URL, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405


# ===========================================================================
# modify_intervention_from_date  —  POST /api/interventions/modify-patient/
# ===========================================================================


def test_modify_intervention_from_date_missing_fields(mongo_mock):
    """
    POST with an empty body returns 400 with ``field_errors`` naming all three
    required fields: ``patientId``, ``interventionId``, ``effectiveFrom``.
    """
    resp = client.post(
        MODIFY_URL,
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    errors = resp.json().get("field_errors", {})
    assert "patientId" in errors
    assert "interventionId" in errors
    assert "effectiveFrom" in errors


def test_modify_intervention_from_date_patient_not_found(mongo_mock):
    """
    Supplying an unknown patient ObjectId returns 404 before the system
    attempts to look up the rehabilitation plan.
    """
    resp = client.post(
        MODIFY_URL,
        data=json.dumps(
            {
                "patientId": str(ObjectId()),
                "interventionId": str(ObjectId()),
                "effectiveFrom": "2025-01-01",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_modify_intervention_from_date_intervention_not_assigned(mongo_mock):
    """
    Supplying a valid patient + plan but an ``interventionId`` not assigned to
    the patient returns 404.  The endpoint must not silently ignore a missing
    assignment.
    """
    patient, _, _, _ = setup_patient_with_plan()
    resp = client.post(
        MODIFY_URL,
        data=json.dumps(
            {
                "patientId": str(patient.id),
                "interventionId": str(ObjectId()),  # not assigned to this patient
                "effectiveFrom": "2025-01-01",
                "keep_current": True,
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_modify_intervention_from_date_keep_current(mongo_mock):
    """
    With ``keep_current: true`` the view skips schedule regeneration and only
    updates flags (``require_video_feedback``, ``notes``).  It returns 200 with
    ``success: true``.  This mode is used when the therapist wants to adjust
    metadata without rebuilding the intervention calendar.
    """
    patient, _, intervention, _ = setup_patient_with_plan()
    resp = client.post(
        MODIFY_URL,
        data=json.dumps(
            {
                "patientId": str(patient.id),
                "interventionId": str(intervention.id),
                "effectiveFrom": "2025-01-01T00:00:00",
                "keep_current": True,
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200, resp.content.decode()
    assert resp.json().get("success") is True


def test_modify_intervention_from_date_invalid_effective_from(mongo_mock):
    """
    Sending an ``effectiveFrom`` value that cannot be parsed as a date returns
    400 with ``field_errors.effectiveFrom``.  The effective-from date is the
    pivot point for splitting past vs. future scheduled sessions.
    """
    patient, _, intervention, _ = setup_patient_with_plan()
    resp = client.post(
        MODIFY_URL,
        data=json.dumps(
            {
                "patientId": str(patient.id),
                "interventionId": str(intervention.id),
                "effectiveFrom": "not-a-date",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "effectiveFrom" in resp.json().get("field_errors", {})


def test_modify_intervention_from_date_get_method_not_allowed(mongo_mock):
    """
    GET to the modify endpoint returns 405.  Only POST is accepted.
    """
    resp = client.get(MODIFY_URL, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405


def test_modify_intervention_from_date_invalid_json_body(mongo_mock):
    resp = client.post(
        MODIFY_URL,
        data="{bad",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Invalid JSON body" in resp.json()["message"]


def test_modify_intervention_from_date_no_rehab_plan(mongo_mock):
    therapist_user = User(
        username="th_np",
        email="th_np@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(userId=therapist_user, clinics=["Inselspital"]).save()
    patient_user = User(
        username="p_np",
        email="p_np@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    patient = Patient(userId=patient_user, patient_code="PAT_NP", therapist=therapist, access_word="x").save()

    resp = client.post(
        MODIFY_URL,
        data=json.dumps(
            {
                "patientId": str(patient.id),
                "interventionId": str(ObjectId()),
                "effectiveFrom": "2026-01-01",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Rehabilitation plan not found" in resp.json()["message"]


def test_modify_intervention_from_date_requires_schedule_when_keep_current_false(
    mongo_mock,
):
    patient, _, intervention, _ = setup_patient_with_plan()
    resp = client.post(
        MODIFY_URL,
        data=json.dumps(
            {
                "patientId": str(patient.id),
                "interventionId": str(intervention.id),
                "effectiveFrom": "2026-01-01",
                "keep_current": False,
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "schedule" in resp.json().get("field_errors", {})


def test_modify_intervention_from_date_schedule_generation_failed(mongo_mock):
    patient, _, intervention, _ = setup_patient_with_plan()
    resp = client.post(
        MODIFY_URL,
        data=json.dumps(
            {
                "patientId": str(patient.id),
                "interventionId": str(intervention.id),
                "effectiveFrom": "2026-01-01",
                "schedule": {
                    "unit": "day",
                    "interval": 1,
                    "startTime": "bad:time",
                    "end": {"type": "count", "count": 2},
                },
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Failed to generate new schedule" in resp.json()["message"]


def test_modify_intervention_from_date_schedule_success(mongo_mock):
    patient, _, intervention, _ = setup_patient_with_plan()
    resp = client.post(
        MODIFY_URL,
        data=json.dumps(
            {
                "patientId": str(patient.id),
                "interventionId": str(intervention.id),
                "effectiveFrom": "2026-01-01",
                "require_video_feedback": True,
                "notes": "updated notes",
                "schedule": {
                    "unit": "day",
                    "interval": 1,
                    "startDate": "2026-01-01",
                    "startTime": "08:00",
                    "end": {"type": "count", "count": 2},
                },
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200, resp.content.decode()
    assert resp.json().get("success") is True
    assert resp.json().get("updatedCount", 0) >= 1


@patch("core.views.patient_views._as_aware_utc", side_effect=Exception("boom"))
def test_modify_intervention_from_date_internal_date_conversion_error(_, mongo_mock):
    patient, _, intervention, _ = setup_patient_with_plan()
    resp = client.post(
        MODIFY_URL,
        data=json.dumps(
            {
                "patientId": str(patient.id),
                "interventionId": str(intervention.id),
                "effectiveFrom": "2026-01-01",
                "keep_current": True,
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 500
    assert "Internal date conversion error" in resp.json()["message"]
