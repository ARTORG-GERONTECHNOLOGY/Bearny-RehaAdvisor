"""
Therapist projects views tests
==============================

This module tests core/views/therapist_projects.py directly using RequestFactory
because this view is currently not wired in core/urls.py.
"""

import json
from datetime import datetime

import mongomock
import pytest
from bson import ObjectId
from django.test import RequestFactory

from core.models import Logs, Therapist, User
from core.views.therapist_projects import _bad, therapist_projects


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


@pytest.fixture
def rf():
    return RequestFactory()


def create_therapist(projects=None):
    user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(
        userId=user,
        name="T",
        first_name="H",
        clinics=["Inselspital"],
        projects=projects or ["COPAIN"],
    ).save()
    return th


def test_bad_helper_shape():
    resp = _bad("X", status=418, extra={"a": 1})
    assert resp.status_code == 418
    payload = json.loads(resp.content)
    assert payload == {"ok": False, "error": "X", "a": 1}


def test_projects_get_requires_therapist_id(rf):
    req = rf.get("/api/admin/therapist/projects/")
    resp = therapist_projects(req)
    assert resp.status_code == 400
    assert json.loads(resp.content)["error"] == "therapistId is required."


def test_projects_get_not_found(rf):
    req = rf.get(f"/api/admin/therapist/projects/?therapistId={ObjectId()}")
    resp = therapist_projects(req)
    assert resp.status_code == 404
    assert json.loads(resp.content)["error"] == "Therapist not found."


def test_projects_get_success(rf):
    th = create_therapist(["COPAIN"])
    req = rf.get(f"/api/admin/therapist/projects/?therapistId={th.id}")
    resp = therapist_projects(req)

    assert resp.status_code == 200
    payload = json.loads(resp.content)
    assert payload["ok"] is True
    assert payload["therapistId"] == str(th.id)
    assert payload["therapistUserId"] == str(th.userId.id)
    assert payload["projects"] == ["COPAIN"]
    assert "availableProjects" in payload


def test_projects_put_invalid_json(rf):
    req = rf.put(
        "/api/admin/therapist/projects/",
        data="{bad",
        content_type="application/json",
    )
    resp = therapist_projects(req)
    assert resp.status_code == 400
    assert json.loads(resp.content)["error"] == "Invalid JSON."


def test_projects_put_requires_therapist_id(rf):
    req = rf.put(
        "/api/admin/therapist/projects/",
        data=json.dumps({"projects": ["COPAIN"]}),
        content_type="application/json",
    )
    resp = therapist_projects(req)
    assert resp.status_code == 400
    assert json.loads(resp.content)["error"] == "therapistId is required."


def test_projects_put_requires_projects_field(rf):
    th = create_therapist()
    req = rf.put(
        "/api/admin/therapist/projects/",
        data=json.dumps({"therapistId": str(th.id)}),
        content_type="application/json",
    )
    resp = therapist_projects(req)
    assert resp.status_code == 400
    assert json.loads(resp.content)["error"] == "projects is required."


def test_projects_put_success_updates_projects_and_logs(rf):
    th = create_therapist()
    req = rf.put(
        "/api/admin/therapist/projects/",
        data=json.dumps({"therapistId": str(th.id), "projects": ["COPAIN", "COPAIN", "  "]}),
        content_type="application/json",
    )

    resp = therapist_projects(req)
    assert resp.status_code == 200
    body = json.loads(resp.content)
    assert body["ok"] is True
    assert body["projects"] == ["COPAIN"]

    th.reload()
    assert th.projects == ["COPAIN"]
    assert Logs.objects(action="UPDATE_PROFILE").count() == 1
