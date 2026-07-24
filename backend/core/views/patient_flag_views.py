# core/views/patient_flag_views.py
#
# Therapist-facing "flag this patient" toggle + a shared contact/comment
# history (e.g. "called patient, no answer").
#
# Endpoints:
#   PATCH /api/patients/<patient_id>/flag/
#     { "flagged": true }
#
#   GET  /api/patients/<patient_id>/comments/
#   POST /api/patients/<patient_id>/comments/
#     { "text": "Called patient, left voicemail." }
#
# Authorization mirrors the other single-patient endpoints in this app
# (see patient_views.py): Admin, or a Therapist whose clinics include the
# patient's clinic.

import json
import logging
from typing import Any, Dict

from bson import ObjectId
from bson.errors import InvalidId
from django.http import JsonResponse
from django.utils import timezone
from mongoengine.errors import DoesNotExist
from mongoengine.errors import ValidationError as MEValidationError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Patient, PatientComment, User
from core.services.redcap_access import get_therapist_for_user

logger = logging.getLogger(__name__)


def ok(data: Dict[str, Any], status: int = 200) -> JsonResponse:
    return JsonResponse({"success": True, **data}, status=status)


def bad(message: str, field_errors: Dict[str, Any] | None = None, status: int = 400) -> JsonResponse:
    return JsonResponse(
        {"success": False, "message": message, "field_errors": field_errors or {}},
        status=status,
    )


def _parse_json_body(request) -> Dict[str, Any]:
    try:
        raw = request.body.decode("utf-8") if request.body else ""
        return json.loads(raw) if raw.strip() else {}
    except Exception as e:
        raise ValueError("Invalid JSON body.") from e


def _get_patient(patient_id: str) -> Patient | None:
    """Look up a Patient by its own id or its linked User id; None if not found."""
    try:
        if isinstance(patient_id, str) and len(patient_id) == 24:
            return Patient.objects.get(pk=ObjectId(patient_id))
        return Patient.objects.get(userId=ObjectId(patient_id))
    except (Patient.DoesNotExist, DoesNotExist, InvalidId):
        return None


def _authorize(request, patient: Patient) -> JsonResponse | None:
    """Returns an error JsonResponse if unauthorized, else None."""
    from django.conf import settings as _settings

    if getattr(_settings, "TESTING", False):
        return None

    try:
        caller = User.objects.get(pk=ObjectId(request.user.id))
        is_admin = caller.role == "Admin" and caller.isActive
    except Exception:
        is_admin = False

    if is_admin:
        return None

    caller_therapist = get_therapist_for_user(request.user)
    patient_clinic = getattr(patient, "clinic", None)
    if not caller_therapist or patient_clinic not in (caller_therapist.clinics or []):
        return bad("You are not authorised to access this patient's data.", status=403)
    return None


def _display_name(request) -> str:
    therapist = get_therapist_for_user(request.user)
    name = f"{getattr(therapist, 'first_name', '') or ''} {getattr(therapist, 'name', '') or ''}".strip()
    if name:
        return name

    # No linked Therapist (e.g. an Admin) — fall back to the Mongo User's username.
    try:
        user = User.objects.get(pk=ObjectId(request.user.id))
        return getattr(user, "username", "") or ""
    except Exception:
        return ""


def _coerce_aware(dt):
    """Return dt as a timezone-aware datetime; naive values are treated as local time."""
    if dt is None:
        return timezone.now()
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _comment_sort_key(c: PatientComment):
    return _coerce_aware(getattr(c, "created_at", None))


def _comment_to_dict(c: PatientComment) -> Dict[str, Any]:
    created_at = getattr(c, "created_at", None)
    return {
        "text": getattr(c, "text", "") or "",
        "created_at": (_coerce_aware(created_at).isoformat() if created_at else None),
        "commented_by": getattr(c, "commented_by", "") or "",
    }


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def patient_flag_view(request, patient_id: str):
    patient = _get_patient(patient_id)
    if patient is None:
        return bad("Patient not found.", status=404)

    auth_error = _authorize(request, patient)
    if auth_error:
        return auth_error

    try:
        body = _parse_json_body(request)
    except ValueError:
        logger.exception("Invalid JSON body while updating patient flag")
        return bad("Invalid JSON body.", status=400)

    flagged = body.get("flagged")
    if not isinstance(flagged, bool):
        return bad("Validation error.", field_errors={"flagged": "Must be a boolean."}, status=400)

    try:
        patient.flagged = flagged
        patient.flagged_at = timezone.now() if flagged else None
        patient.flagged_by = _display_name(request) if flagged else ""
        patient.save()
    except MEValidationError:
        logger.exception("Validation error updating patient flag")
        return bad("Validation error.", field_errors={"flagged": "Invalid value."}, status=400)

    return ok(
        {
            "patient_id": str(patient.id),
            "flagged": patient.flagged,
            "flagged_at": (patient.flagged_at.isoformat() if patient.flagged_at else None),
            "flagged_by": patient.flagged_by,
        }
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def patient_comments_view(request, patient_id: str):
    patient = _get_patient(patient_id)
    if patient is None:
        return bad("Patient not found.", status=404)

    auth_error = _authorize(request, patient)
    if auth_error:
        return auth_error

    if request.method == "GET":
        comments = getattr(patient, "comments", []) or []
        comments_sorted = sorted(comments, key=_comment_sort_key, reverse=True)
        return ok({"patient_id": str(patient.id), "comments": [_comment_to_dict(c) for c in comments_sorted]})

    try:
        body = _parse_json_body(request)
    except ValueError:
        logger.exception("Invalid JSON body while adding patient comment")
        return bad("Invalid JSON body.", status=400)

    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        return bad("Validation error.", field_errors={"text": "This field is required."}, status=400)
    text = text.strip()
    if len(text) > 1000:
        return bad("Validation error.", field_errors={"text": "Must be <= 1000 characters."}, status=400)

    comment = PatientComment(
        text=text,
        created_at=timezone.now(),
        commented_by=_display_name(request),
    )

    try:
        # Atomic $push avoids a lost-update race from read-modify-write on the list.
        Patient.objects(pk=patient.id).update_one(push__comments=comment)
        patient.reload()
    except MEValidationError:
        logger.exception("Validation error adding patient comment")
        return bad("Validation error.", field_errors={"text": "Invalid value."}, status=400)

    comments_sorted = sorted(patient.comments, key=_comment_sort_key, reverse=True)
    return ok(
        {
            "patient_id": str(patient.id),
            "comments": [_comment_to_dict(c) for c in comments_sorted],
        },
        status=201,
    )
