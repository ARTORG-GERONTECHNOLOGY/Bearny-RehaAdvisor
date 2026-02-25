import io
import json
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import (
    DefaultInterventions,
    Intervention,
    PatientInterventionLogs,
    PatientType,
    Therapist,
    User,
)

client = Client()
from django.core.files.uploadedfile import SimpleUploadedFile

def make_upload(name="test.mp4", content=b"Fake video data", content_type="video/mp4"):
    return SimpleUploadedFile(name=name, content=content, content_type=content_type)

def add_default_recommendation_block(therapist, intervention, diagnosis="Heart Attack"):
    """
    Your model now expects:
      DefaultInterventions.diagnosis_assignments = { diagnosis: [DiagnosisAssignmentSettings, ...] }
    NOT {"active": True}.
    """
    from core.models import DefaultInterventions, DiagnosisAssignmentSettings

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

@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    import mongomock
    from mongoengine import connect, disconnect

    alias = "default"
    from mongoengine.connection import _connections

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


def create_intervention():
    return Intervention(
        external_id="test_stretch_001",
        language="en",
        title="Stretching",
        description="Full body stretching session.",
        content_type="Video",
        patient_types=[],
        keywords=["Stretch"],
    ).save()


def test_list_all_interventions_success(mongo_mock):
    create_intervention()
    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any("title" in item for item in data)


def test_add_existing_intervention_error(mongo_mock):
    create_intervention()  # creates external_id="test_stretch_002", language="en" (your second def)

    payload = {
        "external_id": "test_stretch_002",
        "language": "en",
        "title": "Stretching",
        "description": "Duplicate",
        "contentType": "Video",
        "duration": "30",
        "media": json.dumps([
            {"kind": "external", "media_type": "website", "url": "https://example.com/stretch"}
        ]),
    }

    resp = client.post("/api/interventions/add/", data=payload, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 400

    data = resp.json()
    assert data["success"] is False
    # your API returns field_errors for validation/duplicates
    assert "field_errors" in data

@patch("core.views.recomendation_views.default_storage.save")
def test_add_new_intervention_with_files(mock_save, mongo_mock):
    mock_save.return_value = "videos/test.mp4"
    dummy_file = make_upload()

    resp = client.post(
        "/api/interventions/add/",
        data={
            "title": "Pilates",
            "description": "A pilates class",

            # IMPORTANT: send lower-case so normalize_content_type maps it properly
            "contentType": "video",
            "content_type": "video",

            "duration": "30",
            "media_file": dummy_file,
        },
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200, resp.content.decode()
    assert resp.json()["success"] is True


def test_get_intervention_detail_not_found(mongo_mock):
    resp = client.get(
        f"/api/interventions/{ObjectId()}/", HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 404


def create_intervention():
    return Intervention(
        external_id="test_stretch_002",
        language="en",
        title="Stretching",
        description="Full body stretching session.",
        content_type="Video",
        patient_types=[],
        keywords=["Stretch"],
    ).save()


def create_therapist_and_intervention():
    user = User(
        username="therapist", email="t@example.com", phone="123", createdAt="2023-01-01", isActive=True
    ).save()
    therapist = Therapist(
        userId=user,
        name="Therapist",
        first_name="Test",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
        default_recommendations=[],
        
    )
    therapist.save()
    intervention = create_intervention()
    return therapist, intervention


def test_add_new_intervention_success(mongo_mock):
    payload = {
        "title": "Yoga Session",
        "description": "A yoga session",

        "contentType": "video",
        "content_type": "video",

        "duration": "30",
        "external_id": "test_yoga_001",
        "language": "en",
        "media": json.dumps([
            {"kind": "external", "media_type": "website", "url": "https://example.com/yoga"}
        ]),
    }

    resp = client.post("/api/interventions/add/", data=payload, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200, resp.content.decode()
    assert resp.json()["success"] is True


def test_add_existing_intervention_error(mongo_mock):
    create_intervention()
    payload = {
        "title": "Stretching",
        "description": "Duplicate",
        "contentType": "Video",
    }
    resp = client.post("/api/interventions/add/", data=payload, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert "message" in body
    assert "field_errors" in body  # duration/contentType errors live here


def test_get_intervention_detail_success():
    intervention = create_intervention()
    resp = client.get(
        f"/api/interventions/{intervention.id}/", HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 200
    assert "recommendation" in resp.json()


def test_get_intervention_detail_not_found():
    resp = client.get(
        f"/api/interventions/{ObjectId()}/", HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 404


def test_list_intervention_diagnoses_success():
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


def test_list_intervention_diagnoses_not_found():
    resp = client.get(
        f"/api/interventions/{ObjectId()}/assigned-diagnoses/Cardiology/therapist/{ObjectId()}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_assign_intervention_to_types_success(mongo_mock):
    therapist, intervention = create_therapist_and_intervention()
    payload = {
        "diagnosis": "Heart Attack",
        "interventions": [
            {
                "interventionId": str(intervention.id),
                "interval": 2,
                "unit": "week",
                "selectedDays": ["Monday"],
                "start_day": 1,
                "end": {"type": "count", "count": 7},

                # IMPORTANT: prevent backend crash
                "suggested_execution_time": "10",
            }
        ],
    }

    resp = client.post(
        f"/api/therapists/{therapist.userId.id}/interventions/assign-to-patient-types/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code in (200, 201), resp.content.decode()
    assert resp.json().get("success") is True


def test_assign_intervention_to_types_404(mongo_mock):
    therapist, intervention = create_therapist_and_intervention()

    payload = {
        "diagnosis": "Heart Attack",
        "interventions": [
            {
                "interventionId": str(intervention.id),
                "interval": 2,
                "unit": "week",
                "selectedDays": ["Monday"],
                "start_day": 1,
                "end": {"type": "count", "count": 7},
                "suggested_execution_time": "10",
            }
        ],
    }

    resp = client.post(
        f"/api/therapists/{ObjectId()}/interventions/assign-to-patient-types/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_assign_intervention_to_types_bad_json():
    therapist, intervention = create_therapist_and_intervention()
    payload = {
        "intervention_id": str(intervention.id),
        "diagnosis": "Heart Attack",
    }

    resp = client.post(
        f'/api/therapists/{therapist.userId.id}/interventions/assign-to-patient-types/',
        data="{bad json}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_remove_intervention_from_types_success(mongo_mock):
    therapist, intervention = create_therapist_and_intervention()

    # ✅ ensure the recommendation exists first
    add_default_recommendation_block(therapist, intervention, diagnosis="Heart Attack")

    payload = {
        "intervention_id": str(intervention.id),
        "diagnosis": "Heart Attack",
    }

    resp = client.post(
        f"/api/therapists/{therapist.userId.id}/interventions/remove-from-patient-types/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200, resp.content.decode()
    assert resp.json().get("success") is True


def test_remove_intervention_from_types_404():
    therapist, intervention = create_therapist_and_intervention()
    payload = {
        "intervention_id": str(intervention.id),
        "diagnosis": "Heart Attack",
    }
    resp = client.post(
        f'/api/therapists/{therapist.userId.id}/interventions/remove-from-patient-types/',
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_create_patient_group_success():
    intervention = create_intervention()
    payload = {
        "interventionId": str(intervention.id),
        "diagnosis": "Stroke",
        "speciality": "Cardiology",
        "frequency": "Weekly",
    }
    resp = client.post(
        "/api/recomendation/add/patientgroup/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_create_patient_group_missing_fields():
    resp = client.post(
        "/api/recomendation/add/patientgroup/",
        data=json.dumps({"diagnosis": "Stroke"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_create_patient_group_not_found():
    payload = {
        "interventionId": str(ObjectId()),
        "diagnosis": "Stroke",
        "speciality": "Cardiology",
        "frequency": "Weekly",
    }
    resp = client.post(
        "/api/interventions/add/patientgroup/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
