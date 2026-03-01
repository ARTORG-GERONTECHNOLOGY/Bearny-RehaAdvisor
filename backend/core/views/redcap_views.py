# core/views/redcap_views.py
import logging

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.services.redcap_access import (
    get_allowed_redcap_projects_for_therapist,
    get_therapist_for_user,
)
from core.services.redcap_service import RedcapError, export_record_by_pat_id

logger = logging.getLogger(__name__)


@csrf_exempt
@permission_classes([IsAuthenticated])
def redcap_projects(request):
    """
    GET /api/redcap/projects/
    Returns the REDCap projects available to the therapist, based on therapist.clinics (+ optional therapist.project).
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

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


@csrf_exempt
@permission_classes([IsAuthenticated])
def redcap_record(request):
    """
    GET /api/redcap/record/?pat_id=P17&project=COPAIN
    - Enforces clinic-based access control.
    - Returns matching rows from REDCap (may be multiple due to longitudinal/events).
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    pat_id = (request.GET.get("pat_id") or "").strip()
    project = (request.GET.get("project") or "").strip()

    if not pat_id:
        return JsonResponse({"error": "pat_id is required"}, status=400)
    if not project:
        return JsonResponse({"error": "project is required"}, status=400)

    therapist = get_therapist_for_user(request.user)
    if not therapist:
        return JsonResponse({"error": "Therapist profile not found."}, status=404)

    allowed = get_allowed_redcap_projects_for_therapist(therapist)
    if project not in allowed:
        return JsonResponse(
            {
                "error": "Not allowed to access this REDCap project for your clinic.",
                "allowedProjects": allowed,
            },
            status=403,
        )

    try:
        rows = export_record_by_pat_id(project, pat_id)
        return JsonResponse(
            {
                "ok": True,
                "project": project,
                "pat_id": pat_id,
                "count": len(rows),
                "rows": rows,
            },
            status=200,
        )
    except RedcapError as e:
        logger.exception("REDCap error while exporting record")
        return JsonResponse(
            {
                "error": str(e),
                "detail": getattr(e, "detail", None),
                "project": project,
                "pat_id": pat_id,
            },
            status=502,
        )
    except Exception as e:
        logger.exception("Unexpected server error in redcap_record")
        return JsonResponse(
            {"error": "Unexpected server error.", "project": project, "pat_id": pat_id},
            status=500,
        )
