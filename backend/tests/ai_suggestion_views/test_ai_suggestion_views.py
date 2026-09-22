"""
AI suggestion endpoint tests
=============================

Endpoints covered
-----------------
POST /api/patients/<patient_id>/ai-suggestion/generate/
GET  /api/patients/<patient_id>/ai-suggestion/latest/
POST /api/patients/<patient_id>/ai-suggestion/<suggestion_id>/decide/
"""

import json
from datetime import datetime
from unittest import mock

import mongomock
import pytest
from bson import ObjectId
from django.test import Client, override_settings

from core.models import (
    AISuggestion,
    Intervention,
    Patient,
    RehabilitationPlan,
    SuggestedItem,
    Therapist,
    User,
)

client = Client()

# ── Fixtures ──────────────────────────────────────────────────────────────────


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


def _make_user(role="Patient"):
    uid = str(ObjectId())
    return User(
        username=f"u-{uid}",
        email=f"u-{uid}@example.com",
        role=role,
        createdAt=datetime.now(),
        isActive=True,
    ).save()


def _make_therapist(clinics=None):
    u = _make_user(role="Therapist")
    return Therapist(
        userId=u,
        name="Therapist",
        first_name="T",
        clinics=clinics or ["Inselspital"],
        specializations=["Neurology"],
    ).save()


def _make_patient(therapist, clinic="Inselspital", diagnosis=None):
    u = _make_user(role="Patient")
    return Patient(
        userId=u,
        patient_code=f"PAT-{ObjectId()}",
        therapist=therapist,
        clinic=clinic,
        diagnosis=diagnosis or ["Stroke"],
    ).save()


def _make_intervention(external_id, aim="Movement", physical_level="Medium", primary_diagnosis=None):
    return Intervention(
        external_id=external_id,
        language="de",
        title=f"Intervention {external_id}",
        description="Test description",
        content_type="Exercise",
        aim=aim,
        physical_level=physical_level,
        cognitive_level="Medium",
        is_private=False,
        primary_diagnosis=primary_diagnosis or ["Stroke"],
    ).save()


# ── Tests: generate ───────────────────────────────────────────────────────────


@override_settings(MONGOMOCK=True)
def test_generate_returns_403_for_non_ai_clinic():
    """Patients in clinics not in ai_suggestion_clinics get a 403."""
    therapist = _make_therapist(clinics=["Demo"])
    patient = _make_patient(therapist, clinic="Demo")

    with (
        mock.patch(
            "core.views.ai_suggestion_view._resolve_patient_and_therapist",
            return_value=(patient, therapist),
        ),
        mock.patch(
            "core.views.ai_suggestion_view._clinic_has_ai_suggestions",
            return_value=False,
        ),
    ):
        resp = client.post(
            f"/api/patients/{patient.id}/ai-suggestion/generate/",
            content_type="application/json",
        )

    assert resp.status_code == 403


@override_settings(MONGOMOCK=True)
def test_generate_creates_suggestion_for_enabled_clinic():
    """generate/ stores an AISuggestion and returns items for eligible patients."""
    therapist = _make_therapist(clinics=["Inselspital"])
    patient = _make_patient(therapist, clinic="Inselspital", diagnosis=["Stroke"])
    _make_intervention("IV-001", aim="Movement", primary_diagnosis=["Stroke"])
    _make_intervention("IV-002", aim="Education", primary_diagnosis=["Stroke"])

    with (
        mock.patch(
            "core.views.ai_suggestion_view._resolve_patient_and_therapist",
            return_value=(patient, therapist),
        ),
        mock.patch("core.views.ai_suggestion_view._clinic_has_ai_suggestions", return_value=True),
        mock.patch("core.views.ai_suggestion_view._fetch_comorbidities", return_value={}),
        mock.patch("core.views.ai_suggestion_view._wearable_snapshot", return_value={}),
        mock.patch("core.views.ai_suggestion_view._population_ratings", return_value={}),
        mock.patch(
            "core.views.ai_suggestion_view._generate_rationale",
            return_value="Suitable for post-stroke rehabilitation.",
        ),
    ):
        resp = client.post(
            f"/api/patients/{patient.id}/ai-suggestion/generate/",
            content_type="application/json",
        )

    assert resp.status_code == 201
    data = resp.json()
    assert "suggestion" in data
    assert len(data["suggestion"]["items"]) >= 1
    assert data["suggestion"]["overall_decision"] == "pending"

    # Verify stored in DB
    stored = AISuggestion.objects(patient=patient).first()
    assert stored is not None
    assert len(stored.items) >= 1


@override_settings(MONGOMOCK=True)
def test_generate_snapshot_includes_patient_profile():
    """patient_snapshot must include diagnosis, clinic, and comorbidities."""
    therapist = _make_therapist(clinics=["Inselspital"])
    patient = _make_patient(therapist, clinic="Inselspital", diagnosis=["COPD"])
    _make_intervention("IV-010", aim="Movement", primary_diagnosis=["COPD"])

    fake_comorbidities = {"sarcopenia": "1", "depression": "1"}

    with (
        mock.patch(
            "core.views.ai_suggestion_view._resolve_patient_and_therapist",
            return_value=(patient, therapist),
        ),
        mock.patch("core.views.ai_suggestion_view._clinic_has_ai_suggestions", return_value=True),
        mock.patch("core.views.ai_suggestion_view._fetch_comorbidities", return_value=fake_comorbidities),
        mock.patch("core.views.ai_suggestion_view._wearable_snapshot", return_value={"avg_steps": 3000}),
        mock.patch("core.views.ai_suggestion_view._population_ratings", return_value={}),
        mock.patch("core.views.ai_suggestion_view._generate_rationale", return_value="Test rationale."),
    ):
        resp = client.post(
            f"/api/patients/{patient.id}/ai-suggestion/generate/",
            content_type="application/json",
        )

    assert resp.status_code == 201
    data = resp.json()
    snapshot = data["suggestion"]["patient_snapshot"]
    assert snapshot["clinic"] == "Inselspital"
    assert "COPD" in snapshot["diagnosis"]
    assert "sarcopenia" in snapshot["comorbidities"]


# ── Tests: latest ─────────────────────────────────────────────────────────────


@override_settings(MONGOMOCK=True)
def test_latest_returns_none_when_no_suggestion():
    therapist = _make_therapist(clinics=["Inselspital"])
    patient = _make_patient(therapist, clinic="Inselspital")

    with (
        mock.patch(
            "core.views.ai_suggestion_view._resolve_patient_and_therapist",
            return_value=(patient, therapist),
        ),
        mock.patch("core.views.ai_suggestion_view._clinic_has_ai_suggestions", return_value=True),
    ):
        resp = client.get(f"/api/patients/{patient.id}/ai-suggestion/latest/")

    assert resp.status_code == 200
    assert resp.json()["suggestion"] is None


@override_settings(MONGOMOCK=True)
def test_latest_returns_most_recent_pending():
    therapist = _make_therapist(clinics=["Inselspital"])
    patient = _make_patient(therapist, clinic="Inselspital")
    iv = _make_intervention("IV-020")

    # Create two suggestions: rejected first, then pending
    AISuggestion(
        patient=patient,
        therapist=therapist,
        items=[SuggestedItem(intervention=iv, suggested_frequency="3x", decision="pending")],
        overall_decision="rejected",
    ).save()
    pending = AISuggestion(
        patient=patient,
        therapist=therapist,
        items=[SuggestedItem(intervention=iv, suggested_frequency="3x", decision="pending")],
        overall_decision="pending",
    ).save()

    with (
        mock.patch(
            "core.views.ai_suggestion_view._resolve_patient_and_therapist",
            return_value=(patient, therapist),
        ),
        mock.patch("core.views.ai_suggestion_view._clinic_has_ai_suggestions", return_value=True),
    ):
        resp = client.get(f"/api/patients/{patient.id}/ai-suggestion/latest/")

    assert resp.status_code == 200
    data = resp.json()
    assert data["suggestion"]["_id"] == str(pending.id)


@override_settings(MONGOMOCK=True)
def test_latest_returns_403_for_non_ai_clinic():
    therapist = _make_therapist(clinics=["Demo"])
    patient = _make_patient(therapist, clinic="Demo")

    with (
        mock.patch(
            "core.views.ai_suggestion_view._resolve_patient_and_therapist",
            return_value=(patient, therapist),
        ),
        mock.patch("core.views.ai_suggestion_view._clinic_has_ai_suggestions", return_value=False),
    ):
        resp = client.get(f"/api/patients/{patient.id}/ai-suggestion/latest/")

    assert resp.status_code == 403


# ── Tests: decide ─────────────────────────────────────────────────────────────


@override_settings(MONGOMOCK=True)
def test_decide_records_decisions_and_updates_overall():
    therapist = _make_therapist(clinics=["Inselspital"])
    patient = _make_patient(therapist, clinic="Inselspital")
    iv1 = _make_intervention("IV-030", aim="Movement")
    iv2 = _make_intervention("IV-031", aim="Education")

    suggestion = AISuggestion(
        patient=patient,
        therapist=therapist,
        items=[
            SuggestedItem(intervention=iv1, suggested_frequency="3x", decision="pending"),
            SuggestedItem(intervention=iv2, suggested_frequency="2x", decision="pending"),
        ],
        overall_decision="pending",
    ).save()

    payload = {
        "items": [
            {"intervention_id": str(iv1.id), "decision": "accepted"},
            {"intervention_id": str(iv2.id), "decision": "rejected"},
        ],
        "notes": "Skipped education for now",
    }

    with (
        mock.patch(
            "core.views.ai_suggestion_view._resolve_patient_and_therapist",
            return_value=(patient, therapist),
        ),
        mock.patch("core.views.ai_suggestion_view._clinic_has_ai_suggestions", return_value=True),
    ):
        resp = client.post(
            f"/api/patients/{patient.id}/ai-suggestion/{suggestion.id}/decide/",
            data=json.dumps(payload),
            content_type="application/json",
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["accepted"] == 1
    assert data["rejected"] == 1
    assert data["overall_decision"] == "partially_applied"

    updated = AISuggestion.objects.get(id=suggestion.id)
    assert updated.notes == "Skipped education for now"
    assert updated.overall_decision == "partially_applied"


@override_settings(MONGOMOCK=True)
def test_decide_accepted_intervention_added_to_plan():
    """Accepted items must appear in the patient's rehabilitation plan."""
    therapist = _make_therapist(clinics=["Inselspital"])
    patient = _make_patient(therapist, clinic="Inselspital")
    iv = _make_intervention("IV-040", aim="Movement")

    suggestion = AISuggestion(
        patient=patient,
        therapist=therapist,
        items=[SuggestedItem(intervention=iv, suggested_frequency="3x", decision="pending")],
        overall_decision="pending",
    ).save()

    payload = {"items": [{"intervention_id": str(iv.id), "decision": "accepted"}], "notes": ""}

    with (
        mock.patch(
            "core.views.ai_suggestion_view._resolve_patient_and_therapist",
            return_value=(patient, therapist),
        ),
        mock.patch("core.views.ai_suggestion_view._clinic_has_ai_suggestions", return_value=True),
    ):
        resp = client.post(
            f"/api/patients/{patient.id}/ai-suggestion/{suggestion.id}/decide/",
            data=json.dumps(payload),
            content_type="application/json",
        )

    assert resp.status_code == 200

    plan = RehabilitationPlan.objects(patientId=patient).first()
    assert plan is not None
    assert any(str(a.interventionId.id) == str(iv.id) for a in plan.interventions)


@override_settings(MONGOMOCK=True)
def test_decide_all_rejected_sets_rejected_outcome():
    therapist = _make_therapist(clinics=["Inselspital"])
    patient = _make_patient(therapist, clinic="Inselspital")
    iv = _make_intervention("IV-050")

    suggestion = AISuggestion(
        patient=patient,
        therapist=therapist,
        items=[SuggestedItem(intervention=iv, suggested_frequency="3x", decision="pending")],
        overall_decision="pending",
    ).save()

    payload = {"items": [{"intervention_id": str(iv.id), "decision": "rejected"}], "notes": ""}

    with (
        mock.patch(
            "core.views.ai_suggestion_view._resolve_patient_and_therapist",
            return_value=(patient, therapist),
        ),
        mock.patch("core.views.ai_suggestion_view._clinic_has_ai_suggestions", return_value=True),
    ):
        resp = client.post(
            f"/api/patients/{patient.id}/ai-suggestion/{suggestion.id}/decide/",
            data=json.dumps(payload),
            content_type="application/json",
        )

    assert resp.status_code == 200
    assert resp.json()["overall_decision"] == "rejected"


# ── Unit tests: contraindication filter ──────────────────────────────────────


def test_passes_contraindication_blocks_high_physical_for_sarcopenia():
    from types import SimpleNamespace

    from core.views.ai_suggestion_view import _passes_contraindication

    iv = SimpleNamespace(cognitive_level="Low", physical_level="High")
    assert _passes_contraindication(iv, {"sarcopenia": "1"}) is False


def test_passes_contraindication_allows_low_physical_for_sarcopenia():
    from types import SimpleNamespace

    from core.views.ai_suggestion_view import _passes_contraindication

    iv = SimpleNamespace(cognitive_level="Low", physical_level="Low")
    assert _passes_contraindication(iv, {"sarcopenia": "1"}) is True


def test_passes_contraindication_no_comorbidities():
    from types import SimpleNamespace

    from core.views.ai_suggestion_view import _passes_contraindication

    iv = SimpleNamespace(cognitive_level="High", physical_level="High")
    assert _passes_contraindication(iv, {}) is True


def test_passes_contraindication_blocks_high_cognitive_for_cogn_imp():
    from types import SimpleNamespace

    from core.views.ai_suggestion_view import _passes_contraindication

    iv = SimpleNamespace(cognitive_level="High", physical_level="Low")
    assert _passes_contraindication(iv, {"cogn_imp": "1"}) is False


# ── Unit tests: fallback rationale ────────────────────────────────────────────


def test_fallback_rationale_includes_diagnosis_match():
    from types import SimpleNamespace

    from core.views.ai_suggestion_view import _fallback_rationale

    iv = SimpleNamespace()
    rationale = _fallback_rationale(iv, {"diagnosis_match": 1.0, "avg_rating": 4.2})
    assert "Matches patient diagnosis profile" in rationale
    assert "4.2" in rationale
