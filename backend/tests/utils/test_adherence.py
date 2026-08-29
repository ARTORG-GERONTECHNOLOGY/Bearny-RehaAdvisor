"""
Adherence calculation tests
===========================

Covers ``utils.utils._adherence``, which backs the two percentages on the therapist
dashboard.

The function reads from two collections that store datetimes under *different*
conventions, and getting either wrong shifts a session onto the neighbouring day:

* ``InterventionAssignment.dates`` — naive means **UTC**, the instant Mongo stored.
* ``PatientInterventionLogs.date`` — naive means **local**, as ``mark_intervention_completed``
  writes it.

Note: ``tests/utils/test_utils.py`` builds a bare ``mongomock.MongoClient()`` that is
never handed to mongoengine, so document writes there reach the configured database.
This module registers the mock as the ``default`` mongoengine connection instead.
"""

from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

import mongomock
import pytest
from django.utils import timezone as dj_tz

from core.models import (
    Intervention,
    InterventionAssignment,
    Patient,
    PatientInterventionLogs,
    RehabilitationPlan,
    Therapist,
    User,
)
from utils.utils import _adherence


@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    """Isolated in-memory MongoDB for every test."""
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


def _setup(scheduled_dates):
    """User → Therapist → Patient → Intervention → RehabilitationPlan with one assignment."""
    th_user = User(username="adh_t", email="adh_t@example.com", phone="2", createdAt=datetime.now()).save()
    therapist = Therapist(userId=th_user, name="T", first_name="A", specializations=[], clinics=[]).save()
    user = User(username="adh_p", email="adh_p@example.com", phone="1", createdAt=datetime.now()).save()
    patient = Patient(userId=user, patient_code="ADH1", therapist=therapist).save()
    intervention = Intervention(
        external_id="adh_001",
        language="en",
        title="Walk",
        description="Walk",
        content_type="Video",
    ).save()
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime.now() - timedelta(days=10),
        endDate=datetime.now() + timedelta(days=10),
        status="active",
        interventions=[InterventionAssignment(interventionId=intervention, frequency="Daily", dates=scheduled_dates)],
    ).save()
    return patient, intervention, plan


def test_adherence_reads_plan_dates_as_utc_instants(mongo_mock):
    """
    Assignment dates come back from Mongo naive, where naive means UTC — the same convention
    both plan views use. Reading them as local time instead dates a session sitting within the
    UTC offset of midnight onto the previous day, so the adherence figure on the therapist
    dashboard disagreed with the session table beside it about which day the session fell on.
    """
    # 22:30 UTC is 00:30 local the *next* day in Europe/Zurich.
    scheduled_utc = datetime.combine(dj_tz.localdate() - timedelta(days=2), datetime.min.time()).replace(
        hour=22, minute=30
    )
    scheduled_local_day = dj_tz.localtime(scheduled_utc.replace(tzinfo=dt_timezone.utc)).date()
    assert scheduled_local_day != scheduled_utc.date(), "fixture must straddle local midnight"

    patient, intervention, plan = _setup([scheduled_utc])

    # The completion log is stored naive *local*, on the day the plan views show the session on.
    PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=plan,
        date=datetime.combine(scheduled_local_day, datetime.min.time()).replace(hour=9),
        status=["completed"],
    ).save()

    adh_7, adh_total = _adherence(patient)
    assert adh_total == 100, "scheduled day and completion day were bucketed differently"
    assert adh_7 == 100


def test_adherence_counts_a_midday_session_completed_the_same_day(mongo_mock):
    """A session far from either midnight is unambiguous and must stay at 100% under both readings."""
    day = dj_tz.localdate() - timedelta(days=2)
    scheduled_utc = datetime.combine(day, datetime.min.time()).replace(hour=12)

    patient, intervention, plan = _setup([scheduled_utc])

    PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=plan,
        date=datetime.combine(day, datetime.min.time()).replace(hour=14),
        status=["completed"],
    ).save()

    adh_7, adh_total = _adherence(patient)
    assert adh_total == 100
    assert adh_7 == 100


def test_adherence_reports_zero_when_the_scheduled_day_has_no_completion(mongo_mock):
    """A missed day still counts toward the denominator, so adherence drops rather than going None."""
    day = dj_tz.localdate() - timedelta(days=2)
    patient, _, _ = _setup([datetime.combine(day, datetime.min.time()).replace(hour=12)])

    adh_7, adh_total = _adherence(patient)
    assert adh_total == 0
    assert adh_7 == 0
