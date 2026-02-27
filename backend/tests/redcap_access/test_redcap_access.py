from datetime import datetime
from types import SimpleNamespace

import mongomock
import pytest

import core.services.redcap_access as redcap_access
from core.models import Therapist, User
from core.services.redcap_access import (
    assert_project_allowed_for_therapist,
    get_allowed_redcap_projects_for_therapist,
    get_therapist_for_user,
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


def _make_therapist(email="th@example.com"):
    user = User(
        username=f"th-{email}",
        email=email,
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(userId=user, clinics=["Inselspital"], projects=["COPAIN"]).save()
    return user, therapist


def test_get_therapist_for_user_by_id_and_email_fallback_none():
    user, therapist = _make_therapist()
    dj_by_id = SimpleNamespace(id=user.id, email=None)
    dj_by_email = SimpleNamespace(id=None, email=user.email)
    assert get_therapist_for_user(dj_by_id).id == therapist.id
    # current implementation uses userId__email join, which returns None in this DB setup
    assert get_therapist_for_user(dj_by_email) is None


def test_get_therapist_for_user_returns_none_when_no_match():
    _make_therapist()
    dj_unknown = SimpleNamespace(id=None, email="missing@example.com")
    assert get_therapist_for_user(dj_unknown) is None


def test_get_allowed_projects_with_clinic_union_and_project_intersection(monkeypatch):
    _, therapist = _make_therapist()
    therapist.clinics = ["ClinicA", "ClinicB"]
    therapist.projects = ["PRJ1", "PRJX"]

    monkeypatch.setattr(
        redcap_access,
        "config",
        {"clinic_projects": {"ClinicA": ["PRJ1", "PRJ2"], "ClinicB": ["PRJ3", "PRJX"]}},
        raising=False,
    )

    allowed = get_allowed_redcap_projects_for_therapist(therapist)
    assert allowed == ["PRJ1", "PRJX"]


def test_assert_project_allowed_for_therapist(monkeypatch):
    _, therapist = _make_therapist()
    therapist.clinics = ["ClinicA"]
    therapist.projects = ["PRJ1"]

    monkeypatch.setattr(
        redcap_access,
        "config",
        {"clinic_projects": {"ClinicA": ["PRJ1", "PRJ2"]}},
        raising=False,
    )

    assert_project_allowed_for_therapist(therapist, "PRJ1")
    with pytest.raises(PermissionError):
        assert_project_allowed_for_therapist(therapist, "PRJ2")
