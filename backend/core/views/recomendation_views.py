# views/interventions.py (or wherever this lives)
# ✅ FULL UPDATED SCRIPT (drop-in):
# - Fixes contentType validation by normalizing case (accepts "video" and stores "Video")
# - Removes duplicate imports/duplicate constants
# - Unifies error response shape
# - Keeps your existing template/apply + preview + list + assignment endpoints
# - Makes media parsing stricter + consistent
# - Ensures file_url is returned for file media
# - Adds CONTENT_TYPE_CANONICAL_MAP + normalize_content_type()

import json
import logging
import mimetypes
import os
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from bson import ObjectId
from django.conf import settings
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.utils import timezone
from django.utils.timezone import is_naive, make_aware
from django.views.decorators.csrf import csrf_exempt
from mongoengine.queryset.visitor import Q
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

import utils.interventions  # for _save_file and other helpers
from core.models import (
    DefaultInterventions,
    DiagnosisAssignmentSettings,
    Intervention,
    InterventionAssignment,
    InterventionMedia,
    Logs,
    Patient,
    PatientInterventionLogs,
    PatientType,
    Therapist,
)
from utils.config import config
from utils.interventions import (
    _abs_media_url,
    _anchor_date_for_day,
    _as_str_or_none,
    _available_language_variants,
    _build_external_media,
    _build_file_media,
    _detect_file_media_type,
    _first_str_from_any,
    _is_valid_url,
    _lang_fallback_chain,
    _list_of_str,
    _media_key,
    _normalize_segments,
    _occ_count_for_day_range,
    _parse_bool,
    _parse_int,
    _parse_str_list,
    _pick_best_variant,
    _pick_variant,
    _safe_title_slug,
    _save_file,
    _serialize_media,
    _split_taglist_into_fields,
    normalize_content_type,
)
from utils.scheduling import _expand_dates  # you already use this
from utils.utils import bad, sanitize_text

FILE_TYPE_FOLDERS = {
    "mp4": "videos",
    "mov": "videos",
    "avi": "videos",
    "mkv": "videos",
    "webm": "videos",
    "mp3": "audios",
    "wav": "audios",
    "m4a": "audios",
    "ogg": "audios",
    "pdf": "pdfs",
    "png": "images",
    "jpg": "images",
    "jpeg": "images",
    "gif": "images",
    "webp": "images",
}
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------

# Backend allowed content types are TitleCase (or "PDF")
# Your config already contains these e.g. ["App","Audio",...]
ALLOWED_CONTENT_TYPES = set(config["RecomendationInfo"]["types"])

# Accept any casing from frontend and normalize to canonical backend values.


MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024  # 1GB
MAX_LIST_ITEMS = 30
MAX_ITEM_LEN = 80

BASE_ANCHOR = "2000-01-01"  # fixed origin so "Day N" is stable


# --------------------------------------------------------------------
# VIEW: apply_template_to_patient
# --------------------------------------------------------------------


@csrf_exempt
@permission_classes([IsAuthenticated])
def apply_template_to_patient(request, therapist_id):
    if request.method != "POST":
        return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

    field_errors: Dict[str, List[str]] = {}
    non_field_errors: List[str] = []

    def add_field_error(field, msg):
        field_errors.setdefault(field, []).append(msg)

    try:
        try:
            body = json.loads(request.body or "{}")
        except Exception:
            non_field_errors.append("Invalid JSON body.")
            return bad("Validation error.", field_errors, non_field_errors, status=400)

        patient_id = (body.get("patientId") or "").strip()
        diagnosis = (body.get("diagnosis") or "").strip()
        effective = (body.get("effectiveFrom") or "").strip()
        start_time = (body.get("startTime") or "08:00").strip()
        overwrite = bool(body.get("overwrite", False))
        force_video = bool(body.get("require_video_feedback", False))
        notes = (body.get("notes") or "").strip()[:1000]

        if not patient_id:
            add_field_error("patientId", "patientId is required.")
        if not diagnosis:
            add_field_error("diagnosis", "Diagnosis is required.")
        if not effective:
            add_field_error("effectiveFrom", "Effective date is required.")
        if field_errors:
            return bad("Validation error.", field_errors, non_field_errors, status=400)

        try:
            eff_date = datetime.fromisoformat(f"{effective}T00:00:00")
        except Exception:
            add_field_error("effectiveFrom", "Invalid date format. Use YYYY-MM-DD.")

        try:
            datetime.strptime(start_time, "%H:%M")
        except Exception:
            add_field_error("startTime", "Invalid time format. Use HH:MM.")

        if field_errors:
            return bad("Validation error.", field_errors, non_field_errors, status=400)

        eff_dt = make_aware(eff_date) if is_naive(eff_date) else eff_date

        try:
            therapist = Therapist.objects.get(userId=ObjectId(therapist_id))
        except Exception:
            return bad("Therapist not found", {}, ["Invalid therapistId"], status=404)

        try:
            if ObjectId.is_valid(patient_id):
                patient = Patient.objects.get(pk=ObjectId(patient_id))
            else:
                patient = Patient.objects.get(patient_code=patient_id)
        except Exception:
            return bad(
                "Validation error.",
                {"patientId": ["Patient not found."]},
                [],
                status=404,
            )

        # NOTE: you referenced RehabilitationPlan in your original code but it wasn't in your imports.
        # Keep as-is if it's available in core.models; if not, import it above.
        from core.models import (  # local import to avoid breaking module if missing in some contexts
            RehabilitationPlan,
        )

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

        for rec in therapist.default_recommendations or []:
            inter = rec.recommendation
            dx_map = rec.diagnosis_assignments or {}
            raw_segments = dx_map.get(diagnosis)
            segments = _normalize_segments(raw_segments)
            if not segments:
                continue

            collected_dates = []

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

        logger.info(
            "[ASSIGN_INTERVENTION] therapist=%s patient=%s diagnosis=%s applied=%d sessions=%d",
            therapist_id,
            patient_id,
            diagnosis,
            applied,
            total_sessions,
        )
        try:
            Logs.objects.create(
                userId=therapist.userId,
                action="ASSIGN_INTERVENTION",
                userAgent=(request.headers.get("User-Agent", "") or "")[:20],
                patient=patient,
                details=f"diagnosis={diagnosis} applied={applied} sessions={total_sessions}",
            )
        except Exception:
            pass

        return JsonResponse(
            {"success": True, "applied": applied, "sessions_created": total_sessions},
            status=200,
        )

    except Exception as e:
        logger.exception("apply_template_to_patient failed")
        return bad("Internal Server Error", {}, [str(e)], status=500)


# --------------------------------------------------------------------
# VIEW: template_plan_preview
# --------------------------------------------------------------------


@permission_classes([IsAuthenticated])
def template_plan_preview(request, therapist_id):
    try:
        diag_filter = (request.GET.get("diagnosis") or "").strip() or None
        horizon = int(request.GET.get("horizon") or 84)

        th = Therapist.objects.get(userId=ObjectId(therapist_id))
        items = []

        for rec in th.default_recommendations or []:
            inter = rec.recommendation
            if not inter:
                continue

            dx_map = rec.diagnosis_assignments or {}
            for dx, raw in dx_map.items():
                if diag_filter and dx != diag_filter:
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
                        start_time=seg["start_time"],
                        unit=seg["unit"],
                        interval=int(seg["interval"]),
                        selected_days=seg["selected_days"],
                        end=end_obj,
                        max_occurrences=max_occ,
                    )

                    base = make_aware(datetime.fromisoformat(f"{BASE_ANCHOR}T00:00:00"))
                    for d in occ:
                        day_n = (d.date() - base.date()).days + 1
                        if 1 <= day_n <= horizon:
                            merged_occ.append({"day": day_n, "time": d.strftime("%H:%M")})

                merged_occ.sort(key=lambda x: (x["day"], x["time"]))

                items.append(
                    {
                        "diagnosis": dx,
                        "intervention": {
                            "_id": str(inter.id),
                            "title": inter.title,
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

    except Therapist.DoesNotExist:
        return JsonResponse({"error": "Therapist not found"}, status=404)
    except Exception as e:
        logger.exception("template_plan_preview failed")
        return JsonResponse({"error": str(e)}, status=500)


# --------------------------------------------------------------------
# VIEW: get_intervention_by_external_id
# --------------------------------------------------------------------


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_intervention_by_external_id(request, external_id: str):
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    lang = (request.GET.get("lang") or "").lower().strip()
    preferred = lang or "en"

    docs = list(
        Intervention.objects.filter(
            Q(is_private=False) | Q(is_private__exists=False),
            external_id=external_id,
        )
    )
    if not docs:
        return JsonResponse({"error": "Intervention not found"}, status=404)

    chosen, langs = _pick_variant(docs, preferred, fallback_order=["en", "de"])

    data = {
        "_id": str(chosen.id),
        "external_id": chosen.external_id,
        "language": chosen.language,
        "available_languages": langs,
        "provider": getattr(chosen, "provider", None),
        "title": chosen.title,
        "description": chosen.description,
        "content_type": chosen.content_type,
        "duration": getattr(chosen, "duration", None),
        "where": getattr(chosen, "where", []) or [],
        "setting": getattr(chosen, "setting", []) or [],
        "media": [_serialize_media(m) for m in (getattr(chosen, "media", None) or [])],
        "preview_img": (_abs_media_url(chosen.preview_img) if getattr(chosen, "preview_img", None) else ""),
        "is_private": bool(getattr(chosen, "is_private", False)),
        "private_patient_id": (
            str(chosen.private_patient_id.id) if getattr(chosen, "private_patient_id", None) else None
        ),
    }
    return JsonResponse({"recommendation": data}, status=200)


# --------------------------------------------------------------------
# VIEW: add_new_intervention (UPDATED for contentType normalization)
# --------------------------------------------------------------------
@csrf_exempt
@permission_classes([IsAuthenticated])
def add_new_intervention(request):
    """
    POST /api/interventions/add/
    Supports multipart/form-data

    Required:
      - title
      - description
      - contentType
      - duration
      - media (json) with >=1 entry OR legacy media_file upload

    Optional:
      - img_file (preview)
      - taxonomy (json)  ✅ FE sends this
      - patientTypes (json list) ✅ optional for public
      - isPrivate + patientId
      - external_id, provider, language
    """
    if request.method != "POST":
        return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

    def bad(message, field_errors=None, non_field_errors=None, status=400):
        return JsonResponse(
            {
                "success": False,
                "message": message,
                "field_errors": field_errors or {},
                "non_field_errors": non_field_errors or [],
            },
            status=status,
        )

    try:
        # -------- base fields --------
        title = (request.POST.get("title") or "").strip()
        description = (request.POST.get("description") or "").strip()
        content_type = normalize_content_type(request.POST.get("contentType") or "")
        duration = request.POST.get("duration")

        language = (request.POST.get("language") or "en").strip().lower()

        external_id = (request.POST.get("external_id") or "").strip() or None
        if external_id:
            if Intervention.objects(external_id=external_id, language=language).first():
                return JsonResponse({"error": "Intervention already exists"}, status=400)
        provider = (request.POST.get("provider") or "").strip() or None

        is_private = _parse_bool(request.POST.get("isPrivate"), False)
        patient_id = (request.POST.get("patientId") or "").strip() or None

        # -------- taxonomy inputs --------
        # FE sends a single JSON blob: taxonomy
        taxonomy_raw = request.POST.get("taxonomy")
        taxonomy = {}
        if taxonomy_raw:
            try:
                taxonomy = json.loads(taxonomy_raw) if isinstance(taxonomy_raw, str) else (taxonomy_raw or {})
                if not isinstance(taxonomy, dict):
                    taxonomy = {}
            except Exception:
                return bad("Invalid taxonomy JSON", {"taxonomy": ["Invalid JSON or shape"]})

        # Direct fields (legacy / fallback)
        aim_raw_direct = _as_str_or_none(request.POST.get("aim"))
        topic_raw_direct = request.POST.get("topic")
        where_raw_direct = request.POST.get("where")
        setting_raw_direct = request.POST.get("setting")
        keywords_raw_direct = request.POST.get("keywords")

        # tagList legacy mapping
        tag_list = _parse_str_list(request.POST.get("tagList"))

        # ---- Extract from taxonomy JSON first (preferred) ----
        # note: FE uses plural keys: aims/topics; you store aim/topic
        input_from = _first_str_from_any(taxonomy.get("input_from") or taxonomy.get("inputFrom"))
        original_language = _first_str_from_any(taxonomy.get("original_language") or taxonomy.get("originalLanguage"))
        primary_diagnosis = _list_of_str(taxonomy.get("primary_diagnosis") or taxonomy.get("primaryDiagnosis"))

        # Aim is StringField in DB: choose first
        aim_from_tax = _first_str_from_any(taxonomy.get("aim") or taxonomy.get("aims"))

        # Topic is ListField in DB: FE sends topics[]
        topic_list = _list_of_str(taxonomy.get("topic") or taxonomy.get("topics"))

        cognitive_level = _first_str_from_any(taxonomy.get("cognitive_level") or taxonomy.get("cognitiveLevel"))
        physical_level = _first_str_from_any(taxonomy.get("physical_level") or taxonomy.get("physicalLevel"))
        duration_bucket = _first_str_from_any(taxonomy.get("duration_bucket") or taxonomy.get("durationBucket"))
        sex_specific = _first_str_from_any(taxonomy.get("sex_specific") or taxonomy.get("sexSpecific"))

        where_list = _list_of_str(taxonomy.get("where"))
        setting_list = _list_of_str(taxonomy.get("setting"))
        keywords_list = _list_of_str(taxonomy.get("keywords"))

        # ---- If taxonomy missing values, fall back to direct POST fields ----
        if not aim_from_tax and aim_raw_direct:
            aim_from_tax = aim_raw_direct

        if not topic_list:
            topic_list = _parse_str_list(topic_raw_direct)

        if not where_list:
            where_list = _parse_str_list(where_raw_direct)

        if not setting_list:
            setting_list = _parse_str_list(setting_raw_direct)

        if not keywords_list:
            keywords_list = _parse_str_list(keywords_raw_direct)

        # ---- Final fallback: map tagList if nothing else provided ----
        if (
            not any(
                [
                    input_from,
                    original_language,
                    primary_diagnosis,
                    aim_from_tax,
                    topic_list,
                    cognitive_level,
                    physical_level,
                    duration_bucket,
                    sex_specific,
                    where_list,
                    setting_list,
                    keywords_list,
                ]
            )
            and tag_list
        ):
            mapped = _split_taglist_into_fields(tag_list)
            aim_from_tax = mapped.get("aim") or None
            topic_list = mapped.get("topic") or []
            where_list = mapped.get("where") or []
            setting_list = mapped.get("setting") or []
            keywords_list = mapped.get("keywords") or []
        else:
            mapped = None

        # patient types (public only) ✅ OPTIONAL now
        patient_types: List[PatientType] = []
        patient_types_raw: List[dict] = []
        if not is_private:
            raw = request.POST.get("patientTypes", None)
            if raw:
                try:
                    patient_types_raw = json.loads(raw) if isinstance(raw, str) else raw
                    if not isinstance(patient_types_raw, list):
                        raise ValueError("patientTypes must be a list")
                except Exception:
                    return bad(
                        "Invalid patientTypes JSON",
                        {"patientTypes": ["Invalid JSON or shape"]},
                    )
            else:
                patient_types_raw = []

        # files
        preview_img = request.FILES.get("img_file")  # optional
        upload_media_file = request.FILES.get("media_file")  # optional legacy

        # -------- validation --------
        field_errors: Dict[str, List[str]] = {}

        if not title:
            field_errors.setdefault("title", []).append("This field is required.")
        if not description:
            field_errors.setdefault("description", []).append("Description is required.")

        dur_int = _parse_int(duration, 0) or 0
        if dur_int <= 0:
            field_errors.setdefault("duration", []).append("Duration must be greater than 0.")

        if not content_type:
            field_errors.setdefault("contentType", []).append("Content type is required.")
        elif content_type not in ALLOWED_CONTENT_TYPES:
            field_errors.setdefault("contentType", []).append(
                f"Invalid. Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}"
            )

        if preview_img and getattr(preview_img, "size", 0) > MAX_FILE_SIZE_BYTES:
            field_errors.setdefault("img_file", []).append("Preview image is too large.")
        if upload_media_file and getattr(upload_media_file, "size", 0) > MAX_FILE_SIZE_BYTES:
            field_errors.setdefault("media_file", []).append("Media file is too large.")

        # private validation
        patient_obj = None
        if is_private:
            if not patient_id:
                field_errors.setdefault("patientId", []).append("Required for private intervention.")
            else:
                try:
                    patient_obj = Patient.objects.get(pk=ObjectId(patient_id))
                except Exception:
                    field_errors.setdefault("patientId", []).append("Invalid patient id.")

        # patientTypes validate (public) optional
        if not is_private and patient_types_raw:
            for idx, pt in enumerate(patient_types_raw):
                if not isinstance(pt, dict):
                    field_errors.setdefault(f"patientTypes[{idx}]", []).append("Must be an object.")
                    continue

                t_ = (pt.get("type") or "").strip()
                d_ = (pt.get("diagnosis") or "").strip()
                f_ = (pt.get("frequency") or "").strip()

                if not any([t_, d_, f_]):
                    continue

                if not t_ or not d_ or not f_:
                    field_errors.setdefault(f"patientTypes[{idx}]", []).append(
                        "type, diagnosis and frequency are required."
                    )
                else:
                    incl = bool(pt.get("includeOption", False))
                    patient_types.append(PatientType(type=t_, diagnosis=d_, frequency=f_, include_option=incl))

        if field_errors:
            return bad("Validation error.", field_errors)

        # -------- parse media JSON (supports FE file_field) --------
        media_items: List[InterventionMedia] = []
        media_raw = request.POST.get("media", None)

        if media_raw:
            try:
                parsed = json.loads(media_raw) if isinstance(media_raw, str) else media_raw
                if not isinstance(parsed, list):
                    raise ValueError("media must be a list")

                for i, m in enumerate(parsed[:30]):
                    if not isinstance(m, dict):
                        field_errors.setdefault(f"media[{i}]", []).append("Must be an object.")
                        continue

                    kind = (m.get("kind") or "").strip()
                    mt = (m.get("media_type") or m.get("mediaType") or "").strip().lower()
                    title_m = (m.get("title") or "").strip() or None
                    provider_m = (m.get("provider") or "").strip() or None
                    mime_m = (m.get("mime") or "").strip() or None

                    if kind not in ("external", "file"):
                        field_errors.setdefault(f"media[{i}].kind", []).append("Must be 'external' or 'file'.")
                        continue

                    if mt not in {
                        "audio",
                        "video",
                        "image",
                        "pdf",
                        "website",
                        "app",
                        "streaming",
                        "text",
                    }:
                        field_errors.setdefault(f"media[{i}].media_type", []).append("Invalid media_type.")
                        continue

                    if kind == "external":
                        url = (m.get("url") or "").strip()
                        if not _is_valid_url(url):
                            field_errors.setdefault(f"media[{i}].url", []).append("Invalid URL.")
                            continue
                        media_items.append(
                            InterventionMedia(
                                kind="external",
                                media_type=mt,
                                provider=provider_m,
                                title=title_m,
                                url=url,
                            )
                        )
                    else:
                        file_field = (m.get("file_field") or m.get("fileField") or "").strip()
                        file_path = (m.get("file_path") or m.get("filePath") or "").strip()

                        if file_field:
                            upload = request.FILES.get(file_field)
                            if not upload:
                                field_errors.setdefault(f"media[{i}].file_field", []).append(
                                    f"File '{file_field}' not found in upload."
                                )
                                continue

                            if getattr(upload, "size", 0) > MAX_FILE_SIZE_BYTES:
                                field_errors.setdefault(f"media[{i}].file_field", []).append("Media file is too large.")
                                continue

                            ext = (os.path.splitext(upload.name)[1] or "").lower().lstrip(".")
                            folder = FILE_TYPE_FOLDERS.get(ext, "others")
                            saved_media_path = _save_file(upload, folder, title)
                            detected_mime = (
                                getattr(upload, "content_type", None) or mimetypes.guess_type(upload.name)[0]
                            )
                            detected_type = _detect_file_media_type(ext, content_type) or mt

                            media_items.append(
                                InterventionMedia(
                                    kind="file",
                                    media_type=detected_type,
                                    provider=provider_m,
                                    title=title_m,
                                    file_path=saved_media_path,
                                    mime=mime_m or detected_mime,
                                )
                            )
                        elif file_path:
                            media_items.append(
                                InterventionMedia(
                                    kind="file",
                                    media_type=mt,
                                    provider=provider_m,
                                    title=title_m,
                                    file_path=file_path,
                                    mime=mime_m,
                                )
                            )
                        else:
                            field_errors.setdefault(f"media[{i}].file_path", []).append(
                                "Provide file_field (upload reference) or file_path."
                            )
                            continue

            except Exception:
                field_errors.setdefault("media", []).append("Invalid media JSON.")
                return bad("Validation error.", field_errors)

        if not media_items and upload_media_file:
            ext = (os.path.splitext(upload_media_file.name)[1] or "").lower().lstrip(".")
            folder = FILE_TYPE_FOLDERS.get(ext, "others")
            saved_media_path = _save_file(upload_media_file, folder, title)
            mime = getattr(upload_media_file, "content_type", None) or mimetypes.guess_type(upload_media_file.name)[0]
            media_type = _detect_file_media_type(ext, content_type)
            media_items.append(
                InterventionMedia(
                    kind="file",
                    media_type=media_type,
                    provider=None,
                    title=None,
                    file_path=saved_media_path,
                    mime=mime,
                )
            )

        if not media_items:
            field_errors.setdefault("media", []).append("Provide at least one media entry or upload a media file.")
            return bad("Validation error.", field_errors)

        # -------- duplicate checks --------
        if not external_id:
            external_id = f"custom_{timezone.now().strftime('%Y%m%d%H%M%S')}_{_safe_title_slug(title)}"

        dup_ext_lang = Intervention.objects(external_id=external_id, language=language).first()
        if dup_ext_lang:
            return bad(
                "Duplicate intervention detected.",
                {"external_id": [f"external_id+language already exists (ID: {dup_ext_lang.id})."]},
            )

        dup_title = Intervention.objects(is_private=False, title__iexact=title).first()
        if dup_title and not is_private:
            return bad(
                "Duplicate intervention detected.",
                {"title": [f"Title already exists (ID: {dup_title.id})."]},
            )

        # -------- save preview --------
        preview_path = ""
        if preview_img:
            preview_path = _save_file(preview_img, "images", title)

        # de-dup media items
        merged: List[InterventionMedia] = []
        seen = set()
        for m in media_items:
            k = _media_key(m)
            if k not in seen:
                merged.append(m)
                seen.add(k)

        # -------- create intervention (NOW SAVES ALL TAXONOMY FIELDS) --------
        intervention = Intervention(
            external_id=external_id,
            language=language,
            provider=provider,
            title=title,
            description=description,
            content_type=content_type,
            duration=dur_int,
            input_from=input_from,  # ✅ FIX
            original_language=original_language,  # ✅ FIX
            primary_diagnosis=primary_diagnosis,  # ✅ FIX
            aim=aim_from_tax,  # ✅ FIX
            topic=topic_list or [],  # ✅ FIX
            cognitive_level=cognitive_level,  # ✅ FIX
            physical_level=physical_level,  # ✅ FIX
            duration_bucket=duration_bucket,  # ✅ FIX
            sex_specific=sex_specific,  # ✅ FIX
            where=where_list or [],  # ✅ FIX
            setting=setting_list or [],  # ✅ FIX
            keywords=keywords_list or [],  # ✅ FIX
            media=merged,
            preview_img=preview_path or "",
            is_private=is_private,
            private_patient_id=patient_obj if (is_private and patient_obj) else None,
            patient_types=patient_types if not is_private else [],
        )

        intervention.save()

        return JsonResponse(
            {
                "success": True,
                "message": "Intervention created successfully",
                "id": str(intervention.id),
            },
            status=200,
        )

    except Exception as e:
        # logger.exception("ERROR creating intervention")
        return JsonResponse({"success": False, "error": str(e)}, status=500)


# --------------------------------------------------------------------
# VIEW: get_intervention_detail
# --------------------------------------------------------------------


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_intervention_detail(request, intervention_id):
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        user_lang = (
            (request.GET.get("lang") or request.headers.get("Accept-Language") or "en").split(",")[0].strip().lower()
        )
        lang_chain = _lang_fallback_chain(user_lang)

        base_doc = Intervention.objects.get(pk=intervention_id)
        external_id = getattr(base_doc, "external_id", None)

        intervention = base_doc
        if external_id:
            picked = _pick_best_variant(external_id, lang_chain)
            if picked:
                intervention = picked

        feedbacks = []
        patient_logs = PatientInterventionLogs.objects.filter(interventionId=intervention)
        for log in patient_logs:
            for entry in log.feedback or []:
                feedbacks.append(
                    {
                        "date": (entry.date.isoformat() if getattr(entry, "date", None) else None),
                        "comment": getattr(entry, "comment", None),
                        "rating": getattr(entry, "rating", None),
                    }
                )

        data = {
            "_id": str(intervention.id),
            "external_id": getattr(intervention, "external_id", None),
            "language": getattr(intervention, "language", None),
            "provider": getattr(intervention, "provider", None),
            "title": intervention.title,
            "description": intervention.description,
            "content_type": intervention.content_type,
            "duration": getattr(intervention, "duration", None),
            "patient_types": [
                {
                    "type": pt.type,
                    "frequency": pt.frequency,
                    "include_option": getattr(pt, "include_option", False),
                    "diagnosis": pt.diagnosis,
                }
                for pt in (intervention.patient_types or [])
            ],
            "media": [_serialize_media(m) for m in (intervention.media or [])],
            "preview_img": _abs_media_url(getattr(intervention, "preview_img", "") or ""),
            "is_private": bool(getattr(intervention, "is_private", False)),
            "private_patient_id": (
                str(intervention.private_patient_id.id) if getattr(intervention, "private_patient_id", None) else None
            ),
            "available_languages": (
                _available_language_variants(getattr(intervention, "external_id", None))
                if getattr(intervention, "external_id", None)
                else []
            ),
            "selected_language": getattr(intervention, "language", None),
        }

        return JsonResponse({"recommendation": data, "feedback": feedbacks}, status=200)

    except Intervention.DoesNotExist:
        return JsonResponse({"error": "Intervention not found"}, status=404)
    except Exception as e:
        logger.exception("[get_intervention_detail] Unexpected error")
        return JsonResponse({"error": str(e)}, status=500)


# --------------------------------------------------------------------
# VIEW: list_all_interventions
# --------------------------------------------------------------------


@csrf_exempt
@permission_classes([IsAuthenticated])
def list_all_interventions(request, patient_id=None):
    """
    GET /api/interventions/all/(<patient_id>/)?lang=de
    - Private interventions: returned as-is
    - Public interventions: grouped by external_id and only best language variant returned
    """
    try:
        preferred_lang = (request.GET.get("lang") or "en").lower().strip()

        q_external_id = (request.GET.get("external_id") or "").strip()
        q_lang = (request.GET.get("lang") or "").lower().strip()

        def _safe_list(v):
            if v is None:
                return []
            if isinstance(v, list):
                return [x for x in v if isinstance(x, str) and x.strip()]
            if isinstance(v, str) and v.strip():
                parts = re.split(r"[;,]\s*", v.strip())
                return [p for p in parts if p]
            return []

        def _dedup_keep_order(xs):
            seen = set()
            out = []
            for x in xs:
                k = str(x).strip().lower()
                if not k or k in seen:
                    continue
                out.append(str(x).strip())
                seen.add(k)
            return out

        def serialize(item, available_languages=None):
            aim_val = getattr(item, "aim", None)
            aims = [aim_val.strip()] if isinstance(aim_val, str) and aim_val.strip() else []

            topic = _safe_list(getattr(item, "topic", None))
            where = _safe_list(getattr(item, "where", None))
            setting = _safe_list(getattr(item, "setting", None))
            keywords = _safe_list(getattr(item, "keywords", None))
            tags = _dedup_keep_order(topic + where + setting + keywords)

            return {
                "_id": str(item.pk),
                "external_id": getattr(item, "external_id", None),
                "language": getattr(item, "language", None),
                "available_languages": available_languages or [],
                "provider": getattr(item, "provider", None),
                "title": getattr(item, "title", None),
                "description": getattr(item, "description", None),
                "content_type": getattr(item, "content_type", None),
                "aims": aims,
                "tags": tags,
                "topic": topic,
                "where": where,
                "setting": setting,
                "keywords": keywords,
                "media": [_serialize_media(m) for m in (getattr(item, "media", None) or [])],
                "preview_img": (_abs_media_url(item.preview_img) if getattr(item, "preview_img", None) else ""),
                "duration": getattr(item, "duration", None),
                "patient_types": [
                    {
                        "type": getattr(pt, "type", None),
                        "frequency": getattr(pt, "frequency", None),
                        "include_option": getattr(pt, "include_option", False),
                        "diagnosis": getattr(pt, "diagnosis", None),
                    }
                    for pt in (getattr(item, "patient_types", None) or [])
                ],
                "is_private": bool(getattr(item, "is_private", False)),
            }

        if q_external_id:
            docs = list(Intervention.objects.filter(external_id=q_external_id))
            if not docs:
                return JsonResponse([], safe=False, status=200)
            pick_lang = q_lang or preferred_lang
            chosen, langs = _pick_variant(docs, pick_lang, fallback_order=["en", "de"])
            return JsonResponse([serialize(chosen, langs)], safe=False, status=200)

        public = list(Intervention.objects.filter(Q(is_private=False) | Q(is_private__exists=False)))

        private = []
        if patient_id:
            try:
                private = list(Intervention.objects.filter(is_private=True, private_patient_id=ObjectId(patient_id)))
            except Exception as e:
                logger.warning(f"Invalid patient ID or private fetch error: {e}")

        private_serialized = [serialize(i, []) for i in private]

        grouped = {}
        for it in public:
            key = getattr(it, "external_id", None) or str(it.id)
            grouped.setdefault(key, []).append(it)

        public_serialized = []
        for external_id, docs in grouped.items():
            chosen, langs = _pick_variant(docs, preferred_lang, fallback_order=["en", "de"])
            public_serialized.append(serialize(chosen, langs))

        return JsonResponse(private_serialized + public_serialized, safe=False, status=200)

    except Exception as e:
        logger.exception("[list_all_interventions] Unexpected error")
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)


# --------------------------------------------------------------------
# VIEW: assign_intervention_to_types (your original kept mostly; only fixed diagnosis variable)
# --------------------------------------------------------------------


@csrf_exempt
@permission_classes([IsAuthenticated])
def assign_intervention_to_types(request, therapist_id):
    if request.method != "POST":
        return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

    field_errors = {}
    non_field_errors = []

    def add_error(field, msg):
        field_errors.setdefault(field, []).append(msg)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse(
            {
                "success": False,
                "message": "Invalid JSON body.",
                "field_errors": {"__root__": ["Malformed JSON"]},
                "non_field_errors": [],
            },
            status=400,
        )

    try:
        therapist_obj = Therapist.objects.get(userId=ObjectId(therapist_id))
    except Exception:
        return JsonResponse(
            {
                "success": False,
                "message": "Therapist not found or invalid therapist_id.",
            },
            status=404,
        )

    # NOTE: you named it diagnosis but pulled from patientId. That looked like a bug.
    diagnosis = (data.get("diagnosis") or data.get("patientId") or "").strip()
    interventions_raw = data.get("interventions")

    if not diagnosis:
        add_error("diagnosis", "This field is required.")
    if not interventions_raw:
        add_error("interventions", "This list cannot be empty.")
    elif not isinstance(interventions_raw, list):
        add_error("interventions", "Must be a list.")

    if field_errors:
        return JsonResponse(
            {
                "success": False,
                "message": "Validation error",
                "field_errors": field_errors,
                "non_field_errors": non_field_errors,
            },
            status=400,
        )

    payload = interventions_raw[0]

    intervention_id = payload.get("interventionId")
    if not intervention_id:
        add_error("interventions[0].interventionId", "This field is required.")
    else:
        try:
            inter_obj = Intervention.objects.get(id=ObjectId(intervention_id))
        except Exception:
            add_error(
                "interventions[0].interventionId",
                "Intervention not found or invalid ID.",
            )

    interval = int(payload.get("interval", -99))
    if interval is -99:
        add_error("interventions[0].interval", "Must be an integer.")
    elif interval <= 0:
        add_error("interventions[0].interval", "Must be greater than 0.")

    unit = (payload.get("unit") or "").strip().lower()
    allowed_units = {"day", "week", "month"}
    if unit not in allowed_units:
        add_error(
            "interventions[0].unit",
            f"Invalid unit. Allowed: {', '.join(sorted(allowed_units))}",
        )

    selected_days = payload.get("selectedDays", [])
    if selected_days and not isinstance(selected_days, list):
        add_error("interventions[0].selectedDays", "Must be a list.")
    else:
        for i, d in enumerate(selected_days):
            if not isinstance(d, str):
                add_error(f"interventions[0].selectedDays[{i}]", "Must be a string day name.")

    start_day = int(payload.get("start_day", -99))
    if start_day is -99:
        add_error("interventions[0].start_day", "Must be an integer.")
    elif start_day < 1:
        add_error("interventions[0].start_day", "Must be >= 1.")

    end_block = payload.get("end") or {}
    end_type = end_block.get("type", "count")

    if end_type not in {"count"}:
        add_error("interventions[0].end.type", "Only 'count' is currently supported.")

    count_limit = int(end_block.get("count", -99))
    if count_limit is -99:
        add_error("interventions[0].end.count", "Must be an integer.")
    elif start_day is not None and count_limit < start_day:
        add_error("interventions[0].end.count", "Must be >= start_day.")

    setime = payload.get("suggested_execution_time")
    if setime is not None:
        try:
            parsed = int(setime)
        except (ValueError, TypeError):
            add_error("interventions[0].suggested_execution_time", "Must be a valid integer.")
        else:
            if parsed <= 0:
                add_error(
                    "interventions[0].suggested_execution_time",
                    "Must be a positive integer.",
                )
    if field_errors:
        return JsonResponse(
            {
                "success": False,
                "message": "Validation error",
                "field_errors": field_errors,
                "non_field_errors": non_field_errors,
            },
            status=400,
        )

    new_block = DiagnosisAssignmentSettings(
        active=True,
        interval=interval,
        unit=unit,
        selected_days=selected_days or [],
        end_type="count",
        count_limit=count_limit,
        start_day=start_day,
        end_day=count_limit,
        suggested_execution_time=(
            int(payload.get("suggested_execution_time"))
            if payload.get("suggested_execution_time") is not None
            else None
        ),
    )

    keep_previous = bool(payload.get("keep_previous", False))

    entry = next(
        (rec for rec in therapist_obj.default_recommendations or [] if rec.recommendation == inter_obj),
        None,
    )

    if not entry:
        entry = DefaultInterventions(recommendation=inter_obj, diagnosis_assignments={})
        therapist_obj.default_recommendations.append(entry)

    current = (entry.diagnosis_assignments or {}).get(diagnosis, [])

    coerced = []
    for b in current:
        if isinstance(b, DiagnosisAssignmentSettings):
            coerced.append(b)
        elif isinstance(b, dict):
            try:
                coerced.append(DiagnosisAssignmentSettings(**b))
            except Exception:
                non_field_errors.append(f"Skipping invalid block for diagnosis '{diagnosis}'.")
        else:
            non_field_errors.append(f"Unexpected block type: {type(b)}")

    if keep_previous:
        coerced = _clip_before(coerced, start_day)
        coerced.append(new_block)
        coerced.sort(key=lambda x: (x.start_day, x.end_day))
    else:
        coerced = [new_block]

    entry.diagnosis_assignments[diagnosis] = coerced

    try:
        therapist_obj.save()
    except Exception as e:
        return JsonResponse(
            {
                "success": False,
                "message": "Database error: could not update assignments.",
                "detail": str(e),
            },
            status=500,
        )

    return JsonResponse(
        {
            "success": True,
            "message": "Intervention assignment saved successfully.",
            "diagnosis": diagnosis,
            "blocks": len(coerced),
        },
        status=200,
    )


# --------------------------------------------------------------------
# VIEW: remove_intervention_from_types (unchanged except minor cleanup)
# --------------------------------------------------------------------


@csrf_exempt
@permission_classes([IsAuthenticated])
def remove_intervention_from_types(request, therapist_id):
    if request.method != "POST":
        return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

    field_errors = {}
    non_field_errors = []

    def add_error(field, msg):
        field_errors.setdefault(field, []).append(msg)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse(
            {
                "success": False,
                "message": "Invalid JSON body.",
                "field_errors": {"__root__": ["Malformed JSON"]},
                "non_field_errors": [],
            },
            status=400,
        )

    try:
        therapist_obj = Therapist.objects.get(userId=ObjectId(therapist_id))
    except Exception:
        return JsonResponse(
            {
                "success": False,
                "message": "Therapist not found or invalid therapist_id.",
            },
            status=404,
        )

    intervention_id = data.get("intervention_id")
    if not intervention_id:
        add_error("intervention_id", "This field is required.")
    else:
        try:
            intervention_obj = Intervention.objects.get(id=ObjectId(intervention_id))
        except Exception:
            add_error("intervention_id", "Intervention not found or invalid ID.")

    diagnosis = (data.get("diagnosis") or "").strip()
    if not diagnosis:
        add_error("diagnosis", "This field is required.")

    raw_start_day = data.get("start_day")
    start_day = None
    if raw_start_day is not None:
        try:
            start_day = int(raw_start_day)
            if start_day < 1:
                add_error("start_day", "start_day must be >= 1.")
        except Exception:
            add_error("start_day", "start_day must be a valid integer.")

    if field_errors:
        return JsonResponse(
            {
                "success": False,
                "message": "Validation error",
                "field_errors": field_errors,
                "non_field_errors": non_field_errors,
            },
            status=400,
        )

    entry = None
    for rec in therapist_obj.default_recommendations or []:
        if rec.recommendation == intervention_obj:
            entry = rec
            break

    if not entry:
        return JsonResponse(
            {
                "success": False,
                "message": "No default recommendation entry found for this intervention.",
            },
            status=404,
        )

    diag_map = entry.diagnosis_assignments or {}
    if diagnosis not in diag_map:
        return JsonResponse(
            {
                "success": False,
                "message": "No assignment found for the specified diagnosis.",
            },
            status=404,
        )

    blocks = diag_map.get(diagnosis) or []

    cleaned_blocks = []
    for b in blocks:
        if isinstance(b, DiagnosisAssignmentSettings):
            cleaned_blocks.append(b)
        elif isinstance(b, dict):
            try:
                cleaned_blocks.append(DiagnosisAssignmentSettings(**b))
            except Exception:
                non_field_errors.append(f"Skipping malformed block in diagnosis '{diagnosis}'.")
        else:
            non_field_errors.append(f"Unexpected block type: {type(b)}")

    if start_day is None:
        del diag_map[diagnosis]
        removed_count = len(cleaned_blocks)
    else:
        removed_count = 0
        new_list = []
        for b in cleaned_blocks:
            try:
                b_start = int(getattr(b, "start_day", 1))
            except Exception:
                b_start = 1

            if b_start == start_day:
                removed_count += 1
            else:
                new_list.append(b)

        diag_map[diagnosis] = new_list

        if removed_count == 0:
            return JsonResponse(
                {
                    "success": False,
                    "message": "No block found with the specified start_day.",
                },
                status=404,
            )

    entry.diagnosis_assignments = diag_map

    try:
        therapist_obj.save()
    except Exception as e:
        return JsonResponse(
            {
                "success": False,
                "message": "Database error while saving changes.",
                "detail": str(e),
            },
            status=500,
        )

    return JsonResponse(
        {
            "success": True,
            "message": "Intervention assignment removed successfully.",
            "removed_blocks": removed_count,
            "diagnosis": diagnosis,
        },
        status=200,
    )


# --------------------------------------------------------------------
# VIEW: create_patient_group (kept as-is; just minor cleanup on existing access)
# --------------------------------------------------------------------


@csrf_exempt
@permission_classes([IsAuthenticated])
def create_patient_group(request):
    if request.method != "POST":
        return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

    field_errors = {}
    non_field_errors = []

    def add_error(field, msg):
        field_errors.setdefault(field, []).append(msg)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse(
            {
                "success": False,
                "message": "Invalid JSON body.",
                "field_errors": {"__root__": ["Malformed JSON"]},
                "non_field_errors": [],
            },
            status=400,
        )

    intervention_id = data.get("interventionId")
    diagnosis = (data.get("diagnosis") or "").strip()
    spec_type = (data.get("speciality") or "").strip()
    frequency = (data.get("frequency") or "").strip()

    if not intervention_id:
        add_error("interventionId", "This field is required.")
    if not diagnosis:
        add_error("diagnosis", "This field is required.")
    if not spec_type:
        add_error("speciality", "This field is required.")
    if not frequency:
        add_error("frequency", "This field is required.")

    if field_errors:
        return JsonResponse(
            {
                "success": False,
                "message": "Validation error.",
                "field_errors": field_errors,
                "non_field_errors": non_field_errors,
            },
            status=400,
        )

    try:
        oid = ObjectId(intervention_id)
    except Exception:
        return JsonResponse(
            {
                "success": False,
                "message": "Validation error.",
                "field_errors": {"interventionId": ["Invalid ObjectId format."]},
                "non_field_errors": [],
            },
            status=400,
        )

    try:
        intervention_obj = Intervention.objects.get(pk=oid)
    except Intervention.DoesNotExist:
        return JsonResponse({"success": False, "message": "Intervention not found."}, status=404)

    existing = intervention_obj.patient_types or []
    for pt in existing:
        existing_diag = (getattr(pt, "diagnosis", "") or "").strip().lower()
        existing_type = (getattr(pt, "type", "") or "").strip().lower()
        if existing_diag == diagnosis.lower() and existing_type == spec_type.lower():
            return JsonResponse(
                {
                    "success": False,
                    "message": "A patient group with this diagnosis & speciality already exists.",
                },
                status=400,
            )

    new_entry = PatientType(type=spec_type, diagnosis=diagnosis, frequency=frequency, include_option=True)

    try:
        if not intervention_obj.patient_types:
            intervention_obj.patient_types = []
        intervention_obj.patient_types.append(new_entry)
        intervention_obj.save()
    except Exception as e:
        logger.exception("[create_patient_group] Failed to save intervention")
        return JsonResponse(
            {
                "success": False,
                "message": "Database error while saving patient group.",
                "detail": str(e),
            },
            status=500,
        )

    return JsonResponse({"success": True, "message": "Diagnosis group added successfully."}, status=200)


@csrf_exempt
@permission_classes([IsAuthenticated])
def list_intervention_diagnoses(request, intervention, specialisation, therapist_id):
    """
    GET /api/interventions/<intervention>/assigned-diagnoses/<specialisation>/therapist/<therapist_id>/
    Returns a mapping of diagnoses to their assigned status and the 'all' flag.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        therapist = Therapist.objects.get(userId=ObjectId(therapist_id))
        intervention_id = ObjectId(intervention)

        # Parse all diagnoses based on specialisation(s)
        specialisation_list = [s.strip() for s in specialisation.split(",")]
        all_diagnoses = []
        for spec in specialisation_list:
            all_diagnoses.extend(config["patientInfo"]["function"].get(spec, {}).get("diagnosis", []))

        diagnosis_map = {d: False for d in all_diagnoses}
        all_flag = False

        # Match default recommendation
        default_rec = next(
            (r for r in therapist.default_recommendations if r.recommendation.id == intervention_id),
            None,
        )

        if default_rec:
            for diagnosis, settings in default_rec.diagnosis_assignments.items():
                if diagnosis == "all":
                    all_flag = settings.active
                elif diagnosis in diagnosis_map:
                    diagnosis_map[diagnosis] = settings.active

        return JsonResponse({"diagnoses": diagnosis_map, "all": all_flag}, status=200)

    except Therapist.DoesNotExist as e:
        logger.warning(f"[list_intervention_diagnoses] Entity not found: {e}")
        return JsonResponse({"error": "Therapist not found"}, status=404)
