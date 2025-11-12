import json
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

logger = logging.getLogger(__name__)  # Fallback to file-based logger if needed
FILE_TYPE_FOLDERS = {
    "mp4": "videos",
    "mp3": "audio",
    "jpg": "images",
    "png": "images",
    "pdf": "documents",
}

from utils.scheduling import _expand_dates  # you already use this
# at the top of your apply-template views module
from datetime import datetime, date, time as dtime
from django.utils import timezone


def _as_int(v, default=0):
    try:
        return int(v)
    except Exception:
        return default

def _clip_before(blocks: list[DiagnosisAssignmentSettings], new_start_day: int):
    """Keep earlier parts and cut any overlap at (S-1)."""
    out: list[DiagnosisAssignmentSettings] = []
    for b in blocks:
        # treat None as very large
        end_day = b.end_day if b.end_day and b.end_day >= b.start_day else b.start_day
        if end_day < new_start_day:
            out.append(b)  # fully before
        elif b.start_day < new_start_day <= end_day:
            # clone & clip
            nb = DiagnosisAssignmentSettings(
                active=b.active,
                interval=b.interval,
                unit=b.unit,
                selected_days=list(b.selected_days or []),
                end_type=b.end_type,
                count_limit=b.count_limit,
                start_day=b.start_day,
                end_day=new_start_day - 1,
                suggested_execution_time=b.suggested_execution_time,
            )
            if nb.end_day >= nb.start_day:
                out.append(nb)
        # blocks fully after S are dropped (will be replaced by the new one)
    return out

def _normalize_segments(raw):
    """
    Accepts whatever is in therapist.default_recommendations[i].diagnosis_assignments[dx]
    (list / dict / EmbeddedDocument / junk) and returns a clean, sorted list of segments:
       [
         {
           'unit': 'day'|'week'|'month',
           'interval': int,
           'selected_days': ['Mon', ...],
           'start_day': int>=1,
           'end_day': int>=start_day,
           'start_time': 'HH:MM'
         }, ...
       ]
    """
    if not raw:
        return []

    def as_dict(x):
        if hasattr(x, "to_mongo"):
            return dict(x.to_mongo().to_dict())
        return dict(x)

    items = []
    if isinstance(raw, list):
        seq = raw
    elif isinstance(raw, (dict,)) or hasattr(raw, "to_mongo"):
        seq = [raw]
    else:
        return []

    for r in seq:
        d = as_dict(r)
        unit  = (d.get("unit") or "week").strip()
        intrv = _as_int(d.get("interval", 1), 1)
        sdays = d.get("selected_days") or d.get("selectedDays") or []
        sday  = max(1, _as_int(d.get("start_day", 1), 1))
        # end_day can be present or we infer from legacy fields:
        #   - end.count was (mis)used as "last day N"
        #   - count_limit also seen in stored docs
        end_day = _as_int(
            d.get("end_day") or (d.get("end") or {}).get("count") or d.get("count_limit") or 1,
            1
        )
        end_day = max(end_day, sday)
        stime = (d.get("start_time") or d.get("startTime") or "08:00").strip()

        items.append({
            "unit": unit,
            "interval": max(1, intrv),
            "selected_days": sdays,
            "start_day": sday,
            "end_day": end_day,
            "start_time": stime,
        })

    # sort chronologically
    items.sort(key=lambda x: (x["start_day"], x["end_day"]))
    return items



def _occ_count_for_day_range(start_day, end_day, interval):
    # number of occurrences between S..N by step=interval
    return max(1, (end_day - start_day) // max(1, interval) + 1)

def _anchor_date_for_day(day_n: int) -> str:
    base = datetime.fromisoformat(f"{BASE_ANCHOR}T00:00:00")
    start = base + timedelta(days=max(1, day_n) - 1)
    return start.date().isoformat()

def _aware(dt):
    return timezone.make_aware(dt) if timezone.is_naive(dt) else dt


BASE_ANCHOR = "2000-01-01"  # fixed origin so "Day N" is stable
# ----- helpers reused from the preview view -----
def _to_dt(val):
    if isinstance(val, datetime): return val
    if isinstance(val, str):
        s = val.strip()
        if s.endswith("Z"): s = s[:-1] + "+00:00"
        try: return datetime.fromisoformat(s)
        except Exception: return None
    return None

def _aware(dt):
    if not isinstance(dt, datetime): return None
    return timezone.make_aware(dt) if timezone.is_naive(dt) else dt


def _schedule_from_settings(settings, start_time="08:00"):
    unit   = getattr(settings, "unit", "week") or "week"
    inter  = int(getattr(settings, "interval", 1) or 1)
    sdays  = (getattr(settings, "selected_days", None) or [])[:]
    end_t  = getattr(settings, "end_type", "count") or "count"
    cnt    = getattr(settings, "count_limit", None)
    end    = {"type": "count", "count": int(cnt or 10)}  # fall back to 10
    return {
        "unit": unit,
        "interval": inter,
        "selectedDays": sdays,
        "startTime": start_time or "08:00",
        "end": end,
    }

def _dedup_dates(dt_list):
    # de-duplicate to second precision (mongoengine DateTimeField precision)
    seen = set()
    out = []
    for d in dt_list:
        key = d.replace(microsecond=0)
        if key not in seen:
            seen.add(key)
            out.append(key)
    return out

def _upsert_intervention(plan, intervention, dates, notes="", require_video=False, overwrite=False, effective_from=None):
    """Create/update an InterventionAssignment on the plan."""
    found = None
    for ia in (plan.interventions or []):
        if getattr(getattr(ia, "interventionId", None), "id", None) == intervention.id:
            found = ia
            break

    dates = _dedup_dates(dates)

    if found:
        # Keep past dates; optionally overwrite future dates >= effective_from
        if overwrite and effective_from:
            eff = _aware(effective_from)
            kept = [d for d in (found.dates or []) if d < eff]
            found.dates = kept + dates
        else:
            existing = {d.replace(microsecond=0) for d in (found.dates or [])}
            found.dates = list(existing)  # to list of dt
            # merge
            for d in dates:
                if d.replace(microsecond=0) not in existing:
                    found.dates.append(d)
        if notes:
            found.notes = notes
        found.require_video_feedback = bool(require_video or found.require_video_feedback)
    else:
        plan.interventions.append(
            InterventionAssignment(
                interventionId=intervention,
                frequency="",
                dates=dates,
                notes=notes or "",
                require_video_feedback=bool(require_video),
            )
        )

# views: apply_template_to_patient

@csrf_exempt
@permission_classes([IsAuthenticated])
def apply_template_to_patient(request, therapist_id):
    """
    POST /api/therapists/<id>/templates/apply
    Body:
      {
        "patientId": "<_id or username>",
        "diagnosis": "<dx>",
        "effectiveFrom": "YYYY-MM-DD",
        "startTime": "HH:MM",
        "overwrite": false,
        "require_video_feedback": false,
        "notes": ""
      }
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        body = json.loads(request.body or "{}")
        diag = (body.get("diagnosis") or "").strip()
        pid  = (body.get("patientId") or "").strip()
        eff  = (body.get("effectiveFrom") or "").strip()
        stime = (body.get("startTime") or "08:00").strip()
        overwrite = bool(body.get("overwrite", False))
        force_video = bool(body.get("require_video_feedback", False))
        add_note = body.get("notes") or ""

        if not pid or not diag or not eff:
            return JsonResponse({"error": "Missing patientId/diagnosis/effectiveFrom"}, status=400)

        therapist = Therapist.objects.get(userId=ObjectId(therapist_id))
        patient   = Patient.objects.get(pk=ObjectId(pid)) if ObjectId.is_valid(pid) else Patient.objects.get(patient_code=pid)  # username/patient_code

        plan = RehabilitationPlan.objects(patientId=patient).first()
        if not plan:
            plan = RehabilitationPlan(
                patientId=patient,
                therapistId=therapist,
                startDate=timezone.now(),
                endDate=getattr(patient, "reha_end_date", timezone.now() + timedelta(days=365)),
                status="active",
                interventions=[],
                questionnaires=[],
            )

        eff_date = datetime.fromisoformat(f"{eff}T00:00:00")
        eff_dt = _aware(eff_date)

        applied = 0
        sessions = 0

        for rec in (therapist.default_recommendations or []):
            inter = rec.recommendation
            dx_map = (rec.diagnosis_assignments or {})
            raw = dx_map.get(diag)
            segments = _normalize_segments(raw)
            if not segments:
                continue

            all_dates = []
            for seg in segments:
                # effective day 1 == effectiveFrom; add (start_day-1) days
                seg_start = eff_date + timedelta(days=max(1, seg["start_day"]) - 1)
                end_limit = eff_date + timedelta(days=max(seg["end_day"], seg["start_day"]) - 1)

                if seg["unit"] == "day":
                    count = _occ_count_for_day_range(seg["start_day"], seg["end_day"], seg["interval"])
                    end_obj = {"type": "count", "count": count}
                    max_occ = count
                else:
                    end_obj = {"type": "date", "date": f"{end_limit.date().isoformat()}T23:59:59"}
                    max_occ = 1000

                occ = _expand_dates(
                    start_date=seg_start.date().isoformat(),
                    start_time=seg.get("start_time") or stime,
                    unit=seg["unit"],
                    interval=int(seg["interval"]),
                    selected_days=seg["selected_days"],
                    end=end_obj,
                    max_occurrences=max_occ,
                )
                all_dates.extend(occ)

            # merge & upsert
            all_dates = sorted({_aware(d) for d in all_dates})
            if not all_dates:
                continue

            _upsert_intervention(
                plan,
                inter,
                dates=all_dates,
                notes=add_note,
                require_video=force_video,
                overwrite=overwrite,
                effective_from=eff_dt,
            )
            applied += 1
            sessions += len(all_dates)

        plan.updatedAt = timezone.now()
        plan.save()
        return JsonResponse({"applied": applied, "sessions_created": sessions}, status=200)

    except Therapist.DoesNotExist:
        return JsonResponse({"error": "Therapist not found"}, status=404)
    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Exception as e:
        logger.exception("apply_template_to_patient failed")
        return JsonResponse({"error": str(e)}, status=500)

def _selected_days_from_settings(settings):
    # stored as e.g. ['Mon','Wed'] – return list or []
    return (getattr(settings, "selected_days", None) or [])[:]

def _schedule_from_settings(settings, start_time="08:00", horizon_days=84):
    """
    Convert DiagnosisAssignmentSettings -> schedule shape compatible with _expand_dates.
    If count_limit isn't present, cap via horizon_days.
    """
    unit   = getattr(settings, "unit", "week") or "week"
    inter  = int(getattr(settings, "interval", 1) or 1)
    sdays  = _selected_days_from_settings(settings)
    end_t  = getattr(settings, "end_type", "count") or "count"
    cnt    = getattr(settings, "count_limit", None)
    if end_t != "count":
        end = {"type": "count", "count": max(cnt or 0, 1)}
    else:
        end = {"type": "count", "count": max(cnt or 0, 1)}

    # If no count was saved, derive a sensible preview length from horizon_days
    if not end.get("count"):
        # crude upper bound: daily -> horizon_days, weekly -> horizon_days/7 * (#days selected or 1)
        if unit == "day":
            end["count"] = horizon_days // inter
        elif unit == "week":
            per_week = max(len(sdays) or 1, 1)
            end["count"] = max(1, (horizon_days // 7 // inter) * per_week)
        else:  # month
            end["count"] = max(1, horizon_days // 30 // inter)

    return {
        "unit": unit,
        "interval": inter,
        "selectedDays": sdays,
        "startDate": f"{BASE_ANCHOR}T{start_time}:00",
        "startTime": start_time,
        "end": end,
    }

# views: template_plan_preview

@permission_classes([IsAuthenticated])
def template_plan_preview(request, therapist_id):
    """
    GET /api/therapists/<id>/template-plan?diagnosis=<opt>&horizon=<days>
    Produces day-relative occurrences for each segment.
    """
    try:
        diag_filter = (request.GET.get("diagnosis") or "").strip() or None
        horizon = int(request.GET.get("horizon") or 84)

        th = Therapist.objects.get(userId=ObjectId(therapist_id))
        items = []

        for rec in (th.default_recommendations or []):
            inter = rec.recommendation
            if not inter:
                continue

            dx_map = (rec.diagnosis_assignments or {})
            for dx, raw in dx_map.items():
                if diag_filter and dx != diag_filter:
                    continue

                segments = _normalize_segments(raw)
                if not segments:
                    continue

                # Build response per (diagnosis, intervention) as a single item with occurrences merged
                merged_occ = []
                # Also expose the "current schedule" (most recent segment by start_day)
                latest = max(segments, key=lambda s: s["start_day"])

                for seg in segments:
                    start_date = _anchor_date_for_day(seg["start_day"])
                    # Use end as a DATE boundary at end_day (relative to anchor)
                    end_date = _anchor_date_for_day(seg["end_day"])
                    # For 'day' schedules we can set count precisely:
                    if seg["unit"] == "day":
                        count = _occ_count_for_day_range(seg["start_day"], seg["end_day"], seg["interval"])
                        end_obj = {"type": "count", "count": count}
                        max_occ = count
                    else:
                        end_obj = {"type": "date", "date": f"{end_date}T23:59:59"}
                        max_occ = 1000  # cap

                    occ = _expand_dates(
                        start_date=start_date,
                        start_time=seg["start_time"],
                        unit=seg["unit"],
                        interval=int(seg["interval"]),
                        selected_days=seg["selected_days"],
                        end=end_obj,
                        max_occurrences=max_occ,
                    )

                    base = timezone.make_aware(datetime.fromisoformat(f"{BASE_ANCHOR}T00:00:00"))
                    for d in occ:
                        day_n = (d.date() - base.date()).days + 1
                        if 1 <= day_n <= horizon:
                            merged_occ.append({"day": day_n, "time": d.strftime("%H:%M")})

                # sort merged occurrences by day then time
                merged_occ.sort(key=lambda x: (x["day"], x["time"]))

                items.append({
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
                    "occurrences": merged_occ,  # [{day, time}, ...]
                    # Optional: return raw segments too if your UI uses them
                    "segments": segments,
                })

        return JsonResponse({"horizon_days": horizon, "items": items}, status=200)

    except Therapist.DoesNotExist:
        return JsonResponse({"error": "Therapist not found"}, status=404)
    except Exception as e:
        logger.exception("template_plan_preview failed")
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def list_all_interventions(request, patient_id=None):
    """
    GET /api/interventions/all/(<str:patient_id>/)?
    Return public interventions and optionally private ones for the patient (listed first).
    """
    try:
        public_interventions = Intervention.objects.filter(Q(is_private=False) | Q(is_private__exists=False))

        private_interventions = []
        if patient_id:
            try:
                private_interventions = Intervention.objects.filter(
                    is_private=True,
                    private_patient_id=ObjectId(patient_id)
                )
            except Exception as e:
                logger.warning(f"Invalid patient ID or private fetch error: {e}")

        def serialize(item):
            return {
                "_id": str(item.pk),
                "title": item.title,
                "description": item.description,
                "content_type": item.content_type,
                "patient_types": [
                    {
                        "type": pt.type,
                        "frequency": pt.frequency,
                        "include_option": pt.include_option,
                        "diagnosis": pt.diagnosis,
                    }
                    for pt in item.patient_types
                ],
                "link": item.link or "",
                "media_file": (
                    f"{settings.MEDIA_HOST}{os.path.join(settings.MEDIA_URL, item.media_file)}"
                    if item.media_file else ""
                ),
                "preview_img": (
                    f"{settings.MEDIA_HOST}{os.path.join(settings.MEDIA_URL, item.preview_img)}"
                    if item.preview_img else ""
                ),
                "duration": item.duration,
                "benefitFor": item.benefitFor,
                "tags": item.tags,
                "is_private": item.is_private,  # Include privacy status
            }

        serialized_data = [serialize(i) for i in private_interventions] + [serialize(i) for i in public_interventions]

        return JsonResponse(serialized_data, safe=False, status=200)

    except Exception as e:
        logger.error(f"[list_all_interventions] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)



# Map extensions to storage folders (fallback to "others")
FILE_TYPE_FOLDERS = {
    "mp4": "videos",
    "mov": "videos",
    "avi": "videos",
    "mkv": "videos",
    "mp3": "audios",
    "wav": "audios",
    "m4a": "audios",
    "pdf": "pdfs",
    "png": "images",
    "jpg": "images",
    "jpeg": "images",
    "gif": "images",
    "webp": "images",
}

# Hard limits / constraints
MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024        # 200 MB
MAX_LIST_ITEMS      = 30
MAX_ITEM_LEN        = 80
ALLOWED_CONTENT_TYPES = {"video", "audio", "pdf", "image", "link", "text"}

def _bad_request(message: str, field_errors: Dict[str, List[str]] | None = None,
                 non_field_errors: List[str] | None = None, extra: Dict[str, Any] | None = None):
    payload: Dict[str, Any] = {
        "success": False,
        "message": message,
        "field_errors": field_errors or {},
        "non_field_errors": non_field_errors or [],
    }
    if extra:
        payload.update(extra)
    return JsonResponse(payload, status=400)

def _parse_body(request):
    if request.content_type and "application/json" in request.content_type:
        try:
            return json.loads(request.body.decode("utf-8")) if request.body else {}
        except Exception:
            return {}
    return request.POST.dict()

def _parse_str_list(val) -> List[str]:
    if val is None:
        return []
    if isinstance(val, list):
        items = [sanitize_text(str(x)).strip() for x in val if str(x).strip()]
    elif isinstance(val, str):
        s = val.strip()
        if not s:
            return []
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                items = [sanitize_text(str(x)).strip() for x in parsed if str(x).strip()]
            else:
                items = [sanitize_text(s)]
        except json.JSONDecodeError:
            pieces = [p.strip().strip('"').strip("'") for p in s.split(",")]
            items = [sanitize_text(x) for x in pieces if x]
    else:
        items = [sanitize_text(str(val)).strip()]

    # Enforce limits
    items = items[:MAX_LIST_ITEMS]
    return [x[:MAX_ITEM_LEN] for x in items]

def _parse_bool(val, default=False) -> bool:
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in {"1", "true", "yes", "y", "on"}
    return bool(val) if val is not None else default

def _parse_int(val, default=None):
    if val in (None, ""):
        return default
    try:
        return int(val)
    except Exception:
        return default

@permission_classes([IsAuthenticated])
def add_new_intervention(request):
    """
    POST /api/interventions/add/
    Create a new intervention (public or private).
    Supports multipart/form-data (with files) or application/json.
    Returns detailed validation errors on 400 instead of generic 500s.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    data = _parse_body(request)
    field_errors: Dict[str, List[str]] = {}
    non_field_errors: List[str] = []

    # --- Normalize incoming lists ---
    raw_benefit_for = data.get("benefitFor", data.get("benefits"))
    benefit_for_list = _parse_str_list(raw_benefit_for)

    raw_tags = data.get("tagList", data.get("tags"))
    tags_list = _parse_str_list(raw_tags)

    # patientTypes can be list or JSON string
    raw_patient_types = data.get("patientTypes") or data.get("patient_types") or []
    if isinstance(raw_patient_types, str):
        try:
            raw_patient_types = json.loads(raw_patient_types)
        except json.JSONDecodeError:
            raw_patient_types = []

    # --- Core fields ---
    title_raw = (data.get("title") or "").strip()
    description_raw = data.get("description", "")
    content_type = (data.get("contentType") or data.get("content_type") or "").strip().lower()
    is_private = _parse_bool(data.get("isPrivate", data.get("is_private", False)))
    patient_id = data.get("patientId") or data.get("patient_id")
    duration = _parse_int(data.get("duration"))

    # --- Validations ---
    if not title_raw:
        field_errors.setdefault("title", []).append("This field is required.")

    # Duplicate title check (case-insensitive)
    if title_raw and Intervention.objects.filter(title__iexact=title_raw).first():
        field_errors.setdefault("title", []).append("An intervention with this title already exists.")

    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        field_errors.setdefault("contentType", []).append(
            f"Invalid content type. Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}."
        )

    # Private requires patient id, must exist
    patient_obj = None
    if is_private:
        if not patient_id:
            field_errors.setdefault("patientId", []).append("This field is required when isPrivate is true.")
        else:
            try:
                pid = ObjectId(str(patient_id))
                patient_obj = Patient.objects(pk=pid).first()
                if not patient_obj:
                    field_errors.setdefault("patientId", []).append("Patient not found.")
            except (bson_errors.InvalidId, TypeError):
                field_errors.setdefault("patientId", []).append("Invalid ObjectId for patientId.")

    # patient_types construction + validation (only for public)
    patient_types = []
    if not is_private:
        for idx, pt in enumerate(raw_patient_types or []):
            type_v = (pt.get("type") or "").strip()
            diag_v = (pt.get("diagnosis") or "").strip()
            freq_v = (pt.get("frequency") or "").strip()
            include_v = bool(pt.get("includeOption", pt.get("include_option", False)))

            # Minimal validation
            item_errors = []
            if not type_v:
                item_errors.append("type is required.")
            if not diag_v:
                item_errors.append("diagnosis is required.")
            if not freq_v:
                item_errors.append("frequency is required.")

            if item_errors:
                field_errors.setdefault(f"patientTypes[{idx}]", []).extend(item_errors)
            else:
                patient_types.append(
                    PatientType(
                        type=type_v[:MAX_ITEM_LEN],
                        diagnosis=diag_v[:MAX_ITEM_LEN],
                        frequency=freq_v[:MAX_ITEM_LEN],
                        include_option=include_v,
                    )
                )

    # File validations (if present)
    def _validate_file(file_obj, field_name):
        if file_obj.size > MAX_FILE_SIZE_BYTES:
            field_errors.setdefault(field_name, []).append(
                f"File too large. Max {MAX_FILE_SIZE_BYTES // (1024*1024)}MB."
            )
        # rudimentary type check from name / mimetype
        ext = (file_obj.name.split(".")[-1] or "").lower()
        guessed, _ = mimetypes.guess_type(file_obj.name)
        if not ext and not guessed:
            field_errors.setdefault(field_name, []).append("Unknown file type.")

    if "media_file" in request.FILES:
        _validate_file(request.FILES["media_file"], "media_file")
    if "img_file" in request.FILES:
        _validate_file(request.FILES["img_file"], "img_file")

    # If any errors so far, return 400
    if field_errors:
        return _bad_request("Validation error.", field_errors, non_field_errors)

    # --- Persist files (safe paths) ---
    timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
    private_path = os.path.join("private", str(patient_id)) if is_private and patient_id else ""

    def _store(file_obj, preferred_folder):
        ext = (file_obj.name.split(".")[-1] or "").lower()
        folder = private_path if is_private else FILE_TYPE_FOLDERS.get(ext, preferred_folder)
        filename = f"{timestamp}_{file_obj.name}"
        return default_storage.save(os.path.join(folder, filename), file_obj)

    media_path = ""
    preview_path = ""

    try:
        if "media_file" in request.FILES:
            media_path = _store(request.FILES["media_file"], "others")
        if "img_file" in request.FILES:
            preview_path = _store(request.FILES["img_file"], "images")
    except Exception as ex:
        # storage/FS error → 500 but with context
        return JsonResponse({
            "success": False,
            "message": "Failed to store uploaded file(s).",
            "detail": str(ex)
        }, status=500)

    # --- Build and save Intervention ---
    intervention = Intervention(
        title=sanitize_text(title_raw),
        description=sanitize_text(description_raw),
        content_type=content_type,
        link=data.get("link", ""),
        media_file=media_path,
        preview_img=preview_path,
        patient_types=patient_types if not is_private else [],
        duration=duration,
        benefitFor=benefit_for_list,
        tags=tags_list,
        is_private=is_private,
        private_patient_id=patient_obj.id if is_private and patient_obj else None,
    )

    try:
        intervention.save()
    except Exception as ex:
        # Convert model errors into sane JSON
        return JsonResponse({
            "success": False,
            "message": "Could not create intervention.",
            "detail": str(ex)
        }, status=500)

    return JsonResponse({
        "success": True,
        "message": "Intervention added successfully!",
        "id": str(intervention.id)
    }, status=201)





@csrf_exempt
@permission_classes([IsAuthenticated])
def get_intervention_detail(request, intervention_id):
    """
    GET /api/interventions/<intervention_id>/
    Returns intervention metadata and feedbacks (if any).
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        intervention = Intervention.objects.get(pk=intervention_id)

        feedbacks = []
        patient_logs = PatientInterventionLogs.objects.filter(
            interventionId=intervention
        )

        for log in patient_logs:
            for entry in log.feedback:
                feedbacks.append(
                    {
                        "date": entry.date.isoformat(),
                        "comment": entry.comment,
                        "rating": entry.rating,
                    }
                )

        data = {
            "title": intervention.title,
            "description": intervention.description,
            "content_type": intervention.content_type,
            "patient_types": [
                {
                    "type": pt.type,
                    "frequency": pt.frequency,
                    "include_option": pt.include_option,
                    "diagnosis": pt.diagnosis,
                }
                for pt in intervention.patient_types
            ],
            "link": intervention.link or "",
            "media_file": intervention.media_file or "",
        }

        return JsonResponse({"recommendation": data, "feedback": feedbacks}, status=200)

    except Intervention.DoesNotExist as e:
        logger.warning(f"[get_intervention_detail] Entity not found: {e}")
        return JsonResponse({"error": "Intervention not found"}, status=404)

    except Exception as e:
        logger.error(
            f"[get_intervention_detail] Unexpected error: {str(e)}", exc_info=True
        )
        return JsonResponse({"error": str(e)}, status=500)


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
            all_diagnoses.extend(
                config["patientInfo"]["function"].get(spec, {}).get("diagnosis", [])
            )

        diagnosis_map = {d: False for d in all_diagnoses}
        all_flag = False

        # Match default recommendation
        default_rec = next(
            (
                r
                for r in therapist.default_recommendations
                if r.recommendation.id == intervention_id
            ),
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
    except Exception as e:
        logger.error(
            f"[list_intervention_diagnoses] Unexpected error: {str(e)}", exc_info=True
        )
        return JsonResponse({"error": str(e)}, status=500)


# views: assign_intervention_to_types

@csrf_exempt
@permission_classes([IsAuthenticated])
def assign_intervention_to_types(request, therapist_id):
    """
    POST /api/interventions/assign-to-patient-types/
    Body:
    {
      "therapistId": "...",
      "patientId": "<Diagnosis>",           # e.g. "Stroke"
      "interventions": [{
        "interventionId": "...",
        "interval": 2,
        "unit": "day",
        "selectedDays": [],
        "start_day": 1,
        "startTime": "08:00",
        "keep_previous": true,
        "end": {"type":"count","count": 120},
        "suggested_execution_time": 20
      }]
    }
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body or "{}")
        therapist = Therapist.objects.get(userId=ObjectId(therapist_id))
        diagnosis = data.get("patientId")
        items = data.get("interventions") or []
        if not diagnosis or not items:
            return JsonResponse({"error": "Missing diagnosis or interventions"}, status=400)

        payload = items[0]
        inter = Intervention.objects.get(id=ObjectId(payload.get("interventionId")))

        # Build a proper DiagnosisAssignmentSettings from payload
        start_day = max(1, _as_int(payload.get("start_day", 1), 1))
        last_day  = max(
            start_day,
            _as_int((payload.get("end") or {}).get("count", start_day), start_day),
        )
        new_block = DiagnosisAssignmentSettings(
            active=True,
            interval=max(1, _as_int(payload.get("interval", 1), 1)),
            unit=(payload.get("unit") or "week"),
            selected_days=payload.get("selectedDays") or [],
            end_type="count",
            count_limit=last_day,             # legacy slot; we still set it
            start_day=start_day,
            end_day=last_day,
            suggested_execution_time=_as_int(payload.get("suggested_execution_time", None), None),
        )
        keep_previous = bool(payload.get("keep_previous", False))

        # Find or create the DefaultInterventions entry for this Intervention
        entry = next(
            (rec for rec in therapist.default_recommendations or []
             if rec.recommendation == inter),
            None
        )
        if not entry:
            entry = DefaultInterventions(recommendation=inter, diagnosis_assignments={})
            therapist.default_recommendations.append(entry)

        # Get existing blocks for this diagnosis (always as list of DiagnosisAssignmentSettings)
        current = entry.diagnosis_assignments.get(diagnosis, [])
        # Coerce any plain dicts (if ever present) into embedded docs
        coerced: list[DiagnosisAssignmentSettings] = []
        for b in current:
            if isinstance(b, DiagnosisAssignmentSettings):
                coerced.append(b)
            elif isinstance(b, dict):
                coerced.append(DiagnosisAssignmentSettings(**b))
            else:
                logger.warning("Skipping unexpected block type in %s: %r", diagnosis, type(b))

        if keep_previous:
            coerced = _clip_before(coerced, start_day)
            coerced.append(new_block)
            # sort by start_day then end_day
            coerced.sort(key=lambda x: (x.start_day or 1, (x.end_day or x.start_day or 1)))
        else:
            coerced = [new_block]

        # ✅ Store exactly a list[DiagnosisAssignmentSettings]
        entry.diagnosis_assignments[diagnosis] = coerced
        therapist.save()

        return JsonResponse({"success": True}, status=201)

    except (Therapist.DoesNotExist, Intervention.DoesNotExist):
        return JsonResponse({"error": "Therapist or intervention not found"}, status=404)
    except Exception as e:
        logger.exception("assign_intervention_to_types failed")
        return JsonResponse({"error": str(e)}, status=500)



@csrf_exempt
@permission_classes([IsAuthenticated])
def remove_intervention_from_types(request, therapist_id):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body or "{}")
        therapist = Therapist.objects.get(userId=ObjectId(therapist_id))
        intervention = Intervention.objects.get(id=ObjectId(data["intervention_id"]))
        diagnosis = data.get("diagnosis")
        start_day = data.get("start_day")  # optional: remove a specific block

        for rec in therapist.default_recommendations:
            if rec.recommendation == intervention and diagnosis in (rec.diagnosis_assignments or {}):
                if start_day is None:
                    del rec.diagnosis_assignments[diagnosis]
                else:
                    blocks = rec.diagnosis_assignments.get(diagnosis) or []
                    rec.diagnosis_assignments[diagnosis] = [b for b in blocks if int(getattr(b, "start_day", 1)) != int(start_day)]
                break

        therapist.save()
        return JsonResponse({"success": True}, status=200)

    except (Therapist.DoesNotExist, Intervention.DoesNotExist) as e:
        return JsonResponse({"error": str(e)}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)



@csrf_exempt
@permission_classes([IsAuthenticated])
def create_patient_group(request):
    """
    POST /api/interventions/add/patientgroup/
    Adds a new diagnosis entry to an intervention's specialization group.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)

        intervention_id = data.get("interventionId")
        diagnosis = data.get("diagnosis")
        spec_type = data.get("speciality")
        frequency = data.get("frequency")

        if not all([intervention_id, diagnosis, spec_type, frequency]):
            return JsonResponse({"error": "Missing required fields"}, status=400)

        intervention = Intervention.objects.get(pk=ObjectId(intervention_id))

        new_entry = PatientType(
            type=spec_type,
            diagnosis=diagnosis,
            frequency=frequency,
            include_option=True,
        )

        if not intervention.patient_types:
            intervention.patient_types = []

        # Avoid duplicates
        for pt in intervention.patient_types:
            if pt["diagnosis"] == diagnosis and pt["type"] == spec_type:
                return JsonResponse(
                    {"success": False, "message": "Diagnosis already exists"},
                    status=400,
                )

        intervention.patient_types.append(new_entry)
        intervention.save()

        return JsonResponse(
            {"success": True, "message": "Diagnosis added successfully"}
        )

    except Intervention.DoesNotExist:
        logger.warning(f"[create_patient_group] Entity not found: {e}")
        return JsonResponse({"error": "Intervention not found"}, status=404)
    except Exception as e:
        logger.error(
            f"[create_patient_group] Unexpected error: {str(e)}", exc_info=True
        )
        return JsonResponse({"success": False, "error": str(e)}, status=500)


# TODO
@csrf_exempt
def update_daily_recomendations(request):
    if request.method == "GET":
        try:
            patients = Patient.objects.get()
            for patient in patients:
                _ = PatientInterventionLogs.get_patient_interventions_with_feedback_and_future_dates(
                    patient
                )

            return JsonResponse({"success": "Done."}, status=200)
        except Exception as e:
            return JsonResponse({"error": "Failed."}, status=400)
