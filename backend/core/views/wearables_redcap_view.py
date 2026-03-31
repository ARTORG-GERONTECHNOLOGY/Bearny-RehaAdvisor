import json
import logging

from bson import ObjectId
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Patient
from core.services.redcap_service import RedcapError
from core.services.wearables_redcap_service import (
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


@csrf_exempt
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
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    patient = _resolve_patient(patient_id)
    if not patient:
        return JsonResponse({"error": "Patient not found"}, status=404)

    try:
        body = json.loads(request.body or b"{}")
    except Exception:
        body = {}

    event_baseline = body.get("event_baseline") or None
    event_followup = body.get("event_followup") or None

    try:
        summary = compute_wearables_summary(patient)
        results = export_wearables_to_redcap(patient, event_baseline, event_followup)
    except ValueError as e:
        return JsonResponse({"error": str(e)}, status=400)
    except RedcapError as e:
        return JsonResponse({"error": str(e), "detail": e.detail}, status=502)
    except Exception as e:
        logger.exception("Unexpected error syncing wearables for patient %s", patient_id)
        return JsonResponse({"error": str(e)}, status=500)

    return JsonResponse({"ok": True, "results": results, "summary": summary})
