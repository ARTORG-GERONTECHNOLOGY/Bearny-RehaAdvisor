import json
import logging
import os
from collections import defaultdict
from datetime import datetime, timedelta
from datetime import timezone as dt_tz
from typing import Any, Dict, List, Optional, Tuple

from core.models import FitbitData, GoogleHealthData, Patient
from core.services.redcap_service import (
    RedcapError,
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


# How many weeks to take from each end of the follow-up period
BASELINE_WEEKS = 4
FOLLOWUP_WEEKS = 4

# Per-project configuration for longitudinal REDCap projects.
# Override event names with REDCAP_WEARABLES_EVENT_BASELINE / FOLLOWUP env vars.
#
# sleep_duration_format:
#   "hours_int"  — integer 0-24  (COMPASS: text integer, Max: 24)
#   "hhmm"       — "HH:MM" time  (COPAIN:  text time,    Max: 23:59)
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


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=dt_tz.utc)
    return dt.astimezone(dt_tz.utc)


def _fmt_dmy(dt: datetime) -> str:
    """Format date as DD-MM-YYYY for REDCap date_dmy fields."""
    return dt.strftime("%d-%m-%Y")


def _pick_best_wear_week(
    records: List[FitbitData],
) -> Optional[Tuple[datetime, datetime, List[FitbitData]]]:
    """
    Group records by ISO week, return (week_start, week_end, records) for the
    week with the highest total wear_time_minutes.
    """
    if not records:
        return None

    weeks: Dict[Tuple[int, int], List[FitbitData]] = defaultdict(list)
    for r in records:
        if r.date is None:
            continue
        iso = _as_utc(r.date).isocalendar()
        weeks[(iso[0], iso[1])].append(r)

    if not weeks:
        return None

    best_key = max(weeks, key=lambda k: sum((r.wear_time_minutes or 0) for r in weeks[k]))
    best_records = weeks[best_key]
    dates = sorted(_as_utc(r.date) for r in best_records if r.date)
    return dates[0], dates[-1], best_records


def _sleep_minutes_raw(r: FitbitData) -> Optional[float]:
    """Return sleep duration in fractional minutes (intermediate unit for averaging)."""
    try:
        if r.sleep and r.sleep.sleep_duration:
            return r.sleep.sleep_duration / 60_000  # ms → minutes
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
    else:  # "hours_int" — COMPASS expects integer 0-24
        return str(int(round(avg_minutes / 60)))


def _compute_averages(records: List[FitbitData], sleep_fmt: str) -> Dict[str, Any]:
    steps = [r.steps for r in records if r.steps is not None]
    # active_minutes stores Active Zone Minutes (AZM) — Fitbit's weighted formula
    # (moderate × 1 + vigorous × 2), matching the REDCap fitbit_pa description.
    active_min = [r.active_minutes for r in records if r.active_minutes is not None]
    inactive_min = [r.inactivity_minutes for r in records if r.inactivity_minutes is not None]
    sleep_min = [m for r in records for m in [_sleep_minutes_raw(r)] if m is not None]

    def _avg_int(vals: list) -> Optional[int]:
        return round(sum(vals) / len(vals)) if vals else None

    result: Dict[str, Any] = {
        "fitbit_steps": _avg_int(steps),
        "fitbit_pa": _avg_int(active_min),
        "fitbit_inactivity": _avg_int(inactive_min),
    }
    if sleep_min:
        result["sleep_duration"] = _format_sleep(sum(sleep_min) / len(sleep_min), sleep_fmt)
    return result


def _summarize_period(
    user: Any, period_start: datetime, period_end: datetime, sleep_fmt: str
) -> Optional[Dict[str, Any]]:
    # Prefer GoogleHealthData; fall back to FitbitData for users who haven't migrated yet
    records = list(
        GoogleHealthData.objects(user=user, date__gte=period_start, date__lt=period_end).order_by("date")
    )
    if not records:
        records = list(
            FitbitData.objects(user=user, date__gte=period_start, date__lt=period_end).order_by("date")
        )
    if not records:
        return None

    best = _pick_best_wear_week(records)
    if not best:
        return None

    week_start, week_end, week_records = best
    avgs = _compute_averages(week_records, sleep_fmt)
    return {
        # date_dmy format required by REDCap
        "monitoring_start": _fmt_dmy(week_start),
        "monitoring_end": _fmt_dmy(week_end),
        "monitoring_days": len(week_records),
        **avgs,
    }


def compute_wearables_summary(patient: Patient) -> Dict[str, Any]:
    """
    Compute wearables summaries for two periods:
      - baseline:  first BASELINE_WEEKS weeks after reha_end_date
      - followup:  last FOLLOWUP_WEEKS weeks before study_end_date
                   (or 26 weeks after reha_end_date if study_end_date is unset)

    sleep_duration format is determined per project:
      COMPASS → integer hours (0-24)
      COPAIN  → HH:MM time string

    Returns {"baseline": {...} or None, "followup": {...} or None}
    Raises ValueError if patient has no reha_end_date or userId.
    """
    if not patient.reha_end_date:
        raise WearablesSyncError(
            f"Patient {patient.patient_code} is missing the Rehabilitation End Date. "
            "Please set it in the patient profile before syncing.",
            code="wearables_missing_reha_end_date",
        )

    project_name = (patient.project or "").strip().upper()
    sleep_fmt = _PROJECT_CONFIG.get(project_name, {}).get("sleep_duration_format", "hours_int")

    reha_end = _as_utc(patient.reha_end_date)
    study_end_raw = patient.study_end_date
    study_end = _as_utc(study_end_raw) if study_end_raw else reha_end + timedelta(weeks=26)

    baseline_start = reha_end
    baseline_end = reha_end + timedelta(weeks=BASELINE_WEEKS)
    followup_start = study_end - timedelta(weeks=FOLLOWUP_WEEKS)
    followup_end = study_end

    try:
        user = patient.userId  # triggers MongoEngine dereference
    except Exception as e:
        raise ValueError(f"Could not resolve userId for patient {patient.patient_code}: {e}") from e

    return {
        "baseline": _summarize_period(user, baseline_start, baseline_end, sleep_fmt),
        "followup": _summarize_period(user, followup_start, followup_end, sleep_fmt),
    }


def _resolve_event_names(
    project_name: str,
    event_baseline: Optional[str],
    event_followup: Optional[str],
) -> Tuple[Optional[str], Optional[str]]:
    """
    Resolve REDCap event names with priority:
      1. Explicit argument (from API call / task parameter)
      2. Environment variable
      3. Built-in per-project defaults (_PROJECT_EVENTS)
      4. None (works for non-longitudinal / classic projects)
    """
    proj_defaults = _PROJECT_CONFIG.get(project_name.upper(), {})

    ev_baseline = (
        event_baseline or os.environ.get("REDCAP_WEARABLES_EVENT_BASELINE", "").strip() or proj_defaults.get("baseline")
    ) or None

    ev_followup = (
        event_followup or os.environ.get("REDCAP_WEARABLES_EVENT_FOLLOWUP", "").strip() or proj_defaults.get("followup")
    ) or None

    return ev_baseline, ev_followup


def export_wearables_to_redcap(
    patient: Patient,
    event_baseline: Optional[str] = None,
    event_followup: Optional[str] = None,
    return_payloads: bool = False,
) -> Dict[str, str] | Tuple[Dict[str, str], Dict[str, Dict[str, Any]]]:
    """
    Compute wearables summary for both periods and import into REDCap.

    For COMPASS, event names default to visit_baseline_arm_1 / visit_6m_arm_1.
    Override per-call or via REDCAP_WEARABLES_EVENT_BASELINE / FOLLOWUP env vars.

    Returns {"baseline": "ok" | "skipped" | "error: ...", "followup": ...}
    Optionally returns payload details when return_payloads=True:
      (results, payloads)
    """
    project_name = (patient.project or "").strip()
    if not project_name:
        raise WearablesSyncError(
            f"Patient {patient.patient_code} has no REDCap project assigned. "
            "Please set the project in the patient profile before syncing.",
            code="wearables_missing_project",
        )

    project = resolve_project(project_name)
    token = get_token_for_project(project)

    # Look up the REDCap record_id (authoritative primary key for import)
    rows = export_record_by_pat_id(project_name, patient.patient_code)
    if not rows:
        raise ValueError(
            f"No REDCap record found for patient_code={patient.patient_code} " f"in project={project_name}"
        )
    record_id = str(rows[0].get("record_id") or "").strip()
    if not record_id:
        raise ValueError(f"REDCap record for {patient.patient_code} has no record_id")

    summary = compute_wearables_summary(patient)
    ev_baseline, ev_followup = _resolve_event_names(project_name, event_baseline, event_followup)

    results: Dict[str, str] = {}
    payloads: Dict[str, Dict[str, Any]] = {}
    for period, ev_name in [("baseline", ev_baseline), ("followup", ev_followup)]:
        data = summary.get(period)
        if not data:
            results[period] = "skipped"
            payloads[period] = {
                "status": "skipped",
                "reason": "no_fitbit_data_in_period",
            }
            logger.info(
                "Wearables [%s] for %s: no Fitbit data in period — skipped",
                period,
                patient.patient_code,
            )
            continue

        record: Dict[str, Any] = {
            "record_id": record_id,
            **{k: str(v) for k, v in data.items() if v is not None},
            # Mark form as Unverified so research team can review before marking Complete
            "wearables_complete": "1",
        }
        if ev_name:
            record["redcap_event_name"] = ev_name

        payloads[period] = {
            "status": "prepared",
            "record": record,
        }

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
            _post_redcap(token, payload)
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
            logger.error(
                "Failed to export wearables [%s] for %s: %s",
                period,
                patient.patient_code,
                e,
            )

    if return_payloads:
        return results, payloads
    return results
