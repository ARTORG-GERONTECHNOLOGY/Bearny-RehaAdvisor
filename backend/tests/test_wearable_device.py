"""
Wearable device field tests (issue #427)
=========================================

Endpoints covered
-----------------
- GET  /api/fitbit/status/<patient_id>/           → wearable_device in response
- GET  /api/users/<user_id>/profile/              → wearable_device in patient profile
- PUT  /api/users/<user_id>/profile/              → wearable_device can be updated
- GET  /api/therapists/<therapist_id>/patients/   → wearable_device in patient list
- POST /api/auth/register/                        → wearableDevice persisted on creation

Coverage goals
--------------
- fitbit/status returns wearable_device=fitbit by default
- fitbit/status reflects persisted wearable_device value (omron, none)
- Profile GET returns wearable_device field
- Profile PUT accepts valid values (fitbit, omron, none), rejects invalid
- Patient list includes wearable_device per patient
- Registration with wearableDevice=omron creates patient with omron
- Registration without wearableDevice defaults to fitbit
- Existing patients without wearable_device field default to fitbit on read
"""

import json
from datetime import datetime, timedelta

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import FitbitUserToken, Patient, Therapist, User

client = Client()


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
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
# Helpers
# ---------------------------------------------------------------------------


def _make_therapist(email="th@test.com"):
    th_user = User(
        username=f"th-{ObjectId()}",
        email=email,
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, clinics=["Inselspital"], projects=["COPAIN"]).save()
    return th_user, th


def _make_patient(th, email="pt@test.com", wearable_device=None):
    pt_user = User(
        username=f"pt-{ObjectId()}",
        email=email,
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    kwargs = dict(
        userId=pt_user,
        patient_code=f"P-{ObjectId()}",
        therapist=th,
        clinic="Inselspital",
        project="COPAIN",
    )
    if wearable_device is not None:
        kwargs["wearable_device"] = wearable_device
    patient = Patient(**kwargs).save()
    return pt_user, patient


# ---------------------------------------------------------------------------
# fitbit/status — wearable_device in response
# ---------------------------------------------------------------------------


def test_fitbit_status_includes_wearable_device_default():
    """GET /api/fitbit/status/ returns wearable_device='fitbit' for a default patient."""
    _, th = _make_therapist()
    pt_user, _ = _make_patient(th)

    resp = client.get(f"/api/fitbit/status/{pt_user.id}/", HTTP_AUTHORIZATION="Bearer test")

    assert resp.status_code == 200
    body = resp.json()
    assert "wearable_device" in body
    assert body["wearable_device"] == "fitbit"


def test_fitbit_status_reflects_omron_device():
    """GET /api/fitbit/status/ returns wearable_device='omron' when patient has omron set."""
    _, th = _make_therapist()
    pt_user, _ = _make_patient(th, wearable_device="omron")

    resp = client.get(f"/api/fitbit/status/{pt_user.id}/", HTTP_AUTHORIZATION="Bearer test")

    assert resp.status_code == 200
    assert resp.json()["wearable_device"] == "omron"


def test_fitbit_status_reflects_none_device():
    """GET /api/fitbit/status/ returns wearable_device='none' when patient has none set."""
    _, th = _make_therapist()
    pt_user, _ = _make_patient(th, wearable_device="none")

    resp = client.get(f"/api/fitbit/status/{pt_user.id}/", HTTP_AUTHORIZATION="Bearer test")

    assert resp.status_code == 200
    assert resp.json()["wearable_device"] == "none"


def test_fitbit_status_omron_patient_not_connected():
    """An omron patient has no Fitbit token so connected=False."""
    _, th = _make_therapist()
    pt_user, _ = _make_patient(th, wearable_device="omron")

    resp = client.get(f"/api/fitbit/status/{pt_user.id}/", HTTP_AUTHORIZATION="Bearer test")

    body = resp.json()
    assert body["connected"] is False
    assert body["wearable_device"] == "omron"


# ---------------------------------------------------------------------------
# Profile GET — wearable_device present
# ---------------------------------------------------------------------------


def test_patient_profile_get_includes_wearable_device():
    """GET patient profile returns wearable_device field."""
    _, th = _make_therapist()
    pt_user, _ = _make_patient(th, wearable_device="fitbit")

    resp = client.get(f"/api/users/{pt_user.id}/profile/")

    assert resp.status_code == 200
    body = resp.json()
    assert "wearable_device" in body
    assert body["wearable_device"] == "fitbit"


def test_patient_profile_get_omron_wearable_device():
    """GET patient profile shows omron when that value is stored."""
    _, th = _make_therapist()
    pt_user, _ = _make_patient(th, wearable_device="omron")

    resp = client.get(f"/api/users/{pt_user.id}/profile/")

    assert resp.status_code == 200
    assert resp.json()["wearable_device"] == "omron"


# ---------------------------------------------------------------------------
# Profile PUT — wearable_device update
# ---------------------------------------------------------------------------


def test_patient_profile_put_wearable_device_to_omron():
    """PUT wearable_device=omron updates the patient document."""
    _, th = _make_therapist()
    pt_user, patient = _make_patient(th)

    resp = client.put(
        f"/api/users/{pt_user.id}/profile/",
        data=json.dumps({"wearable_device": "omron"}),
        content_type="application/json",
    )

    assert resp.status_code == 200
    assert "wearable_device" in resp.json().get("updated", {})
    patient.reload()
    assert patient.wearable_device == "omron"


def test_patient_profile_put_wearable_device_to_none():
    """PUT wearable_device=none updates the patient document."""
    _, th = _make_therapist()
    pt_user, patient = _make_patient(th, wearable_device="omron")

    resp = client.put(
        f"/api/users/{pt_user.id}/profile/",
        data=json.dumps({"wearable_device": "none"}),
        content_type="application/json",
    )

    assert resp.status_code == 200
    patient.reload()
    assert patient.wearable_device == "none"


def test_patient_profile_put_wearable_device_back_to_fitbit():
    """PUT wearable_device=fitbit reverts back from omron."""
    _, th = _make_therapist()
    pt_user, patient = _make_patient(th, wearable_device="omron")

    resp = client.put(
        f"/api/users/{pt_user.id}/profile/",
        data=json.dumps({"wearable_device": "fitbit"}),
        content_type="application/json",
    )

    assert resp.status_code == 200
    patient.reload()
    assert patient.wearable_device == "fitbit"


def test_patient_profile_put_invalid_wearable_device_ignored():
    """PUT with an invalid wearable_device value is silently ignored (not persisted)."""
    _, th = _make_therapist()
    pt_user, patient = _make_patient(th, wearable_device="fitbit")

    resp = client.put(
        f"/api/users/{pt_user.id}/profile/",
        data=json.dumps({"wearable_device": "garmin"}),
        content_type="application/json",
    )

    # Should still return 200 (field is just silently skipped)
    assert resp.status_code == 200
    patient.reload()
    assert patient.wearable_device == "fitbit"


# ---------------------------------------------------------------------------
# Therapist patient list — wearable_device per patient
# ---------------------------------------------------------------------------


def test_patient_list_includes_wearable_device(mongo_mock):
    """GET /api/therapists/<id>/patients/ includes wearable_device for each patient."""
    th_user, th = _make_therapist()
    _, _ = _make_patient(th, wearable_device="omron")

    resp = client.get(
        f"/api/therapists/{th_user.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert all("wearable_device" in p for p in data)


def test_patient_list_wearable_device_omron_value(mongo_mock):
    """Patient list reflects the correct wearable_device value per patient."""
    th_user, th = _make_therapist()
    pt_user, _ = _make_patient(th, wearable_device="omron")

    resp = client.get(
        f"/api/therapists/{th_user.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    data = resp.json()
    pt_row = next(p for p in data if p["username"] == pt_user.username)
    assert pt_row["wearable_device"] == "omron"


def test_patient_list_wearable_device_defaults_to_fitbit(mongo_mock):
    """Patient list shows fitbit when wearable_device not explicitly set."""
    th_user, th = _make_therapist()
    pt_user, _ = _make_patient(th)  # no wearable_device kwarg

    resp = client.get(
        f"/api/therapists/{th_user.id}/patients/",
        HTTP_AUTHORIZATION="Bearer test",
    )

    data = resp.json()
    pt_row = next(p for p in data if p["username"] == pt_user.username)
    assert pt_row["wearable_device"] == "fitbit"


# ---------------------------------------------------------------------------
# Registration — wearableDevice field
# ---------------------------------------------------------------------------


def _make_therapist_for_registration(email="th_reg@test.com"):
    th_user = User(
        username=f"th_reg_{ObjectId()}",
        role="Therapist",
        email=email,
        pwdhash="",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    Therapist(
        userId=th_user,
        name="Reg",
        first_name="T",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
        projects=["COPAIN"],
    ).save()
    return th_user


def _register_patient(th_user_id, extra=None):
    payload = {
        "userType": "Patient",
        "email": f"pt_{ObjectId()}@test.com",
        "password": "pw",
        "firstName": "Pat",
        "lastName": "Test",
        "therapist": str(th_user_id),
        "rehaEndDate": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
        "clinic": "Inselspital",
        "project": "COPAIN",
    }
    if extra:
        payload.update(extra)
    return (
        client.post(
            "/api/auth/register/",
            data=json.dumps(payload),
            content_type="application/json",
        ),
        payload["email"],
    )


def test_register_patient_wearable_device_omron_persisted(mongo_mock):
    """Registration with wearableDevice=omron stores omron on the Patient document."""
    th_user = _make_therapist_for_registration()

    resp, email = _register_patient(th_user.id, {"wearableDevice": "omron"})

    assert resp.status_code in (200, 201)
    created_user = User.objects.filter(email=email).first()
    assert created_user is not None
    patient = Patient.objects.filter(userId=created_user).first()
    assert patient is not None
    assert patient.wearable_device == "omron"


def test_register_patient_wearable_device_defaults_to_fitbit(mongo_mock):
    """Registration without wearableDevice defaults to fitbit."""
    th_user = _make_therapist_for_registration("th_default@test.com")

    resp, email = _register_patient(th_user.id)

    assert resp.status_code in (200, 201)
    created_user = User.objects.filter(email=email).first()
    patient = Patient.objects.filter(userId=created_user).first()
    assert patient is not None
    assert patient.wearable_device == "fitbit"


def test_register_patient_invalid_wearable_device_defaults_to_fitbit(mongo_mock):
    """Registration with an invalid wearableDevice value falls back to fitbit."""
    th_user = _make_therapist_for_registration("th_inv@test.com")

    resp, email = _register_patient(th_user.id, {"wearableDevice": "garmin"})

    assert resp.status_code in (200, 201)
    created_user = User.objects.filter(email=email).first()
    patient = Patient.objects.filter(userId=created_user).first()
    assert patient is not None
    assert patient.wearable_device == "fitbit"
