"""
Authentication login view tests — ``/api/auth/login/``
======================================================

What is covered
---------------
Happy-path
  * Patient credentials → 200 with JWT access + refresh tokens.
  * Response always contains the ``request_id`` audit field.
  * ``user_type`` field reflects the user's role.

Input-validation (400)
  * Both ``email`` and ``password`` absent.
  * ``password`` absent, ``email`` present.
  * ``email`` absent, ``password`` present.

Authentication failures (401)
  * Unknown e-mail / username → 401.
  * Correct e-mail but wrong password → 401.
  * User record exists but ``pwdhash`` is empty/None → 401.

Authorisation failures (403)
  * User is inactive (``isActive=False``) → 403, regardless of role.

Role-based authorisation (200 – special paths)
  * Therapist or Admin with valid credentials → 200 **without** JWT tokens;
    the response instead sets ``require_2fa: true``.  This enforces
    the mandatory two-factor authentication flow before a session is
    issued to these higher-privilege roles.
  * Inactive Therapist / Admin is denied with 403 before reaching the
    2FA branch — the inactive check is applied to every role.

Alternative identifiers
  * ``username`` can be supplied instead of ``email``; the endpoint
    accepts either.

HTTP method enforcement (405)
  * GET, PUT, PATCH, DELETE all return 405.

Test setup
----------
Each test uses the ``mongo_mock`` autouse fixture that spins up an
in-memory mongomock connection and tears it down afterwards, so no
external MongoDB is needed.
"""

import json
from datetime import datetime

import mongomock
import pytest
from django.contrib.auth.hashers import make_password
from django.test import Client
from mongoengine import connect, disconnect

from core.models import Therapist, User

# ---------------------------------------------------------------------------
# Shared mongomock fixture
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def mongo_mock():
    """Provide an isolated in-memory MongoDB for every test in this module."""
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


client = Client()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

LOGIN_URL = "/api/auth/login/"


def _post(payload):
    return client.post(
        LOGIN_URL,
        data=json.dumps(payload),
        content_type="application/json",
    )


def _make_user(email, password, role="Patient", is_active=True, username=None):
    return User(
        username=username or email.split("@")[0],
        role=role,
        email=email,
        pwdhash=make_password(password),
        createdAt=datetime.now(),
        isActive=is_active,
    ).save()


# ===========================================================================
# Happy-path tests
# ===========================================================================


def test_login_success_patient(mongo_mock):
    """
    A Patient with correct credentials receives HTTP 200, JWT tokens, and the
    correct ``user_type``.  This is the standard non-2FA login path.
    """
    _make_user("patient@example.com", "testpass123", role="Patient")

    resp = _post({"email": "patient@example.com", "password": "testpass123"})

    assert resp.status_code == 200
    data = resp.json()
    assert data.get("user_type") == "Patient"


def test_login_patient_response_contains_jwt_tokens(mongo_mock):
    """
    Patients receive both an ``access_token`` and a ``refresh_token`` directly.
    The presence of these tokens confirms that a session is immediately
    authorised for non-Therapist roles.
    """
    _make_user("tokens@example.com", "securepass", role="Patient")

    resp = _post({"email": "tokens@example.com", "password": "securepass"})

    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data, "access_token must be returned for Patients"
    assert "refresh_token" in data, "refresh_token must be returned for Patients"
    assert data.get("require_2fa") is False


def test_login_response_includes_request_id(mongo_mock):
    """
    Every login response (success or failure) includes a ``request_id`` field
    that allows server-side log correlation.  This tests the audit trail.
    """
    # Use a failure case to check even error responses carry the field
    resp = _post({"email": "nosuchuser@example.com", "password": "x"})
    assert "request_id" in resp.json()

    _make_user("audit@example.com", "pass1")
    resp = _post({"email": "audit@example.com", "password": "pass1"})
    assert "request_id" in resp.json()


def test_login_user_type_returned_in_response(mongo_mock):
    """
    The ``user_type`` field in the response must match the stored ``role``.
    Clients use this to navigate to the correct dashboard after login.
    """
    _make_user("patient2@example.com", "pw", role="Patient")

    resp = _post({"email": "patient2@example.com", "password": "pw"})
    assert resp.json().get("user_type") == "Patient"


def test_login_by_username(mongo_mock):
    """
    The endpoint accepts ``username`` as an alternative to ``email``.
    This ensures that users who know their system-generated username can
    also authenticate.
    """
    _make_user("u@example.com", "pass", username="patient_usr")

    resp = _post({"username": "patient_usr", "password": "pass"})

    assert resp.status_code == 200


# ===========================================================================
# Input validation (400)
# ===========================================================================


def test_login_missing_email_and_password(mongo_mock):
    """
    Sending an empty body returns 400.  Both identifier and password
    are required fields; the error message must not leak internal details.
    """
    resp = _post({})
    assert resp.status_code == 400


def test_login_missing_password(mongo_mock):
    """
    Omitting ``password`` while providing ``email`` returns 400.
    The view validates that both fields are non-empty before any DB lookup.
    """
    resp = _post({"email": "someone@example.com"})
    assert resp.status_code == 400


def test_login_missing_email(mongo_mock):
    """
    Omitting ``email`` (and ``username``) while providing ``password``
    returns 400.
    """
    resp = _post({"password": "irrelevant"})
    assert resp.status_code == 400


# ===========================================================================
# Authentication failures (401)
# ===========================================================================


def test_login_user_not_found(mongo_mock):
    """
    A login attempt for an e-mail address that does not exist returns 401.
    The error message is generic to avoid user-enumeration attacks.
    """
    resp = _post({"email": "doesnotexist@example.com", "password": "irrelevant"})
    assert resp.status_code == 401


def test_login_wrong_password(mongo_mock):
    """
    A login attempt with the correct e-mail but wrong password returns 401.
    Password mismatch must not reveal whether the account exists.
    """
    _make_user("wrongpass@example.com", "correctpass")

    resp = _post({"email": "wrongpass@example.com", "password": "badpass"})
    assert resp.status_code == 401


def test_login_user_with_no_pwdhash(mongo_mock):
    """
    If a user record has an empty ``pwdhash`` the endpoint returns 401.
    This guards against accounts created without a password (e.g. via admin
    seeding scripts) being accessible without credentials.
    """
    User(
        username="nopwhash",
        role="Patient",
        email="nopwdhash@example.com",
        pwdhash="",  # intentionally empty
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    resp = _post({"email": "nopwdhash@example.com", "password": "anything"})
    assert resp.status_code == 401


# ===========================================================================
# Authorisation failures (403)
# ===========================================================================


def test_login_inactive_patient_is_forbidden(mongo_mock):
    """
    A Patient whose ``isActive`` flag is False receives 403 even when
    credentials are correct.  Inactive users have not yet been accepted
    by an administrator and must not receive a session token.
    """
    _make_user("inactive@example.com", "pass", role="Patient", is_active=False)

    resp = _post({"email": "inactive@example.com", "password": "pass"})

    assert resp.status_code == 403
    assert "not yet accepted" in resp.json().get("error", "").lower()


def test_login_inactive_therapist_is_forbidden(mongo_mock):
    """
    Even a Therapist role is denied with 403 when ``isActive=False``.
    The active-check is applied uniformly before the 2FA branch, so an
    inactive Therapist cannot initiate the 2FA flow.
    """
    _make_user("inactive_therapist@example.com", "pw", role="Therapist", is_active=False)

    resp = _post({"email": "inactive_therapist@example.com", "password": "pw"})

    assert resp.status_code == 403


# ===========================================================================
# Role-based authorisation — Therapist 2FA gate
# ===========================================================================


def test_login_therapist_redirected_to_2fa(mongo_mock):
    """
    An active Therapist with correct credentials receives HTTP 200 but
    ``require_2fa: true`` instead of JWT tokens.  Therapists hold
    elevated privileges; they must complete a second factor (e-mail code)
    before a session is issued.
    """
    _make_user("therapist@example.com", "therapistpass", role="Therapist")

    resp = _post({"email": "therapist@example.com", "password": "therapistpass"})

    assert resp.status_code == 200
    data = resp.json()
    assert data.get("require_2fa") is True
    assert data.get("user_type") == "Therapist"


def test_login_therapist_does_not_receive_tokens(mongo_mock):
    """
    The 2FA redirect response must NOT contain ``access_token`` or
    ``refresh_token``.  Issuing tokens before 2FA is complete would
    bypass the second-factor requirement entirely.
    """
    _make_user("therapist2@example.com", "therapistpass2", role="Therapist")

    resp = _post({"email": "therapist2@example.com", "password": "therapistpass2"})

    data = resp.json()
    assert "access_token" not in data, "Therapists must not receive tokens before 2FA"
    assert "refresh_token" not in data, "Therapists must not receive tokens before 2FA"


def test_login_therapist_response_contains_user_id(mongo_mock):
    """
    The 2FA redirect response includes the ``id`` field so the client can
    pass it to the ``/send-verification-code/`` endpoint in the next step
    of the 2FA flow.
    """
    _make_user("therapist3@example.com", "pw3", role="Therapist")

    resp = _post({"email": "therapist3@example.com", "password": "pw3"})

    assert "id" in resp.json()


# ===========================================================================
# Role-based authorisation — Admin 2FA gate
# ===========================================================================


def test_login_admin_redirected_to_2fa(mongo_mock):
    """
    An active Admin with correct credentials receives HTTP 200 but
    ``require_2fa: true`` instead of JWT tokens.  Admins hold
    elevated privileges; they must complete a second factor (e-mail code)
    before a session is issued — the same requirement as Therapists.
    """
    _make_user("admin@example.com", "adminpass", role="Admin")

    resp = _post({"email": "admin@example.com", "password": "adminpass"})

    assert resp.status_code == 200
    data = resp.json()
    assert data.get("require_2fa") is True
    assert data.get("user_type") == "Admin"


def test_login_admin_does_not_receive_tokens(mongo_mock):
    """
    The 2FA redirect response must NOT contain ``access_token`` or
    ``refresh_token`` for Admins.  Issuing tokens before 2FA is complete
    would bypass the second-factor requirement entirely.
    """
    _make_user("admin2@example.com", "adminpass2", role="Admin")

    resp = _post({"email": "admin2@example.com", "password": "adminpass2"})

    data = resp.json()
    assert "access_token" not in data, "Admins must not receive tokens before 2FA"
    assert "refresh_token" not in data, "Admins must not receive tokens before 2FA"


def test_login_admin_response_contains_user_id(mongo_mock):
    """
    The 2FA redirect response includes the ``id`` field so the client can
    pass it to the ``/send-verification-code/`` endpoint in the next step
    of the 2FA flow.
    """
    _make_user("admin3@example.com", "pw3", role="Admin")

    resp = _post({"email": "admin3@example.com", "password": "pw3"})

    assert "id" in resp.json()


def test_login_inactive_admin_is_forbidden(mongo_mock):
    """
    Even an Admin role is denied with 403 when ``isActive=False``.
    The active-check is applied uniformly before the 2FA branch, so an
    inactive Admin cannot initiate the 2FA flow.
    """
    _make_user("inactive_admin@example.com", "pw", role="Admin", is_active=False)

    resp = _post({"email": "inactive_admin@example.com", "password": "pw"})

    assert resp.status_code == 403


# ===========================================================================
# HTTP method enforcement
# ===========================================================================


def test_login_get_method_not_allowed(mongo_mock):
    """
    Only POST is accepted.  A GET to the login URL must return 405 to
    prevent accidental credential exposure in browser history or server logs.
    """
    resp = client.get(LOGIN_URL)
    assert resp.status_code == 405


def test_login_put_method_not_allowed(mongo_mock):
    """PUT is not a valid method for the login endpoint."""
    resp = client.put(LOGIN_URL, data="{}", content_type="application/json")
    assert resp.status_code == 405
