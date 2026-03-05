"""
Therapist views tests
=====================

Endpoints covered
-----------------
``GET  /api/therapists/<therapist_id>/patients/`` → ``list_therapist_patients``
``POST /api/analytics/log``                        → ``create_log``

Coverage goals
--------------
Happy-path
  * Therapist can list active assigned patients.
  * Response includes profile fields used by the therapist UI.
  * Analytics log entries can be created for a valid user.

Input validation / branch coverage
  * Invalid therapist ObjectId returns HTTP 400.
  * Non-existent therapist returns HTTP 404.
  * Wrong method on patient list returns HTTP 405.
  * Inactive patients are excluded from therapist list.
  * Invalid analytics payloads return HTTP 500 with error response.

Test setup
----------
The ``mongo_mock`` autouse fixture provides an isolated in-memory mongomock
connection for every test function.
"""

import json
from datetime import datetime, timedelta

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import (
    AnswerOption,
    FeedbackEntry,
    FeedbackQuestion,
    FitbitData,
    HealthQuestionnaire,
    Intervention,
    InterventionAssignment,
    Logs,
    Patient,
    PatientICFRating,
    PatientInterventionLogs,
    QuestionnaireAssignment,
    RehabilitationPlan,
    Therapist,
    Translation,
    User,
)
from core.views.therapist_views import (
    _adherence,
    _avg,
    _day_key,
    _feedback_computing,
    _sum_points_for_day,
)

client = Client()


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


def create_therapist_with_patient(*, patient_active=True):
    therapist_user = User(
        username="therapist",
        email="t@example.com",
        phone="123",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(
        userId=therapist_user,
        name="Therapist",
        first_name="John",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    ).save()

    patient_user = User(
        username="patient",
        email="p@example.com",
        phone="456",
        createdAt=datetime.now(),
        isActive=patient_active,
    ).save()
    patient = Patient(
        userId=patient_user,
        patient_code=f"PAT-{str(ObjectId())[-6:]}",
        name="Doe",
        first_name="Jane",
        access_word="word",
        age="30",
        therapist=therapist,
        clinic="Inselspital",
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


def _make_therapist(username, clinics):
    """Helper: create a therapist user + Therapist with given clinics."""
    u = User(
        username=username,
        email=f"{username}@example.com",
        phone="000",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    return Therapist(
        userId=u,
        name="T",
        first_name="F",
        specializations=["Cardiology"],
        clinics=clinics,
    ).save()


def _make_patient(username, therapist, clinic):
    """Helper: create a patient user + Patient with given clinic."""
    u = User(
        username=username,
        email=f"{username}@example.com",
        phone="000",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    return Patient(
        userId=u,
        patient_code=f"PAT-{str(ObjectId())[-6:]}",
        name="Doe",
        first_name=username,
        access_word="w",
        age="30",
        therapist=therapist,
        clinic=clinic,
        sex="Male",
        diagnosis=["Stroke"],
        function=["Cardiology"],
        level_of_education="High School",
        professional_status="Employed Full-Time",
        marital_status="Single",
        lifestyle=[],
        personal_goals=[],
    ).save()


def test_list_therapist_patients_success():
    therapist, patient = create_therapist_with_patient()

    resp = client.get(
        f"/api/therapists/{therapist.userId.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(p["username"] == patient.userId.username for p in data)


def test_list_therapist_patients_not_found():
    resp = client.get(f"/api/therapists/{ObjectId()}/patients/", HTTP_AUTHORIZATION="Bearer test")

    assert resp.status_code == 404
    assert resp.json()["error"] == "Therapist not found"


def test_list_therapist_patients_invalid_id_returns_400():
    resp = client.get(
        "/api/therapists/not-an-object-id/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 400
    assert resp.json()["error"] == "Invalid therapist ID"


def test_list_therapist_patients_method_not_allowed():
    therapist, _ = create_therapist_with_patient()

    resp = client.post(
        f"/api/therapists/{therapist.userId.id}/patients/",
        data={},
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 405
    assert resp.json()["error"] == "Method not allowed"


def test_list_therapist_patients_excludes_inactive_users():
    therapist, patient = create_therapist_with_patient(patient_active=False)

    resp = client.get(
        f"/api/therapists/{therapist.userId.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert all(row["_id"] != str(patient.id) for row in data)


def test_list_therapist_patients_includes_login_and_biomarker_fields():
    therapist, patient = create_therapist_with_patient()

    Logs(userId=patient.userId, action="LOGIN", userAgent="pytest").save()
    FitbitData(
        user=patient.userId,
        date=datetime.now() - timedelta(days=1),
        steps=1000,
        active_minutes=20,
    ).save()

    resp = client.get(
        f"/api/therapists/{therapist.userId.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    payload = resp.json()
    patient_row = next(row for row in payload if row["_id"] == str(patient.id))
    assert patient_row["last_online"] is not None
    assert "biomarker" in patient_row
    assert patient_row["biomarker"]["steps_avg"] == 1000.0
    assert patient_row["biomarker"]["activity_min"] == 20.0


def test_create_log_success_for_existing_user():
    user = User(
        username="logger",
        email="logger@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    long_details = "x" * 700
    resp = client.post(
        "/api/analytics/log",
        data=json.dumps(
            {
                "user": str(user.id),
                "action": "REHATABLE",
                "started": datetime.now().isoformat(),
                "ended": datetime.now().isoformat(),
                "details": long_details,
                "userAgent": "pytest-agent",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "ok"
    log = Logs.objects.get(id=ObjectId(body["log_id"]))
    assert log.userId.id == user.id
    assert len(log.details) == 500


def test_create_log_with_patient_reference():
    therapist, patient = create_therapist_with_patient()

    resp = client.post(
        "/api/analytics/log",
        data=json.dumps(
            {
                "user": str(therapist.userId.id),
                "patient": str(patient.id),
                "action": "HEALTH_PAGE",
                "userAgent": "pytest-agent",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 201
    body = resp.json()
    log = Logs.objects.get(id=ObjectId(body["log_id"]))
    assert log.patient is not None
    assert str(log.patient.id) == str(patient.id)


def test_create_log_invalid_json_returns_500():
    resp = client.post(
        "/api/analytics/log",
        data="not-json",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 500
    assert resp.json()["error"] == "Failed to create log"


def test_create_log_unknown_user_returns_500():
    resp = client.post(
        "/api/analytics/log",
        data=json.dumps(
            {
                "user": str(ObjectId()),
                "action": "OTHER",
                "userAgent": "pytest-agent",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 500
    assert resp.json()["error"] == "Failed to create log"


def _build_q(question_key):
    return FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey=question_key,
        translations=[Translation(language="en", text=question_key)],
        possibleAnswers=[
            AnswerOption(key="1", translations=[Translation(language="en", text="1")]),
            AnswerOption(key="2", translations=[Translation(language="en", text="2")]),
        ],
        answer_type="select",
    ).save()


def test_helper_avg_filters_non_numeric_values():
    assert _avg([1, 2, "x", None]) == 1.5
    assert _avg(["x", None]) is None


def test_helper_day_key_returns_date_component():
    dt = datetime(2026, 1, 1, 12, 30)
    assert _day_key(dt).isoformat() == "2026-01-01"


def test_sum_points_for_day_ignores_non_numeric_zero_and_other_questions():
    q = _build_q(f"qk-{ObjectId()}")
    other_q = _build_q(f"qk-{ObjectId()}")

    rating_doc = type("DummyRating", (), {})()
    rating_doc.feedback_entries = [
        FeedbackEntry(questionId=q, answerKey=[AnswerOption(key="2")]),
        FeedbackEntry(questionId=q, answerKey=[AnswerOption(key="0")]),
        FeedbackEntry(questionId=q, answerKey=[AnswerOption(key="bad")]),
        FeedbackEntry(questionId=other_q, answerKey=[AnswerOption(key="4")]),
    ]

    points = _sum_points_for_day([rating_doc], {str(q.id)})
    assert points == 2


def test_adherence_uses_schedule_when_plan_exists():
    therapist, patient = create_therapist_with_patient()
    intervention = Intervention(
        external_id=f"e-{ObjectId()}",
        language="en",
        title="Breathing",
        description="Breathing exercise",
        content_type="Video",
    ).save()

    now = datetime.now()
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=now - timedelta(days=10),
        endDate=now + timedelta(days=10),
        status="active",
        interventions=[
            InterventionAssignment(
                interventionId=intervention,
                dates=[
                    now - timedelta(days=1),
                    now - timedelta(days=2),
                    now + timedelta(days=1),
                ],
            )
        ],
    ).save()

    PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=plan,
        date=now - timedelta(days=1),
        status=["completed"],
    ).save()
    PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=plan,
        date=now - timedelta(days=2),
        status=["skipped"],
    ).save()
    PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=plan,
        date=now - timedelta(days=20),
        status=["completed"],
    ).save()

    adherence_7, adherence_total = _adherence(patient)
    assert adherence_7 == 50
    assert adherence_total == 100


def test_adherence_falls_back_to_logs_when_no_schedule():
    therapist, patient = create_therapist_with_patient()
    intervention = Intervention(
        external_id=f"e-{ObjectId()}",
        language="en",
        title="Relaxation",
        description="Relaxation exercise",
        content_type="Audio",
    ).save()
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime.now() - timedelta(days=5),
        endDate=datetime.now() + timedelta(days=5),
        status="active",
        interventions=[],
    ).save()

    # No scheduled denominator: fallback to completed/(completed+skipped).
    PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=plan,
        date=datetime.now() - timedelta(days=1),
        status=["completed"],
    ).save()
    PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=plan,
        date=datetime.now() - timedelta(days=2),
        status=["skipped"],
    ).save()

    adherence_7, adherence_total = _adherence(patient)
    assert adherence_7 == 50
    assert adherence_total == 50


def test_adherence_returns_none_when_no_logs_and_no_schedule():
    _, patient = create_therapist_with_patient()
    adherence_7, adherence_total = _adherence(patient)
    assert adherence_7 is None
    assert adherence_total is None


def test_feedback_computing_returns_empty_without_assignments():
    _, patient = create_therapist_with_patient()
    summary, last = _feedback_computing(patient)
    assert summary == []
    assert last is None


def test_feedback_computing_handles_questionnaire_without_questions():
    therapist, patient = create_therapist_with_patient()
    qn = HealthQuestionnaire(key=f"HN-{ObjectId()}", title="No Questions", questions=[]).save()
    RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime.now() - timedelta(days=7),
        endDate=datetime.now() + timedelta(days=7),
        status="active",
        questionnaires=[
            QuestionnaireAssignment(
                questionnaireId=qn,
                dates=[datetime.now() - timedelta(days=1)],
            )
        ],
    ).save()

    summary, last = _feedback_computing(patient)
    assert len(summary) == 1
    assert summary[0]["title"] == "No Questions"
    assert summary[0]["expected_total"] == 0
    assert summary[0]["answered_total"] == 0
    assert summary[0]["low_score"] is False
    assert last is None


def test_feedback_computing_scores_and_adherence_for_two_answer_days():
    therapist, patient = create_therapist_with_patient()
    q1 = _build_q(f"qk-{ObjectId()}")
    q2 = _build_q(f"qk-{ObjectId()}")
    qn = HealthQuestionnaire(
        key=f"HN-{ObjectId()}",
        title="Health Weekly",
        questions=[q1, q2],
    ).save()

    now = datetime.now()
    RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=now - timedelta(days=10),
        endDate=now + timedelta(days=10),
        status="active",
        questionnaires=[
            QuestionnaireAssignment(
                questionnaireId=qn,
                dates=[now - timedelta(days=2), now - timedelta(days=1)],
            )
        ],
    ).save()

    PatientICFRating(
        questionId=q1,
        patientId=patient,
        icfCode="b280",
        date=now - timedelta(days=1),
        feedback_entries=[
            FeedbackEntry(questionId=q1, answerKey=[AnswerOption(key="1")]),
            FeedbackEntry(questionId=q2, answerKey=[AnswerOption(key="1")]),
        ],
    ).save()
    PatientICFRating(
        questionId=q1,
        patientId=patient,
        icfCode="b280",
        date=now - timedelta(days=2),
        feedback_entries=[FeedbackEntry(questionId=q1, answerKey=[AnswerOption(key="2")])],
    ).save()

    summary, last = _feedback_computing(patient)
    assert len(summary) == 1
    item = summary[0]
    assert item["title"] == "Health Weekly"
    assert item["expected_total"] == 2
    assert item["expected_7"] == 2
    assert item["answered_total"] == 2
    assert item["answered_7"] == 2
    assert item["adherence_total"] == 100
    assert item["adherence_7"] == 100
    assert item["last_score"] == 2
    assert item["prev_score"] == 2
    assert item["delta_score"] == 0
    assert item["low_score"] is True
    assert item["last_answered_at"] is not None
    assert last is not None


# ---------------------------------------------------------------------------
# Clinic-based patient filtering tests
# ---------------------------------------------------------------------------


def test_patient_same_clinic_appears_in_list(mongo_mock):
    """Patient whose clinic matches the therapist's clinic is returned."""
    therapist = _make_therapist("th_clinic1", ["Inselspital"])
    patient = _make_patient("pat_clinic1", therapist, "Inselspital")

    resp = client.get(
        f"/api/therapists/{therapist.userId.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    ids = [row["_id"] for row in resp.json()]
    assert str(patient.id) in ids


def test_patient_different_clinic_excluded_from_list(mongo_mock):
    """Patient at a different clinic does not appear in the therapist's list."""
    therapist = _make_therapist("th_clinic2", ["Inselspital"])
    other_therapist = _make_therapist("th_other", ["Berner Reha Centrum"])
    patient = _make_patient("pat_other_clinic", other_therapist, "Berner Reha Centrum")

    resp = client.get(
        f"/api/therapists/{therapist.userId.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    ids = [row["_id"] for row in resp.json()]
    assert str(patient.id) not in ids


def test_patient_no_clinic_excluded_from_list(mongo_mock):
    """Patient with no clinic set does not appear in any therapist's list."""
    therapist = _make_therapist("th_clinic3", ["Inselspital"])
    patient = _make_patient("pat_no_clinic", therapist, "")

    resp = client.get(
        f"/api/therapists/{therapist.userId.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    ids = [row["_id"] for row in resp.json()]
    assert str(patient.id) not in ids


def test_therapist_no_clinics_returns_empty_list(mongo_mock):
    """Therapist with no clinics configured sees an empty patient list."""
    therapist = _make_therapist("th_no_clinics", [])
    _make_patient("pat_insel", therapist, "Inselspital")

    resp = client.get(
        f"/api/therapists/{therapist.userId.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    assert resp.json() == []


def test_therapist_multiple_clinics_shows_patients_from_all(mongo_mock):
    """Therapist with multiple clinics sees patients from every assigned clinic."""
    therapist = _make_therapist("th_multi", ["Inselspital", "Berner Reha Centrum"])
    p_insel = _make_patient("pat_insel2", therapist, "Inselspital")
    p_bern = _make_patient("pat_bern", therapist, "Berner Reha Centrum")
    p_other = _make_patient("pat_leuven", therapist, "Leuven")

    resp = client.get(
        f"/api/therapists/{therapist.userId.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    ids = [row["_id"] for row in resp.json()]
    assert str(p_insel.id) in ids
    assert str(p_bern.id) in ids
    assert str(p_other.id) not in ids


def test_patients_from_same_clinic_visible_across_therapists(mongo_mock):
    """Two therapists at the same clinic both see a patient registered there."""
    therapist_a = _make_therapist("th_a", ["Inselspital"])
    therapist_b = _make_therapist("th_b", ["Inselspital"])
    patient = _make_patient("shared_patient", therapist_a, "Inselspital")

    resp_a = client.get(
        f"/api/therapists/{therapist_a.userId.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    resp_b = client.get(
        f"/api/therapists/{therapist_b.userId.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert str(patient.id) in [row["_id"] for row in resp_a.json()]
    assert str(patient.id) in [row["_id"] for row in resp_b.json()]
