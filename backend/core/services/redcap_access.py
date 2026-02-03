# core/services/redcap_access.py
import logging
from typing import List

from django.utils import timezone
from core.models import Therapist
from utils.config import config  # you already use this pattern elsewhere

logger = logging.getLogger(__name__)


def get_therapist_for_user(django_user) -> Therapist | None:
    """
    Map request.user (Django auth user) -> MongoEngine Therapist.
    This assumes your auth layer sets request.user.email or request.user.username
    in a way that matches your MongoEngine User identity.

    If you already have a stable ID mapping, adjust this accordingly.
    """
    # Most common in your app: users are MongoEngine docs + JWT auth.
    # Often request.user is a Django user object created by JWT auth; you may store Mongo user id in a claim.
    # If you store a Mongo user id in request.user.id, you can query Therapist.userId.id == that value.

    # ✅ If your JWT user has an attribute "id" matching your Mongo User id:
    try:
        mongo_user_id = getattr(django_user, "id", None)
        if mongo_user_id:
            return Therapist.objects(userId=mongo_user_id).first()
    except Exception:
        logger.exception("Failed therapist lookup by request.user.id")

    # ✅ Fallback if you identify by email
    try:
        email = getattr(django_user, "email", None)
        if email:
            return Therapist.objects(userId__email=email).first()
    except Exception:
        logger.exception("Failed therapist lookup by request.user.email")

    return None


def get_allowed_redcap_projects_for_therapist(therapist: Therapist) -> List[str]:
    """
    Clinic-based access control.
    Returns union of projects allowed for therapist's clinic(s).
    """
    clinic_projects = config.get("clinic_projects", {}) or {}
    allowed = set()

    for clinic in (therapist.clinics or []):
        for p in (clinic_projects.get(clinic) or []):
            allowed.add(p)

    # Optional: if therapist.projects is set, you can intersect to narrow down.
    # This keeps clinic as the security boundary.
    therapist_projects = set(getattr(therapist, "projects", []) or [])
    if therapist_projects:
        allowed = allowed.intersection(therapist_projects)

    return sorted(allowed)


def assert_project_allowed_for_therapist(therapist: Therapist, project: str) -> None:
    allowed = get_allowed_redcap_projects_for_therapist(therapist)
    if project not in allowed:
        raise PermissionError(f"Project '{project}' not allowed. Allowed: {allowed}")
