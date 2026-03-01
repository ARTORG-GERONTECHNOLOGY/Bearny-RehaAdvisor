"""
REDCap views tests
==================

Endpoints covered
-----------------
``GET /api/redcap/projects/``          → ``redcap_projects``
``GET /api/redcap/patient/``           → ``redcap_patient``

Coverage goals
--------------
* Verify REDCap access-control behavior for therapist-scoped projects.
* Verify error handling across no-therapist, forbidden-project, not-found,
  upstream REDCap errors, and partial success scenarios.
"""

import json
from types import SimpleNamespace
from unittest.mock import patch

import mongomock
import pytest
from django.test import Client

from core.services.redcap_service import RedcapError

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


class DummyTherapist:
    def __init__(self, clinics=None, projects=None, project=""):
        self.clinics = clinics or []
        self.projects = projects or []
        self.project = project


@patch("core.views.redcap_views.get_therapist_for_user", return_value=None)
def test_redcap_projects_therapist_not_found(mock_get_th):
    resp = client.get("/api/redcap/projects/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 404
    assert resp.json()["error"] == "Therapist profile not found."


@patch(
    "core.views.redcap_views.get_allowed_redcap_projects_for_therapist",
    return_value=["COPAIN"],
)
@patch(
    "core.views.redcap_views.get_therapist_for_user",
    return_value=DummyTherapist(clinics=["Inselspital"], project="COPAIN"),
)
def test_redcap_projects_success(mock_get_th, mock_allowed):
    resp = client.get("/api/redcap/projects/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["clinics"] == ["Inselspital"]
    assert body["allowedProjects"] == ["COPAIN"]
    assert body["therapistProject"] == "COPAIN"


def test_redcap_projects_method_not_allowed():
    resp = client.post("/api/redcap/projects/", data={}, HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405
    assert resp.json()["error"] == "Method not allowed"


def test_redcap_patient_requires_patient_code():
    resp = client.get("/api/redcap/patient/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 400
    assert resp.json()["error"] == "patient_code is required"


@patch("core.views.redcap_patient_views.get_therapist_for_user", return_value=None)
def test_redcap_patient_therapist_not_found(mock_get_th):
    resp = client.get("/api/redcap/patient/?patient_code=P17", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 404
    assert resp.json()["error"] == "Therapist profile not found."


@patch(
    "core.views.redcap_patient_views.get_therapist_for_user",
    return_value=DummyTherapist(projects=[]),
)
def test_redcap_patient_no_allowed_projects(mock_get_th):
    resp = client.get("/api/redcap/patient/?patient_code=P17", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 403
    assert resp.json()["error"] == "No REDCap projects configured for your clinic."


@patch(
    "core.views.redcap_patient_views.get_therapist_for_user",
    return_value=DummyTherapist(projects=["COPAIN"]),
)
def test_redcap_patient_forbidden_project(mock_get_th):
    resp = client.get(
        "/api/redcap/patient/?patient_code=P17&project=COMPASS",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["error"] == "Not allowed to access this REDCap project for your clinic."
    assert body["allowedProjects"] == ["COPAIN"]


@patch("core.views.redcap_patient_views.export_record_by_pat_id", return_value=[])
@patch(
    "core.views.redcap_patient_views.get_therapist_for_user",
    return_value=DummyTherapist(projects=["COPAIN"]),
)
def test_redcap_patient_not_found_when_no_rows(mock_get_th, mock_export):
    resp = client.get(
        "/api/redcap/patient/?patient_code=P17&project=COPAIN",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "No REDCap record found" in resp.json()["error"]


@patch(
    "core.views.redcap_patient_views.export_record_by_pat_id",
    side_effect=RedcapError("upstream error", detail="timeout"),
)
@patch(
    "core.views.redcap_patient_views.get_therapist_for_user",
    return_value=DummyTherapist(projects=["COPAIN"]),
)
def test_redcap_patient_returns_502_when_all_projects_error(mock_get_th, mock_export):
    resp = client.get("/api/redcap/patient/?patient_code=P17", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 502
    body = resp.json()
    assert "Failed to retrieve REDCap records" in body["error"]
    assert len(body["errors"]) == 1


@patch(
    "core.views.redcap_patient_views.get_therapist_for_user",
    return_value=DummyTherapist(projects=["COPAIN", "COMPASS"]),
)
@patch("core.views.redcap_patient_views.export_record_by_pat_id")
def test_redcap_patient_success_with_partial_errors(mock_export, mock_get_th):
    def side_effect(project, _patient_code):
        if project == "COPAIN":
            return [{"record_id": "1", "pat_id": "P17"}]
        raise RedcapError("api error", detail="down")

    mock_export.side_effect = side_effect

    resp = client.get("/api/redcap/patient/?patient_code=P17", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["patient_code"] == "P17"
    assert body["searchedProjects"] == ["COPAIN", "COMPASS"]
    assert len(body["matches"]) == 1
    assert body["matches"][0]["project"] == "COPAIN"
    assert len(body["errors"]) == 1
    assert body["errors"][0]["project"] == "COMPASS"


# -----------------------------
# redcap_record (direct view tests)
# -----------------------------

from django.test import RequestFactory

from core.views.redcap_views import redcap_record


@pytest.fixture
def rf():
    return RequestFactory()


def test_redcap_record_method_not_allowed(rf):
    req = rf.post("/api/redcap/record/", data={})
    resp = redcap_record(req)
    assert resp.status_code == 405
    assert json.loads(resp.content)["error"] == "Method not allowed"


def test_redcap_record_requires_pat_id(rf):
    req = rf.get("/api/redcap/record/?project=COPAIN")
    resp = redcap_record(req)
    assert resp.status_code == 400
    assert json.loads(resp.content)["error"] == "pat_id is required"


def test_redcap_record_requires_project(rf):
    req = rf.get("/api/redcap/record/?pat_id=P17")
    resp = redcap_record(req)
    assert resp.status_code == 400
    assert json.loads(resp.content)["error"] == "project is required"


@patch("core.views.redcap_views.get_therapist_for_user", return_value=None)
def test_redcap_record_therapist_not_found(mock_get_th, rf):
    req = rf.get("/api/redcap/record/?pat_id=P17&project=COPAIN")
    req.user = SimpleNamespace()
    resp = redcap_record(req)
    assert resp.status_code == 404


@patch(
    "core.views.redcap_views.get_allowed_redcap_projects_for_therapist",
    return_value=["COPAIN"],
)
@patch(
    "core.views.redcap_views.get_therapist_for_user",
    return_value=DummyTherapist(clinics=["Inselspital"], project="COPAIN"),
)
def test_redcap_record_forbidden_project(mock_get_th, mock_allowed, rf):
    req = rf.get("/api/redcap/record/?pat_id=P17&project=COMPASS")
    req.user = SimpleNamespace()
    resp = redcap_record(req)
    assert resp.status_code == 403
    assert json.loads(resp.content)["allowedProjects"] == ["COPAIN"]


@patch(
    "core.views.redcap_views.export_record_by_pat_id",
    return_value=[{"record_id": "1", "pat_id": "P17"}],
)
@patch(
    "core.views.redcap_views.get_allowed_redcap_projects_for_therapist",
    return_value=["COPAIN"],
)
@patch(
    "core.views.redcap_views.get_therapist_for_user",
    return_value=DummyTherapist(clinics=["Inselspital"], project="COPAIN"),
)
def test_redcap_record_success(mock_get_th, mock_allowed, mock_export, rf):
    req = rf.get("/api/redcap/record/?pat_id=P17&project=COPAIN")
    req.user = SimpleNamespace()
    resp = redcap_record(req)
    assert resp.status_code == 200
    body = json.loads(resp.content)
    assert body["ok"] is True
    assert body["count"] == 1
    assert body["project"] == "COPAIN"


@patch(
    "core.views.redcap_views.export_record_by_pat_id",
    side_effect=RedcapError("upstream", detail="timeout"),
)
@patch(
    "core.views.redcap_views.get_allowed_redcap_projects_for_therapist",
    return_value=["COPAIN"],
)
@patch(
    "core.views.redcap_views.get_therapist_for_user",
    return_value=DummyTherapist(clinics=["Inselspital"], project="COPAIN"),
)
def test_redcap_record_returns_502_on_redcap_error(mock_get_th, mock_allowed, mock_export, rf):
    req = rf.get("/api/redcap/record/?pat_id=P17&project=COPAIN")
    req.user = SimpleNamespace()
    resp = redcap_record(req)
    assert resp.status_code == 502
    assert json.loads(resp.content)["error"] == "upstream"


@patch("core.views.redcap_views.export_record_by_pat_id", side_effect=Exception("boom"))
@patch(
    "core.views.redcap_views.get_allowed_redcap_projects_for_therapist",
    return_value=["COPAIN"],
)
@patch(
    "core.views.redcap_views.get_therapist_for_user",
    return_value=DummyTherapist(clinics=["Inselspital"], project="COPAIN"),
)
def test_redcap_record_returns_500_on_unexpected_error(mock_get_th, mock_allowed, mock_export, rf):
    req = rf.get("/api/redcap/record/?pat_id=P17&project=COPAIN")
    req.user = SimpleNamespace()
    resp = redcap_record(req)
    assert resp.status_code == 500
    assert json.loads(resp.content)["error"] == "Unexpected server error."
