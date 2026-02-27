"""
REDCap project views tests
==========================

Tests core/views/redcap_project_views.py directly (function-level), since
this variant is not routed in core/urls.py.
"""

import json
from types import SimpleNamespace
from unittest.mock import patch

import mongomock
import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from core.views.redcap_project_views import redcap_projects


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


class DummyTherapist:
    clinics = ["Inselspital"]


class DummyUser(SimpleNamespace):
    is_authenticated = True


@patch("core.views.redcap_project_views.get_therapist_for_user", return_value=None)
def test_redcap_project_views_therapist_not_found(mock_get_th, arf):
    req = arf.get("/api/redcap/projects/")
    force_authenticate(req, user=DummyUser())
    resp = redcap_projects(req)
    assert resp.status_code == 404
    assert json.loads(resp.content)["error"] == "Therapist profile not found."


@patch(
    "core.views.redcap_project_views.get_allowed_redcap_projects_for_therapist",
    return_value=["COPAIN"],
)
@patch(
    "core.views.redcap_project_views.get_therapist_for_user",
    return_value=DummyTherapist(),
)
def test_redcap_project_views_success(mock_get_th, mock_allowed, arf):
    req = arf.get("/api/redcap/projects/")
    force_authenticate(req, user=DummyUser())
    resp = redcap_projects(req)
    assert resp.status_code == 200
    body = json.loads(resp.content)
    assert body["ok"] is True
    assert body["clinics"] == ["Inselspital"]
    assert body["allowedProjects"] == ["COPAIN"]


def test_redcap_project_views_method_not_allowed(arf):
    req = arf.post("/api/redcap/projects/", {})
    force_authenticate(req, user=DummyUser())
    resp = redcap_projects(req)
    assert resp.status_code == 405
