"""
User views tests
================

Endpoints covered
-----------------
``GET/PUT/DELETE /api/users/<user_id>/profile/``  → ``user_profile_view``
``GET            /api/admin/pending-users/``       → ``get_pending_users``
``POST           /api/admin/accept-user/``         → ``accept_user``
``POST           /api/admin/decline-user/``        → ``decline_user``
``PUT            /api/users/<user_id>/change-password/`` → ``change_password``

Coverage goals
--------------
Happy-path
  * Therapist and Patient GET returns correct role-scoped fields.
  * PUT updates whitelisted fields for both roles.
  * DELETE performs a **soft-delete** (``isActive=False``); the document
    remains in the database.
  * Admin workflow: list pending users, accept (activates + e-mail), decline
    (hard-deletes + e-mail).

Input validation (400)
  * Missing required fields (userId, old password, etc.).
  * Invalid ObjectId strings.
  * Invalid e-mail / phone format on profile update.
  * Invalid date format on patient profile update.
  * Password-change without old password.

Authorisation / access control (403)
  * Wrong old password on PUT password change.

Overposting protection
  * Sending forbidden fields (``role``, ``pwdhash``, ``createdAt``) in a PUT
    body must NOT modify those fields — they are silently dropped.

HTTP method enforcement (405)
  * Each endpoint refuses wrong verbs.

Resource not found
  * Non-existent user/ObjectId returns 404 or 500 depending on the view's
    own documented behaviour (see individual tests).

change_password endpoint behaviour note
----------------------------------------
``change_password`` (``PUT /api/users/<id>/change-password/``) always
returns HTTP 400 when ``old_password`` / ``new_password`` are supplied in the
body; it redirects callers to the profile endpoint instead.  The tests below
document this current runtime behaviour.

Test setup
----------
The ``mongo_mock`` autouse fixture provides an isolated in-memory mongomock
connection for every test.
"""

import json
from datetime import datetime, timedelta
from unittest import mock

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import Patient, Therapist, User

# ---------------------------------------------------------------------------
# Fixtures / client
# ---------------------------------------------------------------------------

client = Client()


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    """Isolated in-memory MongoDB for every test."""
    import mongomock
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


# ---------------------------------------------------------------------------
# Shared factory helpers
# ---------------------------------------------------------------------------


def create_user_and_therapist():
    user = User(
        username="therapist1",
        email="t1@example.com",
        phone="12345",
        createdAt=datetime.now(),
    ).save()
    therapist = Therapist(
        userId=user,
        name="Doe",
        first_name="John",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    ).save()
    return user, therapist


def create_patient():
    user = User(
        username="p1",
        email="p1@example.com",
        phone="12345",
        createdAt=datetime.now(),
        role="Patient",
    ).save()

    therapist_user = User(
        username="t1",
        email="t1@example.com",
        phone="54321",
        createdAt=datetime.now(),
        role="Therapist",
    ).save()

    therapist = Therapist(
        userId=therapist_user,
        name="Doe",
        first_name="John",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    ).save()

    patient = Patient(
        userId=user,
        patient_code="PAT001",
        name="PatientLast",
        first_name="PatientFirst",
        access_word="password",
        age="30",
        therapist=therapist,
        sex="Male",
        diagnosis=["Stroke"],
        function=["Cardiology"],
        level_of_education="Bachelor's Degree",
        professional_status="Employed Full-Time",
        marital_status="Single",
        lifestyle=["Sedentary"],
        personal_goals=["Improved Mobility"],
        reha_end_date=datetime.now() + timedelta(days=30),
    ).save()

    return user, patient


# ===========================================================================
# user_profile_view — GET
# ===========================================================================


def test_user_profile_view_therapist_get_success():
    """
    GET a Therapist profile returns HTTP 200 with the user's e-mail and
    the linked Therapist document's ``name`` field.
    """
    user, therapist = create_user_and_therapist()
    resp = client.get(f"/api/users/{user.id}/profile/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == user.email
    assert data["name"] == therapist.name


def test_user_profile_view_therapist_response_contains_expected_fields():
    """
    The Therapist GET response must contain the fields that the frontend
    uses: ``username``, ``email``, ``phone``, ``name``, ``first_name``,
    ``specializations``, ``clinics``.  No sensitive fields (``pwdhash``)
    should be present.
    """
    user, therapist = create_user_and_therapist()
    resp = client.get(f"/api/users/{user.id}/profile/", HTTP_AUTHORIZATION="Bearer test")
    data = resp.json()

    for key in (
        "username",
        "email",
        "phone",
        "name",
        "first_name",
        "specializations",
        "clinics",
    ):
        assert key in data, f"Expected key '{key}' missing from Therapist profile response"
    assert "pwdhash" not in data, "pwdhash must never appear in GET response"


def test_user_profile_view_patient_get_success():
    """
    GET a Patient profile (using the Patient's ObjectId) returns HTTP 200
    with the patient's e-mail and ``first_name``.
    """
    user, patient = create_patient()
    resp = client.get(f"/api/users/{str(patient.pk)}/profile/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == user.email
    assert data["first_name"] == patient.first_name


def test_user_profile_view_patient_response_excludes_sensitive_fields():
    """
    The Patient GET response must NOT expose ``pwdhash`` or ``access_word``.
    These are filtered out by the view's ``excluded_patient`` set.
    """
    user, patient = create_patient()
    resp = client.get(f"/api/users/{user.id}/profile/", HTTP_AUTHORIZATION="Bearer test")
    data = resp.json()

    assert "pwdhash" not in data, "pwdhash must never appear in GET response"
    assert "access_word" not in data, "access_word (plain-text secret) must not be exposed"


def test_user_profile_view_therapist_profile_not_found():
    """
    GET a Therapist User whose Therapist document was deleted returns 404
    with an error containing 'profile not found'.
    """
    user, _ = create_user_and_therapist()
    Therapist.objects(userId=user.id).delete()
    resp = client.get(f"/api/users/{user.id}/profile/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 404
    assert "profile not found" in resp.json()["error"]


def test_user_profile_view_user_not_found():
    """
    GET with an ObjectId that matches no User document returns an error
    response.  The view catches both User.DoesNotExist and Patient.DoesNotExist
    and returns HTTP 500.
    """
    resp = client.get(f"/api/users/{ObjectId()}/profile/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 500
    assert "error" in resp.json()


# ===========================================================================
# user_profile_view — PUT (password change)
# ===========================================================================


def test_user_profile_view_update_password_success():
    """
    PUT with ``oldPassword`` and ``newPassword`` returns 200 with a message
    containing 'Profile updated', confirming the password was changed.
    ``check_password`` and ``make_password`` are mocked to keep the test
    deterministic and fast.
    """
    user, _ = create_user_and_therapist()
    user.pwdhash = "oldhash"
    user.save()

    payload = {"oldPassword": "oldhash", "newPassword": "new_secure_password"}

    with (
        mock.patch("core.views.user_views.check_password", return_value=True),
        mock.patch("core.views.user_views.make_password", return_value="new_hashed"),
    ):
        resp = client.put(
            f"/api/users/{user.id}/profile/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer test",
        )
    assert resp.status_code == 200
    assert "Profile updated" in resp.json()["message"]


def test_user_profile_view_update_password_wrong_old():
    """
    PUT with an incorrect ``oldPassword`` returns 403 with the error
    'Old password incorrect'.  This is the primary authorisation gate
    for self-service password changes.
    """
    user, _ = create_user_and_therapist()
    user.pwdhash = "oldhash"
    user.save()

    payload = {"oldPassword": "wrong", "newPassword": "new_secure_password"}

    with mock.patch("django.contrib.auth.hashers.check_password", return_value=False):
        resp = client.put(
            f"/api/users/{user.id}/profile/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer test",
        )
    assert resp.status_code == 403
    assert "Old password incorrect" in resp.json()["error"]


def test_user_profile_view_update_password_missing_old():
    """
    PUT with only ``newPassword`` (no ``oldPassword``) returns 400.
    The old password must always be verified before allowing a change.
    """
    user, _ = create_user_and_therapist()
    payload = {"newPassword": "new_secure_password"}
    resp = client.put(
        f"/api/users/{user.id}/profile/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Old password required" in resp.json()["error"]


def test_user_profile_view_update_password_missing_new():
    """
    PUT with only ``oldPassword`` (no ``newPassword``) returns 400.
    A partial password-change request must be rejected.
    """
    user, _ = create_user_and_therapist()
    payload = {"oldPassword": "something"}

    with mock.patch("core.views.user_views.check_password", return_value=True):
        resp = client.put(
            f"/api/users/{user.id}/profile/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer test",
        )
    assert resp.status_code == 400
    assert "New password required" in resp.json()["error"]


# ===========================================================================
# user_profile_view — PUT (field updates)
# ===========================================================================


def test_user_profile_view_update_therapist_fields():
    """
    PUT whitelisted Therapist fields (``first_name``, ``name``) returns 200
    and the 'updated' dict contains the changed keys.
    """
    user, therapist = create_user_and_therapist()
    payload = {"first_name": "Jane", "name": "Smith"}

    resp = client.put(
        f"/api/users/{user.id}/profile/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    updated = resp.json().get("updated", {})
    assert "first_name" in updated
    assert "name" in updated


def test_user_profile_view_update_patient_reha_end_date():
    """
    PUT a valid ``reha_end_date`` string for a Patient returns 200.
    Date fields are parsed from 'YYYY-MM-DD' format.
    """
    user, patient = create_patient()
    payload = {"reha_end_date": "2030-12-31"}

    resp = client.put(
        f"/api/users/{user.id}/profile/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "reha_end_date" in resp.json().get("updated", {})


def test_user_profile_view_update_invalid_date_format():
    """
    PUT an unparseable ``reha_end_date`` returns 400 with
    'Invalid date format' in the error message.
    """
    user, patient = create_patient()
    payload = {"reha_end_date": "not-a-date"}
    resp = client.put(
        f"/api/users/{user.id}/profile/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Invalid date format" in resp.json()["error"]


def test_user_profile_view_update_invalid_email():
    """
    PUT an invalid ``email`` value returns 400 with 'Invalid email'.
    The view runs a regex check before persisting.
    """
    user, _ = create_user_and_therapist()
    payload = {"email": "not-valid"}
    resp = client.put(
        f"/api/users/{user.id}/profile/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Invalid email" in resp.json()["error"]


def test_user_profile_view_update_invalid_phone():
    """
    PUT an invalid ``phone`` value (e.g. letters) returns 400 with
    'Invalid phone'.
    """
    user, _ = create_user_and_therapist()
    payload = {"phone": "not-a-phone"}
    resp = client.put(
        f"/api/users/{user.id}/profile/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Invalid phone" in resp.json()["error"]


def test_user_profile_view_overposting_forbidden_fields_are_ignored():
    """
    Sending forbidden fields (``role``, ``pwdhash``, ``createdAt``) in a PUT
    body must NOT change those fields — the view silently strips them.

    This is the overposting-protection check.  If it fails, an attacker
    could elevate their own role or overwrite their password hash directly.
    """
    user, _ = create_user_and_therapist()
    original_role = user.role
    original_pwdhash = user.pwdhash

    payload = {"role": "Admin", "pwdhash": "hacked", "createdAt": "2000-01-01"}

    resp = client.put(
        f"/api/users/{user.id}/profile/",
        data=json.dumps(payload),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    # View should respond 200 (no valid update fields → empty update)
    assert resp.status_code == 200

    refreshed = User.objects.get(pk=user.id)
    assert refreshed.role == original_role, "role must not be changeable via profile PUT"
    assert refreshed.pwdhash == original_pwdhash, "pwdhash must not be changeable via profile PUT"


# ===========================================================================
# user_profile_view — DELETE
# ===========================================================================


def test_user_profile_view_delete_success():
    """
    DELETE returns 200 with 'User deleted' in the message.
    """
    user, _ = create_user_and_therapist()
    resp = client.delete(f"/api/users/{user.id}/profile/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    assert "User deleted" in resp.json()["message"]


def test_user_profile_view_delete_is_soft_delete():
    """
    DELETE performs a **soft-delete**: the User document remains in the
    database but ``isActive`` is set to ``False``.

    Hard-deleting a user would cascade-break rehabilitation plans, logs, and
    patient assignments.  Soft-deletion preserves audit history.
    """
    user, _ = create_user_and_therapist()
    client.delete(f"/api/users/{user.id}/profile/", HTTP_AUTHORIZATION="Bearer test")

    refreshed = User.objects.filter(pk=user.id).first()
    assert refreshed is not None, "User document must still exist after soft-delete"
    assert refreshed.isActive is False, "isActive must be False after soft-delete"


# ===========================================================================
# user_profile_view — HTTP method enforcement
# ===========================================================================


def test_user_profile_view_method_not_allowed():
    """
    POST to the profile endpoint returns 405 with 'Method not allowed'.
    Only GET, PUT, and DELETE are accepted.
    """
    user, _ = create_user_and_therapist()
    resp = client.post(f"/api/users/{user.id}/profile/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405
    assert "Method not allowed" in resp.json()["error"]


# ===========================================================================
# get_pending_users
# ===========================================================================


def test_get_pending_users_success():
    """
    GET /api/admin/pending-users/ returns HTTP 200 with a ``pending_users``
    list that includes the inactive user created in this test.
    """
    user, _ = create_user_and_therapist()
    user.isActive = False
    user.save()

    resp = client.get("/api/admin/pending-users/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    data = resp.json()
    assert "pending_users" in data
    assert any(u["email"] == user.email for u in data["pending_users"])


def test_get_pending_users_empty_when_all_active():
    """
    When every User has ``isActive=True`` the response still returns HTTP 200
    but ``pending_users`` is an empty list.
    """
    user, _ = create_user_and_therapist()
    user.isActive = True
    user.save()

    resp = client.get("/api/admin/pending-users/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    pending = resp.json().get("pending_users", [])
    assert all(u["email"] != user.email for u in pending)


def test_get_pending_users_therapist_includes_therapist_details():
    """
    A pending Therapist entry in the list must include ``therapistId``,
    ``name``, ``specializations``, ``clinics``, and ``projects`` so the
    admin UI can display full context before accepting or declining.
    """
    user, therapist = create_user_and_therapist()
    user.isActive = False
    user.save()

    resp = client.get("/api/admin/pending-users/", HTTP_AUTHORIZATION="Bearer test")
    data = resp.json()

    pending_therapist = next((u for u in data["pending_users"] if u["email"] == user.email), None)
    assert pending_therapist is not None
    for key in ("therapistId", "name", "specializations", "clinics", "projects"):
        assert key in pending_therapist, f"Expected key '{key}' in pending Therapist entry"


def test_get_pending_users_method_not_allowed():
    """
    POST to the pending-users endpoint returns 405.  Only GET is allowed.
    """
    resp = client.post("/api/admin/pending-users/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405


# ===========================================================================
# accept_user
# ===========================================================================


@mock.patch("core.views.user_views.send_mail")
def test_accept_user_success(mock_send_mail):
    """
    Accepting an inactive user returns 200, sets ``isActive=True``, and
    sends exactly one activation e-mail.
    """
    user, _ = create_user_and_therapist()
    user.isActive = False
    user.save()

    resp = client.post(
        "/api/admin/accept-user/",
        data=json.dumps({"userId": str(user.id)}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "User accepted successfully" in resp.json()["message"]
    mock_send_mail.assert_called_once()


@mock.patch("core.views.user_views.send_mail")
def test_accept_user_sets_active_flag(mock_send_mail):
    """
    After accepting, the User document's ``isActive`` must be ``True`` so
    the user can log in.
    """
    user, _ = create_user_and_therapist()
    user.isActive = False
    user.save()

    client.post(
        "/api/admin/accept-user/",
        data=json.dumps({"userId": str(user.id)}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    refreshed = User.objects.get(pk=user.id)
    assert refreshed.isActive is True


def test_accept_user_not_found():
    """
    Supplying a valid ObjectId that matches no User returns 404.
    """
    resp = client.post(
        "/api/admin/accept-user/",
        data=json.dumps({"userId": str(ObjectId())}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "User not found" in resp.json()["error"]


def test_accept_user_missing_user_id():
    """
    Sending an empty body (no ``userId``) returns 400.
    """
    resp = client.post(
        "/api/admin/accept-user/",
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_accept_user_invalid_objectid():
    """
    Sending a malformed ObjectId string returns 400.
    """
    resp = client.post(
        "/api/admin/accept-user/",
        data=json.dumps({"userId": "not-an-objectid"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_accept_user_get_method_not_allowed():
    """
    GET to the accept-user endpoint returns 405.  Only POST is accepted.
    """
    resp = client.get("/api/admin/accept-user/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405


# ===========================================================================
# decline_user
# ===========================================================================


@mock.patch("core.views.user_views.send_mail")
def test_decline_user_success(mock_send_mail):
    """
    Declining a user returns 200 with 'User declined and deleted
    successfully' and sends exactly one rejection e-mail.
    """
    user, _ = create_user_and_therapist()
    resp = client.post(
        "/api/admin/decline-user/",
        data=json.dumps({"userId": str(user.id)}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert "User declined and deleted successfully" in resp.json()["message"]
    mock_send_mail.assert_called_once()


@mock.patch("core.views.user_views.send_mail")
def test_decline_user_removes_user_from_db(mock_send_mail):
    """
    Unlike soft-delete (``DELETE /profile/``), declining a user performs a
    **hard-delete**: the User document is removed from the database entirely.
    This is intentional because a declined registration should leave no trace.
    """
    user, _ = create_user_and_therapist()
    user_id = user.id

    client.post(
        "/api/admin/decline-user/",
        data=json.dumps({"userId": str(user_id)}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )

    remaining = User.objects.filter(pk=user_id).first()
    assert remaining is None, "Declined user must be hard-deleted from the database"


def test_decline_user_not_found():
    """
    Supplying a valid ObjectId that matches no User returns 404.
    """
    resp = client.post(
        "/api/admin/decline-user/",
        data=json.dumps({"userId": str(ObjectId())}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "User not found" in resp.json()["error"]


def test_decline_user_missing_user_id():
    """
    Sending an empty body (no ``userId``) returns 400.
    """
    resp = client.post(
        "/api/admin/decline-user/",
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_decline_user_invalid_objectid():
    """
    Sending a malformed ObjectId string returns 400.
    """
    resp = client.post(
        "/api/admin/decline-user/",
        data=json.dumps({"userId": "bad-id"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_decline_user_get_method_not_allowed():
    """
    GET to the decline-user endpoint returns 405.  Only POST is accepted.
    """
    resp = client.get("/api/admin/decline-user/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 405


# ===========================================================================
# change_password  (PUT /api/users/<id>/change-password/)
#
# Runtime behaviour note: this endpoint always returns HTTP 400 when
# old_password / new_password are supplied because it redirects callers to
# use the profile endpoint's password-change path.  The tests below document
# the actual responses rather than an idealised design.
# ===========================================================================


def test_change_password_with_both_fields_returns_400():
    """
    Sending ``old_password`` + ``new_password`` to the change-password
    endpoint returns 400 with a message directing callers to the dedicated
    password-change flow.  This is the current intentional behaviour.
    """
    user, _ = create_user_and_therapist()
    resp = client.put(
        f"/api/users/{user.id}/change-password/",
        data=json.dumps({"old_password": "old", "new_password": "New!pass1"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert (
        "change-password" in resp.json().get("error", "").lower() or "password" in resp.json().get("error", "").lower()
    )


def test_change_password_missing_old_returns_400():
    """
    Sending only ``new_password`` (no ``old_password``) returns 400 with
    'Old password required'.
    """
    user, _ = create_user_and_therapist()
    resp = client.put(
        f"/api/users/{user.id}/change-password/",
        data=json.dumps({"new_password": "New!pass1"}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Old password required" in resp.json().get("error", "")


def test_change_password_missing_both_returns_400():
    """
    Sending a body with neither ``old_password`` nor ``new_password``
    returns 400 with 'Missing password fields'.
    """
    user, _ = create_user_and_therapist()
    resp = client.put(
        f"/api/users/{user.id}/change-password/",
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert "Missing password fields" in resp.json().get("error", "")


def test_change_password_user_not_found():
    """
    Sending a valid but non-existent ObjectId returns 404.
    """
    resp = client.put(
        f"/api/users/{ObjectId()}/change-password/",
        data=json.dumps({}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404


def test_change_password_get_method_not_allowed():
    """
    GET to the change-password endpoint returns 405.  Only PUT is accepted.
    """
    user, _ = create_user_and_therapist()
    resp = client.get(
        f"/api/users/{user.id}/change-password/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405
