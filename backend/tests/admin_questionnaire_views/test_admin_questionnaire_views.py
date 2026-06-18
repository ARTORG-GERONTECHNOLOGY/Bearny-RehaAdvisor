"""
Tests for admin questionnaire management endpoints:
  GET    /api/admin/questionnaires/
  DELETE /api/admin/questionnaires/<id>/
  PUT    /api/admin/questionnaires/<id>/
"""

import json
from datetime import datetime
from types import SimpleNamespace

import mongomock
import pytest
from bson import ObjectId
from rest_framework.test import APIClient

from core.models import HealthQuestionnaire, Patient, RehabilitationPlan, Therapist, User

LIST_URL = "/api/admin/questionnaires/"
DETAIL_URL = "/api/admin/questionnaires/{}/"

client: APIClient = None  # type: ignore[assignment]


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


@pytest.fixture(autouse=True)
def _setup_admin_client(mongo_mock):
    global client
    admin_user = User(
        username="admin_q_test",
        email="admin_q@test.example.com",
        role="Admin",
        isActive=True,
        createdAt=datetime.now(),
    )
    admin_user.pwdhash = "x"
    admin_user.save()
    c = APIClient()
    c.force_authenticate(user=SimpleNamespace(is_authenticated=True, id=str(admin_user.id)))
    client = c
    yield


# ── helpers ───────────────────────────────────────────────────────────────────


def _make_questionnaire(key="q-001", title="Test Q", tags=None, description=""):
    return HealthQuestionnaire(
        key=key,
        title=title,
        description=description,
        tags=tags or [],
        createdAt=datetime.now(),
    ).save()


def _make_plan_with_questionnaire(questionnaire):
    user = User(username=f"u-{datetime.now().timestamp()}", createdAt=datetime.now(), isActive=True).save()
    therapist = Therapist(userId=user, clinics=[], projects=[]).save()
    patient_user = User(username=f"p-{datetime.now().timestamp()}", createdAt=datetime.now(), isActive=True).save()
    patient = Patient(
        userId=patient_user,
        patient_code=f"pc-{datetime.now().timestamp()}",
        therapist=therapist,
    ).save()

    from core.models import QuestionnaireAssignment

    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime.now(),
        endDate=datetime.now(),
        status="active",
        questionnaires=[QuestionnaireAssignment(questionnaireId=questionnaire, frequency="Daily")],
    ).save()
    return plan


# ── Security ──────────────────────────────────────────────────────────────────


def test_list_requires_authentication():
    assert APIClient().get(LIST_URL).status_code == 401


def test_list_requires_admin_role():
    therapist_user = User(
        username="th_q_sec", email="th_q_sec@example.com", role="Therapist", isActive=True, createdAt=datetime.now()
    )
    therapist_user.pwdhash = "x"
    therapist_user.save()
    c = APIClient()
    c.force_authenticate(user=SimpleNamespace(is_authenticated=True, id=str(therapist_user.id)))
    assert c.get(LIST_URL).status_code == 403


# ── LIST ──────────────────────────────────────────────────────────────────────


def test_list_returns_empty_when_no_questionnaires():
    resp = client.get(LIST_URL)
    assert resp.status_code == 200
    assert resp.json()["questionnaires"] == []


def test_list_returns_all_questionnaires():
    _make_questionnaire(key="q-001", title="PHQ-9")
    _make_questionnaire(key="q-002", title="GAD-7")
    resp = client.get(LIST_URL)
    assert resp.status_code == 200
    titles = [q["title"] for q in resp.json()["questionnaires"]]
    assert "PHQ-9" in titles
    assert "GAD-7" in titles


def test_list_includes_usage_count():
    q = _make_questionnaire(key="q-used", title="Used Q")
    _make_plan_with_questionnaire(q)
    resp = client.get(LIST_URL)
    assert resp.status_code == 200
    item = next(i for i in resp.json()["questionnaires"] if i["key"] == "q-used")
    assert item["usage_count"] == 1


def test_list_includes_version_field():
    _make_questionnaire(key="q-ver", title="Version Q")
    resp = client.get(LIST_URL)
    assert resp.status_code == 200
    item = next(i for i in resp.json()["questionnaires"] if i["key"] == "q-ver")
    assert item["version"] == 1
    assert item["updatedAt"] is None


def test_list_search_filters_by_title():
    _make_questionnaire(key="phq9", title="PHQ-9 Depression")
    _make_questionnaire(key="gad7", title="GAD-7 Anxiety")
    resp = client.get(LIST_URL + "?q=depression")
    assert resp.status_code == 200
    results = resp.json()["questionnaires"]
    assert len(results) == 1
    assert results[0]["key"] == "phq9"


def test_list_search_filters_by_key():
    _make_questionnaire(key="phq9", title="PHQ-9")
    _make_questionnaire(key="gad7", title="GAD-7")
    resp = client.get(LIST_URL + "?q=gad")
    assert resp.status_code == 200
    results = resp.json()["questionnaires"]
    assert len(results) == 1
    assert results[0]["key"] == "gad7"


def test_list_method_not_allowed():
    resp = client.post(LIST_URL, content_type="application/json", data="{}")
    assert resp.status_code == 405


# ── DELETE ────────────────────────────────────────────────────────────────────


def test_delete_removes_questionnaire():
    q = _make_questionnaire(key="del-me")
    resp = client.delete(DETAIL_URL.format(str(q.pk)))
    assert resp.status_code == 200
    assert HealthQuestionnaire.objects(id=q.pk).count() == 0


def test_delete_cascades_from_rehabilitation_plans():
    q = _make_questionnaire(key="cascade-q")
    plan = _make_plan_with_questionnaire(q)
    assert len(plan.reload().questionnaires) == 1

    resp = client.delete(DETAIL_URL.format(str(q.pk)))
    assert resp.status_code == 200
    assert len(plan.reload().questionnaires) == 0


def test_delete_nonexistent_returns_404():
    resp = client.delete(DETAIL_URL.format(str(ObjectId())))
    assert resp.status_code == 404


def test_delete_invalid_id_returns_400():
    resp = client.delete(DETAIL_URL.format("not-an-objectid"))
    assert resp.status_code == 400


def test_delete_method_not_allowed_on_list():
    q = _make_questionnaire(key="q-method")
    resp = client.put(
        DETAIL_URL.format(str(q.pk)),
        content_type="application/json",
        data=json.dumps({"title": "New title"}),
    )
    # PUT is allowed; PATCH is not — confirm PATCH returns 405
    resp_patch = client.patch(DETAIL_URL.format(str(q.pk)))
    assert resp_patch.status_code == 405


# ── UPDATE ────────────────────────────────────────────────────────────────────


def test_update_title():
    q = _make_questionnaire(key="upd-title", title="Old Title")
    resp = client.put(
        DETAIL_URL.format(str(q.pk)),
        content_type="application/json",
        data=json.dumps({"title": "New Title"}),
    )
    assert resp.status_code == 200
    assert resp.json()["questionnaire"]["title"] == "New Title"
    assert HealthQuestionnaire.objects.get(id=q.pk).title == "New Title"


def test_update_description():
    q = _make_questionnaire(key="upd-desc")
    resp = client.put(
        DETAIL_URL.format(str(q.pk)),
        content_type="application/json",
        data=json.dumps({"description": "Updated description"}),
    )
    assert resp.status_code == 200
    assert resp.json()["questionnaire"]["description"] == "Updated description"


def test_update_tags():
    q = _make_questionnaire(key="upd-tags", tags=["old"])
    resp = client.put(
        DETAIL_URL.format(str(q.pk)),
        content_type="application/json",
        data=json.dumps({"tags": ["dynamic", "custom"]}),
    )
    assert resp.status_code == 200
    assert set(resp.json()["questionnaire"]["tags"]) == {"dynamic", "custom"}


def test_update_empty_title_returns_400():
    q = _make_questionnaire(key="upd-empty")
    resp = client.put(
        DETAIL_URL.format(str(q.pk)),
        content_type="application/json",
        data=json.dumps({"title": "   "}),
    )
    assert resp.status_code == 400


def test_update_tags_not_list_returns_400():
    q = _make_questionnaire(key="upd-bad-tags")
    resp = client.put(
        DETAIL_URL.format(str(q.pk)),
        content_type="application/json",
        data=json.dumps({"tags": "not-a-list"}),
    )
    assert resp.status_code == 400


def test_update_nonexistent_returns_404():
    resp = client.put(
        DETAIL_URL.format(str(ObjectId())),
        content_type="application/json",
        data=json.dumps({"title": "X"}),
    )
    assert resp.status_code == 404


def test_update_invalid_id_returns_400():
    resp = client.put(
        DETAIL_URL.format("bad-id"),
        content_type="application/json",
        data=json.dumps({"title": "X"}),
    )
    assert resp.status_code == 400


# ── VERSIONING ────────────────────────────────────────────────────────────────


def test_update_increments_version():
    q = _make_questionnaire(key="ver-inc", title="Original")
    assert q.version == 1

    resp = client.put(
        DETAIL_URL.format(str(q.pk)),
        content_type="application/json",
        data=json.dumps({"title": "First Edit"}),
    )
    assert resp.status_code == 200
    assert resp.json()["questionnaire"]["version"] == 2

    resp2 = client.put(
        DETAIL_URL.format(str(q.pk)),
        content_type="application/json",
        data=json.dumps({"title": "Second Edit"}),
    )
    assert resp2.status_code == 200
    assert resp2.json()["questionnaire"]["version"] == 3


def test_update_sets_updated_at():
    q = _make_questionnaire(key="ver-uat", title="Orig")
    assert q.updatedAt is None  # not set on create

    resp = client.put(
        DETAIL_URL.format(str(q.pk)),
        content_type="application/json",
        data=json.dumps({"title": "Edited"}),
    )
    assert resp.status_code == 200
    assert resp.json()["questionnaire"]["updatedAt"] is not None


def test_delete_removes_questionnaire_from_plan_but_past_answers_survive():
    """
    Cascade delete strips the QuestionnaireAssignment from the plan.
    PatientICFRating records (past answers) are unaffected — they reference
    FeedbackQuestion directly, not via HealthQuestionnaire.
    """
    from core.models import FeedbackEntry, FeedbackQuestion, PatientICFRating, Translation

    q = _make_questionnaire(key="cascade-ans")
    plan = _make_plan_with_questionnaire(q)
    patient = plan.patientId

    # Simulate a submitted answer referencing a FeedbackQuestion
    fq = FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey="cascade-ans_q1",
        answer_type="text",
        translations=[Translation(language="en", text="How are you?")],
        possibleAnswers=[],
    ).save()
    rating = PatientICFRating(
        patientId=patient,
        questionId=fq,
        icfCode="b1",
        feedback_entries=[FeedbackEntry(questionId=fq, comment="Fine", answerKey=[])],
    ).save()

    resp = client.delete(DETAIL_URL.format(str(q.pk)))
    assert resp.status_code == 200

    # Plan no longer has the assignment
    assert len(plan.reload().questionnaires) == 0

    # Past answer record is untouched
    assert PatientICFRating.objects(id=rating.pk).count() == 1
