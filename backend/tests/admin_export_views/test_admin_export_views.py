"""
Admin export view tests
— ``GET /api/admin/export/patients/``
— ``GET /api/admin/export/clinics/``
======================================

Coverage
--------
Patient CSV export
  * Returns 200 with Content-Type text/csv and Content-Disposition attachment.
  * Includes all patients when no clinic filter is given.
  * Includes all patients when clinics=all.
  * Filters correctly to selected clinic(s).
  * Excludes patients from clinics not in the requested list.
  * CSV has the expected header row.
  * CSV rows contain correct field values.
  * Multi-value fields (diagnosis, function) are semicolon-joined.
  * Returns 405 for non-GET requests.
  * Returns 200 empty CSV (header only) when no patients match the filter.

Clinics list endpoint
  * Returns 200 with a ``clinics`` array.
  * Array contains distinct, non-empty clinic names present in the DB.
  * Returns empty list when no patients exist.
  * Returns 405 for non-GET requests.

Test setup
----------
Each test uses the ``mongo_mock`` autouse fixture providing an isolated
in-memory mongomock connection.
"""

import csv
import io
from datetime import datetime

import mongomock
import pytest
from django.test import Client
from mongoengine import connect, disconnect

from core.models import Patient, Therapist, User

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


client = Client()

EXPORT_URL = "/api/admin/export/patients/"
CLINICS_URL = "/api/admin/export/clinics/"


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------


def _make_therapist(suffix="a"):
    user = User(
        username=f"therapist_{suffix}",
        email=f"th_{suffix}@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    return Therapist(
        userId=user,
        name=f"Last_{suffix}",
        first_name=f"First_{suffix}",
        specializations=[],
        clinics=[],
        default_recommendations=[],
    ).save()


def _make_patient(
    therapist,
    patient_code="PAT001",
    clinic="Inselspital",
    project="Project A",
    first_name="Alice",
    last_name="Smith",
    diagnosis=None,
    function=None,
):
    user = User(
        username=f"patient_{patient_code}",
        email=f"{patient_code}@example.com",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    return Patient(
        userId=user,
        patient_code=patient_code,
        therapist=therapist,
        name=last_name,
        first_name=first_name,
        clinic=clinic,
        project=project,
        diagnosis=diagnosis or [],
        function=function or [],
        reha_end_date=datetime(2025, 12, 31),
        duration=90,
        preferred_language="de",
    ).save()


def _parse_csv(response):
    """Return list of dicts from a CSV response."""
    text = response.content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


# ===========================================================================
# Patient CSV export — happy paths
# ===========================================================================


def test_export_returns_csv_content_type(mongo_mock):
    resp = client.get(EXPORT_URL)

    assert resp.status_code == 200
    assert "text/csv" in resp["Content-Type"]


def test_export_returns_attachment_header(mongo_mock):
    resp = client.get(EXPORT_URL)

    disposition = resp["Content-Disposition"]
    assert "attachment" in disposition
    assert "patients_export_" in disposition
    assert ".csv" in disposition


def test_export_all_returns_all_patients(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001", clinic="Inselspital")
    _make_patient(therapist, "P002", clinic="Bern")

    rows = _parse_csv(client.get(EXPORT_URL))

    codes = {r["patient_code"] for r in rows}
    assert "P001" in codes
    assert "P002" in codes


def test_export_clinics_all_param_returns_all_patients(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001", clinic="Inselspital")
    _make_patient(therapist, "P002", clinic="Leuven")

    rows = _parse_csv(client.get(EXPORT_URL + "?clinics=all"))

    assert len(rows) == 2


def test_export_filters_by_single_clinic(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001", clinic="Inselspital")
    _make_patient(therapist, "P002", clinic="Bern")

    rows = _parse_csv(client.get(EXPORT_URL + "?clinics=Inselspital"))

    assert len(rows) == 1
    assert rows[0]["patient_code"] == "P001"
    assert rows[0]["clinic"] == "Inselspital"


def test_export_filters_by_multiple_clinics(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001", clinic="Inselspital")
    _make_patient(therapist, "P002", clinic="Bern")
    _make_patient(therapist, "P003", clinic="Leuven")

    rows = _parse_csv(client.get(EXPORT_URL + "?clinics=Inselspital,Bern"))

    codes = {r["patient_code"] for r in rows}
    assert codes == {"P001", "P002"}
    assert "P003" not in codes


def test_export_csv_has_expected_headers(mongo_mock):
    resp = client.get(EXPORT_URL)
    text = resp.content.decode("utf-8")
    header_line = text.splitlines()[0]
    headers = [h.strip() for h in header_line.split(",")]

    for expected in [
        "clinic",
        "project",
        "patient_code",
        "first_name",
        "last_name",
        "therapist",
        "reha_end_date",
        "preferred_language",
    ]:
        assert expected in headers, f"Missing header: {expected}"


def test_export_row_contains_correct_field_values(mongo_mock):
    therapist = _make_therapist("x")
    _make_patient(
        therapist,
        patient_code="PAT999",
        clinic="Inselspital",
        project="RehaStudy",
        first_name="Zara",
        last_name="Doe",
        diagnosis=["Stroke"],
        function=["mobility", "strength"],
    )

    rows = _parse_csv(client.get(EXPORT_URL))
    assert len(rows) == 1
    row = rows[0]

    assert row["patient_code"] == "PAT999"
    assert row["clinic"] == "Inselspital"
    assert row["project"] == "RehaStudy"
    assert row["first_name"] == "Zara"
    assert row["last_name"] == "Doe"
    assert row["preferred_language"] == "de"
    assert row["reha_end_date"] == "2025-12-31"
    assert row["duration_days"] == "90"


def test_export_multivalued_fields_joined_by_semicolon(mongo_mock):
    therapist = _make_therapist()
    _make_patient(
        therapist,
        patient_code="MULTI01",
        diagnosis=["Stroke", "Parkinson"],
        function=["balance", "coordination"],
    )

    rows = _parse_csv(client.get(EXPORT_URL))
    row = rows[0]

    assert row["diagnosis"] == "Stroke; Parkinson"
    assert row["function"] == "balance; coordination"


def test_export_grouped_sorted_by_clinic(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P_Z", clinic="Zurich")
    _make_patient(therapist, "P_A", clinic="Aachen")
    _make_patient(therapist, "P_B", clinic="Bern")

    rows = _parse_csv(client.get(EXPORT_URL))
    clinic_order = [r["clinic"] for r in rows]

    assert clinic_order == sorted(clinic_order), "Rows should be sorted by clinic"


def test_export_empty_when_clinic_not_in_db(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001", clinic="Inselspital")

    rows = _parse_csv(client.get(EXPORT_URL + "?clinics=NonExistentClinic"))

    assert rows == []


def test_export_method_not_allowed(mongo_mock):
    resp = client.post(EXPORT_URL, {})
    assert resp.status_code == 405


# ===========================================================================
# Clinics list endpoint
# ===========================================================================


def test_clinics_returns_200(mongo_mock):
    resp = client.get(CLINICS_URL)
    assert resp.status_code == 200
    assert "clinics" in resp.json()


def test_clinics_returns_distinct_non_empty_names(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001", clinic="Inselspital")
    _make_patient(therapist, "P002", clinic="Inselspital")
    _make_patient(therapist, "P003", clinic="Bern")

    data = client.get(CLINICS_URL).json()
    assert sorted(data["clinics"]) == ["Bern", "Inselspital"]


def test_clinics_empty_when_no_patients(mongo_mock):
    data = client.get(CLINICS_URL).json()
    assert data["clinics"] == []


def test_clinics_method_not_allowed(mongo_mock):
    resp = client.post(CLINICS_URL, {})
    assert resp.status_code == 405
