import json
import logging

from bson import ObjectId
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Patient
from core.services.redcap_service import RedcapError
from core.services.wearables_redcap_service import (
    WearablesSyncError,
    compute_wearables_summary,
    export_wearables_to_redcap,
)

logger = logging.getLogger(__name__)


def _resolve_patient(patient_id: str):
    try:
        return Patient.objects.get(pk=patient_id)
    except Exception:
        try:
            return Patient.objects.get(userId=ObjectId(patient_id))
        except Exception:
            return None


def _build_period_response(result: str, payload: dict, summary_period) -> dict:
    """Return a clear, human-readable dict for one sync period."""
    status = payload.get("status", result)
    out: dict = {"status": status}

    if status == "skipped":
        skip_reason = payload.get("skip_reason", "unknown")
        out["skip_reason"] = skip_reason

        if payload.get("window_start"):
            out["window"] = f"{payload['window_start']} to {payload['window_end']}"

        if skip_reason == "future_window":
            out["detail"] = f"Window starts {payload.get('window_start')} — not yet reached"
        elif skip_reason == "no_records":
            out["detail"] = (
                f"No wearable records found in window " f"{payload.get('window_start')} to {payload.get('window_end')}"
            )
        elif skip_reason == "no_valid_days":
            total = payload.get("total_records", 0)
            valid_act = payload.get("valid_activity_days", 0)
            valid_sleep = payload.get("valid_sleep_nights", 0)
            wear_thresh = payload.get("wear_threshold_minutes", 600)
            out["detail"] = (
                f"{total} record(s) in window but none met the "
                f"{wear_thresh // 60}h/day wear threshold — "
                f"{valid_act} valid activity day(s), {valid_sleep} valid sleep night(s)"
            )
            out["total_records_in_window"] = total
            out["valid_activity_days"] = valid_act
            out["valid_sleep_nights"] = valid_sleep
        elif skip_reason == "already_populated":
            out["detail"] = (
                f"REDCap event {payload.get('redcap_event', '')} already has "
                f"monitoring_start={payload.get('existing_start')} — "
                f"pass force=true to overwrite"
            )
            out["existing_start"] = payload.get("existing_start")
            out["redcap_event"] = payload.get("redcap_event")

    elif status == "sent" and summary_period:
        out["window"] = f"{summary_period.get('monitoring_start')} to " f"{summary_period.get('monitoring_end')}"
        out["valid_activity_days"] = summary_period.get("valid_week_days", 0) + summary_period.get(
            "valid_weekend_days", 0
        )
        out["valid_sleep_nights"] = summary_period.get("valid_week_nights", 0) + summary_period.get(
            "valid_weekend_nights", 0
        )
        record = payload.get("record", {})
        if record.get("redcap_event_name"):
            out["redcap_event"] = record["redcap_event_name"]
        exported = {
            k: record.get(k)
            for k in ("fitbit_steps", "fitbit_pa", "fitbit_inactivity", "sleep_duration")
            if k in record
        }
        if exported:
            out["exported_values"] = exported

    elif result.startswith("error:"):
        out["detail"] = result[len("error:") :].strip()

    return out


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sync_wearables_to_redcap_view(request, patient_id: str):
    """
    POST /api/wearables/sync-to-redcap/<patient_id>/

    Manually trigger wearables sync for a single patient.
    Optional JSON body:
      {
        "event_baseline": "baseline_arm_1",
        "event_followup":  "month6_arm_1",
        "force": false
      }
    Falls back to per-project defaults (COMPASS/COPAIN) and then to
    REDCAP_WEARABLES_EVENT_BASELINE/FOLLOWUP env vars if not provided.

    force=true bypasses the already-populated guard and re-pushes even when
    monitoring_start is already set in REDCap.

    Response:
      {
        "ok": true,
        "patient_code": "934-1",
        "first_measurement_date": "2026-04-30",
        "periods": {
          "baseline": {
            "status": "skipped",
            "skip_reason": "no_valid_days",
            "window": "2026-05-07 to 2026-05-27",
            "detail": "21 record(s) in window but none met the 10h/day wear threshold...",
            "total_records_in_window": 21,
            "valid_activity_days": 0,
            "valid_sleep_nights": 0
          },
          "followup": {
            "status": "skipped",
            "skip_reason": "future_window",
            "window": "2026-09-26 to 2026-10-26",
            "detail": "Window starts 2026-09-26 — not yet reached"
          }
        }
      }
    """
    patient = _resolve_patient(patient_id)
    if not patient:
        return JsonResponse({"error": "Patient not found"}, status=404)

    try:
        body = json.loads(request.body or b"{}")
    except Exception:
        body = {}

    event_baseline = body.get("event_baseline") or None
    event_followup = body.get("event_followup") or None
    force_resync = bool(body.get("force", False))

    try:
        # Early validation: raises WearablesSyncError if no wearable data at all
        summary = compute_wearables_summary(patient)
        results, payloads = export_wearables_to_redcap(
            patient,
            event_baseline,
            event_followup,
            return_payloads=True,
            skip_if_populated=not force_resync,
            precomputed_summary=summary,
        )
    except WearablesSyncError as e:
        return JsonResponse({"error": str(e), "code": e.code}, status=400)
    except ValueError as e:
        return JsonResponse({"error": str(e)}, status=400)
    except RedcapError as e:
        return JsonResponse({"error": str(e), "detail": e.detail}, status=502)
    except Exception as e:
        logger.exception("Unexpected error syncing wearables")
        return JsonResponse({"error": str(e)}, status=500)

    meta = summary.get("_meta", {})
    periods = {
        period: _build_period_response(
            results.get(period, ""),
            payloads.get(period, {}),
            summary.get(period),
        )
        for period in ("baseline", "followup")
    }

    return JsonResponse(
        {
            "ok": True,
            "patient_code": patient.patient_code,
            "first_measurement_date": meta.get("first_date"),
            "periods": periods,
        }
    )
