"""
Tests for admin questionnaire management endpoints:
  GET    /api/admin/questionnaires/
  DELETE /api/admin/questionnaires/<id>/
  PUT    /api/admin/questionnaires/<id>/
"""

import json
from datetime import datetime

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import HealthQuestionnaire, Patient, RehabilitationPlan, Therapist, User

LIST_URL = "/api/admin/questionnaires/"
DETAIL_URL = "/api/admin/questionnaires/{}/"

client = Client()


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
    patient_user = User(
        username=f"p-{datetime.now().timestamp()}", createdAt=datetime.now(), isActive=True
    ).save()
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
        questionnaires=[
            QuestionnaireAssignment(questionnaireId=questionnaire, frequency="Daily")
        ],
    ).save()
    return plan


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
