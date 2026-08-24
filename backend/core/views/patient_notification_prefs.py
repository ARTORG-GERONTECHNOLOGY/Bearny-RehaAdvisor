# core/views/patient_notification_prefs.py
#
# Endpoints:
#   GET  /api/patients/<patient_id>/notification-preferences/
#   POST /api/patients/<patient_id>/notification-preferences/
#   POST   /api/patients/<patient_id>/push-subscription/
#   DELETE /api/patients/<patient_id>/push-subscription/
#
# Preferences are per-category booleans mirroring Intervention.aim (see
# core/notifications/categorize.py): education, exercise, instructions,
# reminder, behavior_change, other. GET is readable by the patient
# themselves or their therapist (surfaced read-only on the therapist patient
# page); POST/DELETE are restricted to the patient themselves.
#
# Pattern cloned from core/views/patient_thresholds.py (patient lookup by pk
# then userId fallback, ok()/bad() JSON helpers) and the IDOR guard from
# core/views/patient_views.py::mark_intervention_completed.

import json
import logging
from typing import Any, Dict

from bson import ObjectId
from django.conf import settings
from django.http import JsonResponse
from mongoengine.errors import NotUniqueError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Patient, PatientNotificationPreferences, PushSubscription, SentPushNotification
from core.notifications.push_endpoints import is_allowed_push_endpoint
from core.services.redcap_access import get_therapist_for_user
from core.views.patient_views import _as_aware_utc

logger = logging.getLogger(__name__)

PREFERENCE_FIELDS = ("education", "exercise", "instructions", "reminder", "behavior_change", "other")
INVALID_JSON_BODY_MESSAGE = "Invalid JSON body."
PATIENT_NOT_FOUND_MESSAGE = "Patient not found."


def ok(data: Dict[str, Any], status: int = 200) -> JsonResponse:
    return JsonResponse({"success": True, **data}, status=status)


def bad(message: str, status: int = 400, code: str | None = None) -> JsonResponse:
    body: Dict[str, Any] = {"success": False, "message": message}
    if code:
        body["code"] = code
    return JsonResponse(body, status=status)


def _parse_json_body(request) -> Dict[str, Any]:
    try:
        raw = request.body.decode("utf-8") if request.body else ""
        return json.loads(raw) if raw.strip() else {}
    except Exception:
        raise ValueError(INVALID_JSON_BODY_MESSAGE)


_DISALLOWED_QUERY_SCALAR_TOKENS = ("$", "\x00", "{", "}", "[", "]")
_MAX_QUERY_SCALAR_LENGTH = 2048


def _sanitize_query_scalar_string(value: Any, field_name: str) -> str:
    # Defensive NoSQL injection guard: reject non-strings and obvious Mongo
    # operator/null-byte/document-literal tokens before a value reaches a
    # MongoEngine filter. Real values for the fields this guards (currently
    # just `endpoint`) never contain these characters, so this is a no-op
    # for legitimate requests.
    if not isinstance(value, str) or not value:
        raise ValueError(f"'{field_name}' is required.")
    if len(value) > _MAX_QUERY_SCALAR_LENGTH or any(token in value for token in _DISALLOWED_QUERY_SCALAR_TOKENS):
        raise ValueError(f"Invalid '{field_name}' value.")
    return value


def _resolve_patient(patient_id: str) -> Patient:
    try:
        return Patient.objects.get(pk=patient_id)
    except Exception:
        return Patient.objects.get(userId=ObjectId(patient_id))


def _preferences_to_dict(prefs: PatientNotificationPreferences) -> Dict[str, bool]:
    # Fail closed (opt-in): a missing attribute reads as "not enabled", matching
    # PatientNotificationPreferences' own default=False.
    return {field: bool(getattr(prefs, field, False)) for field in PREFERENCE_FIELDS}


def _last_sent_by_category(patient: Patient) -> Dict[str, str | None]:
    """Most recent SentPushNotification.sent_at per category — reflects when a send was
    last attempted/scheduled, not confirmed delivery (webpush failures aren't persisted).

    Grouped server-side via aggregation, using the (patient, -sent_at) index, so only
    one row per category comes back regardless of how large the patient's history is.
    """
    result: Dict[str, str | None] = dict.fromkeys(PREFERENCE_FIELDS)
    pipeline = [
        {"$match": {"patient": patient.pk}},
        {"$sort": {"sent_at": -1}},
        {"$group": {"_id": "$category", "sent_at": {"$first": "$sent_at"}}},
    ]
    for row in SentPushNotification.objects.aggregate(pipeline):
        category = row["_id"]
        if category in result:
            result[category] = _as_aware_utc(row["sent_at"]).isoformat()
    return result


def _patient_user_id(patient: Patient) -> str:
    # patient.userId auto-dereferences to a User document, whose __str__ is
    # "{username} (User)" — str()-ing it directly (as opposed to str()-ing
    # its .id) would never match a request.user.id ObjectId string.
    user = getattr(patient, "userId", None)
    return str(user.id) if user is not None else ""


def _validate_preference_updates(partial: Dict[str, Any]) -> Dict[str, bool]:
    updates: Dict[str, bool] = {}
    for field in PREFERENCE_FIELDS:
        if field in partial:
            value = partial[field]
            if not isinstance(value, bool):
                raise ValueError(f"'{field}' must be a boolean.")
            updates[field] = value
    return updates


def _apply_notification_preference_updates(patient: Patient, updates: Dict[str, bool]) -> Patient:
    """Per-field $set keyed by pk — avoids the lost-update race from patient.save() rewriting the whole embedded doc."""
    if patient.notification_preferences is None:
        # $set on a dotted path fails if the parent is null rather than absent.
        Patient.objects(pk=patient.pk, notification_preferences=None).update_one(
            set__notification_preferences=PatientNotificationPreferences()
        )
    return Patient.objects(pk=patient.pk).modify(
        new=True,
        **{f"set__notification_preferences__{field}": value for field, value in updates.items()},
    )


def _check_can_write(request, patient: Patient, patient_id: str) -> JsonResponse | None:
    """Only the patient themselves may write their own preferences/subscriptions."""
    if getattr(settings, "TESTING", False) or getattr(request.user, "id", None) is None:
        return None
    if str(request.user.id) != patient_id and str(request.user.id) != _patient_user_id(patient):
        return bad("You are not authorised to modify this patient's data.", status=403)
    return None


def _check_can_read(request, patient: Patient, patient_id: str) -> JsonResponse | None:
    """Patient themselves, or their therapist, may read preferences."""
    if getattr(settings, "TESTING", False) or getattr(request.user, "id", None) is None:
        return None
    caller_id = str(request.user.id)
    if caller_id == patient_id or caller_id == _patient_user_id(patient):
        return None
    caller_therapist = get_therapist_for_user(request.user)
    patient_clinic = getattr(patient, "clinic", None)
    if not caller_therapist or patient_clinic not in (caller_therapist.clinics or []):
        return bad("You are not authorised to access this patient's data.", status=403)
    return None


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def patient_notification_preferences_view(request, patient_id: str):
    try:
        patient = _resolve_patient(patient_id)
    except Exception:
        return bad(PATIENT_NOT_FOUND_MESSAGE, status=404)

    if request.method == "GET":
        auth_error = _check_can_read(request, patient, patient_id)
        if auth_error:
            return auth_error
        prefs = patient.notification_preferences or PatientNotificationPreferences()
        return ok(
            {
                "patient_id": str(patient.id),
                "preferences": _preferences_to_dict(prefs),
                "device_count": PushSubscription.objects(patient=patient).count(),
                "last_sent": _last_sent_by_category(patient),
            }
        )

    auth_error = _check_can_write(request, patient, patient_id)
    if auth_error:
        return auth_error

    try:
        body = _parse_json_body(request)
    except ValueError:
        logger.warning("Invalid JSON body in patient_notification_preferences_view.", exc_info=True)
        return bad(INVALID_JSON_BODY_MESSAGE, status=400)

    partial = body.get("preferences")
    if not isinstance(partial, dict):
        return bad("'preferences' must be an object.", status=400)

    try:
        updates = _validate_preference_updates(partial)
    except ValueError as ve:
        return bad(str(ve), status=400)

    if updates:
        patient = _apply_notification_preference_updates(patient, updates)
        if patient is None:
            # Patient was deleted concurrently with this write.
            return bad(PATIENT_NOT_FOUND_MESSAGE, status=404)

    prefs = patient.notification_preferences or PatientNotificationPreferences()
    return ok({"patient_id": str(patient.id), "preferences": _preferences_to_dict(prefs)})


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def patient_push_subscription_view(request, patient_id: str):
    try:
        patient = _resolve_patient(patient_id)
    except Exception:
        return bad(PATIENT_NOT_FOUND_MESSAGE, status=404)

    auth_error = _check_can_write(request, patient, patient_id)
    if auth_error:
        return auth_error

    try:
        body = _parse_json_body(request)
    except ValueError:
        logger.warning("Invalid JSON body in patient_push_subscription_view.", exc_info=True)
        return bad(INVALID_JSON_BODY_MESSAGE, status=400)

    try:
        endpoint = _sanitize_query_scalar_string(body.get("endpoint"), "endpoint")
    except ValueError as ve:
        return bad(str(ve), status=400)

    if request.method == "DELETE":
        PushSubscription.objects(endpoint=endpoint, patient=patient).delete()
        return ok({"message": "Subscription removed."})

    # SSRF guard: this endpoint gets POSTed to server-side later (pywebpush),
    # so only accept URLs from known Web Push vendors.
    if not is_allowed_push_endpoint(endpoint):
        return bad("Unrecognized push endpoint.", status=400)

    keys = body.get("keys") or {}
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")
    if not p256dh or not auth:
        return bad("'keys.p256dh' and 'keys.auth' are required.", status=400)

    # A browser PushSubscription is scoped to origin, not to app-user login
    # state — on a shared device, a different patient's earlier subscription
    # can still be "active" in the browser. Reassigning it silently would
    # steal it out from under them without any signal. The frontend handles
    # this response by unsubscribing the stale browser subscription and
    # subscribing fresh, which mints a genuinely new endpoint.
    #
    # This upsert is atomic: scoping the filter to (endpoint, patient) means
    # a doc already existing under a different patient won't match, so Mongo
    # tries to insert instead — which the unique index on `endpoint` rejects
    # as NotUniqueError, caught below.
    try:
        PushSubscription.objects(endpoint=endpoint, patient=patient).update_one(
            set__patient=patient,
            set__endpoint=endpoint,
            set__keys_p256dh=p256dh,
            set__keys_auth=auth,
            set__user_agent=body.get("user_agent", ""),
            upsert=True,
        )
    except NotUniqueError:
        return bad(
            "This device is already registered to a different patient.",
            status=409,
            code="endpoint_conflict",
        )

    return ok({"message": "Subscription registered."})
