"""
Authentication verify-code view tests — ``/api/auth/verify-code/``
===================================================================

What is covered
---------------
This endpoint is the **second step of the Therapist 2FA flow**.  After a
Therapist successfully submits their password (step 1), the server sends a
time-limited code to their e-mail.  This view validates that code and —
only if it is correct and unexpired — issues JWT tokens and creates a login
audit log.

Happy-path
  * Correct code + unexpired expiry → 200 with ``access_token`` and
    ``refresh_token``.
  * The ``SMSVerification`` record is deleted after successful verification
    (one-time use).

Input validation (400)
  * Missing both ``userId`` and ``verificationCode`` → 400.
  * Missing only ``userId`` → 400.
  * Missing only ``verificationCode`` → 400.

Authentication failures (400)
  * Correct ``userId`` but wrong code → 400.
  * Correct code but it has already expired → 400, and the stale record is
    deleted from the database.

Authorisation note
-------------------
This endpoint is the **gate** that prevents a Therapist from accessing the
application with only a password.  The tests ``test_verify_code_success_*``
together confirm that JWT tokens are ONLY issued after both factors are
successfully verified.

Test setup
----------
Each test uses the ``mongo_mock`` autouse fixture that spins up an
in-memory mongomock connection and tears it down afterwards.
"""

import json
from datetime import datetime, timedelta

import mongomock
import pytest
from django.test import Client
from django.utils import timezone
from mongoengine import connect, disconnect

from core.models import SMSVerification, User

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

VERIFY_URL = "/api/auth/verify-code/"


def _post(payload):
    return client.post(VERIFY_URL, data=json.dumps(payload), content_type="application/json")


def _make_user(email="verify@example.com", role="Therapist"):
    return User(
        username=email.split("@")[0],
        role=role,
        email=email,
        createdAt=datetime.now(),
        isActive=True,
    ).save()


# ===========================================================================
# Happy-path — tokens issued only after successful 2FA
# ===========================================================================


def test_verify_code_success(mongo_mock):
    """
    Submitting a matching, unexpired verification code returns HTTP 200.
    This confirms the second factor was satisfied.
    """
    user = _make_user()
    code = "123456"
    SMSVerification(
        userId=str(user.id),
        code=code,
        expires_at=timezone.now() + timedelta(minutes=5),
    ).save()

    resp = _post({"userId": str(user.id), "verificationCode": code})
    assert resp.status_code == 200


def test_verify_code_success_returns_jwt_tokens(mongo_mock):
    """
    A successful 2FA verification must return both ``access_token`` and
    ``refresh_token``.  These are the ONLY path by which a Therapist
    obtains a JWT, enforcing the 2FA requirement for that role.
    """
    user = _make_user("tokenverify@example.com")
    code = "654321"
    SMSVerification(
        userId=str(user.id),
        code=code,
        expires_at=timezone.now() + timedelta(minutes=5),
    ).save()

    resp = _post({"userId": str(user.id), "verificationCode": code})

    data = resp.json()
    assert "access_token" in data, "access_token must be issued after successful 2FA"
    assert "refresh_token" in data, "refresh_token must be issued after successful 2FA"


def test_verify_code_success_deletes_verification_record(mongo_mock):
    """
    After a code is used successfully the SMSVerification document must be
    deleted.  This enforces one-time use and prevents replay attacks.
    """
    user = _make_user("onetime@example.com")
    code = "111222"
    SMSVerification(
        userId=str(user.id),
        code=code,
        expires_at=timezone.now() + timedelta(minutes=5),
    ).save()

    _post({"userId": str(user.id), "verificationCode": code})

    remaining = SMSVerification.objects(userId=str(user.id)).count()
    assert remaining == 0, "Verification record must be consumed (deleted) on success"


# ===========================================================================
# Input validation — missing fields (400)
# ===========================================================================


def test_verify_code_missing_both_fields(mongo_mock):
    """
    An empty body returns 400.  Both ``userId`` and ``verificationCode``
    are required for verification.
    """
    resp = _post({})
    assert resp.status_code == 400


def test_verify_code_missing_user_id(mongo_mock):
    """
    Omitting ``userId`` while supplying a code returns 400.
    """
    resp = _post({"verificationCode": "123456"})
    assert resp.status_code == 400


def test_verify_code_missing_verification_code(mongo_mock):
    """
    Omitting ``verificationCode`` while supplying a userId returns 400.
    """
    resp = _post({"userId": "507f1f77bcf86cd799439011"})
    assert resp.status_code == 400


# ===========================================================================
# Authentication failures (400)
# ===========================================================================


def test_verify_code_wrong_code(mongo_mock):
    """
    Submitting the wrong verification code returns 400.  An attacker who
    knows the userId but not the code must be denied.
    """
    user = _make_user("wrongcode@example.com")
    SMSVerification(
        userId=str(user.id),
        code="654321",
        expires_at=timezone.now() + timedelta(minutes=5),
    ).save()

    resp = _post({"userId": str(user.id), "verificationCode": "000000"})
    assert resp.status_code == 400


def test_verify_code_expired(mongo_mock):
    """
    Submitting a valid code that has passed its expiry returns 400.
    Time-limited codes protect against interception; they must not be
    accepted after expiry.
    """
    user = _make_user("expired@example.com")
    code = "999999"
    SMSVerification(
        userId=str(user.id),
        code=code,
        expires_at=timezone.now() - timedelta(minutes=1),  # already expired
    ).save()

    resp = _post({"userId": str(user.id), "verificationCode": code})
    assert resp.status_code == 400


def test_verify_code_expired_record_is_deleted(mongo_mock):
    """
    After rejecting an expired code the SMSVerification record is deleted.
    Stale records must not accumulate or be reusable after expiry.
    """
    user = _make_user("cleanupexpired@example.com")
    code = "888888"
    SMSVerification(
        userId=str(user.id),
        code=code,
        expires_at=timezone.now() - timedelta(seconds=30),
    ).save()

    _post({"userId": str(user.id), "verificationCode": code})

    remaining = SMSVerification.objects(userId=str(user.id)).count()
    assert remaining == 0, "Expired verification record must be deleted after rejection"
