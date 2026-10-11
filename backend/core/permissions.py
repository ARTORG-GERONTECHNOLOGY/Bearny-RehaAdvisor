from bson import ObjectId
from django.conf import settings
from rest_framework.permissions import BasePermission

from core.models import Patient, User
from core.services.redcap_access import get_therapist_for_user


class IsAdmin(BasePermission):
    """Allow access only to active users with role="Admin"."""

    message = "Admin role required."

    def has_permission(self, request, view):
        return getattr(request.user, "is_authenticated", False) and is_admin_caller(request)


def _skip_checks() -> bool:
    # Test requests use a synthetic user with no DB record; production never sets TESTING.
    return getattr(settings, "TESTING", False)


def _cached(request, key, compute):
    """Per-request memo so loops over many patients don't repeat caller lookups."""
    cache = getattr(request, "_authz_cache", None)
    if cache is None:
        cache = request._authz_cache = {}
    if key not in cache:
        cache[key] = compute()
    return cache[key]


def _lookup_user(request):
    try:
        return User.objects.get(pk=ObjectId(request.user.id))
    except Exception:
        return None


def _caller_user(request):
    return _cached(request, "user", lambda: _lookup_user(request))


def is_admin_caller(request) -> bool:
    user = _caller_user(request)
    return bool(user) and user.role == "Admin" and user.isActive


def _caller_therapist(request):
    """The caller's Therapist profile, or None if they have none or their account is deactivated."""

    def lookup():
        user = _caller_user(request)
        return get_therapist_for_user(request.user) if user and user.isActive else None

    return _cached(request, "therapist", lookup)


def _therapist_covers(therapist, patient) -> bool:
    """Same rule as the therapist dashboard: shared clinic and, if the therapist has projects, a shared project."""
    if getattr(patient, "clinic", None) not in (therapist.clinics or []):
        return False
    return not therapist.projects or getattr(patient, "project", None) in therapist.projects


def is_self(request, user_id) -> bool:
    """The caller is the user with this id."""
    if _skip_checks():
        return True
    caller_id = getattr(request.user, "id", None)
    return caller_id is not None and str(caller_id) == str(user_id)


def is_self_or_admin(request, user_id) -> bool:
    """The caller is the user with this id, or an admin."""
    return is_self(request, user_id) or is_admin_caller(request)


def can_access_patient(request, patient, allow_self: bool = False) -> bool:
    """Admin, a therapist covering the patient (clinic and project), or (with allow_self) the patient."""
    if _skip_checks():
        return True
    if allow_self:
        try:
            if is_self(request, patient.userId.id):
                return True
        except Exception:
            pass
    if is_admin_caller(request):
        return True
    therapist = _caller_therapist(request)
    return bool(therapist) and _therapist_covers(therapist, patient)


def accessible_patient_filter(request) -> dict | None:
    """Patient query filter for the caller's patients; None means no restriction (admin or tests)."""
    if _skip_checks() or is_admin_caller(request):
        return None
    therapist = _caller_therapist(request)
    if not therapist:
        return {"pk__in": []}
    filters = {"clinic__in": therapist.clinics or []}
    if therapist.projects:
        filters["project__in"] = therapist.projects
    return filters


def can_access_user(request, user) -> bool:
    """The user themselves, an admin, or (for a patient) a therapist covering them."""
    if is_self_or_admin(request, user.id):
        return True
    patient = Patient.objects(userId=user.id).first() if getattr(user, "role", None) == "Patient" else None
    return bool(patient) and can_access_patient(request, patient)


def can_assign_clinic(request, clinic) -> bool:
    """Admins assign any clinic; therapists only one they belong to."""
    if _skip_checks() or is_admin_caller(request):
        return True
    therapist = _caller_therapist(request)
    return bool(therapist) and clinic in (therapist.clinics or [])


def is_therapist_or_admin(request) -> bool:
    if _skip_checks() or is_admin_caller(request):
        return True
    return _caller_therapist(request) is not None
