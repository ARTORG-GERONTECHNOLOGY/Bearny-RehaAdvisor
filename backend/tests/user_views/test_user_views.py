import json
from datetime import datetime, timedelta
from unittest import mock

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import Patient, Therapist, User

client = Client()


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    import mongomock
    from mongoengine import connect, disconnect

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
    )
    user.save()

    therapist_user = User(
        username="t1",
        email="t1@example.com",
        phone="54321",
        createdAt=datetime.now(),
        role="Therapist",
    )
    therapist_user.save()

    therapist = Therapist(
        userId=therapist_user,
        name="Doe",
        first_name="John",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    )
    therapist.save()

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
        lifestyle=["Sedentary"],  # ✅ valid choice
        personal_goals=["Improved Mobility"],  # ✅ valid choice
        reha_end_date=datetime.now() + timedelta(days=30),
    )
    patient.save()

    return user, patient


def test_user_profile_view_therapist_get_success():
    user, therapist = create_user_and_therapist()
    resp = client.get(
        f"/api/users/{user.id}/profile/", HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == user.email
    assert data["name"] == therapist.name


def test_user_profile_view_patient_get_success():
    user, patient = create_patient()
    resp = client.get(
        f"/api/users/{str(patient.pk)}/profile/", HTTP_AUTHORIZATION="Bearer test"
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == user.email
    assert data["first_name"] == patient.first_name


def test_user_profile_view_user_not_found():
    resp = client.get(
        f"/api/users/{ObjectId()}/profile/", HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 500
    assert "error" in resp.json()


def test_user_profile_view_update_password_success():
    user, _ = create_user_and_therapist()
    user.pwdhash = "oldhash"
    user.save()

    payload = {"oldPassword": "oldhash", "newPassword": "new_secure_password"}

    with mock.patch(
        "core.views.user_views.check_password", return_value=True
    ), mock.patch("core.views.user_views.make_password", return_value="new_hashed"):
        resp = client.put(
            f"/api/users/{user.id}/profile/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer test",
        )
    assert resp.status_code == 200
    assert "Profile updated" in resp.json()["message"]


def test_user_profile_view_update_password_wrong_old():
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


def test_user_profile_view_delete_success():
    user, _ = create_user_and_therapist()
    resp = client.delete(
        f"/api/users/{user.id}/profile/", HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 200
    assert "User deleted successfully" in resp.json()["message"]


def test_get_pending_users_success():
    user, _ = create_user_and_therapist()
    user.isActive = False
    user.save()

    resp = client.get("/api/admin/pending-users/", HTTP_AUTHORIZATION="Bearer test")
    assert resp.status_code == 200
    data = resp.json()
    assert "pending_users" in data
    assert any(u["email"] == user.email for u in data["pending_users"])


@mock.patch("core.views.user_views.send_mail")
def test_accept_user_success(mock_send_mail):
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


def test_accept_user_not_found():
    resp = client.post(
        "/api/admin/accept-user/",
        data=json.dumps({"userId": str(ObjectId())}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
    assert "User not found" in resp.json()["error"]


@mock.patch("core.views.user_views.send_mail")
def test_decline_user_success(mock_send_mail):
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


def test_decline_user_not_found():
    resp = client.post(
        "/api/admin/decline-user/",
        data=json.dumps({"userId": str(ObjectId())}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert "User not found" in resp.json()["error"]
    assert resp.status_code == 404


def test_user_profile_view_method_not_allowed():
    user, _ = create_user_and_therapist()
    resp = client.post(
        f"/api/users/{user.id}/profile/", HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 405
    assert "Method not allowed" in resp.json()["error"]


def test_user_profile_view_therapist_profile_not_found():
    user, _ = create_user_and_therapist()
    # Delete the Therapist entry
    Therapist.objects(userId=user.id).delete()
    resp = client.get(
        f"/api/users/{user.id}/profile/", HTTP_AUTHORIZATION="Bearer test"
    )
    assert resp.status_code == 404
    assert "profile not found" in resp.json()["error"]


def test_user_profile_view_update_invalid_date_format():
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


def test_user_profile_view_update_password_missing_old():
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
