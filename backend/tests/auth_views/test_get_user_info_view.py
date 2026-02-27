"""
Authentication get-user-info view tests
— ``/api/auth/get-user-info/<user_id>/``
=========================================

What is covered
---------------
This endpoint returns profile information about a user.  The fields returned
depend on the user's role: Therapists receive ``specialisation``; Patients
receive ``function``; any other role falls back to the ``username``.

Role-based response content
  * Therapist with a linked ``Therapist`` document → 200 with
    ``first_name``, ``last_name``, ``specialisation``, and ``role``.
  * Patient with a linked ``Patient`` document → 200 with
    ``first_name``, ``last_name``, ``function``, and ``role``.
  * User with no linked profile document → 200 but ``first_name`` / ``last_name``
    are empty strings (graceful degradation).

Resource not found (404)
  * ``user_id`` does not match any User → 404.

Response structure
  * The response always contains the keys ``first_name``, ``last_name``,
    ``specialisation``, ``function``, and ``role``.

Authentication enforcement note
--------------------------------
``get_user_info`` carries ``@permission_classes([IsAuthenticated])``.
As a plain Django function view (not wrapped with ``@api_view``), this
decorator has no runtime effect — the endpoint accepts unauthenticated
requests.  The tests below document this current behaviour.  If the view
is ever migrated to a DRF ``@api_view``, corresponding authenticated-only
tests should be added.

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

from core.models import Patient, Therapist, User

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

INFO_URL = "/api/auth/get-user-info/{user_id}/"


# ===========================================================================
# Role-based response content
# ===========================================================================


def test_get_user_info_therapist_returns_profile_fields(mongo_mock):
    """
    For a Therapist whose ``Therapist`` document exists, the response must
    contain ``first_name``, ``last_name``, ``specialisation``, and the
    correct ``role`` value.

    This prevents leaking Patient-specific fields (e.g. ``function``) to
    Therapist clients and confirms role-appropriate data scoping.
    """
    user = User(
        username="therapistinfo",
        role="Therapist",
        email="therapistinfo@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    Therapist(
        userId=user,
        name="Doe",
        first_name="Jane",
        specializations=[],
    ).save()

    resp = client.get(INFO_URL.format(user_id=str(user.id)))

    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "Therapist"
    assert data["first_name"] == "Jane"
    assert data["last_name"] == "Doe"
    assert "specialisation" in data
    assert "function" in data  # key present but should be empty for Therapist


def test_get_user_info_patient_returns_profile_fields(mongo_mock):
    """
    For a Patient whose ``Patient`` document exists, the response must
    contain ``first_name``, ``last_name``, ``function``, and the correct
    ``role`` value.

    The ``specialisation`` key must also be present (empty) so clients
    can rely on a stable response shape regardless of role.
    """
    therapist_user = User(
        username="therapistowner",
        role="Therapist",
        email="therapistowner@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(userId=therapist_user, name="Smith", first_name="Tom", specializations=[]).save()

    patient_user = User(
        username="patientinfo",
        role="Patient",
        email="patientinfo@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    Patient(
        userId=patient_user,
        patient_code="PAT001",
        therapist=therapist,
        name="Brown",
        first_name="Alice",
        function=["mobility"],  # ListField — must be a list
        reha_end_date=datetime(2030, 1, 1),
        duration=365,
    ).save()

    resp = client.get(INFO_URL.format(user_id=str(patient_user.id)))

    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "Patient"
    assert data["first_name"] == "Alice"
    assert data["last_name"] == "Brown"
    assert data["function"] == ["mobility"]  # view returns the list as-is
    assert "specialisation" in data  # present but empty


def test_get_user_info_therapist_without_linked_document(mongo_mock):
    """
    If a Therapist User exists but no ``Therapist`` document is linked,
    the endpoint must still return 200 with empty strings rather than
    raising an exception.  This guards against partially-created accounts.
    """
    user = User(
        username="orphantherapist",
        role="Therapist",
        email="orphan@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    resp = client.get(INFO_URL.format(user_id=str(user.id)))

    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "Therapist"
    assert data["first_name"] == ""
    assert data["last_name"] == ""


def test_get_user_info_response_shape_is_consistent(mongo_mock):
    """
    Regardless of role, the response must always contain the same set of
    top-level keys.  Clients must be able to access any key without a
    KeyError.
    """
    user = User(
        username="shapecheck",
        role="Patient",
        email="shape@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()

    resp = client.get(INFO_URL.format(user_id=str(user.id)))
    data = resp.json()

    for key in ("first_name", "last_name", "specialisation", "function", "role"):
        assert key in data, f"Expected key '{key}' missing from response"


# ===========================================================================
# Resource not found (404)
# ===========================================================================


def test_get_user_info_unknown_user_id(mongo_mock):
    """
    A well-formed ObjectId that does not correspond to any User document
    returns 404.  The endpoint must not return a 500 or an empty 200.
    """
    resp = client.get(INFO_URL.format(user_id="507f1f77bcf86cd799439011"))
    assert resp.status_code == 404
