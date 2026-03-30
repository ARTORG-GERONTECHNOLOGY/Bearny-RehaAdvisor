"""
Telemetry / Logs model tests
=============================

Endpoints covered
-----------------
``POST /api/patients/vitals/manual/<patient_id>/``           → creates VITALS_SUBMIT log
``POST /api/patients/vitals/intervention-view/<patient_id>/`` → log_intervention_view
``GET  /api/patients/vitals/intervention-view/<patient_id>/`` → 405

Coverage goals
--------------
* ``add_manual_vitals`` persists a ``Logs`` document with ``action="VITALS_SUBMIT"``
  and a ``details`` string that includes the recorded fields.
* ``log_intervention_view`` (happy path) persists ``action="INTERVENTION_VIEW"``
  with the intervention_id and seconds_viewed encoded in ``details``.
* ``log_intervention_view`` rejects GET (405) and payloads with zero or missing
  seconds_viewed (400).
* Logs entry is linked to the correct patient User.
"""

import json
from datetime import datetime

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import Logs, Patient, Therapist, User

client = Client()

VITALS_URL = "/api/patients/vitals/manual/{patient_id}/"
VIEW_URL = "/api/patients/vitals/intervention-view/{patient_id}/"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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


def create_patient():
    th_user = User(
        username="th_tel",
        email="th_tel@example.com",
        phone="000",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(
        userId=th_user,
        clinics=["Inselspital"],
    ).save()
    p_user = User(
        username="p_tel",
        email="p_tel@example.com",
        phone="111",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    return Patient(
        userId=p_user,
        patient_code="PAT_TEL",
        therapist=therapist,
        access_word="pass",
    ).save()


# ---------------------------------------------------------------------------
# VITALS_SUBMIT log
# ---------------------------------------------------------------------------


def test_add_manual_vitals_creates_vitals_submit_log(mongo_mock):
    """
    A successful vitals POST must write a Logs document with
    action="VITALS_SUBMIT" linked to the patient's User.
    """
    patient = create_patient()
    resp = client.post(
        VITALS_URL.format(patient_id=str(patient.id)),
        data=json.dumps({"weight_kg": 72.5, "bp_sys": 120, "bp_dia": 80}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200

    log = Logs.objects(action="VITALS_SUBMIT").first()
    assert log is not None, "Expected a VITALS_SUBMIT log entry"
    assert log.userId.id == patient.userId.id
    assert log.patient.id == patient.id
    assert "weight_kg=72.5" in (log.details or "")


def test_add_manual_vitals_log_details_contain_bp(mongo_mock):
    """
    When only blood-pressure is submitted the log details mention bp_sys/bp_dia.
    """
    patient = create_patient()
    client.post(
        VITALS_URL.format(patient_id=str(patient.id)),
        data=json.dumps({"bp_sys": 130, "bp_dia": 85}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    log = Logs.objects(action="VITALS_SUBMIT").first()
    assert log is not None
    assert "bp_sys=130" in (log.details or "")
    assert "bp_dia=85" in (log.details or "")


# ---------------------------------------------------------------------------
# log_intervention_view  —  POST /api/patients/vitals/intervention-view/<id>/
# ---------------------------------------------------------------------------


def test_log_intervention_view_happy_path(mongo_mock):
    """
    A valid POST creates an INTERVENTION_VIEW Logs entry containing the
    intervention_id and seconds_viewed.
    """
    patient = create_patient()
    resp = client.post(
        VIEW_URL.format(patient_id=str(patient.id)),
        data=json.dumps({"intervention_id": "abc123", "date": "2026-03-21", "seconds_viewed": 45}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert resp.json().get("ok") is True

    log = Logs.objects(action="INTERVENTION_VIEW").first()
    assert log is not None
    assert "abc123" in (log.details or "")
    assert "seconds=45" in (log.details or "")
    assert log.userId.id == patient.userId.id


def test_log_intervention_view_get_returns_405(mongo_mock):
    patient = create_patient()
    resp = client.get(
        VIEW_URL.format(patient_id=str(patient.id)),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


def test_log_intervention_view_zero_seconds_rejected(mongo_mock):
    patient = create_patient()
    resp = client.post(
        VIEW_URL.format(patient_id=str(patient.id)),
        data=json.dumps({"intervention_id": "abc123", "seconds_viewed": 0}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400
    assert Logs.objects(action="INTERVENTION_VIEW").count() == 0


def test_log_intervention_view_unknown_patient_returns_404(mongo_mock):
    fake_id = str(ObjectId())
    resp = client.post(
        VIEW_URL.format(patient_id=fake_id),
        data=json.dumps({"intervention_id": "abc123", "seconds_viewed": 30}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
