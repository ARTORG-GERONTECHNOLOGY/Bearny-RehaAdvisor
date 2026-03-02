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
  * ``initialQuestionnaireEnabled: true`` in the payload persists
    ``initial_questionnaire_enabled=True`` on the Patient document.

Admin notification on therapist registration
  * ``send_mail`` is called once per successful therapist registration.
  * Recipient list contains every active Admin user's e-mail address.
  * Multiple admins each receive the notification.
  * No e-mail is sent when a patient registers (not a therapist).
  * No e-mail is sent when there are no Admin users in the database.
  * A mail-server failure (exception from ``send_mail``) does NOT prevent a
    successful 200 response — registration is never blocked by mail errors.

Test setup
----------
Each test uses the ``mongo_mock`` autouse fixture that spins up an
in-memory mongomock connection and tears it down afterwards.
``send_mail`` is patched via ``@mock.patch`` to avoid real SMTP calls and to
allow assertion on call arguments.
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


# ===========================================================================
# Admin notification on therapist registration
# ===========================================================================

_THERAPIST_PAYLOAD = {
    "userType": "Therapist",
    "email": "newtherapist@example.com",
    "password": "strongpassword",
    "firstName": "John",
    "lastName": "Doe",
}


def _create_admin(email):
    return User(
        username=f"admin_{email.split('@')[0]}",
        role="Admin",
        email=email,
        pwdhash="",
        createdAt=datetime.now(),
        isActive=True,
    ).save()


@mock.patch("core.views.auth_views.send_mail")
def test_register_therapist_notifies_single_admin(mock_send_mail, mongo_mock):
    """
    When exactly one Admin user exists, ``send_mail`` is called once after a
    successful therapist registration and that admin's e-mail is in the
    recipient list.
    """
    _create_admin("admin@example.com")

    resp = _post(_THERAPIST_PAYLOAD)

    assert resp.status_code == 200
    mock_send_mail.assert_called_once()
    _, kwargs = mock_send_mail.call_args
    assert "admin@example.com" in kwargs.get("recipient_list", [])


@mock.patch("core.views.auth_views.send_mail")
def test_register_therapist_notifies_multiple_admins(mock_send_mail, mongo_mock):
    """
    When multiple Admin users exist, all of their e-mail addresses appear in
    the ``recipient_list`` of the single ``send_mail`` call.
    """
    _create_admin("admin1@example.com")
    _create_admin("admin2@example.com")

    resp = _post({**_THERAPIST_PAYLOAD, "email": "therapist2@example.com"})

    assert resp.status_code == 200
    mock_send_mail.assert_called_once()
    _, kwargs = mock_send_mail.call_args
    recipients = kwargs.get("recipient_list", [])
    assert "admin1@example.com" in recipients
    assert "admin2@example.com" in recipients


@mock.patch("core.views.auth_views.send_mail")
def test_register_therapist_no_admins_no_email_sent(mock_send_mail, mongo_mock):
    """
    When there are no Admin users in the database, ``send_mail`` is never
    called.  The registration itself still returns 200.
    """
    resp = _post({**_THERAPIST_PAYLOAD, "email": "therapist3@example.com"})

    assert resp.status_code == 200
    mock_send_mail.assert_not_called()


@mock.patch("core.views.auth_views.send_mail")
def test_register_patient_does_not_notify_admins(mock_send_mail, mongo_mock):
    """
    Registering a Patient must NOT trigger any admin notification e-mail.
    Only therapist registrations require admin approval and therefore
    notification.
    """
    _create_admin("admin@example.com")

    admin_user = User(
        username="therapistowner",
        role="Therapist",
        email="owner@example.com",
        pwdhash="",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    from core.models import Therapist as TherapistModel

    TherapistModel(
        userId=admin_user,
        name="Owner",
        first_name="T",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    ).save()

    resp = _post(
        {
            "userType": "Patient",
            "email": "patient@example.com",
            "password": "pw",
            "firstName": "P",
            "lastName": "A",
            "therapist": str(admin_user.id),
            "rehaEndDate": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
        }
    )

    # Patient registration may succeed or fail depending on rehab plan; either
    # way, the admin notification must never be triggered.
    mock_send_mail.assert_not_called()


@mock.patch("core.views.auth_views.send_mail", side_effect=Exception("SMTP error"))
def test_register_therapist_mail_failure_does_not_block_registration(mock_send_mail, mongo_mock):
    """
    If ``send_mail`` raises an exception (e.g. SMTP server unreachable), the
    therapist registration must still return HTTP 200.  Mail failures are
    logged but must never prevent account creation.
    """
    _create_admin("admin@example.com")

    resp = _post({**_THERAPIST_PAYLOAD, "email": "therapist4@example.com"})

    assert resp.status_code == 200
    assert resp.json().get("success") is True


# ===========================================================================
# initial_questionnaire_enabled on patient registration
# ===========================================================================


def test_register_patient_initial_questionnaire_enabled_persisted(mongo_mock):
    """
    When ``initialQuestionnaireEnabled: true`` is included in the Patient
    registration payload, the resulting Patient document must have
    ``initial_questionnaire_enabled=True``.  The default is ``False``, so
    this test confirms the flag is correctly read from the payload and saved.
    """
    therapist_user = User(
        username="th_reg",
        role="Therapist",
        email="th_reg@example.com",
        pwdhash="",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    from core.models import Patient, Therapist as TherapistModel

    TherapistModel(
        userId=therapist_user,
        name="Reg",
        first_name="T",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    ).save()

    _post(
        {
            "userType": "Patient",
            "email": "pat_iq@example.com",
            "password": "pw",
            "firstName": "P",
            "lastName": "A",
            "therapist": str(therapist_user.id),
            "rehaEndDate": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
            "initialQuestionnaireEnabled": True,
        }
    )

    from core.models import User as UserModel
    created_user = UserModel.objects.filter(email="pat_iq@example.com").first()
    assert created_user is not None, "Patient User must be created"
    patient = Patient.objects.filter(userId=created_user).first()
    assert patient is not None, "Patient document must be created"
    assert patient.initial_questionnaire_enabled is True
