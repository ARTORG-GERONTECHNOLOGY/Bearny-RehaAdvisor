"""
list_all_interventions — avg_rating / rating_count tests
=========================================================

Endpoints covered
-----------------
``GET /api/interventions/all/``                  → ``list_all_interventions``
``GET /api/interventions/all/<patient_id>/``     → ``list_all_interventions``

Coverage goals
--------------
Star-rating aggregation
  * ``avg_rating`` and ``rating_count`` are ``None`` / 0 when no logs exist.
  * ``avg_rating`` is computed correctly when one patient has submitted a rating.
  * Ratings from multiple patients are averaged together.
  * Only ``rating_stars_*`` questions are included in the aggregation;
    unrelated feedback (difficulty_scale, open_feedback) does not skew the
    average.
  * Private interventions are included in the aggregation lookup.
  * Missing / malformed answer keys do not crash the endpoint.

Test setup
----------
The ``mongo_mock`` autouse fixture provides a fresh in-memory MongoDB for
every test.  Helper functions build the minimal object graph required for
each scenario.
"""

from datetime import datetime, timedelta

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import (
    AnswerOption,
    FeedbackQuestion,
    Intervention,
    Patient,
    PatientInterventionLogs,
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

    # Reset the module-level star_q_ids cache so each test sees a fresh DB.
    import utils.interventions as interventions_utils

    interventions_utils._star_q_ids_cache.update({"ids": None, "ts": 0.0})

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


def _make_intervention(content_type="Video", external_id=None, is_private=False, language="en"):
    """Create and save a public or private Intervention document."""
    iv = Intervention(
        external_id=external_id or str(ObjectId()),
        language=language,
        title="Test Intervention",
        description="Desc",
        content_type=content_type,
        is_private=is_private,
    )
    iv.save()
    return iv


def _make_patient():
    """Create a minimal User + Therapist + Patient chain."""
    therapist_user = User(
        username=f"th-{ObjectId()}",
        createdAt=datetime.now(),
        isActive=True,
    )
    therapist_user.save()
    therapist = Therapist(userId=therapist_user, default_recommendations=[])
    therapist.save()

    patient_user = User(
        username=f"p-{ObjectId()}",
        createdAt=datetime.now(),
        isActive=True,
    )
    patient_user.save()
    patient = Patient(
        userId=patient_user,
        patient_code=f"PAT-{ObjectId()}",
        name="Patient",
        first_name="Test",
        age="30",
        therapist=therapist,
        sex="Male",
        diagnosis=["Stroke"],
        function=["Cardiology"],
        level_of_education="High School",
        professional_status="Employed Full-Time",
        marital_status="Single",
        lifestyle=[],
        personal_goals=[],
        reha_end_date=datetime.now() + timedelta(days=30),
    )
    patient.save()
    return patient


def _make_star_question(question_key="rating_stars_education"):
    """Seed one star-rating FeedbackQuestion with keys '1'–'5'."""
    q = FeedbackQuestion(
        questionSubject="Intervention",
        questionKey=question_key,
        answer_type="select",
        applicable_types=["All"],  # simplified: "All" so aggregation finds it regardless of type
        translations=[Translation(language="en", text="Rate it")],
        possibleAnswers=[
            AnswerOption(key=str(i), translations=[Translation(language="en", text=f"{i}/5")]) for i in range(1, 6)
        ],
    )
    q.save()
    return q


def _submit_star_rating(patient, intervention, star_question, star_value: int):
    """
    Write a PatientInterventionLogs entry containing a star-rating FeedbackEntry.
    ``star_value`` must be 1–5.
    """
    from core.models import FeedbackEntry

    plan = RehabilitationPlan.objects(patientId=patient).first()
    if plan is None:
        plan = RehabilitationPlan(
            patientId=patient,
            therapistId=patient.therapist,
            startDate=datetime.now(),
            endDate=datetime.now() + timedelta(days=30),
            status="active",
            interventions=[],
        )
        plan.save()

    entry = FeedbackEntry(
        questionId=star_question,
        answerKey=[AnswerOption(key=str(star_value), translations=[])],
        comment="",
    )
    log = PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=plan,
        date=datetime.now(),
        status=["completed"],
        feedback=[entry],
    )
    log.save()
    return log


# ===========================================================================
# _get_star_q_ids() module-level cache
# ===========================================================================


def test_get_star_q_ids_caches_an_empty_result_until_ttl_expires(mongo_mock):
    """
    An environment with zero rating_stars_* questions must still cache that
    empty result, not re-query FeedbackQuestion on every call.

    Regression: ``if not cached_ids`` treated a legitimately-cached empty
    list the same as "never cached", so every request re-ran the DB query
    instead of respecting the 10-minute TTL.
    """
    from unittest.mock import MagicMock, patch

    import utils.interventions as interventions_utils

    query_mock = MagicMock()
    query_mock.return_value.only.return_value = []

    with patch.object(interventions_utils, "FeedbackQuestion") as fq_mock:
        fq_mock.objects = query_mock
        first = interventions_utils._get_star_q_ids()
        second = interventions_utils._get_star_q_ids()

    assert first == []
    assert second == []
    assert query_mock.call_count == 1, "second call should have reused the cached empty list, not re-queried"


# ===========================================================================
# avg_rating / rating_count on GET /api/interventions/all/
# ===========================================================================


def test_list_all_interventions_avg_rating_none_when_no_feedback(mongo_mock):
    """
    Interventions with no feedback logs must have ``avg_rating: null`` and
    ``rating_count: 0`` in the response.

    This is the baseline state for a newly uploaded intervention.
    """
    _make_intervention()

    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200

    data = resp.json()
    assert len(data) >= 1
    item = data[0]
    assert item["avg_rating"] is None, f"Expected None, got {item['avg_rating']}"
    assert item["rating_count"] == 0, f"Expected 0, got {item['rating_count']}"


def test_list_all_interventions_avg_rating_single_rating(mongo_mock):
    """
    After one patient gives a 4-star rating, the intervention's
    ``avg_rating`` must be 4.0 and ``rating_count`` must be 1.
    """
    iv = _make_intervention()
    star_q = _make_star_question()
    patient = _make_patient()
    _submit_star_rating(patient, iv, star_q, star_value=4)

    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200

    rated = next((x for x in resp.json() if x["_id"] == str(iv.id)), None)
    assert rated is not None, "Intervention not found in response"
    assert rated["avg_rating"] == 4.0, f"Expected 4.0, got {rated['avg_rating']}"
    assert rated["rating_count"] == 1, f"Expected 1, got {rated['rating_count']}"


def test_list_all_interventions_avg_rating_multiple_patients(mongo_mock):
    """
    Ratings from multiple patients are averaged correctly.

    Patient A rates 5 stars, Patient B rates 3 stars → average 4.0.
    """
    iv = _make_intervention()
    star_q = _make_star_question()
    patient_a = _make_patient()
    patient_b = _make_patient()
    _submit_star_rating(patient_a, iv, star_q, star_value=5)
    _submit_star_rating(patient_b, iv, star_q, star_value=3)

    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200

    rated = next((x for x in resp.json() if x["_id"] == str(iv.id)), None)
    assert rated is not None
    assert rated["avg_rating"] == 4.0, f"Expected 4.0, got {rated['avg_rating']}"
    assert rated["rating_count"] == 2, f"Expected 2, got {rated['rating_count']}"


def test_list_all_interventions_non_rating_feedback_excluded_from_average(mongo_mock):
    """
    Non-star feedback (difficulty_scale, open_feedback) must not affect
    ``avg_rating``.  Only ``rating_stars_*`` question keys feed the aggregation.
    """
    from core.models import FeedbackEntry

    iv = _make_intervention()

    # Seed a non-star question
    difficulty_q = FeedbackQuestion(
        questionSubject="Intervention",
        questionKey="difficulty_scale",
        answer_type="select",
        applicable_types=["All"],
        translations=[Translation(language="en", text="Difficulty?")],
        possibleAnswers=[AnswerOption(key="too_easy", translations=[Translation(language="en", text="Too easy")])],
    )
    difficulty_q.save()

    # Also seed a star question so the aggregation has something to look for
    star_q = _make_star_question()

    patient = _make_patient()
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=patient.therapist,
        startDate=datetime.now(),
        endDate=datetime.now() + timedelta(days=30),
        status="active",
        interventions=[],
    )
    plan.save()

    # Log with difficulty answer only — no star rating
    difficulty_entry = FeedbackEntry(
        questionId=difficulty_q,
        answerKey=[AnswerOption(key="too_easy", translations=[])],
        comment="",
    )
    PatientInterventionLogs(
        userId=patient,
        interventionId=iv,
        rehabilitationPlanId=plan,
        date=datetime.now(),
        status=["completed"],
        feedback=[difficulty_entry],
    ).save()

    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200

    rated = next((x for x in resp.json() if x["_id"] == str(iv.id)), None)
    assert rated is not None
    # No star ratings submitted → should still be null
    assert rated["avg_rating"] is None, f"Non-star feedback leaked into avg_rating: {rated['avg_rating']}"
    assert rated["rating_count"] == 0


def test_list_all_interventions_independent_avg_per_intervention(mongo_mock):
    """
    Ratings for one intervention must not affect the avg_rating of another.

    Two interventions: only one is rated.  The unrated one keeps avg_rating=null.
    """
    iv_rated = _make_intervention(external_id="EXT-RATED")
    iv_unrated = _make_intervention(external_id="EXT-UNRATED")

    star_q = _make_star_question()
    patient = _make_patient()
    _submit_star_rating(patient, iv_rated, star_q, star_value=5)

    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    data = resp.json()

    rated = next((x for x in data if x["_id"] == str(iv_rated.id)), None)
    unrated = next((x for x in data if x["_id"] == str(iv_unrated.id)), None)

    assert rated is not None and unrated is not None
    assert rated["avg_rating"] == 5.0
    assert unrated["avg_rating"] is None
    assert unrated["rating_count"] == 0


def test_list_all_interventions_rating_counts_non_chosen_language_variant(mongo_mock):
    """
    An intervention with two language variants (same external_id) only
    displays one variant, but a rating logged against the *other* variant
    must still be counted toward the displayed intervention's rating_count.

    Regression test: the aggregation used to match only the chosen variant's
    MongoDB _id, silently dropping ratings recorded against sibling variants.
    """
    external_id = "EXT-MULTILANG"
    iv_en = _make_intervention(external_id=external_id, language="en")
    iv_de = _make_intervention(external_id=external_id, language="de")

    star_q = _make_star_question()
    patient_a = _make_patient()
    patient_b = _make_patient()
    _submit_star_rating(patient_a, iv_en, star_q, star_value=5)
    _submit_star_rating(patient_b, iv_de, star_q, star_value=3)

    resp = client.get("/api/interventions/all/?lang=en", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    data = resp.json()

    matches = [x for x in data if x["external_id"] == external_id]
    assert len(matches) == 1, f"Expected one displayed variant, got {len(matches)}"
    item = matches[0]
    assert item["rating_count"] == 2, f"Expected 2 (both variants), got {item['rating_count']}"
    assert item["avg_rating"] == 4.0, f"Expected 4.0, got {item['avg_rating']}"


def test_list_all_interventions_avg_rating_rounded_to_one_decimal(mongo_mock):
    """
    avg_rating is rounded to one decimal place in the response.

    Three ratings of 1, 2, 3 → raw mean = 2.0 (exact).
    Three ratings of 1, 2, 4 → raw mean = 2.333… → reported as 2.3.
    """
    iv = _make_intervention()
    star_q = _make_star_question()
    for star_value in (1, 2, 4):
        _submit_star_rating(_make_patient(), iv, star_q, star_value=star_value)

    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    rated = next((x for x in resp.json() if x["_id"] == str(iv.id)), None)
    assert rated is not None
    # 7 / 3 = 2.333... rounded to 1 dp = 2.3
    assert rated["avg_rating"] == 2.3, f"Expected 2.3, got {rated['avg_rating']}"
    assert rated["rating_count"] == 3


def test_list_all_interventions_star_entry_with_empty_answer_key_excluded(mongo_mock):
    """
    A FeedbackEntry on a rating_stars_* question with an empty answerKey (no
    star actually selected) must not be counted as a rating or dilute the
    average.

    Regression: the aggregation used to divide the rating sum by a count that
    included these entries, pulling avg_rating toward 0 for any intervention
    with one.
    """
    from core.models import FeedbackEntry

    iv = _make_intervention()
    star_q = _make_star_question()
    patient = _make_patient()
    _submit_star_rating(patient, iv, star_q, star_value=5)

    plan = RehabilitationPlan.objects(patientId=patient).first()
    empty_entry = FeedbackEntry(questionId=star_q, answerKey=[], comment="")
    PatientInterventionLogs(
        userId=patient,
        interventionId=iv,
        rehabilitationPlanId=plan,
        date=datetime.now(),
        status=["completed"],
        feedback=[empty_entry],
    ).save()

    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200

    rated = next((x for x in resp.json() if x["_id"] == str(iv.id)), None)
    assert rated is not None
    assert rated["avg_rating"] == 5.0, f"Empty answerKey diluted avg_rating: {rated['avg_rating']}"
    assert rated["rating_count"] == 1, f"Empty answerKey counted as a rating: {rated['rating_count']}"


def test_list_all_interventions_star_entry_with_non_numeric_answer_key_excluded(mongo_mock):
    """
    A FeedbackEntry on a rating_stars_* question with a non-numeric answerKey
    (e.g. corrupt/legacy data) must be excluded, not crash the aggregation.

    Regression: $toInt raises a hard conversion error on a non-numeric,
    non-empty string, taking down the whole endpoint instead of just
    excluding that one bad rating.
    """
    from core.models import FeedbackEntry

    iv = _make_intervention()
    star_q = _make_star_question()
    patient = _make_patient()
    _submit_star_rating(patient, iv, star_q, star_value=5)

    plan = RehabilitationPlan.objects(patientId=patient).first()
    bad_entry = FeedbackEntry(
        questionId=star_q,
        answerKey=[AnswerOption(key="n/a", translations=[])],
        comment="",
    )
    PatientInterventionLogs(
        userId=patient,
        interventionId=iv,
        rehabilitationPlanId=plan,
        date=datetime.now(),
        status=["completed"],
        feedback=[bad_entry],
    ).save()

    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200

    rated = next((x for x in resp.json() if x["_id"] == str(iv.id)), None)
    assert rated is not None
    assert rated["avg_rating"] == 5.0, f"Non-numeric answerKey diluted avg_rating: {rated['avg_rating']}"
    assert rated["rating_count"] == 1, f"Non-numeric answerKey counted as a rating: {rated['rating_count']}"


def test_list_all_interventions_star_entry_with_whitespace_padded_answer_key_counted(mongo_mock):
    """
    A FeedbackEntry on a rating_stars_* question with incidental whitespace
    around the key (e.g. " 3 ") must still be counted.

    Regression: the aggregation matched the raw stored key exactly, while
    _star_rating_value() (used by the therapist plan/traffic-light views)
    strips whitespace before parsing. A rating with stray whitespace was
    silently dropped here while still counting on the therapist side,
    producing a rating mismatch between endpoints for the same data.
    """
    from core.models import FeedbackEntry

    iv = _make_intervention()
    star_q = _make_star_question()
    patient = _make_patient()
    _submit_star_rating(patient, iv, star_q, star_value=5)

    plan = RehabilitationPlan.objects(patientId=patient).first()
    padded_entry = FeedbackEntry(
        questionId=star_q,
        answerKey=[AnswerOption(key=" 3 ", translations=[])],
        comment="",
    )
    PatientInterventionLogs(
        userId=patient,
        interventionId=iv,
        rehabilitationPlanId=plan,
        date=datetime.now(),
        status=["completed"],
        feedback=[padded_entry],
    ).save()

    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200

    rated = next((x for x in resp.json() if x["_id"] == str(iv.id)), None)
    assert rated is not None
    assert rated["rating_count"] == 2, f"Whitespace-padded key was excluded: {rated['rating_count']}"
    assert rated["avg_rating"] == 4.0, f"Expected (5+3)/2=4.0, got {rated['avg_rating']}"


def test_list_all_interventions_star_entry_with_out_of_range_numeric_answer_key_excluded(mongo_mock):
    """
    A FeedbackEntry on a rating_stars_* question with a numeric but out-of-range
    answerKey (e.g. a malformed/direct API submission, not the 1-5 star widget)
    must be excluded, not crash the aggregation.

    Regression: a regex of "^[0-9]+$" accepts any digit string, so an
    overly long one still overflows $toInt, taking down the whole endpoint.
    """
    from core.models import FeedbackEntry

    iv = _make_intervention()
    star_q = _make_star_question()
    patient = _make_patient()
    _submit_star_rating(patient, iv, star_q, star_value=5)

    plan = RehabilitationPlan.objects(patientId=patient).first()
    overflow_entry = FeedbackEntry(
        questionId=star_q,
        answerKey=[AnswerOption(key="99999999999999", translations=[])],
        comment="",
    )
    PatientInterventionLogs(
        userId=patient,
        interventionId=iv,
        rehabilitationPlanId=plan,
        date=datetime.now(),
        status=["completed"],
        feedback=[overflow_entry],
    ).save()

    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200

    rated = next((x for x in resp.json() if x["_id"] == str(iv.id)), None)
    assert rated is not None
    assert rated["avg_rating"] == 5.0, f"Out-of-range answerKey diluted avg_rating: {rated['avg_rating']}"
    assert rated["rating_count"] == 1, f"Out-of-range answerKey counted as a rating: {rated['rating_count']}"


def test_list_all_interventions_star_entry_with_multiple_answer_keys_uses_valid_one(mongo_mock):
    """
    A FeedbackEntry whose answerKey list has more than one item (e.g. an
    invalid placeholder key followed by the real star value) must still be
    counted using the first valid 1-5 key, not just index 0.

    Regression: the aggregation only inspected answerKey[0], while
    _star_rating_value() (used by the therapist plan/traffic-light views)
    scans every key in the entry. A rating stored as [{"n/a"}, {"5"}] was
    silently dropped here while still counting as 5 stars on the therapist
    side, producing a rating mismatch between endpoints for the same data.
    """
    from core.models import FeedbackEntry

    iv = _make_intervention()
    star_q = _make_star_question()
    patient = _make_patient()
    _submit_star_rating(patient, iv, star_q, star_value=5)

    plan = RehabilitationPlan.objects(patientId=patient).first()
    multi_key_entry = FeedbackEntry(
        questionId=star_q,
        answerKey=[
            AnswerOption(key="n/a", translations=[]),
            AnswerOption(key="3", translations=[]),
        ],
        comment="",
    )
    PatientInterventionLogs(
        userId=patient,
        interventionId=iv,
        rehabilitationPlanId=plan,
        date=datetime.now(),
        status=["completed"],
        feedback=[multi_key_entry],
    ).save()

    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200

    rated = next((x for x in resp.json() if x["_id"] == str(iv.id)), None)
    assert rated is not None
    assert rated["rating_count"] == 2, f"Multi-item answerKey was dropped: {rated['rating_count']}"
    assert rated["avg_rating"] == 4.0, f"Expected (5+3)/2=4.0, got {rated['avg_rating']}"
