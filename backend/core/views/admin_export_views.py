"""
Admin export endpoint: download patient data as CSV, optionally filtered by clinic.

Route registered in urls.py:
  GET /api/admin/export/patients/?clinics=all
  GET /api/admin/export/patients/?clinics=Inselspital,Bern

Query parameters
----------------
clinics : str, optional
    Comma-separated list of clinic names to include, or "all" / omitted for
    the full database.

Response
--------
200  text/csv attachment — filename: patients_export_<iso-date>.csv
400  JSON  {"error": "..."} for bad input
500  JSON  {"error": "Internal server error"} on unexpected failure

CSV column order (grouped/sorted by clinic)
------------------------------------------
clinic, project, patient_code, first_name, last_name, age, sex,
diagnosis, function, therapist, reha_end_date, study_end_date,
duration_days, preferred_language, created_at
"""

import csv
import io
import logging
from datetime import date

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Patient, Therapist

logger = logging.getLogger(__name__)

# Ordered CSV header
_HEADERS = [
    "clinic",
    "project",
    "patient_code",
    "first_name",
    "last_name",
    "age",
    "sex",
    "diagnosis",
    "function",
    "therapist",
    "reha_end_date",
    "study_end_date",
    "duration_days",
    "preferred_language",
    "created_at",
]


def _therapist_name(patient):
    try:
        th = patient.therapist
        if th is None:
            return ""
        first = getattr(th, "first_name", "") or ""
        last = getattr(th, "name", "") or ""
        return f"{first} {last}".strip()
    except Exception:
        return ""


def _fmt_date(dt):
    if dt is None:
        return ""
    try:
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return ""


def _row(patient):
    return {
        "clinic": getattr(patient, "clinic", "") or "",
        "project": getattr(patient, "project", "") or "",
        "patient_code": getattr(patient, "patient_code", "") or "",
        "first_name": getattr(patient, "first_name", "") or "",
        "last_name": getattr(patient, "name", "") or "",
        "age": getattr(patient, "age", "") or "",
        "sex": getattr(patient, "sex", "") or "",
        "diagnosis": "; ".join(getattr(patient, "diagnosis", None) or []),
        "function": "; ".join(getattr(patient, "function", None) or []),
        "therapist": _therapist_name(patient),
        "reha_end_date": _fmt_date(getattr(patient, "reha_end_date", None)),
        "study_end_date": _fmt_date(getattr(patient, "study_end_date", None)),
        "duration_days": str(getattr(patient, "duration", "") or ""),
        "preferred_language": getattr(patient, "preferred_language", "") or "",
        "created_at": _fmt_date(getattr(patient, "createdAt", None)),
    }


@csrf_exempt
@permission_classes([IsAuthenticated])
def admin_export_patients(request):
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        clinics_param = (request.GET.get("clinics") or "all").strip()

        if clinics_param.lower() == "all" or not clinics_param:
            qs = Patient.objects.all()
        else:
            requested = [c.strip() for c in clinics_param.split(",") if c.strip()]
            if not requested:
                return JsonResponse({"error": "No valid clinic names provided"}, status=400)
            qs = Patient.objects(clinic__in=requested)

        # Sort by clinic then patient_code for grouped output
        patients = list(qs.order_by("clinic", "patient_code"))

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=_HEADERS, extrasaction="ignore")
        writer.writeheader()
        for pt in patients:
            writer.writerow(_row(pt))

        today = date.today().isoformat()
        filename = f"patients_export_{today}.csv"

        response = HttpResponse(output.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    except Exception:
        logger.exception("admin_export_patients failed")
        return JsonResponse({"error": "Internal server error"}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def admin_export_clinics(request):
    """
    GET /api/admin/export/clinics/
    Returns the list of distinct clinic names present in the Patient collection.
    Used by the frontend to populate the clinic filter checkboxes.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        clinics = sorted(
            {(getattr(p, "clinic", "") or "").strip() for p in Patient.objects.only("clinic")}
            - {""}
        )
        return JsonResponse({"clinics": clinics}, status=200)
    except Exception:
        logger.exception("admin_export_clinics failed")
        return JsonResponse({"error": "Internal server error"}, status=500)
