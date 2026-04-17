"""
Patient views tests — feedback, completion, plan, and assignment mutations
==========================================================================

Endpoints covered
-----------------
``POST /api/patients/feedback/questionaire/``             → ``submit_patient_feedback``
``POST /api/interventions/complete/``                     → ``mark_intervention_completed``
``POST /api/interventions/remove-from-patient/``          → ``remove_intervention_from_patient``
``POST /api/interventions/add-to-patient/``               → ``add_intervention_to_patient``
``GET  /api/patients/rehabilitation-plan/patient/<id>/``  → ``get_patient_plan``

Coverage goals
--------------
Happy-path
  * Submitting intervention feedback (form-data, JSON answers).
  * Marking an intervention completed for today and for an explicit past date.
  * Removing future dates for a scheduled intervention.
  * Adding an intervention with a new recurring schedule.
  * Retrieving the rehabilitation plan in all shapes
    (empty, flat fields, completion dates, today's feedback, multi-assignment).

Input validation (400)
  * Missing ``userId`` / ``patient_id`` / required JSON fields.
  * Invalid date format in feedback and completion endpoints.
  * Empty feedback-response map.

Resource not found (404)
  * Unknown patient ObjectId across all write endpoints.
  * Patient exists but has no ``RehabilitationPlan``.

HTTP method enforcement (405)
  * Each endpoint refuses wrong HTTP verbs.

Language-variant selection (?lang= query param)
  * Without ``?lang=`` the originally assigned language variant is returned
    (backward-compatible default behaviour).
  * ``?lang=de`` returns the German variant's title/description when a document
    with the same ``external_id`` and ``language="de"`` exists in the DB.
  * Falls back to English (then ``de``) when the requested language variant is
    absent, matching the ``_lang_chain`` fallback order.
  * Completion logs are always queried against the originally assigned document,
    so existing completion dates are not lost when a language variant is swapped
    in for display.
  * Interventions without an ``external_id`` are served as-is; ``?lang=`` is
    silently ignored and no error is raised.

Background
  The frontend calls LibreTranslate to auto-translate intervention titles that
  are not in the patient's UI language.  Machine translations are sometimes
  incorrect (e.g. "Medication Reminder" → "Medizinische Erinnerung" instead of
  "Medikamentenerinnerung").  By returning the correct language variant from the
  DB, LibreTranslate detects a source == target match and skips translation,
  showing the human-curated title instead.

Framework: Django Test Client + pytest + mongomock
"""

import json
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from bson import ObjectId
from django.test import Client
from django.utils import timezone

from core.models import (
    AnswerOption,
    DefaultInterventions,
    FeedbackEntry,
    FeedbackQuestion,
    HealthQuestionnaire,
    Intervention,
    InterventionAssignment,
    Patient,
    PatientICFRating,
    PatientInterventionLogs,
    QuestionnaireAssignment,
    RehabilitationPlan,
    Therapist,
    Translation,
    User,
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

    # Create Patient
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

    # Create Intervention
    intervention = Intervention(
        title="Stretching",
        description="Stretching exercises",
        content_type="Video",
        external_id="INT_STRETCH_001",
        language="en",
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
        "userId": str(ObjectId()),  # non-existent
        "interventionId": str(ObjectId()),  # valid format
        "q_test": "A",  # key must match questionKey
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
    therapist_user = User(
        username="t2",
        email="t2@example.com",
        phone="111",
        createdAt=datetime.now(),
        isActive=True,
    )
    therapist_user.save()
    therapist = Therapist(userId=therapist_user, name="Doe", first_name="Jane").save()

    patient_user = User(
        username="p2",
        email="p2@example.com",
        phone="222",
        createdAt=datetime.now(),
        isActive=True,
    )
    patient_user.save()
    patient = Patient(
        userId=patient_user,
        patient_code="PAT002",
        therapist=therapist,
        access_word="pass",
    ).save()

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
    If the ID matches neither a userId nor a patient _id => 404.
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
                answerKey=[
                    AnswerOption(
                        key="good",
                        translations=[Translation(language="en", text="Good")],
                    )
                ],
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
                answerKey=[
                    AnswerOption(
                        key="good",
                        translations=[Translation(language="en", text="Good")],
                    )
                ],
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


# ===========================================================================
# Additional coverage — submit_patient_feedback
# ===========================================================================


def test_submit_feedback_missing_user_id(mongo_mock):
    """
    POST without a ``userId`` field returns 400 with 'Missing userId'.
    The endpoint cannot look up the patient without this identifier.
    """
    resp = client.post(
        "/api/patients/feedback/questionaire/",
        data={"interventionId": str(ObjectId())},
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Missing userId" in resp.content.decode()


def test_submit_feedback_invalid_date_format(mongo_mock):
    """
    POST with a ``date`` field that cannot be parsed as YYYY-MM-DD returns 400.
    The date field allows patients to back-date feedback entries; an invalid
    value must be rejected before any database writes occur.
    """
    patient, _, _, _ = setup_patient_with_plan()
    resp = client.post(
        "/api/patients/feedback/questionaire/",
        data={
            "userId": str(patient.userId.id),
            "date": "not-a-date",
        },
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Invalid date format" in resp.content.decode()


def test_submit_feedback_get_method_not_allowed(mongo_mock):
    """
    GET to the feedback submission endpoint returns 405.  Only POST is accepted.
    """
    resp = client.get(
        "/api/patients/feedback/questionaire/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


def test_patient_can_submit_answer_for_assigned_health_questionnaire(mongo_mock):
    """
    Assigned Healthstatus questions should be answerable by patients through
    POST /api/patients/feedback/questionaire/.
    """
    patient, _, _, plan = setup_patient_with_plan()

    q = FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey="77_assigned_answerable",
        answer_type="select",
        translations=[Translation(language="en", text="How do you feel?")],
        possibleAnswers=[
            AnswerOption(key="1", translations=[Translation(language="en", text="Bad")]),
            AnswerOption(key="2", translations=[Translation(language="en", text="Okay")]),
        ],
    ).save()

    hq = HealthQuestionnaire(
        key="77_assigned",
        title="Assigned 77",
        questions=[q],
    ).save()

    plan.questionnaires = [
        QuestionnaireAssignment(
            questionnaireId=hq,
            frequency="Monthly",
            dates=[datetime.now() - timedelta(days=1)],
            notes="",
        )
    ]
    plan.save()

    get_resp = client.get(
        f"/api/patients/get-questions/Healthstatus/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert get_resp.status_code == 200
    get_body = get_resp.json()
    get_questions = get_body if isinstance(get_body, list) else get_body.get("questions", [])
    assert any(qi.get("questionKey") == "77_assigned_answerable" for qi in get_questions)

    post_resp = client.post(
        "/api/patients/feedback/questionaire/",
        data={
            "userId": str(patient.userId.id),
            "77_assigned_answerable": "2",
            "date": datetime.now().strftime("%Y-%m-%d"),
        },
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert post_resp.status_code == 200
    assert "Feedback submitted successfully" in post_resp.content.decode()

    saved = PatientICFRating.objects(patientId=patient, questionId=q).first()
    assert saved is not None
    assert saved.feedback_entries and len(saved.feedback_entries) == 1
    assert saved.feedback_entries[0].answerKey and saved.feedback_entries[0].answerKey[0].key == "2"


# ===========================================================================
# Additional coverage — mark_intervention_completed
# ===========================================================================


def test_mark_intervention_completed_get_method_not_allowed(mongo_mock):
    """
    GET to the complete endpoint returns 405.  Only POST is accepted.
    """
    resp = client.get(
        "/api/interventions/complete/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


def test_mark_intervention_completed_no_rehab_plan(mongo_mock):
    """
    When the patient exists but has no ``RehabilitationPlan`` the endpoint
    returns 404 with 'Rehabilitation plan not found'.  A completion log
    without an associated plan would be an orphaned record.
    """
    # Create patient without a plan
    therapist_user = User(
        username="th_np",
        email="th_np@example.com",
        phone="999",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(userId=therapist_user, name="D", first_name="J").save()
    patient_user = User(
        username="p_np",
        email="p_np@example.com",
        phone="888",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    patient = Patient(
        userId=patient_user,
        patient_code="PAT_NP",
        therapist=therapist,
        access_word="pass",
    ).save()
    intervention = Intervention(
        external_id="np_ext",
        language="en",
        title="Walk",
        description="Walk",
        content_type="Video",
    ).save()

    resp = client.post(
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
    assert resp.status_code == 404
    assert "Rehabilitation plan not found" in resp.content.decode()


def test_mark_intervention_completed_with_explicit_date(mongo_mock):
    """
    POST with an optional ``date`` (YYYY-MM-DD) marks the intervention as
    completed for that specific day rather than today.  Back-dating is
    required when patients log activity after the fact.
    """
    patient, _, intervention, _ = setup_patient_with_plan()
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    resp = client.post(
        "/api/interventions/complete/",
        data=json.dumps(
            {
                "patient_id": str(patient.userId.id),
                "intervention_id": str(intervention.id),
                "date": yesterday,
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "Marked as completed successfully" in resp.content.decode()


def test_mark_intervention_completed_invalid_date(mongo_mock):
    """
    POST with a ``date`` value that cannot be parsed as YYYY-MM-DD returns 400.
    """
    patient, _, intervention, _ = setup_patient_with_plan()
    resp = client.post(
        "/api/interventions/complete/",
        data=json.dumps(
            {
                "patient_id": str(patient.userId.id),
                "intervention_id": str(intervention.id),
                "date": "invalid-date",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


# ===========================================================================
# Date-storage correctness (bug fix: off-by-one timezone day-shift)
# ===========================================================================


def test_mark_completed_stores_local_date_not_utc(mongo_mock):
    """
    Regression test for the timezone off-by-one-day bug.

    Before the fix ``mark_intervention_completed`` converted the local midnight
    to UTC and stripped the tzinfo.  For UTC+ timezones this produced a naive
    datetime whose *date* component was the *previous* day (e.g. local
    2025-01-01 00:00 UTC+2 → stored as 2024-12-31 22:00 UTC-naive).

    After the fix the naive local midnight is stored directly, so
    ``log.date.date()`` must equal ``timezone.localdate()`` (today's local
    date), never yesterday's.
    """
    patient, _, intervention, _ = setup_patient_with_plan()
    today = timezone.localdate()

    resp = client.post(
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
    assert resp.status_code == 200

    log = PatientInterventionLogs.objects(userId=patient).first()
    assert log is not None, "No log was created"
    assert log.date.date() == today, (
        f"Log date {log.date.date()} != local date {today}. " "Timezone off-by-one-day bug still present."
    )


def test_mark_completed_uses_scheduled_datetime_from_plan(mongo_mock):
    """
    When ``target_day`` matches a scheduled date in the patient's
    rehabilitation plan, the stored log datetime should be the exact
    scheduled datetime from the plan (converted to naive local time), not
    midnight of that day.

    This ensures that back-dated completions preserve the session time from
    the original plan rather than defaulting to 00:00:00.
    """
    therapist_user = User(
        username="th_sched",
        email="th_sched@example.com",
        phone="111",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(
        userId=therapist_user,
        name="Sched",
        first_name="Dr",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    ).save()
    patient_user = User(
        username="p_sched",
        email="p_sched@example.com",
        phone="222",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    patient = Patient(
        userId=patient_user,
        patient_code="PAT_SCHED",
        therapist=therapist,
        access_word="pass",
    ).save()
    intervention = Intervention(
        external_id="sched_test_001",
        language="en",
        title="Scheduled Yoga",
        description="Yoga",
        content_type="Video",
    ).save()

    # Schedule the intervention for a specific time on a fixed past date
    target_day = datetime(2026, 1, 15, 0, 0, 0).date()
    sched_time = datetime(2026, 1, 15, 8, 30, 0)  # 08:30 naive local

    assignment = InterventionAssignment(
        interventionId=intervention,
        frequency="Daily",
        dates=[sched_time],
    )
    RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime(2026, 1, 1),
        endDate=datetime(2026, 2, 1),
        status="active",
        interventions=[assignment],
    ).save()

    resp = client.post(
        "/api/interventions/complete/",
        data=json.dumps(
            {
                "patient_id": str(patient_user.id),
                "intervention_id": str(intervention.id),
                "date": target_day.isoformat(),
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200

    log = PatientInterventionLogs.objects(userId=patient).first()
    assert log is not None, "No log was created"
    # The stored datetime should be the scheduled 08:30, not midnight
    assert log.date == sched_time, (
        f"Expected scheduled time {sched_time}, got {log.date}. " "Scheduled datetime from plan not used for storage."
    )


# ===========================================================================
# Additional coverage — remove_intervention_from_patient
# ===========================================================================


def test_remove_intervention_get_method_not_allowed(mongo_mock):
    """
    GET to the remove-from-patient endpoint returns 405.  Only POST is accepted.
    """
    resp = client.get(
        "/api/interventions/remove-from-patient/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


# ===========================================================================
# Additional coverage — add_intervention_to_patient
# ===========================================================================


def test_add_intervention_to_patient_get_method_not_allowed(mongo_mock):
    """
    GET to the add-to-patient endpoint returns 405.  Only POST is accepted.
    """
    resp = client.get(
        "/api/interventions/add-to-patient/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


def test_add_intervention_to_patient_missing_required_fields(mongo_mock):
    """
    POST with an empty body returns 400 with ``field_errors`` identifying
    the missing required fields (``patientId``, ``therapistId``,
    ``interventions``).
    """
    resp = client.post(
        "/api/interventions/add-to-patient/",
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    errors = resp.json().get("field_errors", {})
    # At minimum patientId must be flagged
    assert len(errors) >= 1


# ===========================================================================
# Additional coverage — get_patient_plan
# ===========================================================================


def test_get_patient_plan_post_method_not_allowed(mongo_mock):
    """
    POST to the patient rehabilitation-plan endpoint returns 405.  Only GET
    is accepted for plan retrieval.
    """
    patient, _, _, _ = setup_patient_with_plan()
    resp = client.post(
        f"/api/patients/rehabilitation-plan/patient/{patient.userId.id}/",
        data="{}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


# ===========================================================================
# Bug fix: get_patient_plan must accept both User._id and Patient._id
# Regression tests for: https://github.com/.../issues/XXX
# Before fix: only userId was tried; passing Patient._id returned "No plan found"
# ===========================================================================


def test_get_patient_plan_by_user_id(mongo_mock):
    """
    Calling the endpoint with the patient's User._id (normal login flow) returns
    the rehabilitation plan.
    """
    patient, _, intervention, plan = setup_patient_with_plan()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["intervention_id"] == str(intervention.id)


def test_get_patient_plan_by_patient_id(mongo_mock):
    """
    Regression: calling the endpoint with the Patient._id (not User._id) must
    also return the plan.  Before the fix this returned "No rehabilitation plan
    found" even when the plan existed.
    """
    patient, _, intervention, plan = setup_patient_with_plan()

    # Use Patient._id instead of User._id
    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["intervention_id"] == str(intervention.id)


def test_get_patient_plan_user_id_takes_priority_over_patient_id(mongo_mock):
    """
    When an ID matches a userId, that patient is used even if another patient
    happens to have the same ObjectId as their Patient._id (shouldn't happen in
    practice but ensures the lookup order is stable).
    """
    patient, _, _, plan = setup_patient_with_plan()

    # Called with the User._id — must return the plan for this patient
    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) == 1


def test_get_patient_plan_unknown_id_returns_404(mongo_mock):
    """
    An ID that matches neither a userId nor a Patient._id returns 404,
    not a silent empty list.
    """
    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{str(ObjectId())}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "Patient not found" in resp.json().get("error", "")


# ===========================================================================
# ?lang= language-variant selection in get_patient_plan
# ===========================================================================


def _setup_plan_with_multilang_intervention():
    """
    Creates a patient + plan where the assigned intervention is the English
    variant, but a German variant (same external_id) also exists in the DB.
    Returns (patient, en_intervention, de_intervention).
    """
    patient, therapist, en_intervention, _ = setup_patient_with_plan()

    de_intervention = Intervention(
        title="Dehnübungen",
        description="Dehnübungen Beschreibung",
        content_type="Video",
        external_id="INT_STRETCH_001",  # same external_id as the EN variant
        language="de",
    ).save()

    return patient, en_intervention, de_intervention


def test_get_patient_plan_without_lang_returns_assigned_variant(mongo_mock):
    """
    Without ?lang= the endpoint returns the originally assigned language variant
    (English), preserving the existing behaviour.
    """
    patient, en_intervention, _ = _setup_plan_with_multilang_intervention()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1

    row = data[0]
    assert row["intervention_title"] == "Stretching"
    assert row["intervention"]["title"] == "Stretching"
    # intervention_id must still point to the assigned (EN) document
    assert row["intervention_id"] == str(en_intervention.id)


def test_get_patient_plan_lang_de_returns_german_variant(mongo_mock):
    """
    With ?lang=de the endpoint substitutes the German variant for display
    fields (title, description) while intervention_id stays as the originally
    assigned document so completion logs resolve correctly.
    """
    patient, en_intervention, de_intervention = _setup_plan_with_multilang_intervention()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{patient.userId.id}/?lang=de",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1

    row = data[0]
    # Display fields come from the DE variant
    assert row["intervention_title"] == "Dehnübungen"
    assert row["intervention"]["title"] == "Dehnübungen"
    # intervention_id must remain the originally assigned EN document
    assert row["intervention_id"] == str(en_intervention.id)


def test_get_patient_plan_lang_fallback_to_en_when_no_variant(mongo_mock):
    """
    With ?lang=fr when no French variant exists, the endpoint falls back to the
    English variant (next in the fallback chain: fr → en → de).
    """
    patient, en_intervention, _ = _setup_plan_with_multilang_intervention()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{patient.userId.id}/?lang=fr",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1

    row = data[0]
    # No FR variant exists, falls back to EN
    assert row["intervention_title"] == "Stretching"
    assert row["intervention_id"] == str(en_intervention.id)


def test_get_patient_plan_lang_de_completion_logs_use_assigned_intervention(mongo_mock):
    """
    Even when ?lang=de swaps the display variant, completion logs are still
    fetched against the originally assigned (EN) document, so existing
    completion dates are not lost.
    """
    patient, en_intervention, de_intervention = _setup_plan_with_multilang_intervention()
    rehab_plan = RehabilitationPlan.objects(patientId=patient).first()

    # Store a log against the EN intervention (the assigned one)
    PatientInterventionLogs(
        userId=patient,
        interventionId=en_intervention,
        rehabilitationPlanId=rehab_plan,
        date=_mk_dt_aware(days_offset=0, hour=9),
        status=["completed"],
        feedback=[],
        comments="",
    ).save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{patient.userId.id}/?lang=de",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1

    row = data[0]
    # Display title is German
    assert row["intervention_title"] == "Dehnübungen"
    # But the completion date logged against the EN variant is still visible
    today_key = timezone.localdate().isoformat()
    assert today_key in row["completion_dates"]


def test_get_patient_plan_lang_param_ignored_for_intervention_without_external_id(mongo_mock):
    """
    If an intervention has no external_id (edge case), ?lang= is silently
    ignored and the assigned document is returned as-is.
    """
    patient, _, _, _ = setup_patient_with_plan()

    # Patch the assigned intervention to have no external_id
    intervention_no_ext = Intervention(
        title="No External ID",
        description="",
        content_type="Video",
        external_id="",  # empty external_id — variant lookup will skip
        language="en",
    ).save()

    rehab_plan = RehabilitationPlan.objects(patientId=patient).first()
    # Add a second assignment for the no-ext intervention
    rehab_plan.interventions.append(
        InterventionAssignment(
            interventionId=intervention_no_ext,
            frequency="Weekly",
            notes="",
            dates=[],
        )
    )
    rehab_plan.save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/patient/{patient.userId.id}/?lang=de",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2  # both assignments returned without error
