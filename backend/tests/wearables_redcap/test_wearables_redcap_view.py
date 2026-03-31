"""
Wearables → REDCap view tests
==============================

Endpoint covered
----------------
POST /api/wearables/sync-to-redcap/<patient_id>/

Coverage
--------
  - 405 for non-POST methods
  - 404 when patient_id is unknown
  - 400 when patient has no reha_end_date (ValueError from service)
  - 400 when patient has no project set (ValueError from service)
  - 502 when REDCap API returns an error (RedcapError from service)
  - 200 with results + summary on success
  - Optional JSON body passes event names through to the service
"""

import json
from datetime import datetime
from datetime import timezone as dt_tz
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import Patient, Therapist, User
from core.services.redcap_service import RedcapError

client = Client()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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


def _make_patient(project="COMPASS", reha_end_date=None):
    th_user = User(
        username=f"th-{ObjectId()}",
        email=f"th-{ObjectId()}@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, clinics=["Inselspital"], projects=[project]).save()

    pt_user = User(
        username=f"pt-{ObjectId()}",
        email=f"pt-{ObjectId()}@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    return Patient(
        userId=pt_user,
        patient_code=f"P-{ObjectId()}",
        therapist=th,
        project=project,
        reha_end_date=reha_end_date,
    ).save()


AUTH = {"HTTP_AUTHORIZATION": "Bearer test"}
URL = "/api/wearables/sync-to-redcap/{}/".format


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_method_not_allowed():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))
    resp = client.get(URL(patient.id), **AUTH)
    assert resp.status_code == 405


def test_patient_not_found():
    resp = client.post(URL(ObjectId()), **AUTH)
    assert resp.status_code == 404
    assert resp.json()["error"] == "Patient not found"


def test_missing_reha_end_date_returns_400():
    patient = _make_patient(reha_end_date=None)
    resp = client.post(URL(patient.id), **AUTH)
    assert resp.status_code == 400
    assert "reha_end_date" in resp.json()["error"]


def test_missing_project_returns_400():
    # Create with valid project, then blank it out (Therapist model validates project choices)
    patient = _make_patient(project="COMPASS", reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))
    patient.project = ""
    patient.save()

    # compute_wearables_summary will succeed (project is only needed by export),
    # so we patch the whole service pair to isolate the error path
    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value={"baseline": None, "followup": None},
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            side_effect=ValueError("Patient P-X has no project set"),
        ):
            resp = client.post(URL(patient.id), **AUTH)

    assert resp.status_code == 400
    assert "no project" in resp.json()["error"]


def test_redcap_error_returns_502():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value={"baseline": None, "followup": None},
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            side_effect=RedcapError("REDCap API returned non-200.", detail={"status": 400}),
        ):
            resp = client.post(URL(patient.id), **AUTH)

    assert resp.status_code == 502
    body = resp.json()
    assert "REDCap" in body["error"]
    assert body["detail"] == {"status": 400}


def test_success_returns_results_and_summary():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    fake_summary = {
        "baseline": {
            "monitoring_start": "03-01-2024",
            "monitoring_end": "09-01-2024",
            "monitoring_days": 7,
            "fitbit_steps": 5000,
        },
        "followup": None,
    }
    fake_results = {"baseline": "ok", "followup": "skipped"}

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value=fake_summary,
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            return_value=fake_results,
        ) as mock_export:
            resp = client.post(URL(patient.id), **AUTH)

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["results"] == fake_results
    assert body["summary"]["baseline"]["fitbit_steps"] == 5000

    # export was called without explicit event names (body was empty)
    args, kwargs = mock_export.call_args
    event_b = args[1] if len(args) > 1 else kwargs.get("event_baseline")
    event_f = args[2] if len(args) > 2 else kwargs.get("event_followup")
    assert event_b is None
    assert event_f is None


def test_event_names_from_body_passed_to_service():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value={"baseline": None, "followup": None},
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            return_value={"baseline": "skipped", "followup": "skipped"},
        ) as mock_export:
            resp = client.post(
                URL(patient.id),
                data=json.dumps(
                    {
                        "event_baseline": "custom_bl_arm_1",
                        "event_followup": "custom_fu_arm_1",
                    }
                ),
                content_type="application/json",
                **AUTH,
            )

    assert resp.status_code == 200
    # view calls export_wearables_to_redcap(patient, event_baseline, event_followup)
    args, kwargs = mock_export.call_args
    assert args[1] == "custom_bl_arm_1" or kwargs.get("event_baseline") == "custom_bl_arm_1"
    assert args[2] == "custom_fu_arm_1" or kwargs.get("event_followup") == "custom_fu_arm_1"


def test_invalid_json_body_treated_as_empty():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value={"baseline": None, "followup": None},
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            return_value={"baseline": "skipped", "followup": "skipped"},
        ):
            resp = client.post(
                URL(patient.id),
                data="{not-valid-json",
                content_type="application/json",
                **AUTH,
            )

    assert resp.status_code == 200
