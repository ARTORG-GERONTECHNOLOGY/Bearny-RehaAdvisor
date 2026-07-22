import json
import logging
import os
from datetime import date as date_type
from datetime import datetime, timedelta
from datetime import timezone as dt_tz
from typing import Any, Dict, List, Optional, Tuple

from core.models import FitbitData, Patient

# GoogleHealthData is introduced by the Google Health migration branch.
# Import it conditionally so this module works on main before that branch lands.
try:
    from core.models import GoogleHealthData as _GoogleHealthData  # type: ignore[attr-defined]
except ImportError:
    _GoogleHealthData = None  # type: ignore[assignment,misc]
from core.services.redcap_service import (
    RedcapError,
    _parse_invalid_fields,
    _post_redcap,
    export_record_by_pat_id,
    get_token_for_project,
    resolve_project,
)

logger = logging.getLogger(__name__)


class WearablesSyncError(ValueError):
    """ValueError with a stable frontend-translatable code."""

    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.code = code


# ---------------------------------------------------------------------------
# Window definitions (days relative to first wearable measurement date, 1-indexed)
# ---------------------------------------------------------------------------
BASELINE_DAY_START = 8  # first 7 days are excluded (device calibration / habituation)
BASELINE_DAY_END = 28
FOLLOWUP_DAY_START = 150
FOLLOWUP_DAY_END = 180

# Validity thresholds
MIN_WEAR_MINUTES = 600  # 10 hours — minimum for a valid activity day
MIN_SLEEP_MINUTES = 180  # 3 hours  — minimum for a valid sleep night

# Day-selection targets per window
MAX_WEEKDAYS = 5
MAX_WEEKENDS = 2

# Per-project REDCap configuration
_PROJECT_CONFIG: Dict[str, Dict[str, str]] = {
    "COMPASS": {
        "baseline": "visit_baseline_arm_1",
        "followup": "visit_6m_arm_1",
        "sleep_duration_format": "hours_int",
    },
    "COPAIN": {
        "baseline": "t0_at_disch_arm_1",
        "followup": "t2_six_months_afte_arm_1",
        "sleep_duration_format": "hhmm",
    },
}

# Keep old name as alias so existing callers still work
_PROJECT_EVENTS = _PROJECT_CONFIG


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=dt_tz.utc)
    return dt.astimezone(dt_tz.utc)


def _record_date(r) -> Optional[date_type]:
    """Return the date part of a wearable data record as a datetime.date."""
    d = r.date
    if d is None:
        return None
    if hasattr(d, "date"):
        return _as_utc(d).date()
    return d


def _find_first_measurement_date(user) -> Optional[date_type]:
    """Return the earliest calendar date with any wearable data for *user*.

    Checks GoogleHealthData (when available) and FitbitData so patients who
    migrated from Fitbit to Google Health are not incorrectly rejected.
    """
    dates: List[date_type] = []

    if _GoogleHealthData is not None:
        gh = _GoogleHealthData.objects(user=user).order_by("date").first()
        if gh:
            d = _record_date(gh)
            if d:
                dates.append(d)

    fb = FitbitData.objects(user=user).order_by("date").first()
    if fb:
        d = _record_date(fb)
        if d:
            dates.append(d)

    return min(dates) if dates else None


def _build_period_diagnosis(user, window_start: date_type, window_end: date_type) -> Dict[str, Any]:
    """Return diagnostic info explaining why a monitoring window had no exportable data."""
    today = datetime.now(dt_tz.utc).date()
    info: Dict[str, Any] = {
        "window_start": _fmt_date(window_start),
        "window_end": _fmt_date(window_end),
    }
    if window_start > today:
        info["skip_reason"] = "future_window"
        return info

    start_dt = datetime.combine(window_start, datetime.min.time()).replace(tzinfo=dt_tz.utc)
    end_dt = datetime.combine(window_end, datetime.max.time()).replace(tzinfo=dt_tz.utc)

    records: list = []
    if _GoogleHealthData is not None:
        records = list(_GoogleHealthData.objects(user=user, date__gte=start_dt, date__lte=end_dt))
    if not records:
        records = list(FitbitData.objects(user=user, date__gte=start_dt, date__lte=end_dt))

    total = len(records)
    valid_activity = sum(1 for r in records if _is_valid_activity_day(r))
    valid_sleep = sum(1 for r in records if _is_valid_sleep_night(r))

    info["total_records"] = total
    info["valid_activity_days"] = valid_activity
    info["valid_sleep_nights"] = valid_sleep

    if total == 0:
        info["skip_reason"] = "no_records"
    else:
        info["skip_reason"] = "no_valid_days"
        info["wear_threshold_minutes"] = MIN_WEAR_MINUTES
        info["sleep_threshold_minutes"] = MIN_SLEEP_MINUTES

    return info


def _is_valid_activity_day(r: FitbitData) -> bool:
    """A day is valid for activity aggregation if wear_time_minutes >= 10 h."""
    return (r.wear_time_minutes or 0) >= MIN_WEAR_MINUTES


def _is_valid_sleep_night(r: FitbitData) -> bool:
    """A night is valid for sleep aggregation if sleep >= 3 h."""
    try:
        if r.sleep is None:
            return False
        mins = r.sleep.minutes_asleep
        if mins is None:
            dur_ms = r.sleep.sleep_duration or 0
            mins = dur_ms / 60_000
        return (mins or 0) >= MIN_SLEEP_MINUTES
    except Exception:
        return False


def _split_weekday_weekend(
    records: List[FitbitData],
    max_weekdays: int = MAX_WEEKDAYS,
    max_weekends: int = MAX_WEEKENDS,
) -> Tuple[List[FitbitData], List[FitbitData]]:
    """
    Sort records chronologically, then greedily pick up to *max_weekdays*
    weekdays (Mon–Fri) and *max_weekends* weekend days (Sat–Sun).
    Returns (selected_weekdays, selected_weekends).
    """
    sorted_records = sorted(
        (r for r in records if _record_date(r) is not None),
        key=lambda r: _record_date(r),
    )
    weekdays: List[FitbitData] = []
    weekends: List[FitbitData] = []
    for r in sorted_records:
        dow = _record_date(r).weekday()  # Monday=0, Sunday=6
        if dow < 5:
            if len(weekdays) < max_weekdays:
                weekdays.append(r)
        else:
            if len(weekends) < max_weekends:
                weekends.append(r)
    return weekdays, weekends


def _sleep_minutes(r: FitbitData) -> Optional[float]:
    """Return sleep duration in minutes (preferred: minutes_asleep; fallback: sleep_duration ms)."""
    try:
        if r.sleep is None:
            return None
        if r.sleep.minutes_asleep is not None:
            return float(r.sleep.minutes_asleep)
        if r.sleep.sleep_duration:
            return r.sleep.sleep_duration / 60_000
    except Exception:
        pass
    return None


def _format_sleep(avg_minutes: float, fmt: str) -> str:
    """Convert average sleep minutes to the project's REDCap format."""
    if fmt == "hhmm":
        total_min = int(round(avg_minutes))
        hh = total_min // 60
        mm = total_min % 60
        return f"{hh:02d}:{mm:02d}"
    # "hours_int" — COMPASS expects integer 0-24
    return str(int(round(avg_minutes / 60)))


def _fmt_date(d) -> str:
    """Format a date as YYYY-MM-DD for REDCap."""
    if hasattr(d, "strftime"):
        return d.strftime("%Y-%m-%d")
    return str(d)


# ---------------------------------------------------------------------------
# Core summarization
# ---------------------------------------------------------------------------


def _summarize_period(
    user: Any,
    window_start: datetime.date,
    window_end: datetime.date,
    sleep_fmt: str,
) -> Optional[Dict[str, Any]]:
    """
    Apply the aggregation spec for a single monitoring window.

    Activity (independent of sleep):
      1. Fetch all records in window.
      2. Keep valid activity days (wear_time_minutes >= 600).
      3. Select earliest 5 weekdays + 2 weekend days.
      4. Compute means for steps, active_minutes, inactivity_minutes.

    Sleep (independent of activity):
      1. Same set of records.
      2. Keep valid sleep nights (sleep >= 180 min).
      3. Select earliest 5 weekday nights + 2 weekend nights.
      4. Compute mean sleep duration.

    Returns None when no valid days or nights exist in the window.
    """
    start_dt = datetime.combine(window_start, datetime.min.time()).replace(tzinfo=dt_tz.utc)
    end_dt = datetime.combine(window_end, datetime.max.time()).replace(tzinfo=dt_tz.utc)

    records = list(
        FitbitData.objects(
            user=user,
            date__gte=start_dt,
            date__lte=end_dt,
        ).order_by("date")
    )

    if not records:
        return None

    # ── Activity selection ──────────────────────────────────────────────────
    valid_activity = [r for r in records if _is_valid_activity_day(r)]
    act_weekdays, act_weekends = _split_weekday_weekend(valid_activity)
    selected_activity = act_weekdays + act_weekends

    # ── Sleep selection ─────────────────────────────────────────────────────
    valid_sleep = [r for r in records if _is_valid_sleep_night(r)]
    sleep_weekdays, sleep_weekends = _split_weekday_weekend(valid_sleep)
    selected_sleep = sleep_weekdays + sleep_weekends

    if not selected_activity and not selected_sleep:
        return None

    result: Dict[str, Any] = {
        "monitoring_start": _fmt_date(window_start),
        "monitoring_end": _fmt_date(window_end),
        # Valid day / night counts
        "valid_week_days": len(act_weekdays),
        "valid_weekend_days": len(act_weekends),
        "valid_week_nights": len(sleep_weekdays),
        "valid_weekend_nights": len(sleep_weekends),
    }

    # ── Activity means ──────────────────────────────────────────────────────
    if selected_activity:
        steps = [r.steps for r in selected_activity if r.steps is not None]
        pa = [r.active_minutes for r in selected_activity if r.active_minutes is not None]
        inact = [r.inactivity_minutes for r in selected_activity if r.inactivity_minutes is not None]

        if steps:
            result["fitbit_steps"] = round(sum(steps) / len(steps))
        if pa:
            result["fitbit_pa"] = round(sum(pa) / len(pa))
        if inact:
            result["fitbit_inactivity"] = round(sum(inact) / len(inact))

    # ── Sleep means ─────────────────────────────────────────────────────────
    if selected_sleep:
        sleep_mins = [m for r in selected_sleep for m in [_sleep_minutes(r)] if m is not None]
        if sleep_mins:
            result["sleep_duration"] = _format_sleep(sum(sleep_mins) / len(sleep_mins), sleep_fmt)

        # sleep_score is not yet available via Fitbit REST API for standard OAuth apps.
        # Placeholder so the field is present when it becomes available.
        result["sleep_score"] = None

    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_wearables_summary(patient: Patient) -> Dict[str, Any]:
    """
    Compute wearables summaries for baseline and follow-up periods using the
    protocol-specified windows anchored to the first Fitbit measurement date.

    Baseline  (visit_baseline): Day 8–28 after first measurement
    Follow-up (visit_6m):       Day 150–180 after first measurement

    The first 7 days after Fitbit activation are excluded to allow
    device habituation.

    Returns {"baseline": {...} or None, "followup": {...} or None}.
    Raises WearablesSyncError if no Fitbit data exists for the patient.
    """
    try:
        user = patient.userId
    except Exception as e:
        raise ValueError(f"Could not resolve userId for patient {patient.patient_code}: {e}") from e

    first_date = _find_first_measurement_date(user)
    if not first_date:
        raise WearablesSyncError(
            f"No wearable data found for patient {patient.patient_code}. "
            "The device must be worn before wearables can be exported to REDCap.",
            code="wearables_no_fitbit_data",
        )

    project_name = (patient.project or "").strip().upper()
    proj_cfg = _PROJECT_CONFIG.get(project_name, {})
    sleep_fmt = proj_cfg.get("sleep_duration_format", "hours_int")

    # Day N means first_date + (N-1) days  →  Day 8 = first_date + 7
    baseline_start = first_date + timedelta(days=BASELINE_DAY_START - 1)
    baseline_end = first_date + timedelta(days=BASELINE_DAY_END - 1)
    followup_start = first_date + timedelta(days=FOLLOWUP_DAY_START - 1)
    followup_end = first_date + timedelta(days=FOLLOWUP_DAY_END - 1)

    logger.info(
        "[wearables] %s first_date=%s  baseline=%s–%s  followup=%s–%s",
        patient.patient_code,
        first_date,
        baseline_start,
        baseline_end,
        followup_start,
        followup_end,
    )

    return {
        "baseline": _summarize_period(user, baseline_start, baseline_end, sleep_fmt),
        "followup": _summarize_period(user, followup_start, followup_end, sleep_fmt),
        "_meta": {
            "first_date": _fmt_date(first_date),
            "baseline_window": {"start": _fmt_date(baseline_start), "end": _fmt_date(baseline_end)},
            "followup_window": {"start": _fmt_date(followup_start), "end": _fmt_date(followup_end)},
            "user": user,
        },
    }


def _resolve_event_names(
    project_name: str,
    event_baseline: Optional[str],
    event_followup: Optional[str],
) -> Tuple[Optional[str], Optional[str]]:
    proj_defaults = _PROJECT_CONFIG.get(project_name.upper(), {})
    ev_baseline = (
        event_baseline or os.environ.get("REDCAP_WEARABLES_EVENT_BASELINE", "").strip() or proj_defaults.get("baseline")
    ) or None
    ev_followup = (
        event_followup or os.environ.get("REDCAP_WEARABLES_EVENT_FOLLOWUP", "").strip() or proj_defaults.get("followup")
    ) or None
    return ev_baseline, ev_followup


def _import_record(token: str, payload: Dict[str, Any], record: Dict[str, Any]) -> None:
    """
    POST a wearables record to REDCap.  On 400 with invalid field names, strip
    the offending fields and retry once.
    """
    try:
        _post_redcap(token, payload)
        return
    except RedcapError as e:
        if e.args[0] != "REDCap API returned non-200.":
            raise
        detail_text = e.detail.get("text", "") if isinstance(e.detail, dict) else str(e.detail or "")
        invalid = _parse_invalid_fields(detail_text)
        if not invalid:
            raise
        trimmed = {k: v for k, v in record.items() if k not in invalid}
        if not trimmed or trimmed == record:
            raise
        logger.info("Retrying wearables import without unsupported fields: %s", sorted(invalid))
        _post_redcap(token, {**payload, "data": json.dumps([trimmed])})


def export_wearables_to_redcap(
    patient: Patient,
    event_baseline: Optional[str] = None,
    event_followup: Optional[str] = None,
    return_payloads: bool = False,
    skip_if_populated: bool = True,
    precomputed_summary: Optional[Dict[str, Any]] = None,
) -> "Dict[str, str] | Tuple[Dict[str, str], Dict[str, Dict[str, Any]]]":
    """
    Compute wearables summary for both periods and import into REDCap.

    skip_if_populated (default True):
        If monitoring_start is already set for a given event in REDCap, that
        period is skipped to avoid overwriting previously validated data.
        Pass False to force recalculation.

    precomputed_summary: pass the result of compute_wearables_summary() to
        avoid calling it twice when the caller already has it.

    Returns {"baseline": "ok"|"skipped"|"error: ...", "followup": ...}.
    Optionally returns payload details when return_payloads=True.
    """
    project_name = (patient.project or "").strip()
    if not project_name:
        raise WearablesSyncError(
            f"Patient {patient.patient_code} has no REDCap project assigned.",
            code="wearables_missing_project",
        )

    project = resolve_project(project_name)
    token = get_token_for_project(project)

    rows = export_record_by_pat_id(project_name, patient.patient_code)
    if not rows:
        raise ValueError(
            f"No REDCap record found for patient_code={patient.patient_code} " f"in project={project_name}"
        )
    record_id = str(rows[0].get("record_id") or "").strip()
    if not record_id:
        raise ValueError(f"REDCap record for {patient.patient_code} has no record_id")

    # Build a lookup of existing REDCap data keyed by event name
    existing_by_event: Dict[str, Dict] = {}
    if skip_if_populated:
        for row in rows:
            ev = row.get("redcap_event_name", "")
            if ev:
                existing_by_event[ev] = row

    summary = precomputed_summary if precomputed_summary is not None else compute_wearables_summary(patient)
    meta = summary.get("_meta", {})
    user = meta.get("user")
    ev_baseline, ev_followup = _resolve_event_names(project_name, event_baseline, event_followup)

    results: Dict[str, str] = {}
    payloads: Dict[str, Dict[str, Any]] = {}

    for period, ev_name in [("baseline", ev_baseline), ("followup", ev_followup)]:
        data = summary.get(period)

        if not data:
            diag: Dict[str, Any] = {"status": "skipped"}
            if user:
                window = meta.get(f"{period}_window", {})
                try:
                    w_start = date_type.fromisoformat(window["start"])
                    w_end = date_type.fromisoformat(window["end"])
                    diag.update(_build_period_diagnosis(user, w_start, w_end))
                except Exception:
                    diag["skip_reason"] = "no_valid_days"
            results[period] = "skipped"
            payloads[period] = diag
            logger.info(
                "Wearables [%s] for %s: %s (%s records, %s valid activity days) in %s..%s — skipped",
                period,
                patient.patient_code,
                diag.get("skip_reason", "no_data"),
                diag.get("total_records", "?"),
                diag.get("valid_activity_days", "?"),
                diag.get("window_start", "?"),
                diag.get("window_end", "?"),
            )
            continue

        # Skip if already populated in REDCap (duplicate-protection)
        if skip_if_populated and ev_name:
            existing = existing_by_event.get(ev_name, {})
            if existing.get("monitoring_start", "").strip():
                results[period] = "skipped"
                payloads[period] = {
                    "status": "skipped",
                    "skip_reason": "already_populated",
                    "existing_start": existing.get("monitoring_start"),
                    "redcap_event": ev_name,
                }
                logger.info(
                    "Wearables [%s] for %s: REDCap event %s already has monitoring_start=%s — skipped",
                    period,
                    patient.patient_code,
                    ev_name,
                    existing.get("monitoring_start"),
                )
                continue

        record: Dict[str, Any] = {
            "record_id": record_id,
            **{k: str(v) for k, v in data.items() if v is not None},
            "wearables_complete": "1",  # Unverified — research team reviews before Complete
        }
        if ev_name:
            record["redcap_event_name"] = ev_name

        payloads[period] = {"status": "prepared", "record": record}
        payload = {
            "content": "record",
            "action": "import",
            "format": "json",
            "type": "flat",
            "overwriteBehavior": "normal",
            "returnContent": "count",
            "returnFormat": "json",
            "data": json.dumps([record]),
        }

        try:
            _import_record(token, payload, record)
            results[period] = "ok"
            payloads[period]["status"] = "sent"
            logger.info(
                "Exported wearables [%s] for %s → REDCap %s (record_id=%s, event=%s)",
                period,
                patient.patient_code,
                project_name,
                record_id,
                ev_name or "none",
            )
        except RedcapError as e:
            results[period] = f"error: {e}"
            payloads[period]["status"] = "error"
            payloads[period]["error"] = str(e)
            logger.warning(
                "Failed to export wearables [%s] for %s: %s | detail=%s",
                period,
                patient.patient_code,
                e,
                getattr(e, "detail", None),
            )

    if return_payloads:
        return results, payloads
    return results
