import json
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import mongomock
import pytest
from django.test import RequestFactory
from django.utils import timezone

from core.models import Patient, PatientThresholds, Therapist, User
from core.views.patient_thresholds import (
    PatientThresholdsSerializer,
    ThresholdsUpdateSerializer,
    _ensure_patient_thresholds,
    _merge_thresholds,
    _parse_iso_dt,
    _parse_json_body,
    _thresholds_equal,
    _thresholds_to_dict,
    _user_is_admin,
    _user_is_patient,
    _user_is_therapist,
    patient_thresholds_view,
    update_patient_thresholds_with_history,
)

rf = RequestFactory()


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


def _create_patient():
    tu = User(username="thx", role="Therapist", createdAt=datetime.now(), isActive=True).save()
    th = Therapist(userId=tu, clinics=["Inselspital"]).save()
    pu = User(username="ptx", role="Patient", createdAt=datetime.now(), isActive=True).save()
    return Patient(userId=pu, patient_code="PX1", therapist=th).save()


def test_thresholds_helpers_parse_user_role_and_dict_fallback():
    req = rf.patch("/x", data=json.dumps({"a": 1}), content_type="application/json")
    assert _parse_json_body(req)["a"] == 1
    assert _parse_iso_dt("2026-01-01T10:00:00Z") is not None
    assert _parse_iso_dt("bad") is None

    assert _user_is_admin(SimpleNamespace(role="Admin")) is True
    assert _user_is_therapist(SimpleNamespace(role="Therapist")) is True
    assert _user_is_patient(SimpleNamespace(role="Patient")) is True

    # force fallback branch in _thresholds_to_dict
    class Bad:
        steps_goal = 12345

        def to_mongo(self):
            raise RuntimeError("boom")

    d = _thresholds_to_dict(Bad())
    assert "steps_goal" in d


def test_thresholds_serializer_and_merge_logic():
    th, errs = PatientThresholdsSerializer.validate(
        {"steps_goal": "12000", "active_minutes_green": 40, "active_minutes_yellow": 20}
    )
    assert errs == {}
    assert th.steps_goal == 12000

    _none, errs_bad = PatientThresholdsSerializer.validate({"steps_goal": -1})
    assert "thresholds.steps_goal" in errs_bad

    _none2, errs_bad2 = PatientThresholdsSerializer.validate({"bp_sys_green_max": 200, "bp_sys_yellow_max": 150})
    assert "thresholds.bp_sys_green_max" in errs_bad2

    valid, v_errs = ThresholdsUpdateSerializer.validate({"thresholds": {"steps_goal": 9000}, "reason": "ok"})
    assert v_errs == {}
    assert valid.thresholds.steps_goal == 9000

    _bad, v_errs2 = ThresholdsUpdateSerializer.validate({"thresholds": {"steps_goal": 9000}, "reason": 10})
    assert "reason" in v_errs2

    current = PatientThresholds(steps_goal=10000)
    patch = PatientThresholds(steps_goal=11000)
    merged = _merge_thresholds(current, patch)
    assert merged.steps_goal == 11000
    assert _thresholds_equal(current, PatientThresholds(steps_goal=10000)) is True


def test_update_thresholds_noop_and_history_and_view_error_branches():
    patient = _create_patient()
    current = _ensure_patient_thresholds(patient)

    # no-op branch
    out = update_patient_thresholds_with_history(
        patient,
        new_partial=PatientThresholds(steps_goal=current.steps_goal),
        effective_from=timezone.now(),
        reason="",
        create_history_if_noop=False,
    )
    assert out.id == patient.id

    # create history path
    out2 = update_patient_thresholds_with_history(
        patient,
        new_partial=PatientThresholds(steps_goal=(current.steps_goal or 10000) + 1),
        effective_from=timezone.now(),
        reason="adjust",
        create_history_if_noop=False,
    )
    assert len(out2.thresholds_history) >= 1

    # view MEValidationError branch
    req = rf.patch(
        f"/api/patients/{patient.id}/thresholds/",
        data=json.dumps({"thresholds": {"steps_goal": 9000}}),
        content_type="application/json",
    )
    with patch(
        "core.views.patient_thresholds.update_patient_thresholds_with_history",
        side_effect=Exception("boom"),
    ):
        resp = patient_thresholds_view(req, str(patient.id))
    assert resp.status_code == 500
