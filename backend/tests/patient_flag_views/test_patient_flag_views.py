"""
Patient flag + comments views tests
====================================

Endpoints covered
------------------
PATCH /api/patients/<patient_id>/flag/
GET   /api/patients/<patient_id>/comments/
POST  /api/patients/<patient_id>/comments/
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
        clinic="Inselspital",
    ).save()
    return patient


# ===========================================================================
# PATCH /flag/
# ===========================================================================


def test_flag_patient_not_found():
    resp = client.patch(
        f"/api/patients/{ObjectId()}/flag/",
        data=json.dumps({"flagged": True}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert resp.json()["message"] == "Patient not found."


def test_flag_patient_malformed_id_returns_404_not_500():
    """A garbage id must resolve to a clean 404, not an unhandled InvalidId crash."""
    resp = client.patch(
        "/api/patients/not-a-valid-object-id/flag/",
        data=json.dumps({"flagged": True}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert resp.json()["message"] == "Patient not found."


def test_flag_method_not_allowed():
    patient = create_patient()
    resp = client.get(f"/api/patients/{patient.id}/flag/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405


def test_flag_invalid_json():
    patient = create_patient()
    resp = client.patch(
        f"/api/patients/{patient.id}/flag/",
        data="{bad-json",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert resp.json()["message"] == "Invalid JSON body."


def test_flag_validation_error_missing_field():
    patient = create_patient()
    resp = client.patch(
        f"/api/patients/{patient.id}/flag/",
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "flagged" in resp.json()["field_errors"]


def test_flag_validation_error_non_bool():
    patient = create_patient()
    resp = client.patch(
        f"/api/patients/{patient.id}/flag/",
        data=json.dumps({"flagged": "yes"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "flagged" in resp.json()["field_errors"]


def test_flag_success_sets_audit_fields_and_unflag_clears_them():
    patient = create_patient()

    resp = client.patch(
        f"/api/patients/{patient.id}/flag/",
        data=json.dumps({"flagged": True}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["flagged"] is True
    assert body["flagged_at"] is not None

    patient.reload()
    assert patient.flagged is True
    assert patient.flagged_at is not None

    resp2 = client.patch(
        f"/api/patients/{patient.id}/flag/",
        data=json.dumps({"flagged": False}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert body2["flagged"] is False
    assert body2["flagged_at"] is None
    assert body2["flagged_by"] == ""

    patient.reload()
    assert patient.flagged is False
    assert patient.flagged_at is None
    assert patient.flagged_by == ""


# ===========================================================================
# GET/POST /comments/
# ===========================================================================


def test_comments_get_not_found():
    resp = client.get(f"/api/patients/{ObjectId()}/comments/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 404


def test_comments_get_malformed_id_returns_404_not_500():
    resp = client.get("/api/patients/not-a-valid-object-id/comments/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 404


def test_comments_method_not_allowed():
    patient = create_patient()
    resp = client.delete(f"/api/patients/{patient.id}/comments/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405


def test_comments_get_empty_list_for_fresh_patient():
    patient = create_patient()
    resp = client.get(f"/api/patients/{patient.id}/comments/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["comments"] == []


def test_comments_post_invalid_json():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/comments/",
        data="{bad-json",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert resp.json()["message"] == "Invalid JSON body."


def test_comments_post_missing_text():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/comments/",
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "text" in resp.json()["field_errors"]


def test_comments_post_whitespace_only_text():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/comments/",
        data=json.dumps({"text": "   "}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "text" in resp.json()["field_errors"]


def test_comments_post_text_too_long():
    patient = create_patient()
    resp = client.post(
        f"/api/patients/{patient.id}/comments/",
        data=json.dumps({"text": "x" * 1001}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "text" in resp.json()["field_errors"]


def test_comments_post_success_then_get_returns_newest_first():
    patient = create_patient()

    resp1 = client.post(
        f"/api/patients/{patient.id}/comments/",
        data=json.dumps({"text": "Called patient, no answer."}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp1.status_code == 201
    assert len(resp1.json()["comments"]) == 1

    resp2 = client.post(
        f"/api/patients/{patient.id}/comments/",
        data=json.dumps({"text": "Called again, reached them."}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp2.status_code == 201
    comments = resp2.json()["comments"]
    assert len(comments) == 2
    # Newest first
    assert comments[0]["text"] == "Called again, reached them."
    assert comments[1]["text"] == "Called patient, no answer."

    get_resp = client.get(f"/api/patients/{patient.id}/comments/", HTTP_AUTHORIZATION="Bearer test")
    assert get_resp.status_code == 200
    get_comments = get_resp.json()["comments"]
    assert [c["text"] for c in get_comments] == [
        "Called again, reached them.",
        "Called patient, no answer.",
    ]

    patient.reload()
    assert len(patient.comments) == 2
