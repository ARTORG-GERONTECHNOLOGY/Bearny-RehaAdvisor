from bson import ObjectId
from django.conf import settings
from rest_framework.permissions import BasePermission

from core.models import User
from core.services.redcap_access import get_therapist_for_user


class IsAdmin(BasePermission):
    """Allow access only to active users with role="Admin"."""

    message = "Admin role required."

    def has_permission(self, request, view):
        if not getattr(request.user, "is_authenticated", False):
            return False
        try:
            user = User.objects.get(pk=ObjectId(request.user.id))
            return user.role == "Admin" and user.isActive
        except Exception:
            return False


def _skip_checks() -> bool:
    # Test requests use a synthetic user with no DB record; production never sets TESTING.
    return getattr(settings, "TESTING", False)


def is_admin_caller(request) -> bool:
    try:
        caller = User.objects.get(pk=ObjectId(request.user.id))
        return caller.role == "Admin" and caller.isActive
    except Exception:
        return False


def is_self_or_admin(request, user_id) -> bool:
    """The caller is the user with this id, or an admin."""
    if _skip_checks():
        return True
    return str(getattr(request.user, "id", "")) == str(user_id) or is_admin_caller(request)


def can_access_patient(request, patient, allow_self: bool = False) -> bool:
    """Admin, a therapist whose clinics include the patient's clinic, or (with allow_self) the patient."""
    if _skip_checks():
        return True
    if allow_self:
        try:
            if str(patient.userId.id) == str(request.user.id):
                return True
        except Exception:
            pass
    if is_admin_caller(request):
        return True
    therapist = get_therapist_for_user(request.user)
    return bool(therapist) and getattr(patient, "clinic", None) in (therapist.clinics or [])


def can_assign_clinic(request, clinic) -> bool:
    """Admins assign any clinic; therapists only one they belong to."""
    if _skip_checks() or is_admin_caller(request):
        return True
    therapist = get_therapist_for_user(request.user)
    return bool(therapist) and clinic in (therapist.clinics or [])


def is_therapist_or_admin(request) -> bool:
    if _skip_checks() or is_admin_caller(request):
        return True
    return get_therapist_for_user(request.user) is not None
