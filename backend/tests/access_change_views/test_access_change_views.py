"""
Access change views tests
=========================

Endpoints covered
-----------------
``GET  /api/therapist/access-change-request/``          → ``submit_access_change_request``
``POST /api/therapist/access-change-request/``          → ``submit_access_change_request``
``GET  /api/admin/access-change-requests/``             → ``admin_access_change_requests``
``PUT  /api/admin/access-change-requests/<id>/``        → ``admin_access_change_requests``

Coverage goals
--------------
Therapist endpoints
  * GET returns hasPending=False when no pending request exists.
  * GET returns hasPending=True when a pending request exists.
  * POST creates a pending TherapistAccessChangeRequest.
  * POST rejects unknown clinic / project values.
  * POST supersedes an existing pending request (old one becomes rejected).
  * POST returns 404 when the authenticated user has no therapist profile.

Admin endpoints
  * GET lists all pending requests in descending creation order.
  * GET with ?status=all returns requests of every status.
  * PUT approve updates therapist clinics/projects and marks request approved.
  * PUT reject marks request rejected without altering therapist access.
  * PUT returns 400 for already-reviewed requests.
  * PUT returns 404 for unknown request ids.
  * PUT returns 400 for an unsupported action string.

Test setup
----------
The ``mongo_mock`` autouse fixture provides an isolated in-memory mongomock
DB for every test function.  ``core.views.access_change_views._get_therapist``
is patched to return the pre-built therapist, bypassing JWT validation.
``send_mail`` is patched globally so no e-mails are actually sent.
"""

import json
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from rest_framework.test import APIClient

from core.models import Therapist, TherapistAccessChangeRequest, User

# Minimal user that satisfies DRF's IsAuthenticated check.
_AUTH_USER = SimpleNamespace(is_authenticated=True)

# Path to the _get_therapist helper in the view module.
_GT = "core.views.access_change_views._get_therapist"

# Silence all send_mail calls for the entire module.
pytestmark = pytest.mark.usefixtures("no_mail")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    """Isolated in-memory MongoDB for every test function."""
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


@pytest.fixture()
def no_mail():
    with patch("core.views.access_change_views.send_mail"):
        yield


def _make_therapist(clinics=None, projects=None):
    """Create a User + Therapist and return (user, therapist)."""
    user = User(
        username=f"th-{ObjectId()}",
        email="therapist@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(
        userId=user,
        name="Doe",
        first_name="Jane",
        clinics=clinics or ["Inselspital"],
        projects=projects or ["COPAIN"],
    ).save()
    return user, therapist


def _make_admin():
    """Create an Admin User + Therapist (for reviewed_by field)."""
    user = User(
        username=f"admin-{ObjectId()}",
        email="admin@example.com",
        role="Admin",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(
        userId=user,
        name="Admin",
        first_name="Super",
        clinics=[],
        projects=[],
    ).save()
    return user, therapist


def _client():
    c = APIClient()
    c.force_authenticate(user=_AUTH_USER)
    return c


# ---------------------------------------------------------------------------
# Helper: POST a change request
# ---------------------------------------------------------------------------


def _post_request(therapist, clinics, projects):
    c = _client()
    with patch(_GT, return_value=therapist):
        return c.post(
            "/api/therapist/access-change-request/",
            data=json.dumps({"clinics": clinics, "projects": projects}),
            content_type="application/json",
        )


# ---------------------------------------------------------------------------
# Therapist — GET /api/therapist/access-change-request/
# ---------------------------------------------------------------------------


def test_get_has_pending_false_when_no_requests():
    _, therapist = _make_therapist()
    c = _client()
    with patch(_GT, return_value=therapist):
        resp = c.get("/api/therapist/access-change-request/")
    assert resp.status_code == 200
    assert resp.json()["hasPending"] is False


def test_get_has_pending_true_when_pending_request_exists():
    _, therapist = _make_therapist()
    TherapistAccessChangeRequest(
        therapist=therapist,
        requested_clinics=["Inselspital"],
        requested_projects=["COPAIN"],
        status="pending",
        created_at=datetime.now(),
    ).save()

    c = _client()
    with patch(_GT, return_value=therapist):
        resp = c.get("/api/therapist/access-change-request/")
    assert resp.status_code == 200
    assert resp.json()["hasPending"] is True


def test_get_returns_404_when_no_therapist_profile():
    c = _client()
    with patch(_GT, return_value=None):
        resp = c.get("/api/therapist/access-change-request/")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Therapist — POST /api/therapist/access-change-request/
# ---------------------------------------------------------------------------


def test_post_creates_pending_request():
    _, therapist = _make_therapist()
    resp = _post_request(therapist, ["Inselspital"], ["COPAIN"])

    assert resp.status_code == 201
    body = resp.json()
    assert body["ok"] is True
    assert "requestId" in body

    req = TherapistAccessChangeRequest.objects.get(id=body["requestId"])
    assert req.status == "pending"
    assert req.requested_clinics == ["Inselspital"]
    assert req.requested_projects == ["COPAIN"]


def test_post_rejects_invalid_clinic():
    _, therapist = _make_therapist()
    resp = _post_request(therapist, ["NonExistentClinic"], [])
    assert resp.status_code == 400
    assert "Invalid clinic" in resp.json()["error"]


def test_post_rejects_invalid_project():
    _, therapist = _make_therapist()
    resp = _post_request(therapist, [], ["NONEXISTENT"])
    assert resp.status_code == 400
    assert "Invalid project" in resp.json()["error"]


def test_post_supersedes_existing_pending_request():
    _, therapist = _make_therapist()

    # Create first request
    old = TherapistAccessChangeRequest(
        therapist=therapist,
        requested_clinics=["Inselspital"],
        requested_projects=["COPAIN"],
        status="pending",
        created_at=datetime.now(),
    ).save()

    # Submit a new one
    resp = _post_request(therapist, ["Inselspital"], ["COPAIN"])
    assert resp.status_code == 201

    old.reload()
    assert old.status == "rejected"
    assert "Superseded" in old.note


def test_post_returns_404_when_no_therapist_profile():
    c = _client()
    with patch(_GT, return_value=None):
        resp = c.post(
            "/api/therapist/access-change-request/",
            data=json.dumps({"clinics": [], "projects": []}),
            content_type="application/json",
        )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Admin — GET /api/admin/access-change-requests/
# ---------------------------------------------------------------------------


def test_admin_get_lists_pending_requests():
    _, therapist = _make_therapist()
    TherapistAccessChangeRequest(
        therapist=therapist,
        requested_clinics=["Inselspital"],
        requested_projects=["COPAIN"],
        status="pending",
        created_at=datetime.now(),
    ).save()

    c = _client()
    resp = c.get("/api/admin/access-change-requests/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert len(body["requests"]) == 1
    assert body["requests"][0]["status"] == "pending"


def test_admin_get_filters_by_status_all():
    _, therapist = _make_therapist()
    TherapistAccessChangeRequest(
        therapist=therapist, requested_clinics=[], requested_projects=[], status="approved", created_at=datetime.now()
    ).save()
    TherapistAccessChangeRequest(
        therapist=therapist, requested_clinics=[], requested_projects=[], status="pending", created_at=datetime.now()
    ).save()

    c = _client()
    resp = c.get("/api/admin/access-change-requests/?status=all")
    assert resp.status_code == 200
    assert len(resp.json()["requests"]) == 2


def test_admin_get_serializes_therapist_name_and_email():
    _, therapist = _make_therapist()
    TherapistAccessChangeRequest(
        therapist=therapist,
        requested_clinics=["Inselspital"],
        requested_projects=["COPAIN"],
        status="pending",
        created_at=datetime.now(),
    ).save()

    c = _client()
    resp = c.get("/api/admin/access-change-requests/")
    req = resp.json()["requests"][0]
    assert req["therapistName"] == "Jane Doe"
    assert req["therapistEmail"] == "therapist@example.com"
    assert req["currentClinics"] == ["Inselspital"]
    assert req["requestedClinics"] == ["Inselspital"]


# ---------------------------------------------------------------------------
# Admin — PUT /api/admin/access-change-requests/<id>/
# ---------------------------------------------------------------------------


def test_admin_put_approve_updates_therapist_clinics_and_projects():
    _, therapist = _make_therapist(clinics=["Inselspital"], projects=["COPAIN"])
    req = TherapistAccessChangeRequest(
        therapist=therapist,
        requested_clinics=["Inselspital"],
        requested_projects=["COPAIN"],
        status="pending",
        created_at=datetime.now(),
    ).save()

    _, admin_therapist = _make_admin()
    c = _client()
    with patch(_GT, return_value=admin_therapist):
        resp = c.put(
            f"/api/admin/access-change-requests/{req.id}/",
            data=json.dumps({"action": "approve"}),
            content_type="application/json",
        )

    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    req.reload()
    assert req.status == "approved"

    therapist.reload()
    assert therapist.clinics == ["Inselspital"]
    assert therapist.projects == ["COPAIN"]


def test_admin_put_reject_marks_request_rejected_without_changing_access():
    _, therapist = _make_therapist(clinics=["Inselspital"], projects=["COPAIN"])
    req = TherapistAccessChangeRequest(
        therapist=therapist,
        requested_clinics=["Berner Reha Centrum"],
        requested_projects=["COPAIN"],
        status="pending",
        created_at=datetime.now(),
    ).save()

    _, admin_therapist = _make_admin()
    c = _client()
    with patch(_GT, return_value=admin_therapist):
        resp = c.put(
            f"/api/admin/access-change-requests/{req.id}/",
            data=json.dumps({"action": "reject", "note": "Not approved."}),
            content_type="application/json",
        )

    assert resp.status_code == 200

    req.reload()
    assert req.status == "rejected"
    assert req.note == "Not approved."

    # Therapist access unchanged
    therapist.reload()
    assert therapist.clinics == ["Inselspital"]
    assert therapist.projects == ["COPAIN"]


def test_admin_put_returns_400_for_already_reviewed_request():
    _, therapist = _make_therapist()
    req = TherapistAccessChangeRequest(
        therapist=therapist,
        requested_clinics=[],
        requested_projects=[],
        status="approved",
        created_at=datetime.now(),
    ).save()

    _, admin_therapist = _make_admin()
    c = _client()
    with patch(_GT, return_value=admin_therapist):
        resp = c.put(
            f"/api/admin/access-change-requests/{req.id}/",
            data=json.dumps({"action": "approve"}),
            content_type="application/json",
        )

    assert resp.status_code == 400
    assert "already" in resp.json()["error"]


def test_admin_put_returns_404_for_unknown_id():
    _, admin_therapist = _make_admin()
    c = _client()
    with patch(_GT, return_value=admin_therapist):
        resp = c.put(
            f"/api/admin/access-change-requests/{ObjectId()}/",
            data=json.dumps({"action": "approve"}),
            content_type="application/json",
        )
    assert resp.status_code == 404


def test_admin_put_returns_400_for_invalid_action():
    _, therapist = _make_therapist()
    req = TherapistAccessChangeRequest(
        therapist=therapist,
        requested_clinics=[],
        requested_projects=[],
        status="pending",
        created_at=datetime.now(),
    ).save()

    _, admin_therapist = _make_admin()
    c = _client()
    with patch(_GT, return_value=admin_therapist):
        resp = c.put(
            f"/api/admin/access-change-requests/{req.id}/",
            data=json.dumps({"action": "delete"}),
            content_type="application/json",
        )
    assert resp.status_code == 400
    assert "action" in resp.json()["error"]


def test_admin_put_requires_request_id_in_url():
    c = _client()
    resp = c.put(
        "/api/admin/access-change-requests/",
        data=json.dumps({"action": "approve"}),
        content_type="application/json",
    )
    assert resp.status_code == 400
