import json
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.test import RequestFactory

import core.views.redcap_view as redcap_view
from core.models import RedcapParticipant, Therapist, User
from core.views.redcap_view import (
    import_redcap_participant,
    list_my_redcap_participants,
)


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
def rf():
    return RequestFactory()


def mk_therapist():
    u = User(
        username=f"th-{datetime.now().timestamp()}",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    t = Therapist(userId=u, clinics=["Inselspital"]).save()
    return u, t


def test_import_redcap_participant_method_not_allowed(rf):
    req = rf.get("/api/redcap/import/")
    resp = import_redcap_participant(req)
    assert resp.status_code == 405


def test_import_redcap_participant_currently_returns_500_due_to_json_nameerror(rf):
    u, t = mk_therapist()
    req = rf.post(
        "/api/redcap/import/",
        data=json.dumps({"record_id": "R1"}),
        content_type="application/json",
    )
    req.user = u
    resp = import_redcap_participant(req)
    assert resp.status_code == 500
    assert "json" in json.loads(resp.content)["error"]


def test_import_redcap_participant_missing_record_id_after_json_patch(rf, monkeypatch):
    u, _ = mk_therapist()
    monkeypatch.setattr(redcap_view, "json", json, raising=False)
    req = rf.post("/api/redcap/import/", data=json.dumps({}), content_type="application/json")
    req.user = u
    resp = import_redcap_participant(req)
    assert resp.status_code == 400


def test_import_redcap_participant_forbidden_for_non_therapist(rf, monkeypatch):
    u = User(username="pt", role="Patient", createdAt=datetime.now(), isActive=True).save()
    monkeypatch.setattr(redcap_view, "json", json, raising=False)
    req = rf.post(
        "/api/redcap/import/",
        data=json.dumps({"record_id": "R1"}),
        content_type="application/json",
    )
    req.user = u
    resp = import_redcap_participant(req)
    assert resp.status_code == 403


@patch("core.views.redcap_view.redcap_export_record")
def test_import_redcap_participant_existing_same_therapist_returns_200(mock_export, rf, monkeypatch):
    u, t = mk_therapist()
    monkeypatch.setattr(redcap_view, "json", json, raising=False)
    monkeypatch.setattr(
        redcap_view,
        "settings",
        SimpleNamespace(REDCAP_API_URL="u", REDCAP_API_TOKEN="t"),
        raising=False,
    )

    existing = SimpleNamespace(id=ObjectId(), record_id="R1", assigned_therapist=t)

    class DummyRP:
        objects = lambda *args, **kwargs: SimpleNamespace(first=lambda: existing)

    req = rf.post(
        "/api/redcap/import/",
        data=json.dumps({"record_id": "R1"}),
        content_type="application/json",
    )
    req.user = u
    monkeypatch.setattr(redcap_view, "RedcapParticipant", DummyRP, raising=False)
    resp = import_redcap_participant(req)
    assert resp.status_code == 200
    assert json.loads(resp.content)["ok"] is True
    mock_export.assert_not_called()


def test_import_redcap_participant_existing_other_therapist_returns_409(rf, monkeypatch):
    u1, _ = mk_therapist()
    u2 = User(username="th2", role="Therapist", createdAt=datetime.now(), isActive=True).save()
    t2 = Therapist(userId=u2, clinics=["Inselspital"]).save()
    monkeypatch.setattr(redcap_view, "json", json, raising=False)
    monkeypatch.setattr(
        redcap_view,
        "settings",
        SimpleNamespace(REDCAP_API_URL="u", REDCAP_API_TOKEN="t"),
        raising=False,
    )

    existing = SimpleNamespace(id=ObjectId(), record_id="R1", assigned_therapist=t2)

    class DummyRP:
        objects = lambda *args, **kwargs: SimpleNamespace(first=lambda: existing)

    req = rf.post(
        "/api/redcap/import/",
        data=json.dumps({"record_id": "R1"}),
        content_type="application/json",
    )
    req.user = u1
    monkeypatch.setattr(redcap_view, "RedcapParticipant", DummyRP, raising=False)
    resp = import_redcap_participant(req)
    assert resp.status_code == 409


@patch("core.views.redcap_view.redcap_export_record", return_value=None)
def test_import_redcap_participant_record_not_found_in_redcap(mock_export, rf, monkeypatch):
    u, _ = mk_therapist()
    monkeypatch.setattr(redcap_view, "json", json, raising=False)
    monkeypatch.setattr(
        redcap_view,
        "settings",
        SimpleNamespace(REDCAP_API_URL="u", REDCAP_API_TOKEN="t"),
        raising=False,
    )

    class DummyRP:
        objects = lambda *args, **kwargs: SimpleNamespace(first=lambda: None)

    req = rf.post(
        "/api/redcap/import/",
        data=json.dumps({"record_id": "R404"}),
        content_type="application/json",
    )
    req.user = u
    monkeypatch.setattr(redcap_view, "RedcapParticipant", DummyRP, raising=False)
    resp = import_redcap_participant(req)
    assert resp.status_code == 404
    mock_export.assert_called_once()


@patch(
    "core.views.redcap_view.redcap_export_record",
    return_value={
        "record_id": "R2",
        "gender": "f",
        "primary_diagnosis": "dx",
        "clinic": "A",
    },
)
def test_import_redcap_participant_create_success(mock_export, rf, monkeypatch):
    u, _ = mk_therapist()
    monkeypatch.setattr(redcap_view, "json", json, raising=False)
    monkeypatch.setattr(
        redcap_view,
        "settings",
        SimpleNamespace(REDCAP_API_URL="u", REDCAP_API_TOKEN="t"),
        raising=False,
    )

    class DummyManager:
        def __call__(self, *args, **kwargs):
            return self

        def first(self):
            return None

    class DummyRP:
        objects = DummyManager()
        saved = []

        def __init__(self, **kwargs):
            self.id = ObjectId()
            self.record_id = kwargs.get("record_id")
            self.kwargs = kwargs

        def save(self):
            self.__class__.saved.append(self)

    monkeypatch.setattr(redcap_view, "RedcapParticipant", DummyRP, raising=False)
    req = rf.post(
        "/api/redcap/import/",
        data=json.dumps({"record_id": "R2"}),
        content_type="application/json",
    )
    req.user = u
    resp = import_redcap_participant(req)
    assert resp.status_code == 201
    body = json.loads(resp.content)
    assert body["ok"] is True
    assert len(DummyRP.saved) == 1


def test_list_my_redcap_participants_method_not_allowed(rf):
    req = rf.post("/api/redcap/my")
    resp = list_my_redcap_participants(req)
    assert resp.status_code == 405


def test_list_my_redcap_participants_only_therapists(rf):
    u = User(username="u", role="Patient", createdAt=datetime.now(), isActive=True).save()
    req = rf.get("/api/redcap/my")
    req.user = u
    resp = list_my_redcap_participants(req)
    assert resp.status_code == 403


def test_list_my_redcap_participants_success(rf):
    u, t = mk_therapist()
    RedcapParticipant(
        record_id="R1",
        gender="m",
        primary_diagnosis="dx",
        clinic="Inselspital",
        assigned_therapist=[t],
        imported_by_user=u,
    ).save()

    req = rf.get("/api/redcap/my")
    req.user = u
    resp = list_my_redcap_participants(req)
    assert resp.status_code == 200
    body = json.loads(resp.content)
    assert len(body["items"]) == 1
    assert body["items"][0]["record_id"] == "R1"


def test_list_my_redcap_participants_filters_by_clinic_and_query(rf):
    u, t = mk_therapist()
    RedcapParticipant(record_id="R1", clinic="A", assigned_therapist=[t], imported_by_user=u).save()
    RedcapParticipant(record_id="ZZ2", clinic="B", assigned_therapist=[t], imported_by_user=u).save()

    req = rf.get("/api/redcap/my?q=r1&clinic=A")
    req.user = u
    resp = list_my_redcap_participants(req)
    assert resp.status_code == 200
    body = json.loads(resp.content)
    assert len(body["items"]) == 1
    assert body["items"][0]["record_id"] == "R1"
