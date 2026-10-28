"""
Admin endpoints for the ICF Monitor / HealthSlider email allowlist.

Routes registered in urls.py:
  GET    /api/admin/healthslider-allowlist/        — list allowlist + recent access log
  POST   /api/admin/healthslider-allowlist/        — add one email
  DELETE /api/admin/healthslider-allowlist/        — remove one email
  POST   /api/admin/healthslider-allowlist/bulk/   — add multiple emails at once
"""

import json
import logging

from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes

from core.models import HealthSliderAccessLog, HealthSliderEmailAllowlist
from core.permissions import IsAdmin

logger = logging.getLogger(__name__)


def _serialize_entry(entry):
    return {
        "email": entry.email,
        "added_by": entry.added_by or "",
        "added_at": entry.added_at.strftime("%Y-%m-%dT%H:%M:%SZ") if entry.added_at else "",
        "note": entry.note or "",
    }


def _serialize_log(log):
    return {
        "email": log.email,
        "logged_at": log.logged_at.strftime("%Y-%m-%dT%H:%M:%SZ") if log.logged_at else "",
        "ip_address": log.ip_address or "",
    }


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAdmin])
def admin_healthslider_allowlist(request):
    if request.method == "GET":
        allowlist = [_serialize_entry(e) for e in HealthSliderEmailAllowlist.objects.order_by("email")]
        recent_access = [_serialize_log(lg) for lg in HealthSliderAccessLog.objects.order_by("-logged_at")[:50]]
        return JsonResponse({"allowlist": allowlist, "recent_access": recent_access})

    if request.method == "POST":
        try:
            data = json.loads(request.body or "{}")
            raw_email = (data.get("email") or "").strip()
            if not raw_email:
                return JsonResponse({"error": "email is required"}, status=400)
            normalized = raw_email.lower()
            note = (data.get("note") or "").strip() or None
            added_by = getattr(request.user, "email", None) or getattr(request.user, "username", None) or ""

            if HealthSliderEmailAllowlist.objects(email=normalized).first():
                return JsonResponse({"error": "Email already in allowlist"}, status=409)

            HealthSliderEmailAllowlist(email=normalized, added_by=added_by, note=note).save()
            return JsonResponse({"ok": True, "email": normalized}, status=201)
        except Exception:
            logger.exception("admin_healthslider_allowlist POST failed")
            return JsonResponse({"error": "Internal server error"}, status=500)

    if request.method == "DELETE":
        try:
            data = json.loads(request.body or "{}")
            raw_email = (data.get("email") or "").strip()
            if not raw_email:
                return JsonResponse({"error": "email is required"}, status=400)
            normalized = raw_email.lower()
            entry = HealthSliderEmailAllowlist.objects(email=normalized).first()
            if not entry:
                return JsonResponse({"error": "Email not found in allowlist"}, status=404)
            entry.delete()
            return JsonResponse({"ok": True, "email": normalized})
        except Exception:
            logger.exception("admin_healthslider_allowlist DELETE failed")
            return JsonResponse({"error": "Internal server error"}, status=500)


@api_view(["POST"])
@permission_classes([IsAdmin])
def admin_healthslider_allowlist_bulk(request):
    try:
        data = json.loads(request.body or "{}")
        raw_emails = data.get("emails") or []
        if not isinstance(raw_emails, list) or not raw_emails:
            return JsonResponse({"error": "emails must be a non-empty list"}, status=400)

        added_by = getattr(request.user, "email", None) or getattr(request.user, "username", None) or ""
        added = []
        skipped = []

        for raw in raw_emails:
            normalized = (raw or "").strip().lower()
            if not normalized:
                continue
            if HealthSliderEmailAllowlist.objects(email=normalized).first():
                skipped.append(normalized)
            else:
                HealthSliderEmailAllowlist(email=normalized, added_by=added_by).save()
                added.append(normalized)

        return JsonResponse({"ok": True, "added": added, "skipped": skipped}, status=201)
    except Exception:
        logger.exception("admin_healthslider_allowlist_bulk POST failed")
        return JsonResponse({"error": "Internal server error"}, status=500)
