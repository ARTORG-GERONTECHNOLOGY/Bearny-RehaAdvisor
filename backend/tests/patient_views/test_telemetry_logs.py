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
* ``log_intervention_view`` persists ``action="INTERVENTION_VIEW"`` on open, for a
  real intervention only, and fills in seconds_viewed on that row when the patient leaves.
* ``log_intervention_view`` rejects GET (405), unknown interventions and a leave
  without seconds_viewed (400).
* Logs entry is linked to the correct patient User.
"""

import json
from datetime import datetime
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import Intervention, Logs, Patient, Therapist, User

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


@pytest.fixture(autouse=True)
def viewed_intervention(mongo_mock):
    """View logs are only accepted for a real intervention; the tests open this one by its id (see _iv)."""
    return Intervention(
        title="Stretching", description="d", content_type="Video", external_id="abc123", language="en"
    ).save()


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


def _iv():
    return str(Intervention.objects.first().id)


def _open_view(patient, **body):
    return client.post(
        VIEW_URL.format(patient_id=str(patient.id)),
        data=json.dumps(body),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )


def test_log_intervention_view_happy_path(mongo_mock):
    """
    Opening creates an INTERVENTION_VIEW row for the intervention with no duration yet; it gets one only if the
    patient leaves the page normally.
    """
    patient = create_patient()
    resp = _open_view(patient, intervention_id=_iv(), date="2026-03-21")
    assert resp.status_code == 200
    assert resp.json().get("ok") is True

    log = Logs.objects(action="INTERVENTION_VIEW").first()
    assert log is not None
    # Stored by its id, whatever form the page's URL used.
    assert log.details == f"intervention_id={Intervention.objects.first().id} date=2026-03-21 seconds="
    assert log.userId.id == patient.userId.id
    assert resp.json()["id"] == str(log.id)


@pytest.mark.parametrize(
    "intervention_id, status",
    # Crafted text and an external_id (pages always link by id) are malformed; a well-formed id can be unknown.
    [("no-such-intervention", 400), ("abc123 date=2030-01-01", 400), ("abc123", 400), (str(ObjectId()), 404)],
)
def test_log_intervention_view_rejects_an_unknown_intervention(mongo_mock, intervention_id, status):
    """Unknown or crafted ids never reach details, so they can't pad viewed_interventions or fake a date."""
    patient = create_patient()
    resp = client.post(
        VIEW_URL.format(patient_id=str(patient.id)),
        data=json.dumps({"intervention_id": intervention_id, "seconds_viewed": 5}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == status
    assert Logs.objects(action="INTERVENTION_VIEW").count() == 0


def _update_view(patient, log_id, seconds):
    return client.post(
        VIEW_URL.format(patient_id=str(patient.id)),
        data=json.dumps({"log_id": log_id, "seconds_viewed": seconds}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )


def test_log_intervention_view_leaving_sets_the_duration_on_the_same_row(mongo_mock):
    """One row per visit: the duration is filled in on leaving, capped at a day so one bogus value can't skew it."""
    patient = create_patient()
    log_id = _open_view(patient, intervention_id=_iv(), date="2026-03-21").json()["id"]

    assert _update_view(patient, log_id, 95).status_code == 200
    assert Logs.objects(action="INTERVENTION_VIEW").count() == 1
    assert Logs.objects(id=log_id).first().details.endswith(" seconds=95")

    # Set once: a replayed or repeated request can't overwrite it.
    assert _update_view(patient, log_id, 7).status_code == 200
    assert Logs.objects(id=log_id).first().details.endswith(" seconds=95")


def test_log_intervention_view_concurrent_second_write_does_not_overwrite(mongo_mock):
    """Two leave requests that both read the row before either wrote: only the first duration sticks."""
    from mongoengine.queryset import QuerySet

    patient = create_patient()
    log_id = _open_view(patient, intervention_id=_iv()).json()["id"]
    stale = Logs.objects(id=log_id).first()
    assert _update_view(patient, log_id, 95).status_code == 200

    # The second request still sees the row as it was before the first write.
    real_first = QuerySet.first
    with patch.object(
        QuerySet, "first", autospec=True, side_effect=lambda qs: stale if qs._document is Logs else real_first(qs)
    ):
        assert _update_view(patient, log_id, 7).status_code == 200

    assert Logs.objects(id=log_id).first().details.endswith(" seconds=95")


def test_log_intervention_view_duration_is_capped_at_a_day(mongo_mock):
    patient = create_patient()
    log_id = _open_view(patient, intervention_id=_iv()).json()["id"]
    _update_view(patient, log_id, 10**9)
    assert Logs.objects(id=log_id).first().details.endswith(" seconds=86400")


@pytest.mark.parametrize(
    "seconds_viewed, stored",
    [(45, " seconds=45"), ("lots", " seconds="), (-3, " seconds=")],
)
def test_log_intervention_view_keeps_an_old_app_versions_duration(mongo_mock, seconds_viewed, stored):
    """
    App versions cached from before this flow post once on leaving, with the duration on the create. It is kept;
    an unusable value doesn't cost the open.
    """
    patient = create_patient()
    resp = _open_view(patient, intervention_id=_iv(), date="2026-03-21", seconds_viewed=seconds_viewed)
    assert resp.status_code == 200
    assert Logs.objects(action="INTERVENTION_VIEW").first().details.endswith(stored)


def test_log_intervention_view_leaving_needs_a_duration(mongo_mock):
    patient = create_patient()
    log_id = _open_view(patient, intervention_id=_iv()).json()["id"]
    assert _update_view(patient, log_id, 0).status_code == 400
    assert Logs.objects(id=log_id).first().details.endswith(" seconds=")


def test_log_intervention_view_update_only_touches_an_existing_view_row(mongo_mock):
    patient = create_patient()
    other_log = Logs(
        userId=patient.userId,
        action="LOGIN",
        actor_role="Patient",
        patient=patient,
        details="seconds=1",
    ).save()

    assert _update_view(patient, str(ObjectId()), 30).status_code == 404
    assert _update_view(patient, "not-an-id", 30).status_code == 404
    assert _update_view(patient, str(other_log.id), 30).status_code == 404
    assert Logs.objects(id=other_log.id).first().details == "seconds=1"


def test_log_intervention_view_open_with_infinite_seconds_is_still_recorded(mongo_mock):
    patient = create_patient()
    resp = client.post(
        VIEW_URL.format(patient_id=str(patient.id)),
        data='{"intervention_id": "%s", "seconds_viewed": 1e400}' % _iv(),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    assert Logs.objects(action="INTERVENTION_VIEW").first().details.endswith(" seconds=")


def test_log_intervention_view_patient_without_user_record_is_403_not_500(mongo_mock):
    patient = create_patient()
    patient.userId.delete()
    resp = _open_view(Patient.objects.get(id=patient.id), intervention_id=_iv())
    assert resp.status_code == 403
    assert Logs.objects(action="INTERVENTION_VIEW").count() == 0


def test_log_intervention_view_get_returns_405(mongo_mock):
    patient = create_patient()
    resp = client.get(
        VIEW_URL.format(patient_id=str(patient.id)),
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 405


@pytest.mark.parametrize(
    "body",
    [
        {"log_id": str(ObjectId()), "seconds_viewed": "lots"},
        {"log_id": 12345, "seconds_viewed": None},
        # JSON's 1e400 parses to infinity, which int() can't convert.
        {"log_id": str(ObjectId()), "seconds_viewed": float("inf")},
        {"intervention_id": "x" * 201, "seconds_viewed": 5},
        {"intervention_id": str(ObjectId()), "date": "2026-03-21" * 200, "seconds_viewed": 5},
    ],
)
def test_log_intervention_view_malformed_or_oversized_body_is_a_400_not_a_500(mongo_mock, body):
    patient = create_patient()
    resp = client.post(
        VIEW_URL.format(patient_id=str(patient.id)),
        data=json.dumps(body),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 400


def test_log_intervention_view_unknown_patient_returns_404(mongo_mock):
    fake_id = str(ObjectId())
    resp = client.post(
        VIEW_URL.format(patient_id=fake_id),
        data=json.dumps({"intervention_id": str(ObjectId()), "seconds_viewed": 30}),
        content_type="application/json",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 404
