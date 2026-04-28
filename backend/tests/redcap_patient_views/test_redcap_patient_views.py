"""
redcap_patient views tests
==========================

Covers core/views/redcap_patient_views.py  (GET /api/redcap/patient/).

Key regressions guarded:
  - Bug #185: therapist.projects was used instead of get_allowed_redcap_projects_for_therapist,
    so therapists who only had clinics set got 403 even when the clinic mapped to REDCap projects.
  - Auth bypass: @permission_classes without @api_view was a no-op.
"""

import json
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from rest_framework.test import APIRequestFactory, force_authenticate

from core.models import Therapist, User
from core.services.redcap_service import RedcapError
from core.views.redcap_patient_views import redcap_patient

URL = "/api/redcap/patient/"


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
def arf():
    return APIRequestFactory()


class DummyUser(SimpleNamespace):
    is_authenticated = True


class DummyTherapist:
    clinics = ["Inselspital"]
    projects = []


def _get(arf, params="", user=None):
    req = arf.get(f"{URL}?{params}")
    if user is not None:
        force_authenticate(req, user=user)
    return redcap_patient(req)


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


def test_unauthenticated_request_returns_401(arf):
    req = arf.get(f"{URL}?patient_code=P1")
    resp = redcap_patient(req)
    assert resp.status_code == 401


def test_method_not_allowed_returns_405(arf):
    req = arf.post(URL, {})
    force_authenticate(req, user=DummyUser())
    resp = redcap_patient(req)
    assert resp.status_code == 405


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


@patch("core.views.redcap_patient_views.get_therapist_for_user", return_value=DummyTherapist())
def test_missing_patient_code_returns_400(mock_th, arf):
    resp = _get(arf, params="", user=DummyUser())
    assert resp.status_code == 400
    assert "patient_code" in json.loads(resp.content)["error"]


# ---------------------------------------------------------------------------
# Therapist resolution
# ---------------------------------------------------------------------------


@patch("core.views.redcap_patient_views.get_therapist_for_user", return_value=None)
def test_therapist_not_found_via_request_user_returns_404(mock_th, arf):
    resp = _get(arf, params="patient_code=P1", user=DummyUser())
    assert resp.status_code == 404
    assert "Therapist" in json.loads(resp.content)["error"]


@patch("core.views.redcap_patient_views.get_therapist_by_user_id", return_value=None)
def test_therapist_not_found_via_query_param_returns_404(mock_th, arf):
    user_id = str(ObjectId())
    resp = _get(arf, params=f"patient_code=P1&therapistUserId={user_id}", user=DummyUser())
    assert resp.status_code == 404
    assert "Therapist" in json.loads(resp.content)["error"]


# ---------------------------------------------------------------------------
# Access control — project resolution
# ---------------------------------------------------------------------------


@patch("core.views.redcap_patient_views.get_allowed_redcap_projects_for_therapist", return_value=[])
@patch("core.views.redcap_patient_views.get_therapist_for_user", return_value=DummyTherapist())
def test_no_allowed_projects_returns_403(mock_th, mock_allowed, arf):
    resp = _get(arf, params="patient_code=P1", user=DummyUser())
    assert resp.status_code == 403
    body = json.loads(resp.content)
    assert "REDCap projects" in body["error"]


@patch("core.views.redcap_patient_views.get_allowed_redcap_projects_for_therapist", return_value=["COPAIN"])
@patch("core.views.redcap_patient_views.get_therapist_for_user", return_value=DummyTherapist())
def test_project_param_not_in_allowed_returns_403(mock_th, mock_allowed, arf):
    resp = _get(arf, params="patient_code=P1&project=COMPASS", user=DummyUser())
    assert resp.status_code == 403
    body = json.loads(resp.content)
    assert "allowedProjects" in body


@patch(
    "core.views.redcap_patient_views.get_allowed_redcap_projects_for_therapist",
    return_value=["COPAIN", "COMPASS"],
)
@patch("core.views.redcap_patient_views.get_therapist_for_user", return_value=DummyTherapist())
@patch("core.views.redcap_patient_views.export_record_by_pat_id", return_value=[{"record_id": "P1"}])
def test_project_param_restricts_search_to_that_project(mock_export, mock_th, mock_allowed, arf):
    resp = _get(arf, params="patient_code=P1&project=COPAIN", user=DummyUser())
    assert resp.status_code == 200
    body = json.loads(resp.content)
    assert body["searchedProjects"] == ["COPAIN"]
    mock_export.assert_called_once_with("COPAIN", "P1")


# ---------------------------------------------------------------------------
# Bug #185 regression: clinic-only therapist previously got 403
# ---------------------------------------------------------------------------


def test_therapist_with_only_clinics_set_can_access_redcap(arf):
    """
    Therapist has clinics=["Inselspital"] but projects=[].
    Before the fix: allowed = therapist.projects → [] → 403.
    After the fix: get_allowed_redcap_projects_for_therapist derives
    ["COPAIN", "COMPASS"] from clinic config → search proceeds.
    """
    u = User(
        username=f"th-{ObjectId()}",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=u, clinics=["Inselspital"], projects=[]).save()

    with patch("core.views.redcap_patient_views.get_therapist_for_user", return_value=th), patch(
        "core.views.redcap_patient_views.export_record_by_pat_id", return_value=[]
    ):
        resp = _get(arf, params="patient_code=P_MISSING", user=DummyUser())

    # Should reach REDCap lookup (404 = not found), NOT 403 = no projects
    assert resp.status_code == 404
    body = json.loads(resp.content)
    assert body.get("code") == "redcap_not_found"
    assert set(body["allowedProjects"]) == {"COPAIN", "COMPASS"}


# ---------------------------------------------------------------------------
# REDCap lookup outcomes
# ---------------------------------------------------------------------------


@patch(
    "core.views.redcap_patient_views.get_allowed_redcap_projects_for_therapist",
    return_value=["COPAIN"],
)
@patch("core.views.redcap_patient_views.get_therapist_for_user", return_value=DummyTherapist())
@patch("core.views.redcap_patient_views.export_record_by_pat_id", return_value=[])
def test_patient_not_found_in_redcap_returns_404(mock_export, mock_th, mock_allowed, arf):
    resp = _get(arf, params="patient_code=UNKNOWN", user=DummyUser())
    assert resp.status_code == 404
    body = json.loads(resp.content)
    assert body["code"] == "redcap_not_found"
    assert body["patient_code"] == "UNKNOWN"


@patch(
    "core.views.redcap_patient_views.get_allowed_redcap_projects_for_therapist",
    return_value=["COPAIN", "COMPASS"],
)
@patch("core.views.redcap_patient_views.get_therapist_for_user", return_value=DummyTherapist())
@patch(
    "core.views.redcap_patient_views.export_record_by_pat_id",
    return_value=[{"record_id": "P17", "pat_id": "P17"}],
)
def test_patient_found_returns_200_with_matches(mock_export, mock_th, mock_allowed, arf):
    resp = _get(arf, params="patient_code=P17", user=DummyUser())
    assert resp.status_code == 200
    body = json.loads(resp.content)
    assert body["ok"] is True
    assert body["patient_code"] == "P17"
    assert len(body["matches"]) >= 1
    assert body["matches"][0]["rows"][0]["record_id"] == "P17"


@patch(
    "core.views.redcap_patient_views.get_allowed_redcap_projects_for_therapist",
    return_value=["COPAIN"],
)
@patch("core.views.redcap_patient_views.get_therapist_for_user", return_value=DummyTherapist())
@patch(
    "core.views.redcap_patient_views.export_record_by_pat_id",
    side_effect=RedcapError("connection refused"),
)
def test_redcap_error_returns_502(mock_export, mock_th, mock_allowed, arf):
    resp = _get(arf, params="patient_code=P1", user=DummyUser())
    assert resp.status_code == 502
    body = json.loads(resp.content)
    assert body["code"] == "redcap_fetch_error"
    assert len(body["errors"]) == 1


@patch(
    "core.views.redcap_patient_views.get_allowed_redcap_projects_for_therapist",
    return_value=["COPAIN", "COMPASS"],
)
@patch("core.views.redcap_patient_views.get_therapist_for_user", return_value=DummyTherapist())
def test_partial_error_still_returns_200_when_one_project_succeeds(mock_th, mock_allowed, arf):
    """One project errors, another returns a match — overall 200 with errors in body."""

    def side_effect(proj, pat_id):
        if proj == "COPAIN":
            raise RedcapError("timeout")
        return [{"record_id": pat_id}]

    with patch("core.views.redcap_patient_views.export_record_by_pat_id", side_effect=side_effect):
        resp = _get(arf, params="patient_code=P1", user=DummyUser())

    assert resp.status_code == 200
    body = json.loads(resp.content)
    assert body["ok"] is True
    assert len(body["matches"]) == 1
    assert body["matches"][0]["project"] == "COMPASS"
    assert len(body["errors"]) == 1
    assert body["errors"][0]["project"] == "COPAIN"
