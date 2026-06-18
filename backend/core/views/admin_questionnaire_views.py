"""
Admin-only endpoints for browsing, editing, and deleting health questionnaires.

Routes registered in urls.py:
  GET    /api/admin/questionnaires/        — list all with usage count
  DELETE /api/admin/questionnaires/<id>/  — delete one + cascade from plans
  PUT    /api/admin/questionnaires/<id>/  — update title / description / tags
"""

import json
import logging

from bson import ObjectId
from django.http import JsonResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import HealthQuestionnaire, RehabilitationPlan

logger = logging.getLogger(__name__)


def _usage_count(questionnaire_id):
    """Return the number of RehabilitationPlans that reference this questionnaire."""
    count = 0
    for plan in RehabilitationPlan.objects.all():
        for qa in getattr(plan, "questionnaires", None) or []:
            try:
                ref = getattr(qa, "questionnaireId", None)
                if ref is not None and str(ref.id) == str(questionnaire_id):
                    count += 1
                    break
            except Exception:
                pass
    return count


def _serialize(doc):
    created_by_name = None
    try:
        cb = doc.created_by
        if cb is not None:
            first = getattr(cb, "firstName", None) or getattr(cb, "first_name", None) or ""
            last = getattr(cb, "name", None) or getattr(cb, "last_name", None) or ""
            created_by_name = f"{first} {last}".strip() or None
    except Exception:
        pass

    return {
        "_id": str(doc.pk),
        "key": doc.key or "",
        "title": doc.title or "",
        "description": doc.description or "",
        "tags": list(doc.tags or []),
        "question_count": len(list(doc.questions or [])),
        "usage_count": _usage_count(doc.pk),
        "created_by_name": created_by_name,
        "createdAt": doc.createdAt.isoformat() if doc.createdAt else None,
        "version": doc.version if doc.version is not None else 1,
        "updatedAt": doc.updatedAt.isoformat() if doc.updatedAt else None,
    }


@api_view(["PUT", "DELETE", "GET"])
@permission_classes([IsAuthenticated])
def admin_questionnaires(request, questionnaire_id=None):
    if questionnaire_id:
        if request.method == "DELETE":
            return _delete(request, questionnaire_id)
        if request.method == "PUT":
            return _update(request, questionnaire_id)
        return JsonResponse({"error": "Method not allowed"}, status=405)
    if request.method == "GET":
        return _list(request)
    return JsonResponse({"error": "Method not allowed"}, status=405)


def _list(request):
    try:
        q = (request.GET.get("q") or "").strip().lower()
        docs = list(HealthQuestionnaire.objects.all().order_by("title"))
        if q:
            docs = [d for d in docs if q in (d.title or "").lower() or q in (d.key or "").lower()]
        return JsonResponse({"questionnaires": [_serialize(d) for d in docs]}, status=200)
    except Exception:
        logger.exception("admin_questionnaires list failed")
        return JsonResponse({"error": "Internal server error"}, status=500)


def _delete(request, questionnaire_id):
    try:
        try:
            oid = ObjectId(questionnaire_id)
        except Exception:
            return JsonResponse({"error": "Invalid questionnaire id"}, status=400)

        doc = HealthQuestionnaire.objects(id=oid).first()
        if not doc:
            return JsonResponse({"error": "Questionnaire not found"}, status=404)

        # Cascade: remove QuestionnaireAssignment entries from all plans
        for plan in RehabilitationPlan.objects.all():
            assignments = list(getattr(plan, "questionnaires", None) or [])
            new_assignments = []
            changed = False
            for qa in assignments:
                try:
                    ref = getattr(qa, "questionnaireId", None)
                    if ref is not None and str(ref.id) == str(oid):
                        changed = True
                        continue
                except Exception:
                    pass
                new_assignments.append(qa)
            if changed:
                plan.questionnaires = new_assignments
                plan.save()

        doc.delete()
        logger.info("Admin deleted questionnaire key=%s id=%s", doc.key, questionnaire_id)
        return JsonResponse({"message": "Questionnaire deleted"}, status=200)

    except Exception:
        logger.exception("admin_questionnaires delete failed for id=%s", questionnaire_id)
        return JsonResponse({"error": "Internal server error"}, status=500)


def _update(request, questionnaire_id):
    try:
        try:
            oid = ObjectId(questionnaire_id)
        except Exception:
            return JsonResponse({"error": "Invalid questionnaire id"}, status=400)

        doc = HealthQuestionnaire.objects(id=oid).first()
        if not doc:
            return JsonResponse({"error": "Questionnaire not found"}, status=404)

        try:
            body = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        if "title" in body:
            title = str(body["title"]).strip()
            if not title:
                return JsonResponse({"error": "Title cannot be empty"}, status=400)
            doc.title = title
        if "description" in body:
            doc.description = str(body["description"]).strip()
        if "tags" in body:
            tags = body["tags"]
            if not isinstance(tags, list):
                return JsonResponse({"error": "tags must be a list"}, status=400)
            doc.tags = [str(t).strip() for t in tags if str(t).strip()]

        doc.version = (doc.version or 1) + 1
        doc.updatedAt = timezone.now()
        doc.save()
        logger.info("Admin updated questionnaire key=%s id=%s", doc.key, questionnaire_id)
        return JsonResponse({"questionnaire": _serialize(doc)}, status=200)

    except Exception:
        logger.exception("admin_questionnaires update failed for id=%s", questionnaire_id)
        return JsonResponse({"error": "Internal server error"}, status=500)
