"""
Therapist access views tests
============================

Endpoints covered
-----------------
``GET /api/admin/therapist/access/<therapistId>/`` → ``therapist_access``
``PUT /api/admin/therapist/access/``               → ``therapist_access``

Coverage goals
--------------
* Validate therapist access read/update paths.
* Validate clinic/project normalization and compatibility checks.
* Validate input validation and not-found behavior.
"""

import json
from datetime import datetime

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import Logs, Therapist, User

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


def create_therapist():
    user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(
        userId=user,
        name="Therapist",
        first_name="T",
        clinics=["Inselspital"],
        projects=["COPAIN"],
    ).save()
    return user, therapist


def test_access_get_requires_therapist_id():
    resp = client.get("/api/admin/therapist/access/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 400
    assert resp.json()["error"] == "therapistId is required."


def test_access_get_not_found():
    resp = client.get(
        f"/api/admin/therapist/access/{ObjectId()}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert resp.json()["error"] == "Therapist not found."


def test_access_get_success():
    _, therapist = create_therapist()
    resp = client.get(
        f"/api/admin/therapist/access/{therapist.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["therapistId"] == str(therapist.id)
    assert payload["clinics"] == ["Inselspital"]
    assert payload["projects"] == ["COPAIN"]
    assert "availableClinics" in payload
    assert "availableProjects" in payload


def test_access_put_invalid_json():
    resp = client.put(
        "/api/admin/therapist/access/",
        data="{bad-json",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "Invalid JSON."


def test_access_put_requires_therapist_id():
    resp = client.put(
        "/api/admin/therapist/access/",
        data=json.dumps({"clinics": [], "projects": []}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "therapistId is required."


def test_access_put_requires_list_fields():
    _, therapist = create_therapist()
    resp = client.put(
        "/api/admin/therapist/access/",
        data=json.dumps({"therapistId": str(therapist.id), "clinics": "Inselspital", "projects": []}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "clinics must be a list."


def test_access_put_invalid_clinic_value():
    _, therapist = create_therapist()
    resp = client.put(
        "/api/admin/therapist/access/",
        data=json.dumps(
            {
                "therapistId": str(therapist.id),
                "clinics": ["InvalidClinic"],
                "projects": ["COPAIN"],
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 400
    body = resp.json()
    assert body["error"] == "Invalid clinic value."
    assert body["invalid"] == "InvalidClinic"


def test_access_put_rejects_project_not_allowed_for_selected_clinic():
    _, therapist = create_therapist()

    # Inselspital only allows COPAIN in current config.
    resp = client.put(
        "/api/admin/therapist/access/",
        data=json.dumps(
            {
                "therapistId": str(therapist.id),
                "clinics": ["Inselspital"],
                "projects": ["COMPASS"],
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 400
    body = resp.json()
    assert body["error"] == "Project not allowed for selected clinics."
    assert body["invalid"] == "COMPASS"


def test_access_put_success_updates_and_logs():
    _, therapist = create_therapist()

    resp = client.put(
        "/api/admin/therapist/access/",
        data=json.dumps(
            {
                "therapistId": str(therapist.id),
                "clinics": ["Inselspital", "Inselspital", "  "],
                "projects": ["COPAIN", "COPAIN"],
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["clinics"] == ["Inselspital"]
    assert body["projects"] == ["COPAIN"]

    therapist.reload()
    assert therapist.clinics == ["Inselspital"]
    assert therapist.projects == ["COPAIN"]
    assert Logs.objects(action="UPDATE_PROFILE").count() == 1
