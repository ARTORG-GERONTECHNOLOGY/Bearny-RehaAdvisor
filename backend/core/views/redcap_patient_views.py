# core/views/redcap_patient_views.py
import logging
from typing import Any, Dict, List

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.services.redcap_access import (
    get_allowed_redcap_projects_for_therapist,
    get_therapist_for_user,
)
from core.services.redcap_service import RedcapError, export_record_by_pat_id
from core.views.redcap_import_views import _norm, get_therapist_by_user_id

logger = logging.getLogger(__name__)


@csrf_exempt
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
    print(project)

    if not patient_code:
        return JsonResponse({"ok": False, "error": "patient_code is required"}, status=400)
    therapist_user_id = _norm(request.GET.get("therapistUserId"))

    # Allow both: (A) therapistUserId param OR (B) derive from request.user
    therapist = (
        get_therapist_by_user_id(therapist_user_id) if therapist_user_id else get_therapist_for_user(request.user)
    )
    if not therapist:
        return JsonResponse({"ok": False, "error": "Therapist profile not found."}, status=404)

    allowed = therapist.projects
    print("Allowed REDCap projects for therapist:", allowed)
    if not allowed:
        return JsonResponse(
            {
                "ok": False,
                "error": "No REDCap projects configured for your clinic.",
                "project": project,
            },
            status=403,
        )

    # Decide which projects to search
    if project:
        if project not in allowed:
            return JsonResponse(
                {
                    "ok": False,
                    "error": "Not allowed to access this REDCap project for your clinic.",
                    "allowedProjects": allowed,
                },
                status=403,
            )
        projects_to_search = [project] if isinstance(project, str) else project
    else:
        projects_to_search = allowed

    matches: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    for proj in projects_to_search:
        try:
            rows = export_record_by_pat_id(proj, patient_code) or []
            print(rows)
            if rows:
                matches.append({"project": proj, "count": len(rows), "rows": rows})
        except RedcapError as e:
            logger.exception("REDCap error in redcap_patient (project=%s)", proj)
            errors.append({"project": proj, "error": str(e), "detail": getattr(e, "detail", None)})
        except Exception as e:
            logger.exception("Unexpected error in redcap_patient (project=%s)", proj)
            errors.append({"project": proj, "error": "Unexpected server error.", "detail": str(e)})

    if not matches:
        if errors:
            return JsonResponse(
                {
                    "ok": False,
                    "error": "Failed to retrieve REDCap records (one or more projects errored).",
                    "patient_code": patient_code,
                    "allowedProjects": allowed,
                    "errors": errors,
                },
                status=502,
            )

        return JsonResponse(
            {
                "ok": False,
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
            "errors": errors,
        },
        status=200,
    )
