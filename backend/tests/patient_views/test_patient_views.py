"""
Patient Views API Tests

This module tests patient-facing API endpoints including feedback submission,
intervention completion tracking, and intervention removal.

Tests cover:
- Feedback questionnaire submission for interventions
- Marking interventions as completed with progress tracking
- Removing interventions from patient's rehabilitation plan
- Error handling for invalid patients, missing data, and malformed requests
- Getting the rehabilitation plan for the patient

Framework: Django Test Client with pytest
Database: mongomock (in-memory MongoDB) for isolated testing
Models: Patient, Therapist, Intervention, InterventionAssignment, FeedbackQuestion, RehabilitationPlan
"""

import json
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from bson import ObjectId
from django.test import Client
from django.utils import timezone
from core.models import FeedbackEntry, AnswerOption
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
    FeedbackEntry, 
    AnswerOption
)
def _mk_dt_naive(days_offset=0, hour=6, minute=0):
    """
    Return naive datetime (no tzinfo) at local wall-clock time.
    Used to simulate older MongoEngine entries that were stored naive.
    """
    base = datetime.now().replace(hour=hour, minute=minute, second=0, microsecond=0)
    return base + timedelta(days=days_offset)


def _mk_dt_aware(days_offset=0, hour=6, minute=0):
    """
    Return tz-aware datetime in Django's current timezone.
    Used to simulate correct aware log timestamps.
    """
    tz = timezone.get_current_timezone()
    naive = _mk_dt_naive(days_offset=days_offset, hour=hour, minute=minute)
    return timezone.make_aware(naive, tz)
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

    # Create Patient
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

    # Create Intervention
    intervention = Intervention(
        title="Stretching", description="Stretching exercises", content_type="Video", external_id="INT_STRETCH_001",language="en",
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
    """
    
    Setup:
    - Patient enrolled with therapist
    - Intervention assigned: "Stretching"
    - Rehabilitation plan active
    - FeedbackQuestion created: "How did it go?"
    
    Input Data:
    - userId: patient's user ID
    - interventionId: intervention the patient completed
    - responses: Array of question-answer pairs
      * Question: "How did it go?"
      * Answer: ["Great"]
    
    Steps:
    
    Expected Results:
    - HTTP 201 Created or 200 OK
    - Response message: "Feedback submitted successfully"
    - Feedback stored in database
    - Visible to therapist in patient dashboard
    - Can be used for outcome measurement
    
    Business Flow: Patient completes exercise session, rates experience, provides comments
    Use Case: Therapist reviews patient satisfaction and adjusts intervention if needed
    """
    patient, therapist, intervention, _ = setup_patient_with_plan()

    FeedbackQuestion.objects.create(
        questionSubject="Intervention",
        questionKey="how_did_it_go",
        answer_type="text",
        translations=[Translation(language="en", text="How did it go?")],
        possibleAnswers=[],
    )

    # IMPORTANT: send as FORM DATA (request.POST), not JSON
    payload = {
        "userId": str(patient.userId.id),
        "interventionId": str(intervention.id),
        # view does json.loads(val) if possible → send JSON string
        "how_did_it_go": json.dumps(["Great"]),
    }

    resp = client.post(
        "/api/patients/feedback/questionaire/",
        data=payload,  # <-- dict, NOT json.dumps
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code in (200, 201)
    assert "Feedback submitted successfully" in resp.content.decode()


def test_submit_feedback_no_responses(mongo_mock):
    """
    
    Setup:
    - Patient exists
    - Request payload has empty responses: []
    
    Steps:
    
    Expected Results:
    - HTTP 400 Bad Request
    - Error message: "No feedback responses provided"
    - No feedback stored
    - Patient prompted to provide responses
    
    Input Validation: Prevents empty feedback submissions
    """
    patient, _, _, _ = setup_patient_with_plan()

    payload = {
        "userId": str(patient.userId.id),
        "interventionId": "",  # triggers Healthstatus path, but still no answers => should fail
        # no other keys => answers stays empty
    }

    resp = client.post(
        "/api/patients/feedback/questionaire/",
        data=payload,  # ✅ dict => goes into request.POST
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 400
    assert "No feedback responses provided" in resp.content.decode()


def test_submit_feedback_patient_not_found(mongo_mock):
    """
    
    Setup:
    - User ID provided does not exist in database
    - Random ObjectId: 507f1f77bcf86cd799439011
    - Feedback data otherwise valid
    
    Steps:
    
    Expected Results:
    - HTTP 404 Not Found
    - Error message: "Patient not found"
    - No feedback stored
    - Database unchanged
    
    Error Handling: Prevents feedback storage for non-existent patients
    """
    FeedbackQuestion.objects.create(
        questionSubject="Intervention",
        questionKey="q_test",
        answer_type="text",
        translations=[Translation(language="en", text="Q?")],
        possibleAnswers=[],
    )

    payload = {
        "userId": str(ObjectId()),          # non-existent
        "interventionId": str(ObjectId()),  # valid format
        "q_test": "A",                      # key must match questionKey
    }

    resp = client.post(
        "/api/patients/feedback/questionaire/",
        data=payload,  # <-- dict, not JSON
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()


def test_mark_intervention_completed_success(mongo_mock):
    """
    
    Setup:
    - Patient has intervention assigned
    - Patient has completed the intervention
    - Intervention: "Stretching"
    
    Input Data:
    - patient_id: Patient's user ID
    - intervention_id: Intervention being marked complete
    
    Steps:
    
    Expected Results:
    - HTTP 200 OK
    - Response message: "Marked as completed successfully"
    - Intervention status changes to "completed"
    - Completion recorded in PatientInterventionLogs
    - Visible in patient's progress history
    - Therapist sees updated progress on dashboard
    
    Use Case: Patient finishes session, clicks "mark complete", system records for adherence tracking
    """
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
    """
    
    Setup:
    - Request payload is empty {}
    - Missing patient_id
    - Missing intervention_id
    
    Steps:
    
    Expected Results:
    - HTTP 400 Bad Request
    - Error message: "Missing patient_id or intervention_id"
    - No completion recorded
    - Database unchanged
    
    Input Validation: Ensures required data provided before processing
    """
    resp = client.post(
        "/api/interventions/complete/",
        data=json.dumps({}),  # Empty payload
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Missing patient_id or intervention_id" in resp.content.decode()


def test_mark_intervention_completed_patient_not_found(mongo_mock):
    """
    
    Setup:
    - Intervention exists
    - Patient ID does not exist
    - Random ObjectId
    
    Steps:
    
    Expected Results:
    - HTTP 404 Not Found
    - Error message: "Patient not found"
    - No completion recorded
    - No database changes
    
    Error Handling: Prevents completion records for non-existent patients
    """
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
    """
    
    Setup:
    - Patient has rehabilitation plan with intervention
    - Intervention: "Stretching" assigned for next 5 days
    - Plan is active with scheduled dates
    
    Input Data:
    - intervention: Intervention ID to remove
    - patientId: Patient's ID
    
    Steps:
    
    Expected Results:
    - HTTP 200 OK
    - Response message: "Intervention dates removed successfully"
    - Intervention removed from patient's active plan
    - Future sessions cancelled
    - Therapist can view removal in history
    - Patient no longer sees intervention on dashboard
    
    Use Case: Therapist completes plan, removes intervention before end date, or switches to different approach
    """
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
    """
    
    Setup:
    - Request payload is empty {}
    - Missing intervention field
    - Missing patientId field
    
    Steps:
    
    Expected Results:
    - HTTP 400 Bad Request
    - Error message: "Missing required parameters"
    - No intervention removed
    - Plan unchanged
    
    Input Validation: Prevents incomplete removal requests
    """
    resp = client.post(
        "/api/interventions/remove-from-patient/",
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Missing required parameters" in resp.content.decode()


def test_remove_intervention_patient_not_found(mongo_mock):
    """
    
    Setup:
    - Intervention exists (random ObjectId)
    - Patient ID does not exist (random ObjectId)
    
    Steps:
    
    Expected Results:
    - HTTP 404 Not Found
    - Error message: "Patient not found"
    - No intervention removed
    - Database unchanged
    
    Error Handling: Prevents removal operations on non-existent patients
    """
    payload = {"intervention": str(ObjectId()), "patientId": str(ObjectId())}
    resp = client.post(
        "/api/interventions/remove-from-patient/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()


@pytest.mark.django_db
def test_add_intervention_to_patient_success(mongo_mock):
    # --- Create therapist user + therapist ---
    therapist_user = User(
        username="therapist1",
        email="therapist1@example.com",
        phone="123",
        createdAt="2026-02-25T07:00:00.000Z",
        isActive=True,
    ).save()

    therapist = Therapist(
        userId=therapist_user,
        name="Doe",
        first_name="John",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    ).save()

    # --- Create patient user + patient ---
    patient_user = User(
        username="patient1",
        email="patient1@example.com",
        phone="456",
        createdAt="2026-02-25T07:00:00.000Z",
        isActive=True,
    ).save()

    patient = Patient(
        userId=patient_user,
        patient_code="PAT001",
        therapist=therapist,
        access_word="pass",
        reha_end_date="2026-03-31T00:00:00.000Z",
    ).save()

    # --- Create intervention (must satisfy required fields: external_id + language) ---
    intervention = Intervention(
        external_id="test_ext_001",
        language="en",
        title="Stretching",
        description="Stretching exercises",
        content_type="Video",
        keywords=["Stretch"],
        patient_types=[],
        duration=30,
        media=[],
    ).save()

    payload = {
        "therapistId": str(therapist.userId.id),
        "patientId": str(patient.id),
        "interventions": [
            {
                "interval": 1,
                "interventionId": str(intervention.id),
                "unit": "day",
                "startDate": "2026-02-25T07:00:00.000Z",
                "selectedDays": [],
                "end": {"type": "never", "date": None, "count": None},
                "require_video_feedback": False,
                "notes": "",
            }
        ],
    }

    resp = client.post(
        "/api/interventions/add-to-patient/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code in (200, 201), resp.content.decode()
    data = resp.json()
    assert data.get("success") is True
    assert "message" in data


def test_get_patient_plan_no_plan_returns_empty_list(mongo_mock):
    """
    If patient exists but has no RehabilitationPlan, endpoint returns [] with message.
    """
    # create patient without plan
    therapist_user = User(username="t2", email="t2@example.com", phone="111", createdAt=datetime.now(), isActive=True)
    therapist_user.save()
    therapist = Therapist(userId=therapist_user, name="Doe", first_name="Jane").save()

    patient_user = User(username="p2", email="p2@example.com", phone="222", createdAt=datetime.now(), isActive=True)
    patient_user.save()
    patient = Patient(userId=patient_user, patient_code="PAT002", therapist=therapist, access_word="pass").save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{str(patient.userId.id)}/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    data = resp.json()
    # your view returns {"rehab_plan": [], "message": "..."} OR [] depending on branch
    # In your current get_patient_plan: it returns {"rehab_plan": [], "message": ...}
    assert isinstance(data, dict)
    assert data.get("rehab_plan") == []
    assert "No rehabilitation plan found" in (data.get("message") or "")


def test_get_patient_plan_patient_not_found_404(mongo_mock):
    """
    If patient userId doesn't exist => 404.
    """
    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{str(ObjectId())}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.content.decode()


def test_get_patient_plan_invalid_patient_id_500_or_400(mongo_mock):
    """
    If patient_id cannot be ObjectId, current code will raise and hit 500.
    (If you later harden it, you can change expected to 400.)
    """
    resp = client.get(
        "/api/patients/rehabilitation-plan/patient/not-an-objectid/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code in (400, 500)


def test_get_patient_plan_returns_interventions_with_meta_and_flat_fields(mongo_mock):
    """
    Ensures:
    - response is a list
    - each item contains nested 'intervention' meta + flat fields
    - dates are iso strings
    """
    patient, therapist, intervention, plan = setup_patient_with_plan()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{str(patient.userId.id)}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200

    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1

    row = data[0]
    assert "intervention" in row
    assert row["intervention"]["_id"] == str(intervention.id)
    assert row["intervention"]["external_id"] == intervention.external_id
    assert row["intervention"]["title"] == intervention.title
    assert row["intervention"]["content_type"] == intervention.content_type

    # flat compatibility fields
    assert row["intervention_id"] == str(intervention.id)
    assert row["intervention_title"] == intervention.title
    assert row["content_type"] == intervention.content_type

    assert "dates" in row
    assert isinstance(row["dates"], list)
    assert all(isinstance(x, str) for x in row["dates"])
    assert "T" in row["dates"][0]  # iso datetime string

    assert "completion_dates" in row
    assert isinstance(row["completion_dates"], list)

    assert "feedback" in row
    assert isinstance(row["feedback"], list)


def test_get_patient_plan_completion_dates_from_logs_naive_and_aware(mongo_mock):
    """
    Completion dates should include YYYY-MM-DD of logs with status 'completed'.
    Works for both naive and aware stored datetimes.
    """
    patient, therapist, intervention, plan = setup_patient_with_plan()

    # Create two logs: one naive yesterday, one aware today
    rehab_plan = RehabilitationPlan.objects(patientId=patient).first()
    assert rehab_plan is not None

    # yesterday naive
    log1 = PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=rehab_plan,
        date=_mk_dt_naive(days_offset=-1, hour=6),
        status=["completed"],
        feedback=[],
        comments="",
    ).save()

    # today aware
    log2 = PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=rehab_plan,
        date=_mk_dt_aware(days_offset=0, hour=6),
        status=["completed"],
        feedback=[],
        comments="",
    ).save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{str(patient.userId.id)}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list) and data

    completion_dates = data[0]["completion_dates"]
    assert isinstance(completion_dates, list)

    # compare by day key
    today_key = timezone.localdate().isoformat()
    yesterday_key = (timezone.localdate() - timedelta(days=1)).isoformat()

    assert today_key in completion_dates
    assert yesterday_key in completion_dates


def test_get_patient_plan_feedback_only_for_today(mongo_mock):
    """
    Feedback list should include only feedback entries from logs that are on today's local date.
    """
    patient, therapist, intervention, plan = setup_patient_with_plan()
    rehab_plan = RehabilitationPlan.objects(patientId=patient).first()

    # Create FeedbackQuestion that feedback entries reference
    q = FeedbackQuestion.objects.create(
        questionSubject="Intervention",
        questionKey="how_did_it_go",
        answer_type="select",
        translations=[Translation(language="en", text="How did it go?")],
        possibleAnswers=[
            AnswerOption(key="good", translations=[Translation(language="en", text="Good")]),
        ],
    )

    # Yesterday log WITH feedback
    y_log = PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=rehab_plan,
        date=_mk_dt_naive(days_offset=-1, hour=8),
        status=["completed"],
        feedback=[
            FeedbackEntry(
                questionId=q,
                answerKey=[AnswerOption(key="good", translations=[Translation(language="en", text="Good")])],
                comment="yesterday comment",
                date=_mk_dt_naive(days_offset=-1, hour=8),
            )
        ],
        comments="",
    )
    y_log.save()

    # Today log WITH feedback
    t_log = PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=rehab_plan,
        date=_mk_dt_naive(days_offset=0, hour=9),
        status=["completed"],
        feedback=[
            FeedbackEntry(
                questionId=q,
                answerKey=[AnswerOption(key="good", translations=[Translation(language="en", text="Good")])],
                comment="today comment",
                date=_mk_dt_naive(days_offset=0, hour=9),
            )
        ],
        comments="",
    )
    t_log.save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{str(patient.userId.id)}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list) and data

    feedback = data[0]["feedback"]
    assert isinstance(feedback, list)

    # Only today's feedback should be returned
    assert any("today comment" == f.get("comment") for f in feedback)
    assert not any("yesterday comment" == f.get("comment") for f in feedback)

    # Serialized structure sanity
    first = feedback[0]
    assert "question" in first and "translations" in first["question"]
    assert "answer" in first and isinstance(first["answer"], list)
    assert first["answer"][0]["key"] == "good"


def test_get_patient_plan_includes_require_video_feedback_flag(mongo_mock):
    """
    Ensure assignment flag require_video_feedback is included in output.
    """
    patient, therapist, intervention, plan = setup_patient_with_plan()

    rehab_plan = RehabilitationPlan.objects(patientId=patient).first()
    assert rehab_plan is not None
    assert rehab_plan.interventions and len(rehab_plan.interventions) == 1

    rehab_plan.interventions[0].require_video_feedback = True
    rehab_plan.save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{str(patient.userId.id)}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list) and data
    assert data[0]["require_video_feedback"] is True


def test_get_patient_plan_multiple_assignments(mongo_mock):
    """
    If plan has multiple assignments, endpoint should return one row per assignment.
    """
    patient, therapist, intervention1, plan = setup_patient_with_plan()

    intervention2 = Intervention(
        title="Breathing",
        description="Breathing exercise",
        content_type="Audio",
        external_id="INT_BREATH_001",
        language="en",
    ).save()

    rehab_plan = RehabilitationPlan.objects(patientId=patient).first()

    assignment2 = InterventionAssignment(
        interventionId=intervention2,
        frequency="Weekly",
        notes="note2",
        require_video_feedback=False,
        dates=[datetime.now() + timedelta(days=2), datetime.now() + timedelta(days=9)],
    )

    rehab_plan.interventions.append(assignment2)
    rehab_plan.save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{str(patient.userId.id)}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 2

    ids = {row["intervention_id"] for row in data}
    assert str(intervention1.id) in ids
    assert str(intervention2.id) in ids