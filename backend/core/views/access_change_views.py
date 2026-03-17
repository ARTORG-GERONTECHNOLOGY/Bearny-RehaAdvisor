# core/views/access_change_views.py
"""
Therapist-initiated clinic / project change requests.

Flow:
  1. Therapist POSTs to /api/therapist/access-change-request/
     -> creates a pending TherapistAccessChangeRequest
     -> e-mails all Admin users
  2. Admin GETs /api/admin/access-change-requests/ to list pending requests
  3. Admin PUTs /api/admin/access-change-requests/<id>/
     with {"action": "approve"} or {"action": "reject", "note": "..."}
     -> approve: updates Therapist.clinics + .projects, e-mails therapist
     -> reject:  e-mails therapist with optional note
"""
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Therapist, TherapistAccessChangeRequest, User
from utils.config import config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _bad(msg: str, status: int = 400):
    return JsonResponse({"ok": False, "error": msg}, status=status)


def _cfg():
    ti = config.get("therapistInfo") or {}
    clinic_projects = ti.get("clinic_projects") or {}
    available_clinics = list(clinic_projects.keys())
    available_projects = list(ti.get("projects") or [])
    return available_clinics, available_projects, clinic_projects


def _get_therapist(request):
    """Resolve the authenticated therapist from the JWT user id (same pattern as template_views)."""
    try:
        return Therapist.objects.get(userId=str(request.user.id))
    except Exception:
        return None


def _serialize_request(req: TherapistAccessChangeRequest) -> dict:
    therapist_name = ""
    therapist_email = ""
    current_clinics: list = []
    current_projects: list = []
    try:
        th = req.therapist
        if th:
            current_clinics = list(th.clinics or [])
            current_projects = list(th.projects or [])
            therapist_name = f"{th.first_name or ''} {th.name or ''}".strip()
            user = th.userId
            if user:
                therapist_email = user.email or ""
    except Exception:
        pass

    reviewer_name = ""
    try:
        rb = req.reviewed_by
        if rb:
            reviewer_name = f"{rb.first_name or ''} {rb.name or ''}".strip()
    except Exception:
        pass

    return {
        "id": str(req.id),
        "therapistId": str(req.therapist.id) if req.therapist else None,
        "therapistName": therapist_name,
        "therapistEmail": therapist_email,
        "currentClinics": current_clinics,
        "currentProjects": current_projects,
        "requestedClinics": list(req.requested_clinics or []),
        "requestedProjects": list(req.requested_projects or []),
        "status": req.status,
        "createdAt": req.created_at.isoformat() if req.created_at else None,
        "reviewedAt": req.reviewed_at.isoformat() if req.reviewed_at else None,
        "reviewedBy": reviewer_name,
        "note": req.note or "",
    }


def _notify_admins(therapist_name: str, therapist_email: str,
                   requested_clinics: list, requested_projects: list):
    """E-mail all active Admin users about a new change request."""
    try:
        admins = User.objects.filter(role="Admin", isActive=True)
        emails = [u.email for u in admins if u.email]
        if not emails:
            return
        send_mail(
            subject="Therapist access change request pending approval",
            message=(
                f"Therapist {therapist_name} ({therapist_email}) has submitted a "
                f"request to change their clinic/project access.\n\n"
                f"Requested clinics:  {', '.join(requested_clinics) or '—'}\n"
                f"Requested projects: {', '.join(requested_projects) or '—'}\n\n"
                f"Please log in to the Admin Dashboard to approve or decline."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=emails,
            fail_silently=True,
        )
    except Exception:
        logger.exception("Failed to e-mail admins about access change request")


def _notify_therapist_approved(therapist_email: str, therapist_name: str,
                                clinics: list, projects: list):
    if not therapist_email:
        return
    try:
        send_mail(
            subject="Your clinic/project access request has been approved",
            message=(
                f"Dear {therapist_name},\n\n"
                f"Your request to change your clinic/project access has been approved.\n\n"
                f"New clinics:  {', '.join(clinics) or '—'}\n"
                f"New projects: {', '.join(projects) or '—'}\n\n"
                f"You can log in to the application to see your updated access."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[therapist_email],
            fail_silently=True,
        )
    except Exception:
        logger.exception("Failed to e-mail therapist about approved access request")


def _notify_therapist_rejected(therapist_email: str, therapist_name: str, note: str):
    if not therapist_email:
        return
    try:
        msg = (
            f"Dear {therapist_name},\n\n"
            f"Your request to change your clinic/project access has been declined."
        )
        if note:
            msg += f"\n\nAdmin note: {note}"
        msg += "\n\nPlease contact your administrator if you have questions."
        send_mail(
            subject="Your clinic/project access request has been declined",
            message=msg,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[therapist_email],
            fail_silently=True,
        )
    except Exception:
        logger.exception("Failed to e-mail therapist about rejected access request")


# ---------------------------------------------------------------------------
# Endpoint: therapist submits a change request
# POST /api/therapist/access-change-request/
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def submit_access_change_request(request):
    if request.method == "GET":
        therapist = _get_therapist(request)
        if not therapist:
            return _bad("Therapist profile not found.", 404)
        has_pending = TherapistAccessChangeRequest.objects(
            therapist=therapist, status="pending"
        ).count() > 0
        return JsonResponse({"ok": True, "hasPending": has_pending}, status=200)


    therapist = _get_therapist(request)
    if not therapist:
        return _bad("Therapist profile not found.", 404)

    data = request.data
    available_clinics, available_projects, clinic_projects = _cfg()

    requested_clinics = data.get("clinics", [])
    requested_projects = data.get("projects", [])

    if not isinstance(requested_clinics, list) or not isinstance(requested_projects, list):
        return _bad("clinics and projects must be lists.")

    # Validate values against config
    for c in requested_clinics:
        if c not in available_clinics:
            return _bad(f"Invalid clinic: {c}")
    for p in requested_projects:
        if p not in available_projects:
            return _bad(f"Invalid project: {p}")

    # Prevent duplicate pending requests — cancel any existing pending one first
    TherapistAccessChangeRequest.objects(
        therapist=therapist, status="pending"
    ).update(set__status="rejected", set__note="Superseded by a newer request.")

    req = TherapistAccessChangeRequest(
        therapist=therapist,
        requested_clinics=requested_clinics,
        requested_projects=requested_projects,
        status="pending",
        created_at=timezone.now(),
    )
    req.save()

    # Notify admins
    therapist_name = f"{therapist.first_name or ''} {therapist.name or ''}".strip()
    therapist_email = ""
    try:
        therapist_email = therapist.userId.email or ""
    except Exception:
        pass

    _notify_admins(therapist_name, therapist_email, requested_clinics, requested_projects)

    return JsonResponse(
        {
            "ok": True,
            "message": "Your request has been submitted and is awaiting admin approval.",
            "requestId": str(req.id),
        },
        status=201,
    )


# ---------------------------------------------------------------------------
# Endpoint: admin lists / reviews change requests
# GET  /api/admin/access-change-requests/          -> list pending (or all)
# PUT  /api/admin/access-change-requests/<id>/     -> approve or reject
# ---------------------------------------------------------------------------

@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def admin_access_change_requests(request, request_id: str | None = None):
    if request.method == "GET":
        status_filter = request.GET.get("status", "pending")
        qs = TherapistAccessChangeRequest.objects.order_by("-created_at")
        if status_filter != "all":
            qs = qs.filter(status=status_filter)

        return JsonResponse(
            {"ok": True, "requests": [_serialize_request(r) for r in qs]},
            status=200,
        )

    if request.method == "PUT":
        if not request_id:
            return _bad("request_id is required in URL.", 400)

        from bson import ObjectId
        try:
            req = TherapistAccessChangeRequest.objects.get(pk=ObjectId(request_id))
        except Exception:
            return _bad("Request not found.", 404)

        if req.status != "pending":
            return _bad(f"Request is already {req.status}.", 400)

        data = request.data
        action = (data.get("action") or "").strip().lower()
        if action not in ("approve", "reject"):
            return _bad("action must be 'approve' or 'reject'.")

        note = (data.get("note") or "").strip()

        # Resolve reviewing admin's Therapist record (best-effort)
        admin_therapist = _get_therapist(request)

        req.reviewed_at = timezone.now()
        req.reviewed_by = admin_therapist
        req.note = note

        # Resolve therapist info for e-mail before committing
        therapist_name = ""
        therapist_email = ""
        try:
            th = req.therapist
            therapist_name = f"{th.first_name or ''} {th.name or ''}".strip()
            therapist_email = th.userId.email or ""
        except Exception:
            pass

        if action == "approve":
            available_clinics, available_projects, clinic_projects = _cfg()

            norm_clinics = [c for c in req.requested_clinics if c in available_clinics]
            norm_projects = [p for p in req.requested_projects if p in available_projects]

            try:
                th = req.therapist
                th.clinics = norm_clinics
                th.projects = norm_projects
                th.save()
            except Exception as exc:
                logger.exception("Failed to update therapist access on approval")
                return _bad(f"Failed to update therapist: {exc}", 500)

            req.status = "approved"
            req.save()

            _notify_therapist_approved(therapist_email, therapist_name,
                                       norm_clinics, norm_projects)

            return JsonResponse(
                {"ok": True, "message": "Request approved and therapist access updated."},
                status=200,
            )

        else:  # reject
            req.status = "rejected"
            req.save()

            _notify_therapist_rejected(therapist_email, therapist_name, note)

            return JsonResponse(
                {"ok": True, "message": "Request rejected."},
                status=200,
            )

    return _bad("Method not allowed.", 405)
