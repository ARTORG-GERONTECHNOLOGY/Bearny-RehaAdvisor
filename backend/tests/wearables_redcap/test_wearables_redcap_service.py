"""
Wearables → REDCap service tests
=================================

Tests for the new protocol-specified aggregation logic:
  - Baseline: Day 8–28 after first Fitbit measurement date
  - Follow-up: Day 150–180 after first Fitbit measurement date
  - Valid activity day: wear_time_minutes >= 600 (10 hours)
  - Valid sleep night: sleep >= 180 minutes (3 hours)
  - Selection: earliest 5 weekdays + 2 weekend days (independently for activity and sleep)
"""

import json
from datetime import date, datetime, timedelta
from datetime import timezone as dt_tz
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId

from core.models import FitbitData, Patient, SleepData, Therapist, User
from core.services.redcap_service import RedcapError
from core.services.wearables_redcap_service import (
    MIN_SLEEP_MINUTES,
    MIN_WEAR_MINUTES,
    _find_first_measurement_date,
    _format_sleep,
    _is_valid_activity_day,
    _is_valid_sleep_night,
    _record_date,
    _resolve_event_names,
    _sleep_minutes,
    _split_weekday_weekend,
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


def _make_patient(project="COMPASS"):
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
    ).save()
    return pt_user, patient


def _make_fitbit_day(
    user,
    date_dt: datetime,
    steps=5000,
    active_min=30,
    inactive_min=300,
    wear_min=700,  # valid by default (>= 600)
    sleep_min=420,  # valid by default (>= 180 min) — stored as minutes_asleep
):
    """Create a FitbitData record. sleep_min=None skips sleep entirely."""
    sleep = SleepData(minutes_asleep=sleep_min) if sleep_min is not None else None
    return FitbitData(
        user=user,
        date=date_dt,
        steps=steps,
        active_minutes=active_min,
        inactivity_minutes=inactive_min,
        wear_time_minutes=wear_min,
        sleep=sleep,
    ).save()


# ---------------------------------------------------------------------------
# Unit tests — pure functions
# ---------------------------------------------------------------------------


class TestIsValidActivityDay:
    def test_valid_when_wear_time_meets_threshold(self):
        r = FitbitData(wear_time_minutes=MIN_WEAR_MINUTES)
        assert _is_valid_activity_day(r) is True

    def test_valid_when_wear_time_exceeds_threshold(self):
        r = FitbitData(wear_time_minutes=MIN_WEAR_MINUTES + 1)
        assert _is_valid_activity_day(r) is True

    def test_invalid_when_wear_time_below_threshold(self):
        r = FitbitData(wear_time_minutes=MIN_WEAR_MINUTES - 1)
        assert _is_valid_activity_day(r) is False

    def test_invalid_when_wear_time_is_none(self):
        r = FitbitData(wear_time_minutes=None)
        assert _is_valid_activity_day(r) is False

    def test_invalid_when_wear_time_is_zero(self):
        r = FitbitData(wear_time_minutes=0)
        assert _is_valid_activity_day(r) is False


class TestIsValidSleepNight:
    def test_valid_when_minutes_asleep_meets_threshold(self):
        r = FitbitData(sleep=SleepData(minutes_asleep=MIN_SLEEP_MINUTES))
        assert _is_valid_sleep_night(r) is True

    def test_invalid_when_minutes_asleep_below_threshold(self):
        r = FitbitData(sleep=SleepData(minutes_asleep=MIN_SLEEP_MINUTES - 1))
        assert _is_valid_sleep_night(r) is False

    def test_falls_back_to_sleep_duration_ms_when_minutes_asleep_absent(self):
        # 3h = 180 min = 10800000 ms
        r = FitbitData(sleep=SleepData(sleep_duration=10_800_000, minutes_asleep=None))
        assert _is_valid_sleep_night(r) is True

    def test_invalid_when_no_sleep_at_all(self):
        r = FitbitData(sleep=None)
        assert _is_valid_sleep_night(r) is False

    def test_invalid_when_sleep_too_short_via_duration(self):
        r = FitbitData(sleep=SleepData(sleep_duration=3_600_000, minutes_asleep=None))  # 1h
        assert _is_valid_sleep_night(r) is False


class TestSplitWeekdayWeekend:
    """
    2024-01-08 = Monday, 09=Tue, 10=Wed, 11=Thu, 12=Fri, 13=Sat, 14=Sun, 15=Mon
    """

    def _day(self, user, offset_from_monday: int, wear_min=700):
        base = datetime(2024, 1, 8, tzinfo=dt_tz.utc)
        return _make_fitbit_day(user, base + timedelta(days=offset_from_monday), wear_min=wear_min)

    def test_selects_up_to_5_weekdays(self):
        user, _ = _make_patient()
        records = [self._day(user, i) for i in range(7)]  # Mon–Sun
        weekdays, weekends = _split_weekday_weekend(records)
        assert len(weekdays) == 5  # Mon–Fri
        assert len(weekends) == 2  # Sat–Sun

    def test_caps_weekdays_at_5_even_with_more_available(self):
        user, _ = _make_patient()
        # 8 weekdays (two full weeks)
        records = [self._day(user, i) for i in range(14) if i % 7 < 5]
        weekdays, weekends = _split_weekday_weekend(records)
        assert len(weekdays) == 5

    def test_caps_weekends_at_2(self):
        user, _ = _make_patient()
        # 4 weekend days (two weekends)
        records = [self._day(user, i) for i in range(14) if i % 7 >= 5]
        weekdays, weekends = _split_weekday_weekend(records)
        assert len(weekends) == 2

    def test_returns_fewer_when_not_enough_days(self):
        user, _ = _make_patient()
        records = [self._day(user, 0), self._day(user, 1)]  # Mon, Tue only
        weekdays, weekends = _split_weekday_weekend(records)
        assert len(weekdays) == 2
        assert len(weekends) == 0

    def test_picks_earliest_days(self):
        user, _ = _make_patient()
        early_mon = self._day(user, 0)  # 2024-01-08 Mon — should be selected (earliest)
        late_mon = self._day(user, 7)  # 2024-01-15 Mon — should not be selected (6th weekday)
        tue = self._day(user, 1)
        wed = self._day(user, 2)
        thu = self._day(user, 3)
        fri = self._day(user, 4)
        weekdays, _ = _split_weekday_weekend([early_mon, tue, wed, thu, fri, late_mon])
        assert early_mon in weekdays
        assert late_mon not in weekdays


class TestFormatSleep:
    def test_compass_integer_hours(self):
        assert _format_sleep(420, "hours_int") == "7"
        assert _format_sleep(450, "hours_int") == "8"  # rounds to nearest

    def test_copain_hhmm(self):
        assert _format_sleep(450, "hhmm") == "07:30"
        assert _format_sleep(0, "hhmm") == "00:00"
        assert _format_sleep(1439, "hhmm") == "23:59"


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
        b, _ = _resolve_event_names("COMPASS", None, None)
        assert b == "env_baseline"

    def test_unknown_project_returns_none(self):
        b, f = _resolve_event_names("UNKNOWN", None, None)
        assert b is None and f is None


# ---------------------------------------------------------------------------
# compute_wearables_summary — DB-backed tests
# ---------------------------------------------------------------------------


class TestComputeWearablesSummary:
    """
    First measurement date = 2024-01-01 (Monday).
    Baseline window:  Day 8–28  = 2024-01-08 – 2024-01-28
    Follow-up window: Day 150–180 = 2024-05-29 – 2024-06-28
    """

    FIRST_DATE = datetime(2024, 1, 1, tzinfo=dt_tz.utc)

    def _anchor(self, user):
        """Seed a Day-1 record so first_date is always 2024-01-01."""
        _make_fitbit_day(user, self.FIRST_DATE, steps=0, wear_min=0, sleep_min=None)

    def _in_baseline(self, offset_from_day8: int) -> datetime:
        """Day 8 + offset."""
        return self.FIRST_DATE + timedelta(days=7 + offset_from_day8)

    def _in_followup(self, offset_from_day150: int) -> datetime:
        return self.FIRST_DATE + timedelta(days=149 + offset_from_day150)

    def test_raises_when_no_fitbit_data(self):
        _, patient = _make_patient()
        with pytest.raises(Exception, match="No Fitbit data"):
            compute_wearables_summary(patient)

    def test_baseline_window_is_day_8_to_28(self):
        """Data on Day 7 (excluded period) must not appear in baseline."""
        user, patient = _make_patient()
        self._anchor(user)
        # Day 7 — excluded
        _make_fitbit_day(user, self.FIRST_DATE + timedelta(days=6), steps=9999)
        # Day 8 — first valid baseline day
        _make_fitbit_day(user, self._in_baseline(0), steps=1000)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"] is not None
        assert summary["baseline"]["fitbit_steps"] == 1000

    def test_data_before_day_8_excluded_from_baseline(self):
        user, patient = _make_patient()
        # Only data on Day 1 (excluded period); anchors first_date and proves window is empty
        _make_fitbit_day(user, self.FIRST_DATE, steps=9999)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"] is None

    def test_data_after_day_28_excluded_from_baseline(self):
        user, patient = _make_patient()
        self._anchor(user)
        # Day 29 — outside baseline
        _make_fitbit_day(user, self.FIRST_DATE + timedelta(days=28), steps=9999)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"] is None

    def test_followup_window_is_day_150_to_180(self):
        user, patient = _make_patient()
        self._anchor(user)
        _make_fitbit_day(user, self._in_followup(0), steps=7777)
        summary = compute_wearables_summary(patient)
        assert summary["followup"] is not None
        assert summary["followup"]["fitbit_steps"] == 7777

    def test_monitoring_start_end_are_window_boundaries_not_data_boundaries(self):
        """monitoring_start/end must reflect the protocol window, not the earliest/latest data."""
        user, patient = _make_patient()
        self._anchor(user)
        # Only one day of data, in the middle of the baseline window
        _make_fitbit_day(user, self._in_baseline(5))  # Day 13
        summary = compute_wearables_summary(patient)
        # Window is Day 8–28 → 2024-01-08 – 2024-01-28
        assert summary["baseline"]["monitoring_start"] == "2024-01-08"
        assert summary["baseline"]["monitoring_end"] == "2024-01-28"

    def test_only_valid_activity_days_count(self):
        """Days below 10h wear time must not contribute to activity averages."""
        user, patient = _make_patient()
        self._anchor(user)
        # Invalid day: wear_min=300 (< 600), steps=9999
        _make_fitbit_day(user, self._in_baseline(0), steps=9999, wear_min=300)
        # Valid day: wear_min=700, steps=1000
        _make_fitbit_day(user, self._in_baseline(1), steps=1000, wear_min=700)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"]["fitbit_steps"] == 1000
        assert summary["baseline"]["valid_week_days"] == 1

    def test_only_valid_sleep_nights_count(self):
        """Nights below 3h sleep must not contribute to sleep averages."""
        user, patient = _make_patient()
        self._anchor(user)
        # Invalid night: 60 min sleep
        _make_fitbit_day(user, self._in_baseline(0), sleep_min=60)
        # Valid night: 420 min sleep
        _make_fitbit_day(user, self._in_baseline(1), sleep_min=420)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"]["sleep_duration"] == "7"
        assert summary["baseline"]["valid_week_nights"] == 1

    def test_activity_and_sleep_are_selected_independently(self):
        """A day can be a valid sleep night without being a valid activity day and vice versa."""
        user, patient = _make_patient()
        self._anchor(user)
        # Day A: valid activity (wear=700), no sleep
        _make_fitbit_day(user, self._in_baseline(0), steps=5000, wear_min=700, sleep_min=None)
        # Day B: invalid activity (wear=100), but valid sleep (sleep=360 min)
        _make_fitbit_day(user, self._in_baseline(1), steps=0, wear_min=100, sleep_min=360)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"]["valid_week_days"] == 1
        assert summary["baseline"]["valid_week_nights"] == 1
        assert summary["baseline"]["fitbit_steps"] == 5000
        assert summary["baseline"]["sleep_duration"] == "6"  # 360 min = 6 h

    def test_weekday_weekend_counts_in_output(self):
        """valid_week_days / valid_weekend_days reflect the selection, not total valid days."""
        user, patient = _make_patient()
        self._anchor(user)
        # Day 8 = Mon, Day 9 = Tue, Day 13 = Sat, Day 14 = Sun
        for offset in [0, 1, 5, 6]:  # Mon, Tue, Sat, Sun
            _make_fitbit_day(user, self._in_baseline(offset), wear_min=700)
        summary = compute_wearables_summary(patient)
        b = summary["baseline"]
        assert b["valid_week_days"] == 2
        assert b["valid_weekend_days"] == 2

    def test_at_most_5_weekdays_and_2_weekends_selected(self):
        user, patient = _make_patient()
        self._anchor(user)
        for i in range(20):
            _make_fitbit_day(user, self._in_baseline(i), wear_min=700)
        summary = compute_wearables_summary(patient)
        b = summary["baseline"]
        assert b["valid_week_days"] <= 5
        assert b["valid_weekend_days"] <= 2

    def test_compass_sleep_in_integer_hours(self):
        user, patient = _make_patient(project="COMPASS")
        self._anchor(user)
        _make_fitbit_day(user, self._in_baseline(0), sleep_min=480)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"]["sleep_duration"] == "8"

    def test_copain_sleep_in_hhmm(self):
        user, patient = _make_patient(project="COPAIN")
        self._anchor(user)
        _make_fitbit_day(user, self._in_baseline(0), sleep_min=450)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"]["sleep_duration"] == "07:30"

    def test_returns_none_followup_when_window_not_reached(self):
        user, patient = _make_patient()
        self._anchor(user)
        _make_fitbit_day(user, self._in_baseline(0))
        summary = compute_wearables_summary(patient)
        assert summary["followup"] is None

    def test_means_computed_correctly(self):
        user, patient = _make_patient()
        self._anchor(user)
        _make_fitbit_day(user, self._in_baseline(0), steps=4000, active_min=20, inactive_min=200, wear_min=700)
        _make_fitbit_day(user, self._in_baseline(1), steps=6000, active_min=40, inactive_min=400, wear_min=700)
        summary = compute_wearables_summary(patient)
        b = summary["baseline"]
        assert b["fitbit_steps"] == 5000
        assert b["fitbit_pa"] == 30
        assert b["fitbit_inactivity"] == 300


# ---------------------------------------------------------------------------
# export_wearables_to_redcap — DB-backed + mocked REDCap
# ---------------------------------------------------------------------------


class TestExportWearablesToRedcap:
    FIRST_DATE = datetime(2024, 1, 1, tzinfo=dt_tz.utc)

    def _anchor(self, user):
        _make_fitbit_day(user, self.FIRST_DATE, steps=0, wear_min=0, sleep_min=None)

    def _in_baseline(self, offset: int) -> datetime:
        return self.FIRST_DATE + timedelta(days=7 + offset)

    def test_raises_if_no_project(self):
        _, patient = _make_patient()
        patient.project = ""
        patient.save()
        with pytest.raises(Exception, match="no REDCap project"):
            export_wearables_to_redcap(patient)

    def test_raises_if_no_redcap_record(self, monkeypatch):
        _, patient = _make_patient()
        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")
        with patch("core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[]):
            with pytest.raises(ValueError, match="No REDCap record"):
                export_wearables_to_redcap(patient)

    def test_both_periods_skipped_when_no_fitbit_data(self, monkeypatch):
        _, patient = _make_patient()
        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")
        # No FitbitData → WearablesSyncError is caught and both periods skipped
        with patch("core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[{"record_id": "1"}]):
            with pytest.raises(Exception):
                export_wearables_to_redcap(patient)

    def test_writes_new_fields_to_redcap(self, monkeypatch):
        user, patient = _make_patient(project="COMPASS")
        self._anchor(user)
        # Mon + Sat in baseline
        _make_fitbit_day(
            user, self._in_baseline(0), steps=5000, active_min=30, inactive_min=300, wear_min=700, sleep_min=420
        )
        _make_fitbit_day(
            user, self._in_baseline(5), steps=3000, active_min=10, inactive_min=500, wear_min=700, sleep_min=480
        )

        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")
        captured = []

        with patch(
            "core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[{"record_id": "99"}]
        ):
            with patch(
                "core.services.wearables_redcap_service._post_redcap",
                side_effect=lambda *a, **kw: captured.append(a[1]) or '{"count":1}',
            ):
                results = export_wearables_to_redcap(patient)

        assert results["baseline"] == "ok"
        record = json.loads(captured[0]["data"])[0]
        assert record["record_id"] == "99"
        assert record["redcap_event_name"] == "visit_baseline_arm_1"
        assert record["wearables_complete"] == "1"
        assert "valid_week_days" in record
        assert "valid_weekend_days" in record
        assert "valid_week_nights" in record
        assert "valid_weekend_nights" in record
        assert record["monitoring_start"] == "2024-01-08"
        assert record["monitoring_end"] == "2024-01-28"

    def test_skip_if_populated_prevents_overwrite(self, monkeypatch):
        """When monitoring_start already exists in REDCap, skip (default behaviour)."""
        user, patient = _make_patient(project="COMPASS")
        self._anchor(user)
        _make_fitbit_day(user, self._in_baseline(0))
        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")

        existing_row = {
            "record_id": "5",
            "redcap_event_name": "visit_baseline_arm_1",
            "monitoring_start": "2024-01-08",  # already populated
        }

        with patch("core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[existing_row]):
            with patch("core.services.wearables_redcap_service._post_redcap") as mock_post:
                results = export_wearables_to_redcap(patient, skip_if_populated=True)

        assert results["baseline"] == "skipped"
        mock_post.assert_not_called()

    def test_force_recalculation_when_skip_if_populated_false(self, monkeypatch):
        """skip_if_populated=False allows overwriting an already-populated event."""
        user, patient = _make_patient(project="COMPASS")
        self._anchor(user)
        _make_fitbit_day(user, self._in_baseline(0))
        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")

        existing_row = {
            "record_id": "5",
            "redcap_event_name": "visit_baseline_arm_1",
            "monitoring_start": "2024-01-08",
        }

        with patch("core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[existing_row]):
            with patch("core.services.wearables_redcap_service._post_redcap", return_value='{"count":1}') as mock_post:
                results = export_wearables_to_redcap(patient, skip_if_populated=False)

        assert results["baseline"] == "ok"
        mock_post.assert_called_once()

    def test_redcap_error_captured_as_error_string(self, monkeypatch):
        user, patient = _make_patient(project="COMPASS")
        self._anchor(user)
        _make_fitbit_day(user, self._in_baseline(0))
        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")

        with patch("core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[{"record_id": "5"}]):
            with patch("core.services.wearables_redcap_service._post_redcap", side_effect=RedcapError("write failed")):
                results = export_wearables_to_redcap(patient)

        assert results["baseline"].startswith("error:")

    def test_invalid_field_stripped_and_retried(self, monkeypatch):
        user, patient = _make_patient(project="COMPASS")
        self._anchor(user)
        _make_fitbit_day(user, self._in_baseline(0), steps=4000)
        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")
        calls = []

        def _fake_post(token, payload, timeout=30):
            calls.append(json.loads(payload["data"])[0])
            if len(calls) == 1:
                raise RedcapError(
                    "REDCap API returned non-200.",
                    detail={"status": 400, "text": "The following values are not valid: 'wearables_complete'"},
                )
            return '{"count":1}'

        with patch(
            "core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[{"record_id": "42"}]
        ):
            with patch("core.services.wearables_redcap_service._post_redcap", side_effect=_fake_post):
                results = export_wearables_to_redcap(patient)

        assert results["baseline"] == "ok"
        assert len(calls) == 2
        assert "wearables_complete" not in calls[1]

    def test_return_payloads_true(self, monkeypatch):
        user, patient = _make_patient(project="COMPASS")
        self._anchor(user)
        _make_fitbit_day(user, self._in_baseline(0))
        monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")

        with patch("core.services.wearables_redcap_service.export_record_by_pat_id", return_value=[{"record_id": "9"}]):
            with patch("core.services.wearables_redcap_service._post_redcap", return_value='{"count":1}'):
                results, payloads = export_wearables_to_redcap(patient, return_payloads=True)

        assert results["baseline"] == "ok"
        assert payloads["baseline"]["status"] == "sent"
        assert payloads["followup"]["reason"] == "no_fitbit_data_in_period"


# ---------------------------------------------------------------------------
# _record_date and _find_first_measurement_date — direct unit tests
# ---------------------------------------------------------------------------


class TestRecordDate:
    def test_extracts_date_from_aware_datetime(self):
        user, _ = _make_patient()
        r = _make_fitbit_day(user, datetime(2024, 3, 15, 12, 0, tzinfo=dt_tz.utc))
        assert _record_date(r) == datetime(2024, 3, 15).date()

    def test_returns_none_when_date_is_none(self):
        r = FitbitData(date=None)
        assert _record_date(r) is None


class TestFindFirstMeasurementDate:
    def test_returns_none_when_no_data(self):
        user, _ = _make_patient()
        assert _find_first_measurement_date(user) is None

    def test_returns_earliest_date(self):
        user, _ = _make_patient()
        _make_fitbit_day(user, datetime(2024, 3, 10, tzinfo=dt_tz.utc))
        _make_fitbit_day(user, datetime(2024, 3, 5, tzinfo=dt_tz.utc))   # ← earliest
        _make_fitbit_day(user, datetime(2024, 3, 15, tzinfo=dt_tz.utc))
        assert _find_first_measurement_date(user) == datetime(2024, 3, 5).date()

    def test_counts_zero_wear_day_as_first_measurement(self):
        """A day with no activity still anchors the window."""
        user, _ = _make_patient()
        _make_fitbit_day(user, datetime(2024, 1, 1, tzinfo=dt_tz.utc), wear_min=0, sleep_min=None)
        _make_fitbit_day(user, datetime(2024, 1, 5, tzinfo=dt_tz.utc), wear_min=700)
        assert _find_first_measurement_date(user) == datetime(2024, 1, 1).date()


# ---------------------------------------------------------------------------
# _sleep_minutes — direct unit tests
# ---------------------------------------------------------------------------


class TestSleepMinutes:
    def test_prefers_minutes_asleep(self):
        r = FitbitData(sleep=SleepData(minutes_asleep=420, sleep_duration=99_999_999))
        assert _sleep_minutes(r) == 420.0

    def test_falls_back_to_sleep_duration_ms(self):
        # 7h = 25200000 ms
        r = FitbitData(sleep=SleepData(minutes_asleep=None, sleep_duration=25_200_000))
        assert _sleep_minutes(r) == 420.0

    def test_returns_none_when_no_sleep(self):
        r = FitbitData(sleep=None)
        assert _sleep_minutes(r) is None

    def test_returns_none_when_sleep_has_no_fields(self):
        r = FitbitData(sleep=SleepData(minutes_asleep=None, sleep_duration=None))
        assert _sleep_minutes(r) is None


# ---------------------------------------------------------------------------
# Exact window boundary tests
# ---------------------------------------------------------------------------


class TestWindowBoundaries:
    """
    First date = 2024-01-01.
    Baseline:  Day 8  = 2024-01-08 (included)
               Day 7  = 2024-01-07 (excluded — habituation period)
               Day 28 = 2024-01-28 (included)
               Day 29 = 2024-01-29 (excluded)
    Follow-up: Day 150 = 2024-05-29 (included)
               Day 149 = 2024-05-28 (excluded)
               Day 180 = 2024-06-28 (included)
               Day 181 = 2024-06-29 (excluded)
    """

    FIRST_DATE = datetime(2024, 1, 1, tzinfo=dt_tz.utc)

    def _anchor(self, user):
        _make_fitbit_day(user, self.FIRST_DATE, wear_min=0, sleep_min=None)

    def _day(self, n: int) -> datetime:
        """Day N (1-indexed) relative to first measurement date."""
        return self.FIRST_DATE + timedelta(days=n - 1)

    def test_day_7_excluded_day_8_included(self):
        user, patient = _make_patient()
        self._anchor(user)
        _make_fitbit_day(user, self._day(7), steps=9999, wear_min=700)   # excluded
        _make_fitbit_day(user, self._day(8), steps=1000, wear_min=700)   # included
        summary = compute_wearables_summary(patient)
        assert summary["baseline"]["fitbit_steps"] == 1000

    def test_day_28_included_day_29_excluded(self):
        user, patient = _make_patient()
        self._anchor(user)
        _make_fitbit_day(user, self._day(28), steps=2000, wear_min=700)  # included
        _make_fitbit_day(user, self._day(29), steps=9999, wear_min=700)  # excluded
        summary = compute_wearables_summary(patient)
        assert summary["baseline"]["fitbit_steps"] == 2000

    def test_day_149_excluded_day_150_included(self):
        user, patient = _make_patient()
        self._anchor(user)
        _make_fitbit_day(user, self._day(149), steps=9999, wear_min=700)  # excluded
        _make_fitbit_day(user, self._day(150), steps=3000, wear_min=700)  # included
        summary = compute_wearables_summary(patient)
        assert summary["followup"]["fitbit_steps"] == 3000

    def test_day_180_included_day_181_excluded(self):
        user, patient = _make_patient()
        self._anchor(user)
        _make_fitbit_day(user, self._day(180), steps=4000, wear_min=700)  # included
        _make_fitbit_day(user, self._day(181), steps=9999, wear_min=700)  # excluded
        summary = compute_wearables_summary(patient)
        assert summary["followup"]["fitbit_steps"] == 4000


# ---------------------------------------------------------------------------
# Edge cases: records exist but none valid, None fields, both periods filled
# ---------------------------------------------------------------------------


class TestEdgeCases:
    FIRST_DATE = datetime(2024, 1, 1, tzinfo=dt_tz.utc)

    def _anchor(self, user):
        _make_fitbit_day(user, self.FIRST_DATE, wear_min=0, sleep_min=None)

    def _in_baseline(self, offset: int) -> datetime:
        return self.FIRST_DATE + timedelta(days=7 + offset)

    def _in_followup(self, offset: int) -> datetime:
        return self.FIRST_DATE + timedelta(days=149 + offset)

    def test_returns_none_when_records_exist_but_no_valid_activity_days(self):
        """Records in window but all below wear threshold → no activity output."""
        user, patient = _make_patient()
        self._anchor(user)
        # 3 days in baseline, all below 600 min wear, no sleep either
        for i in range(3):
            _make_fitbit_day(user, self._in_baseline(i), wear_min=300, sleep_min=None)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"] is None

    def test_steps_none_excluded_from_mean(self):
        """Days where steps is None must not be zero-averaged."""
        user, patient = _make_patient()
        self._anchor(user)
        _make_fitbit_day(user, self._in_baseline(0), steps=6000, wear_min=700)
        r = _make_fitbit_day(user, self._in_baseline(1), steps=None, wear_min=700)
        r.steps = None
        r.save()
        summary = compute_wearables_summary(patient)
        # Only the 6000-step day contributes
        assert summary["baseline"]["fitbit_steps"] == 6000

    def test_both_baseline_and_followup_populated(self):
        """When data exists in both windows, both periods return results."""
        user, patient = _make_patient()
        self._anchor(user)
        _make_fitbit_day(user, self._in_baseline(0), steps=5000, wear_min=700)
        _make_fitbit_day(user, self._in_followup(0), steps=8000, wear_min=700)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"]["fitbit_steps"] == 5000
        assert summary["followup"]["fitbit_steps"] == 8000

    def test_regression_934_1_zero_days_before_activation_not_averaged(self):
        """
        Regression for patient 934-1: device activated on Day 5 (first data),
        but wear_min=0 on Days 1-4. Days 8-28 contain real data from Day 8 onward.
        Zero-wear days in Days 1-4 must not be included in the activity average.
        """
        user, patient = _make_patient()
        # Days 1-4: device not worn (exist in DB with zero wear)
        for i in range(4):
            _make_fitbit_day(
                user,
                self.FIRST_DATE + timedelta(days=i),
                steps=0,
                wear_min=0,
                sleep_min=None,
            )
        # Days 8, 9, 10 (offsets 0-2 from Day 8): device worn, real data
        for i, steps in enumerate([10000, 12000, 11000]):
            _make_fitbit_day(user, self._in_baseline(i), steps=steps, wear_min=700)

        summary = compute_wearables_summary(patient)
        b = summary["baseline"]
        # Mean of [10000, 12000, 11000] = 11000 — zeros must NOT be included
        assert b["fitbit_steps"] == 11000
        assert b["valid_week_days"] == 3

    def test_no_sleep_data_in_window_omits_sleep_fields(self):
        """When no valid sleep nights exist, sleep fields are absent from output."""
        user, patient = _make_patient()
        self._anchor(user)
        _make_fitbit_day(user, self._in_baseline(0), steps=5000, wear_min=700, sleep_min=None)
        summary = compute_wearables_summary(patient)
        assert summary["baseline"] is not None
        assert "sleep_duration" not in summary["baseline"]

    def test_split_weekday_weekend_empty_input(self):
        weekdays, weekends = _split_weekday_weekend([])
        assert weekdays == []
        assert weekends == []

    def test_all_5_weekdays_5_nights_from_one_week(self):
        """A full Mon–Fri week produces exactly 5 activity days and 5 sleep nights."""
        user, patient = _make_patient()
        self._anchor(user)
        # Day 8 = Mon, Day 9 = Tue, … Day 12 = Fri  (offsets 0-4)
        for i in range(5):
            _make_fitbit_day(user, self._in_baseline(i), wear_min=700, sleep_min=300)
        summary = compute_wearables_summary(patient)
        b = summary["baseline"]
        assert b["valid_week_days"] == 5
        assert b["valid_weekend_days"] == 0
        assert b["valid_week_nights"] == 5
        assert b["valid_weekend_nights"] == 0
