# core/views/redcap_import_views.py
import json
import logging
import secrets
import string
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import User, Patient
from core.services.redcap_access import (
    get_therapist_for_user,
    get_allowed_redcap_projects_for_therapist,
)
from core.services.redcap_service import export_record_by_pat_id, RedcapError

logger = logging.getLogger(__name__)


def _gen_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _hash_password(raw: str) -> str:
    """
    IMPORTANT: replace with your existing hashing method used by your login system.
    If your platform auth expects bcrypt/pbkdf2/etc, you MUST use that here.
    """
    import hashlib
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _pick_first_nonempty(rc: dict, keys: list[str], default: str = "") -> str:
    for k in keys:
        v = rc.get(k)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return default


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def import_patient_from_redcap(request):
    """
    POST /api/redcap/import-patient/
    body: {"patient_code":"P17", "project":"COPAIN"}  (project optional)

    Creates platform User + Patient linked by patient_code (pat_id connector).
    Does NOT store full REDCap patient data in Mongo; only minimal platform fields.
    """
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    patient_code = (payload.get("patient_code") or "").strip()
    project = (payload.get("project") or "").strip()  # optional

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

    # If already exists, don't import again
    existing = Patient.objects(patient_code=patient_code).first()
    if existing:
        return JsonResponse(
            {
                "error": "Patient already exists in the platform.",
                "patientId": str(existing.id),
                "patient_code": patient_code,
            },
            status=409,
        )

    # Determine which project to use:
    projects_to_search = [project] if project else allowed
    if project and project not in allowed:
        return JsonResponse(
            {
                "error": "Not allowed to access this REDCap project for your clinic.",
                "allowedProjects": allowed,
            },
            status=403,
        )

    rc = None
    chosen_project = None
    redcap_errors = []

    for proj in projects_to_search:
        try:
            rows = export_record_by_pat_id(proj, patient_code) or []
            if rows:
                rc = rows[0]  # best row for now; refine if you use events/longitudinal
                chosen_project = proj
                break
        except RedcapError as e:
            logger.exception("REDCap error while importing (project=%s)", proj)
            redcap_errors.append({"project": proj, "error": str(e), "detail": getattr(e, "detail", None)})
        except Exception as e:
            logger.exception("Unexpected error while importing (project=%s)", proj)
            redcap_errors.append({"project": proj, "error": "Unexpected server error.", "detail": str(e)})

    if not rc:
        if redcap_errors:
            return JsonResponse(
                {
                    "error": "Failed to retrieve REDCap record (one or more projects errored).",
                    "patient_code": patient_code,
                    "allowedProjects": allowed,
                    "errors": redcap_errors,
                },
                status=502,
            )
        return JsonResponse(
            {
                "error": "No REDCap record found for this patient_code in allowed projects.",
                "patient_code": patient_code,
                "allowedProjects": allowed,
            },
            status=404,
        )

    try:
        # ---- Minimal mapping for platform account creation ----
        # If you have email/phone fields in REDCap, map them here.
        email = _pick_first_nonempty(rc, ["email", "e_mail", "mail"], default=f"{patient_code}@invalid.local")
        phone = _pick_first_nonempty(rc, ["phone", "telefon", "mobile"], default="0000000000")

        temp_password = _gen_password()
        now = timezone.now()

        # Create user (MongoEngine)
        user = User(
            username=patient_code,
            role="Patient",
            createdAt=now,
            updatedAt=now,
            email=email,
            phone=phone,
            pwdhash=_hash_password(temp_password),
            isActive=True,
        )
        user.save()

        # Create patient (MongoEngine) — assumes you will make most fields optional.
        # Keep only platform-owned required bits.
        clinic = (therapist.clinics[0] if getattr(therapist, "clinics", None) else "")
        access_word = _gen_password(10)

        patient = Patient(
            userId=user,
            patient_code=patient_code,
            therapist=therapist,
            clinic=clinic,
            access_word=access_word,
            # everything else should be optional in your updated model
        )
        patient.save()

        return JsonResponse(
            {
                "ok": True,
                "message": "Patient imported successfully.",
                "patientId": str(patient.id),
                "patient_code": patient_code,
                "project": chosen_project,
                # Return once; FE should show it once with copy button and warning.
                "tempPassword": temp_password,
            },
            status=201,
        )

    except Exception as e:
        logger.exception("Unexpected error creating platform patient from REDCap")
        return JsonResponse(
            {
                "error": "Failed to create patient in platform.",
                "detail": str(e),
            },
            status=500,
        )
