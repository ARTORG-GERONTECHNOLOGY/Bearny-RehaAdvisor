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
            AnswerOption(key=str(i), translations=[Translation(language="en", text=f"{i}/5")])
            for i in range(1, 6)
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
            AnswerOption(key=str(i), translations=[Translation(language="en", text=f"{i}/5")])
            for i in range(1, 6)
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
        f"Star rating missing from {keys}. "
        "Fallback Intervention lookup may not be working."
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
    assert keys.index("rating_stars_education") < keys.index("difficulty_scale"), (
        f"Expected star rating before difficulty; got order: {keys}"
    )


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
