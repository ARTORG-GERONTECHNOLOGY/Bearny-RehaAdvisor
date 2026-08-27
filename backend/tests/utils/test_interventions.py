"""
Plan-assignment resolution helpers — utils/interventions.py
===========================================================

These primitives decide what "the plan already has this intervention" means, and every path that
writes RehabilitationPlan.interventions shares them: add_intervention_to_patient, the therapist
default recommendations applied at registration, template application via _upsert_intervention, and
the bulk recommendation apply.

Matching on interventionId alone treats two language variants of one intervention as unrelated
documents, which is how a plan ends up holding the same intervention twice. The patient and
therapist plan views then disagree about it, and a completion recorded against one assignment is
invisible on the other.

Framework: pytest + mongomock
"""

from datetime import datetime, timedelta

import mongomock
import pytest
from bson import ObjectId
from django.utils.timezone import make_aware
from mongoengine import connect, disconnect

from core.models import (
    Intervention,
    InterventionAssignment,
    Patient,
    RehabilitationPlan,
    Therapist,
    User,
)
from utils.interventions import (
    _canonical_assignment_for,
    _match_assignment_by_id,
    _safe_intervention,
    _upsert_intervention,
)


@pytest.fixture(autouse=True, scope="function")
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


def _variant(external_id, language, title):
    return Intervention(
        external_id=external_id,
        language=language,
        title=title,
        description="desc",
        content_type="Video",
    ).save()


def _plan(*interventions):
    th_user = User(username=f"th-{ObjectId()}", email="th@example.com", createdAt=datetime.now()).save()
    therapist = Therapist(userId=th_user, name="T", first_name="A", clinics=["Inselspital"]).save()
    p_user = User(username=f"pt-{ObjectId()}", email="pt@example.com", createdAt=datetime.now()).save()
    patient = Patient(userId=p_user, patient_code=f"PAT-{ObjectId()}", therapist=therapist).save()

    base = datetime.now() + timedelta(days=1)
    return RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime.now(),
        endDate=datetime.now() + timedelta(days=90),
        status="active",
        interventions=[
            InterventionAssignment(interventionId=iv, frequency="Daily", notes="", dates=[base]) for iv in interventions
        ],
    ).save()


def test_canonical_assignment_matches_a_different_language_variant():
    """The whole point: an EN request must find the assignment holding the DE variant."""
    en = _variant("EXT_1", "en", "Stretching")
    de = _variant("EXT_1", "de", "Dehnung")
    plan = _plan(de)

    assert _canonical_assignment_for(plan, en) is plan.interventions[0]
    assert _match_assignment_by_id(plan, en.id) is None, "id matching alone is what misses the variant"
    assert str(_safe_intervention(_canonical_assignment_for(plan, en)).id) == str(de.id)


def test_canonical_assignment_picks_the_first_of_several_duplicates():
    """
    On a plan that already holds duplicates the writer must merge into the first one - the assignment
    both get_patient_plan and get_patient_plan_for_therapist treat as canonical - rather than
    refusing or appending a third.
    """
    en = _variant("EXT_1", "en", "Stretching")
    de = _variant("EXT_1", "de", "Dehnung")
    fr = _variant("EXT_1", "fr", "Étirement")
    plan = _plan(de, en)

    assert _canonical_assignment_for(plan, fr) is plan.interventions[0]


def test_canonical_assignment_returns_none_when_not_on_the_plan():
    other = _variant("EXT_1", "en", "Stretching")
    plan = _plan(_variant("EXT_2", "en", "Walking"))

    assert _canonical_assignment_for(plan, other) is None


def test_canonical_assignment_falls_back_to_id_without_an_external_id():
    """external_id is required on new documents, so this path only serves legacy data."""
    legacy = Intervention(title="Legacy", description="d", content_type="Video")
    legacy.save(validate=False)
    plan = _plan(legacy)

    assert _canonical_assignment_for(plan, legacy) is plan.interventions[0]


def test_canonical_assignment_ignores_a_dangling_reference():
    """A deleted Intervention must not take down the walk over plan.interventions."""
    en = _variant("EXT_1", "en", "Stretching")
    doomed = _variant("EXT_2", "en", "Walking")
    plan = _plan(doomed, en)
    doomed.delete()
    plan.reload()

    assert _safe_intervention(plan.interventions[0]) is None
    assert _canonical_assignment_for(plan, en) is plan.interventions[1]


def test_upsert_intervention_merges_into_an_assigned_variant_instead_of_duplicating():
    """
    Regression: _upsert_intervention matched on interventionId only, so applying a template whose
    intervention resolved to a different language variant appended a second assignment for the same
    logical intervention - the data artifact the plan views then have to paper over.
    """
    en = _variant("EXT_1", "en", "Stretching")
    de = _variant("EXT_1", "de", "Dehnung")
    plan = _plan(de)
    new_dates = [datetime.now() + timedelta(days=i) for i in range(5, 8)]

    _upsert_intervention(plan, en, new_dates, notes="from template")

    assert len(plan.interventions) == 1, "A second assignment was appended for a variant already on the plan."
    merged_days = {d.date() for d in plan.interventions[0].dates}
    assert {d.date() for d in new_dates} <= merged_days


def test_upsert_intervention_still_appends_a_genuinely_new_intervention():
    en = _variant("EXT_1", "en", "Stretching")
    plan = _plan(en)
    other = _variant("EXT_2", "en", "Walking")

    _upsert_intervention(plan, other, [datetime.now() + timedelta(days=2)])

    assert len(plan.interventions) == 2


def test_upsert_intervention_overwrite_replaces_the_assigned_variants_future_dates():
    """
    Regression: the overwrite branch referenced make_aware/is_naive, neither of which this module
    imports, so "apply this template from date X" raised NameError whenever it found an existing
    assignment. Even imported it compared Mongo's naive dates against an aware effective_from, which
    raises in turn - so this asserts the truncation itself, not just that the call returns.
    """
    en = _variant("EXT_1", "en", "Stretching")
    de = _variant("EXT_1", "de", "Dehnung")
    plan = _plan(de)
    past = datetime.now() - timedelta(days=3)
    superseded = datetime.now() + timedelta(days=20)
    plan.interventions[0].dates = [past, superseded]
    plan.save()
    plan.reload()  # dates come back naive, the way every real caller sees them

    new_dates = [make_aware(datetime.now() + timedelta(days=i)) for i in range(5, 8)]
    _upsert_intervention(
        plan,
        en,
        new_dates,
        overwrite=True,
        effective_from=make_aware(datetime.now() + timedelta(days=1)),
    )

    assert len(plan.interventions) == 1, "Overwrite appended a duplicate instead of rewriting the assignment."
    days = {d.date() for d in plan.interventions[0].dates}
    assert past.date() in days, "Sessions before effective_from must survive an overwrite."
    assert superseded.date() not in days, "The superseded future session should have been dropped."
    assert {d.date() for d in new_dates} <= days
