"""
Admin-only endpoints for browsing and deleting interventions.

Routes registered in urls.py:
  GET  /api/admin/interventions/       — list all interventions (public + private)
  DELETE /api/admin/interventions/<id>/ — delete one intervention with cascade cleanup
"""

import json
import logging
import os

from bson import ObjectId
from django.core.files.storage import default_storage
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes

from core.models import (
    Intervention,
    InterventionTemplate,
    PatientInterventionLogs,
    RehabilitationPlan,
    Therapist,
)
from core.permissions import IsAdmin

logger = logging.getLogger(__name__)


def _serialize_intervention(doc):
    return {
        "_id": str(doc.pk),
        "external_id": getattr(doc, "external_id", ""),
        "language": getattr(doc, "language", ""),
        "title": getattr(doc, "title", ""),
        "content_type": getattr(doc, "content_type", ""),
        "is_private": bool(getattr(doc, "is_private", False)),
        "provider": getattr(doc, "provider", None),
        "preview_img": getattr(doc, "preview_img", None) or "",
    }


@api_view(["GET", "DELETE"])
@permission_classes([IsAdmin])
def admin_interventions(request, intervention_id=None):
    if intervention_id:
        if request.method == "DELETE":
            return _delete_intervention(request, intervention_id)
        from django.http import JsonResponse

        return JsonResponse({"error": "Method not allowed"}, status=405)
    return _list_interventions(request)


def _list_interventions(request):
    try:
        q = (request.GET.get("q") or "").strip()
        lang = (request.GET.get("lang") or "").lower().strip()
        content_type = (request.GET.get("content_type") or "").strip()

        qs = Intervention.objects.all()

        if lang:
            qs = qs.filter(language=lang)
        if content_type:
            qs = qs.filter(content_type=content_type)

        docs = list(qs.order_by("external_id"))

        # Title/external_id search applied in Python (case-insensitive)
        if q:
            q_lower = q.lower()
            docs = [
                d
                for d in docs
                if q_lower in (getattr(d, "title", "") or "").lower()
                or q_lower in (getattr(d, "external_id", "") or "").lower()
            ]

        return JsonResponse(
            {"interventions": [_serialize_intervention(d) for d in docs]},
            status=200,
        )
    except Exception:
        logger.exception("admin_interventions list failed")
        return JsonResponse({"error": "Internal server error"}, status=500)


def _delete_intervention(request, intervention_id):
    try:
        try:
            oid = ObjectId(intervention_id)
        except Exception:
            return JsonResponse({"error": "Invalid intervention id"}, status=400)

        intervention = Intervention.objects(id=oid).first()
        if not intervention:
            return JsonResponse({"error": "Intervention not found"}, status=404)

        intervention_ref_id = intervention.pk

        # 1. Delete media files from storage
        for media_item in getattr(intervention, "media", None) or []:
            file_path = getattr(media_item, "file_path", None)
            if file_path:
                try:
                    if default_storage.exists(file_path):
                        default_storage.delete(file_path)
                except Exception:
                    logger.warning("Could not delete media file %s", file_path)

        preview = getattr(intervention, "preview_img", None)
        if preview:
            try:
                if default_storage.exists(preview):
                    default_storage.delete(preview)
            except Exception:
                logger.warning("Could not delete preview_img %s", preview)

        # 2. Remove from InterventionTemplate.recommendations
        for tmpl in InterventionTemplate.objects.all():
            recs = list(getattr(tmpl, "recommendations", None) or [])
            new_recs = [
                r
                for r in recs
                if str(
                    getattr(r, "recommendation", None) and r.recommendation.id
                    if hasattr(getattr(r, "recommendation", None), "id")
                    else ""
                )
                != str(intervention_ref_id)
            ]
            if len(new_recs) != len(recs):
                tmpl.recommendations = new_recs
                tmpl.save()

        # 3. Remove from Therapist.default_recommendations
        for therapist in Therapist.objects.all():
            recs = list(getattr(therapist, "default_recommendations", None) or [])
            new_recs = [
                r
                for r in recs
                if str(
                    getattr(r, "recommendation", None) and r.recommendation.id
                    if hasattr(getattr(r, "recommendation", None), "id")
                    else ""
                )
                != str(intervention_ref_id)
            ]
            if len(new_recs) != len(recs):
                therapist.default_recommendations = new_recs
                therapist.save()

        # 4. Remove from RehabilitationPlan.interventions
        for plan in RehabilitationPlan.objects.all():
            assignments = list(getattr(plan, "interventions", None) or [])
            new_assignments = []
            changed = False
            for a in assignments:
                try:
                    ref = getattr(a, "interventionId", None)
                    ref_id = ref.id if hasattr(ref, "id") else None
                    if str(ref_id) == str(intervention_ref_id):
                        changed = True
                        continue
                except Exception:
                    pass
                new_assignments.append(a)
            if changed:
                plan.interventions = new_assignments
                plan.save()

        # 5. Delete PatientInterventionLogs referencing this intervention
        PatientInterventionLogs.objects(interventionId=intervention_ref_id).delete()

        # 6. Delete the Intervention document
        intervention.delete()

        logger.info("Admin deleted intervention %s (id=%s)", getattr(intervention, "external_id", "?"), intervention_id)

        return JsonResponse({"message": "Intervention deleted"}, status=200)

    except Exception:
        logger.exception("admin_interventions delete failed for id=%s", intervention_id)
        return JsonResponse({"error": "Internal server error"}, status=500)
