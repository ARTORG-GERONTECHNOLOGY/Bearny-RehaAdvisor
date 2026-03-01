# core/views/therapist_projects_views.py
import json
import logging

from bson import ObjectId
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Logs, Therapist, User
from utils.config import config

logger = logging.getLogger(__name__)


def _bad(message: str, status: int = 400, extra: dict | None = None):
    payload = {"ok": False, "error": message}
    if extra:
        payload.update(extra)
    return JsonResponse(payload, status=status)


@csrf_exempt
@permission_classes([IsAuthenticated])
def therapist_projects(request):
    available_projects = list((config.get("therapistInfo") or {}).get("projects", []) or [])

    if request.method == "GET":
        t_id = request.GET.get("therapistId")
        if not t_id:
            return _bad("therapistId is required.", status=400)
        try:
            th = Therapist.objects.get(pk=ObjectId(t_id))
        except Exception:
            return _bad("Therapist not found.", status=404)

        return JsonResponse(
            {
                "ok": True,
                "therapistId": str(th.id),
                "therapistUserId": (str(th.userId.id) if getattr(th, "userId", None) else None),
                "projects": getattr(th, "projects", []) or [],
                "availableProjects": available_projects,
            },
            status=200,
        )

    # PUT
    try:
        data = json.loads((request.body or b"{}").decode("utf-8"))
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

    try:
        Logs.objects.create(
            userId=th.userId,
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
