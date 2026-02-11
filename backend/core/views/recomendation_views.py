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
from utils.interventions import (_serialize_intervention_basic, _available_language_variants, _lang_fallback_chain, _pick_best_variant)

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

import re



'''
InterventionMedia(
  kind="external",
  media_type="streaming",
  provider="spotify",
  title="Spotify Playlist",
  url="https://open.spotify.com/playlist/....",
  embed_url="https://open.spotify.com/embed/playlist/...."
)

InterventionMedia(
  kind="external",
  media_type="video",
  provider="youtube",
  title="Video Anleitung",
  url="https://www.youtube.com/watch?v=....",
  embed_url="https://www.youtube.com/embed/...."
)

InterventionMedia(
  kind="file",
  media_type="audio",
  title="Audio Anleitung",
  file_path="interventions/P01/rec_q01.webm",
  mime="audio/webm"
)

InterventionMedia(
  kind="file",
  media_type="pdf",
  title="Infoblatt",
  file_path="interventions/4001_de/info.pdf",
  mime="application/pdf"
)

'''








def spotify_embed(url: str) -> str | None:
    if not url:
        return None
    m = re.search(r"open\.spotify\.com/(track|playlist|album|episode|show)/([A-Za-z0-9]+)", url)
    if not m:
        return None
    typ, sid = m.group(1), m.group(2)
    return f"https://open.spotify.com/embed/{typ}/{sid}"

def youtube_embed(url: str) -> str | None:
    if not url:
        return None
    # supports youtu.be/<id> or youtube.com/watch?v=<id>
    m = re.search(r"(?:youtu\.be/|v=)([A-Za-z0-9_-]{6,})", url)
    if not m:
        return None
    vid = m.group(1)
    return f"https://www.youtube.com/embed/{vid}"

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

    Expected body:
      {
        "patientId": "<_id or username>",
        "diagnosis": "<dx>",
        "effectiveFrom": "YYYY-MM-DD",
        "startTime": "HH:MM",
        "overwrite": false,
        "require_video_feedback": false,
        "notes": ""
      }

    Returns unified error structure:
      {
        "success": false,
        "message": "Validation error.",
        "field_errors": {...},
        "non_field_errors": [...]
      }
    """
    if request.method != "POST":
        return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

    field_errors = {}
    non_field_errors = []

    def add_field_error(field, msg):
        field_errors.setdefault(field, []).append(msg)

    def add_non_field(msg):
        non_field_errors.append(msg)

    try:
        # Try to parse JSON body
        try:
            body = json.loads(request.body or "{}")
        except Exception:
            add_non_field("Invalid JSON body.")
            return JsonResponse(
                {"success": False, "message": "Validation error.", "field_errors": field_errors, "non_field_errors": non_field_errors},
                status=400,
            )

        # -------------------------------
        # Extract & validate inputs
        # -------------------------------
        patient_id = (body.get("patientId") or "").strip()
        diagnosis  = (body.get("diagnosis") or "").strip()
        effective  = (body.get("effectiveFrom") or "").strip()
        start_time = (body.get("startTime") or "08:00").strip()
        overwrite  = bool(body.get("overwrite", False))
        force_video = bool(body.get("require_video_feedback", False))
        notes = (body.get("notes") or "").strip()[:1000]

        # Required fields
        if not patient_id:
            add_field_error("patientId", "patientId is required.")

        if not diagnosis:
            add_field_error("diagnosis", "Diagnosis is required.")

        if not effective:
            add_field_error("effectiveFrom", "Effective date is required.")

        # Stop early if missing required fields
        if field_errors:
            return JsonResponse(
                {"success": False, "message": "Validation error.", "field_errors": field_errors, "non_field_errors": non_field_errors},
                status=400,
            )

        # -------------------------------
        # Validate date
        # -------------------------------
        try:
            eff_date = datetime.fromisoformat(f"{effective}T00:00:00")
        except Exception:
            add_field_error("effectiveFrom", "Invalid date format. Use YYYY-MM-DD.")

        # Validate start time
        try:
            datetime.strptime(start_time, "%H:%M")
        except Exception:
            add_field_error("startTime", "Invalid time format. Use HH:MM.")

        if field_errors:
            return JsonResponse(
                {"success": False, "message": "Validation error.", "field_errors": field_errors, "non_field_errors": non_field_errors},
                status=400,
            )

        # Make tz-aware
        eff_dt = make_aware(eff_date) if is_naive(eff_date) else eff_date

        # -------------------------------
        # Validate therapist
        # -------------------------------
        try:
            therapist = Therapist.objects.get(userId=ObjectId(therapist_id))
        except Exception:
            return JsonResponse(
                {"success": False, "message": "Therapist not found", "field_errors": {}, "non_field_errors": ["Invalid therapistId"]},
                status=404,
            )

        # -------------------------------
        # Patient lookup (supports ID or patient_code/username)
        # -------------------------------
        try:
            if ObjectId.is_valid(patient_id):
                patient = Patient.objects.get(pk=ObjectId(patient_id))
            else:
                patient = Patient.objects.get(patient_code=patient_id)
        except Exception:
            return JsonResponse(
                {"success": False, "message": "Validation error.", "field_errors": {"patientId": ["Patient not found."]}, "non_field_errors": []},
                status=404,
            )

        # -------------------------------
        # Load or create RehabilitationPlan
        # -------------------------------
        plan = RehabilitationPlan.objects(patientId=patient).first()
        if not plan:
            plan = RehabilitationPlan(
                patientId=patient,
                therapistId=therapist,
                startDate=patient.userId.createdAt,
                endDate=patient.reha_end_date,
                status="active",
                interventions=[],
                questionnaires=[],
                createdAt=timezone.now(),
                updatedAt=timezone.now(),
            )

        applied = 0
        total_sessions = 0

        # -------------------------------
        # Iterate therapist template recommendations
        # -------------------------------
        for rec in (therapist.default_recommendations or []):
            inter = rec.recommendation
            dx_map = (rec.diagnosis_assignments or {})
            raw_segments = dx_map.get(diagnosis)

            segments = _normalize_segments(raw_segments)
            if not segments:
                continue

            collected_dates = []

            for seg in segments:
                seg_start = eff_dt + timedelta(days=max(1, seg["start_day"]) - 1)
                seg_end = eff_dt + timedelta(days=max(seg["end_day"], seg["start_day"]) - 1)

                # Generate "end" objects
                if seg["unit"] == "day":
                    count = _occ_count_for_day_range(seg["start_day"], seg["end_day"], seg["interval"])
                    end_obj = {"type": "count", "count": count}
                    max_occ = count
                else:
                    end_obj = {
                        "type": "date",
                        "date": f"{seg_end.date().isoformat()}T23:59:59"
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

            # Normalize
            collected_dates = sorted({ make_aware(d) if is_naive(d) else d for d in collected_dates })

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

        return JsonResponse({"success": True, "applied": applied, "sessions_created": total_sessions}, status=200)

    except Exception as e:
        logger.exception("apply_template_to_patient failed")
        return JsonResponse(
            {"success": False, "message": "Internal Server Error", "field_errors": {}, "non_field_errors": [str(e)]},
            status=500,
        )


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
MAX_FILE_SIZE_BYTES = 400 * 1024 * 1024        # 400 MB
MAX_LIST_ITEMS      = 30
MAX_ITEM_LEN        = 80
ALLOWED_CONTENT_TYPES = set(config["RecomendationInfo"]["types"])


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

# --------------------------------------------------------------------
# MAIN VIEW: add_new_intervention
# --------------------------------------------------------------------

import json
import logging
import os
import mimetypes
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from bson import ObjectId
from mongoengine.queryset.visitor import Q

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Intervention, InterventionMedia, Patient, PatientType
from utils.config import config
from utils.utils import sanitize_text

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = set(config["RecomendationInfo"]["types"])

# Map extensions to storage folders (fallback to "others")
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

MAX_FILE_SIZE_BYTES = 400 * 1024 * 1024  # 400MB
MAX_LIST_ITEMS = 30
MAX_ITEM_LEN = 80

# ---------------------------
# embed helpers (same logic as you posted)
# ---------------------------

def spotify_embed(url: str) -> Optional[str]:
    if not url:
        return None
    m = re.search(r"open\.spotify\.com/(track|playlist|album|episode|show)/([A-Za-z0-9]+)", url)
    if not m:
        return None
    typ, sid = m.group(1), m.group(2)
    return f"https://open.spotify.com/embed/{typ}/{sid}"

def youtube_embed(url: str) -> Optional[str]:
    if not url:
        return None
    m = re.search(r"(?:youtu\.be/|v=)([A-Za-z0-9_-]{6,})", url)
    if not m:
        return None
    vid = m.group(1)
    return f"https://www.youtube.com/embed/{vid}"

def _guess_provider(url: str) -> Optional[str]:
    u = (url or "").lower()
    if "spotify.com" in u:
        return "spotify"
    if "youtube.com" in u or "youtu.be" in u:
        return "youtube"
    if "soundcloud.com" in u:
        return "soundcloud"
    if "vimeo.com" in u:
        return "vimeo"
    return "website"

def _is_valid_url(u: str) -> bool:
    try:
        p = urlparse(u)
        return p.scheme in ("http", "https") and bool(p.netloc)
    except Exception:
        return False

def _safe_title_slug(s: str) -> str:
    return "".join(c for c in (s or "").lower().replace(" ", "_") if c.isalnum() or c in ("_", "-"))[:80] or "intervention"

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

def _abs_media_url(path: str) -> str:
    """
    Convert storage path to absolute URL for frontend.
    Supports:
      - MEDIA_HOST + MEDIA_URL + path (current pattern)
      - or if path already looks like URL, return as is
    """
    if not path:
        return ""
    if path.startswith("http://") or path.startswith("https://"):
        return path
    media_host = getattr(settings, "MEDIA_HOST", "")
    media_url = getattr(settings, "MEDIA_URL", "/media/")
    # ensure clean joining
    return f"{media_host}{media_url.rstrip('/')}/{path.lstrip('/')}"

def _save_file(file_obj, folder: str, title: str) -> str:
    ts = timezone.now().strftime("%Y%m%d_%H%M%S")
    ext = (os.path.splitext(file_obj.name)[1] or "").lower().lstrip(".") or "bin"
    safe_title = _safe_title_slug(title)
    filename = f"{ts}_{safe_title}.{ext}"
    return default_storage.save(f"{folder}/{filename}", file_obj)

def _detect_file_media_type(ext: str, content_type_hint: str = "") -> str:
    e = (ext or "").lower().lstrip(".")
    if e in ("mp3", "wav", "m4a", "ogg", "webm"):
        return "audio"
    if e in ("mp4", "mov", "avi", "mkv", "webm"):
        return "video"
    if e in ("pdf",):
        return "pdf"
    if e in ("png", "jpg", "jpeg", "gif", "webp"):
        return "image"
    # fallback from intervention content type
    hint = (content_type_hint or "").lower()
    if "video" in hint:
        return "video"
    if "audio" in hint:
        return "audio"
    if "image" in hint:
        return "image"
    if "web" in hint:
        return "website"
    if "app" in hint:
        return "app"
    return "text"

def _build_external_media(url: str, title: Optional[str] = None, media_type: Optional[str] = None) -> InterventionMedia:
    prov = _guess_provider(url)
    embed = None
    if prov == "spotify":
        embed = spotify_embed(url)
    elif prov == "youtube":
        embed = youtube_embed(url)

    # If caller didn't specify type, infer.
    mt = media_type
    if not mt:
        if prov == "spotify":
            mt = "streaming"
        elif prov in ("youtube", "vimeo"):
            mt = "video"
        else:
            mt = "website"

    return InterventionMedia(
        kind="external",
        media_type=mt,
        provider=prov,
        title=title,
        url=url,
        embed_url=embed,
    )

def _build_file_media(file_path: str, mime: Optional[str], title: Optional[str], media_type: str) -> InterventionMedia:
    return InterventionMedia(
        kind="file",
        media_type=media_type,
        provider=None,
        title=title,
        file_path=file_path,
        mime=mime,
    )

def _media_key(m: InterventionMedia) -> str:
    return f"{m.kind}|{(m.url or '').strip()}|{(m.file_path or '').strip()}|{(m.media_type or '').strip()}"

# --------------------------------------------------------------------
# UPDATED VIEW: add_new_intervention
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
      - img_file (preview)

    Optional:
      - language (default 'en')
      - external_id (optional)
      - provider (optional)
      - isPrivate + patientId

    Media (NO LEGACY):
      - media: JSON list of objects, each {kind, media_type, title?, url?, embed_url?, provider?, file_path?, mime?}
      - optional upload file in "media_file" (will be appended as kind=file)
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

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
        # ----------- base fields -----------
        title = (request.POST.get("title") or "").strip()
        description = (request.POST.get("description") or "").strip()
        content_type = (request.POST.get("contentType") or "").strip()
        duration = request.POST.get("duration")

        language = (request.POST.get("language") or "en").strip().lower()
        external_id = (request.POST.get("external_id") or "").strip() or None
        provider = (request.POST.get("provider") or "").strip() or None

        # privacy
        is_private = _parse_bool(request.POST.get("isPrivate"), False)
        patient_id = (request.POST.get("patientId") or "").strip() or None

        # arrays
        benefit_for = _parse_str_list(request.POST.get("benefitFor"))
        tags = _parse_str_list(request.POST.get("tagList"))

        # patient types (public only)
        patient_types: List[PatientType] = []
        patient_types_raw = []
        if not is_private:
            try:
                patient_types_raw = json.loads(request.POST.get("patientTypes", "[]") or "[]")
                if not isinstance(patient_types_raw, list):
                    raise ValueError("patientTypes must be a list")
            except Exception:
                return bad("Invalid patientTypes JSON", {"patientTypes": ["Invalid JSON or shape"]})

        # files
        preview_img = request.FILES.get("img_file")
        upload_media_file = request.FILES.get("media_file")  # optional extra file that becomes a media item

        # ----------- validation -----------
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

        if not preview_img:
            field_errors.setdefault("img_file", []).append("Preview image is required.")

        # file size checks
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
        else:
            if not patient_types_raw:
                field_errors.setdefault("patientTypes", []).append("At least one entry is required.")

        # patientTypes validate
        if not is_private:
            for idx, pt in enumerate(patient_types_raw):
                t_ = (pt.get("type") or "").strip()
                d_ = (pt.get("diagnosis") or "").strip()
                f_ = (pt.get("frequency") or "").strip()
                incl = bool(pt.get("includeOption", False))
                if not t_ or not d_ or not f_:
                    field_errors.setdefault(f"patientTypes[{idx}]", []).append(
                        "type, diagnosis and frequency are required."
                    )
                else:
                    patient_types.append(PatientType(type=t_, diagnosis=d_, frequency=f_, include_option=incl))

        if field_errors:
            return bad("Validation error.", field_errors)

        # ----------- parse media JSON (new only) -----------
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
                    mt = (m.get("media_type") or m.get("mediaType") or "").strip()
                    title_m = (m.get("title") or "").strip() or None

                    if kind not in ("external", "file"):
                        field_errors.setdefault(f"media[{i}].kind", []).append("Must be 'external' or 'file'.")
                        continue

                    if mt not in {"audio", "video", "image", "pdf", "website", "app", "streaming", "text"}:
                        field_errors.setdefault(f"media[{i}].media_type", []).append("Invalid media_type.")
                        continue

                    if kind == "external":
                        url = (m.get("url") or "").strip()
                        if not _is_valid_url(url):
                            field_errors.setdefault(f"media[{i}].url", []).append("Invalid URL.")
                            continue
                        media_items.append(_build_external_media(url=url, title=title_m, media_type=mt))

                    else:
                        fp = (m.get("file_path") or m.get("filePath") or "").strip()
                        if not fp:
                            field_errors.setdefault(f"media[{i}].file_path", []).append(
                                "file_path required for kind=file."
                            )
                            continue
                        mime = (m.get("mime") or "").strip() or None
                        media_items.append(_build_file_media(file_path=fp, mime=mime, title=title_m, media_type=mt))

            except Exception:
                field_errors.setdefault("media", []).append("Invalid media JSON.")
                return bad("Validation error.", field_errors)

        # Require at least one media item OR upload_media_file
        # (If you want "Text" interventions to allow no media, uncomment the content_type check.)
        if not media_items and not upload_media_file:
            # if content_type == "Text": pass  # <- optional rule
            field_errors.setdefault("media", []).append(
                "Provide at least one media entry or upload a media file."
            )
            return bad("Validation error.", field_errors)

        # ----------- duplicate checks -----------
        # Title duplicates:
        if is_private and patient_obj:
            dup_title = (
                Intervention.objects(is_private=False, title__iexact=title).first()
                or Intervention.objects(is_private=True, private_patient_id=patient_obj.id, title__iexact=title).first()
            )
        else:
            dup_title = Intervention.objects(is_private=False, title__iexact=title).first()

        if dup_title:
            field_errors.setdefault("title", []).append(
                f"An intervention with this title already exists (ID: {dup_title.id})."
            )

        # External media URL duplicates (check first external url only)
        ext_urls = [m.url for m in media_items if m.kind == "external" and m.url]
        if ext_urls:
            url0 = ext_urls[0]
            if is_private and patient_obj:
                dup_link = Intervention.objects(
                    __raw__={
                        "$and": [
                            {"media": {"$elemMatch": {"kind": "external", "url": url0}}},
                            {
                                "$or": [
                                    {"is_private": False},
                                    {"is_private": True, "private_patient_id": patient_obj.id},
                                ]
                            },
                        ]
                    }
                ).only("id", "title").first()
            else:
                dup_link = Intervention.objects(
                    __raw__={
                        "$and": [
                            {"is_private": False},
                            {"media": {"$elemMatch": {"kind": "external", "url": url0}}},
                        ]
                    }
                ).only("id", "title").first()

            if dup_link:
                field_errors.setdefault("media", []).append(
                    f"This external link is already used by '{dup_link.title}' (ID: {dup_link.id})."
                )

        # external_id+language uniqueness (if provided)
        if external_id:
            dup_ext = Intervention.objects(external_id=external_id, language=language).first()
            if dup_ext:
                field_errors.setdefault("external_id", []).append(
                    f"external_id+language already exists (ID: {dup_ext.id}). Use import/update instead."
                )

        if field_errors:
            return bad("Duplicate intervention detected.", field_errors)

        # ----------- save files -----------
        preview_path = _save_file(preview_img, "images", title)

        # uploaded media_file becomes an additional media item
        if upload_media_file:
            ext = (os.path.splitext(upload_media_file.name)[1] or "").lower().lstrip(".")
            folder = FILE_TYPE_FOLDERS.get(ext, "others")
            saved_media_path = _save_file(upload_media_file, folder, title)
            mime = getattr(upload_media_file, "content_type", None) or mimetypes.guess_type(upload_media_file.name)[0]
            media_type = _detect_file_media_type(ext, content_type)
            media_items.append(
                _build_file_media(file_path=saved_media_path, mime=mime, title=None, media_type=media_type)
            )

        # de-dup media items (by kind/url/path/type)
        merged: List[InterventionMedia] = []
        seen = set()
        for m in media_items:
            k = _media_key(m)
            if k not in seen:
                merged.append(m)
                seen.add(k)

        # ----------- create intervention -----------
        intervention = Intervention(
            external_id=external_id,
            language=language,
            provider=provider,

            title=title,
            description=description,
            duration=dur_int,
            content_type=content_type,

            benefitFor=benefit_for,
            tags=tags,

            media=merged,
            preview_img=preview_path,

            is_private=is_private,
            private_patient_id=patient_obj.id if (is_private and patient_obj) else None,
            patient_types=patient_types if not is_private else [],
        )

        intervention.save()

        return JsonResponse(
            {"success": True, "message": "Intervention created successfully", "id": str(intervention.id)},
            status=201,
        )

    except Exception as e:
        logger.exception("ERROR creating intervention")
        return JsonResponse({"success": False, "error": str(e)}, status=500)




def _serialize_media(m):
    return {
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
        patient_logs = PatientInterventionLogs.objects.filter(interventionId=intervention)

        for log in patient_logs:
            for entry in (log.feedback or []):
                feedbacks.append(
                    {
                        "date": entry.date.isoformat() if getattr(entry, "date", None) else None,
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

            # ✅ no legacy
            "media": [_serialize_media(m) for m in (intervention.media or [])],

            "preview_img": getattr(intervention, "preview_img", "") or "",
            "is_private": bool(getattr(intervention, "is_private", False)),
            "private_patient_id": str(intervention.private_patient_id.id)
            if getattr(intervention, "private_patient_id", None)
            else None,
        }

        return JsonResponse({"recommendation": data, "feedback": feedbacks}, status=200)

    except Intervention.DoesNotExist as e:
        logger.warning(f"[get_intervention_detail] Entity not found: {e}")
        return JsonResponse({"error": "Intervention not found"}, status=404)

    except Exception as e:
        logger.error(f"[get_intervention_detail] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)



@csrf_exempt
@permission_classes([IsAuthenticated])
def list_all_interventions(request, patient_id=None):
    """
    GET /api/interventions/all/(<str:patient_id>/)?
    Returns public interventions and optionally private ones for the patient (listed first).

    ✅ Now includes:
      - external_id, language, provider
      - media[] (with absolute URLs for file_path)
      - legacy link/media_file still present for old FE
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
                out["file_url"] = _abs_media_url(out["file_path"])  # optional convenience
            return out

        def serialize(item):
            return {
                "_id": str(item.pk),
                "external_id": item.external_id,
                "language": item.language,
                "provider": getattr(item, "provider", None),

                "title": item.title,
                "description": item.description,
                "content_type": item.content_type,

                "media": [serialize_media(m) for m in (item.media or [])],

                "preview_img": _abs_media_url(item.preview_img) if item.preview_img else "",
                "duration": item.duration,

                "patient_types": [
                    {
                        "type": pt.type,
                        "frequency": pt.frequency,
                        "include_option": pt.include_option,
                        "diagnosis": pt.diagnosis,
                    }
                    for pt in item.patient_types
                ],
                "is_private": bool(item.is_private),
            }


        serialized_data = [serialize(i) for i in private_interventions] + [serialize(i) for i in public_interventions]
        return JsonResponse(serialized_data, safe=False, status=200)

    except Exception as e:
        logger.error(f"[list_all_interventions] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)


# views: assign_intervention_to_types

@csrf_exempt
@permission_classes([IsAuthenticated])
def assign_intervention_to_types(request, therapist_id):
    """
    POST /api/interventions/assign-to-patient-types/

    Assigns an intervention to a diagnosis with scheduling rules.
    This version includes:
      - Strict validation
      - Detailed field error reporting
      - Safer DB lookups
      - Consistent JSON structure
    """

    # -------------------------------------------
    # Reject non-POST
    # -------------------------------------------
    if request.method != "POST":
        return JsonResponse(
            {"success": False, "message": "Method not allowed"},
            status=405
        )

    field_errors = {}
    non_field_errors = []

    def add_error(field, msg):
        field_errors.setdefault(field, []).append(msg)

    # -------------------------------------------
    # Parse JSON body
    # -------------------------------------------
    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({
            "success": False,
            "message": "Invalid JSON body.",
            "field_errors": {"__root__": ["Malformed JSON"]},
            "non_field_errors": []
        }, status=400)

    # -------------------------------------------
    # Validate therapist_id
    # -------------------------------------------
    try:
        therapist_obj = Therapist.objects.get(userId=ObjectId(therapist_id))
    except Exception:
        return JsonResponse({
            "success": False,
            "message": "Therapist not found or invalid therapist_id."
        }, status=404)

    # -------------------------------------------
    # Required body fields
    # -------------------------------------------
    diagnosis = data.get("patientId")
    interventions_raw = data.get("interventions")

    if not diagnosis:
        add_error("patientId", "This field is required.")

    if not interventions_raw:
        add_error("interventions", "This list cannot be empty.")
    elif not isinstance(interventions_raw, list):
        add_error("interventions", "Must be a list.")

    # Stop early if basic fields already invalid
    if field_errors:
        return JsonResponse({
            "success": False,
            "message": "Validation error",
            "field_errors": field_errors,
            "non_field_errors": non_field_errors
        }, status=400)

    payload = interventions_raw[0]  # You only use first item in list

    # -------------------------------------------
    # Validate interventionId
    # -------------------------------------------
    intervention_id = payload.get("interventionId")
    if not intervention_id:
        add_error("interventions[0].interventionId", "This field is required.")
    else:
        try:
            inter_obj = Intervention.objects.get(id=ObjectId(intervention_id))
        except Exception:
            add_error("interventions[0].interventionId", "Intervention not found or invalid ID.")

    # -------------------------------------------
    # Interval validation
    # -------------------------------------------
    interval = _as_int(payload.get("interval"), None)
    if interval is None:
        add_error("interventions[0].interval", "Must be an integer.")
    elif interval <= 0:
        add_error("interventions[0].interval", "Must be greater than 0.")

    # -------------------------------------------
    # Unit validation
    # -------------------------------------------
    unit = (payload.get("unit") or "").strip().lower()
    allowed_units = {"day", "week", "month"}
    if unit not in allowed_units:
        add_error("interventions[0].unit", f"Invalid unit. Allowed: {', '.join(sorted(allowed_units))}")

    # -------------------------------------------
    # selectedDays validation
    # -------------------------------------------
    selected_days = payload.get("selectedDays", [])
    if selected_days and not isinstance(selected_days, list):
        add_error("interventions[0].selectedDays", "Must be a list.")
    else:
        for i, d in enumerate(selected_days):
            if not isinstance(d, str):
                add_error(f"interventions[0].selectedDays[{i}]", "Must be a string day name.")

    # -------------------------------------------
    # start_day validation
    # -------------------------------------------
    start_day = _as_int(payload.get("start_day"), None)
    if start_day is None:
        add_error("interventions[0].start_day", "Must be an integer.")
    elif start_day < 1:
        add_error("interventions[0].start_day", "Must be >= 1.")

    # -------------------------------------------
    # end block validation
    # -------------------------------------------
    end_block = payload.get("end") or {}
    end_type = end_block.get("type", "count")

    if end_type not in {"count"}:
        add_error("interventions[0].end.type", "Only 'count' is currently supported.")

    count_limit = _as_int(end_block.get("count"), None)
    if count_limit is None:
        add_error("interventions[0].end.count", "Must be an integer.")
    elif count_limit < start_day:
        add_error("interventions[0].end.count", "Must be >= start_day.")

    # -------------------------------------------
    # suggested_execution_time
    # -------------------------------------------
    setime = payload.get("suggested_execution_time")
    if setime is not None:
        parsed = _as_int(setime, None)
        if parsed is None or parsed <= 0:
            add_error("interventions[0].suggested_execution_time", "Must be a positive integer.")

    # -------------------------------------------
    # Stop early if any validation errors
    # -------------------------------------------
    if field_errors:
        return JsonResponse({
            "success": False,
            "message": "Validation error",
            "field_errors": field_errors,
            "non_field_errors": non_field_errors,
        }, status=400)

    # -------------------------------------------
    # Now safe to build block
    # -------------------------------------------
    new_block = DiagnosisAssignmentSettings(
        active=True,
        interval=interval,
        unit=unit,
        selected_days=selected_days or [],
        end_type="count",
        count_limit=count_limit,
        start_day=start_day,
        end_day=count_limit,
        suggested_execution_time=_as_int(payload.get("suggested_execution_time"), None),
    )

    keep_previous = bool(payload.get("keep_previous", False))

    # -------------------------------------------
    # Locate/construct DefaultInterventions entry
    # -------------------------------------------
    entry = next(
        (rec for rec in therapist_obj.default_recommendations or []
         if rec.recommendation == inter_obj),
        None
    )

    if not entry:
        entry = DefaultInterventions(recommendation=inter_obj, diagnosis_assignments={})
        therapist_obj.default_recommendations.append(entry)

    current = entry.diagnosis_assignments.get(diagnosis, [])

    # Coerce dicts → embedded docs if necessary
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

    # Apply "keep previous" rule
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
        return JsonResponse({
            "success": False,
            "message": "Database error: could not update assignments.",
            "detail": str(e),
        }, status=500)

    return JsonResponse({
        "success": True,
        "message": "Intervention assignment saved successfully.",
        "diagnosis": diagnosis,
        "blocks": len(coerced),
    }, status=201)




@csrf_exempt
@permission_classes([IsAuthenticated])
def remove_intervention_from_types(request, therapist_id):
    """
    POST /api/interventions/remove-from-patient-types/

    Removes:
      - all diagnosis assignment blocks for an intervention OR
      - only the block with a specific start_day

    Improvements:
      - strict validation
      - detailed error messages
      - consistent JSON structure
      - safe ObjectId handling
      - safer block removal logic
    """
    # -------------------------------------------
    # Reject non-POST
    # -------------------------------------------
    if request.method != "POST":
        return JsonResponse(
            {"success": False, "message": "Method not allowed"},
            status=405
        )

    field_errors = {}
    non_field_errors = []

    def add_error(field, msg):
        field_errors.setdefault(field, []).append(msg)

    # -------------------------------------------
    # Parse JSON
    # -------------------------------------------
    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({
            "success": False,
            "message": "Invalid JSON body.",
            "field_errors": {"__root__": ["Malformed JSON"]},
            "non_field_errors": []
        }, status=400)

    # -------------------------------------------
    # Validate therapist_id
    # -------------------------------------------
    try:
        therapist_obj = Therapist.objects.get(userId=ObjectId(therapist_id))
    except Exception:
        return JsonResponse({
            "success": False,
            "message": "Therapist not found or invalid therapist_id."
        }, status=404)

    # -------------------------------------------
    # Validate intervention_id
    # -------------------------------------------
    intervention_id = data.get("intervention_id")
    if not intervention_id:
        add_error("intervention_id", "This field is required.")
    else:
        try:
            intervention_obj = Intervention.objects.get(id=ObjectId(intervention_id))
        except Exception:
            add_error("intervention_id", "Intervention not found or invalid ID.")

    # -------------------------------------------
    # Validate diagnosis
    # -------------------------------------------
    diagnosis = data.get("diagnosis")
    if not diagnosis:
        add_error("diagnosis", "This field is required.")

    # -------------------------------------------
    # Validate start_day (optional)
    # -------------------------------------------
    raw_start_day = data.get("start_day")
    start_day = None

    if raw_start_day is not None:
        try:
            start_day = int(raw_start_day)
            if start_day < 1:
                add_error("start_day", "start_day must be >= 1.")
        except Exception:
            add_error("start_day", "start_day must be a valid integer.")

    # -------------------------------------------
    # Stop early if validation errors
    # -------------------------------------------
    if field_errors:
        return JsonResponse({
            "success": False,
            "message": "Validation error",
            "field_errors": field_errors,
            "non_field_errors": non_field_errors
        }, status=400)

    # -------------------------------------------------------------
    # Locate the DefaultInterventions entry for the intervention
    # -------------------------------------------------------------
    entry = None
    for rec in therapist_obj.default_recommendations or []:
        if rec.recommendation == intervention_obj:
            entry = rec
            break

    if not entry:
        return JsonResponse({
            "success": False,
            "message": "No default recommendation entry found for this intervention."
        }, status=404)

    # -------------------------------------------------------------
    # Ensure diagnosis is assigned
    # -------------------------------------------------------------
    diag_map = entry.diagnosis_assignments or {}

    if diagnosis not in diag_map:
        return JsonResponse({
            "success": False,
            "message": "No assignment found for the specified diagnosis."
        }, status=404)

    blocks = diag_map.get(diagnosis) or []

    # Ensure all blocks are valid types
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

    # -------------------------------------------------------------
    # Removal logic
    # -------------------------------------------------------------
    if start_day is None:
        # Remove all blocks for this diagnosis
        del diag_map[diagnosis]
        removed_count = len(cleaned_blocks)
    else:
        # Remove only specific block
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
            return JsonResponse({
                "success": False,
                "message": "No block found with the specified start_day."
            }, status=404)

    entry.diagnosis_assignments = diag_map

    # -------------------------------------------------------------
    # Save therapist
    # -------------------------------------------------------------
    try:
        therapist_obj.save()
    except Exception as e:
        return JsonResponse({
            "success": False,
            "message": "Database error while saving changes.",
            "detail": str(e)
        }, status=500)

    # -------------------------------------------------------------
    # SUCCESS
    # -------------------------------------------------------------
    return JsonResponse({
        "success": True,
        "message": "Intervention assignment removed successfully.",
        "removed_blocks": removed_count,
        "diagnosis": diagnosis
    }, status=200)



@csrf_exempt
@permission_classes([IsAuthenticated])
def create_patient_group(request):
    """
    POST /api/interventions/add/patientgroup/

    Adds a diagnosis entry (PatientType) to an Intervention.
    Now includes:
      - strict validation
      - detailed error messages
      - consistent JSON response structure
      - safe ObjectId checks
      - duplicate protection
    """
    # ---------------------------------------------------
    # Reject unsupported method
    # ---------------------------------------------------
    if request.method != "POST":
        return JsonResponse(
            {"success": False, "message": "Method not allowed"},
            status=405
        )

    field_errors = {}
    non_field_errors = []

    def add_error(field, msg):
        field_errors.setdefault(field, []).append(msg)

    # ---------------------------------------------------
    # Parse JSON body
    # ---------------------------------------------------
    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({
            "success": False,
            "message": "Invalid JSON body.",
            "field_errors": {"__root__": ["Malformed JSON"]},
            "non_field_errors": []
        }, status=400)

    # ---------------------------------------------------
    # Extract & validate required fields
    # ---------------------------------------------------
    intervention_id = data.get("interventionId")
    diagnosis = (data.get("diagnosis") or "").strip()
    spec_type = (data.get("speciality") or "").strip()
    frequency = (data.get("frequency") or "").strip()

    # Validate presence
    if not intervention_id:
        add_error("interventionId", "This field is required.")
    if not diagnosis:
        add_error("diagnosis", "This field is required.")
    if not spec_type:
        add_error("speciality", "This field is required.")
    if not frequency:
        add_error("frequency", "This field is required.")

    # Stop early if required fields missing
    if field_errors:
        return JsonResponse({
            "success": False,
            "message": "Validation error.",
            "field_errors": field_errors,
            "non_field_errors": non_field_errors
        }, status=400)

    # ---------------------------------------------------
    # Validate interventionId as ObjectId
    # ---------------------------------------------------
    try:
        oid = ObjectId(intervention_id)
    except Exception:
        add_error("interventionId", "Invalid ObjectId format.")

    if field_errors:
        return JsonResponse({
            "success": False,
            "message": "Validation error.",
            "field_errors": field_errors,
            "non_field_errors": non_field_errors
        }, status=400)

    # ---------------------------------------------------
    # Fetch intervention safely
    # ---------------------------------------------------
    try:
        intervention_obj = Intervention.objects.get(pk=oid)
    except Intervention.DoesNotExist:
        return JsonResponse({
            "success": False,
            "message": "Intervention not found."
        }, status=404)

    # ---------------------------------------------------
    # Validate field lengths / types
    # ---------------------------------------------------
    if len(spec_type) > 120:
        add_error("speciality", "Too long (max 120 characters).")
    if len(diagnosis) > 120:
        add_error("diagnosis", "Too long (max 120 characters).")
    if len(frequency) > 120:
        add_error("frequency", "Too long (max 120 characters).")

    if field_errors:
        return JsonResponse({
            "success": False,
            "message": "Validation error.",
            "field_errors": field_errors,
            "non_field_errors": non_field_errors
        }, status=400)

    # ---------------------------------------------------
    # Duplicate detection (case-insensitive)
    # ---------------------------------------------------
    existing = intervention_obj.patient_types or []
    for pt in existing:
        existing_diag = (pt.get("diagnosis") or "").strip().lower()
        existing_type = (pt.get("type") or "").strip().lower()

        if existing_diag == diagnosis.lower() and existing_type == spec_type.lower():
            return JsonResponse({
                "success": False,
                "message": "A patient group with this diagnosis & speciality already exists."
            }, status=400)

    # ---------------------------------------------------
    # Construct new patient type entry
    # ---------------------------------------------------
    try:
        new_entry = PatientType(
            type=spec_type,
            diagnosis=diagnosis,
            frequency=frequency,
            include_option=True,
        )
    except Exception as e:
        return JsonResponse({
            "success": False,
            "message": "Failed to create patient group.",
            "detail": str(e)
        }, status=500)

    # ---------------------------------------------------
    # Append & save
    # ---------------------------------------------------
    try:
        if not intervention_obj.patient_types:
            intervention_obj.patient_types = []

        intervention_obj.patient_types.append(new_entry)
        intervention_obj.save()
    except Exception as e:
        logger.error("[create_patient_group] Failed to save intervention", exc_info=True)
        return JsonResponse({
            "success": False,
            "message": "Database error while saving patient group.",
            "detail": str(e)
        }, status=500)

    # ---------------------------------------------------
    # SUCCESS
    # ---------------------------------------------------
    return JsonResponse({
        "success": True,
        "message": "Diagnosis group added successfully."
    }, status=201)


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



