# core/views/redcap_view.py
#
# Legacy REDCap participant views — not currently wired to any URL.
# import_redcap_participant was removed because it referenced the
# non-existent settings.REDCAP_API_TOKEN (the codebase uses per-project
# REDCAP_TOKEN_COPAIN / REDCAP_TOKEN_COMPASS via redcap_service.py instead).
# list_my_redcap_participants is kept for future use but not yet exposed.

import json
import logging

from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import RedcapParticipant, Therapist

logger = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_my_redcap_participants(request):
    """
    GET /api/redcap/my-participants/  (not yet in urls.py)
    Returns RedcapParticipant records assigned to the calling therapist.
    """
    therapist = Therapist.objects.filter(userId=request.user).first()
    if not therapist:
        return JsonResponse({"error": "Only therapists"}, status=403)

    q = (request.GET.get("q") or "").strip().lower()
    clinic = (request.GET.get("clinic") or "").strip()

    qs = RedcapParticipant.objects(assigned_therapist=therapist, is_active=True)
    if clinic:
        qs = qs.filter(clinic=clinic)
    if q:
        qs = qs.filter(record_id__icontains=q)

    out = [
        {
            "id": str(p.id),
            "record_id": p.record_id,
            "gender": p.gender,
            "primary_diagnosis": p.primary_diagnosis,
            "clinic": p.clinic,
            "last_synced_at": (p.last_synced_at.isoformat() if p.last_synced_at else None),
        }
        for p in qs.order_by("-updated_at")
    ]
    return JsonResponse({"items": out}, status=200)
