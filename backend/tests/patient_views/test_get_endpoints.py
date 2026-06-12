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
from django.utils import timezone

from core.models import (
    AnswerOption,
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


def test_therapist_plan_completed_date_uses_log_created_at(mongo_mock):
    """
    For a completed session the ``datetime`` in the response must be the log's
    ``createdAt`` (the actual submission time), not the scheduled date.

    Bug #306: the endpoint always returned the scheduled time (e.g. 06:00 AM)
    so the therapist could never see when the patient actually completed the
    intervention.
    """
    patient, therapist, intervention, plan = setup_basic_plan()

    scheduled_dt = datetime(2026, 5, 13, 6, 0, 0)  # 06:00 — scheduled time
    plan.interventions[0].dates = [scheduled_dt]
    plan.save()

    # Simulate patient completing the session at a later time.
    actual_completion_time = datetime(2026, 5, 13, 10, 6, 36)
    log = PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=plan,
        date=scheduled_dt,
        status=["completed"],
        feedback=[],
        comments="",
    )
    log.createdAt = actual_completion_time
    log.save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    dates = body["interventions"][0]["dates"]
    assert len(dates) == 1
    assert dates[0]["status"] == "completed"
    # datetime must reflect actual completion time, not scheduled 06:00
    assert "10:06" in dates[0]["datetime"] or "10-06" in dates[0]["datetime"]


def test_therapist_plan_upcoming_date_uses_scheduled_time(mongo_mock):
    """
    For sessions without a completion log the ``datetime`` stays as the
    scheduled time from the assignment.
    """
    patient, therapist, intervention, plan = setup_basic_plan()

    future_dt = datetime.now() + timedelta(days=5)
    future_dt = future_dt.replace(hour=8, minute=0, second=0, microsecond=0)
    plan.interventions[0].dates = [future_dt]
    plan.save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    dates = body["interventions"][0]["dates"]
    assert len(dates) == 1
    assert dates[0]["status"] == "upcoming"
    assert "08:00" in dates[0]["datetime"]


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


def test_fetch_healthstatus_questions_prefers_due_assigned_questionnaire(mongo_mock):
    """
    If the therapist assigned a due Healthstatus questionnaire to the patient,
    the endpoint should return those assigned questions.
    """
    patient, _, _, plan = setup_basic_plan()

    q1 = FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey="99_assigned_q1",
        translations=[Translation(language="en", text="Assigned Q1?")],
        answer_type="text",
    ).save()
    q2 = FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey="99_assigned_q2",
        translations=[Translation(language="en", text="Assigned Q2?")],
        answer_type="select",
        possibleAnswers=[AnswerOption(key="1", translations=[Translation(language="en", text="1")])],
    ).save()

    hq = HealthQuestionnaire(
        key="99_assigned",
        title="Assigned 99",
        questions=[q1, q2],
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

    resp = client.get(
        f"/api/patients/get-questions/Healthstatus/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    questions = body if isinstance(body, list) else body.get("questions", [])
    keys = [q.get("questionKey") for q in questions]

    assert "99_assigned_q1" in keys
    assert "99_assigned_q2" in keys


def test_fetch_healthstatus_questions_treats_today_schedule_as_due_even_before_start_time(mongo_mock):
    """
    A questionnaire assigned for the current local day should be shown even when
    its scheduled clock time has not passed yet.
    """
    patient, _, _, plan = setup_basic_plan()

    q1 = FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey="97_assigned_q1",
        translations=[Translation(language="en", text="Assigned today?")],
        answer_type="text",
    ).save()
    hq = HealthQuestionnaire(
        key="97_assigned",
        title="Assigned 97",
        questions=[q1],
    ).save()

    scheduled_later_today = timezone.now().replace(hour=23, minute=30, second=0, microsecond=0)
    plan.questionnaires = [
        QuestionnaireAssignment(
            questionnaireId=hq,
            frequency="Daily",
            dates=[scheduled_later_today],
            notes="",
        )
    ]
    plan.save()

    resp = client.get(
        f"/api/patients/get-questions/Healthstatus/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    questions = body if isinstance(body, list) else body.get("questions", [])
    keys = [q.get("questionKey") for q in questions]
    assert "97_assigned_q1" in keys


def test_fetch_healthstatus_questions_hides_due_assignment_after_answered(mongo_mock):
    """
    Once the assigned questionnaire has been answered on/after its due date,
    it should not be returned again immediately.
    """
    patient, _, _, plan = setup_basic_plan()

    q1 = FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey="98_assigned_q1",
        translations=[Translation(language="en", text="Assigned Q?")],
        answer_type="select",
        possibleAnswers=[AnswerOption(key="1", translations=[Translation(language="en", text="1")])],
    ).save()
    hq = HealthQuestionnaire(
        key="98_assigned",
        title="Assigned 98",
        questions=[q1],
    ).save()

    due_date = datetime.now() - timedelta(days=2)
    plan.questionnaires = [
        QuestionnaireAssignment(
            questionnaireId=hq,
            frequency="Monthly",
            dates=[due_date],
            notes="",
        )
    ]
    plan.save()

    entry = FeedbackEntry(
        questionId=q1,
        answerKey=[AnswerOption(key="1", translations=[Translation(language="en", text="1")])],
        comment="",
        date=datetime.now() - timedelta(days=1),
    )
    PatientICFRating(
        questionId=q1,
        patientId=patient,
        icfCode=q1.icfCode,
        date=datetime.now() - timedelta(days=1),
        rating=1,
        feedback_entries=[entry],
        notes="",
    ).save()

    resp = client.get(
        f"/api/patients/get-questions/Healthstatus/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    questions = body if isinstance(body, list) else body.get("questions", [])
    keys = [q.get("questionKey") for q in questions]
    assert "98_assigned_q1" not in keys


def test_fetch_healthstatus_response_includes_description(mongo_mock):
    """
    When the assigned HealthQuestionnaire has a description, the endpoint
    should include it in the response under the 'description' key.
    """
    patient, _, _, plan = setup_basic_plan()

    q1 = FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey="96_desc_q1",
        translations=[Translation(language="en", text="Q1?")],
        answer_type="text",
    ).save()
    hq = HealthQuestionnaire(
        key="96_desc",
        title="Desc Test",
        description="Please read this before answering.",
        questions=[q1],
    ).save()

    plan.questionnaires = [
        QuestionnaireAssignment(
            questionnaireId=hq,
            frequency="Monthly",
            dates=[datetime.now() - timedelta(days=1)],
            description_snapshot="Please read this before answering.",
        )
    ]
    plan.save()

    resp = client.get(
        f"/api/patients/get-questions/Healthstatus/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("description") == "Please read this before answering."


def test_fetch_healthstatus_response_uses_description_snapshot_over_live(mongo_mock):
    """
    description_snapshot on the assignment takes priority over the live
    questionnaire description, preserving the text as it was at assignment time.
    """
    patient, _, _, plan = setup_basic_plan()

    q1 = FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey="95_snap_q1",
        translations=[Translation(language="en", text="Q?")],
        answer_type="text",
    ).save()
    hq = HealthQuestionnaire(
        key="95_snap",
        title="Snap Test",
        description="Updated live description",
        questions=[q1],
    ).save()

    plan.questionnaires = [
        QuestionnaireAssignment(
            questionnaireId=hq,
            frequency="Monthly",
            dates=[datetime.now() - timedelta(days=1)],
            description_snapshot="Original description at assignment time",
        )
    ]
    plan.save()

    resp = client.get(
        f"/api/patients/get-questions/Healthstatus/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("description") == "Original description at assignment time"


def test_fetch_healthstatus_response_description_empty_when_none(mongo_mock):
    """
    When the questionnaire has no description and no snapshot, 'description'
    in the response should be an empty string (not None or missing).
    """
    patient, _, _, plan = setup_basic_plan()

    q1 = FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey="94_nodesc_q1",
        translations=[Translation(language="en", text="Q?")],
        answer_type="text",
    ).save()
    hq = HealthQuestionnaire(
        key="94_nodesc",
        title="No Desc",
        questions=[q1],
    ).save()

    plan.questionnaires = [
        QuestionnaireAssignment(
            questionnaireId=hq,
            frequency="Monthly",
            dates=[datetime.now() - timedelta(days=1)],
        )
    ]
    plan.save()

    resp = client.get(
        f"/api/patients/get-questions/Healthstatus/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("description") == ""


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


# ===========================================================================
# Star rating (Frage 1) — get_feedback_questions
# ===========================================================================


def _make_star_questions():
    """Seed the two canonical star-rating questions and the core 'All' questions."""
    from core.models import AnswerOption

    star_education = FeedbackQuestion(
        questionSubject="Intervention",
        questionKey="rating_stars_education",
        answer_type="select",
        applicable_types=["Education", "Instruction", "Text", "PDF", "Video", "Audio", "Website", "Apps"],
        translations=[
            Translation(language="en", text="How did you like the content?"),
            Translation(language="de", text="Wie fandest du den Inhalt?"),
        ],
        possibleAnswers=[
            AnswerOption(key=str(i), translations=[Translation(language="en", text=f"{i}/5")]) for i in range(1, 6)
        ],
    )
    star_education.save()

    star_exercise = FeedbackQuestion(
        questionSubject="Intervention",
        questionKey="rating_stars_exercise",
        answer_type="select",
        applicable_types=["Exercise", "Exercises", "Physiotherapy", "Training", "Movement"],
        translations=[
            Translation(language="en", text="How did you like the exercise?"),
            Translation(language="de", text="Wie fandest du die Übung?"),
        ],
        possibleAnswers=[
            AnswerOption(key=str(i), translations=[Translation(language="en", text=f"{i}/5")]) for i in range(1, 6)
        ],
    )
    star_exercise.save()

    difficulty = FeedbackQuestion(
        questionSubject="Intervention",
        questionKey="difficulty_scale",
        answer_type="select",
        applicable_types=["All"],
        translations=[Translation(language="en", text="The content was…")],
        possibleAnswers=[
            AnswerOption(key="too_difficult", translations=[Translation(language="en", text="Too difficult")]),
            AnswerOption(key="just_right", translations=[Translation(language="en", text="Just right")]),
            AnswerOption(key="too_easy", translations=[Translation(language="en", text="Too easy")]),
        ],
    )
    difficulty.save()

    open_fb = FeedbackQuestion(
        questionSubject="Intervention",
        questionKey="open_feedback",
        answer_type="text",
        applicable_types=["All"],
        translations=[Translation(language="en", text="Any additional feedback?")],
        possibleAnswers=[],
    )
    open_fb.save()

    return star_education, star_exercise, difficulty, open_fb


def test_star_rating_returned_when_intervention_in_plan(mongo_mock):
    """
    GET /api/patients/get-questions/Intervention/<patient_id>/?interventionId=<iv_id>
    returns the star-rating question when the intervention IS in the patient's
    rehabilitation plan.

    This is the standard Reha-Table path: a patient opens feedback immediately
    after completing an assigned session.
    """
    _make_star_questions()
    patient, _, intervention, _ = setup_basic_plan()  # intervention.content_type = "Video"

    resp = client.get(
        f"/api/patients/get-questions/Intervention/{patient.userId.id}/",
        data={"interventionId": str(intervention.id)},
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    keys = [q["questionKey"] for q in (body if isinstance(body, list) else body.get("questions", []))]
    assert "rating_stars_education" in keys, f"Star rating missing from {keys}"


def test_star_rating_returned_without_rehab_plan(mongo_mock):
    """
    GET /api/patients/get-questions/Intervention/<patient_id>/?interventionId=<iv_id>
    returns the star-rating question even when the intervention is NOT in any
    rehabilitation plan (library-browse path).

    Previously, ``intervention_type`` resolved to ``None`` because the plan
    lookup found no assignment, causing only the 'All' questions to be returned.
    The fix adds a fallback direct Intervention document lookup.
    """
    _make_star_questions()
    patient, _, _, _ = setup_basic_plan(with_plan=False)

    # Create a standalone exercise intervention — not in any plan.
    exercise_iv = Intervention(
        title="Squats",
        description="Lower body",
        content_type="Exercise",
        external_id="EXT-SQ-001",
        language="de",
    )
    exercise_iv.save()

    resp = client.get(
        f"/api/patients/get-questions/Intervention/{patient.userId.id}/",
        data={"interventionId": str(exercise_iv.id)},
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    keys = [q["questionKey"] for q in (body if isinstance(body, list) else body.get("questions", []))]
    assert "rating_stars_exercise" in keys, (
        f"Star rating missing from {keys}. " "Fallback Intervention lookup may not be working."
    )


def test_star_rating_is_first_question(mongo_mock):
    """
    The star-rating question (Frage 1) must appear *before* the difficulty-scale
    question (Frage 2) in the response list.

    The backend returns type-specific questions (star) first, then core/All
    questions (difficulty, open feedback), matching the agreed UI order:
    Frage 1 → Frage 2 → open feedback.
    """
    _make_star_questions()
    patient, _, intervention, _ = setup_basic_plan()  # content_type = "Video"

    resp = client.get(
        f"/api/patients/get-questions/Intervention/{patient.userId.id}/",
        data={"interventionId": str(intervention.id)},
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    questions = body if isinstance(body, list) else body.get("questions", [])
    keys = [q["questionKey"] for q in questions]

    assert "rating_stars_education" in keys, f"Star rating not present: {keys}"
    assert "difficulty_scale" in keys, f"Difficulty scale not present: {keys}"
    assert keys.index("rating_stars_education") < keys.index(
        "difficulty_scale"
    ), f"Expected star rating before difficulty; got order: {keys}"


def test_correct_star_question_selected_for_exercise(mongo_mock):
    """
    An intervention with content_type='Exercise' must return
    ``rating_stars_exercise``, not ``rating_stars_education``.

    Each content category has its own star-rating question with an
    aim-appropriate label ("Wie fandest du die Übung?" vs
    "Wie fandest du den Inhalt?").
    """
    _make_star_questions()
    patient, _, _, _ = setup_basic_plan(with_plan=False)

    exercise_iv = Intervention(
        title="Lunges",
        description="Leg exercise",
        content_type="Exercise",
        external_id="EXT-LG-001",
        language="en",
    )
    exercise_iv.save()

    resp = client.get(
        f"/api/patients/get-questions/Intervention/{patient.userId.id}/",
        data={"interventionId": str(exercise_iv.id)},
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    keys = [q["questionKey"] for q in (body if isinstance(body, list) else body.get("questions", []))]

    assert "rating_stars_exercise" in keys, f"Exercise star rating missing: {keys}"
    assert "rating_stars_education" not in keys, f"Wrong star rating included: {keys}"


def test_star_rating_absent_when_no_intervention_id(mongo_mock):
    """
    GET without an interventionId query param returns only the generic 'All'
    questions (difficulty_scale, open_feedback) — no star rating.

    Without a content_type the backend cannot select the correct star variant,
    so it deliberately omits both ``rating_stars_*`` questions.
    """
    _make_star_questions()
    patient, _, _, _ = setup_basic_plan()

    resp = client.get(
        f"/api/patients/get-questions/Intervention/{patient.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    keys = [q["questionKey"] for q in (body if isinstance(body, list) else body.get("questions", []))]

    assert "rating_stars_education" not in keys
    assert "rating_stars_exercise" not in keys
    assert "difficulty_scale" in keys, f"Core questions missing: {keys}"


# ===========================================================================
# Regression tests for issue #347 — multilingual intervention bugs
# ===========================================================================


def test_therapist_plan_deduplicates_multilingual_assignments(mongo_mock):
    """
    Fix #347 Bug 1: if the same external_id was assigned in two language
    variants, the therapist plan view must return only ONE entry (not two).
    Dates from both assignments must be merged so no session is lost.
    """
    patient, therapist, _, plan = setup_basic_plan()

    int_de = Intervention(
        title="Blutdruck Grundlagen",
        description="DE",
        content_type="Video",
        external_id="MULTI-001",
        language="de",
    )
    int_de.save()
    int_en = Intervention(
        title="Blood Pressure Basics",
        description="EN",
        content_type="Video",
        external_id="MULTI-001",
        language="en",
    )
    int_en.save()

    tomorrow = datetime.now() + timedelta(days=1)
    day_after = datetime.now() + timedelta(days=2)

    plan.interventions = [
        InterventionAssignment(
            interventionId=int_de,
            frequency="Daily",
            notes="",
            dates=[tomorrow],
        ),
        InterventionAssignment(
            interventionId=int_en,
            frequency="Daily",
            notes="",
            dates=[day_after],
        ),
    ]
    plan.save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    interventions = body["interventions"]

    # Must be deduplicated to one entry
    assert len(interventions) == 1
    # Both dates must be present (merged)
    assert interventions[0]["totalCount"] == 2


def test_therapist_plan_feedback_visible_for_other_language_variant(mongo_mock):
    """
    Fix #347 Bug 3: feedback logged under the DE variant's ObjectId must appear
    in the therapist plan even when the plan references the EN variant.
    """
    patient, therapist, _, plan = setup_basic_plan()

    int_de = Intervention(
        title="Blutdruck Grundlagen",
        description="DE",
        content_type="Video",
        external_id="FEEDBACK-001",
        language="de",
    )
    int_de.save()
    int_en = Intervention(
        title="Blood Pressure Basics",
        description="EN",
        content_type="Video",
        external_id="FEEDBACK-001",
        language="en",
    )
    int_en.save()

    session_date = datetime(2026, 6, 1, 8, 0, 0)
    plan.interventions = [
        InterventionAssignment(
            interventionId=int_en,
            frequency="Daily",
            notes="",
            dates=[session_date],
        )
    ]
    plan.save()

    # Log recorded under the DE variant (different ObjectId)
    PatientInterventionLogs(
        userId=patient,
        interventionId=int_de,
        rehabilitationPlanId=plan,
        date=session_date,
        status=["completed"],
        feedback=[],
        comments="DE variant log",
    ).save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()

    dates = body["interventions"][0]["dates"]
    completed = [d for d in dates if d["status"] == "completed"]
    assert len(completed) == 1, "log under DE variant must count as completed"


def test_therapist_plan_includes_external_id(mongo_mock):
    """
    Regression for the rehab-table filter/feedback/delete mismatch.

    The catalog endpoint picks the preferred-language variant and returns ITS
    ObjectId.  The plan endpoint stored the assigned variant's ObjectId.  When
    the two variants differ the frontend merge failed because it matched only
    by _id.

    Fix: plan response must include external_id so the frontend can fall back
    to it when _id lookup misses.
    """
    patient, therapist, _, plan = setup_basic_plan()

    int_en = Intervention(
        title="Blood Pressure Basics",
        description="EN",
        content_type="Video",
        external_id="MISMATCH-001",
        language="en",
    )
    int_en.save()

    plan.interventions = [
        InterventionAssignment(
            interventionId=int_en,
            frequency="Daily",
            notes="",
            dates=[datetime.now() + timedelta(days=1)],
        )
    ]
    plan.save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["interventions"], "plan must contain at least one intervention"

    entry = body["interventions"][0]
    assert "external_id" in entry, "plan response must include external_id"
    assert entry["external_id"] == "MISMATCH-001", (
        "external_id must match the intervention's external_id so the "
        "frontend can join plan items to catalog items even when the "
        "ObjectIds differ across language variants"
    )


def test_therapist_plan_external_id_enables_cross_variant_merge(mongo_mock):
    """
    Simulates the exact production scenario for patient 934-22:

    * Intervention exists in EN only (no DE variant in DB).
    * Patient's plan assigns the EN ObjectId.
    * Catalog endpoint (list_all_interventions) would return a DIFFERENT
      ObjectId if a DE variant existed.  We verify that external_id is
      present so the frontend fallback merge can locate the entry.

    The plan endpoint must return external_id alongside _id so that
    mergePlanWithCatalog can use it as a secondary key.
    """
    patient, therapist, _, plan = setup_basic_plan()

    # Only one language variant exists (EN) — mirrors the production case
    int_en = Intervention(
        title="Cholesterin – in Kürze",
        description="EN only",
        content_type="Video",
        external_id="PROD-CHOL-001",
        language="en",
    )
    int_en.save()

    plan.interventions = [
        InterventionAssignment(
            interventionId=int_en,
            frequency="Daily",
            notes="",
            dates=[datetime.now() + timedelta(days=1)],
        )
    ]
    plan.save()

    resp = client.get(
        f"/api/patients/rehabilitation-plan/therapist/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    entry = resp.json()["interventions"][0]

    # Both identifiers must be present
    assert entry["_id"] == str(int_en.id)
    assert entry["external_id"] == "PROD-CHOL-001"
