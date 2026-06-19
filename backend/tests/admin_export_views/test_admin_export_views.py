"""
Admin export view tests
— ``GET /api/admin/export/patients/``
— ``GET /api/admin/export/clinics/``
======================================

Coverage
--------
ZIP export (patients endpoint)
  * Returns 200 with Content-Type application/zip and Content-Disposition attachment.
  * ZIP contains exactly the expected set of CSV filenames.
  * Clinic filter: all / single / multiple / unknown clinic.
  * patients.csv: rows, column headers, semicolon-joined list fields, sorted by clinic.
  * rehab_calendar.csv: one row per scheduled date per intervention assignment.
  * intervention_logs.csv: one row per PatientInterventionLog, correct fields.
  * intervention_feedback.csv: FeedbackEntry rows from intervention logs.
  * health_vitals.csv: PatientVitals rows, correct fields.
  * health_fitbit.csv: FitbitData rows resolved via user_id → patient.
  * questionnaire_answers.csv: PatientICFRating rows with question_key and rating.
  * thresholds.csv: current PatientThresholds per patient.
  * threshold_history.csv: PatientThresholdsSnapshot history rows.
  * activity_logs.csv: Logs documents linked to patients.
  * Returns 405 for non-GET requests.
  * Returns 200 empty ZIP (header-only CSVs) when no patients match the filter.

Clinics list endpoint
  * Returns 200 with a ``clinics`` array.
  * Returns distinct, non-empty, sorted clinic names.
  * Returns empty list when no patients exist.
  * Returns 405 for non-GET requests.

Test setup
----------
Each test uses the ``mongo_mock`` autouse fixture providing an isolated
in-memory mongomock connection.
"""

import csv
import io
import zipfile
from datetime import datetime
from types import SimpleNamespace

import mongomock
import pytest
from mongoengine import connect, disconnect
from rest_framework.test import APIClient

from core.models import (
    FeedbackEntry,
    FeedbackQuestion,
    FitbitData,
    Intervention,
    InterventionAssignment,
    Logs,
    Patient,
    PatientICFRating,
    PatientInterventionLogs,
    PatientThresholds,
    PatientThresholdsSnapshot,
    PatientVitals,
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


EXPORT_URL = "/api/admin/export/patients/"
CLINICS_URL = "/api/admin/export/clinics/"

# Populated by the autouse fixture below so every test uses an admin-authenticated client.
client: APIClient = None  # type: ignore[assignment]


@pytest.fixture(autouse=True)
def _setup_admin_client(mongo_mock):
    global client
    admin = _make_admin()
    c = APIClient()
    c.force_authenticate(user=SimpleNamespace(is_authenticated=True, id=str(admin.id)))
    client = c
    yield


EXPECTED_CSV_FILES = {
    "patients.csv",
    "rehab_calendar.csv",
    "intervention_logs.csv",
    "intervention_feedback.csv",
    "health_vitals.csv",
    "health_fitbit.csv",
    "questionnaire_answers.csv",
    "thresholds.csv",
    "threshold_history.csv",
    "activity_logs.csv",
}


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


def _make_intervention(external_id="iv_001", language="en"):
    return Intervention(
        external_id=external_id,
        language=language,
        title=f"Intervention {external_id}",
        description="desc",
        content_type="Video",
    ).save()


def _make_admin():
    user = User(
        username="admin_test",
        email="admin@test.example.com",
        role="Admin",
        isActive=True,
        createdAt=datetime.now(),
    )
    user.pwdhash = "x"
    user.save()
    return user


def _admin_client(admin_user):
    c = APIClient()
    c.force_authenticate(user=SimpleNamespace(is_authenticated=True, id=str(admin_user.id)))
    return c


def _open_zip(response):
    """Return a ZipFile object from the HTTP response bytes."""
    return zipfile.ZipFile(io.BytesIO(response.content))


def _read_csv_from_zip(zf, filename):
    """Return list of dicts for a named CSV inside the ZIP."""
    with zf.open(filename) as f:
        text = f.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


# ===========================================================================
# Security: authentication and role enforcement
# ===========================================================================


def test_export_requires_authentication(mongo_mock):
    # In test mode AlwaysAuthenticate makes every request authenticated, so we
    # get 403 (not admin) rather than 401 (unauthenticated).  Both prove the
    # endpoint is protected — the important assertion is that it is not 200.
    resp = APIClient().get(EXPORT_URL)
    assert resp.status_code in (401, 403)


def test_export_requires_admin_role(mongo_mock):
    therapist_user = User(
        username="th_sec", email="th_sec@example.com", role="Therapist", isActive=True, createdAt=datetime.now()
    )
    therapist_user.pwdhash = "x"
    therapist_user.save()
    c = APIClient()
    c.force_authenticate(user=SimpleNamespace(is_authenticated=True, id=str(therapist_user.id)))
    assert c.get(EXPORT_URL).status_code == 403


def test_clinics_requires_authentication(mongo_mock):
    # In test mode AlwaysAuthenticate authenticates every request, so the
    # admin check runs and returns 403 rather than 401.
    assert APIClient().get(CLINICS_URL).status_code in (401, 403)


def test_clinics_requires_admin_role(mongo_mock):
    patient_user = User(
        username="pt_sec", email="pt_sec@example.com", role="Patient", isActive=True, createdAt=datetime.now()
    )
    patient_user.pwdhash = "x"
    patient_user.save()
    c = APIClient()
    c.force_authenticate(user=SimpleNamespace(is_authenticated=True, id=str(patient_user.id)))
    assert c.get(CLINICS_URL).status_code == 403


# ===========================================================================
# ZIP structure and response headers
# ===========================================================================


def test_export_returns_zip_content_type(mongo_mock):
    resp = client.get(EXPORT_URL)
    assert resp.status_code == 200
    assert "application/zip" in resp["Content-Type"]


def test_export_returns_attachment_header(mongo_mock):
    resp = client.get(EXPORT_URL)
    disp = resp["Content-Disposition"]
    assert "attachment" in disp
    assert "export_" in disp
    assert ".zip" in disp


def test_export_zip_contains_all_expected_csv_files(mongo_mock):
    resp = client.get(EXPORT_URL)
    with _open_zip(resp) as zf:
        names = set(zf.namelist())
    assert EXPECTED_CSV_FILES == names


def test_export_method_not_allowed(mongo_mock):
    resp = client.post(EXPORT_URL, {})
    assert resp.status_code == 405


# ===========================================================================
# Clinic filtering
# ===========================================================================


def test_export_all_includes_all_patients(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001", clinic="Inselspital")
    _make_patient(therapist, "P002", clinic="Bern")

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "patients.csv")

    codes = {r["patient_code"] for r in rows}
    assert "P001" in codes and "P002" in codes


def test_export_clinics_all_param_returns_all(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001", clinic="Inselspital")
    _make_patient(therapist, "P002", clinic="Leuven")

    with _open_zip(client.get(EXPORT_URL + "?clinics=all")) as zf:
        rows = _read_csv_from_zip(zf, "patients.csv")

    assert len(rows) == 2


def test_export_filters_by_single_clinic(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001", clinic="Inselspital")
    _make_patient(therapist, "P002", clinic="Bern")

    with _open_zip(client.get(EXPORT_URL + "?clinics=Inselspital")) as zf:
        rows = _read_csv_from_zip(zf, "patients.csv")

    assert len(rows) == 1 and rows[0]["patient_code"] == "P001"


def test_export_filters_by_multiple_clinics(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001", clinic="Inselspital")
    _make_patient(therapist, "P002", clinic="Bern")
    _make_patient(therapist, "P003", clinic="Leuven")

    with _open_zip(client.get(EXPORT_URL + "?clinics=Inselspital,Bern")) as zf:
        rows = _read_csv_from_zip(zf, "patients.csv")

    codes = {r["patient_code"] for r in rows}
    assert codes == {"P001", "P002"}


def test_export_empty_when_clinic_not_in_db(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001", clinic="Inselspital")

    with _open_zip(client.get(EXPORT_URL + "?clinics=NonExistent")) as zf:
        rows = _read_csv_from_zip(zf, "patients.csv")

    assert rows == []


# ===========================================================================
# patients.csv
# ===========================================================================


def test_patients_csv_has_expected_headers(mongo_mock):
    resp = client.get(EXPORT_URL)
    with _open_zip(resp) as zf:
        rows = _read_csv_from_zip(zf, "patients.csv")

    # Even with no patients, the header row must define the keys
    with _open_zip(resp) as zf:
        with zf.open("patients.csv") as f:
            header = f.read().decode("utf-8").splitlines()[0]
    for col in (
        "clinic",
        "project",
        "patient_code",
        "first_name",
        "last_name",
        "therapist",
        "reha_end_date",
        "preferred_language",
    ):
        assert col in header


def test_patients_csv_correct_field_values(mongo_mock):
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

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "patients.csv")

    assert len(rows) == 1
    row = rows[0]
    assert row["patient_code"] == "PAT999"
    assert row["clinic"] == "Inselspital"
    assert row["first_name"] == "Zara"
    assert row["last_name"] == "Doe"
    assert row["diagnosis"] == "Stroke"
    assert row["function"] == "mobility; strength"
    assert row["reha_end_date"] == "2025-12-31"


def test_patients_csv_sorted_by_clinic(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P_Z", clinic="Zurich")
    _make_patient(therapist, "P_A", clinic="Aachen")
    _make_patient(therapist, "P_B", clinic="Bern")

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "patients.csv")

    clinics = [r["clinic"] for r in rows]
    assert clinics == sorted(clinics)


# ===========================================================================
# rehab_calendar.csv
# ===========================================================================


def test_rehab_calendar_csv_contains_scheduled_dates(mongo_mock):
    therapist = _make_therapist()
    patient = _make_patient(therapist, "P001", clinic="Inselspital")
    intervention = _make_intervention()

    RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime(2025, 1, 1),
        endDate=datetime(2025, 3, 31),
        status="active",
        interventions=[
            InterventionAssignment(
                interventionId=intervention,
                frequency="daily",
                dates=[datetime(2025, 1, 5), datetime(2025, 1, 6)],
                notes="warm up",
            )
        ],
    ).save()

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "rehab_calendar.csv")

    assert len(rows) == 2
    assert rows[0]["patient_code"] == "P001"
    assert rows[0]["clinic"] == "Inselspital"
    assert rows[0]["intervention_external_id"] == "iv_001"
    assert rows[0]["scheduled_date"] == "2025-01-05"
    assert rows[0]["frequency"] == "daily"
    assert rows[0]["notes"] == "warm up"


def test_rehab_calendar_empty_without_plans(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001")

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "rehab_calendar.csv")

    assert rows == []


# ===========================================================================
# intervention_logs.csv
# ===========================================================================


def test_intervention_logs_csv_contains_log_rows(mongo_mock):
    therapist = _make_therapist()
    patient = _make_patient(therapist, "P001", clinic="Inselspital")
    intervention = _make_intervention()
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime(2025, 1, 1),
        endDate=datetime(2025, 3, 31),
        status="active",
    ).save()

    PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=plan,
        date=datetime(2025, 1, 10),
        status=["completed"],
        comments="felt good",
    ).save()

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "intervention_logs.csv")

    assert len(rows) == 1
    assert rows[0]["patient_code"] == "P001"
    assert rows[0]["clinic"] == "Inselspital"
    assert rows[0]["status"] == "completed"
    assert rows[0]["comments"] == "felt good"
    assert rows[0]["date"] == "2025-01-10"


# ===========================================================================
# intervention_feedback.csv
# ===========================================================================


def test_intervention_feedback_csv_contains_feedback_entries(mongo_mock):
    therapist = _make_therapist()
    patient = _make_patient(therapist, "P001", clinic="Inselspital")
    intervention = _make_intervention()
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime(2025, 1, 1),
        endDate=datetime(2025, 3, 31),
        status="active",
    ).save()

    question = FeedbackQuestion(
        questionSubject="Intervention",
        questionKey="pain_level",
        answer_type="select",
    ).save()

    PatientInterventionLogs(
        userId=patient,
        interventionId=intervention,
        rehabilitationPlanId=plan,
        date=datetime(2025, 1, 10),
        status=["completed"],
        feedback=[FeedbackEntry(questionId=question, comment="no pain")],
    ).save()

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "intervention_feedback.csv")

    assert len(rows) == 1
    assert rows[0]["patient_code"] == "P001"
    assert rows[0]["question_key"] == "pain_level"
    assert rows[0]["comment"] == "no pain"


# ===========================================================================
# health_vitals.csv
# ===========================================================================


def test_health_vitals_csv_contains_vitals_rows(mongo_mock):
    therapist = _make_therapist()
    patient = _make_patient(therapist, "P001", clinic="Inselspital")

    PatientVitals(
        user=patient.userId,
        patientId=patient,
        date=datetime(2025, 2, 1),
        weight_kg=72.5,
        bp_sys=120,
        bp_dia=80,
        source="manual",
    ).save()

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "health_vitals.csv")

    assert len(rows) == 1
    assert rows[0]["patient_code"] == "P001"
    assert rows[0]["clinic"] == "Inselspital"
    assert rows[0]["weight_kg"] == "72.5"
    assert rows[0]["bp_sys"] == "120"
    assert rows[0]["bp_dia"] == "80"
    assert rows[0]["source"] == "manual"


# ===========================================================================
# health_fitbit.csv
# ===========================================================================


def test_health_fitbit_csv_contains_fitbit_rows(mongo_mock):
    therapist = _make_therapist()
    patient = _make_patient(therapist, "P001", clinic="Inselspital")

    FitbitData(
        user=patient.userId,
        date=datetime(2025, 3, 1),
        steps=8500,
        active_minutes=45,
        resting_heart_rate=62,
        calories=2100.0,
        distance=6.2,
    ).save()

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "health_fitbit.csv")

    assert len(rows) == 1
    assert rows[0]["patient_code"] == "P001"
    assert rows[0]["clinic"] == "Inselspital"
    assert rows[0]["steps"] == "8500"
    assert rows[0]["active_minutes"] == "45"
    assert rows[0]["resting_heart_rate"] == "62"


# ===========================================================================
# questionnaire_answers.csv
# ===========================================================================


def test_questionnaire_answers_csv_contains_icf_ratings(mongo_mock):
    therapist = _make_therapist()
    patient = _make_patient(therapist, "P001", clinic="Inselspital")

    question = FeedbackQuestion(
        questionSubject="Healthstatus",
        questionKey="mobility_icf",
        answer_type="select",
        icfCode="d450",
    ).save()

    PatientICFRating(
        questionId=question,
        patientId=patient,
        icfCode="d450",
        date=datetime(2025, 4, 1),
        rating=2,
    ).save()

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "questionnaire_answers.csv")

    assert len(rows) == 1
    assert rows[0]["patient_code"] == "P001"
    assert rows[0]["clinic"] == "Inselspital"
    assert rows[0]["icf_code"] == "d450"
    assert rows[0]["question_key"] == "mobility_icf"
    assert rows[0]["rating"] == "2"


# ===========================================================================
# thresholds.csv
# ===========================================================================


def test_thresholds_csv_contains_current_thresholds(mongo_mock):
    therapist = _make_therapist()
    patient = _make_patient(therapist, "P001", clinic="Inselspital")
    # Thresholds are an embedded doc with defaults; update a value to verify
    patient.thresholds.steps_goal = 12000
    patient.save()

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "thresholds.csv")

    assert len(rows) == 1
    assert rows[0]["patient_code"] == "P001"
    assert rows[0]["steps_goal"] == "12000"


# ===========================================================================
# threshold_history.csv
# ===========================================================================


def test_threshold_history_csv_contains_snapshots(mongo_mock):
    therapist = _make_therapist()
    patient = _make_patient(therapist, "P001", clinic="Inselspital")

    snap = PatientThresholdsSnapshot(
        effective_from=datetime(2025, 1, 1),
        changed_by="Therapist",
        reason="increased goal",
        thresholds=PatientThresholds(steps_goal=11000),
    )
    patient.thresholds_history = [snap]
    patient.save()

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "threshold_history.csv")

    assert len(rows) == 1
    assert rows[0]["patient_code"] == "P001"
    assert rows[0]["changed_by"] == "Therapist"
    assert rows[0]["reason"] == "increased goal"
    assert rows[0]["steps_goal"] == "11000"
    assert rows[0]["effective_from"].startswith("2025-01-01")


# ===========================================================================
# activity_logs.csv
# ===========================================================================


def test_activity_logs_csv_contains_patient_logs(mongo_mock):
    therapist = _make_therapist()
    patient = _make_patient(therapist, "P001", clinic="Inselspital")

    Logs(
        userId=patient.userId,
        action="INTERVENTION_COMPLETE",
        timestamp=datetime(2025, 5, 1),
        actor_role="Patient",
        patient=patient,
        details="completed session",
    ).save()

    with _open_zip(client.get(EXPORT_URL)) as zf:
        rows = _read_csv_from_zip(zf, "activity_logs.csv")

    assert len(rows) == 1
    assert rows[0]["patient_code"] == "P001"
    assert rows[0]["clinic"] == "Inselspital"
    assert rows[0]["action"] == "INTERVENTION_COMPLETE"
    assert rows[0]["actor_role"] == "Patient"
    assert rows[0]["details"] == "completed session"


# ===========================================================================
# Clinics list endpoint
# ===========================================================================


def test_clinics_returns_200(mongo_mock):
    resp = client.get(CLINICS_URL)
    assert resp.status_code == 200
    assert "clinics" in resp.json()


def test_clinics_returns_distinct_sorted_names(mongo_mock):
    therapist = _make_therapist()
    _make_patient(therapist, "P001", clinic="Inselspital")
    _make_patient(therapist, "P002", clinic="Inselspital")
    _make_patient(therapist, "P003", clinic="Bern")

    data = client.get(CLINICS_URL).json()
    assert data["clinics"] == ["Bern", "Inselspital"]


def test_clinics_empty_when_no_patients(mongo_mock):
    assert client.get(CLINICS_URL).json()["clinics"] == []


def test_clinics_method_not_allowed(mongo_mock):
    assert client.post(CLINICS_URL, {}).status_code == 405
