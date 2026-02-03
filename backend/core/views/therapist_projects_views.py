# core/views/therapist_projects_views.py
import json
import logging
from bson import ObjectId

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import User, Therapist, Logs
from utils.config import config

logger = logging.getLogger(__name__)


def _mongo_user_from_request(request):
    """
    Try to resolve the MongoEngine User corresponding to request.user.
    This matches your current patterns (email/username) and also tries id.
    """
    # If request.user is already your MongoEngine User (rare, but safe)
    if isinstance(getattr(request, "user", None), User):
        return request.user

    # 1) Try request.user.id as Mongo ObjectId
    try:
        rid = getattr(request.user, "id", None)
        if rid:
            try:
                return User.objects.get(pk=ObjectId(str(rid)))
            except Exception:
                # sometimes rid isn't an ObjectId; ignore
                pass
    except Exception:
        pass

    # 2) Try email
    try:
        email = getattr(request.user, "email", None)
        if email:
            u = User.objects(email=email).first()
            if u:
                return u
    except Exception:
        pass

    # 3) Try username
    try:
        uname = getattr(request.user, "username", None)
        if uname:
            u = User.objects(username=uname).first()
            if u:
                return u
    except Exception:
        pass

    return None


def _is_admin(mongo_user: User) -> bool:
    return bool(mongo_user and getattr(mongo_user, "role", "") == "Admin")


def _bad(message: str, status: int = 400, extra: dict | None = None):
    payload = {"ok": False, "error": message}
    if extra:
        payload.update(extra)
    return JsonResponse(payload, status=status)


@csrf_exempt
@permission_classes([IsAuthenticated])
@require_http_methods(["GET", "PUT"])
def therapist_projects(request):
    """
    GET  /api/therapist/projects/?therapistId=<id>
        -> returns current therapist projects + available projects

    PUT  /api/therapist/projects/
        body: {"therapistId":"<id>", "projects":["COPAIN","COMPASS"]}
        -> updates Therapist.projects (admin-only)
    """
    mongo_user = _mongo_user_from_request(request)
    if not mongo_user:
        return _bad("Could not resolve authenticated user.", status=401)

    if not _is_admin(mongo_user):
        return _bad("Admin privileges required.", status=403)

    available_projects = list(config.get("projects", []) or [])

    # -------------------
    # GET
    # -------------------
    if request.method == "GET":
        therapist_id = (request.GET.get("therapistId") or "").strip()
        if not therapist_id:
            return _bad("therapistId is required.", status=400)

        try:
            th = Therapist.objects.get(pk=ObjectId(therapist_id))
        except Exception:
            return _bad("Therapist not found.", status=404)

        return JsonResponse(
            {
                "ok": True,
                "therapistId": str(th.id),
                "therapistUserId": str(th.userId.id) if getattr(th, "userId", None) else None,
                "projects": getattr(th, "projects", []) or [],
                "availableProjects": available_projects,
            },
            status=200,
        )

    # -------------------
    # PUT
    # -------------------
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        return _bad("Invalid JSON.", status=400)

    therapist_id = (data.get("therapistId") or "").strip()
    projects = data.get("projects", None)

    if not therapist_id:
        return _bad("therapistId is required.", status=400)
    if projects is None:
        return _bad("projects is required.", status=400)
    if not isinstance(projects, list):
        return _bad("projects must be a list.", status=400)

    # normalize + de-duplicate while preserving order
    normalized = []
    seen = set()
    for p in projects:
        if not isinstance(p, str):
            return _bad("Each project must be a string.", status=400)
        p = p.strip()
        if not p:
            continue
        if p not in available_projects:
            return _bad(
                "Invalid project value.",
                status=400,
                extra={"invalid": p, "availableProjects": available_projects},
            )
        if p not in seen:
            seen.add(p)
            normalized.append(p)

    try:
        th = Therapist.objects.get(pk=ObjectId(therapist_id))
    except Exception:
        return _bad("Therapist not found.", status=404)

    old_projects = list(getattr(th, "projects", []) or [])
    th.projects = normalized
    th.save()

    # log
    try:
        Logs.objects.create(
            userId=mongo_user,
            action="UPDATE_PROFILE",
            userAgent="Admin",
            details=f"Updated therapist.projects for therapist={str(th.id)} old={old_projects} new={normalized}",
        )
    except Exception:
        logger.exception("Failed to write Logs for therapist_projects update")

    return JsonResponse(
        {
            "ok": True,
            "message": "Therapist projects updated.",
            "therapistId": str(th.id),
            "projects": normalized,
            "availableProjects": available_projects,
        },
        status=200,
    )
