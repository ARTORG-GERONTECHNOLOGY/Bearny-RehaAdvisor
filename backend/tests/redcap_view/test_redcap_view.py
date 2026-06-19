import json
from datetime import datetime

import mongomock
import pytest
from django.test import RequestFactory

from core.models import RedcapParticipant, Therapist, User
from core.views.redcap_view import list_my_redcap_participants


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
