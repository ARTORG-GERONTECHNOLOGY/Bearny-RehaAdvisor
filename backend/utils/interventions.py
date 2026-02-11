import json
import mimetypes

import logging
import os
from mongoengine.queryset.visitor import Q
from bson import ObjectId
from django.conf import settings
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.utils import timezone
from django.utils.timezone import now as dj_now
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from datetime import datetime, timedelta
from rest_framework.permissions import IsAuthenticated
from typing import Any, Dict, List
from core.models import Logs  # Ensure this includes action, userId, userAgent, details
from core.models import (
    DefaultInterventions,
    DiagnosisAssignmentSettings,
    Intervention,
    InterventionAssignment,
    Patient,
    PatientInterventionLogs,
    PatientType,
    Therapist,
)
from utils.config import config
from utils.utils import generate_custom_id, get_labels, sanitize_text
from utils.scheduling import _merge_date_and_time

def _lang_fallback_chain(user_lang: str) -> List[str]:
    """
    Priority order: user_lang -> en -> de (and avoid duplicates).
    """
    user_lang = (user_lang or "").strip().lower()
    chain = [user_lang, "en", "de"]
    out = []
    seen = set()
    for l in chain:
        if l and l not in seen:
            out.append(l)
            seen.add(l)
    return out or ["en", "de"]


def _pick_best_variant(external_id: str, lang_chain: List[str]) -> Optional["Intervention"]:
    """
    Return best matching intervention doc for external_id using fallback chain.
    """
    for l in lang_chain:
        doc = Intervention.objects(external_id=external_id, language=l).first()
        if doc:
            return doc
    # last resort: any
    return Intervention.objects(external_id=external_id).first()


def _available_language_variants(external_id: str) -> List[dict]:
    """
    Return all variants for UI dropdown.
    """
    variants = Intervention.objects(external_id=external_id).only("id", "language", "title")
    return [{"_id": str(v.id), "language": getattr(v, "language", None), "title": getattr(v, "title", None)} for v in variants]


def _serialize_intervention_basic(item):
    """
    Use your existing serialize(item) body or call it from here if you prefer.
    This helper is optional; you can inline it.
    """
    def serialize_media(m):
        out = {
            "kind": getattr(m, "kind", None),
            "media_type": getattr(m, "media_type", None),
            "provider": getattr(m, "provider", None),
            "title": getattr(m, "title", None),
            "url": getattr(m, "url", None),
            "embed_url": getattr(m, "embed_url", None),
            "file_path": getattr(m, "file_path", None),
            "mime": getattr(m, "mime", None),
            "thumbnail": getattr(m, "thumbnail", None),
        }
        if out["kind"] == "file" and out.get("file_path"):
            out["file_url"] = _abs_media_url(out["file_path"])
        return out

    return {
        "_id": str(item.pk),
        "external_id": getattr(item, "external_id", None),
        "language": getattr(item, "language", None),
        "provider": getattr(item, "provider", None),
        "title": getattr(item, "title", None),
        "description": getattr(item, "description", None),
        "content_type": getattr(item, "content_type", None),
        "media": [serialize_media(m) for m in (getattr(item, "media", None) or [])],
        "preview_img": _abs_media_url(item.preview_img) if getattr(item, "preview_img", None) else "",
        "duration": getattr(item, "duration", None),
        "patient_types": [
            {
                "type": pt.type,
                "frequency": pt.frequency,
                "include_option": getattr(pt, "include_option", False),
                "diagnosis": getattr(pt, "diagnosis", None),
            }
            for pt in (getattr(item, "patient_types", None) or [])
        ],
        "is_private": bool(getattr(item, "is_private", False)),
    }
