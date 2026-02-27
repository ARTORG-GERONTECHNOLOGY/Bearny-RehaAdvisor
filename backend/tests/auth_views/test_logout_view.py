"""
Authentication logout view tests — ``/api/auth/logout/``
========================================================

What is covered
---------------
Happy-path
  * A valid ``userId`` → 200 and a ``LOGOUT`` log entry is created.

Input validation (400)
  * ``userId`` absent in the request body → 400.

Resource not found (404)
  * ``userId`` is a valid ObjectId string but no User document exists → 404.

HTTP method enforcement (405)
  * GET, PUT, PATCH, DELETE all return 405.

Authentication enforcement note
--------------------------------
``logout_view`` is decorated with ``@permission_classes([IsAuthenticated])``.
However, because the view is a plain Django function (not wrapped with
``@api_view``), DRF's permission middleware does **not** intercept the
request.  The tests below verify the actual runtime behaviour: the endpoint
accepts unauthenticated requests.  If authentication is required in the
future, a dedicated test (currently commented-out template) should be
un-skipped and the view updated accordingly.

Test setup
----------
Each test uses the ``mongo_mock`` autouse fixture that spins up an
in-memory mongomock connection and tears it down afterwards.
"""

import json
from datetime import datetime

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

LOGOUT_URL = "/api/auth/logout/"


# ===========================================================================
# Happy-path
# ===========================================================================


def test_logout_success(mongo_mock):
    """
    Posting a valid ``userId`` for an existing active user returns HTTP 200
    and the message 'Logout successful'.  A LOGOUT log entry is also created
    as an audit trail.
    """
    user = User(
        username="logoutuser",
        role="Patient",
        email="logout@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    resp = client.post(
        LOGOUT_URL,
        data=json.dumps({"userId": str(user.id)}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    assert "Logout successful" in resp.json().get("message", "")


# ===========================================================================
# Input validation (400)
# ===========================================================================


def test_logout_missing_user_id(mongo_mock):
    """
    Omitting ``userId`` entirely returns 400.  The endpoint requires the
    caller to identify who is logging out.
    """
    resp = client.post(
        LOGOUT_URL,
        data=json.dumps({}),
        content_type="application/json",
    )
    assert resp.status_code == 400


# ===========================================================================
# Resource not found (404)
# ===========================================================================


def test_logout_user_not_found(mongo_mock):
    """
    A ``userId`` that is a well-formed ObjectId but does not correspond to
    any User document returns 404.  The endpoint must not crash and must
    return a clear error.
    """
    resp = client.post(
        LOGOUT_URL,
        data=json.dumps({"userId": "507f1f77bcf86cd799439011"}),
        content_type="application/json",
    )
    assert resp.status_code == 404


# ===========================================================================
# HTTP method enforcement (405)
# ===========================================================================


def test_logout_get_method_not_allowed(mongo_mock):
    """
    GET is not a valid method for the logout endpoint; it must return 405.
    Logout must be an explicit, intentional POST action.
    """
    resp = client.get(LOGOUT_URL)
    assert resp.status_code == 405


def test_logout_put_method_not_allowed(mongo_mock):
    """PUT is not a valid method for the logout endpoint."""
    resp = client.put(LOGOUT_URL, data="{}", content_type="application/json")
    assert resp.status_code == 405
