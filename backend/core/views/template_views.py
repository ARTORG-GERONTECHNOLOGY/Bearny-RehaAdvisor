"""
Template CRUD API — /api/templates/

Rules
-----
- Public templates are visible to all authenticated therapists.
- Private templates are visible only to their creator.
- Only the creator may update or delete a template.
- Any therapist who can *see* a template may copy it; the copy is private
  and owned by the copying therapist.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List

from bson import ObjectId
from django.http import JsonResponse
from django.utils import timezone
from django.utils.timezone import is_naive, make_aware
from mongoengine.queryset.visitor import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import (
    DefaultInterventions,
    DiagnosisAssignmentSettings,
    Intervention,
    InterventionAssignment,
    InterventionTemplate,
    Patient,
    RehabilitationPlan,
    Therapist,
)
from utils.interventions import (
    _anchor_date_for_day,
    _normalize_segments,
    _occ_count_for_day_range,
    _upsert_intervention,
)
from utils.scheduling import _expand_dates
from utils.utils import bad

BASE_ANCHOR = "2000-01-01"

# Sentinel key used when no diagnosis is linked to a template entry.
_ALL_DX = "_all"

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_therapist(request) -> Therapist | None:
    """Resolve the authenticated therapist from the JWT user id."""
    try:
        return Therapist.objects.get(userId=str(request.user.id))
    except Exception:
        return None


def _serialize_template(tmpl: InterventionTemplate, detail: bool = False) -> dict:
    """Serialise an InterventionTemplate document to a JSON-safe dict.

    ``detail=False`` — summary (list view): no recommendations payload.
    ``detail=True``  — full object including recommendations.
    """
    created_by_name = ""
    try:
        creator = tmpl.created_by
        if creator is not None:
            created_by_name = f"{creator.first_name or ''} {creator.name or ''}".strip()
    except Exception:
        logger.warning("Could not resolve created_by for template %s", tmpl.id)

    # created_by must be the *User* ObjectId (what authStore.id holds in the
    # JWT claim) — NOT the Therapist document's own ObjectId.
    created_by_user_id = None
    try:
        if tmpl.created_by and tmpl.created_by.userId:
            created_by_user_id = str(tmpl.created_by.userId.id)
    except Exception:
        logger.warning("Could not resolve created_by userId for template %s", tmpl.id)

    obj: dict = {
        "id": str(tmpl.id),
        "name": tmpl.name,
        "description": tmpl.description or "",
        "is_public": tmpl.is_public,
        "created_by": created_by_user_id,
        "created_by_name": created_by_name,
        "specialization": tmpl.specialization or None,
        "diagnosis": tmpl.diagnosis or None,
        "createdAt": tmpl.createdAt.isoformat() if tmpl.createdAt else None,
        "updatedAt": tmpl.updatedAt.isoformat() if tmpl.updatedAt else None,
    }

    if detail:
        # Build a lightweight summary of each recommendation entry.
        recs = []
        for entry in tmpl.recommendations or []:
            intervention_id = None
            intervention_title = None
            try:
                iv = entry.recommendation
                if iv is not None:
                    intervention_id = str(iv.id)
                    titles = iv.title or {}
                    intervention_title = (
                        titles.get("en") or titles.get("de") or next(iter(titles.values()), None)
                        if isinstance(titles, dict)
                        else str(titles)
                    )
            except Exception:
                logger.warning("Could not resolve recommendation ref in template %s", tmpl.id)

            recs.append(
                {
                    "intervention_id": intervention_id,
                    "intervention_title": intervention_title,
                    "diagnosis_assignments": {
                        dx: [
                            {
                                "active": s.active,
                                "interval": s.interval,
                                "unit": s.unit,
                                "selected_days": list(s.selected_days or []),
                                "start_day": s.start_day,
                                "end_day": s.end_day,
                                "suggested_execution_time": s.suggested_execution_time,
                            }
                            for s in blocks
                        ]
                        for dx, blocks in (entry.diagnosis_assignments or {}).items()
                    },
                }
            )
        obj["recommendations"] = recs
        obj["intervention_count"] = len(recs)
    else:
        # Just a count for list views.
        obj["intervention_count"] = len(tmpl.recommendations or [])

    return obj


def _visible_qs(therapist: Therapist):
    """QuerySet of templates the therapist can see."""
    return InterventionTemplate.objects.filter(Q(is_public=True) | Q(created_by=therapist))


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def template_list_create(request):
    """
    GET  /api/templates/          — list visible templates (with optional filters)
    POST /api/templates/          — create a new template
    """
    therapist = _get_therapist(request)
    if therapist is None:
        return JsonResponse({"error": "Therapist profile not found."}, status=403)

    # ── GET ────────────────────────────────────────────────────────────────
    if request.method == "GET":
        qs = _visible_qs(therapist)

        name = request.GET.get("name", "").strip()
        specialization = request.GET.get("specialization", "").strip()
        diagnosis = request.GET.get("diagnosis", "").strip()

        if name:
            qs = qs.filter(name__icontains=name)
        if specialization:
            qs = qs.filter(specialization__icontains=specialization)
        if diagnosis:
            qs = qs.filter(diagnosis__icontains=diagnosis)

        templates = [_serialize_template(t) for t in qs.order_by("-createdAt")]
        return JsonResponse({"templates": templates})

    # ── POST ───────────────────────────────────────────────────────────────
    if request.method == "POST":
        field_errors: Dict[str, List[str]] = {}

        try:
            body = json.loads(request.body or "{}")
        except Exception:
            return bad("Invalid JSON body.", {}, ["Invalid JSON."], status=400)

        name = (body.get("name") or "").strip()
        description = (body.get("description") or "").strip()
        is_public = bool(body.get("is_public", False))
        specialization = (body.get("specialization") or "").strip() or None
        diagnosis = (body.get("diagnosis") or "").strip() or None

        if not name:
            field_errors["name"] = ["Name is required."]
        if len(name) > 200:
            field_errors["name"] = ["Name must be ≤ 200 characters."]
        if field_errors:
            return bad("Validation error.", field_errors, [], status=400)

        tmpl = InterventionTemplate(
            name=name,
            description=description,
            is_public=is_public,
            created_by=therapist,
            specialization=specialization,
            diagnosis=diagnosis,
        )
        tmpl.save()
        return JsonResponse({"template": _serialize_template(tmpl, detail=True)}, status=201)

    return JsonResponse({"error": "Method not allowed."}, status=405)


@api_view(["GET", "DELETE", "PATCH"])
@permission_classes([IsAuthenticated])
def template_detail(request, template_id):
    """
    GET    /api/templates/<id>/   — retrieve full template (detail view)
    DELETE /api/templates/<id>/   — delete (owner only)
    PATCH  /api/templates/<id>/   — update metadata (owner only)
    """
    therapist = _get_therapist(request)
    if therapist is None:
        return JsonResponse({"error": "Therapist profile not found."}, status=403)

    if not ObjectId.is_valid(template_id):
        return JsonResponse({"error": "Invalid template id."}, status=400)

    try:
        tmpl = InterventionTemplate.objects.get(pk=ObjectId(template_id))
    except InterventionTemplate.DoesNotExist:
        return JsonResponse({"error": "Template not found."}, status=404)

    # Visibility check
    is_owner = str(tmpl.created_by.id) == str(therapist.id)
    if not tmpl.is_public and not is_owner:
        return JsonResponse({"error": "Not found."}, status=404)

    # ── GET ────────────────────────────────────────────────────────────────
    if request.method == "GET":
        return JsonResponse({"template": _serialize_template(tmpl, detail=True)})

    # ── DELETE ─────────────────────────────────────────────────────────────
    if request.method == "DELETE":
        if not is_owner:
            return JsonResponse({"error": "Only the creator can delete this template."}, status=403)
        tmpl.delete()
        return JsonResponse({"success": True})

    # ── PATCH ──────────────────────────────────────────────────────────────
    if request.method == "PATCH":
        if not is_owner:
            return JsonResponse({"error": "Only the creator can edit this template."}, status=403)

        try:
            body = json.loads(request.body or "{}")
        except Exception:
            return bad("Invalid JSON body.", {}, ["Invalid JSON."], status=400)

        field_errors: Dict[str, List[str]] = {}

        if "name" in body:
            name = (body["name"] or "").strip()
            if not name:
                field_errors["name"] = ["Name cannot be empty."]
            elif len(name) > 200:
                field_errors["name"] = ["Name must be ≤ 200 characters."]
            else:
                tmpl.name = name

        if "description" in body:
            tmpl.description = (body["description"] or "").strip()

        if "is_public" in body:
            tmpl.is_public = bool(body["is_public"])

        if "specialization" in body:
            tmpl.specialization = (body["specialization"] or "").strip() or None

        if "diagnosis" in body:
            tmpl.diagnosis = (body["diagnosis"] or "").strip() or None

        if field_errors:
            return bad("Validation error.", field_errors, [], status=400)

        tmpl.save()
        return JsonResponse({"template": _serialize_template(tmpl, detail=True)})

    return JsonResponse({"error": "Method not allowed."}, status=405)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def copy_template(request, template_id):
    """
    POST /api/templates/<id>/copy/

    Duplicate a visible template.  The copy is private and owned by the
    requesting therapist.  Name becomes "Copy of <original name>".
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed."}, status=405)

    therapist = _get_therapist(request)
    if therapist is None:
        return JsonResponse({"error": "Therapist profile not found."}, status=403)

    if not ObjectId.is_valid(template_id):
        return JsonResponse({"error": "Invalid template id."}, status=400)

    try:
        original = InterventionTemplate.objects.get(pk=ObjectId(template_id))
    except InterventionTemplate.DoesNotExist:
        return JsonResponse({"error": "Template not found."}, status=404)

    is_owner = str(original.created_by.id) == str(therapist.id)
    if not original.is_public and not is_owner:
        return JsonResponse({"error": "Not found."}, status=404)

    # Allow overriding the name via request body
    try:
        body = json.loads(request.body or "{}")
    except Exception:
        body = {}

    new_name = (body.get("name") or "").strip() or f"Copy of {original.name}"
    if len(new_name) > 200:
        new_name = new_name[:200]

    new_description = body.get("description")
    new_description = new_description.strip() if isinstance(new_description, str) else original.description

    copy = InterventionTemplate(
        name=new_name,
        description=new_description,
        is_public=False,
        created_by=therapist,
        specialization=original.specialization,
        diagnosis=original.diagnosis,
        recommendations=list(original.recommendations),  # shallow copy of embedded list
    )
    copy.save()
    return JsonResponse({"template": _serialize_template(copy, detail=True)}, status=201)


# ---------------------------------------------------------------------------
# Phase 2 — Intervention assignment within a template
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def template_intervention_assign(request, template_id):
    """
    POST   /api/templates/<id>/interventions/
        Add (or replace) an intervention+schedule entry in the template.
        When no diagnosis is supplied the entry is stored under the ``_all``
        sentinel key, meaning it applies to any patient regardless of diagnosis.

    Body fields
    -----------
    interventionId  str      required
    diagnosis       str      optional  — omit or "" to mean "all diagnoses"
    start_day       int      default 1
    end_day         int      required
    interval        int      default 1
    unit            str      "day" | "week" | "month"  default "week"
    selected_days   [str]    e.g. ["Mon","Wed","Fri"]
    suggested_execution_time  int  minutes, optional
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed."}, status=405)

    therapist = _get_therapist(request)
    if therapist is None:
        return JsonResponse({"error": "Therapist profile not found."}, status=403)

    if not ObjectId.is_valid(template_id):
        return JsonResponse({"error": "Invalid template id."}, status=400)

    try:
        tmpl = InterventionTemplate.objects.get(pk=ObjectId(template_id))
    except InterventionTemplate.DoesNotExist:
        return JsonResponse({"error": "Template not found."}, status=404)

    if str(tmpl.created_by.id) != str(therapist.id):
        return JsonResponse({"error": "Only the creator can modify this template."}, status=403)

    try:
        body = json.loads(request.body or "{}")
    except Exception:
        return bad("Invalid JSON body.", {}, ["Invalid JSON."], status=400)

    field_errors: Dict[str, List[str]] = {}

    intervention_id = (body.get("interventionId") or "").strip()
    if not intervention_id or not ObjectId.is_valid(intervention_id):
        field_errors["interventionId"] = ["A valid interventionId is required."]

    diagnosis_key = (body.get("diagnosis") or "").strip() or _ALL_DX

    start_day = int(body.get("start_day") or 1)
    end_day = body.get("end_day")
    if end_day is None:
        field_errors["end_day"] = ["end_day is required."]
    else:
        end_day = int(end_day)

    interval = int(body.get("interval") or 1)
    unit = (body.get("unit") or "week").strip()
    if unit not in ("day", "week", "month"):
        field_errors["unit"] = ["unit must be 'day', 'week', or 'month'."]

    selected_days = body.get("selected_days") or []
    if not isinstance(selected_days, list):
        selected_days = []

    suggested_execution_time = body.get("suggested_execution_time")
    if suggested_execution_time is not None:
        suggested_execution_time = int(suggested_execution_time)

    if field_errors:
        return bad("Validation error.", field_errors, [], status=400)

    try:
        intervention = Intervention.objects.get(pk=ObjectId(intervention_id))
    except Exception:
        return JsonResponse({"error": "Intervention not found."}, status=404)

    schedule = DiagnosisAssignmentSettings(
        active=True,
        interval=interval,
        unit=unit,
        selected_days=selected_days,
        start_day=start_day,
        end_day=end_day,
        suggested_execution_time=suggested_execution_time,
    )

    # Find existing entry for this intervention and update, or append new.
    existing = next(
        (r for r in tmpl.recommendations if _rec_intervention_id(r) == str(intervention.id)),
        None,
    )

    if existing is not None:
        # MongoEngine does not detect in-place mutations of nested dicts inside
        # EmbeddedDocument fields — reassign the whole dict to force dirty-tracking.
        da = dict(existing.diagnosis_assignments or {})
        da[diagnosis_key] = [schedule]
        existing.diagnosis_assignments = da
    else:
        entry = DefaultInterventions(
            recommendation=intervention,
            diagnosis_assignments={diagnosis_key: [schedule]},
        )
        tmpl.recommendations.append(entry)

    tmpl.save()
    return JsonResponse({"template": _serialize_template(tmpl, detail=True)})


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def template_intervention_remove(request, template_id, intervention_id):
    """
    DELETE /api/templates/<id>/interventions/<intervention_id>/
        Remove an intervention entry from the template entirely.
        Pass ``?diagnosis=<dx>`` to remove only that diagnosis block;
        omit to remove the whole entry for that intervention.
    """
    if request.method != "DELETE":
        return JsonResponse({"error": "Method not allowed."}, status=405)

    therapist = _get_therapist(request)
    if therapist is None:
        return JsonResponse({"error": "Therapist profile not found."}, status=403)

    if not ObjectId.is_valid(template_id) or not ObjectId.is_valid(intervention_id):
        return JsonResponse({"error": "Invalid id."}, status=400)

    try:
        tmpl = InterventionTemplate.objects.get(pk=ObjectId(template_id))
    except InterventionTemplate.DoesNotExist:
        return JsonResponse({"error": "Template not found."}, status=404)

    if str(tmpl.created_by.id) != str(therapist.id):
        return JsonResponse({"error": "Only the creator can modify this template."}, status=403)

    diagnosis_key = request.GET.get("diagnosis", "").strip() or None

    original_len = len(tmpl.recommendations)
    if diagnosis_key:
        # Remove just that diagnosis block from the matching entry.
        for rec in tmpl.recommendations:
            if _rec_intervention_id(rec) == intervention_id:
                # Reassign dict to force MongoEngine dirty-tracking (in-place
                # mutations like .pop() are silently ignored by change detection).
                da = dict(rec.diagnosis_assignments or {})
                da.pop(diagnosis_key, None)
                rec.diagnosis_assignments = da
                # Drop the whole entry if no blocks remain.
                if not rec.diagnosis_assignments:
                    tmpl.recommendations.remove(rec)
                break
    else:
        tmpl.recommendations = [r for r in tmpl.recommendations if _rec_intervention_id(r) != intervention_id]

    if len(tmpl.recommendations) == original_len and not diagnosis_key:
        return JsonResponse({"error": "Intervention not found in template."}, status=404)

    tmpl.save()
    return JsonResponse({"template": _serialize_template(tmpl, detail=True)})


def _rec_intervention_id(rec: DefaultInterventions) -> str:
    """Safely return the string id of a DefaultInterventions recommendation ref."""
    try:
        iv = rec.recommendation
        return str(iv.id) if iv is not None else ""
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Phase 2 — Apply a named template to a patient
# ---------------------------------------------------------------------------


def _apply_template_to_single_patient(
    tmpl, patient, therapist, eff_dt, diagnosis_filter, notes, force_video, overwrite
):
    """Apply *tmpl* to one patient.  Returns (applied_count, sessions_created)."""
    start_time = "08:00"

    plan = RehabilitationPlan.objects(patientId=patient).first()
    if not plan:
        plan = RehabilitationPlan(
            patientId=patient,
            therapistId=therapist,
            startDate=getattr(patient.userId, "createdAt", timezone.now()),
            endDate=getattr(patient, "study_end_date", None) or getattr(patient, "reha_end_date", None),
            status="active",
            interventions=[],
            questionnaires=[],
            createdAt=timezone.now(),
            updatedAt=timezone.now(),
        )

    applied = 0
    total_sessions = 0

    for rec in tmpl.recommendations or []:
        try:
            inter = rec.recommendation
            if inter is None:
                continue
        except Exception:
            logger.warning("Could not dereference intervention in template %s", tmpl.id)
            continue

        dx_map = rec.diagnosis_assignments or {}

        if diagnosis_filter:
            keys_to_apply = [k for k in dx_map if k in (diagnosis_filter, _ALL_DX)]
        else:
            keys_to_apply = list(dx_map.keys())

        collected_dates = []

        for dx_key in keys_to_apply:
            raw_segments = dx_map.get(dx_key)
            segments = _normalize_segments(raw_segments)
            if not segments:
                continue

            for seg in segments:
                seg_start = eff_dt + timedelta(days=max(1, seg["start_day"]) - 1)
                seg_end = eff_dt + timedelta(days=max(seg["end_day"], seg["start_day"]) - 1)

                if seg["unit"] == "day":
                    count = _occ_count_for_day_range(seg["start_day"], seg["end_day"], seg["interval"])
                    end_obj = {"type": "count", "count": count}
                    max_occ = count
                else:
                    end_obj = {
                        "type": "date",
                        "date": f"{seg_end.date().isoformat()}T23:59:59",
                    }
                    max_occ = 2000

                occurrences = _expand_dates(
                    start_date=seg_start.date().isoformat(),
                    start_time=seg.get("start_time") or start_time,
                    unit=seg["unit"],
                    interval=int(seg["interval"]),
                    selected_days=seg["selected_days"],
                    end=end_obj,
                    max_occurrences=max_occ,
                )
                collected_dates.extend(occurrences)

        collected_dates = sorted({make_aware(d) if is_naive(d) else d for d in collected_dates})
        if not collected_dates:
            continue

        _upsert_intervention(
            plan,
            inter,
            dates=collected_dates,
            notes=notes,
            require_video=force_video,
            overwrite=overwrite,
            effective_from=eff_dt,
        )

        applied += 1
        total_sessions += len(collected_dates)

    plan.updatedAt = timezone.now()
    plan.save()
    return applied, total_sessions


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def apply_named_template(request, template_id):
    """
    POST /api/templates/<id>/apply/

    Apply a named InterventionTemplate to one or more patients.

    Modes (mutually exclusive):
    - patientIds  list[str]  — apply to specific patients (patient_code or ObjectId)
    - diagnosis   str        — apply to ALL clinic patients whose diagnosis list
                               contains this value

    Body fields
    -----------
    patientIds      list     required when not using diagnosis mode
    diagnosis       str      required when not using patientIds mode
    effectiveFrom   str      required  YYYY-MM-DD
    overwrite       bool     default false
    require_video_feedback  bool  default false
    notes           str      optional
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed."}, status=405)

    therapist = _get_therapist(request)
    if therapist is None:
        return JsonResponse({"error": "Therapist profile not found."}, status=403)

    if not ObjectId.is_valid(template_id):
        return JsonResponse({"error": "Invalid template id."}, status=400)

    try:
        tmpl = InterventionTemplate.objects.get(pk=ObjectId(template_id))
    except InterventionTemplate.DoesNotExist:
        return JsonResponse({"error": "Template not found."}, status=404)

    is_owner = str(tmpl.created_by.id) == str(therapist.id)
    if not tmpl.is_public and not is_owner:
        return JsonResponse({"error": "Not found."}, status=404)

    try:
        body = json.loads(request.body or "{}")
    except Exception:
        return bad("Invalid JSON body.", {}, ["Invalid JSON."], status=400)

    field_errors: Dict[str, List[str]] = {}

    patient_ids_raw = body.get("patientIds") or []
    diagnosis_filter = (body.get("diagnosis") or "").strip() or None
    effective = (body.get("effectiveFrom") or "").strip()
    overwrite = bool(body.get("overwrite", False))
    force_video = bool(body.get("require_video_feedback", False))
    notes = (body.get("notes") or "").strip()[:1000]

    if not effective:
        field_errors["effectiveFrom"] = ["effectiveFrom is required."]
    if not patient_ids_raw and not diagnosis_filter:
        field_errors["patientIds"] = ["Either patientIds or diagnosis is required."]
    if patient_ids_raw and diagnosis_filter:
        field_errors["patientIds"] = ["Provide either patientIds or diagnosis, not both."]

    if field_errors:
        return bad("Validation error.", field_errors, [], status=400)

    try:
        eff_date = datetime.fromisoformat(f"{effective}T00:00:00")
    except Exception:
        return bad("Validation error.", {"effectiveFrom": ["Invalid date. Use YYYY-MM-DD."]}, [], status=400)

    eff_dt = make_aware(eff_date) if is_naive(eff_date) else eff_date

    # ── Resolve patient list ──────────────────────────────────────────────────
    patients = []

    if patient_ids_raw:
        not_found = []
        for pid in patient_ids_raw:
            pid = str(pid).strip()
            try:
                if ObjectId.is_valid(pid):
                    p = Patient.objects.get(pk=ObjectId(pid))
                else:
                    p = Patient.objects.get(patient_code=pid)
                patients.append(p)
            except Exception:
                not_found.append(pid)
        if not_found:
            return bad(
                "Validation error.",
                {"patientIds": [f"Patient(s) not found: {', '.join(not_found)}"]},
                [],
                status=404,
            )
    else:
        # Diagnosis bulk mode — find all active clinic patients with this diagnosis
        patients = list(
            Patient.objects(
                clinic__in=therapist.clinics,
                diagnosis=diagnosis_filter,
            )
        )
        if not patients:
            return JsonResponse(
                {
                    "success": True,
                    "applied": 0,
                    "sessions_created": 0,
                    "patients_affected": 0,
                    "message": f"No patients found with diagnosis '{diagnosis_filter}'.",
                },
                status=200,
            )

    # ── Apply template to each patient ───────────────────────────────────────
    total_applied = 0
    total_sessions = 0
    patients_affected = 0

    for patient in patients:
        try:
            a, s = _apply_template_to_single_patient(
                tmpl, patient, therapist, eff_dt, diagnosis_filter, notes, force_video, overwrite
            )
            total_applied += a
            total_sessions += s
            if a > 0:
                patients_affected += 1
        except Exception as e:
            logger.error(
                "apply_named_template: error applying to patient %s: %s",
                getattr(patient, "patient_code", str(patient.pk)),
                str(e),
                exc_info=True,
            )

    return JsonResponse(
        {
            "success": True,
            "applied": total_applied,
            "sessions_created": total_sessions,
            "patients_affected": patients_affected,
        },
        status=200,
    )


# ---------------------------------------------------------------------------
# Phase 3 — Calendar preview for a named template
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def template_calendar(request, template_id):
    """
    GET /api/templates/<id>/calendar/?horizon_days=84&diagnosis=<dx>

    Returns the same TemplateItem[] payload as the therapist template-plan
    endpoint, but for a named InterventionTemplate.

    ``diagnosis`` (optional) — if supplied, only entries matching that
    diagnosis key (or the ``_all`` sentinel) are included.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed."}, status=405)

    therapist = _get_therapist(request)
    if therapist is None:
        return JsonResponse({"error": "Therapist profile not found."}, status=403)

    if not ObjectId.is_valid(template_id):
        return JsonResponse({"error": "Invalid template id."}, status=400)

    try:
        tmpl = InterventionTemplate.objects.get(pk=ObjectId(template_id))
    except InterventionTemplate.DoesNotExist:
        return JsonResponse({"error": "Template not found."}, status=404)

    is_owner = str(tmpl.created_by.id) == str(therapist.id)
    if not tmpl.is_public and not is_owner:
        return JsonResponse({"error": "Not found."}, status=404)

    try:
        horizon = int(request.GET.get("horizon_days") or 84)
        diag_filter = (request.GET.get("diagnosis") or "").strip() or None

        base = make_aware(datetime.fromisoformat(f"{BASE_ANCHOR}T00:00:00"))
        items = []

        for rec in tmpl.recommendations or []:
            try:
                inter = rec.recommendation
                if inter is None:
                    continue
            except Exception:
                logger.warning("Could not dereference intervention in template %s", tmpl.id)
                continue

            dx_map = rec.diagnosis_assignments or {}

            for dx, raw in dx_map.items():
                if diag_filter and dx not in (diag_filter, _ALL_DX):
                    continue

                segments = _normalize_segments(raw)
                if not segments:
                    continue

                merged_occ = []
                latest = max(segments, key=lambda s: s["start_day"])

                for seg in segments:
                    start_date = _anchor_date_for_day(seg["start_day"])
                    end_date = _anchor_date_for_day(seg["end_day"])

                    if seg["unit"] == "day":
                        count = _occ_count_for_day_range(seg["start_day"], seg["end_day"], seg["interval"])
                        end_obj = {"type": "count", "count": count}
                        max_occ = count
                    else:
                        end_obj = {"type": "date", "date": f"{end_date}T23:59:59"}
                        max_occ = 1000

                    occ = _expand_dates(
                        start_date=start_date,
                        start_time=seg.get("start_time") or "08:00",
                        unit=seg["unit"],
                        interval=int(seg["interval"]),
                        selected_days=seg["selected_days"],
                        end=end_obj,
                        max_occurrences=max_occ,
                    )

                    for d in occ:
                        day_n = (d.date() - base.date()).days + 1
                        if 1 <= day_n <= horizon:
                            merged_occ.append({"day": day_n, "time": d.strftime("%H:%M")})

                merged_occ.sort(key=lambda x: (x["day"], x["time"]))

                titles = getattr(inter, "title", {}) or {}
                title_str = (
                    titles.get("en") or titles.get("de") or next(iter(titles.values()), "")
                    if isinstance(titles, dict)
                    else str(titles)
                )

                items.append(
                    {
                        "diagnosis": dx if dx != _ALL_DX else "",
                        "intervention": {
                            "_id": str(inter.id),
                            "title": title_str,
                            "duration": getattr(inter, "duration", 30),
                            "content_type": getattr(inter, "content_type", ""),
                            "tags": getattr(inter, "tags", []),
                        },
                        "schedule": {
                            "unit": latest["unit"],
                            "interval": latest["interval"],
                            "selectedDays": latest["selected_days"],
                            "start_day": latest["start_day"],
                            "end_day": latest["end_day"],
                        },
                        "occurrences": merged_occ,
                        "segments": segments,
                    }
                )

        return JsonResponse({"horizon_days": horizon, "items": items}, status=200)

    except Exception as e:
        logger.exception("template_calendar failed")
        return JsonResponse({"error": str(e)}, status=500)
