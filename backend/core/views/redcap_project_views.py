# core/views/redcap_project_views.py
import logging
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.services.redcap_access import (
    get_therapist_for_user,
    get_allowed_redcap_projects_for_therapist,
)

logger = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def redcap_projects(request):
    """
    GET /api/redcap/projects/
    Returns projects the logged-in therapist is allowed to access (clinic-based).
    """
    therapist = get_therapist_for_user(request.user)
    if not therapist:
        return JsonResponse({"error": "Therapist profile not found."}, status=404)

    allowed = get_allowed_redcap_projects_for_therapist(therapist)
    return JsonResponse(
        {
            "ok": True,
            "clinics": list(getattr(therapist, "clinics", []) or []),
            "allowedProjects": allowed,
        },
        status=200,
    )
