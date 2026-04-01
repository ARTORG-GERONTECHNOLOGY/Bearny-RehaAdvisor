"""
Wearables → REDCap service tests
=================================

Unit and integration tests for core/services/wearables_redcap_service.py

Coverage
--------
Pure-function unit tests (no DB):
  - _fmt_dmy              date formatted as DD-MM-YYYY
  - _format_sleep         COMPASS: integer hours / COPAIN: HH:MM
  - _pick_best_wear_week  picks ISO week with highest total wear_time_minutes
  - _compute_averages     per-field daily averages, correct sleep format
  - _resolve_event_names  priority: arg > env var > per-project default

DB-backed tests (mongomock):
  - compute_wearables_summary
      · raises ValueError when reha_end_date is missing
      · returns None for both periods when no Fitbit data exists
      · returns correct averages when data exists in baseline period
      · applies study_end_date if set; falls back to +26 weeks otherwise
      · selects the week with highest wear time, not the first week
      · uses correct sleep format per project (hours vs HH:MM)
  - export_wearables_to_redcap
      · raises ValueError when patient has no project
      · raises ValueError when no REDCap record is found
      · writes correct payload to REDCap including record_id, event name,
        wearables_complete="1", and date_dmy-formatted dates
      · returns "skipped" for a period with no Fitbit data
      · captures RedcapError and returns "error: ..." string
"""

import json
from datetime import datetime, timedelta
from datetime import timezone as dt_tz
from types import SimpleNamespace
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId

import core.services.wearables_redcap_service as svc
from core.models import FitbitData, Patient, SleepData, Therapist, User
from core.services.redcap_service import RedcapError
from core.services.wearables_redcap_service import (
    _compute_averages,
    _fmt_dmy,
    _format_sleep,
    _pick_best_wear_week,
    _resolve_event_names,
    compute_wearables_summary,
    export_wearables_to_redcap,
)

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


def _make_patient(project="COMPASS", reha_end_date=None, study_end_date=None):
    """Create a minimal User + Therapist + Patient graph."""
    th_user = User(
        username=f"th-{ObjectId()}",
        email=f"th-{ObjectId()}@example.com",
        role="Therapist",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    th = Therapist(userId=th_user, clinics=["Inselspital"], projects=[project]).save()

    pt_user = User(
        username=f"pt-{ObjectId()}",
        email=f"pt-{ObjectId()}@example.com",
        role="Patient",
        createdAt=datetime.now(),
        isActive=True,
    ).save()
    patient = Patient(
        userId=pt_user,
        patient_code=f"P-{ObjectId()}",
        therapist=th,
        project=project,
        reha_end_date=reha_end_date,
        study_end_date=study_end_date,
    ).save()
    return pt_user, patient


def _make_fitbit_day(user, date: datetime, steps=5000, active_min=30, inactive_min=300, wear_min=600, sleep_ms=None):
    """Save a single FitbitData record and return it."""
    sleep = SleepData(sleep_duration=sleep_ms) if sleep_ms is not None else None
    return FitbitData(
        user=user,
        date=date,
        steps=steps,
        active_minutes=active_min,
        inactivity_minutes=inactive_min,
        wear_time_minutes=wear_min,
        sleep=sleep,
    ).save()


# ---------------------------------------------------------------------------
# Pure-function unit tests
# ---------------------------------------------------------------------------


def test_fmt_dmy():
    d = datetime(2024, 3, 5, tzinfo=dt_tz.utc)
    assert _fmt_dmy(d) == "05-03-2024"

    d2 = datetime(2024, 12, 31, tzinfo=dt_tz.utc)
    assert _fmt_dmy(d2) == "31-12-2024"


class TestFormatSleep:
    def test_compass_integer_hours(self):
        # 450 minutes = 7.5 hours → rounds to 8
        assert _format_sleep(450, "hours_int") == "8"
        # 420 minutes = 7.0 hours exactly
        assert _format_sleep(420, "hours_int") == "7"

    def test_copain_hhmm(self):
        # 450 minutes = 07:30
        assert _format_sleep(450, "hhmm") == "07:30"
        # 495 minutes = 08:15
        assert _format_sleep(495, "hhmm") == "08:15"
        # 0 minutes = 00:00
        assert _format_sleep(0, "hhmm") == "00:00"
        # 23h59m = 1439 minutes
        assert _format_sleep(1439, "hhmm") == "23:59"

    def test_unknown_format_falls_back_to_hours_int(self):
        # unknown format treated as hours_int
        assert _format_sleep(480, "unknown") == "8"


class TestPickBestWearWeek:
    def test_empty_returns_none(self):
        assert _pick_best_wear_week([]) is None

    def test_single_day_returns_that_week(self):
        user, patient = _make_patient()
        day = datetime(2024, 3, 4, tzinfo=dt_tz.utc)  # ISO week 10
        r = _make_fitbit_day(user, day, wear_min=300)
        result = _pick_best_wear_week([r])
        assert result is not None
        _, _, records = result
        assert len(records) == 1

    def test_picks_week_with_highest_wear_time(self):
        user, patient = _make_patient()
        # Week A (ISO 2024-W10): 3 days, total wear = 100+100+100 = 300
        week_a = [
            _make_fitbit_day(user, datetime(2024, 3, 4, tzinfo=dt_tz.utc), wear_min=100),
            _make_fitbit_day(user, datetime(2024, 3, 5, tzinfo=dt_tz.utc), wear_min=100),
            _make_fitbit_day(user, datetime(2024, 3, 6, tzinfo=dt_tz.utc), wear_min=100),
        ]
        # Week B (ISO 2024-W11): 3 days, total wear = 200+200+200 = 600  ← best
        week_b = [
            _make_fitbit_day(user, datetime(2024, 3, 11, tzinfo=dt_tz.utc), wear_min=200),
            _make_fitbit_day(user, datetime(2024, 3, 12, tzinfo=dt_tz.utc), wear_min=200),
            _make_fitbit_day(user, datetime(2024, 3, 13, tzinfo=dt_tz.utc), wear_min=200),
        ]
        result = _pick_best_wear_week(week_a + week_b)
        assert result is not None
        _, _, records = result
        assert set(r.date for r in records) == set(r.date for r in week_b)

    def test_ignores_records_with_none_date(self):
        user, patient = _make_patient()
        good = _make_fitbit_day(user, datetime(2024, 3, 4, tzinfo=dt_tz.utc), wear_min=300)
        bad = SimpleNamespace(date=None, wear_time_minutes=999)
        result = _pick_best_wear_week([good, bad])
        assert result is not None
        _, _, records = result
        assert good in records
        assert bad not in records


class TestComputeAverages:
    def test_basic_averages(self):
        user, patient = _make_patient()
        records = [
            _make_fitbit_day(
                user, datetime(2024, 3, d, tzinfo=dt_tz.utc), steps=s, active_min=a, inactive_min=i, wear_min=600
            )
            for d, s, a, i in [(4, 4000, 20, 400), (5, 6000, 40, 200)]
        ]
        avgs = _compute_averages(records, "hours_int")
        assert avgs["fitbit_steps"] == 5000  # (4000+6000)/2
        assert avgs["fitbit_pa"] == 30  # (20+40)/2
        assert avgs["fitbit_inactivity"] == 300  # (400+200)/2

    def test_sleep_compass_hours_int(self):
        user, patient = _make_patient()
        # 7h = 7*3600000 ms = 25200000 ms → 420 min → "7" hours
        records = [_make_fitbit_day(user, datetime(2024, 3, 4, tzinfo=dt_tz.utc), sleep_ms=7 * 3_600_000)]
        avgs = _compute_averages(records, "hours_int")
        assert avgs["sleep_duration"] == "7"

    def test_sleep_copain_hhmm(self):
        user, patient = _make_patient()
        # 7.5h = 450 min → "07:30"
        records = [_make_fitbit_day(user, datetime(2024, 3, 4, tzinfo=dt_tz.utc), sleep_ms=int(7.5 * 3_600_000))]
        avgs = _compute_averages(records, "hhmm")
        assert avgs["sleep_duration"] == "07:30"

    def test_missing_sleep_omitted(self):
        user, patient = _make_patient()
        records = [_make_fitbit_day(user, datetime(2024, 3, 4, tzinfo=dt_tz.utc), sleep_ms=None)]
        avgs = _compute_averages(records, "hours_int")
        assert "sleep_duration" not in avgs

    def test_none_fields_excluded_from_average(self):
        """Records where steps/active/inactive are None should not drag down the average."""
        user, patient = _make_patient()
        r1 = _make_fitbit_day(user, datetime(2024, 3, 4, tzinfo=dt_tz.utc), steps=8000)
        r2 = _make_fitbit_day(user, datetime(2024, 3, 5, tzinfo=dt_tz.utc), steps=None)
        r2.steps = None
        avgs = _compute_averages([r1, r2], "hours_int")
        # Only r1 has steps, so average = 8000
        assert avgs["fitbit_steps"] == 8000


class TestResolveEventNames:
    def test_compass_defaults(self):
        b, f = _resolve_event_names("COMPASS", None, None)
        assert b == "visit_baseline_arm_1"
        assert f == "visit_6m_arm_1"

    def test_copain_defaults(self):
        b, f = _resolve_event_names("COPAIN", None, None)
        assert b == "t0_at_disch_arm_1"
        assert f == "t2_six_months_afte_arm_1"

    def test_explicit_args_override_defaults(self):
        b, f = _resolve_event_names("COMPASS", "my_baseline", "my_followup")
        assert b == "my_baseline"
        assert f == "my_followup"

    def test_env_var_overrides_project_default(self, monkeypatch):
        monkeypatch.setenv("REDCAP_WEARABLES_EVENT_BASELINE", "env_baseline")
        monkeypatch.setenv("REDCAP_WEARABLES_EVENT_FOLLOWUP", "env_followup")
        b, f = _resolve_event_names("COMPASS", None, None)
        assert b == "env_baseline"
        assert f == "env_followup"

    def test_explicit_arg_overrides_env_var(self, monkeypatch):
        monkeypatch.setenv("REDCAP_WEARABLES_EVENT_BASELINE", "env_baseline")
        b, f = _resolve_event_names("COMPASS", "explicit_baseline", None)
        assert b == "explicit_baseline"

    def test_unknown_project_returns_none(self):
        b, f = _resolve_event_names("UNKNOWN_PROJECT", None, None)
        assert b is None
        assert f is None


# ---------------------------------------------------------------------------
# compute_wearables_summary — DB-backed tests
# ---------------------------------------------------------------------------


class TestComputeWearablesSummary:
    def test_raises_if_no_reha_end_date(self):
        _, patient = _make_patient(reha_end_date=None)
        with pytest.raises(ValueError, match="Rehabilitation End Date"):
            compute_wearables_summary(patient)

    def test_returns_none_for_both_periods_when_no_fitbit_data(self):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        _, patient = _make_patient(reha_end_date=reha_end)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"] is None
        assert summary["followup"] is None

    def test_baseline_period_covers_first_4_weeks(self):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        user, patient = _make_patient(reha_end_date=reha_end)

        # Day 3 after reha_end — inside baseline (first 4 weeks)
        in_baseline = reha_end + timedelta(days=3)
        _make_fitbit_day(user, in_baseline, steps=1000, wear_min=500)

        summary = compute_wearables_summary(patient)
        assert summary["baseline"] is not None
        assert summary["baseline"]["fitbit_steps"] == 1000

    def test_data_outside_baseline_not_included(self):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        user, patient = _make_patient(reha_end_date=reha_end)

        # Day 35 — outside baseline (> 4 weeks = 28 days) but inside follow-up
        outside = reha_end + timedelta(days=35)
        _make_fitbit_day(user, outside, steps=9999, wear_min=600)

        summary = compute_wearables_summary(patient)
        assert summary["baseline"] is None

    def test_followup_uses_study_end_date_when_set(self):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        study_end = datetime(2024, 7, 1, tzinfo=dt_tz.utc)  # 6 months later
        user, patient = _make_patient(reha_end_date=reha_end, study_end_date=study_end)
        # Put data in the last 4 weeks before study_end
        in_followup = study_end - timedelta(days=10)
        _make_fitbit_day(user, in_followup, steps=7777, wear_min=500)

        summary = compute_wearables_summary(patient)
        assert summary["followup"] is not None
        assert summary["followup"]["fitbit_steps"] == 7777

    def test_followup_defaults_to_26_weeks_when_no_study_end_date(self):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        default_study_end = reha_end + timedelta(weeks=26)
        user, patient = _make_patient(reha_end_date=reha_end, study_end_date=None)

        # Put data in the last 4 weeks of the default 26-week window
        in_followup = default_study_end - timedelta(days=10)
        _make_fitbit_day(user, in_followup, steps=4444, wear_min=500)

        summary = compute_wearables_summary(patient)
        assert summary["followup"] is not None
        assert summary["followup"]["fitbit_steps"] == 4444

    def test_picks_best_wear_week_not_first_week(self):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        user, patient = _make_patient(reha_end_date=reha_end)

        # Week 1 (days 2-3): low wear, steps=1000
        _make_fitbit_day(user, reha_end + timedelta(days=2), steps=1000, wear_min=100)
        _make_fitbit_day(user, reha_end + timedelta(days=3), steps=1000, wear_min=100)

        # Week 2 (days 9-10): high wear, steps=9000  ← should be selected
        _make_fitbit_day(user, reha_end + timedelta(days=9), steps=9000, wear_min=600)
        _make_fitbit_day(user, reha_end + timedelta(days=10), steps=9000, wear_min=600)

        summary = compute_wearables_summary(patient)
        assert summary["baseline"]["fitbit_steps"] == 9000

    def test_compass_sleep_in_integer_hours(self):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        user, patient = _make_patient(project="COMPASS", reha_end_date=reha_end)
        _make_fitbit_day(
            user,
            reha_end + timedelta(days=2),
            sleep_ms=8 * 3_600_000,
            wear_min=500,  # 8 hours
        )
        summary = compute_wearables_summary(patient)
        assert summary["baseline"]["sleep_duration"] == "8"

    def test_copain_sleep_in_hhmm(self):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        user, patient = _make_patient(project="COPAIN", reha_end_date=reha_end)
        _make_fitbit_day(
            user,
            reha_end + timedelta(days=2),
            sleep_ms=int(7.5 * 3_600_000),
            wear_min=500,  # 7h30m
        )
        summary = compute_wearables_summary(patient)
        assert summary["baseline"]["sleep_duration"] == "07:30"

    def test_dates_formatted_as_dmy(self):
        reha_end = datetime(2024, 3, 1, tzinfo=dt_tz.utc)
        user, patient = _make_patient(reha_end_date=reha_end)
        day = reha_end + timedelta(days=2)
        _make_fitbit_day(user, day, wear_min=500)
        summary = compute_wearables_summary(patient)
        # monitoring_start should be DD-MM-YYYY
        start = summary["baseline"]["monitoring_start"]
        assert len(start) == 10
        assert start[2] == "-" and start[5] == "-"
        # year in last 4 chars
        assert start[-4:] == "2024"

    def test_monitoring_days_matches_records_in_best_week(self):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        user, patient = _make_patient(reha_end_date=reha_end)
        for i in range(5):
            _make_fitbit_day(user, reha_end + timedelta(days=i + 1), wear_min=500)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"]["monitoring_days"] == 5


# ---------------------------------------------------------------------------
# export_wearables_to_redcap — DB-backed + mocked REDCap calls
# ---------------------------------------------------------------------------


class TestExportWearablesToRedcap:
    def test_raises_if_no_project(self):
        _, patient = _make_patient(project="COMPASS")
        patient.project = ""  # blank out after saving to bypass Therapist validation
        patient.save()
        with pytest.raises(ValueError, match="no REDCap project"):
            export_wearables_to_redcap(patient)

    def test_raises_if_no_redcap_record(self, monkeypatch):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        _, patient = _make_patient(reha_end_date=reha_end)
        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")
        with patch("core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[]):
            with pytest.raises(ValueError, match="No REDCap record"):
                export_wearables_to_redcap(patient)

    def test_both_periods_skipped_when_no_fitbit_data(self, monkeypatch):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        _, patient = _make_patient(reha_end_date=reha_end)
        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")
        with patch(
            "core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[{"record_id": "42"}]
        ):
            results = export_wearables_to_redcap(patient)
        assert results["baseline"] == "skipped"
        assert results["followup"] == "skipped"

    def test_writes_correct_payload_to_redcap(self, monkeypatch):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        user, patient = _make_patient(project="COMPASS", reha_end_date=reha_end)
        _make_fitbit_day(
            user,
            reha_end + timedelta(days=2),
            steps=5000,
            active_min=30,
            inactive_min=300,
            wear_min=600,
            sleep_ms=7 * 3_600_000,
        )

        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")

        captured_payloads = []

        def _fake_post(token, payload, timeout=30):
            captured_payloads.append(payload)
            return '{"count": 1}'

        with patch(
            "core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[{"record_id": "99"}]
        ):
            with patch("core.services.wearables_redcap_service._post_redcap", side_effect=_fake_post):
                results = export_wearables_to_redcap(patient)

        # Baseline was written (follow-up has no data → skipped)
        assert results["baseline"] == "ok"
        assert results["followup"] == "skipped"

        payload = captured_payloads[0]
        assert payload["content"] == "record"
        assert payload["action"] == "import"
        assert payload["format"] == "json"

        record = json.loads(payload["data"])[0]
        assert record["record_id"] == "99"
        assert record["fitbit_steps"] == "5000"
        assert record["fitbit_pa"] == "30"
        assert record["fitbit_inactivity"] == "300"
        assert record["sleep_duration"] == "7"  # COMPASS: integer hours
        assert record["wearables_complete"] == "1"  # Unverified
        assert record["redcap_event_name"] == "visit_baseline_arm_1"

        # Date format: DD-MM-YYYY
        start = record["monitoring_start"]
        assert start[2] == "-" and start[5] == "-" and start[-4:] == "2024"

    def test_copain_sleep_format_in_payload(self, monkeypatch):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        user, patient = _make_patient(project="COPAIN", reha_end_date=reha_end)
        _make_fitbit_day(user, reha_end + timedelta(days=2), wear_min=600, sleep_ms=int(7.5 * 3_600_000))

        monkeypatch.setenv("REDCAP_TOKEN_COPAIN", "tok")
        captured = []

        with patch("core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[{"record_id": "7"}]):
            with patch(
                "core.services.wearables_redcap_service._post_redcap",
                side_effect=lambda *a, **kw: captured.append(a[1]) or '{"count":1}',
            ):
                export_wearables_to_redcap(patient)

        record = json.loads(captured[0]["data"])[0]
        assert record["sleep_duration"] == "07:30"
        assert record["redcap_event_name"] == "t0_at_disch_arm_1"

    def test_redcap_error_captured_as_error_string(self, monkeypatch):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        user, patient = _make_patient(project="COMPASS", reha_end_date=reha_end)
        _make_fitbit_day(user, reha_end + timedelta(days=2), wear_min=600)
        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")

        with patch("core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[{"record_id": "5"}]):
            with patch("core.services.wearables_redcap_service._post_redcap", side_effect=RedcapError("write failed")):
                results = export_wearables_to_redcap(patient)

        assert results["baseline"].startswith("error:")
        assert "write failed" in results["baseline"]

    def test_explicit_event_names_override_defaults(self, monkeypatch):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        user, patient = _make_patient(project="COMPASS", reha_end_date=reha_end)
        _make_fitbit_day(user, reha_end + timedelta(days=2), wear_min=600)
        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")
        captured = []

        with patch("core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[{"record_id": "1"}]):
            with patch(
                "core.services.wearables_redcap_service._post_redcap",
                side_effect=lambda *a, **kw: captured.append(a[1]) or '{"count":1}',
            ):
                export_wearables_to_redcap(patient, event_baseline="custom_baseline_arm_1")

        record = json.loads(captured[0]["data"])[0]
        assert record["redcap_event_name"] == "custom_baseline_arm_1"

    def test_no_event_name_when_project_unknown(self, monkeypatch):
        reha_end = datetime(2024, 1, 1, tzinfo=dt_tz.utc)
        # Create with valid project, then override to an unknown one
        user, patient = _make_patient(project="COMPASS", reha_end_date=reha_end)
        patient.project = "UNKNOWN_PROJ"
        patient.save()
        _make_fitbit_day(user, reha_end + timedelta(days=2), wear_min=600)
        monkeypatch.setenv("REDCAP_TOKEN_UNKNOWN_PROJ", "tok")
        monkeypatch.delenv("REDCAP_WEARABLES_EVENT_BASELINE", raising=False)
        monkeypatch.delenv("REDCAP_WEARABLES_EVENT_FOLLOWUP", raising=False)
        captured = []

        with patch("core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[{"record_id": "1"}]):
            with patch(
                "core.services.wearables_redcap_service._post_redcap",
                side_effect=lambda *a, **kw: captured.append(a[1]) or '{"count":1}',
            ):
                export_wearables_to_redcap(patient)

        record = json.loads(captured[0]["data"])[0]
        assert "redcap_event_name" not in record
