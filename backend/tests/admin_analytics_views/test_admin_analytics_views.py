"""
Admin analytics view tests
— ``GET /api/admin/analytics/devices/``
— ``GET /api/admin/analytics/active-users/``
===========================================

Coverage
--------
Devices
  * Counts LOGIN entries by device type and by role.

Active users
  * Counts distinct users per role with a log entry in the last 15 minutes.
  * Ignores entries older than the window.
  * Still counts users who logged out within the window.
  * Ignores entries logged on someone else's behalf (actor role differs from the user's role).
  * A therapist force-logging out a patient doesn't count as patient activity.
  * Always returns all three roles, with zeros.
  * Counts registered active accounts per role, and inactive accounts separately.
  * Counts a missing isActive as inactive and skips unknown roles.
  * Admin-only: 403 for non-admin users.
"""

from datetime import datetime, timedelta
from types import SimpleNamespace

import mongomock
import pytest
from django.utils import timezone
from mongoengine import connect, disconnect
from rest_framework.test import APIClient

from core.models import Logs, User

DEVICES_URL = "/api/admin/analytics/devices/"
ACTIVE_URL = "/api/admin/analytics/active-users/"


@pytest.fixture(autouse=True)
def mongo_mock():
    alias = "default"
    from mongoengine.connection import _connections

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


def _user(username, role="Patient", active=True):
    user = User(
        username=username,
        email=f"{username}@test.example.com",
        role=role,
        isActive=active,
        createdAt=datetime.now(),
    )
    user.pwdhash = "x"
    return user.save()


def _client_for(user):
    c = APIClient()
    c.force_authenticate(user=SimpleNamespace(is_authenticated=True, id=str(user.id)))
    return c


@pytest.fixture
def admin_client():
    return _client_for(_user("admin_analytics", role="Admin"))


def _log(user, action="OPEN_PATIENT", minutes_ago=1, role=None, device_type=None):
    return Logs(
        userId=user,
        action=action,
        actor_role=role or user.role,
        timestamp=timezone.now() - timedelta(minutes=minutes_ago),
        device_type=device_type,
    ).save()


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------


def test_device_analytics_counts_logins(admin_client):
    therapist = _user("t1", role="Therapist")
    _log(therapist, action="LOGIN", device_type="Mobile")
    _log(therapist, action="LOGIN", device_type="Desktop")
    _log(therapist, action="OPEN_PATIENT", device_type="Mobile")

    data = admin_client.get(DEVICES_URL).json()
    assert data["by_device"] == {"Mobile": 1, "Desktop": 1}
    assert data["by_role"] == {"Therapist": {"Mobile": 1, "Desktop": 1}}


# ---------------------------------------------------------------------------
# Active users
# ---------------------------------------------------------------------------


def test_active_users_counts_distinct_users_per_role(admin_client):
    p1, p2 = _user("p1"), _user("p2")
    therapist = _user("t1", role="Therapist")
    _log(p1, action="INTERVENTION_VIEW")
    _log(p1, action="INTERVENTION_COMPLETE")
    _log(p2, action="HEALTH_PAGE", minutes_ago=10)
    _log(therapist, action="OPEN_PATIENT")

    data = admin_client.get(ACTIVE_URL).json()
    assert data["by_role"] == {"Patient": 2, "Therapist": 1, "Admin": 0}
    assert data["total"] == 3
    assert data["window_minutes"] == 15
    assert data["as_of"]


def test_active_users_ignores_old_entries(admin_client):
    _log(_user("p1"), minutes_ago=16)
    data = admin_client.get(ACTIVE_URL).json()
    assert data["total"] == 0
    assert data["by_role"] == {"Patient": 0, "Therapist": 0, "Admin": 0}


def test_active_users_counts_users_who_logged_out(admin_client):
    left = _user("left")
    _log(left, action="OPEN_PATIENT", minutes_ago=5)
    _log(left, action="LOGOUT", minutes_ago=2)

    data = admin_client.get(ACTIVE_URL).json()
    assert data["by_role"]["Patient"] == 1


def test_active_users_ignores_entries_logged_on_behalf_of_others(admin_client):
    # e.g. an admin editing a therapist's access logs the therapist with actor_role "Admin".
    _log(_user("t1", role="Therapist"), action="UPDATE_PROFILE", role="Admin")
    _log(_user("p1"), action="UPDATE_PROFILE", role="Therapist")

    data = admin_client.get(ACTIVE_URL).json()
    assert data["total"] == 0


def test_active_users_ignores_force_logout_by_therapist(admin_client):
    _log(_user("p1"), action="FORCE_LOGOUT", minutes_ago=2, role="Therapist")

    data = admin_client.get(ACTIVE_URL).json()
    assert data["total"] == 0


def test_active_users_returns_counts_only(admin_client):
    _log(_user("p1"))
    data = admin_client.get(ACTIVE_URL).json()
    assert set(data) == {"as_of", "window_minutes", "total", "by_role", "registered"}
    assert set(data["registered"]) == {"active", "by_role", "inactive"}


def test_active_users_counts_registered_accounts(admin_client):
    _user("p1")
    _user("p2")
    _user("t1", role="Therapist")
    _user("pending", role="Therapist", active=False)
    _user("deleted", active=False)

    registered = admin_client.get(ACTIVE_URL).json()["registered"]
    # admin_client's own admin counts too.
    assert registered["by_role"] == {"Patient": 2, "Therapist": 1, "Admin": 1}
    assert registered["active"] == 4
    assert registered["inactive"] == 2


def test_registered_accounts_count_missing_active_flag_as_inactive(admin_client):
    User._get_collection().insert_one({"username": "legacy", "role": "Patient", "createdAt": datetime.now()})

    registered = admin_client.get(ACTIVE_URL).json()["registered"]
    assert registered["by_role"]["Patient"] == 0
    assert registered["inactive"] == 1


def test_registered_accounts_skip_unknown_roles(admin_client):
    users = User._get_collection()
    users.insert_one({"username": "odd", "role": "Researcher", "isActive": True, "createdAt": datetime.now()})
    users.insert_one({"username": "odd2", "role": "Researcher", "isActive": False, "createdAt": datetime.now()})
    users.insert_one({"username": "norole", "createdAt": datetime.now()})

    registered = admin_client.get(ACTIVE_URL).json()["registered"]
    assert registered["by_role"] == {"Patient": 0, "Therapist": 0, "Admin": 1}
    assert registered["active"] == 1
    assert registered["inactive"] == 0


def test_registered_accounts_include_users_without_recent_activity(admin_client):
    _log(_user("p1"), minutes_ago=60 * 24)
    registered = admin_client.get(ACTIVE_URL).json()["registered"]
    assert registered["by_role"]["Patient"] == 1


def test_active_users_forbidden_for_non_admin():
    resp = _client_for(_user("t2", role="Therapist")).get(ACTIVE_URL)
    assert resp.status_code == 403
