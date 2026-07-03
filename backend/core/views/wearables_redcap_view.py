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


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sync_wearables_to_redcap_view(request, patient_id: str):
    """
    POST /api/wearables/sync-to-redcap/<patient_id>/

    Manually trigger wearables sync for a single patient.
    Optional JSON body:
      {
        "event_baseline": "baseline_arm_1",
        "event_followup":  "month6_arm_1"
      }
    Falls back to per-project defaults (COMPASS/COPAIN) and then to
    REDCAP_WEARABLES_EVENT_BASELINE/FOLLOWUP env vars if not provided.
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
    # force=true bypasses the skip_if_populated guard and re-pushes even when
    # monitoring_start is already set in REDCap.  Requires explicit opt-in to
    # prevent accidental overwrites of previously validated data.
    force_resync = bool(body.get("force", False))

    try:
        summary = compute_wearables_summary(patient)
        results, sent_payloads = export_wearables_to_redcap(
            patient,
            event_baseline,
            event_followup,
            return_payloads=True,
            skip_if_populated=not force_resync,
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

    return JsonResponse(
        {
            "ok": True,
            "results": results,
            "summary": summary,
            "sent_payloads": sent_payloads,
        }
    )
