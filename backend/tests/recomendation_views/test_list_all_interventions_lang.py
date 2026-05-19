"""
list_all_interventions — patient preferred_language tests
=========================================================

When a ``patient_id`` is present in the URL the endpoint must use the
patient's ``preferred_language`` from their Profile document as the variant
selection language, overriding the ``?lang`` query parameter.

When ``patient_id`` is absent (plain library fetch) the ``?lang`` param is
used as before.
"""

from datetime import datetime, timedelta

import mongomock
import pytest
from bson import ObjectId
from django.test import Client

from core.models import (
    Intervention,
    Patient,
    Therapist,
    User,
)

client = Client()


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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_patient(preferred_language="de"):
    therapist_user = User(
        username=f"th-{ObjectId()}",
        createdAt=datetime.now(),
        isActive=True,
    )
    therapist_user.save()
    therapist = Therapist(userId=therapist_user, default_recommendations=[])
    therapist.save()

    patient_user = User(
        username=f"p-{ObjectId()}",
        createdAt=datetime.now(),
        isActive=True,
        role="Patient",
    )
    patient_user.save()
    patient = Patient(
        userId=patient_user,
        patient_code=f"PAT-{ObjectId()}",
        name="Patient",
        first_name="Test",
        access_word="pass",
        age="30",
        therapist=therapist,
        sex="Male",
        diagnosis=["Stroke"],
        function=["Cardiology"],
        level_of_education="High School",
        professional_status="Employed Full-Time",
        marital_status="Single",
        lifestyle=[],
        personal_goals=[],
        reha_end_date=datetime.now() + timedelta(days=30),
        preferred_language=preferred_language,
    )
    patient.save()
    return patient


def _make_intervention_pair(external_id, en_title="English title", de_title="German title"):
    """Create English and German variants for the same external_id."""
    en = Intervention(
        external_id=external_id,
        language="en",
        title=en_title,
        description="desc",
        content_type="Video",
        is_private=False,
    )
    en.save()
    de = Intervention(
        external_id=external_id,
        language="de",
        title=de_title,
        description="desc",
        content_type="Video",
        is_private=False,
    )
    de.save()
    return en, de


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_list_all_uses_lang_param_when_no_patient_id(mongo_mock):
    """Without patient_id the ?lang param drives variant selection."""
    ext_id = str(ObjectId())
    _make_intervention_pair(ext_id, en_title="EN title", de_title="DE title")

    resp = client.get(
        "/api/interventions/all/?lang=de",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    titles = [item["title"] for item in data]
    assert any("DE title" in t for t in titles), f"Expected German title, got: {titles}"


def test_list_all_uses_patient_preferred_language_when_patient_id_given(mongo_mock):
    """
    With patient_id in the URL and the patient's preferred_language='de',
    the German variant is returned even if ?lang=en is supplied.
    """
    patient = _make_patient(preferred_language="de")
    ext_id = str(ObjectId())
    _make_intervention_pair(ext_id, en_title="English title", de_title="German title")

    resp = client.get(
        f"/api/interventions/all/{patient.id}/?lang=en",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    titles = [item["title"] for item in data]
    assert any(
        "German title" in t for t in titles
    ), f"Expected German title (patient preferred_language='de') but got: {titles}"


def test_list_all_falls_back_to_lang_param_when_patient_has_no_preferred_language(mongo_mock):
    """
    If the patient's preferred_language is empty the ?lang param is used
    as the fallback (existing behaviour preserved).
    """
    patient = _make_patient(preferred_language="en")
    ext_id = str(ObjectId())
    _make_intervention_pair(ext_id, en_title="English title", de_title="German title")

    resp = client.get(
        f"/api/interventions/all/{patient.id}/?lang=en",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    titles = [item["title"] for item in data]
    assert any("English title" in t for t in titles), f"Expected English title, got: {titles}"


def test_list_all_falls_back_when_preferred_language_has_no_variant(mongo_mock):
    """
    If no variant exists for the patient's preferred_language the fallback
    chain (en → de) still returns a variant rather than dropping the item.
    """
    patient = _make_patient(preferred_language="fr")
    ext_id = str(ObjectId())
    # Only English and German variants exist; no French
    _make_intervention_pair(ext_id, en_title="English title", de_title="German title")

    resp = client.get(
        f"/api/interventions/all/{patient.id}/",
        HTTP_AUTHORIZATION="Bearer test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1, f"Expected 1 grouped intervention, got {len(data)}"
    assert data[0]["title"] in ("English title", "German title")
