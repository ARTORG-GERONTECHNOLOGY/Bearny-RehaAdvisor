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
        title="Stretching",
        description="Full body stretching session.",
        content_type="Video",
        patient_types=[],
        benefitFor=["Mobility"],
        tags=["Stretch"],
    ).save()


def test_list_all_interventions_success(mongo_mock):
    create_intervention()
    resp = client.get("/api/interventions/all/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any("title" in item for item in data)


def test_add_existing_intervention_error(mongo_mock):
    create_intervention()
    payload = {
        "title": "Stretching",
        "description": "Duplicate",
        "contentType": "Video",
    }
    resp = client.post(
        "/api/interventions/add/", data=payload, HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 400
    assert "error" in resp.json()


@patch("django.core.files.storage.default_storage.save")
def test_add_new_intervention_with_files(mock_save):
    mock_save.return_value = "videos/test.mp4"
    dummy_file = io.BytesIO(b"Fake video data")
    dummy_file.name = "test.mp4"

    resp = client.post(
        "/api/interventions/add/",
        data={
            "title": "Pilates",
            "description": "A pilates class",
            "contentType": "Video",
            "media_file": dummy_file,  # ✅ FILE IS IN DATA
        },
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 201
    assert resp.json()["success"] is True
    mock_save.assert_called()  # ✅ This should now pass


def test_get_intervention_detail_not_found(mongo_mock):
    resp = client.get(
        f"/api/interventions/{ObjectId()}/", HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 404


def create_intervention():
    return Intervention(
        title="Stretching",
        description="Full body stretching session.",
        content_type="Video",
        patient_types=[],
        benefitFor=["Mobility"],
        tags=["Stretch"],
    ).save()


def create_therapist_and_intervention():
    user = User(
        username="therapist", email="t@example.com", phone="123", createdAt="2023-01-01"
    ).save()
    therapist = Therapist(
        userId=user,
        name="Therapist",
        first_name="Test",
        specializations=["Cardiology"],
        clinics=["Downtown Clinic"],
        default_recommendations=[],
    )
    therapist.save()
    intervention = create_intervention()
    return therapist, intervention


@patch("django.core.files.storage.default_storage.save")
def test_add_new_intervention_success(mock_save):
    payload = {
        "title": "Yoga Session",
        "description": "A yoga session",
        "contentType": "Video",
        "patientTypes": json.dumps(
            [
                {
                    "type": "Cardiology",
                    "frequency": "Daily",
                    "includeOption": True,
                    "diagnosis": "Heart attack",
                }
            ]
        ),
        "benefitFor": "Mobility",
        "tagList": "Relax,Flexibility",
    }
    resp = client.post(
        "/api/interventions/add/", data=payload, HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 201
    assert resp.json()["success"] is True


def test_add_existing_intervention_error():
    create_intervention()
    payload = {
        "title": "Stretching",
        "description": "Duplicate",
        "contentType": "Video",
    }
    resp = client.post(
        "/api/interventions/add/", data=payload, HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 400
    assert "error" in resp.json()


@patch("django.core.files.storage.default_storage.save")
def test_add_new_intervention_with_files_v2(mock_save):
    mock_save.return_value = "videos/test.mp4"
    dummy_file = io.BytesIO(b"Fake video data")
    dummy_file.name = "test.mp4"

    resp = client.post(
        "/api/interventions/add/",
        data={
            "title": "Pilates",
            "description": "A pilates class",
            "contentType": "Video",
            "media_file": dummy_file,
        },
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 201
    assert resp.json()["success"] is True
    mock_save.assert_called()


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
            diagnosis_assignments={"Heart Attack": {"active": True}},
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


def test_assign_intervention_to_types_success():
    therapist, intervention = create_therapist_and_intervention()
    payload = {
        "therapistId": str(therapist.userId.id),
        "interventions": [
            {
                "interventionId": str(intervention.id),
                "interval": 2,
                "unit": "week",
                "selectedDays": ["Monday"],
                "end": {"type": "never", "count": None},
            }
        ],
        "patientId": str(ObjectId()),  # ✅ dummy patient ID
    }
    resp = client.post(
        "/api/interventions/assign-to-patient-types/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 201


def test_assign_intervention_to_types_404():
    payload = {
        "therapistId": str(ObjectId()),
        "interventions": [
            {
                "interventionId": str(ObjectId()),
                "interval": 2,
                "unit": "week",
                "selectedDays": ["Monday"],
                "end": {"type": "never", "count": None},
            }
        ],
        "patientId": str(ObjectId()),  # ✅ FIX: use ObjectId instead of patient.id
    }
    resp = client.post(
        "/api/interventions/assign-to-patient-types/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_assign_intervention_to_types_bad_json():
    resp = client.post(
        "/api/interventions/assign-to-patient-types/",
        data="{bad json}",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_remove_intervention_from_types_success():
    therapist, intervention = create_therapist_and_intervention()
    payload = {
        "therapist": str(therapist.userId.id),
        "intervention_id": str(intervention.id),
        "diagnosis": "Heart Attack",
    }
    resp = client.post(
        "/api/interventions/remove-from-patient-types/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200


def test_remove_intervention_from_types_404():
    payload = {
        "therapist": str(ObjectId()),
        "intervention_id": str(ObjectId()),
        "diagnosis": "Heart Attack",
    }
    resp = client.post(
        "/api/interventions/remove-from-patient-types/",
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
