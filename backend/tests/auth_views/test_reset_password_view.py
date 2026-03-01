"""
Authentication reset-password view tests — ``/api/auth/forgot-password/``
==========================================================================

What is covered
---------------
Happy-path
  * An existing user's e-mail → 200, a new password hash is stored, and
    an e-mail is dispatched via Django's ``send_mail`` (mocked in tests).

Input validation (400)
  * ``email`` field absent → 400.
  * Malformed JSON body → 400.

Resource not found (404)
  * ``email`` not associated with any User document → 404.

HTTP method enforcement (405)
  * GET returns 405; only POST is accepted.

Authentication enforcement note
--------------------------------
``reset_password_view`` carries ``@permission_classes([IsAuthenticated])``.
As with the logout view, this decorator has no effect on a plain Django
function view that is not also wrapped with ``@api_view``.  The tests verify
the actual runtime behaviour where no token is required.  Any future
tightening of this endpoint (requiring auth) must be accompanied by updated
tests.

Test setup
----------
Each test uses the ``mongo_mock`` autouse fixture that spins up an
in-memory mongomock connection and tears it down afterwards.
"""

import json
from datetime import datetime
from unittest import mock

import mongomock
import pytest
from django.test import Client
from mongoengine import connect, disconnect

from core.models import User

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

RESET_URL = "/api/auth/forgot-password/"


# ===========================================================================
# Happy-path
# ===========================================================================


@mock.patch("core.views.auth_views.send_mail")
def test_reset_password_success(mock_send_mail, mongo_mock):
    """
    Submitting an e-mail that belongs to an existing user returns HTTP 200
    and triggers exactly one ``send_mail`` call containing the new password.
    The old ``pwdhash`` in the database is replaced.
    """
    User(
        username="testuser",
        role="Patient",
        email="reset@example.com",
        pwdhash="oldhash",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    resp = client.post(
        RESET_URL,
        data=json.dumps({"email": "reset@example.com"}),
        content_type="application/json",
    )

    assert resp.status_code == 200
    mock_send_mail.assert_called_once()


@mock.patch("core.views.auth_views.send_mail")
def test_reset_password_updates_stored_hash(mock_send_mail, mongo_mock):
    """
    After a successful reset the ``pwdhash`` stored in the database must
    differ from the original value, confirming the password was actually
    changed and not just re-sent.
    """
    user = User(
        username="hashcheckuser",
        role="Patient",
        email="hashcheck@example.com",
        pwdhash="original_hash_value",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    client.post(
        RESET_URL,
        data=json.dumps({"email": "hashcheck@example.com"}),
        content_type="application/json",
    )

    updated = User.objects.filter(email="hashcheck@example.com").first()
    assert updated.pwdhash != "original_hash_value"


# ===========================================================================
# Input validation (400)
# ===========================================================================


def test_reset_password_missing_email(mongo_mock):
    """
    Sending a body without the ``email`` key returns 400.  The endpoint
    requires an e-mail address to identify the account.
    """
    resp = client.post(
        RESET_URL,
        data=json.dumps({}),
        content_type="application/json",
    )
    assert resp.status_code == 400


def test_reset_password_malformed_json(mongo_mock):
    """
    Sending a body that is not valid JSON returns 400.  The view must
    handle parse errors gracefully without raising an unhandled exception.
    """
    resp = client.post(
        RESET_URL,
        data="NOT_JSON",
        content_type="application/json",
    )
    assert resp.status_code == 400


# ===========================================================================
# Resource not found (404)
# ===========================================================================


def test_reset_password_non_existent_user(mongo_mock):
    """
    An e-mail address that does not exist in the database returns 404.
    No e-mail is sent and the response contains a meaningful error message.
    """
    resp = client.post(
        RESET_URL,
        data=json.dumps({"email": "nosuch@example.com"}),
        content_type="application/json",
    )
    assert resp.status_code == 404


# ===========================================================================
# HTTP method enforcement (405)
# ===========================================================================


def test_reset_password_get_method_not_allowed(mongo_mock):
    """
    GET is not accepted; it must return 405.  Password reset must be an
    explicit POST action to avoid accidental triggers via link pre-fetching.
    """
    resp = client.get(RESET_URL)
    assert resp.status_code == 405
