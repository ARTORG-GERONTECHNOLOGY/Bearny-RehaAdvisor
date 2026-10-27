# core/views/redcap_views.py
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.services.redcap_access import (
    get_allowed_redcap_projects_for_therapist,
    get_therapist_for_user,
)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def redcap_projects(request):
    """
    GET /api/redcap/projects/
    Returns the REDCap projects available to the therapist, based on therapist.clinics (+ optional therapist.project).
    """
    therapist = get_therapist_for_user(request.user)
    if not therapist:
        return JsonResponse({"error": "Therapist profile not found."}, status=404)

    allowed = get_allowed_redcap_projects_for_therapist(therapist)
    return JsonResponse(
        {
            "ok": True,
            "clinics": therapist.clinics or [],
            "therapistProject": getattr(therapist, "project", "") or "",
            "allowedProjects": allowed,
        },
        status=200,
    )
