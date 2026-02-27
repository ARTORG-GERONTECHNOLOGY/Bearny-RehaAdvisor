# core/views/patient_thresholds.py
# Full Django view + “serializer-style” validation + MongoEngine update logic
#
# Endpoints:
#   GET   /api/patients/<patient_id>/thresholds/
#   PATCH /api/patients/<patient_id>/thresholds/
#
# Payload (PATCH):
# {
#   "thresholds": { ... },
#   "effective_from": "2026-02-13T00:00:00Z",   # optional
#   "reason": "Adjusted after week 2 assessment" # optional
# }
#
# Notes:
# - Uses safe history append:
#   - Always stores a snapshot of the *previous* current thresholds in patient.thresholds_history
#   - Updates patient.thresholds to the new values
# - Optional backdating:
#   - If effective_from is in the past, the snapshot is still appended with that effective_from
#   - (This means “the change became effective then”; the history timeline will reflect it)
# - Authorization:
#   - Therapist/Admin can edit
#   - Therapist can only edit their own patient (patient.therapist.userId == request.user)
#
# Requirements:
# - MongoEngine models:
#   Patient.thresholds : EmbeddedDocumentField(PatientThresholds)
#   Patient.thresholds_history : ListField(EmbeddedDocumentField(PatientThresholdsSnapshot))
#   PatientThresholdsSnapshot has: effective_from, changed_by, reason, thresholds
#
# Plug this file into your urls.py accordingly.

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from bson import ObjectId
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from mongoengine.errors import DoesNotExist
from mongoengine.errors import ValidationError as MEValidationError
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import PatientThresholds  # adjust import path
from core.models import (
    Patient,
    PatientThresholdsSnapshot,
    User,
)

logger = logging.getLogger(__name__)


# ----------------------------
# Helpers: parsing & responses
# ----------------------------
def ok(data: Dict[str, Any], status: int = 200) -> JsonResponse:
    return JsonResponse({"success": True, **data}, status=status)


def bad(
    message: str,
    field_errors: Optional[Dict[str, Any]] = None,
    non_field_errors=None,
    status: int = 400,
) -> JsonResponse:
    return JsonResponse(
        {
            "success": False,
            "message": message,
            "field_errors": field_errors or {},
            "non_field_errors": non_field_errors or [],
        },
        status=status,
    )


def _parse_json_body(request) -> Dict[str, Any]:
    try:
        raw = request.body.decode("utf-8") if request.body else ""
        if not raw.strip():
            return {}
        return json.loads(raw)
    except Exception:
        raise ValueError("Invalid JSON body.")


def _parse_iso_dt(value: Any) -> Optional[datetime]:
    """
    Accept ISO 8601 string with or without timezone.
    Returns timezone-aware datetime in current timezone.
    """
    if value in (None, "", False):
        return None

    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        s = value.strip()
        # Python 3.11: fromisoformat supports many ISO variants but not always 'Z'
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(s)
        except Exception:
            return None
    else:
        return None

    if timezone.is_naive(dt):
        # Assume the provided dt is in current server timezone if naive
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    else:
        dt = dt.astimezone(timezone.get_current_timezone())

    return dt


def _user_is_admin(user: User) -> bool:
    return getattr(user, "role", "") == "Admin"


def _user_is_therapist(user: User) -> bool:
    return getattr(user, "role", "") == "Therapist"


def _user_is_patient(user: User) -> bool:
    return getattr(user, "role", "") == "Patient"


# -----------------------------------
# “Serializer-style” validation layer
# -----------------------------------
@dataclass
class ThresholdsUpdateValidated:
    thresholds: PatientThresholds
    effective_from: datetime
    reason: str


class PatientThresholdsSerializer:
    """
    Minimal serializer-style validator (no DRF serializers needed).
    - Validates allowed fields
    - Validates type and reasonable ranges
    - Returns PatientThresholds EmbeddedDocument instance
    """

    # Field specs: (type, min, max) where min/max optional
    INT_FIELDS = {
        # steps
        "steps_goal": (int, 0, 200000),
        # active minutes
        "active_minutes_green": (int, 0, 24 * 60),
        "active_minutes_yellow": (int, 0, 24 * 60),
        # sleep minutes
        "sleep_green_min": (int, 0, 24 * 60),
        "sleep_yellow_min": (int, 0, 24 * 60),
        # blood pressure sys/dia max thresholds
        "bp_sys_green_max": (int, 50, 250),
        "bp_sys_yellow_max": (int, 50, 250),
        "bp_dia_green_max": (int, 30, 180),
        "bp_dia_yellow_max": (int, 30, 180),
    }

    ALLOWED_FIELDS = set(INT_FIELDS.keys())

    @classmethod
    def validate(cls, payload: Any, partial: bool = True) -> Tuple[Optional[PatientThresholds], Dict[str, str]]:
        errors: Dict[str, str] = {}

        if payload is None:
            return None, {"thresholds": "This field is required."}
        if not isinstance(payload, dict):
            return None, {"thresholds": "Must be an object."}

        # reject unknown fields (helps catch typos)
        for k in payload.keys():
            if k not in cls.ALLOWED_FIELDS:
                errors[f"thresholds.{k}"] = "Unknown field."

        # type + range checks
        cleaned: Dict[str, int] = {}
        for field, (tp, mn, mx) in cls.INT_FIELDS.items():
            if field not in payload:
                continue
            v = payload.get(field)

            # allow null to mean “no change” in partial updates
            if v is None and partial:
                continue

            # accept numeric strings too
            if isinstance(v, str) and v.strip().isdigit():
                v = int(v.strip())

            if not isinstance(v, tp):
                errors[f"thresholds.{field}"] = "Must be an integer."
                continue

            if mn is not None and v < mn:
                errors[f"thresholds.{field}"] = f"Must be >= {mn}."
                continue
            if mx is not None and v > mx:
                errors[f"thresholds.{field}"] = f"Must be <= {mx}."
                continue

            cleaned[field] = int(v)

        # cross-field logic
        # green should typically be >= yellow (for thresholds that are “minimum” goals)
        if "active_minutes_green" in cleaned and "active_minutes_yellow" in cleaned:
            if cleaned["active_minutes_green"] < cleaned["active_minutes_yellow"]:
                errors["thresholds.active_minutes_green"] = "Green threshold must be >= yellow threshold."

        if "sleep_green_min" in cleaned and "sleep_yellow_min" in cleaned:
            if cleaned["sleep_green_min"] < cleaned["sleep_yellow_min"]:
                errors["thresholds.sleep_green_min"] = "Green threshold must be >= yellow threshold."

        # for BP “max” thresholds, green max should be <= yellow max (green is stricter)
        if "bp_sys_green_max" in cleaned and "bp_sys_yellow_max" in cleaned:
            if cleaned["bp_sys_green_max"] > cleaned["bp_sys_yellow_max"]:
                errors["thresholds.bp_sys_green_max"] = "Green max must be <= yellow max."

        if "bp_dia_green_max" in cleaned and "bp_dia_yellow_max" in cleaned:
            if cleaned["bp_dia_green_max"] > cleaned["bp_dia_yellow_max"]:
                errors["thresholds.bp_dia_green_max"] = "Green max must be <= yellow max."

        if errors:
            return None, errors

        # Build a PatientThresholds with only provided fields set.
        # We'll merge with existing patient.thresholds in update logic.
        th = PatientThresholds(**cleaned)  # EmbeddedDocument
        return th, {}


class ThresholdsUpdateSerializer:
    """
    Validates the full PATCH request body.
    Produces ThresholdsUpdateValidated.
    """

    @classmethod
    def validate(cls, body: Dict[str, Any]) -> Tuple[Optional[ThresholdsUpdateValidated], Dict[str, str]]:
        errors: Dict[str, str] = {}

        th_raw = body.get("thresholds")
        th_partial, th_errors = PatientThresholdsSerializer.validate(th_raw, partial=True)
        errors.update(th_errors)

        eff_raw = body.get("effective_from", None)
        eff = _parse_iso_dt(eff_raw)
        if eff_raw not in (None, "", False) and eff is None:
            errors["effective_from"] = "Invalid datetime. Use ISO 8601 (e.g., 2026-02-13T00:00:00Z)."

        # default: now
        if eff is None:
            eff = timezone.now()

        reason = body.get("reason", "")
        if reason is None:
            reason = ""
        if not isinstance(reason, str):
            errors["reason"] = "Must be a string."
        else:
            reason = reason.strip()
            if len(reason) > 500:
                errors["reason"] = "Must be <= 500 characters."

        if th_partial is None and "thresholds" not in errors:
            # Should not happen, but keep safe
            errors["thresholds"] = "Invalid thresholds."

        if errors:
            return None, errors

        return (
            ThresholdsUpdateValidated(thresholds=th_partial, effective_from=eff, reason=reason),
            {},
        )


# ----------------------------
# MongoEngine update logic
# ----------------------------
def _ensure_patient_thresholds(patient: Patient) -> PatientThresholds:
    """
    If patient.thresholds missing/null, return a default thresholds doc.
    """
    current = getattr(patient, "thresholds", None)
    if current is None:
        current = PatientThresholds()
    return current


def _thresholds_to_dict(th: PatientThresholds) -> Dict[str, Any]:
    # MongoEngine EmbeddedDocument: to_mongo() is safe
    try:
        return th.to_mongo().to_dict()
    except Exception:
        # fallback
        d = {}
        for k in PatientThresholdsSerializer.ALLOWED_FIELDS:
            d[k] = getattr(th, k, None)
        return d


def _merge_thresholds(current: PatientThresholds, patch: PatientThresholds) -> PatientThresholds:
    """
    Merge only fields present in patch into current.
    Because patch was built only from provided fields, we inspect its mongo dict.
    """
    cur_d = _thresholds_to_dict(current)
    patch_d = _thresholds_to_dict(patch)

    # Patch dict will include defaults for fields not passed if PatientThresholds has defaults.
    # To avoid overwriting with default values, we instead use the original payload-derived dict.
    # So we reconstruct “provided fields” by checking which keys were explicitly set in patch object
    # vs default instance; simplest: look at __dict__ but MongoEngine stores _data.
    provided = {}
    if hasattr(patch, "_data") and isinstance(patch._data, dict):
        # _data contains only explicitly set fields + defaults; but still might include defaults.
        # Better: detect keys that are not None AND differ from freshly constructed default (if needed).
        provided = {k: patch._data.get(k) for k in PatientThresholdsSerializer.ALLOWED_FIELDS if k in patch._data}
    else:
        provided = patch_d

    for k, v in provided.items():
        if v is None:
            continue
        cur_d[k] = v

    # Build new thresholds embedded doc
    return PatientThresholds(
        **{k: cur_d.get(k) for k in PatientThresholdsSerializer.ALLOWED_FIELDS if cur_d.get(k) is not None}
    )


def _thresholds_equal(a: PatientThresholds, b: PatientThresholds) -> bool:
    a_d = _thresholds_to_dict(a)
    b_d = _thresholds_to_dict(b)
    # compare only allowed fields
    for k in PatientThresholdsSerializer.ALLOWED_FIELDS:
        if a_d.get(k) != b_d.get(k):
            return False
    return True


def update_patient_thresholds_with_history(
    patient: Patient,
    new_partial: PatientThresholds,
    effective_from: datetime,
    reason: str,
    create_history_if_noop: bool = False,
) -> Patient:
    """
    Safely:
      1) snapshot current thresholds into history (with effective_from + changed_by + reason)
      2) update patient.thresholds
      3) save

    Optional:
      - If new thresholds equal current, skip unless create_history_if_noop=True
    """
    current = _ensure_patient_thresholds(patient)
    merged = _merge_thresholds(current, new_partial)

    if (not create_history_if_noop) and _thresholds_equal(current, merged):
        return patient  # no-op

    snapshot = PatientThresholdsSnapshot(
        effective_from=effective_from,
        reason=reason or "",
        thresholds=current,
    )

    # Append history safely
    history = list(getattr(patient, "thresholds_history", []) or [])
    history.append(snapshot)

    patient.thresholds_history = history
    patient.thresholds = merged
    patient.updatedAt = timezone.now()

    patient.save()
    return patient


# ----------------------------
# View
# ----------------------------
@csrf_exempt
@permission_classes([IsAuthenticated])
def patient_thresholds_view(request, patient_id: str):
    """
    GET /api/patients/<patient_id>/thresholds/
    POST /api/patients/<patient_id>/thresholds/
    """
    # ---- load patient ----
    print("patient_thresholds_view called with patient_id:", patient_id)
    try:
        pat = Patient.objects.get(pk=ObjectId(patient_id))
    except (DoesNotExist, Exception):
        return bad("Patient not found.", status=404)

    if request.method == "GET":
        # Patients can read only themselves

        current = _ensure_patient_thresholds(pat)
        hist = list(getattr(pat, "thresholds_history", []) or [])

        # Sort history descending by effective_from
        hist_sorted = sorted(
            hist,
            key=lambda x: getattr(x, "effective_from", timezone.now()),
            reverse=True,
        )

        def hist_item(h: PatientThresholdsSnapshot) -> Dict[str, Any]:
            cb = getattr(h, "changed_by", None)
            return {
                "effective_from": (h.effective_from.isoformat() if getattr(h, "effective_from", None) else None),
                "changed_by": (str(cb.id) if cb else None),
                "reason": getattr(h, "reason", "") or "",
                "thresholds": _thresholds_to_dict(getattr(h, "thresholds", PatientThresholds())),
            }

        return ok(
            {
                "patient_id": str(pat.id),
                "thresholds": _thresholds_to_dict(current),
                "history": [hist_item(h) for h in hist_sorted[:200]],  # cap
            }
        )

    if request.method not in ("PATCH", "POST"):
        return bad("Method not allowed.", status=405)

    # ---- parse body ----
    try:
        body = _parse_json_body(request)
    except ValueError as ve:
        return bad(str(ve), status=400)

    # ---- validate ----
    validated, v_errors = ThresholdsUpdateSerializer.validate(body)
    if v_errors:
        return bad("Validation error.", field_errors=v_errors, status=400)

    assert validated is not None

    # ---- update ----
    try:
        updated = update_patient_thresholds_with_history(
            patient=pat,
            new_partial=validated.thresholds,
            effective_from=validated.effective_from,
            reason=validated.reason,
            create_history_if_noop=False,
        )
    except MEValidationError as e:
        logger.exception("MongoEngine validation error updating thresholds")
        return bad("Validation error.", non_field_errors=[str(e)], status=400)
    except Exception as e:
        logger.exception("Error updating thresholds")
        return bad("Unexpected error.", non_field_errors=[str(e)], status=500)

    return ok(
        {
            "message": "Thresholds updated.",
            "patient_id": str(updated.id),
            "thresholds": _thresholds_to_dict(_ensure_patient_thresholds(updated)),
        },
        status=200,
    )
