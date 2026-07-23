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
  - 400 when patient has no wearable data (WearablesSyncError from service)
  - 400 when patient has no project set (ValueError from service)
  - 502 when REDCap API returns an error (RedcapError from service)
  - 200 with {ok, patient_code, first_measurement_date, periods} on success
  - Optional JSON body passes event names through to the service
  - force=true is forwarded as skip_if_populated=False
  - Skipped periods carry clear skip_reason + detail fields
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
from core.services.wearables_redcap_service import WearablesSyncError

client = Client()


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

_FAKE_META = {
    "first_date": "2024-01-01",
    "baseline_window": {"start": "2024-01-08", "end": "2024-01-28"},
    "followup_window": {"start": "2024-05-29", "end": "2024-06-28"},
    "user": None,
}

_FAKE_SUMMARY_SKIPPED = {
    "baseline": None,
    "followup": None,
    "_meta": _FAKE_META,
}

_FAKE_SUMMARY_OK = {
    "baseline": {
        "monitoring_start": "2024-01-08",
        "monitoring_end": "2024-01-28",
        "fitbit_steps": 5000,
        "fitbit_pa": 30,
        "fitbit_inactivity": 300,
        "sleep_duration": "7",
        "valid_week_days": 1,
        "valid_weekend_days": 0,
        "valid_week_nights": 1,
        "valid_weekend_nights": 0,
    },
    "followup": None,
    "_meta": _FAKE_META,
}


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
# Basic routing
# ---------------------------------------------------------------------------


def test_method_not_allowed():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))
    resp = client.get(URL(patient.id), **AUTH)
    assert resp.status_code == 405


def test_patient_not_found():
    resp = client.post(URL(ObjectId()), **AUTH)
    assert resp.status_code == 404
    assert resp.json()["error"] == "Patient not found"


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------


def test_no_wearable_data_returns_400():
    """Patient exists but has never worn the device — no wearable records."""
    patient = _make_patient(reha_end_date=None)

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        side_effect=WearablesSyncError(
            "No wearable data found for patient P-X. The device must be worn before wearables can be exported to REDCap.",
            code="wearables_no_fitbit_data",
        ),
    ):
        resp = client.post(URL(patient.id), **AUTH)

    assert resp.status_code == 400
    body = resp.json()
    assert "No wearable data" in body["error"]
    assert body["code"] == "wearables_no_fitbit_data"


def test_missing_project_returns_400():
    patient = _make_patient(project="COMPASS", reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))
    patient.project = ""
    patient.save()

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value=_FAKE_SUMMARY_SKIPPED,
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            side_effect=ValueError("Patient P-X has no project set"),
        ):
            resp = client.post(URL(patient.id), **AUTH)

    assert resp.status_code == 400
    assert "project" in resp.json()["error"]


def test_wearables_sync_error_returns_code():
    patient = _make_patient(reha_end_date=None)

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        side_effect=WearablesSyncError(
            "No Fitbit data found for patient P-X.",
            code="wearables_no_fitbit_data",
        ),
    ):
        resp = client.post(URL(patient.id), **AUTH)

    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == "wearables_no_fitbit_data"
    assert "Fitbit data" in body["error"]


def test_redcap_error_returns_502():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value=_FAKE_SUMMARY_SKIPPED,
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


# ---------------------------------------------------------------------------
# Success path — new response format
# ---------------------------------------------------------------------------


def test_success_returns_periods_with_detail():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    fake_results = {"baseline": "sent", "followup": "skipped"}
    fake_payloads = {
        "baseline": {
            "status": "sent",
            "record": {
                "record_id": "1",
                "redcap_event_name": "visit_baseline_arm_1",
                "fitbit_steps": 5000,
            },
        },
        "followup": {
            "status": "skipped",
            "skip_reason": "future_window",
            "window_start": "2024-05-29",
            "window_end": "2024-06-28",
        },
    }

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value=_FAKE_SUMMARY_OK,
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            return_value=(fake_results, fake_payloads),
        ):
            resp = client.post(URL(patient.id), **AUTH)

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert "patient_code" in body
    assert body["first_measurement_date"] == "2024-01-01"
    assert "periods" in body

    bl = body["periods"]["baseline"]
    assert bl["status"] == "sent"
    assert bl["redcap_event"] == "visit_baseline_arm_1"

    fu = body["periods"]["followup"]
    assert fu["status"] == "skipped"
    assert fu["skip_reason"] == "future_window"
    assert "not yet reached" in fu["detail"]


def test_success_does_not_include_legacy_results_key():
    """Old {results, summary, sent_payloads} keys must not appear."""
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value=_FAKE_SUMMARY_OK,
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            return_value=(
                {"baseline": "sent", "followup": "skipped"},
                {
                    "baseline": {"status": "sent", "record": {}},
                    "followup": {
                        "status": "skipped",
                        "skip_reason": "future_window",
                        "window_start": "2024-05-29",
                        "window_end": "2024-06-28",
                    },
                },
            ),
        ):
            resp = client.post(URL(patient.id), **AUTH)

    body = resp.json()
    assert "results" not in body
    assert "summary" not in body
    assert "sent_payloads" not in body


def test_skipped_no_valid_days_includes_record_count():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    fake_payloads = {
        "baseline": {
            "status": "skipped",
            "skip_reason": "no_valid_days",
            "window_start": "2024-01-08",
            "window_end": "2024-01-28",
            "total_records": 21,
            "valid_activity_days": 0,
            "valid_sleep_nights": 0,
            "wear_threshold_minutes": 600,
        },
        "followup": {
            "status": "skipped",
            "skip_reason": "future_window",
            "window_start": "2024-05-29",
            "window_end": "2024-06-28",
        },
    }

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value=_FAKE_SUMMARY_SKIPPED,
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            return_value=({"baseline": "skipped", "followup": "skipped"}, fake_payloads),
        ):
            resp = client.post(URL(patient.id), **AUTH)

    assert resp.status_code == 200
    body = resp.json()
    bl = body["periods"]["baseline"]
    assert bl["skip_reason"] == "no_valid_days"
    assert bl["total_records_in_window"] == 21
    assert bl["valid_activity_days"] == 0
    assert "10h/day" in bl["detail"]


def test_skipped_already_populated_includes_existing_start():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    fake_payloads = {
        "baseline": {
            "status": "skipped",
            "skip_reason": "already_populated",
            "existing_start": "2024-01-08",
            "redcap_event": "visit_baseline_arm_1",
        },
        "followup": {
            "status": "skipped",
            "skip_reason": "future_window",
            "window_start": "2024-05-29",
            "window_end": "2024-06-28",
        },
    }

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value=_FAKE_SUMMARY_SKIPPED,
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            return_value=({"baseline": "skipped", "followup": "skipped"}, fake_payloads),
        ):
            resp = client.post(URL(patient.id), **AUTH)

    body = resp.json()
    bl = body["periods"]["baseline"]
    assert bl["skip_reason"] == "already_populated"
    assert bl["existing_start"] == "2024-01-08"
    assert "force=true" in bl["detail"]


# ---------------------------------------------------------------------------
# Body / parameter forwarding
# ---------------------------------------------------------------------------


def test_event_names_from_body_passed_to_service():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value=_FAKE_SUMMARY_SKIPPED,
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            return_value=(
                {"baseline": "skipped", "followup": "skipped"},
                {
                    "baseline": {
                        "status": "skipped",
                        "skip_reason": "future_window",
                        "window_start": "2024-01-08",
                        "window_end": "2024-01-28",
                    },
                    "followup": {
                        "status": "skipped",
                        "skip_reason": "future_window",
                        "window_start": "2024-05-29",
                        "window_end": "2024-06-28",
                    },
                },
            ),
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
    args, kwargs = mock_export.call_args
    assert args[1] == "custom_bl_arm_1" or kwargs.get("event_baseline") == "custom_bl_arm_1"
    assert args[2] == "custom_fu_arm_1" or kwargs.get("event_followup") == "custom_fu_arm_1"
    return_payloads = (
        kwargs.get("return_payloads") if "return_payloads" in kwargs else (args[3] if len(args) > 3 else None)
    )
    assert return_payloads is True


def test_force_true_sets_skip_if_populated_false():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value=_FAKE_SUMMARY_SKIPPED,
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            return_value=(
                {"baseline": "skipped", "followup": "skipped"},
                {
                    "baseline": {
                        "status": "skipped",
                        "skip_reason": "future_window",
                        "window_start": "2024-01-08",
                        "window_end": "2024-01-28",
                    },
                    "followup": {
                        "status": "skipped",
                        "skip_reason": "future_window",
                        "window_start": "2024-05-29",
                        "window_end": "2024-06-28",
                    },
                },
            ),
        ) as mock_export:
            resp = client.post(
                URL(patient.id),
                data=json.dumps({"force": True}),
                content_type="application/json",
                **AUTH,
            )

    assert resp.status_code == 200
    _, kwargs = mock_export.call_args
    assert kwargs.get("skip_if_populated") is False


def test_force_false_sets_skip_if_populated_true():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value=_FAKE_SUMMARY_SKIPPED,
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            return_value=(
                {"baseline": "skipped", "followup": "skipped"},
                {
                    "baseline": {
                        "status": "skipped",
                        "skip_reason": "future_window",
                        "window_start": "2024-01-08",
                        "window_end": "2024-01-28",
                    },
                    "followup": {
                        "status": "skipped",
                        "skip_reason": "future_window",
                        "window_start": "2024-05-29",
                        "window_end": "2024-06-28",
                    },
                },
            ),
        ) as mock_export:
            resp = client.post(
                URL(patient.id),
                data=json.dumps({"force": False}),
                content_type="application/json",
                **AUTH,
            )

    assert resp.status_code == 200
    _, kwargs = mock_export.call_args
    assert kwargs.get("skip_if_populated") is True


def test_invalid_json_body_treated_as_empty():
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value=_FAKE_SUMMARY_SKIPPED,
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            return_value=(
                {"baseline": "skipped", "followup": "skipped"},
                {
                    "baseline": {
                        "status": "skipped",
                        "skip_reason": "future_window",
                        "window_start": "2024-01-08",
                        "window_end": "2024-01-28",
                    },
                    "followup": {
                        "status": "skipped",
                        "skip_reason": "future_window",
                        "window_start": "2024-05-29",
                        "window_end": "2024-06-28",
                    },
                },
            ),
        ):
            resp = client.post(
                URL(patient.id),
                data="{not-valid-json",
                content_type="application/json",
                **AUTH,
            )

    assert resp.status_code == 200


def test_precomputed_summary_passed_to_export():
    """View must pass its summary to export to avoid double-querying."""
    patient = _make_patient(reha_end_date=datetime(2024, 1, 1, tzinfo=dt_tz.utc))
    fake_summary = dict(_FAKE_SUMMARY_OK)

    with patch(
        "core.views.wearables_redcap_view.compute_wearables_summary",
        return_value=fake_summary,
    ):
        with patch(
            "core.views.wearables_redcap_view.export_wearables_to_redcap",
            return_value=(
                {"baseline": "skipped", "followup": "skipped"},
                {
                    "baseline": {
                        "status": "skipped",
                        "skip_reason": "no_records",
                        "window_start": "2024-01-08",
                        "window_end": "2024-01-28",
                    },
                    "followup": {
                        "status": "skipped",
                        "skip_reason": "future_window",
                        "window_start": "2024-05-29",
                        "window_end": "2024-06-28",
                    },
                },
            ),
        ) as mock_export:
            resp = client.post(URL(patient.id), **AUTH)

    assert resp.status_code == 200
    _, kwargs = mock_export.call_args
    assert kwargs.get("precomputed_summary") is fake_summary
