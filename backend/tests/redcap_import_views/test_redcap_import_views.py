"""
REDCap import views tests
=========================

Covers:
- GET  /api/redcap/available-patients/
- POST /api/redcap/import-patient/
"""

import json
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch

import mongomock
import pytest
from bson import ObjectId
from django.test import Client, RequestFactory

from core.models import Patient, Therapist, User
from core.views.redcap_import_views import (
    RedcapError,
    _bad,
    _is_objectid,
    _is_strong_password,
    _norm,
    _safe_json_body,
    allowed_dags_by_project,
    available_redcap_patients,
    get_allowed_redcap_projects_for_therapist,
    get_redcap_api_url,
    get_redcap_token_for_project,
    get_therapist_by_user_id,
    import_patient_from_redcap,
    redcap_export_minimal,
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


def create_therapist(projects=None):
    user = User(
        username=f"th-{ObjectId()}",
        role="Therapist",
        email="th@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(
        userId=user,
        clinics=["Inselspital"],
        projects=projects or ["COPAIN"],
    ).save()
    return user, th


class _FakeRequest:
    def __init__(self, body):
        self.body = body


def test_available_patients_method_not_allowed():
    resp = client.post("/api/redcap/available-patients/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405


def test_helpers_norm_bad_json_and_password_strength():
    assert _norm(None) == ""
    assert _norm("  X  ") == "X"
    assert _is_objectid(str(ObjectId())) is True
    assert _is_objectid("bad") is False
    assert _safe_json_body(_FakeRequest(b"{")) == {}
    assert _safe_json_body(_FakeRequest(b'{"a":1}')) == {"a": 1}
    assert _is_strong_password("Strong1!") is True
    assert _is_strong_password("weak") is False

    resp = _bad("x", status=418, extra={"k": "v"})
    assert resp.status_code == 418
    assert resp.content


def test_env_helpers_and_therapist_resolution_branches():
    with patch.dict("os.environ", {"REDCAP_API_URL": " https://r.example/api/ "}, clear=False):
        assert get_redcap_api_url() == "https://r.example/api/"
    with patch.dict("os.environ", {}, clear=True):
        assert "redcap" in get_redcap_api_url()
        assert get_redcap_token_for_project("copain") is None
    with patch.dict("os.environ", {"REDCAP_TOKEN_COPAIN": " tok "}, clear=True):
        assert get_redcap_token_for_project("copain") == "tok"

    assert get_therapist_by_user_id("") is None
    assert get_therapist_by_user_id("bad") is None

    u, th = create_therapist()
    assert get_therapist_by_user_id(str(u.id)).id == th.id

    t_legacy = SimpleNamespace(project="COPAIN")
    assert get_allowed_redcap_projects_for_therapist(t_legacy) == ["COPAIN"]
    assert allowed_dags_by_project(th, "COPAIN") is None


@patch("core.views.redcap_import_views.requests.post")
def test_redcap_export_minimal_success_and_filters(mock_post):
    resp = Mock(status_code=200)
    resp.json.return_value = [
        {"record_id": "R1", "pat_id": "P1"},
        {"record_id": "R2", "pat_id": "P2"},
    ]
    mock_post.return_value = resp

    rows = redcap_export_minimal(token="t", project="COPAIN", patient_id="P1")
    assert len(rows) == 1
    assert rows[0]["record_id"] == "R1"


@patch("core.views.redcap_import_views.requests.post", side_effect=Exception("down"))
def test_redcap_export_minimal_network_failure_raises(_):
    with pytest.raises(RedcapError):
        redcap_export_minimal(token="t", project="COPAIN")


@patch("core.views.redcap_import_views.requests.post")
def test_redcap_export_minimal_non_200_and_bad_payload_raises(mock_post):
    bad = Mock(status_code=500, text="boom")
    mock_post.return_value = bad
    with pytest.raises(RedcapError):
        redcap_export_minimal(token="t", project="COPAIN")

    not_list = Mock(status_code=200, text="{}", json=lambda: {"k": "v"})
    mock_post.return_value = not_list
    with pytest.raises(RedcapError):
        redcap_export_minimal(token="t", project="COPAIN")


@patch("core.views.redcap_import_views.get_therapist_for_user", return_value=None)
def test_available_patients_therapist_not_found(mock_get_th):
    resp = client.get("/api/redcap/available-patients/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 404
    assert resp.json()["error"] == "Therapist profile not found."


@patch(
    "core.views.redcap_import_views.get_allowed_redcap_projects_for_therapist",
    return_value=[],
)
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_available_patients_no_allowed_projects(mock_get_th, mock_allowed):
    _, th = create_therapist()
    mock_get_th.return_value = th

    resp = client.get("/api/redcap/available-patients/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["projects"] == []
    assert body["candidates"] == []


@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_available_patients_project_not_allowed(mock_get_th):
    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th

    resp = client.get(
        "/api/redcap/available-patients/?project=COMPASS",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 403
    assert resp.json()["error"] == "Project not allowed."


@patch(
    "core.views.redcap_import_views.redcap_export_minimal",
    return_value=[{"record_id": "R1", "pat_id": "P17", "redcap_data_access_group": "d1"}],
)
@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value="tok")
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_available_patients_returns_candidates(mock_get_th, mock_tok, mock_export):
    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th

    resp = client.get(
        "/api/redcap/available-patients/?project=COPAIN",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["projects"] == ["COPAIN"]
    assert len(body["candidates"]) == 1
    assert body["candidates"][0]["identifier"] == "P17"


@patch(
    "core.views.redcap_import_views.redcap_export_minimal",
    return_value=[{"record_id": "R1", "pat_id": "P17", "redcap_data_access_group": "d1"}],
)
@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value="tok")
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_available_patients_excludes_existing(mock_get_th, mock_tok, mock_export):
    th_user, th = create_therapist(projects=["COPAIN"])
    patient_user = User(username="p-existing", role="Patient", createdAt=datetime.now(), isActive=True).save()
    Patient(userId=patient_user, patient_code="P17", therapist=th).save()
    mock_get_th.return_value = th

    resp = client.get(
        "/api/redcap/available-patients/?project=COPAIN",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert resp.json()["candidates"] == []


@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value=None)
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_available_patients_missing_project_token(mock_get_th, mock_tok):
    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th

    resp = client.get(
        "/api/redcap/available-patients/?project=COPAIN",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["candidates"] == []
    assert len(body["errors"]) == 1


@patch("core.views.redcap_import_views.allowed_dags_by_project", return_value={"d1"})
@patch("core.views.redcap_import_views.redcap_export_minimal")
@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value="tok")
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_available_patients_dag_filter_and_dedupe(mock_get_th, mock_tok, mock_export, _):
    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th
    mock_export.return_value = [
        {"record_id": "R1", "pat_id": "P17", "redcap_data_access_group": "d1"},
        {"record_id": "R2", "pat_id": "P17", "redcap_data_access_group": "d1"},
        {"record_id": "R3", "pat_id": "P99", "redcap_data_access_group": "d2"},
        {"record_id": "", "pat_id": "", "redcap_data_access_group": "d1"},
    ]
    resp = client.get(
        "/api/redcap/available-patients/?project=COPAIN",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["candidates"]) == 1
    assert body["candidates"][0]["dag"] == "d1"


@patch("core.views.redcap_import_views.redcap_export_minimal")
@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value="tok")
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_available_patients_collects_errors(mock_get_th, mock_tok, mock_export):
    _, th = create_therapist(projects=["COPAIN", "COMPASS"])
    mock_get_th.return_value = th
    mock_export.side_effect = [RedcapError("rc-fail", detail="x"), Exception("boom")]
    resp = client.get("/api/redcap/available-patients/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    body = resp.json()
    assert "errors" in body
    assert len(body["errors"]) == 2


def test_import_patient_method_not_allowed():
    resp = client.get("/api/redcap/import-patient/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405


@patch("core.views.redcap_import_views.get_therapist_for_user", return_value=None)
def test_import_patient_missing_fields(mock_get_th):
    resp = client.post(
        "/api/redcap/import-patient/",
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_import_patient_weak_password(mock_get_th):
    _, th = create_therapist()
    mock_get_th.return_value = th

    resp = client.post(
        "/api/redcap/import-patient/",
        data=json.dumps({"project": "COPAIN", "patient_code": "P17", "password": "weak"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Weak password" in resp.json()["error"]


@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_import_patient_project_not_allowed(mock_get_th):
    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th

    resp = client.post(
        "/api/redcap/import-patient/",
        data=json.dumps({"project": "COMPASS", "patient_code": "P17", "password": "Strong1!"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 403


@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_import_patient_already_imported(mock_get_th):
    _, th = create_therapist(projects=["COPAIN"])
    p_user = User(username="existingp", role="Patient", createdAt=datetime.now(), isActive=True).save()
    Patient(userId=p_user, patient_code="P17", therapist=th).save()
    mock_get_th.return_value = th

    resp = client.post(
        "/api/redcap/import-patient/",
        data=json.dumps({"project": "COPAIN", "patient_code": "P17", "password": "Strong1!"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "Patient already imported."


@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value=None)
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_import_patient_missing_token(mock_get_th, mock_token):
    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th

    resp = client.post(
        "/api/redcap/import-patient/",
        data=json.dumps({"project": "COPAIN", "patient_code": "P17", "password": "Strong1!"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 500


@patch("core.views.redcap_import_views.allowed_dags_by_project", return_value={"dag-ok"})
@patch(
    "core.views.redcap_import_views.redcap_export_minimal",
    return_value=[{"record_id": "R1", "pat_id": "P17", "redcap_data_access_group": "dag-no"}],
)
@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value="tok")
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_import_patient_dag_forbidden(mock_get_th, _a, _b, _c):
    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th
    resp = client.post(
        "/api/redcap/import-patient/",
        data=json.dumps({"project": "COPAIN", "patient_code": "P17", "password": "Strong1!"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 403


@patch("core.views.redcap_import_views.redcap_export_minimal", return_value=[])
@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value="tok")
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_import_patient_not_found_in_redcap(mock_get_th, mock_tok, mock_export):
    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th

    resp = client.post(
        "/api/redcap/import-patient/",
        data=json.dumps({"project": "COPAIN", "patient_code": "P17", "password": "Strong1!"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


@patch("core.views.redcap_import_views.redcap_export_minimal")
@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value="tok")
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_import_patient_fallback_patient_id_mode(mock_get_th, mock_tok, mock_export):
    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th
    mock_export.side_effect = [
        [],
        [{"record_id": "R7", "pat_id": "P77", "redcap_data_access_group": "dag1"}],
    ]
    resp = client.post(
        "/api/redcap/import-patient/",
        data=json.dumps({"project": "COPAIN", "patient_code": "P77", "password": "Strong1!"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 201
    assert resp.json()["identifier"] == "P77"


@patch("core.views.redcap_import_views.redcap_export_minimal")
@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value="tok")
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_import_patient_fallback_redcap_error_returns_502(mock_get_th, mock_tok, mock_export):
    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th
    mock_export.side_effect = [[], RedcapError("failed", detail="x")]
    resp = client.post(
        "/api/redcap/import-patient/",
        data=json.dumps({"project": "COPAIN", "patient_code": "P17", "password": "Strong1!"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 502


@patch(
    "core.views.redcap_import_views.redcap_export_minimal",
    return_value=[{"record_id": "R1", "pat_id": "P17", "redcap_data_access_group": "dag1"}],
)
@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value="tok")
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_import_patient_username_collision_suffix(mock_get_th, mock_tok, mock_export):
    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th
    User(username="P17", role="Patient", createdAt=datetime.now(), isActive=True).save()

    resp = client.post(
        "/api/redcap/import-patient/",
        data=json.dumps({"project": "COPAIN", "patient_code": "P17", "password": "Strong1!"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 201
    assert resp.json()["username"].startswith("P17_")


@patch("core.views.redcap_import_views.redcap_export_minimal")
@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value="tok")
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_import_patient_success(mock_get_th, mock_tok, mock_export):
    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th

    # record lookup succeeds on first call (record_id mode)
    mock_export.return_value = [{"record_id": "R1", "pat_id": "P17", "redcap_data_access_group": "dag1"}]

    resp = client.post(
        "/api/redcap/import-patient/",
        data=json.dumps({"project": "COPAIN", "patient_code": "P17", "password": "Strong1!"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["ok"] is True
    assert body["identifier"] == "P17"
    assert body["project"] == "COPAIN"
    assert Patient.objects(patient_code="P17").count() == 1


@patch("core.views.redcap_import_views.redcap_export_minimal")
@patch("core.views.redcap_import_views.get_redcap_token_for_project", return_value="tok")
@patch("core.views.redcap_import_views.get_therapist_for_user")
def test_import_patient_creates_redcap_import_log(mock_get_th, mock_tok, mock_export):
    """
    A successful REDCap import must write a ``Logs`` document with
    ``action="REDCAP_IMPORT"`` containing the project name and identifier.
    """
    from core.models import Logs

    _, th = create_therapist(projects=["COPAIN"])
    mock_get_th.return_value = th
    mock_export.return_value = [{"record_id": "R2", "pat_id": "P99", "redcap_data_access_group": ""}]

    resp = client.post(
        "/api/redcap/import-patient/",
        data=json.dumps({"project": "COPAIN", "patient_code": "P99", "password": "Strong1!"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 201

    log = Logs.objects(action="REDCAP_IMPORT").first()
    assert log is not None, "Expected a REDCAP_IMPORT log entry"
    assert "COPAIN" in (log.details or "")
    assert "P99" in (log.details or "")
