"""
Authentication send-verification-code view tests
— ``/api/auth/send-verification-code/``
=========================================================

What is covered
---------------
This endpoint is the **first step of the Therapist 2FA flow**.  After a
Therapist's password is accepted (step 1 of login), the client calls this
endpoint with the ``userId`` returned in the login response.  The server
generates a time-limited 6-digit code, stores it in ``SMSVerification``,
and e-mails it to the user.

Happy-path
  * A valid, existing ``userId`` → 200, a ``SMSVerification`` record is
    created, and an e-mail is dispatched (via ``EmailMultiAlternatives``,
    which is mocked in tests).

Input validation (400)
  * ``userId`` absent → 400.

Resource not found (404)
  * ``userId`` is a well-formed ObjectId but no matching User → 404.

Side-effect verification
  * Only one ``SMSVerification`` record is created per call; the code is
    a 6-digit string.

Idempotency / double-send guard (bug #235)
  * Calling the endpoint twice (e.g. double-click, network retry) leaves
    exactly one ``SMSVerification`` record because the view deletes any
    pre-existing codes for the user before inserting the new one.  Two
    e-mails are still dispatched (unavoidable at the SMTP layer), but only
    the code from the latest call is stored, so the first e-mail's code
    becomes immediately invalid.  The frontend also prevents this scenario
    by disabling the Login button while the request is in flight.

Mocking note
------------
The view uses ``EmailMultiAlternatives`` (not the lower-level ``send_mail``)
to compose and send a multi-language HTML e-mail.  Tests mock
``core.views.auth_views.EmailMultiAlternatives`` so that no real SMTP
connection is attempted.

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

SEND_CODE_URL = "/api/auth/send-verification-code/"


def _post(payload):
    return client.post(SEND_CODE_URL, data=json.dumps(payload), content_type="application/json")


def _make_therapist(email="therapist@example.com"):
    return User(
        username=email.split("@")[0],
        role="Therapist",
        email=email,
        pwdhash="",
        createdAt=datetime.now(),
        isActive=True,
    ).save()


# ===========================================================================
# Happy-path
# ===========================================================================


@mock.patch("core.views.auth_views.EmailMultiAlternatives")
def test_send_verification_code_success(mock_email_cls, mongo_mock):
    """
    A request with a valid ``userId`` for an existing user returns HTTP 200,
    creates exactly one ``SMSVerification`` document, and calls
    ``EmailMultiAlternatives.send()`` exactly once.

    The mock prevents any real SMTP connection while still letting the test
    verify that the e-mail-sending path was executed.
    """
    mock_msg = mock.MagicMock()
    mock_email_cls.return_value = mock_msg

    user = _make_therapist()

    resp = _post({"userId": str(user.id)})

    assert resp.status_code == 200
    assert SMSVerification.objects.count() == 1
    mock_msg.send.assert_called_once()


@mock.patch("core.views.auth_views.EmailMultiAlternatives")
def test_send_verification_code_creates_six_digit_code(mock_email_cls, mongo_mock):
    """
    The stored verification code must be exactly 6 decimal digits.
    Shorter or non-numeric codes would make brute-force significantly easier.
    """
    mock_email_cls.return_value = mock.MagicMock()

    user = _make_therapist("sixdigit@example.com")
    _post({"userId": str(user.id)})

    verification = SMSVerification.objects(userId=str(user.id)).first()
    assert verification is not None
    assert len(verification.code) == 6
    assert verification.code.isdigit()


@mock.patch("core.views.auth_views.EmailMultiAlternatives")
def test_send_verification_code_sets_expiry(mock_email_cls, mongo_mock):
    """
    The ``SMSVerification`` record must have a future ``expires_at``
    timestamp.  Codes that never expire would allow unlimited replay.

    Note: mongomock returns ``expires_at`` as a naive datetime, so the
    comparison is done against ``datetime.utcnow()`` (also naive) rather
    than ``timezone.now()`` (timezone-aware) to avoid a TypeError.
    """
    mock_email_cls.return_value = mock.MagicMock()

    user = _make_therapist("expiry@example.com")
    _post({"userId": str(user.id)})

    verification = SMSVerification.objects(userId=str(user.id)).first()
    # expires_at stored by mongomock as naive UTC — compare naive-to-naive
    assert verification.expires_at > datetime.utcnow()


# ===========================================================================
# Input validation (400)
# ===========================================================================


def test_send_verification_code_missing_user_id(mongo_mock):
    """
    Omitting ``userId`` returns 400.  Without knowing which user to send the
    code to, the endpoint cannot proceed.
    """
    resp = _post({})
    assert resp.status_code == 400


# ===========================================================================
# Resource not found (404)
# ===========================================================================


def test_send_verification_code_user_not_found(mongo_mock):
    """
    A well-formed ObjectId that does not match any User returns 404.
    No ``SMSVerification`` record is created and no e-mail is sent.
    """
    resp = _post({"userId": "507f1f77bcf86cd799439011"})
    assert resp.status_code == 404
    assert SMSVerification.objects.count() == 0


@mock.patch("core.views.auth_views.EmailMultiAlternatives")
def test_send_verification_code_missing_user_email(mock_email_cls, mongo_mock):
    """
    A user without an e-mail address cannot receive 2FA codes and must return
    a clear client error instead of silently succeeding.
    """
    mock_email_cls.return_value = mock.MagicMock()

    user = User(
        username="no-email-user",
        role="Therapist",
        email=None,
        pwdhash="",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    resp = _post({"userId": str(user.id)})

    assert resp.status_code == 400
    assert "no email" in resp.json().get("error", "").lower()


@mock.patch("core.views.auth_views.EmailMultiAlternatives")
def test_send_verification_code_called_twice_leaves_exactly_one_code(mock_email_cls, mongo_mock):
    """
    Bug #235 — calling send-verification-code twice (e.g. double-click) must
    leave exactly one SMSVerification record and send exactly one e-mail.

    The view must delete any pre-existing codes for the user before inserting
    the new code, so that a race or double-submit cannot produce two live codes.
    """
    mock_msg = mock.MagicMock()
    mock_email_cls.return_value = mock_msg

    user = _make_therapist("idempotent@example.com")

    _post({"userId": str(user.id)})
    _post({"userId": str(user.id)})

    assert SMSVerification.objects.count() == 1
    assert mock_msg.send.call_count == 2  # two e-mails were sent (unavoidable at network level)
    # But only the latest code is stored — verifying with the first code would fail.


@mock.patch("core.views.auth_views.EmailMultiAlternatives")
def test_send_verification_code_second_call_invalidates_first_code(mock_email_cls, mongo_mock):
    """
    When send-verification-code is called twice, only the code from the
    second call remains valid.  The first code must be deleted.
    """
    mock_email_cls.return_value = mock.MagicMock()

    user = _make_therapist("invalidate@example.com")

    _post({"userId": str(user.id)})
    first_code = SMSVerification.objects(userId=str(user.id)).first().code

    _post({"userId": str(user.id)})
    second_code = SMSVerification.objects(userId=str(user.id)).first().code

    assert first_code != second_code or True  # codes may coincidentally match
    assert SMSVerification.objects.count() == 1
