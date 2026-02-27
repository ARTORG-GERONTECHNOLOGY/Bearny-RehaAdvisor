import json
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.test import Client, RequestFactory

from core.models import (
    DefaultInterventions,
    DiagnosisAssignmentSettings,
    Intervention,
    Therapist,
    User,
)
from core.views.recomendation_views import (
    get_intervention_by_external_id,
    list_intervention_diagnoses,
)

client = Client()
rf = RequestFactory()


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


def _make_therapist():
    u = User(
        username=f"th-{ObjectId()}",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    return Therapist(userId=u, default_recommendations=[]).save()


def _make_intervention(external_id="ext-1", language="en", title="Demo"):
    return Intervention(
        external_id=external_id,
        language=language,
        title=title,
        description="Desc",
        content_type="Video",
        media=[],
        is_private=False,
    ).save()


def test_apply_template_invalid_json_returns_400():
    therapist = _make_therapist()
    resp = client.post(
        f"/api/therapists/{therapist.userId.id}/templates/apply",
        data="{",
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert resp.json()["message"] == "Validation error."


def test_apply_template_invalid_start_time_returns_400():
    therapist = _make_therapist()
    resp = client.post(
        f"/api/therapists/{therapist.userId.id}/templates/apply",
        data=json.dumps(
            {
                "patientId": str(ObjectId()),
                "diagnosis": "Stroke",
                "effectiveFrom": "2025-01-01",
                "startTime": "99:99",
            }
        ),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "startTime" in resp.json().get("field_errors", {})


def test_template_plan_preview_invalid_horizon_returns_500():
    therapist = _make_therapist()
    resp = client.get(
        f"/api/therapists/{therapist.userId.id}/template-plan?horizon=bad",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 500
    assert "error" in resp.json()


def test_get_intervention_by_external_id_method_and_not_found():
    req_bad = rf.post("/api/interventions/external/missing/")
    resp_bad = get_intervention_by_external_id(req_bad, "missing")
    assert resp_bad.status_code == 405

    req_404 = rf.get("/api/interventions/external/missing/")
    resp_404 = get_intervention_by_external_id(req_404, "missing")
    assert resp_404.status_code == 404


def test_get_intervention_by_external_id_success_with_language_pick():
    _make_intervention(external_id="same", language="en", title="Title EN")
    _make_intervention(external_id="same", language="de", title="Titel DE")
    req = rf.get("/api/interventions/external/same/?lang=de")
    resp = get_intervention_by_external_id(req, "same")
    assert resp.status_code == 200
    body = json.loads(resp.content)["recommendation"]
    assert body["external_id"] == "same"
    assert "de" in body["available_languages"]


def test_add_new_intervention_invalid_taxonomy_json_and_patient_types_json():
    base = {
        "title": "X",
        "description": "Y",
        "contentType": "Video",
        "duration": "10",
        "media": json.dumps(
            [
                {
                    "kind": "external",
                    "media_type": "video",
                    "url": "https://example.com/v",
                }
            ]
        ),
    }
    resp_tax = client.post(
        "/api/interventions/add/",
        data={**base, "taxonomy": "not-json"},
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp_tax.status_code == 400
    assert "taxonomy" in resp_tax.json()["field_errors"]

    resp_pt = client.post(
        "/api/interventions/add/",
        data={**base, "patientTypes": "{bad"},
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp_pt.status_code == 400
    assert "patientTypes" in resp_pt.json()["field_errors"]


def test_add_new_intervention_private_requires_valid_patient():
    resp_missing = client.post(
        "/api/interventions/add/",
        data={
            "title": "Private one",
            "description": "D",
            "contentType": "Video",
            "duration": "10",
            "isPrivate": "true",
            "media": json.dumps(
                [
                    {
                        "kind": "external",
                        "media_type": "video",
                        "url": "https://example.com/v",
                    }
                ]
            ),
        },
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp_missing.status_code == 400
    assert "patientId" in resp_missing.json()["field_errors"]

    resp_invalid = client.post(
        "/api/interventions/add/",
        data={
            "title": "Private two",
            "description": "D",
            "contentType": "Video",
            "duration": "10",
            "isPrivate": "true",
            "patientId": str(ObjectId()),
            "media": json.dumps(
                [
                    {
                        "kind": "external",
                        "media_type": "video",
                        "url": "https://example.com/v",
                    }
                ]
            ),
        },
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp_invalid.status_code == 400
    assert "patientId" in resp_invalid.json()["field_errors"]


def test_add_new_intervention_media_validation_branches():
    resp_bad_kind = client.post(
        "/api/interventions/add/",
        data={
            "title": "A",
            "description": "B",
            "contentType": "Video",
            "duration": "10",
            "media": json.dumps([{"kind": "bad", "media_type": "video", "url": "https://example.com"}]),
        },
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp_bad_kind.status_code == 400

    resp_bad_type = client.post(
        "/api/interventions/add/",
        data={
            "title": "A2",
            "description": "B2",
            "contentType": "Video",
            "duration": "10",
            "media": json.dumps(
                [
                    {
                        "kind": "external",
                        "media_type": "unknown",
                        "url": "https://example.com",
                    }
                ]
            ),
        },
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp_bad_type.status_code == 400

    resp_file_without_path = client.post(
        "/api/interventions/add/",
        data={
            "title": "A3",
            "description": "B3",
            "contentType": "Video",
            "duration": "10",
            "media": json.dumps([{"kind": "file", "media_type": "video"}]),
        },
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp_file_without_path.status_code == 400


def test_list_intervention_diagnoses_all_flag_and_specific_flag():
    intervention_id = ObjectId()
    fake_rec = SimpleNamespace(
        recommendation=SimpleNamespace(id=intervention_id),
        diagnosis_assignments={
            "all": SimpleNamespace(active=True),
            "Stroke": SimpleNamespace(active=True),
        },
    )
    fake_therapist = SimpleNamespace(default_recommendations=[fake_rec])

    req = rf.get("/api/interventions/x/assigned-diagnoses/Neurology/therapist/y/")
    fake_model = SimpleNamespace(
        objects=SimpleNamespace(get=lambda **kwargs: fake_therapist),
        DoesNotExist=Exception,
    )
    with (
        patch("core.views.recomendation_views.Therapist", new=fake_model),
        patch(
            "core.views.recomendation_views.config",
            {"patientInfo": {"function": {"Neurology": {"diagnosis": ["Stroke", "MS"]}}}},
        ),
    ):
        resp = list_intervention_diagnoses(req, str(intervention_id), "Neurology", str(ObjectId()))
    assert resp.status_code == 200
    body = json.loads(resp.content)
    assert body["all"] is True
    assert body["diagnoses"]["Stroke"] is True
    assert "diagnoses" in body
