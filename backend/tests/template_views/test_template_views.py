"""
Template views tests
====================

Endpoints covered
-----------------
Phase 1 — Template CRUD
  ``GET  /api/templates/``                                 → ``template_list_create``
  ``POST /api/templates/``                                 → ``template_list_create``
  ``GET  /api/templates/<id>/``                            → ``template_detail``
  ``DELETE /api/templates/<id>/``                          → ``template_detail``
  ``PATCH /api/templates/<id>/``                           → ``template_detail``
  ``POST /api/templates/<id>/copy/``                       → ``copy_template``

Phase 2 — Intervention assignment & application
  ``POST   /api/templates/<id>/interventions/``            → ``template_intervention_assign``
  ``DELETE /api/templates/<id>/interventions/<int_id>/``   → ``template_intervention_remove``
  ``POST   /api/templates/<id>/apply/``                    → ``apply_named_template``

Phase 3 — Calendar preview
  ``GET  /api/templates/<id>/calendar/``                   → ``template_calendar``

Coverage goals
--------------
Happy-path
  * Therapist can list their own private templates and any public templates.
  * Other therapists' private templates are excluded from list and detail.
  * Creating a template returns the serialised document (201).
  * PATCH updates name/description/is_public (owner only).
  * DELETE removes the document from the collection (owner only).
  * Copying a template creates a new private copy owned by the requester.
  * Assigning an intervention to a template stores a schedule entry.
  * Assigning without a diagnosis key stores it under the ``_all`` sentinel.
  * Assigning twice for the same intervention+diagnosis replaces the block.
  * Removing an intervention (whole entry or single diagnosis key).
  * Applying a named template to an existing patient creates sessions.
  * Calendar endpoint returns ``items`` shaped identically to template-plan.
  * ``?diagnosis=`` filter on calendar returns only matching entries.

Input validation (400 / 404)
  * Missing or blank ``name`` on create → 400.
  * Name longer than 200 characters → 400.
  * Missing ``interventionId`` on assign → 400.
  * Missing ``end_day`` on assign → 400.
  * Invalid ObjectId on all endpoints → 400.
  * Non-existent template on all endpoints → 404.
  * Assigning a non-existent intervention → 404.
  * Applying to a non-existent patient → 400 / 404.
  * Applying with an invalid date string → 400.

Authorisation
  * Non-owner cannot DELETE, PATCH, or POST-to-interventions → 403.
  * Unauthenticated (no therapist profile resolving) → 403.

HTTP method enforcement (405)
  * Wrong verb is rejected on every endpoint.

Test setup
----------
The ``mongo_mock`` autouse fixture provides an isolated in-memory mongomock
connection for every test function.  All tests that require a valid therapist
session patch ``core.views.template_views._get_therapist`` to return the
pre-built Therapist document, avoiding the need for a real JWT token.
"""

import json
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from rest_framework.test import APIClient

from core.models import (
    DefaultInterventions,
    DiagnosisAssignmentSettings,
    Intervention,
    InterventionTemplate,
    Patient,
    RehabilitationPlan,
    Therapist,
    User,
)

# Minimal user-like object that satisfies DRF's IsAuthenticated check.
# The actual therapist resolution is handled by patching _get_therapist.
_AUTH_USER = SimpleNamespace(is_authenticated=True)

# ---------------------------------------------------------------------------
# mongomock fixture
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    """Isolated in-memory MongoDB for every test function."""
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
# Factory helpers
# ---------------------------------------------------------------------------


def _make_therapist(username="therapist1"):
    """Create a User + Therapist document, return (user, therapist)."""
    user = User(
        username=username,
        email=f"{username}@example.com",
        phone="123",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    therapist = Therapist(
        userId=user,
        name="Doe",
        first_name="John",
        specializations=["Cardiology"],
        clinics=["Inselspital"],
    ).save()
    return user, therapist


def _make_patient(therapist):
    """Create a User + Patient linked to the given therapist."""
    p_user = User(
        username=f"patient_{str(ObjectId())[-6:]}",
        email=f"p_{str(ObjectId())[-6:]}@example.com",
        phone="456",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    patient = Patient(
        userId=p_user,
        patient_code=f"PAT-{str(ObjectId())[-6:]}",
        name="Doe",
        first_name="Jane",
        access_word="word",
        age="30",
        therapist=therapist,
        clinic="Inselspital",
        sex="Male",
        diagnosis=["Stroke"],
        function=["Cardiology"],
        level_of_education="High School",
        professional_status="Employed Full-Time",
        marital_status="Single",
        lifestyle=[],
        personal_goals=[],
        reha_end_date=datetime.now() + timedelta(days=30),
    ).save()
    return p_user, patient


def _make_intervention():
    """Create and return a minimal Intervention document."""
    return Intervention(
        external_id=f"int_{str(ObjectId())[-8:]}",
        language="en",
        title="Stretching Exercise",
        description="Daily stretching.",
        content_type="Video",
        patient_types=[],
        keywords=["stretch"],
    ).save()


def _make_template(therapist, *, name="My Template", is_public=False, with_intervention=False):
    """
    Create and return an InterventionTemplate owned by ``therapist``.

    When ``with_intervention=True`` a single intervention is assigned to the
    template under the ``_all`` sentinel (no specific diagnosis).
    """
    tmpl = InterventionTemplate(
        name=name,
        description="A test template",
        is_public=is_public,
        created_by=therapist,
        specialization=None,
        diagnosis=None,
    ).save()

    if with_intervention:
        intervention = _make_intervention()
        block = DiagnosisAssignmentSettings(
            active=True,
            interval=1,
            unit="day",
            selected_days=[],
            start_day=1,
            end_day=10,
            suggested_execution_time=480,
        )
        tmpl.recommendations.append(
            DefaultInterventions(
                recommendation=intervention,
                diagnosis_assignments={"_all": [block]},
            )
        )
        tmpl.save()

    return tmpl


def _client(authenticated=True):
    """Return a fresh APIClient, optionally force-authenticated."""
    c = APIClient()
    if authenticated:
        c.force_authenticate(user=_AUTH_USER)
    return c


def _post_json(url, data, therapist=None):
    """POST JSON.  Patches _get_therapist if therapist is supplied."""
    c = _client(authenticated=therapist is not None)
    kwargs = dict(data=json.dumps(data), content_type="application/json")
    if therapist is not None:
        with patch("core.views.template_views._get_therapist", return_value=therapist):
            return c.post(url, **kwargs)
    return c.post(url, **kwargs)


def _get(url, therapist=None, **params):
    """GET with optional therapist patch and query-string params."""
    c = _client(authenticated=therapist is not None)
    if therapist is not None:
        with patch("core.views.template_views._get_therapist", return_value=therapist):
            return c.get(url, **params)
    return c.get(url, **params)


def _patch_json(url, data, therapist=None):
    """PATCH JSON with optional therapist patch."""
    c = _client(authenticated=therapist is not None)
    kwargs = dict(data=json.dumps(data), content_type="application/json")
    if therapist is not None:
        with patch("core.views.template_views._get_therapist", return_value=therapist):
            return c.patch(url, **kwargs)
    return c.patch(url, **kwargs)


def _delete(url, therapist=None, **params):
    """DELETE with optional therapist patch."""
    c = _client(authenticated=therapist is not None)
    if therapist is not None:
        with patch("core.views.template_views._get_therapist", return_value=therapist):
            return c.delete(url, **params)
    return c.delete(url, **params)


# ===========================================================================
# template_list_create — GET /api/templates/
# ===========================================================================

LIST_URL = "/api/templates/"


def test_list_templates_returns_own_private(mongo_mock):
    """
    GET /api/templates/ returns the requesting therapist's own private template.
    """
    _, therapist = _make_therapist()
    _make_template(therapist, name="Private Template", is_public=False)

    resp = _get(LIST_URL, therapist)

    assert resp.status_code == 200
    data = resp.json()
    assert "templates" in data
    names = [t["name"] for t in data["templates"]]
    assert "Private Template" in names


def test_list_templates_returns_public_from_others(mongo_mock):
    """
    GET /api/templates/ includes public templates owned by other therapists.
    """
    _, owner = _make_therapist("owner")
    _, viewer = _make_therapist("viewer")
    _make_template(owner, name="Public Template", is_public=True)

    resp = _get(LIST_URL, viewer)

    assert resp.status_code == 200
    names = [t["name"] for t in resp.json()["templates"]]
    assert "Public Template" in names


def test_list_templates_excludes_others_private(mongo_mock):
    """
    GET /api/templates/ excludes private templates owned by other therapists.
    """
    _, owner = _make_therapist("owner")
    _, viewer = _make_therapist("viewer")
    _make_template(owner, name="Their Private", is_public=False)

    resp = _get(LIST_URL, viewer)

    assert resp.status_code == 200
    names = [t["name"] for t in resp.json()["templates"]]
    assert "Their Private" not in names


def test_list_templates_filter_by_name(mongo_mock):
    """
    GET /api/templates/?name=Cardio returns only templates whose name
    contains "Cardio" (case-insensitive).
    """
    _, therapist = _make_therapist()
    _make_template(therapist, name="Cardio Rehab")
    _make_template(therapist, name="Stroke Recovery")

    resp = _get(LIST_URL, therapist, data={"name": "Cardio"})

    assert resp.status_code == 200
    names = [t["name"] for t in resp.json()["templates"]]
    assert "Cardio Rehab" in names
    assert "Stroke Recovery" not in names


def test_list_templates_unauthenticated(mongo_mock):
    """
    GET /api/templates/ without authentication returns 401 (DRF rejects before view runs).
    """
    resp = _get(LIST_URL)  # no therapist → not force_authenticated → 401
    assert resp.status_code == 401


def test_list_templates_method_not_allowed(mongo_mock):
    """
    DELETE on /api/templates/ returns 405.
    """
    _, therapist = _make_therapist()
    resp = _delete(LIST_URL, therapist)
    assert resp.status_code == 405


# ===========================================================================
# template_list_create — POST /api/templates/
# ===========================================================================


def test_create_template_success(mongo_mock):
    """
    POST /api/templates/ with valid data creates a template and returns 201
    with the serialised document including ``id``, ``name``, ``is_public``,
    ``intervention_count``, and ``recommendations``.
    """
    _, therapist = _make_therapist()
    payload = {"name": "New Template", "description": "For cardiac patients", "is_public": True}

    resp = _post_json(LIST_URL, payload, therapist)

    assert resp.status_code == 201, resp.content.decode()
    tmpl = resp.json()["template"]
    assert tmpl["name"] == "New Template"
    assert tmpl["description"] == "For cardiac patients"
    assert tmpl["is_public"] is True
    assert tmpl["intervention_count"] == 0
    assert "id" in tmpl


def test_create_template_minimal_name_only(mongo_mock):
    """
    POST with only a ``name`` field (omitting description and is_public)
    succeeds — both fields have defaults.
    """
    _, therapist = _make_therapist()

    resp = _post_json(LIST_URL, {"name": "Minimal"}, therapist)

    assert resp.status_code == 201
    assert resp.json()["template"]["name"] == "Minimal"


def test_create_template_missing_name(mongo_mock):
    """
    POST without a ``name`` field returns 400 with a ``field_errors.name``
    entry.
    """
    _, therapist = _make_therapist()

    resp = _post_json(LIST_URL, {"description": "No name"}, therapist)

    assert resp.status_code == 400
    assert "name" in resp.json().get("field_errors", {})


def test_create_template_blank_name(mongo_mock):
    """
    POST with an empty string ``name`` returns 400.
    """
    _, therapist = _make_therapist()

    resp = _post_json(LIST_URL, {"name": "  "}, therapist)

    assert resp.status_code == 400


def test_create_template_name_too_long(mongo_mock):
    """
    POST with a ``name`` longer than 200 characters returns 400.
    """
    _, therapist = _make_therapist()

    resp = _post_json(LIST_URL, {"name": "X" * 201}, therapist)

    assert resp.status_code == 400
    assert "name" in resp.json().get("field_errors", {})


def test_create_template_with_specialization_and_diagnosis(mongo_mock):
    """
    POST with optional ``specialization`` and ``diagnosis`` stores them.
    """
    _, therapist = _make_therapist()
    payload = {
        "name": "Cardio Template",
        "specialization": "Cardiology",
        "diagnosis": "Heart Attack",
    }

    resp = _post_json(LIST_URL, payload, therapist)

    assert resp.status_code == 201
    tmpl = resp.json()["template"]
    assert tmpl["specialization"] == "Cardiology"
    assert tmpl["diagnosis"] == "Heart Attack"


# ===========================================================================
# template_detail — GET /api/templates/<id>/
# ===========================================================================


def test_get_template_detail_owner(mongo_mock):
    """
    GET /api/templates/<id>/ by the owner returns 200 with the full document
    including the ``recommendations`` list.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)

    resp = _get(f"/api/templates/{tmpl.id}/", therapist)

    assert resp.status_code == 200
    body = resp.json()["template"]
    assert body["id"] == str(tmpl.id)
    assert "recommendations" in body
    assert body["intervention_count"] == 1


def test_get_template_detail_public_by_other(mongo_mock):
    """
    GET /api/templates/<id>/ on a public template by a non-owner returns 200.
    """
    _, owner = _make_therapist("owner")
    _, viewer = _make_therapist("viewer")
    tmpl = _make_template(owner, is_public=True)

    resp = _get(f"/api/templates/{tmpl.id}/", viewer)

    assert resp.status_code == 200
    assert resp.json()["template"]["id"] == str(tmpl.id)


def test_get_template_detail_private_by_other_returns_404(mongo_mock):
    """
    GET /api/templates/<id>/ on another therapist's private template returns
    404 (not exposed to prevent enumeration).
    """
    _, owner = _make_therapist("owner")
    _, viewer = _make_therapist("viewer")
    tmpl = _make_template(owner, is_public=False)

    resp = _get(f"/api/templates/{tmpl.id}/", viewer)

    assert resp.status_code == 404


def test_get_template_detail_not_found(mongo_mock):
    """
    GET /api/templates/<unknown-id>/ returns 404.
    """
    _, therapist = _make_therapist()

    resp = _get(f"/api/templates/{ObjectId()}/", therapist)

    assert resp.status_code == 404


def test_get_template_detail_invalid_id(mongo_mock):
    """
    GET /api/templates/not-an-object-id/ returns 400.
    """
    _, therapist = _make_therapist()

    resp = _get("/api/templates/not-an-object-id/", therapist)

    assert resp.status_code == 400


# ===========================================================================
# template_detail — DELETE /api/templates/<id>/
# ===========================================================================


def test_delete_template_owner(mongo_mock):
    """
    DELETE /api/templates/<id>/ by the owner returns 200 and removes the
    document from the collection.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)

    resp = _delete(f"/api/templates/{tmpl.id}/", therapist)

    assert resp.status_code == 200
    assert resp.json().get("success") is True
    assert InterventionTemplate.objects(pk=tmpl.id).first() is None


def test_delete_template_non_owner_forbidden(mongo_mock):
    """
    DELETE by a therapist who did not create the template (even on a public
    one) returns 403.
    """
    _, owner = _make_therapist("owner")
    _, other = _make_therapist("other")
    tmpl = _make_template(owner, is_public=True)

    resp = _delete(f"/api/templates/{tmpl.id}/", other)

    assert resp.status_code == 403
    # Document must still exist
    assert InterventionTemplate.objects(pk=tmpl.id).first() is not None


def test_delete_template_not_found(mongo_mock):
    """
    DELETE /api/templates/<unknown-id>/ returns 404.
    """
    _, therapist = _make_therapist()

    resp = _delete(f"/api/templates/{ObjectId()}/", therapist)

    assert resp.status_code == 404


# ===========================================================================
# template_detail — PATCH /api/templates/<id>/
# ===========================================================================


def test_patch_template_name(mongo_mock):
    """
    PATCH /api/templates/<id>/ with a new ``name`` updates the document and
    returns the updated serialisation.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, name="Old Name")

    resp = _patch_json(f"/api/templates/{tmpl.id}/", {"name": "New Name"}, therapist)

    assert resp.status_code == 200
    assert resp.json()["template"]["name"] == "New Name"


def test_patch_template_is_public(mongo_mock):
    """
    PATCH ``is_public`` flips visibility.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, is_public=False)

    resp = _patch_json(f"/api/templates/{tmpl.id}/", {"is_public": True}, therapist)

    assert resp.status_code == 200
    assert resp.json()["template"]["is_public"] is True


def test_patch_template_non_owner_forbidden(mongo_mock):
    """
    PATCH by a non-owner returns 403, document is unchanged.
    """
    _, owner = _make_therapist("owner")
    _, other = _make_therapist("other")
    tmpl = _make_template(owner, name="Immutable", is_public=True)

    resp = _patch_json(f"/api/templates/{tmpl.id}/", {"name": "Hacked"}, other)

    assert resp.status_code == 403
    assert InterventionTemplate.objects(pk=tmpl.id).first().name == "Immutable"


def test_patch_template_blank_name(mongo_mock):
    """
    PATCH with an empty ``name`` returns 400.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)

    resp = _patch_json(f"/api/templates/{tmpl.id}/", {"name": ""}, therapist)

    assert resp.status_code == 400


# ===========================================================================
# copy_template — POST /api/templates/<id>/copy/
# ===========================================================================

COPY_URL = "/api/templates/{id}/copy/"


def test_copy_template_creates_new_private_copy(mongo_mock):
    """
    POST /api/templates/<id>/copy/ by any therapist who can see the template
    returns 201 with a new document owned by the requester.
    """
    _, owner = _make_therapist("owner")
    _, copier = _make_therapist("copier")
    tmpl = _make_template(owner, name="Original", is_public=True)

    resp = _post_json(COPY_URL.format(id=tmpl.id), {}, copier)

    assert resp.status_code == 201
    copy = resp.json()["template"]
    assert "Copy of Original" in copy["name"]
    assert copy["is_public"] is False
    assert copy["id"] != str(tmpl.id)


def test_copy_template_custom_name(mongo_mock):
    """
    POST /api/templates/<id>/copy/ with a ``name`` body field uses that name.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, name="Original")

    resp = _post_json(COPY_URL.format(id=tmpl.id), {"name": "My Copy"}, therapist)

    assert resp.status_code == 201
    assert resp.json()["template"]["name"] == "My Copy"


def test_copy_private_template_by_non_owner_returns_404(mongo_mock):
    """
    Copying another therapist's private template returns 404.
    """
    _, owner = _make_therapist("owner")
    _, other = _make_therapist("other")
    tmpl = _make_template(owner, is_public=False)

    resp = _post_json(COPY_URL.format(id=tmpl.id), {}, other)

    assert resp.status_code == 404


def test_copy_template_not_found(mongo_mock):
    """
    POST /api/templates/<unknown-id>/copy/ returns 404.
    """
    _, therapist = _make_therapist()

    resp = _post_json(COPY_URL.format(id=ObjectId()), {}, therapist)

    assert resp.status_code == 404


def test_copy_template_get_not_allowed(mongo_mock):
    """
    GET /api/templates/<id>/copy/ returns 405.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)

    resp = _get(f"/api/templates/{tmpl.id}/copy/", therapist)

    assert resp.status_code == 405


# ===========================================================================
# template_intervention_assign — POST /api/templates/<id>/interventions/
# ===========================================================================

ASSIGN_URL = "/api/templates/{id}/interventions/"


def test_assign_intervention_with_diagnosis(mongo_mock):
    """
    POST /api/templates/<id>/interventions/ with a valid ``interventionId``
    and ``diagnosis`` stores the schedule block under that diagnosis key and
    returns 200 with the updated template.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)
    intervention = _make_intervention()

    payload = {
        "interventionId": str(intervention.id),
        "diagnosis": "Stroke",
        "start_day": 1,
        "end_day": 14,
        "interval": 2,
        "unit": "day",
        "selected_days": [],
        "suggested_execution_time": 480,
    }

    resp = _post_json(ASSIGN_URL.format(id=tmpl.id), payload, therapist)

    assert resp.status_code == 200, resp.content.decode()
    body = resp.json()["template"]
    assert body["intervention_count"] == 1
    recs = body["recommendations"]
    assert recs[0]["diagnosis_assignments"]["Stroke"][0]["start_day"] == 1
    assert recs[0]["diagnosis_assignments"]["Stroke"][0]["end_day"] == 14


def test_assign_intervention_without_diagnosis_uses_all_sentinel(mongo_mock):
    """
    POST without a ``diagnosis`` field stores the entry under the ``_all``
    key, which the calendar endpoint maps to an empty diagnosis string.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)
    intervention = _make_intervention()

    resp = _post_json(
        ASSIGN_URL.format(id=tmpl.id),
        {"interventionId": str(intervention.id), "end_day": 10},
        therapist,
    )

    assert resp.status_code == 200
    recs = resp.json()["template"]["recommendations"]
    assert "_all" in recs[0]["diagnosis_assignments"]


def test_assign_intervention_replaces_existing_block(mongo_mock):
    """
    Assigning the same intervention+diagnosis a second time replaces the
    previous block rather than appending a duplicate.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)
    intervention = _make_intervention()
    url = ASSIGN_URL.format(id=tmpl.id)

    # First assignment: days 1-10
    _post_json(url, {"interventionId": str(intervention.id), "end_day": 10}, therapist)
    # Second assignment: days 1-20
    resp = _post_json(url, {"interventionId": str(intervention.id), "end_day": 20}, therapist)

    assert resp.status_code == 200
    recs = resp.json()["template"]["recommendations"]
    assert len(recs) == 1  # still only one recommendation entry
    assert recs[0]["diagnosis_assignments"]["_all"][0]["end_day"] == 20


def test_assign_intervention_missing_id(mongo_mock):
    """
    POST without ``interventionId`` returns 400 with a
    ``field_errors.interventionId`` entry.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)

    resp = _post_json(ASSIGN_URL.format(id=tmpl.id), {"end_day": 10}, therapist)

    assert resp.status_code == 400
    assert "interventionId" in resp.json().get("field_errors", {})


def test_assign_intervention_missing_end_day(mongo_mock):
    """
    POST without ``end_day`` returns 400.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)
    intervention = _make_intervention()

    resp = _post_json(
        ASSIGN_URL.format(id=tmpl.id),
        {"interventionId": str(intervention.id)},
        therapist,
    )

    assert resp.status_code == 400
    assert "end_day" in resp.json().get("field_errors", {})


def test_assign_intervention_invalid_unit(mongo_mock):
    """
    POST with ``unit`` that is not day/week/month returns 400.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)
    intervention = _make_intervention()

    resp = _post_json(
        ASSIGN_URL.format(id=tmpl.id),
        {"interventionId": str(intervention.id), "end_day": 10, "unit": "hour"},
        therapist,
    )

    assert resp.status_code == 400
    assert "unit" in resp.json().get("field_errors", {})


def test_assign_intervention_not_found(mongo_mock):
    """
    POST with a valid but non-existent ``interventionId`` returns 404.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)

    resp = _post_json(
        ASSIGN_URL.format(id=tmpl.id),
        {"interventionId": str(ObjectId()), "end_day": 10},
        therapist,
    )

    assert resp.status_code == 404


def test_assign_intervention_non_owner_forbidden(mongo_mock):
    """
    Only the template creator can add interventions — a different therapist
    gets 403 even on a public template.
    """
    _, owner = _make_therapist("owner")
    _, other = _make_therapist("other")
    tmpl = _make_template(owner, is_public=True)
    intervention = _make_intervention()

    resp = _post_json(
        ASSIGN_URL.format(id=tmpl.id),
        {"interventionId": str(intervention.id), "end_day": 10},
        other,
    )

    assert resp.status_code == 403


def test_assign_intervention_template_not_found(mongo_mock):
    """
    POST to a non-existent template returns 404.
    """
    _, therapist = _make_therapist()
    intervention = _make_intervention()

    resp = _post_json(
        ASSIGN_URL.format(id=ObjectId()),
        {"interventionId": str(intervention.id), "end_day": 10},
        therapist,
    )

    assert resp.status_code == 404


def test_assign_intervention_get_not_allowed(mongo_mock):
    """
    GET /api/templates/<id>/interventions/ returns 405.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)

    resp = _get(f"/api/templates/{tmpl.id}/interventions/", therapist)

    assert resp.status_code == 405


# ===========================================================================
# template_intervention_remove — DELETE /api/templates/<id>/interventions/<int_id>/
# ===========================================================================

REMOVE_URL = "/api/templates/{tmpl_id}/interventions/{int_id}/"


def test_remove_intervention_whole_entry(mongo_mock):
    """
    DELETE /api/templates/<id>/interventions/<int_id>/ without a diagnosis
    query param removes the entire entry for that intervention from the
    template's recommendations list.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)

    int_id = str(tmpl.recommendations[0].recommendation.id)

    resp = _delete(REMOVE_URL.format(tmpl_id=tmpl.id, int_id=int_id), therapist)

    assert resp.status_code == 200
    assert resp.json()["template"]["intervention_count"] == 0


def test_remove_intervention_single_diagnosis(mongo_mock):
    """
    DELETE with ``?diagnosis=<dx>`` removes only that diagnosis block; if
    other blocks remain the entry stays.  Once the last block is removed the
    entire entry is dropped.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)
    intervention = _make_intervention()
    url = ASSIGN_URL.format(id=tmpl.id)

    # Assign the same intervention for two diagnoses
    _post_json(url, {"interventionId": str(intervention.id), "diagnosis": "Stroke", "end_day": 10}, therapist)
    _post_json(url, {"interventionId": str(intervention.id), "diagnosis": "Heart Attack", "end_day": 10}, therapist)

    # Remove only "Stroke"
    resp = _delete(
        REMOVE_URL.format(tmpl_id=tmpl.id, int_id=str(intervention.id)),
        therapist,
        QUERY_STRING=f"diagnosis=Stroke",
    )

    assert resp.status_code == 200
    recs = resp.json()["template"]["recommendations"]
    # Entry still exists but "Stroke" block is gone
    assert len(recs) == 1
    assert "Stroke" not in recs[0]["diagnosis_assignments"]
    assert "Heart Attack" in recs[0]["diagnosis_assignments"]


def test_remove_intervention_not_in_template(mongo_mock):
    """
    DELETE an intervention that is not present in the template returns 404.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)  # no recommendations
    intervention = _make_intervention()

    resp = _delete(
        REMOVE_URL.format(tmpl_id=tmpl.id, int_id=str(intervention.id)),
        therapist,
    )

    assert resp.status_code == 404


def test_remove_intervention_non_owner_forbidden(mongo_mock):
    """
    DELETE by a non-owner returns 403.
    """
    _, owner = _make_therapist("owner")
    _, other = _make_therapist("other")
    tmpl = _make_template(owner, is_public=True, with_intervention=True)
    int_id = str(tmpl.recommendations[0].recommendation.id)

    resp = _delete(REMOVE_URL.format(tmpl_id=tmpl.id, int_id=int_id), other)

    assert resp.status_code == 403


def test_remove_intervention_post_not_allowed(mongo_mock):
    """
    POST to the intervention removal URL returns 405.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)

    resp = _post_json(
        REMOVE_URL.format(tmpl_id=tmpl.id, int_id=str(ObjectId())),
        {},
        therapist,
    )

    assert resp.status_code == 405


# ===========================================================================
# apply_named_template — POST /api/templates/<id>/apply/
# ===========================================================================

APPLY_URL = "/api/templates/{id}/apply/"


def test_apply_template_success(mongo_mock):
    """
    POST /api/templates/<id>/apply/ with a valid patient and effectiveFrom
    date applies all template interventions and returns 200 with ``applied``
    and ``sessions_created`` counts.
    """
    _, therapist = _make_therapist()
    _, patient = _make_patient(therapist)
    tmpl = _make_template(therapist, with_intervention=True)

    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    payload = {
        "patientIds": [str(patient.id)],
        "effectiveFrom": tomorrow,
    }

    resp = _post_json(APPLY_URL.format(id=tmpl.id), payload, therapist)

    assert resp.status_code == 200, resp.content.decode()
    body = resp.json()
    assert body.get("success") is True
    assert body.get("applied") == 1
    assert body.get("sessions_created", 0) > 0


def test_apply_template_by_patient_code(mongo_mock):
    """
    POST with a ``patientIds`` entry that is the patient's ``patient_code``
    string (not an ObjectId) resolves the patient and succeeds.
    """
    _, therapist = _make_therapist()
    _, patient = _make_patient(therapist)
    tmpl = _make_template(therapist, with_intervention=True)

    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {"patientIds": [patient.patient_code], "effectiveFrom": tomorrow},
        therapist,
    )

    assert resp.status_code == 200
    assert resp.json()["applied"] == 1


def test_apply_template_missing_patient_id(mongo_mock):
    """
    POST without ``patientIds`` or ``diagnosis`` returns 400 with
    ``field_errors.patientIds``.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)

    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {"effectiveFrom": "2026-06-01"},
        therapist,
    )

    assert resp.status_code == 400
    assert "patientIds" in resp.json().get("field_errors", {})


def test_apply_template_missing_effective_from(mongo_mock):
    """
    POST without ``effectiveFrom`` returns 400 with
    ``field_errors.effectiveFrom``.
    """
    _, therapist = _make_therapist()
    _, patient = _make_patient(therapist)
    tmpl = _make_template(therapist, with_intervention=True)

    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {"patientIds": [str(patient.id)]},
        therapist,
    )

    assert resp.status_code == 400
    assert "effectiveFrom" in resp.json().get("field_errors", {})


def test_apply_template_invalid_effective_from(mongo_mock):
    """
    POST with a malformed date string returns 400.
    """
    _, therapist = _make_therapist()
    _, patient = _make_patient(therapist)
    tmpl = _make_template(therapist, with_intervention=True)

    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {"patientIds": [str(patient.id)], "effectiveFrom": "not-a-date"},
        therapist,
    )

    assert resp.status_code == 400


def test_apply_template_patient_not_found(mongo_mock):
    """
    POST with an unknown patient ObjectId in ``patientIds`` returns 404.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)

    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {"patientIds": [str(ObjectId())], "effectiveFrom": "2026-06-01"},
        therapist,
    )

    assert resp.status_code == 404


def test_apply_template_private_by_non_owner_returns_404(mongo_mock):
    """
    Applying another therapist's private template returns 404.
    """
    _, owner = _make_therapist("owner")
    _, other = _make_therapist("other")
    _, patient = _make_patient(other)
    tmpl = _make_template(owner, is_public=False, with_intervention=True)

    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {"patientIds": [str(patient.id)], "effectiveFrom": "2026-06-01"},
        other,
    )

    assert resp.status_code == 404


def test_apply_template_creates_rehabilitation_plan_if_none(mongo_mock):
    """
    When the patient has no existing RehabilitationPlan, applying a template
    creates one with the intervention sessions.
    """
    _, therapist = _make_therapist()
    _, patient = _make_patient(therapist)
    tmpl = _make_template(therapist, with_intervention=True)

    assert RehabilitationPlan.objects(patientId=patient).count() == 0

    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {"patientIds": [str(patient.id)], "effectiveFrom": tomorrow},
        therapist,
    )

    assert resp.status_code == 200
    assert RehabilitationPlan.objects(patientId=patient).count() == 1


def test_apply_template_get_not_allowed(mongo_mock):
    """
    GET /api/templates/<id>/apply/ returns 405.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)

    resp = _get(f"/api/templates/{tmpl.id}/apply/", therapist)

    assert resp.status_code == 405


# ===========================================================================
# template_calendar — GET /api/templates/<id>/calendar/
# ===========================================================================

CALENDAR_URL = "/api/templates/{id}/calendar/"


def test_calendar_empty_template(mongo_mock):
    """
    GET /api/templates/<id>/calendar/ for a template with no recommendations
    returns 200 with an empty ``items`` list.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)

    resp = _get(CALENDAR_URL.format(id=tmpl.id), therapist)

    assert resp.status_code == 200
    data = resp.json()
    assert "horizon_days" in data
    assert data["items"] == []


def test_calendar_with_intervention(mongo_mock):
    """
    GET /api/templates/<id>/calendar/ for a template that has one assigned
    intervention returns a non-empty ``items`` list; each item carries
    ``intervention``, ``diagnosis``, ``schedule``, ``occurrences``, and
    ``segments`` keys.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)

    resp = _get(CALENDAR_URL.format(id=tmpl.id), therapist)

    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    for key in ("intervention", "diagnosis", "schedule", "occurrences", "segments"):
        assert key in items[0], f"Expected key '{key}' in calendar item"


def test_calendar_occurrences_within_horizon(mongo_mock):
    """
    Every occurrence returned has a ``day`` value between 1 and
    ``horizon_days`` (default 84).
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)

    resp = _get(CALENDAR_URL.format(id=tmpl.id), therapist)

    data = resp.json()
    horizon = data["horizon_days"]
    for item in data["items"]:
        for occ in item["occurrences"]:
            assert 1 <= occ["day"] <= horizon, f"Occurrence day {occ['day']} out of range"


def test_calendar_custom_horizon(mongo_mock):
    """
    GET with ``?horizon_days=30`` restricts occurrences to the first 30 days.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)

    resp = _get(CALENDAR_URL.format(id=tmpl.id), therapist, data={"horizon_days": 30})

    data = resp.json()
    assert data["horizon_days"] == 30
    for item in data["items"]:
        for occ in item["occurrences"]:
            assert occ["day"] <= 30


def test_calendar_diagnosis_filter(mongo_mock):
    """
    GET with ``?diagnosis=Stroke`` returns only items whose diagnosis matches
    "Stroke" or is the ``_all`` sentinel.  Items assigned to a different
    diagnosis are excluded.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)
    int1 = _make_intervention()
    int2 = _make_intervention()
    url = ASSIGN_URL.format(id=tmpl.id)

    _post_json(url, {"interventionId": str(int1.id), "diagnosis": "Stroke", "end_day": 10}, therapist)
    _post_json(url, {"interventionId": str(int2.id), "diagnosis": "Heart Attack", "end_day": 10}, therapist)

    resp = _get(CALENDAR_URL.format(id=tmpl.id), therapist, data={"diagnosis": "Stroke"})

    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1  # only the Stroke item
    assert items[0]["diagnosis"] == "Stroke"


def test_calendar_private_by_non_owner_returns_404(mongo_mock):
    """
    GET on another therapist's private template returns 404.
    """
    _, owner = _make_therapist("owner")
    _, viewer = _make_therapist("viewer")
    tmpl = _make_template(owner, is_public=False)

    resp = _get(CALENDAR_URL.format(id=tmpl.id), viewer)

    assert resp.status_code == 404


def test_calendar_public_by_non_owner(mongo_mock):
    """
    GET on a public template by any therapist returns 200.
    """
    _, owner = _make_therapist("owner")
    _, viewer = _make_therapist("viewer")
    tmpl = _make_template(owner, is_public=True, with_intervention=True)

    resp = _get(CALENDAR_URL.format(id=tmpl.id), viewer)

    assert resp.status_code == 200
    assert len(resp.json()["items"]) >= 1


def test_calendar_template_not_found(mongo_mock):
    """
    GET /api/templates/<unknown-id>/calendar/ returns 404.
    """
    _, therapist = _make_therapist()

    resp = _get(CALENDAR_URL.format(id=ObjectId()), therapist)

    assert resp.status_code == 404


def test_calendar_invalid_id(mongo_mock):
    """
    GET /api/templates/not-an-id/calendar/ returns 400.
    """
    _, therapist = _make_therapist()

    resp = _get("/api/templates/not-an-id/calendar/", therapist)

    assert resp.status_code == 400


def test_calendar_post_not_allowed(mongo_mock):
    """
    POST /api/templates/<id>/calendar/ returns 405.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)

    resp = _post_json(CALENDAR_URL.format(id=tmpl.id), {}, therapist)

    assert resp.status_code == 405


# ===========================================================================
# Phase 4 — Ownership / created_by serialisation
# ===========================================================================


def test_serialize_template_created_by_is_user_id(mongo_mock):
    """
    ``created_by`` in the list response must be the *User* ObjectId — the
    value stored in ``authStore.id`` (from the JWT claim) — not the Therapist
    document's own ObjectId.

    Regression test for the bug where ``_serialize_template`` returned
    ``str(tmpl.created_by.id)`` (Therapist ObjectId) instead of
    ``str(tmpl.created_by.userId.id)`` (User ObjectId).
    """
    user, therapist = _make_therapist()
    _make_template(therapist)

    resp = _get(LIST_URL, therapist)

    assert resp.status_code == 200
    templates = resp.json()["templates"]
    assert len(templates) == 1

    created_by = templates[0]["created_by"]
    # Must equal the User ObjectId, not the Therapist ObjectId.
    assert created_by == str(user.id), (
        f"created_by should be user.id={user.id} but got {created_by}. " f"(therapist.id={therapist.id})"
    )
    assert created_by != str(therapist.id), "created_by must not be the Therapist ObjectId"


# ===========================================================================
# Phase 4 — copy_template with custom description
# ===========================================================================

COPY_URL = "/api/templates/{id}/copy/"


def test_copy_template_custom_description(mongo_mock):
    """
    POST /api/templates/<id>/copy/ with a ``description`` field in the body
    sets the copy's description to the supplied value instead of inheriting
    the original's description.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, is_public=True)
    _, copier = _make_therapist("copier")

    resp = _post_json(
        COPY_URL.format(id=tmpl.id),
        {"name": "My Copy", "description": "Custom description for the copy"},
        copier,
    )

    assert resp.status_code == 201
    data = resp.json()["template"]
    assert data["description"] == "Custom description for the copy"
    assert data["name"] == "My Copy"


def test_copy_template_inherits_description_when_not_supplied(mongo_mock):
    """
    POST /api/templates/<id>/copy/ without a ``description`` field inherits
    the original template's description.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, is_public=True)
    _, copier = _make_therapist("copier2")

    resp = _post_json(COPY_URL.format(id=tmpl.id), {}, copier)

    assert resp.status_code == 201
    data = resp.json()["template"]
    assert data["description"] == tmpl.description


def test_copy_template_empty_description_string(mongo_mock):
    """
    POST /api/templates/<id>/copy/ with ``description=""`` sets an empty
    description (not falls back to original).
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, is_public=True)
    _, copier = _make_therapist("copier3")

    resp = _post_json(COPY_URL.format(id=tmpl.id), {"description": ""}, copier)

    assert resp.status_code == 201
    data = resp.json()["template"]
    # Empty string is stripped → stored as ""
    assert data["description"] == ""


# ===========================================================================
# Phase 4 — apply_named_template multi-patient and diagnosis-bulk modes
# ===========================================================================

APPLY_URL = "/api/templates/{id}/apply/"


def test_apply_template_multi_patient_ids(mongo_mock):
    """
    POST /api/templates/<id>/apply/ with a ``patientIds`` list containing
    two valid patient ObjectIds applies the template to both patients and
    returns ``patients_affected == 2``.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)
    _, patient1 = _make_patient(therapist)
    _, patient2 = _make_patient(therapist)

    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {
            "patientIds": [str(patient1.id), str(patient2.id)],
            "effectiveFrom": "2025-01-01",
        },
        therapist,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["patients_affected"] == 2


def test_apply_template_multi_patient_codes(mongo_mock):
    """
    ``patientIds`` may contain patient_code strings (not just ObjectIds).
    The endpoint resolves both and applies the template.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)
    _, patient = _make_patient(therapist)

    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {
            "patientIds": [patient.patient_code],
            "effectiveFrom": "2025-01-01",
        },
        therapist,
    )

    assert resp.status_code == 200
    assert resp.json()["patients_affected"] == 1


def test_apply_template_one_unknown_patient_in_list(mongo_mock):
    """
    If any patient in ``patientIds`` cannot be resolved, the endpoint
    returns 404 (no partial application).
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)
    _, patient = _make_patient(therapist)

    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {
            "patientIds": [str(patient.id), str(ObjectId())],  # second one is fake
            "effectiveFrom": "2025-01-01",
        },
        therapist,
    )

    assert resp.status_code == 404


def test_apply_template_by_diagnosis_bulk(mongo_mock):
    """
    POST /api/templates/<id>/apply/ with ``diagnosis`` (no ``patientIds``)
    applies the template to all clinic patients whose diagnosis list contains
    that value, returning ``patients_affected`` equal to the count of matches.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)
    # _make_patient creates patients with diagnosis=["Stroke"]
    _, patient1 = _make_patient(therapist)
    _, patient2 = _make_patient(therapist)

    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {
            "diagnosis": "Stroke",
            "effectiveFrom": "2025-01-01",
        },
        therapist,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["patients_affected"] == 2


def test_apply_template_missing_both_patient_and_diagnosis(mongo_mock):
    """
    POST /api/templates/<id>/apply/ with neither ``patientIds`` nor
    ``diagnosis`` returns 400.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)

    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {"effectiveFrom": "2025-01-01"},
        therapist,
    )

    assert resp.status_code == 400
    body = resp.json()
    assert "patientIds" in body.get("field_errors", {}) or "error" in body


def test_apply_template_both_patient_ids_and_diagnosis_rejected(mongo_mock):
    """
    Supplying both ``patientIds`` and ``diagnosis`` is ambiguous and returns 400.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)
    _, patient = _make_patient(therapist)

    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {
            "patientIds": [str(patient.id)],
            "diagnosis": "Stroke",
            "effectiveFrom": "2025-01-01",
        },
        therapist,
    )

    assert resp.status_code == 400


def test_apply_template_diagnosis_no_matching_patients(mongo_mock):
    """
    POST /api/templates/<id>/apply/ with ``diagnosis`` that matches no clinic
    patients returns 200 with ``applied == 0`` and an informative message
    (no error is raised).
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist, with_intervention=True)

    resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {
            "diagnosis": "UnknownDiagnosis",
            "effectiveFrom": "2025-01-01",
        },
        therapist,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["applied"] == 0
    assert data["patients_affected"] == 0
    assert "message" in data


# ===========================================================================
# MongoEngine dirty-tracking regression tests
# These tests guard against silent data loss caused by in-place mutation of
# nested dicts inside EmbeddedDocument ListFields (MongoEngine does not detect
# such mutations, so .save() would silently drop the change).
# ===========================================================================


def test_assign_then_apply_produces_sessions(mongo_mock):
    """
    Regression: assigning an intervention and immediately applying the template
    must produce > 0 sessions.

    Previously, when the intervention was NEWLY added (i.e. existing=None path),
    this worked.  This test pins that behaviour so any regression in the creation
    path is caught quickly.
    """
    _, therapist = _make_therapist()
    _, patient = _make_patient(therapist)
    tmpl = _make_template(therapist)  # empty template
    intervention = _make_intervention()

    # Assign the intervention to the template
    assign_resp = _post_json(
        ASSIGN_URL.format(id=tmpl.id),
        {"interventionId": str(intervention.id), "end_day": 10},
        therapist,
    )
    assert assign_resp.status_code == 200

    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    apply_resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {"patientIds": [str(patient.id)], "effectiveFrom": tomorrow},
        therapist,
    )

    assert apply_resp.status_code == 200, apply_resp.content.decode()
    body = apply_resp.json()
    assert body["applied"] == 1, "apply must report 1 intervention applied"
    assert body["sessions_created"] > 0, "apply must create at least one session"


def test_update_existing_assignment_persisted_on_apply(mongo_mock):
    """
    Regression (MongoEngine dirty-tracking bug): updating an existing
    diagnosis block via a second POST to the assign endpoint and then applying
    the template must use the UPDATED schedule, not the original one.

    The bug: ``existing.diagnosis_assignments[key] = new_value`` mutates the
    dict in-place, which MongoEngine's change-tracker ignores — the old value
    is written to DB and apply produces 0 sessions (or uses wrong end_day).
    The fix is to reassign the whole dict: ``existing.diagnosis_assignments = da``.
    """
    _, therapist = _make_therapist()
    _, patient = _make_patient(therapist)
    tmpl = _make_template(therapist)
    intervention = _make_intervention()
    url = ASSIGN_URL.format(id=tmpl.id)

    # First assign: end_day=1 (very short — would create exactly 1 session)
    _post_json(url, {"interventionId": str(intervention.id), "end_day": 1}, therapist)

    # Second assign (UPDATE path — triggers the buggy branch): end_day=14
    update_resp = _post_json(
        url, {"interventionId": str(intervention.id), "end_day": 14}, therapist
    )
    assert update_resp.status_code == 200

    # The serialised template returned by the assign endpoint must already
    # reflect end_day=14 (checks in-memory correctness).
    recs = update_resp.json()["template"]["recommendations"]
    assert len(recs) == 1
    assert recs[0]["diagnosis_assignments"]["_all"][0]["end_day"] == 14

    # Apply the template — the DB-persisted schedule must also use end_day=14,
    # so sessions_created must be > 1 (14-day window).
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    apply_resp = _post_json(
        APPLY_URL.format(id=tmpl.id),
        {"patientIds": [str(patient.id)], "effectiveFrom": tomorrow},
        therapist,
    )
    assert apply_resp.status_code == 200, apply_resp.content.decode()
    body = apply_resp.json()
    assert body["applied"] == 1, "apply must find the intervention"
    assert body["sessions_created"] > 1, (
        "updated end_day=14 must produce more than 1 session; "
        "if sessions_created == 0 the dirty-tracking bug is back"
    )


def test_remove_diagnosis_block_persisted(mongo_mock):
    """
    Regression: removing a single diagnosis block via DELETE ?diagnosis=<key>
    must persist after the delete.

    The bug: ``rec.diagnosis_assignments.pop(key, None)`` mutates the dict
    in-place, so MongoEngine ignores it and the entry reappears after reload.
    The fix is to reassign the whole dict.
    """
    _, therapist = _make_therapist()
    tmpl = _make_template(therapist)
    intervention = _make_intervention()
    assign_url = ASSIGN_URL.format(id=tmpl.id)

    # Assign the same intervention under two different diagnosis keys
    _post_json(assign_url, {"interventionId": str(intervention.id), "end_day": 5, "diagnosis": "Stroke"}, therapist)
    _post_json(assign_url, {"interventionId": str(intervention.id), "end_day": 5, "diagnosis": "MS"}, therapist)

    # Verify both blocks exist
    detail_before = _get(f"/api/templates/{tmpl.id}/", therapist).json()
    recs_before = detail_before["template"]["recommendations"]
    assert len(recs_before) == 1
    da_before = recs_before[0]["diagnosis_assignments"]
    assert "Stroke" in da_before and "MS" in da_before

    # Remove just the "MS" block
    remove_resp = _delete(
        f"/api/templates/{tmpl.id}/interventions/{intervention.id}/?diagnosis=MS",
        therapist,
    )
    assert remove_resp.status_code == 200

    # Re-fetch and confirm "MS" is gone but "Stroke" remains
    detail_after = _get(f"/api/templates/{tmpl.id}/", therapist).json()
    recs_after = detail_after["template"]["recommendations"]
    assert len(recs_after) == 1, "intervention entry should still exist (Stroke block remains)"
    da_after = recs_after[0]["diagnosis_assignments"]
    assert "MS" not in da_after, "MS block must be removed from DB (dirty-tracking bug regression)"
    assert "Stroke" in da_after, "Stroke block must be untouched"
