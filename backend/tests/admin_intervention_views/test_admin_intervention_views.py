"""
Admin intervention view tests
— ``GET /api/admin/interventions/``
— ``DELETE /api/admin/interventions/<id>/``
===========================================

Coverage
--------
List endpoint
  * Returns all interventions (public and private) without filtering by is_private.
  * Supports ``?q=`` search on title and external_id (case-insensitive).
  * Supports ``?lang=`` filter.
  * Returns consistent response shape for each item.
  * Returns 200 with empty list when no interventions exist.

Delete endpoint
  * Returns 200 and removes the Intervention document.
  * Cascades: removes references from InterventionTemplate.recommendations.
  * Cascades: removes references from Therapist.default_recommendations.
  * Cascades: removes assignments from RehabilitationPlan.interventions.
  * Cascades: deletes PatientInterventionLogs referencing the intervention.
  * Returns 400 for malformed id.
  * Returns 404 for unknown id.
  * Returns 405 for wrong HTTP method on delete URL.

Test setup
----------
Each test uses the ``mongo_mock`` autouse fixture providing an isolated
in-memory mongomock connection.
"""

from datetime import datetime
from types import SimpleNamespace

import mongomock
import pytest
from mongoengine import connect, disconnect
from rest_framework.test import APIClient

from core.models import (
    DefaultInterventions,
    Intervention,
    InterventionAssignment,
    InterventionTemplate,
    Patient,
    PatientInterventionLogs,
    RehabilitationPlan,
    Therapist,
    User,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def mongo_mock():
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


client: APIClient = None  # type: ignore[assignment]


@pytest.fixture(autouse=True)
def _setup_admin_client(mongo_mock):
    global client
    admin_user = User(
        username="admin_iv_test",
        email="admin_iv@test.example.com",
        role="Admin",
        isActive=True,
        createdAt=datetime.now(),
    )
    admin_user.pwdhash = "x"
    admin_user.save()
    c = APIClient()
    c.force_authenticate(user=SimpleNamespace(is_authenticated=True, id=str(admin_user.id)))
    client = c
    yield

LIST_URL = "/api/admin/interventions/"
DELETE_URL = "/api/admin/interventions/{intervention_id}/"


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------


def _make_intervention(external_id="test_001", language="en", is_private=False, title="Test Intervention"):
    return Intervention(
        external_id=external_id,
        language=language,
        title=title,
        description="A test intervention.",
        content_type="Video",
        is_private=is_private,
    ).save()


def _make_therapist():
    user = User(
        username="therapist_admin",
        email="admin_therapist@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    return Therapist(
        userId=user,
        name="Admin",
        first_name="Therapist",
        specializations=[],
        clinics=[],
        default_recommendations=[],
    ).save()


def _make_patient(therapist):
    user = User(
        username="patient_admin",
        email="admin_patient@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    return Patient(
        userId=user,
        patient_code="PADM001",
        therapist=therapist,
        name="Patient",
        first_name="Test",
        function=[],
        reha_end_date=datetime(2030, 1, 1),
        duration=30,
    ).save()


# ===========================================================================
# List endpoint — GET /api/admin/interventions/
# ===========================================================================


def test_list_returns_all_interventions(mongo_mock):
    """Both public and private interventions must be returned."""
    _make_intervention("pub_001", is_private=False)
    _make_intervention("priv_001", is_private=True)

    resp = client.get(LIST_URL)

    assert resp.status_code == 200
    data = resp.json()
    assert "interventions" in data
    ids = [i["external_id"] for i in data["interventions"]]
    assert "pub_001" in ids
    assert "priv_001" in ids


def test_list_empty_when_no_interventions(mongo_mock):
    resp = client.get(LIST_URL)

    assert resp.status_code == 200
    assert resp.json()["interventions"] == []


def test_list_response_shape(mongo_mock):
    """Each item must have the expected keys."""
    _make_intervention()

    resp = client.get(LIST_URL)
    item = resp.json()["interventions"][0]

    for key in ("_id", "external_id", "language", "title", "content_type", "is_private"):
        assert key in item, f"Missing key: {key}"


def test_list_filter_by_lang(mongo_mock):
    _make_intervention("en_001", language="en")
    _make_intervention("de_001", language="de")

    resp = client.get(LIST_URL + "?lang=de")

    assert resp.status_code == 200
    items = resp.json()["interventions"]
    assert all(i["language"] == "de" for i in items)
    assert any(i["external_id"] == "de_001" for i in items)


def test_list_search_by_title(mongo_mock):
    _make_intervention("stretch_001", title="Full Body Stretch")
    _make_intervention("balance_001", title="Balance Training")

    resp = client.get(LIST_URL + "?q=stretch")

    assert resp.status_code == 200
    items = resp.json()["interventions"]
    assert len(items) == 1
    assert items[0]["external_id"] == "stretch_001"


def test_list_search_by_external_id(mongo_mock):
    _make_intervention("cardiac_001", title="Cardio One")
    _make_intervention("cardiac_002", title="Cardio Two")
    _make_intervention("balance_001", title="Balance")

    resp = client.get(LIST_URL + "?q=cardiac")

    items = resp.json()["interventions"]
    external_ids = {i["external_id"] for i in items}
    assert external_ids == {"cardiac_001", "cardiac_002"}


# ===========================================================================
# Delete endpoint — DELETE /api/admin/interventions/<id>/
# ===========================================================================


def test_delete_removes_intervention(mongo_mock):
    iv = _make_intervention()
    iv_id = str(iv.pk)

    resp = client.delete(DELETE_URL.format(intervention_id=iv_id))

    assert resp.status_code == 200
    assert Intervention.objects(id=iv.pk).count() == 0


def test_delete_returns_404_for_unknown_id(mongo_mock):
    resp = client.delete(DELETE_URL.format(intervention_id="507f1f77bcf86cd799439011"))

    assert resp.status_code == 404


def test_delete_returns_400_for_malformed_id(mongo_mock):
    resp = client.delete(DELETE_URL.format(intervention_id="not-an-objectid"))

    assert resp.status_code == 400


def test_delete_cascades_intervention_template_recommendations(mongo_mock):
    """After deleting an intervention, it must be stripped from template recommendations."""
    iv = _make_intervention("tpl_ref_001")
    therapist = _make_therapist()

    template = InterventionTemplate(
        name="Test Template",
        created_by=therapist,
        recommendations=[DefaultInterventions(recommendation=iv)],
    ).save()

    assert len(template.reload().recommendations) == 1

    client.delete(DELETE_URL.format(intervention_id=str(iv.pk)))

    updated = InterventionTemplate.objects.get(id=template.pk)
    assert len(updated.recommendations) == 0


def test_delete_cascades_therapist_default_recommendations(mongo_mock):
    """After deleting an intervention, it must be stripped from therapist defaults."""
    iv = _make_intervention("ther_ref_001")
    therapist = _make_therapist()
    therapist.default_recommendations = [DefaultInterventions(recommendation=iv)]
    therapist.save()

    client.delete(DELETE_URL.format(intervention_id=str(iv.pk)))

    updated = Therapist.objects.get(id=therapist.pk)
    assert len(updated.default_recommendations) == 0


def test_delete_cascades_rehabilitation_plan_assignments(mongo_mock):
    """After deleting an intervention, it must be removed from rehab plan interventions."""
    iv = _make_intervention("plan_ref_001")
    therapist = _make_therapist()
    patient = _make_patient(therapist)

    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime.now(),
        endDate=datetime(2030, 1, 1),
        status="active",
        interventions=[InterventionAssignment(interventionId=iv, frequency="daily", dates=[])],
    ).save()

    assert len(plan.reload().interventions) == 1

    client.delete(DELETE_URL.format(intervention_id=str(iv.pk)))

    updated = RehabilitationPlan.objects.get(id=plan.pk)
    assert len(updated.interventions) == 0


def test_delete_cascades_patient_intervention_logs(mongo_mock):
    """After deleting an intervention, its PatientInterventionLogs must be deleted."""
    iv = _make_intervention("log_ref_001")
    therapist = _make_therapist()
    patient = _make_patient(therapist)

    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime.now(),
        endDate=datetime(2030, 1, 1),
        status="active",
        interventions=[],
    ).save()

    PatientInterventionLogs(
        userId=patient,
        interventionId=iv,
        rehabilitationPlanId=plan,
        date=datetime.now(),
        status=["completed"],
    ).save()

    assert PatientInterventionLogs.objects.count() == 1

    client.delete(DELETE_URL.format(intervention_id=str(iv.pk)))

    assert PatientInterventionLogs.objects.count() == 0


def test_delete_get_method_not_allowed_on_single_route(mongo_mock):
    """The single-item route only supports DELETE, not GET."""
    iv = _make_intervention()

    resp = client.get(DELETE_URL.format(intervention_id=str(iv.pk)))

    assert resp.status_code == 405
