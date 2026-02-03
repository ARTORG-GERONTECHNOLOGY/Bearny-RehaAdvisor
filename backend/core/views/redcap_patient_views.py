# core/views/redcap_patient_views.py
import logging
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.services.redcap_access import (
    get_therapist_for_user,
    get_allowed_redcap_projects_for_therapist,
)
from core.services.redcap_service import export_record_by_pat_id, RedcapError

logger = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def redcap_patient(request):
    """
    GET /api/redcap/patient/?patient_code=P17[&project=COPAIN]
    Fetches REDCap record(s) live and returns them. No MongoDB save.

    Clinic-based access control:
      - If 'project' is omitted: search across all allowed projects for therapist.
      - If 'project' is provided: must be in allowed set.
    """
    patient_code = (request.GET.get("patient_code") or "").strip()
    project = (request.GET.get("project") or "").strip()

    if not patient_code:
        return JsonResponse({"error": "patient_code is required"}, status=400)

    therapist = get_therapist_for_user(request.user)
    if not therapist:
        return JsonResponse({"error": "Therapist profile not found."}, status=404)

    allowed = get_allowed_redcap_projects_for_therapist(therapist)
    if not allowed:
        return JsonResponse(
            {"error": "No REDCap projects configured for your clinic."},
            status=403,
        )

    # If project specified, validate it.
    projects_to_search = []
    if project:
        if project not in allowed:
            return JsonResponse(
                {
                    "error": "Not allowed to access this REDCap project for your clinic.",
                    "allowedProjects": allowed,
                },
                status=403,
            )
        projects_to_search = [project]
    else:
        projects_to_search = allowed

    matches = []
    errors = []

    for proj in projects_to_search:
        try:
            rows = export_record_by_pat_id(proj, patient_code) or []
            if rows:
                matches.append(
                    {
                        "project": proj,
                        "count": len(rows),
                        "rows": rows,  # may be >1 if longitudinal/events
                    }
                )
        except RedcapError as e:
            # REDCap errors per project are collected; we still try other projects.
            logger.exception("REDCap error in redcap_patient (project=%s)", proj)
            errors.append({"project": proj, "error": str(e), "detail": getattr(e, "detail", None)})

        except Exception as e:
            logger.exception("Unexpected error in redcap_patient (project=%s)", proj)
            errors.append({"project": proj, "error": "Unexpected server error.", "detail": str(e)})

    if not matches:
        # If we had errors, return 502; otherwise record not found.
        if errors:
            return JsonResponse(
                {
                    "error": "Failed to retrieve REDCap records (one or more projects errored).",
                    "patient_code": patient_code,
                    "allowedProjects": allowed,
                    "errors": errors,
                },
                status=502,
            )
        return JsonResponse(
            {
                "error": "No REDCap record found for this patient_code in the allowed projects.",
                "patient_code": patient_code,
                "allowedProjects": allowed,
            },
            status=404,
        )

    return JsonResponse(
        {
            "ok": True,
            "patient_code": patient_code,
            "searchedProjects": projects_to_search,
            "matches": matches,
            "errors": errors,  # might be non-empty if one project failed but another succeeded
        },
        status=200,
    )
