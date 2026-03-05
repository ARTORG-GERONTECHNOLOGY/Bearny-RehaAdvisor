"""
Patient thresholds views tests
==============================

Endpoints covered
-----------------
GET    /api/patients/<patient_id>/thresholds/
PATCH  /api/patients/<patient_id>/thresholds/
POST   /api/patients/<patient_id>/thresholds/ (alias of PATCH logic)
"""

import json
from datetime import datetime

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import Patient, Therapist, User

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


def create_patient():
    th_user = User(
        username=f"th-{ObjectId()}",
        email="th@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(
        userId=th_user,
        name="Therapist",
        first_name="A",
        clinics=["Inselspital"],
    ).save()

    p_user = User(
        username=f"pt-{ObjectId()}",
        email="pt@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    patient = Patient(
        userId=p_user,
        patient_code=f"PAT-{ObjectId()}",
        therapist=th,
    ).save()
    return patient


def test_thresholds_get_patient_not_found():
    resp = client.get(f"/api/patients/{ObjectId()}/thresholds/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 404
    body = resp.json()
    assert body["success"] is False
    assert body["message"] == "Patient not found."


def test_thresholds_get_success_with_defaults():
    patient = create_patient()
    resp = client.get(f"/api/patients/{patient.id}/thresholds/", HTTP_AUTHORIZATION="Bearer test")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["patient_id"] == str(patient.id)
    assert "thresholds" in body
    assert "steps_goal" in body["thresholds"]
    assert body["history"] == []


def test_thresholds_method_not_allowed():
    patient = create_patient()
    resp = client.delete(f"/api/patients/{patient.id}/thresholds/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405
    assert resp.json()["message"] == "Method not allowed."


def test_thresholds_patch_invalid_json():
    patient = create_patient()
    resp = client.patch(
        f"/api/patients/{patient.id}/thresholds/",
        data="{bad-json",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert resp.json()["message"] == "Invalid JSON body."


def test_thresholds_patch_validation_error_unknown_field():
    patient = create_patient()
    resp = client.patch(
        f"/api/patients/{patient.id}/thresholds/",
        data=json.dumps({"thresholds": {"unknown_field": 1}}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 400
    body = resp.json()
    assert body["message"] == "Validation error."
    assert "thresholds.unknown_field" in body["field_errors"]


def test_thresholds_patch_validation_error_cross_field():
    patient = create_patient()
    resp = client.patch(
        f"/api/patients/{patient.id}/thresholds/",
        data=json.dumps(
            {
                "thresholds": {
                    "active_minutes_green": 10,
                    "active_minutes_yellow": 20,
                }
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 400
    body = resp.json()
    assert body["message"] == "Validation error."
    assert "thresholds.active_minutes_green" in body["field_errors"]


def test_thresholds_patch_success_updates_values_and_creates_history_snapshot():
    patient = create_patient()

    # First update should create a history snapshot of previous thresholds.
    resp = client.patch(
        f"/api/patients/{patient.id}/thresholds/",
        data=json.dumps(
            {
                "thresholds": {
                    "steps_goal": 12000,
                    "active_minutes_green": 40,
                    "active_minutes_yellow": 25,
                },
                "reason": "weekly review",
                "effective_from": "2026-01-01T10:00:00Z",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["message"] == "Thresholds updated."
    assert body["thresholds"]["steps_goal"] == 12000
    assert body["thresholds"]["active_minutes_green"] == 40
    assert body["thresholds"]["active_minutes_yellow"] == 25

    patient.reload()
    assert patient.thresholds.steps_goal == 12000
    assert len(patient.thresholds_history) == 1


def test_thresholds_post_uses_same_update_logic():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/thresholds/",
        data=json.dumps({"thresholds": {"steps_goal": 9000}}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    assert resp.json()["thresholds"]["steps_goal"] == 9000


# ===========================================================================
# History values + changed_by
# ===========================================================================


def _make_jwt(username: str) -> str:
    """Generate a real simplejwt AccessToken with a username claim."""
    from rest_framework_simplejwt.tokens import AccessToken

    token = AccessToken()
    token["username"] = username
    return str(token)


def test_thresholds_history_includes_threshold_values():
    """GET history snapshots include the previous threshold values dict."""
    patient = create_patient()
    # PATCH: sets steps_goal to 5000 (snapshot stores the old default values)
    client.patch(
        f"/api/patients/{patient.id}/thresholds/",
        data=json.dumps({"thresholds": {"steps_goal": 5000}}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    resp = client.get(f"/api/patients/{patient.id}/thresholds/", HTTP_AUTHORIZATION="Bearer test")
    body = resp.json()
    assert len(body["history"]) == 1
    snap = body["history"][0]
    assert "thresholds" in snap
    assert "steps_goal" in snap["thresholds"]


def test_thresholds_patch_returns_history():
    """PATCH response includes a history field."""
    patient = create_patient()
    resp = client.patch(
        f"/api/patients/{patient.id}/thresholds/",
        data=json.dumps({"thresholds": {"steps_goal": 7777}}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    body = resp.json()
    assert "history" in body
    assert isinstance(body["history"], list)


def test_thresholds_changed_by_stored_in_snapshot():
    """changed_by is populated from the JWT username claim."""
    patient = create_patient()
    jwt = _make_jwt("dr.house")
    client.patch(
        f"/api/patients/{patient.id}/thresholds/",
        data=json.dumps({"thresholds": {"steps_goal": 8000}}),
        content_type="application/json",
        HTTP_AUTHORIZATION=f"Bearer {jwt}",
    )
    patient.reload()
    assert len(patient.thresholds_history) == 1
    assert patient.thresholds_history[0].changed_by == "dr.house"
