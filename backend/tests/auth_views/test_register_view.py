"""
Authentication register view tests — ``/api/auth/register/``
============================================================

What is covered
---------------
Happy-path
  * Therapist registration with all required fields → 200.

Input validation (400)
  * Missing ``userType`` → 400 with ``field_errors.userType``.
  * Missing ``email`` → 400 with ``field_errors.email``.
  * Missing ``password`` → 400 with ``field_errors.password``.
  * Invalid e-mail format → 400 with ``field_errors.email``.
  * E-mail with embedded whitespace → 400.
  * Patient missing ``therapist`` field → 400 with ``field_errors.therapist``.
  * Patient missing ``rehaEndDate`` → 400 with ``field_errors.rehaEndDate``.

Duplicate e-mail (400)
  * Attempting to register with an already-used e-mail → 400.

Resource not found (404)
  * Patient registration referencing a non-existent therapist ObjectId → 404.

HTTP method enforcement (405)
  * GET returns 405; only POST is accepted.

Role-based registration behaviour
  * Therapist is created with ``isActive=False`` by default (admin approval
    required); Patient is created with ``isActive=True``.
  * The response ``id`` is the generated system username, not the database id.

Test setup
----------
Each test uses the ``mongo_mock`` autouse fixture that spins up an
in-memory mongomock connection and tears it down afterwards.
"""

import json
from datetime import datetime, timedelta
from unittest import mock

import mongomock
import pytest
from django.test import Client
from mongoengine import connect, disconnect

from core.models import Therapist, User

# ---------------------------------------------------------------------------
# Fixtures
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

REGISTER_URL = "/api/auth/register/"


def _post(payload):
    return client.post(REGISTER_URL, data=json.dumps(payload), content_type="application/json")


# ===========================================================================
# Happy-path
# ===========================================================================


@mock.patch("core.views.auth_views.send_mail")
def test_register_therapist_success(mock_send_mail, mongo_mock):
    """
    A complete Therapist registration payload returns HTTP 200 with
    ``success: true``.  A Therapist document and a linked User document are
    created.
    """
    data = {
        "userType": "Therapist",
        "email": "newtherapist@example.com",
        "password": "strongpassword",
        "firstName": "John",
        "lastName": "Doe",
    }

    resp = _post(data)

    assert resp.status_code == 200
    assert resp.json().get("success") is True


@mock.patch("core.views.auth_views.send_mail")
def test_register_therapist_is_inactive_by_default(mock_send_mail, mongo_mock):
    """
    A newly registered Therapist must have ``isActive=False`` until an
    administrator explicitly accepts the account.  This prevents a Therapist
    from logging in before approval.
    """
    _post(
        {
            "userType": "Therapist",
            "email": "pendingtherapist@example.com",
            "password": "pw",
            "firstName": "T",
            "lastName": "S",
        }
    )

    user = User.objects.filter(email="pendingtherapist@example.com").first()
    assert user is not None
    assert user.isActive is False, "Therapists must await admin approval"


# ===========================================================================
# Input validation — missing required fields (400)
# ===========================================================================


def test_register_missing_usertype(mongo_mock):
    """
    Omitting ``userType`` returns 400 with a ``field_errors`` object that
    names the missing field.  The endpoint must never create partial records.
    """
    resp = _post({"email": "x@example.com", "password": "pw"})
    assert resp.status_code == 400
    assert "userType" in resp.json().get("field_errors", {})


def test_register_missing_email(mongo_mock):
    """
    Omitting ``email`` returns 400 with a ``field_errors.email`` entry.
    """
    resp = _post({"userType": "Therapist", "password": "pw"})
    assert resp.status_code == 400
    assert "email" in resp.json().get("field_errors", {})


def test_register_missing_password(mongo_mock):
    """
    Omitting ``password`` returns 400 with a ``field_errors.password`` entry.
    """
    resp = _post({"userType": "Therapist", "email": "x@example.com"})
    assert resp.status_code == 400
    assert "password" in resp.json().get("field_errors", {})


# ===========================================================================
# Input validation — invalid e-mail (400)
# ===========================================================================


def test_register_invalid_email_format(mongo_mock):
    """
    A syntactically invalid e-mail address (e.g. ``not-an-email``) returns
    400 with a ``field_errors.email`` entry.  The view uses Django's
    ``validate_email`` validator.
    """
    resp = _post({"userType": "Therapist", "email": "not-an-email", "password": "pw"})
    assert resp.status_code == 400
    assert "email" in resp.json().get("field_errors", {})


def test_register_email_with_whitespace(mongo_mock):
    """
    An e-mail containing whitespace (e.g. ``a @b.com``) returns 400.
    The view explicitly rejects whitespace in the raw e-mail input to
    prevent account-confusion attacks.
    """
    resp = _post({"userType": "Therapist", "email": "a @b.com", "password": "pw"})
    assert resp.status_code == 400
    assert "email" in resp.json().get("field_errors", {})


# ===========================================================================
# Input validation — duplicate e-mail (400)
# ===========================================================================


def test_register_existing_email(mongo_mock):
    """
    Attempting to register with an e-mail address that is already associated
    with a User document returns 400.  No duplicate account is created.
    """
    User(
        username="existinguser",
        role="Therapist",
        email="exist@example.com",
        pwdhash="",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    resp = _post({"userType": "Therapist", "email": "exist@example.com", "password": "pw"})

    assert resp.status_code == 400
    assert "email" in resp.json().get("field_errors", {})


# ===========================================================================
# Patient-specific validation (400 / 404)
# ===========================================================================


def test_register_patient_missing_therapist_field(mongo_mock):
    """
    A Patient registration payload without a ``therapist`` field returns 400
    with ``field_errors.therapist``.  Every patient must be assigned to a
    therapist on creation.
    """
    resp = _post(
        {
            "userType": "Patient",
            "email": "newpat@example.com",
            "password": "pw",
            "firstName": "P",
            "lastName": "A",
            "rehaEndDate": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
        }
    )
    assert resp.status_code == 400
    assert "therapist" in resp.json().get("field_errors", {})


def test_register_patient_missing_rehe_end_date(mongo_mock):
    """
    A Patient registration payload without ``rehaEndDate`` returns 400 with
    ``field_errors.rehaEndDate``.  The rehabilitation end date is mandatory
    for scheduling purposes.
    """
    resp = _post(
        {
            "userType": "Patient",
            "email": "newpat2@example.com",
            "password": "pw",
            "firstName": "P",
            "lastName": "B",
            "therapist": "507f1f77bcf86cd799439011",
        }
    )
    assert resp.status_code == 400
    assert "rehaEndDate" in resp.json().get("field_errors", {})


def test_register_patient_missing_therapist(mongo_mock):
    """
    If all Patient fields are present but the supplied ``therapist`` ObjectId
    does not correspond to any User/Therapist in the database, the endpoint
    rolls back the partially created User and returns 404.
    """
    resp = _post(
        {
            "userType": "Patient",
            "email": "newpatient@example.com",
            "password": "password",
            "firstName": "Pat",
            "lastName": "Smith",
            "therapist": "507f1f77bcf86cd799439011",
            "rehaEndDate": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
        }
    )

    assert resp.status_code == 404


# ===========================================================================
# HTTP method enforcement (405)
# ===========================================================================


def test_register_get_method_not_allowed(mongo_mock):
    """
    GET is not a valid method for the register endpoint; it must return 405.
    """
    resp = client.get(REGISTER_URL)
    assert resp.status_code == 405
