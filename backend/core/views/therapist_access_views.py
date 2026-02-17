# core/views/therapist_access_views.py
import json
import logging
from django.conf import settings
from bson import ObjectId
from django.contrib.auth.hashers import check_password, make_password
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from core.models import Logs, Patient, Therapist, User, PasswordAttempt
from utils.config import config

logger = logging.getLogger(__name__)


def _bad(message: str, status: int = 400, extra: dict | None = None):
    payload = {"ok": False, "error": message}
    if extra:
        payload.update(extra)
    return JsonResponse(payload, status=status)


def _cfg():
    ti = (config.get("therapistInfo") or {})
    clinic_projects = (ti.get("clinic_projects") or {})
    available_clinics = list(clinic_projects.keys())
    available_projects = list(ti.get("projects") or [])
    return available_clinics, available_projects, clinic_projects


def _allowed_projects_for_clinics(clinics: list[str], clinic_projects: dict) -> set:
    allowed = set()
    for c in clinics:
        for p in (clinic_projects.get(c) or []):
            allowed.add(p)
    return allowed


@csrf_exempt
@permission_classes([IsAuthenticated])
def therapist_access(request, therapistId: str | None = None):
    available_clinics, available_projects, clinic_projects = _cfg()

    # accept both:
    # 1) /api/admin/therapist/access/<therapistId>/
    # 2) /api/therapist/access/?therapistId=...
    therapist_id = (therapistId or request.GET.get("therapistId") or "").strip()

    if request.method == "GET":
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
                "clinics": list(getattr(th, "clinics", []) or []),
                "projects": list(getattr(th, "projects", []) or []),
                "availableClinics": available_clinics,
                "availableProjects": available_projects,
                "clinicProjects": clinic_projects,
            },
            status=200,
        )

    # PUT
    try:
        data = json.loads((request.body or b"{}").decode("utf-8"))
    except Exception:
        return _bad("Invalid JSON.", status=400)

    body_id = (data.get("therapistId") or "").strip()
    if body_id:
        therapist_id = body_id

    if not therapist_id:
        return _bad("therapistId is required.", status=400)

    clinics = data.get("clinics")
    projects = data.get("projects")

    if not isinstance(clinics, list):
        return _bad("clinics must be a list.", status=400)
    if not isinstance(projects, list):
        return _bad("projects must be a list.", status=400)

    # normalize clinics
    norm_clinics = []
    seen = set()
    for c in clinics:
        if not isinstance(c, str):
            return _bad("Each clinic must be a string.", status=400)
        c = c.strip()
        if not c:
            continue
        if c not in available_clinics:
            return _bad("Invalid clinic value.", status=400, extra={"invalid": c, "availableClinics": available_clinics})
        if c not in seen:
            seen.add(c)
            norm_clinics.append(c)

    allowed = _allowed_projects_for_clinics(norm_clinics, clinic_projects)

    # normalize projects
    norm_projects = []
    seenp = set()
    for p in projects:
        if not isinstance(p, str):
            return _bad("Each project must be a string.", status=400)
        p = p.strip()
        if not p:
            continue
        if p not in available_projects:
            return _bad("Invalid project value.", status=400, extra={"invalid": p, "availableProjects": available_projects})
        if norm_clinics and p not in allowed:
            return _bad(
                "Project not allowed for selected clinics.",
                status=400,
                extra={"invalid": p, "allowedProjects": sorted(list(allowed))},
            )
        if p not in seenp:
            seenp.add(p)
            norm_projects.append(p)

    try:
        th = Therapist.objects.get(pk=ObjectId(therapist_id))
    except Exception:
        return _bad("Therapist not found.", status=404)

    old_clinics = list(getattr(th, "clinics", []) or [])
    old_projects = list(getattr(th, "projects", []) or [])

    th.clinics = norm_clinics
    th.projects = norm_projects
    th.save()

    try:
        Logs.objects.create(
            userId=th.userId,
            action="UPDATE_PROFILE",
            userAgent="Admin",
            details=f"Updated therapist access therapist={str(th.id)} clinics {old_clinics}->{norm_clinics} projects {old_projects}->{norm_projects}",
        )
    except Exception:
        logger.exception("Failed to write Logs for therapist_access update")

    return JsonResponse(
        {
            "ok": True,
            "message": "Therapist access updated.",
            "therapistId": str(th.id),
            "clinics": norm_clinics,
            "projects": norm_projects,
        },
        status=200,
    )
