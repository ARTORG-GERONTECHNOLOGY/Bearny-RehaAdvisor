"""
Activity Logs — integration tests
==================================

Covers every view that writes to the ``Logs`` collection after the
190-improve-db-logs refactor.  Each test asserts that:

  1. The correct ``action`` value is stored.
  2. The ``actor_role`` field (stored in MongoDB as ``userAgent``) is correct.
  3. The ``userId`` references the expected User document.
  4. The ``patient`` reference is set when relevant.
  5. Key tokens appear in ``details``.

Also tests the ``create_log`` endpoint's backward-compatibility with the
legacy ``userAgent`` body key and its new ``actor_role`` key.

Endpoints under test
---------------------
``POST /api/interventions/complete/``           → INTERVENTION_COMPLETE
``POST /api/interventions/uncomplete/``         → INTERVENTION_UNCOMPLETE
``POST /api/patients/feedback/questionaire/``   → QUESTIONNAIRE_SUBMIT
``POST /api/auth/register/``  (Patient path)    → PATIENT_REGISTER
``GET  /api/users/<id>/profile/``  (Therapist)  → OPEN_PATIENT
``POST /api/analytics/log``                     → REHATABLE / any action
"""

import json
from datetime import datetime, timedelta
from unittest import mock

import mongomock
import pytest
from bson import ObjectId
from django.contrib.auth.hashers import make_password
from django.test import Client

from core.models import (
    Intervention,
    Logs,
    Patient,
    PatientInterventionLogs,
    RehabilitationPlan,
    Therapist,
    User,
)

client = Client()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
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


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------


def _make_therapist(suffix=""):
    th_user = User(
        username=f"therapist{suffix}",
        email=f"therapist{suffix}@example.com",
        phone="000",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(
        userId=th_user,
        clinics=["Inselspital"],
        projects=["COPAIN"],
    ).save()
    return th_user, therapist


def _make_patient(therapist, suffix=""):
    p_user = User(
        username=f"patient{suffix}",
        email=f"patient{suffix}@example.com",
        phone="111",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    patient = Patient(
        userId=p_user,
        patient_code=f"PAT{suffix}",
        therapist=therapist,
        access_word="pass",
        clinic="Inselspital",
        project="COPAIN",
    ).save()
    return p_user, patient


def _make_plan_with_intervention(patient, therapist):
    from core.models import InterventionAssignment

    intervention = Intervention(
        title="TestIntervention",
        description="desc",
        content_type="Video",
        external_id="INT_ACT_001",
        language="en",
    ).save()
    assignment = InterventionAssignment(
        interventionId=intervention,
        dates=[datetime.now()],
        frequency="Daily",
    )
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime.now(),
        endDate=datetime.now() + timedelta(days=30),
        status="active",
        interventions=[assignment],
    ).save()
    return intervention, plan


# ---------------------------------------------------------------------------
# INTERVENTION_COMPLETE
# ---------------------------------------------------------------------------


def test_mark_intervention_completed_writes_intervention_complete_log(mongo_mock):
    """
    ``mark_intervention_completed`` must write a ``Logs`` doc with
    action=INTERVENTION_COMPLETE linked to the patient's User.
    """
    _, therapist = _make_therapist()
    p_user, patient = _make_patient(therapist)
    intervention, _ = _make_plan_with_intervention(patient, therapist)

    resp = client.post(
        "/api/interventions/complete/",
        data=json.dumps(
            {
                "patient_id": str(p_user.id),  # view looks up Patient by userId
                "intervention_id": str(intervention.id),
            }
        ),
        content_type="application/json",
    )
    assert resp.status_code == 200

    log = Logs.objects(action="INTERVENTION_COMPLETE").first()
    assert log is not None, "Expected INTERVENTION_COMPLETE log"
    assert log.userId.id == p_user.id
    assert log.patient.id == patient.id
    assert log.actor_role == "Patient"
    assert "TestIntervention" in (log.details or "")


def test_mark_intervention_completed_log_details_contain_date(mongo_mock):
    """Details string must include the target ISO date."""
    _, therapist = _make_therapist(suffix="2")
    p_user, patient = _make_patient(therapist, suffix="2")
    intervention, _ = _make_plan_with_intervention(patient, therapist)
    today = datetime.now().date().isoformat()

    client.post(
        "/api/interventions/complete/",
        data=json.dumps(
            {
                "patient_id": str(p_user.id),  # view looks up Patient by userId
                "intervention_id": str(intervention.id),
            }
        ),
        content_type="application/json",
    )

    log = Logs.objects(action="INTERVENTION_COMPLETE").first()
    assert log is not None
    assert today in (log.details or "")


# ---------------------------------------------------------------------------
# INTERVENTION_UNCOMPLETE
# ---------------------------------------------------------------------------


def test_unmark_intervention_completed_writes_intervention_uncomplete_log(mongo_mock):
    """
    ``unmark_intervention_completed`` must write a ``Logs`` doc with
    action=INTERVENTION_UNCOMPLETE when there is a completion log to remove.
    """
    _, therapist = _make_therapist(suffix="u")
    p_user, patient = _make_patient(therapist, suffix="u")
    intervention, plan = _make_plan_with_intervention(patient, therapist)
    today = datetime.now().date()

    PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=plan,
        date=datetime.combine(today, datetime.min.time()),
        status=["completed"],
    ).save()

    resp = client.post(
        "/api/interventions/uncomplete/",
        data=json.dumps(
            {
                "patient_id": str(p_user.id),  # view looks up Patient by userId
                "intervention_id": str(intervention.id),
                "date": today.isoformat(),
            }
        ),
        content_type="application/json",
    )
    assert resp.status_code == 200

    log = Logs.objects(action="INTERVENTION_UNCOMPLETE").first()
    assert log is not None, "Expected INTERVENTION_UNCOMPLETE log"
    assert log.userId.id == p_user.id
    assert log.actor_role == "Patient"
    assert "TestIntervention" in (log.details or "")


def test_unmark_no_log_does_not_write_uncomplete_log(mongo_mock):
    """
    When there is no completion log for the requested day the view returns 200
    'No completion log for this day' and must NOT write an INTERVENTION_UNCOMPLETE
    log (nothing was actually changed).
    """
    _, therapist = _make_therapist(suffix="un2")
    p_user, patient = _make_patient(therapist, suffix="un2")
    intervention, _ = _make_plan_with_intervention(patient, therapist)

    yesterday = (datetime.now() - timedelta(days=1)).date().isoformat()
    client.post(
        "/api/interventions/uncomplete/",
        data=json.dumps(
            {
                "patient_id": str(p_user.id),  # view looks up Patient by userId
                "intervention_id": str(intervention.id),
                "date": yesterday,
            }
        ),
        content_type="application/json",
    )

    assert Logs.objects(action="INTERVENTION_UNCOMPLETE").count() == 0


# ---------------------------------------------------------------------------
# QUESTIONNAIRE_SUBMIT
# ---------------------------------------------------------------------------


def test_submit_patient_feedback_writes_questionnaire_submit_log(mongo_mock):
    """
    ``submit_patient_feedback`` must write a QUESTIONNAIRE_SUBMIT log after
    processing feedback, regardless of whether any FeedbackQuestion records
    matched the submitted keys.
    """
    _, therapist = _make_therapist(suffix="q")
    p_user, patient = _make_patient(therapist, suffix="q")

    # The log is written at the end of the view regardless of question matches.
    # We submit a non-empty answer map to get past the "No feedback responses"
    # early-return guard.
    resp = client.post(
        "/api/patients/feedback/questionaire/",
        data={
            "userId": str(p_user.id),  # view looks up Patient by userId
            "open_feedback": "Feeling well",
        },
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200

    log = Logs.objects(action="QUESTIONNAIRE_SUBMIT").first()
    assert log is not None, "Expected QUESTIONNAIRE_SUBMIT log"
    assert log.userId.id == p_user.id
    assert log.patient.id == patient.id
    assert log.actor_role == "Patient"


# ---------------------------------------------------------------------------
# PATIENT_REGISTER
# ---------------------------------------------------------------------------


@mock.patch("core.views.auth_views.send_mail")
def test_patient_registration_writes_patient_register_log(mock_mail, mongo_mock):
    """
    A successful patient registration via ``/api/auth/register/`` must write a
    PATIENT_REGISTER log linked to the therapist's User document.
    """
    th_user, therapist = _make_therapist(suffix="pr")

    payload = {
        "userType": "Patient",
        "email": "newpatient@example.com",
        "password": "strongpass123",
        "firstName": "New",
        "lastName": "Patient",
        "therapist": str(th_user.id),  # register_view looks up by User ID, not Therapist ID
        "rehaEndDate": "2027-12-31",
        "clinic": "Inselspital",
        "project": "COPAIN",
        "patient_code": "PAT_REG_01",
    }

    resp = client.post(
        "/api/auth/register/",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 200, resp.json()

    log = Logs.objects(action="PATIENT_REGISTER").first()
    assert log is not None, "Expected PATIENT_REGISTER log"
    assert log.userId.id == th_user.id
    assert log.actor_role == "Therapist"
    assert "PAT_REG_01" in (log.details or "")
    assert "Inselspital" in (log.details or "")


@mock.patch("core.views.auth_views.send_mail")
def test_patient_registration_log_missing_on_failure(mock_mail, mongo_mock):
    """
    A failed registration (missing rehaEndDate) must NOT write a PATIENT_REGISTER log.
    """
    _make_therapist(suffix="prf")
    _, therapist = _make_therapist(suffix="prf2")

    payload = {
        "userType": "Patient",
        "email": "failpatient@example.com",
        "password": "pw",
        "firstName": "F",
        "lastName": "P",
        "therapist": str(therapist.id),
        # rehaEndDate intentionally omitted
    }

    resp = client.post(
        "/api/auth/register/",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert Logs.objects(action="PATIENT_REGISTER").count() == 0


# ---------------------------------------------------------------------------
# OPEN_PATIENT
# ---------------------------------------------------------------------------


def test_open_patient_log_written_when_therapist_views_patient_profile(mongo_mock):
    """
    ``GET /api/users/<patient_user_id>/profile/`` fires an OPEN_PATIENT log
    when the viewer is identified as a Therapist.  The log must reference the
    viewed patient document.

    ``_get_viewer_user`` is patched to return the therapist user directly —
    plain function views don't run DRF JWT auth so the real Bearer token
    path can't be exercised without a live JWT signing key.
    """
    th_user, therapist = _make_therapist(suffix="op")
    p_user, patient = _make_patient(therapist, suffix="op")

    with mock.patch("core.views.user_views._get_viewer_user", return_value=th_user):
        resp = client.get(f"/api/users/{str(p_user.id)}/profile/")

    assert resp.status_code == 200

    log = Logs.objects(action="OPEN_PATIENT").first()
    assert log is not None, "Expected OPEN_PATIENT log"
    assert log.userId.id == th_user.id
    assert log.actor_role == "Therapist"
    assert log.patient.id == patient.id
    assert "PATop" in (log.details or "")


def test_open_patient_log_not_written_when_patient_views_own_profile(mongo_mock):
    """
    When a Patient (not a Therapist) calls GET /api/users/<id>/profile/ no
    OPEN_PATIENT log must be written.
    """
    _, therapist = _make_therapist(suffix="op2")
    p_user, _ = _make_patient(therapist, suffix="op2")

    with mock.patch("core.views.user_views._get_viewer_user", return_value=p_user):
        client.get(f"/api/users/{str(p_user.id)}/profile/")

    assert Logs.objects(action="OPEN_PATIENT").count() == 0


# ---------------------------------------------------------------------------
# create_log  —  POST /api/analytics/log
# ---------------------------------------------------------------------------


def test_create_log_defaults_to_rehatable_action(mongo_mock):
    """
    When the body omits the ``action`` key the endpoint must store
    action=REHATABLE (not the old "OTHER" which is no longer a valid choice).
    """
    th_user, _ = _make_therapist(suffix="cl")

    resp = client.post(
        "/api/analytics/log",
        data=json.dumps({"user": str(th_user.id), "details": "page load"}),
        content_type="application/json",
    )
    assert resp.status_code == 201
    log = Logs.objects.first()
    assert log is not None
    assert log.action == "REHATABLE"


def test_create_log_accepts_legacy_useragent_key(mongo_mock):
    """
    The frontend still sends ``userAgent`` in the body.  The endpoint must
    accept this key and store it in ``actor_role``.
    """
    th_user, _ = _make_therapist(suffix="cl2")

    resp = client.post(
        "/api/analytics/log",
        data=json.dumps(
            {
                "user": str(th_user.id),
                "action": "REHATABLE",
                "userAgent": "Therapist",
            }
        ),
        content_type="application/json",
    )
    assert resp.status_code == 201
    log = Logs.objects.first()
    assert log is not None
    assert log.actor_role == "Therapist"


def test_create_log_accepts_actor_role_key(mongo_mock):
    """
    The new ``actor_role`` key must also be accepted, so updated frontend
    clients or other callers work correctly.
    """
    th_user, _ = _make_therapist(suffix="cl3")

    resp = client.post(
        "/api/analytics/log",
        data=json.dumps(
            {
                "user": str(th_user.id),
                "action": "HEALTH_PAGE",
                "actor_role": "Patient",
            }
        ),
        content_type="application/json",
    )
    assert resp.status_code == 201
    log = Logs.objects.first()
    assert log is not None
    assert log.actor_role == "Patient"
    assert log.action == "HEALTH_PAGE"


def test_create_log_captures_http_user_agent_header(mongo_mock):
    """
    The real HTTP User-Agent header must be stored in the ``user_agent`` field
    (separate from ``actor_role``).
    """
    th_user, _ = _make_therapist(suffix="cl4")

    resp = client.post(
        "/api/analytics/log",
        data=json.dumps({"user": str(th_user.id), "action": "REHATABLE"}),
        content_type="application/json",
        HTTP_USER_AGENT="Mozilla/5.0 TestBrowser/1.0",
    )
    assert resp.status_code == 201
    log = Logs.objects.first()
    assert log is not None
    assert "Mozilla" in (log.user_agent or "")


def test_create_log_truncates_details_to_500_chars(mongo_mock):
    """Details longer than 500 characters must be silently truncated."""
    th_user, _ = _make_therapist(suffix="cl5")
    long_details = "x" * 600

    client.post(
        "/api/analytics/log",
        data=json.dumps(
            {"user": str(th_user.id), "action": "REHATABLE", "details": long_details}
        ),
        content_type="application/json",
    )
    log = Logs.objects.first()
    assert log is not None
    assert len(log.details) == 500


def test_create_log_returns_log_id_in_response(mongo_mock):
    """The 201 response body must include ``log_id``."""
    th_user, _ = _make_therapist(suffix="cl6")

    resp = client.post(
        "/api/analytics/log",
        data=json.dumps({"user": str(th_user.id)}),
        content_type="application/json",
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "log_id" in body
    assert body["log_id"] == str(Logs.objects.first().id)


def test_create_log_unknown_user_returns_500(mongo_mock):
    """A non-existent user ObjectId must return 500 (existing documented behaviour)."""
    resp = client.post(
        "/api/analytics/log",
        data=json.dumps({"user": str(ObjectId()), "action": "REHATABLE"}),
        content_type="application/json",
    )
    assert resp.status_code == 500


def test_create_log_invalid_json_returns_500(mongo_mock):
    """Malformed JSON body must return 500."""
    resp = client.post(
        "/api/analytics/log",
        data="not-json",
        content_type="application/json",
    )
    assert resp.status_code == 500


# ---------------------------------------------------------------------------
# Logs model — field mapping
# ---------------------------------------------------------------------------


def test_logs_actor_role_stored_in_useragent_db_field(mongo_mock):
    """
    The ``actor_role`` Python attribute must be stored under the key
    ``userAgent`` in MongoDB (db_field backward-compat).  We verify this by
    reading the raw pymongo document after saving a Logs entry.
    """
    th_user, _ = _make_therapist(suffix="dbf")

    Logs(
        userId=th_user,
        action="LOGIN",
        actor_role="Therapist",
    ).save()

    from mongoengine.connection import get_db

    raw = get_db()["logs"].find_one({"action": "LOGIN"})
    assert raw is not None
    assert raw.get("userAgent") == "Therapist", (
        "actor_role must be stored under the 'userAgent' MongoDB field for backward compat"
    )
    assert "actor_role" not in raw, "Python attribute name must NOT appear in the raw document"


def test_logs_invalid_action_raises_validation_error(mongo_mock):
    """
    Saving a Logs doc with an action not in the choices list must raise a
    mongoengine ValidationError, not silently save garbage.
    """
    from mongoengine import ValidationError

    th_user, _ = _make_therapist(suffix="va")

    with pytest.raises(ValidationError):
        Logs(
            userId=th_user,
            action="OTHER",
            actor_role="Therapist",
        ).save()
