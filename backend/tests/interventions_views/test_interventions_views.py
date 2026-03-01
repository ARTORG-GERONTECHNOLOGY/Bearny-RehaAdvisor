"""
Intervention views tests
========================

Endpoints covered
-----------------
``GET  /api/interventions/all/``
``GET  /api/interventions/all/<patient_id>/``   → ``list_all_interventions``
``POST /api/interventions/add/``                 → ``add_new_intervention``
``GET  /api/interventions/<id>/``                → ``get_intervention_detail``
``GET  /api/interventions/<id>/assigned-diagnoses/<spec>/therapist/<th_id>/``
                                                 → ``list_intervention_diagnoses``
``POST /api/therapists/<th_id>/interventions/assign-to-patient-types/``
                                                 → ``assign_intervention_to_types``
``POST /api/therapists/<th_id>/interventions/remove-from-patient-types/``
                                                 → ``remove_intervention_from_types``
``POST /api/recomendation/add/patientgroup/``    → ``create_patient_group``
``GET  /api/therapists/<th_id>/template-plan``   → ``template_plan_preview``
``POST /api/therapists/<th_id>/templates/apply`` → ``apply_template_to_patient``

Coverage goals
--------------
Happy-path
  * Listing, fetching, and creating interventions.
  * Assigning and removing a therapist's default recommendation for a diagnosis.
  * Adding a patient-type group to an intervention.
  * Template plan preview and template application.

Input validation (400)
  * Missing required fields per endpoint (title, description, contentType,
    duration, diagnosis, interventions list, etc.).
  * Malformed JSON body.
  * Invalid ObjectId strings.
  * Duplicate external_id + language combination on creation.
  * Duplicate patient group (same diagnosis + speciality).

Resource not found (404)
  * Unknown intervention, therapist, or patient ObjectId.
  * Trying to remove an assignment that does not exist.

HTTP method enforcement (405)
  * Each endpoint refuses wrong HTTP verbs.

Response shape verification
  * ``list_all_interventions`` returns a JSON array; each item has
    ``_id``, ``title``, ``content_type``, ``is_private``.
  * ``get_intervention_detail`` returns ``recommendation`` + ``feedback``.
  * Successful mutations return ``success: true``.

Test setup
----------
The ``mongo_mock`` autouse fixture provides an isolated in-memory mongomock
connection for every test.

File-upload tests mock ``default_storage.save`` to avoid touching the
filesystem.
"""

import io
import json
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import JsonResponse
from django.test import Client

from core.models import (
    DefaultInterventions,
    DiagnosisAssignmentSettings,
    Intervention,
    PatientInterventionLogs,
    PatientType,
    Therapist,
    User,
)

# ---------------------------------------------------------------------------
# Client / fixtures
# ---------------------------------------------------------------------------

client = Client()


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


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------


def make_upload(name="test.mp4", content=b"Fake video data", content_type="video/mp4"):
    return SimpleUploadedFile(name=name, content=content, content_type=content_type)


def create_intervention(external_id="test_stretch_001", language="en"):
    return Intervention(
        external_id=external_id,
        language=language,
        title="Stretching",
        description="Full body stretching session.",
        content_type="Video",
        patient_types=[],
        keywords=["Stretch"],
    ).save()


def create_therapist_and_intervention():
    user = User(
        username="therapist",
        email="t@example.com",
        phone="123",
        createdAt="2023-01-01",
        isActive=True,
    ).save()
    therapist = Therapist(
        userId=user,
        name="Therapist",
        first_name="Test",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
        default_recommendations=[],
    ).save()
    intervention = create_intervention()
    return therapist, intervention


def add_default_recommendation_block(therapist, intervention, diagnosis="Heart Attack"):
    """Add a properly structured DiagnosisAssignmentSettings block to a therapist."""
    block = DiagnosisAssignmentSettings(
        active=True,
        interval=1,
        unit="week",
        selected_days=["Monday"],
        end_type="count",
        count_limit=7,
        start_day=1,
        end_day=7,
    )
    therapist.default_recommendations.append(
        DefaultInterventions(
            recommendation=intervention,
            diagnosis_assignments={diagnosis: [block]},
        )
    )
    therapist.save()


# ===========================================================================
# list_all_interventions  —  GET /api/interventions/all/
# ===========================================================================


def test_list_all_interventions_success(mongo_mock):
    """
    GET /api/interventions/all/ with at least one Intervention in the
    database returns HTTP 200 and a JSON list containing an item with a
    ``title`` field.
    """
    create_intervention()
    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any("title" in item for item in data)


def test_list_all_interventions_empty_db(mongo_mock):
    """
    GET /api/interventions/all/ with no Interventions returns HTTP 200
    with an empty JSON list.  The endpoint must not crash on an empty DB.
    """
    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_all_interventions_response_item_shape(mongo_mock):
    """
    Each item in the list response must contain the keys the frontend
    relies on: ``_id``, ``title``, ``content_type``, and ``is_private``.
    """
    create_intervention()
    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    items = resp.json()
    assert len(items) >= 1
    item = items[0]
    for key in ("_id", "title", "content_type", "is_private"):
        assert key in item, f"Expected key '{key}' missing from list item"


# ===========================================================================
# add_new_intervention  —  POST /api/interventions/add/
# ===========================================================================


def test_add_new_intervention_success(mongo_mock):
    """
    POST with all required fields and a valid external media URL returns
    HTTP 200 with ``success: true``.
    """
    payload = {
        "title": "Yoga Session",
        "description": "A yoga session",
        "contentType": "video",
        "duration": "30",
        "external_id": "test_yoga_001",
        "language": "en",
        "media": json.dumps(
            [
                {
                    "kind": "external",
                    "media_type": "website",
                    "url": "https://example.com/yoga",
                }
            ]
        ),
    }
    resp = client.post("/api/interventions/add/", data=payload, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200, resp.content.decode()
    assert resp.json()["success"] is True


@patch("core.views.recomendation_views.default_storage.save")
def test_add_new_intervention_with_file_upload(mock_save, mongo_mock):
    """
    POST with a multipart file upload returns HTTP 200 with ``success: true``.
    ``default_storage.save`` is mocked to avoid filesystem access.
    """
    mock_save.return_value = "videos/test.mp4"
    dummy_file = make_upload()

    resp = client.post(
        "/api/interventions/add/",
        data={
            "title": "Pilates",
            "description": "A pilates class",
            "contentType": "video",
            "duration": "30",
            "media_file": dummy_file,
        },
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200, resp.content.decode()
    assert resp.json()["success"] is True


def test_add_new_intervention_missing_title(mongo_mock):
    """
    Omitting ``title`` returns 400 with ``field_errors.title``.
    Title is the primary human-readable identifier of an intervention.
    """
    payload = {
        "description": "Missing title",
        "contentType": "video",
        "duration": "30",
    }
    resp = client.post("/api/interventions/add/", data=payload, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 400
    assert "title" in resp.json().get("field_errors", {})


def test_add_new_intervention_missing_description(mongo_mock):
    """
    Omitting ``description`` returns 400 with ``field_errors.description``.
    """
    payload = {
        "title": "Test",
        "contentType": "video",
        "duration": "30",
    }
    resp = client.post("/api/interventions/add/", data=payload, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 400
    assert "description" in resp.json().get("field_errors", {})


def test_add_new_intervention_missing_content_type(mongo_mock):
    """
    Omitting ``contentType`` returns 400 with ``field_errors.contentType``.
    The content type determines how the media is rendered in the frontend.
    """
    payload = {
        "title": "Test",
        "description": "desc",
        "duration": "30",
    }
    resp = client.post("/api/interventions/add/", data=payload, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 400
    assert "contentType" in resp.json().get("field_errors", {})


def test_add_new_intervention_duration_zero_or_missing(mongo_mock):
    """
    Providing ``duration=0`` (or omitting it) returns 400 with
    ``field_errors.duration``.  Zero-duration interventions are meaningless.
    """
    payload = {
        "title": "Test",
        "description": "desc",
        "contentType": "video",
        "duration": "0",
    }
    resp = client.post("/api/interventions/add/", data=payload, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 400
    assert "duration" in resp.json().get("field_errors", {})


def test_add_new_intervention_duplicate_external_id(mongo_mock):
    """
    Creating an Intervention with an ``external_id`` + ``language`` pair
    that already exists returns 400.  The ``external_id`` is a stable
    cross-system identifier and must be unique per language.
    """
    create_intervention(external_id="test_dup_001", language="en")

    payload = {
        "external_id": "test_dup_001",
        "language": "en",
        "title": "Duplicate",
        "description": "Same external_id",
        "contentType": "video",
        "duration": "30",
    }
    resp = client.post("/api/interventions/add/", data=payload, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 400
    # The duplicate-check early-return path returns {"error": "..."} without a success key.
    assert "error" in resp.json()


def test_add_new_intervention_get_method_not_allowed(mongo_mock):
    """
    GET to the add-intervention endpoint returns 405.  Only POST is accepted.
    """
    resp = client.get("/api/interventions/add/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405


# ===========================================================================
# get_intervention_detail  —  GET /api/interventions/<id>/
# ===========================================================================


def test_get_intervention_detail_success(mongo_mock):
    """
    GET /api/interventions/<id>/ for an existing Intervention returns 200
    with a body that contains the ``recommendation`` key.
    """
    intervention = create_intervention()
    resp = client.get(f"/api/interventions/{intervention.id}/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    assert "recommendation" in resp.json()


def test_get_intervention_detail_response_shape(mongo_mock):
    """
    The detail response must contain both ``recommendation`` and ``feedback``
    keys.  ``feedback`` is an empty list when no patient logs exist.
    """
    intervention = create_intervention()
    resp = client.get(f"/api/interventions/{intervention.id}/", HTTP_AUTHORIZATION="Bearer test")
    data = resp.json()
    assert "recommendation" in data, "response must have 'recommendation'"
    assert "feedback" in data, "response must have 'feedback'"
    assert isinstance(data["feedback"], list)


def test_get_intervention_detail_not_found(mongo_mock):
    """
    GET with an ObjectId that matches no Intervention returns 404.
    """
    resp = client.get(f"/api/interventions/{ObjectId()}/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 404


def test_get_intervention_detail_method_not_allowed(mongo_mock):
    """
    POST to the detail endpoint returns 405.  The detail view is GET-only.
    """
    intervention = create_intervention()
    resp = client.post(
        f"/api/interventions/{intervention.id}/",
        data="{}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


# ===========================================================================
# list_intervention_diagnoses
# — GET /api/interventions/<id>/assigned-diagnoses/<spec>/therapist/<th_id>/
# ===========================================================================


def test_list_intervention_diagnoses_success(mongo_mock):
    """
    GET for a therapist who has a default recommendation block returns 200
    with a ``diagnoses`` dict and an ``all`` flag.
    """
    therapist, intervention = create_therapist_and_intervention()

    therapist.default_recommendations.append(
        DefaultInterventions(
            recommendation=intervention,
            diagnosis_assignments={
                "Heart Attack": [
                    {
                        "active": True,
                        "interval": 1,
                        "unit": "week",
                        "selected_days": [],
                        "end_type": "count",
                        "count_limit": 14,
                        "start_day": 1,
                        "end_day": 14,
                        "suggested_execution_time": 30,
                    }
                ]
            },
        )
    )
    therapist.save()

    resp = client.get(
        f"/api/interventions/{intervention.id}/assigned-diagnoses/Cardiology/therapist/{therapist.userId.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "diagnoses" in resp.json()


def test_list_intervention_diagnoses_not_found(mongo_mock):
    """
    Passing an ObjectId that matches no Therapist returns 404.
    """
    resp = client.get(
        f"/api/interventions/{ObjectId()}/assigned-diagnoses/Cardiology/therapist/{ObjectId()}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_list_intervention_diagnoses_method_not_allowed(mongo_mock):
    """
    POST to the diagnoses endpoint returns 405.  Only GET is accepted.
    """
    therapist, intervention = create_therapist_and_intervention()
    resp = client.post(
        f"/api/interventions/{intervention.id}/assigned-diagnoses/Cardiology/therapist/{therapist.userId.id}/",
        data="{}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


# ===========================================================================
# assign_intervention_to_types
# — POST /api/therapists/<th_id>/interventions/assign-to-patient-types/
# ===========================================================================

ASSIGN_URL = "/api/therapists/{th_id}/interventions/assign-to-patient-types/"
VALID_ASSIGN_PAYLOAD = {
    "diagnosis": "Heart Attack",
    "interventions": [
        {
            "interval": 2,
            "unit": "week",
            "selectedDays": ["Monday"],
            "start_day": 1,
            "end": {"type": "count", "count": 7},
            "suggested_execution_time": "10",
        }
    ],
}


def test_assign_intervention_to_types_success(mongo_mock):
    """
    POST a complete, valid payload for an existing therapist + intervention
    returns HTTP 200 or 201 with ``success: true``.
    """
    therapist, intervention = create_therapist_and_intervention()
    payload = dict(VALID_ASSIGN_PAYLOAD)
    payload["interventions"] = [
        {
            **VALID_ASSIGN_PAYLOAD["interventions"][0],
            "interventionId": str(intervention.id),
        }
    ]

    resp = client.post(
        ASSIGN_URL.format(th_id=therapist.userId.id),
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code in (200, 201), resp.content.decode()
    assert resp.json().get("success") is True


def test_assign_intervention_to_types_therapist_not_found(mongo_mock):
    """
    Supplying an unknown therapist ObjectId returns 404.
    """
    therapist, intervention = create_therapist_and_intervention()
    payload = dict(VALID_ASSIGN_PAYLOAD)
    payload["interventions"] = [
        {
            **VALID_ASSIGN_PAYLOAD["interventions"][0],
            "interventionId": str(intervention.id),
        }
    ]

    resp = client.post(
        ASSIGN_URL.format(th_id=ObjectId()),
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_assign_intervention_to_types_missing_diagnosis(mongo_mock):
    """
    Omitting ``diagnosis`` returns 400 with ``field_errors.diagnosis``.
    Every assignment must be tied to a specific patient diagnosis.
    """
    therapist, intervention = create_therapist_and_intervention()
    payload = {
        "interventions": [
            {
                "interventionId": str(intervention.id),
                "interval": 1,
                "unit": "week",
                "selectedDays": [],
                "start_day": 1,
                "end": {"type": "count", "count": 7},
            }
        ]
    }
    resp = client.post(
        ASSIGN_URL.format(th_id=therapist.userId.id),
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "diagnosis" in resp.json().get("field_errors", {})


def test_assign_intervention_to_types_missing_interventions_list(mongo_mock):
    """
    Omitting the ``interventions`` list returns 400 with
    ``field_errors.interventions``.  At least one entry is required.
    """
    therapist, _ = create_therapist_and_intervention()
    resp = client.post(
        ASSIGN_URL.format(th_id=therapist.userId.id),
        data=json.dumps({"diagnosis": "Heart Attack"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "interventions" in resp.json().get("field_errors", {})


def test_assign_intervention_to_types_malformed_json(mongo_mock):
    """
    Sending a body that is not valid JSON returns 400.
    """
    therapist, _ = create_therapist_and_intervention()
    resp = client.post(
        ASSIGN_URL.format(th_id=therapist.userId.id),
        data="{bad json}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_assign_intervention_to_types_get_method_not_allowed(mongo_mock):
    """
    GET to the assign endpoint returns 405.  Only POST is accepted.
    """
    therapist, _ = create_therapist_and_intervention()
    resp = client.get(
        ASSIGN_URL.format(th_id=therapist.userId.id),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


# ===========================================================================
# remove_intervention_from_types
# — POST /api/therapists/<th_id>/interventions/remove-from-patient-types/
# ===========================================================================

REMOVE_URL = "/api/therapists/{th_id}/interventions/remove-from-patient-types/"


def test_remove_intervention_from_types_success(mongo_mock):
    """
    POST with a valid therapist, a valid intervention ID that has an existing
    recommendation block for the given diagnosis, returns 200 with
    ``success: true``.
    """
    therapist, intervention = create_therapist_and_intervention()
    add_default_recommendation_block(therapist, intervention, diagnosis="Heart Attack")

    payload = {
        "intervention_id": str(intervention.id),
        "diagnosis": "Heart Attack",
    }
    resp = client.post(
        REMOVE_URL.format(th_id=therapist.userId.id),
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200, resp.content.decode()
    assert resp.json().get("success") is True


def test_remove_intervention_from_types_no_recommendation(mongo_mock):
    """
    Removing an intervention that has no default recommendation entry for
    the therapist returns 404.
    """
    therapist, intervention = create_therapist_and_intervention()
    payload = {
        "intervention_id": str(intervention.id),
        "diagnosis": "Heart Attack",
    }
    resp = client.post(
        REMOVE_URL.format(th_id=therapist.userId.id),
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_remove_intervention_from_types_therapist_not_found(mongo_mock):
    """
    Supplying an unknown therapist ObjectId returns 404.
    """
    therapist, intervention = create_therapist_and_intervention()
    payload = {
        "intervention_id": str(intervention.id),
        "diagnosis": "Heart Attack",
    }
    resp = client.post(
        REMOVE_URL.format(th_id=ObjectId()),
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_remove_intervention_from_types_missing_intervention_id(mongo_mock):
    """
    Omitting ``intervention_id`` returns 400 with
    ``field_errors.intervention_id``.
    """
    therapist, _ = create_therapist_and_intervention()
    resp = client.post(
        REMOVE_URL.format(th_id=therapist.userId.id),
        data=json.dumps({"diagnosis": "Heart Attack"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "intervention_id" in resp.json().get("field_errors", {})


def test_remove_intervention_from_types_missing_diagnosis(mongo_mock):
    """
    Omitting ``diagnosis`` returns 400 with ``field_errors.diagnosis``.
    """
    therapist, intervention = create_therapist_and_intervention()
    resp = client.post(
        REMOVE_URL.format(th_id=therapist.userId.id),
        data=json.dumps({"intervention_id": str(intervention.id)}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "diagnosis" in resp.json().get("field_errors", {})


def test_remove_intervention_from_types_malformed_json(mongo_mock):
    """
    Sending a body that is not valid JSON returns 400.
    """
    therapist, _ = create_therapist_and_intervention()
    resp = client.post(
        REMOVE_URL.format(th_id=therapist.userId.id),
        data="{bad json}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_remove_intervention_from_types_get_method_not_allowed(mongo_mock):
    """
    GET to the remove endpoint returns 405.  Only POST is accepted.
    """
    therapist, _ = create_therapist_and_intervention()
    resp = client.get(
        REMOVE_URL.format(th_id=therapist.userId.id),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


# ===========================================================================
# create_patient_group  —  POST /api/recomendation/add/patientgroup/
# ===========================================================================

GROUP_URL = "/api/recomendation/add/patientgroup/"


def test_create_patient_group_success(mongo_mock):
    """
    POST a complete payload with a valid ``interventionId`` returns 200
    with ``success: true``.  A new ``PatientType`` entry is appended to
    the Intervention document.
    """
    intervention = create_intervention()
    payload = {
        "interventionId": str(intervention.id),
        "diagnosis": "Stroke",
        "speciality": "Cardiology",
        "frequency": "Weekly",
    }
    resp = client.post(
        GROUP_URL,
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_create_patient_group_missing_fields(mongo_mock):
    """
    Sending a body that omits required fields (``interventionId``,
    ``diagnosis``, ``speciality``, ``frequency``) returns 400 with
    ``field_errors`` naming the missing keys.
    """
    resp = client.post(
        GROUP_URL,
        data=json.dumps({"diagnosis": "Stroke"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    errors = resp.json().get("field_errors", {})
    assert "interventionId" in errors
    assert "speciality" in errors
    assert "frequency" in errors


def test_create_patient_group_not_found(mongo_mock):
    """
    Supplying a valid ObjectId that matches no Intervention returns 404.
    """
    payload = {
        "interventionId": str(ObjectId()),
        "diagnosis": "Stroke",
        "speciality": "Cardiology",
        "frequency": "Weekly",
    }
    resp = client.post(
        GROUP_URL,
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_create_patient_group_duplicate_returns_400(mongo_mock):
    """
    Creating a second patient group with the same (``diagnosis`` +
    ``speciality``) combination on the same Intervention returns 400.
    Duplicate groups would produce ambiguous recommendations.
    """
    intervention = create_intervention()
    payload = {
        "interventionId": str(intervention.id),
        "diagnosis": "Stroke",
        "speciality": "Cardiology",
        "frequency": "Weekly",
    }
    # First creation — should succeed
    client.post(
        GROUP_URL,
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    # Second creation — must be rejected
    resp = client.post(
        GROUP_URL,
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert resp.json().get("success") is False


def test_create_patient_group_invalid_objectid(mongo_mock):
    """
    Sending a malformed ObjectId string for ``interventionId`` returns 400.
    """
    payload = {
        "interventionId": "not-an-objectid",
        "diagnosis": "Stroke",
        "speciality": "Cardiology",
        "frequency": "Weekly",
    }
    resp = client.post(
        GROUP_URL,
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_create_patient_group_get_method_not_allowed(mongo_mock):
    """
    GET to the patient-group endpoint returns 405.  Only POST is accepted.
    """
    resp = client.get(GROUP_URL, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405


# ===========================================================================
# template_plan_preview  —  GET /api/therapists/<th_id>/template-plan
# ===========================================================================

PREVIEW_URL = "/api/therapists/{th_id}/template-plan"


def test_template_plan_preview_success(mongo_mock):
    """
    GET the template plan preview for an existing therapist returns 200 with
    ``horizon_days`` and ``items`` keys.  When no recommendations exist,
    ``items`` is an empty list.
    """
    therapist, _ = create_therapist_and_intervention()
    resp = client.get(
        PREVIEW_URL.format(th_id=therapist.userId.id),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "horizon_days" in data
    assert "items" in data
    assert isinstance(data["items"], list)


def test_template_plan_preview_with_recommendation(mongo_mock):
    """
    When the therapist has at least one default recommendation block,
    the preview ``items`` list is non-empty and each item has
    ``intervention``, ``diagnosis``, ``schedule``, and ``occurrences``.
    """
    therapist, intervention = create_therapist_and_intervention()
    add_default_recommendation_block(therapist, intervention, diagnosis="Heart Attack")

    resp = client.get(
        PREVIEW_URL.format(th_id=therapist.userId.id),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    items = resp.json().get("items", [])
    assert len(items) >= 1
    item = items[0]
    for key in ("intervention", "diagnosis", "schedule", "occurrences"):
        assert key in item, f"Expected key '{key}' in template preview item"


def test_template_plan_preview_therapist_not_found(mongo_mock):
    """
    GET with an unknown therapist ObjectId returns 404.
    """
    resp = client.get(
        PREVIEW_URL.format(th_id=ObjectId()),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


# ===========================================================================
# apply_template_to_patient
# — POST /api/therapists/<th_id>/templates/apply
# ===========================================================================

APPLY_URL = "/api/therapists/{th_id}/templates/apply"


def test_apply_template_missing_required_fields(mongo_mock):
    """
    POST with an empty body returns 400 with ``field_errors`` naming the
    three required fields: ``patientId``, ``diagnosis``, ``effectiveFrom``.
    """
    therapist, _ = create_therapist_and_intervention()
    resp = client.post(
        APPLY_URL.format(th_id=therapist.userId.id),
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    errors = resp.json().get("field_errors", {})
    assert "patientId" in errors
    assert "diagnosis" in errors
    assert "effectiveFrom" in errors


def test_apply_template_therapist_not_found(mongo_mock):
    """
    Supplying an unknown therapist ObjectId returns 404 before even
    looking up the patient.
    """
    resp = client.post(
        APPLY_URL.format(th_id=ObjectId()),
        data=json.dumps(
            {
                "patientId": str(ObjectId()),
                "diagnosis": "Heart Attack",
                "effectiveFrom": "2025-01-01",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_apply_template_patient_not_found(mongo_mock):
    """
    Supplying a valid therapist but an unknown patientId returns 404.
    The view must not create partial rehabilitation plans.
    """
    therapist, _ = create_therapist_and_intervention()
    resp = client.post(
        APPLY_URL.format(th_id=therapist.userId.id),
        data=json.dumps(
            {
                "patientId": str(ObjectId()),
                "diagnosis": "Heart Attack",
                "effectiveFrom": "2025-01-01",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_apply_template_invalid_effective_date(mongo_mock):
    """
    Sending an ``effectiveFrom`` value that cannot be parsed as a date
    returns 400 with ``field_errors.effectiveFrom``.
    """
    therapist, _ = create_therapist_and_intervention()
    resp = client.post(
        APPLY_URL.format(th_id=therapist.userId.id),
        data=json.dumps(
            {
                "patientId": str(ObjectId()),
                "diagnosis": "Heart Attack",
                "effectiveFrom": "not-a-date",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "effectiveFrom" in resp.json().get("field_errors", {})


def test_apply_template_get_method_not_allowed(mongo_mock):
    """
    GET to the apply-template endpoint returns 405.  Only POST is accepted.
    """
    therapist, _ = create_therapist_and_intervention()
    resp = client.get(
        APPLY_URL.format(th_id=therapist.userId.id),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405
