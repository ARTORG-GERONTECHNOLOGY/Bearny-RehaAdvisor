import datetime
import datetime as dt
import json
import logging
import os
import random
import re
import tempfile
from datetime import timedelta
from urllib.parse import urljoin

import speech_recognition as sr
from bson import ObjectId
from django.conf import settings
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.utils import timezone
from django.utils.timezone import now as dj_now
from django.views.decorators.csrf import csrf_exempt
from mongoengine.queryset.visitor import Q
from pydub import AudioSegment
from pydub.utils import which as pd_which
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Logs  # Ensure this includes action, userId, userAgent, details
from core.models import (
    AnswerOption,
    FeedbackEntry,
    FeedbackQuestion,
    FitbitData,
    GeneralFeedback,
    Intervention,
    InterventionAssignment,
    Patient,
    PatientICFRating,
    PatientInterventionLogs,
    PatientVitals,
    RehabilitationPlan,
    Therapist,
    Translation,
    User,
)
from core.views.fitbit_sync import fetch_fitbit_today_for_user
from utils.utils import (
    _adherence,
    convert_to_serializable,
    ensure_aware,
    generate_custom_id,
    generate_repeat_dates,
    get_labels,
    resolve_patient,
    sanitize_text,
    serialize_datetime,
    transcribe_file,
)

logger = logging.getLogger(__name__)  # Fallback to file-based logger if needed

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


FILE_TYPE_FOLDERS = {
    "mp4": "videos",
    "mp3": "audio",
    "jpg": "images",
    "png": "images",
    "pdf": "documents",
}
FFMPEG_OK = bool(pd_which("ffmpeg") and pd_which("ffprobe"))

logger = logging.getLogger(__name__)  # Fallback to file-based logger if needed


@csrf_exempt
@permission_classes([IsAuthenticated])
def submit_patient_feedback(request):
    """
    POST /api/patients/feedback/questionaire/
    Handles submission of patient feedback with optional video/audio input.

    Supports optional 'date' (YYYY-MM-DD) from FE to save feedback to that day (past/today).
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        user_id = request.POST.get("userId")
        intervention_id = request.POST.get("interventionId", None)

        # ✅ NEW: date from frontend (YYYY-MM-DD)
        date_str = request.POST.get("date")  # optional

        if not user_id:
            return JsonResponse({"error": "Missing userId"}, status=400)

        # --- Resolve target day (date-only) ---
        # If FE didn't send it, fallback to "today"
        if date_str:
            try:
                target_day = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
            except Exception:
                return JsonResponse({"error": "Invalid date format. Expected YYYY-MM-DD."}, status=400)
        else:
            target_day = timezone.localdate()

        # create day bounds in local time
        day_start = datetime.datetime.combine(target_day, datetime.time.min)
        day_end = datetime.datetime.combine(target_day, datetime.time.max)

        # make aware if timezone is used
        if timezone.is_naive(day_start):
            day_start = timezone.make_aware(day_start, timezone.get_current_timezone())
        if timezone.is_naive(day_end):
            day_end = timezone.make_aware(day_end, timezone.get_current_timezone())

        recognizer = sr.Recognizer()
        answers = {}

        # =========================
        # FILE answers (audio/video)
        # =========================
        for key, upload in request.FILES.items():
            ct = upload.content_type or ""
            ts = timezone.now().strftime("%Y%m%d%H%M%S")

            # --- Video (unchanged) ---
            if ct.startswith("video/"):
                ext = upload.name.rsplit(".", 1)[-1].lower()
                fname = f"{ts}_{upload.name}"
                path = default_storage.save(f"video_feedback/{fname}", upload)
                url = f"{settings.MEDIA_HOST}{default_storage.url(path)}"
                logger.info(f"[submit_patient_feedback] Saved video to {path}")

                normalized_key = re.sub(r"_(video)$", "", key)
                answers[normalized_key] = {
                    "video_url": url,
                    "uploaded_at": timezone.now(),
                }
                continue

            # --- Audio (robust) ---
            ext = upload.name.rsplit(".", 1)[-1].lower()
            folder = FILE_TYPE_FOLDERS.get(ext, "audio")
            fname = f"{ts}_{upload.name}"
            saved_path = default_storage.save(os.path.join(folder, fname), upload)
            public_url = f"{settings.MEDIA_HOST}{default_storage.url(saved_path)}"
            logger.info(f"[submit_patient_feedback] Saved raw audio to {saved_path}")

            normalized_key = re.sub(r"_(audio|file|voice|recording)$", "", key)

            transcription = ""
            converted_ok = False
            try:
                if ext in {"wav", "flac", "aiff", "aif"}:
                    with default_storage.open(saved_path, "rb") as f:
                        with sr.AudioFile(f) as source:
                            audio_data = recognizer.record(source)
                            transcription = recognizer.recognize_google(audio_data)
                    converted_ok = True
                elif FFMPEG_OK:
                    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp_in:
                        for chunk in default_storage.open(saved_path).chunks():
                            tmp_in.write(chunk)
                        tmp_in_path = tmp_in.name

                    wav_path = tmp_in_path + ".wav"
                    try:
                        AudioSegment.from_file(tmp_in_path).export(wav_path, format="wav")
                        with sr.AudioFile(wav_path) as source:
                            audio_data = recognizer.record(source)
                            transcription = recognizer.recognize_google(audio_data)
                        converted_ok = True
                    except Exception as e:
                        logger.error(
                            "[submit_patient_feedback] ffmpeg/pydub conversion failed for %s: %s",
                            key,
                            e,
                            exc_info=True,
                        )
                    finally:
                        try:
                            os.remove(tmp_in_path)
                        except Exception:
                            pass
                        try:
                            os.remove(wav_path)
                        except Exception:
                            pass
                else:
                    logger.warning(
                        "[submit_patient_feedback] ffmpeg not available; skipping transcription for %s",
                        key,
                    )
            except (ValueError, sr.UnknownValueError, sr.RequestError) as e:
                logger.warning("[submit_patient_feedback] Transcription failed for %s: %s", key, e)

            answers[normalized_key] = {
                "file_path": saved_path,
                "audio_url": public_url,
                "transcription": transcription,
                "converted_ok": converted_ok,
            }

        # =========================
        # Plain-text answers
        # =========================
        for key, val in request.POST.items():
            # ✅ include "date" in skip keys so it doesn't become an answer
            if key in ("userId", "interventionId", "date"):
                continue
            if key not in answers:
                try:
                    answers[key] = json.loads(val)
                except Exception:
                    answers[key] = val

        logger.info(f"[submit_patient_feedback] Collected answers: {answers}")
        if not answers:
            return JsonResponse({"error": "No feedback responses provided"}, status=400)

        # --- Lookup patient ---
        try:
            patient = Patient.objects.get(userId=ObjectId(user_id))
        except Patient.DoesNotExist:
            return JsonResponse({"error": "Patient not found."}, status=404)

        # =========================
        # INTERVENTION feedback path
        # =========================
        if intervention_id:
            intervention = Intervention.objects.filter(id=ObjectId(intervention_id)).first()
            if not intervention:
                return JsonResponse({"error": "Intervention not found."}, status=404)

            plan = RehabilitationPlan.objects(patientId=patient).first()
            if not plan:
                return JsonResponse({"error": "Rehabilitation plan not found."}, status=404)

            # ✅ use target_day bounds, NOT "today"
            log = PatientInterventionLogs.objects(
                userId=patient,
                interventionId=intervention,
                date__gte=day_start,
                date__lte=day_end,
            ).first()

            if not log:
                # ✅ log.date should be within the target day
                log = PatientInterventionLogs(
                    userId=patient,
                    interventionId=intervention,
                    rehabilitationPlanId=plan,
                    date=day_start,  # keep consistent day anchor
                    status=[],
                    feedback=[],
                    comments="",
                )

            for qkey, answer_val in answers.items():
                # keep your special video handling
                if qkey == "video_example" and isinstance(answer_val, dict) and "video_url" in answer_val:
                    log.video_url = answer_val["video_url"]
                    log.video_expired = False
                    log.comments += f"\nVideo uploaded at {answer_val['uploaded_at']:%Y-%m-%d %H:%M}"
                    continue

                qobj = FeedbackQuestion.objects.filter(questionKey=qkey).first()
                if not qobj:
                    logger.warning(
                        "[submit_patient_feedback] No FeedbackQuestion found for key: %s",
                        qkey,
                    )
                    continue

                entry_kwargs = {
                    "questionId": qobj,
                    # ✅ ensure FeedbackEntry.date matches the completed day
                    "date": day_start,
                }

                opts = []
                comment = ""

                if isinstance(answer_val, dict) and ("audio_url" in answer_val or "transcription" in answer_val):
                    text_ans = (answer_val.get("transcription") or "").strip()
                    comment = f"Audio saved at {answer_val.get('file_path')}"

                    # ensure at least one option exists
                    opts = [
                        AnswerOption(
                            key="text",
                            translations=[Translation(language="en", text=text_ans or " ")],
                        )
                    ]
                    entry_kwargs["audio_url"] = answer_val.get("audio_url")

                elif isinstance(answer_val, list):
                    for v in answer_val:
                        opt = next((o for o in qobj.possibleAnswers if o.key == v), None)
                        opts.append(
                            opt
                            if opt
                            else AnswerOption(
                                key=str(v),
                                translations=[Translation(language="en", text=str(v))],
                            )
                        )
                else:
                    v = str(answer_val)
                    opt = next((o for o in qobj.possibleAnswers if o.key == v), None)
                    opts = [opt if opt else AnswerOption(key=v, translations=[Translation(language="en", text=v)])]

                entry_kwargs["answerKey"] = opts
                entry_kwargs["comment"] = comment
                log.feedback.append(FeedbackEntry(**entry_kwargs))

            log.updatedAt = timezone.now()
            log.save()

        # =========================
        # HEALTHSTATUS feedback path
        # =========================
        else:
            for qkey, answer_val in answers.items():
                qobj = FeedbackQuestion.objects.filter(questionKey=qkey, questionSubject="Healthstatus").first()
                if not qobj:
                    continue

                if isinstance(answer_val, dict):
                    text_ans = (answer_val.get("transcription") or "").strip()
                    notes = f"Audio saved at {answer_val.get('file_path')}"
                elif isinstance(answer_val, list):
                    text_ans = answer_val[0].strip() if answer_val else ""
                    notes = ""
                else:
                    text_ans = str(answer_val).strip()
                    notes = ""

                if text_ans.startswith("[") and text_ans.endswith("]"):
                    try:
                        text_ans = json.loads(text_ans)[0]
                    except Exception:
                        text_ans = text_ans.strip("[]").strip("'").strip('"')

                opt_match = next((opt for opt in qobj.possibleAnswers if opt.key == text_ans), None)
                translations = opt_match.translations if opt_match else [Translation(language="en", text=text_ans)]

                entry = FeedbackEntry(
                    questionId=qobj,
                    answerKey=[AnswerOption(key=text_ans, translations=translations)],
                    comment=notes,
                    # ✅ align FeedbackEntry.date to selected day
                    date=day_start,
                )

                rating = PatientICFRating(
                    questionId=qobj,
                    patientId=patient,
                    icfCode=qobj.icfCode,
                    # ✅ align rating date too (important for time-series charts)
                    date=day_start,
                    rating=int(text_ans) if text_ans.isdigit() else None,
                    notes=notes,
                    feedback_entries=[entry],
                )
                rating.save()

        return JsonResponse({"message": "Feedback submitted successfully"}, status=200)

    except Exception as e:
        logger.exception("Unexpected error in submit_patient_feedback")
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def mark_intervention_completed(request):
    """
    POST /api/interventions/complete/
    Body: { patient_id, intervention_id, date?: 'YYYY-MM-DD' }  # date optional; defaults to TODAY (local)
    Ensures only ONE log per (patient, rehab_plan, intervention, day) exists.

    Date storage:
    - Logs are stored with a *naive local* datetime (no UTC conversion).
      Storing UTC midnight of a local day would shift the date backward for
      positive-offset timezones (e.g. UTC+2: local midnight = 22:00 UTC the
      *previous* day), causing an off-by-one-day bug.
    - When the target day matches a scheduled datetime in the rehabilitation
      plan the exact scheduled time is used so back-dated completions align
      with the original session time.
    - Querying uses the naive local day window [00:00, 23:59:59] to remain
      consistent with the stored values.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body or "{}")
        patient_id = data.get("patient_id")
        intervention_id = data.get("intervention_id")
        target_date_str = data.get("date")  # optional YYYY-MM-DD

        if not patient_id or not intervention_id:
            return JsonResponse({"error": "Missing patient_id or intervention_id"}, status=400)

        # Resolve entities
        patient = Patient.objects.get(userId=ObjectId(patient_id))
        intervention = Intervention.objects.get(pk=ObjectId(intervention_id))
        rehab_plan = RehabilitationPlan.objects(patientId=patient).first()
        if not rehab_plan:
            return JsonResponse({"error": "Rehabilitation plan not found for this patient"}, status=404)

        # -----------------------------
        # 1) Resolve target DAY in LOCAL timezone (date-only)
        # -----------------------------
        if target_date_str:
            try:
                target_day = datetime.date.fromisoformat(str(target_date_str))
            except Exception:
                return JsonResponse({"error": "Invalid date. Expected YYYY-MM-DD."}, status=400)
        else:
            target_day = timezone.localdate()

        tz = timezone.get_current_timezone()

        # Naive local day boundaries — no UTC conversion to avoid day-shift.
        day_start = datetime.datetime.combine(target_day, datetime.time.min)
        day_end = datetime.datetime.combine(target_day, datetime.time.max)

        # -----------------------------
        # 2) Determine the log date to store.
        #    Prefer the exact scheduled datetime from the rehabilitation plan
        #    so that back-dated completions preserve the original session time.
        #    Fall back to local midnight of target_day when no scheduled entry
        #    matches (e.g. ad-hoc completion not on the planned calendar).
        # -----------------------------
        log_date = day_start  # default: local midnight of target_day
        for assignment in rehab_plan.interventions:
            if str(assignment.interventionId.pk) == str(intervention.pk):
                for sched_dt in assignment.dates:
                    if not isinstance(sched_dt, datetime.datetime):
                        continue
                    # Normalise to naive local time for date comparison and storage
                    sched_local = (
                        sched_dt.astimezone(tz).replace(tzinfo=None) if sched_dt.tzinfo is not None else sched_dt
                    )
                    if sched_local.date() == target_day:
                        log_date = sched_local
                        break
                break

        # Fetch ALL logs for the naive local day window
        logs_qs = PatientInterventionLogs.objects(
            userId=patient,
            rehabilitationPlanId=rehab_plan,
            interventionId=intervention,
            date__gte=day_start,
            date__lte=day_end,
        ).order_by("-date")

        logs = list(logs_qs)

        if logs:
            keep = logs[0]
            others = logs[1:]

            # merge status unique
            merged_status = list(dict.fromkeys((keep.status or []) + sum([(l.status or []) for l in others], [])))
            keep.status = merged_status

            # merge feedback
            merged_feedback = keep.feedback or []
            for l in others:
                if l.feedback:
                    merged_feedback.extend(l.feedback)
            keep.feedback = merged_feedback

            # delete duplicates
            for l in others:
                try:
                    l.delete()
                except Exception:
                    pass

            # ensure completed
            if "completed" not in (keep.status or []):
                keep.status = (keep.status or []) + ["completed"]

            keep.updatedAt = timezone.now()

            # Normalise stored date to the canonical log_date for this day
            keep.date = log_date

            keep.save()

            Logs(
                userId=patient.userId,
                action="OTHER",
                userAgent="Patient",
                details=f"Marked intervention {intervention.title} as done on {target_day.isoformat()}",
            ).save()

            return JsonResponse({"message": "Marked as completed successfully"}, status=200)

        # No log yet → create ONE canonical log for that day
        log = PatientInterventionLogs(
            userId=patient,
            interventionId=intervention,
            rehabilitationPlanId=rehab_plan,
            date=log_date,  # naive local datetime (scheduled time or midnight)
            status=["completed"],
            feedback=[],
            comments="",
        )
        log.save()

        Logs(
            userId=patient.userId,
            action="OTHER",
            userAgent="Patient",
            details=f"Marked intervention {intervention.title} as done on {target_day.isoformat()}",
        ).save()

        return JsonResponse({"message": "Marked as completed successfully"}, status=200)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Intervention.DoesNotExist:
        return JsonResponse({"error": "Intervention not found"}, status=404)
    except Exception as e:
        logger.error("[mark_intervention_completed] Unexpected error: %s", str(e), exc_info=True)
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def unmark_intervention_completed(request):
    """
    POST /api/interventions/uncomplete/
    Body: { patient_id, intervention_id, date: 'YYYY-MM-DD' }

    Removes 'completed' for that day and also cleans duplicates.

    Uses a naive local day window [00:00, 23:59:59] to find logs, consistent
    with how mark_intervention_completed stores them (no UTC conversion).
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body or "{}")
        patient_id = data.get("patient_id")
        intervention_id = data.get("intervention_id")
        target_date_str = data.get("date")

        if not patient_id or not intervention_id or not target_date_str:
            return JsonResponse(
                {"error": "Missing required fields (patient_id, intervention_id, date)"},
                status=400,
            )

        patient = Patient.objects.get(userId=ObjectId(patient_id))
        intervention = Intervention.objects.get(pk=ObjectId(intervention_id))
        rehab_plan = RehabilitationPlan.objects(patientId=patient).first()
        if not rehab_plan:
            return JsonResponse({"error": "Rehabilitation plan not found for this patient"}, status=404)

        # -----------------------------
        # 1) Parse target DAY (date-only) in local timezone
        # -----------------------------
        try:
            target_day = datetime.date.fromisoformat(str(target_date_str))
        except Exception:
            return JsonResponse({"error": "Invalid date. Expected YYYY-MM-DD."}, status=400)

        # Naive local day boundaries — consistent with mark_intervention_completed storage
        day_start = datetime.datetime.combine(target_day, datetime.time.min)
        day_end = datetime.datetime.combine(target_day, datetime.time.max)

        logs_qs = PatientInterventionLogs.objects(
            userId=patient,
            rehabilitationPlanId=rehab_plan,
            interventionId=intervention,
            date__gte=day_start,
            date__lte=day_end,
        ).order_by("-date")

        logs = list(logs_qs)
        if not logs:
            return JsonResponse({"message": "No completion log for this day"}, status=200)

        # ✅ keep newest, merge others, delete duplicates
        keep = logs[0]
        others = logs[1:]

        merged_status = list(dict.fromkeys((keep.status or []) + sum([(l.status or []) for l in others], [])))
        keep.status = [s for s in merged_status if str(s).lower() != "completed"]

        merged_feedback = keep.feedback or []
        for l in others:
            if l.feedback:
                merged_feedback.extend(l.feedback)
        keep.feedback = merged_feedback

        keep.updatedAt = timezone.now()

        for l in others:
            try:
                l.delete()
            except Exception:
                pass

        # Delete log if nothing remains after uncomplete, else save as-is
        if not keep.status and not keep.feedback:
            keep.delete()
        else:
            keep.save()

        Logs(
            userId=patient.userId,
            action="OTHER",
            userAgent="Patient",
            details=f"Unmarked intervention {intervention.title} as done on {target_day.isoformat()}",
        ).save()

        return JsonResponse({"message": "Unmarked successfully"}, status=200)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Intervention.DoesNotExist:
        return JsonResponse({"error": "Intervention not found"}, status=404)
    except Exception as e:
        logger.error(
            "[unmark_intervention_completed] Unexpected error: %s",
            str(e),
            exc_info=True,
        )
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_recommendations(request, patient_id):
    """
    GET /api/patients/<patient_id>/recommendations/
    Fetches today's assigned interventions for a patient.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        recommendations = PatientIntervention.get_todays_recommendations(patient_id)
        return JsonResponse({"recommendations": recommendations}, safe=False, status=200)

    except Exception as e:
        logger.error(f"[get_patient_recommendations] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({"error": "Internal server error", "details": str(e)}, status=500)


# -----------------------------
# Helpers
# -----------------------------


def _as_str(v, default=""):
    return v if isinstance(v, str) else default


def _as_list(v):
    return v if isinstance(v, list) else []


def _abs_media_url(path_or_url: str) -> str:
    """
    Convert relative media paths into absolute URLs.
    Safely handles:
      - None
      - already-absolute URLs
      - weird types (e.g., BaseList)
    """
    try:
        s = _as_str(path_or_url, "").strip()
        if not s:
            return ""
        if s.startswith("http://") or s.startswith("https://"):
            return s

        # MEDIA_URL might be "/media/" and MEDIA_HOST "https://dev..."
        from django.conf import settings

        base = getattr(settings, "MEDIA_HOST", "").rstrip("/") + "/"
        media_url = getattr(settings, "MEDIA_URL", "/media/").lstrip("/")
        # If the incoming string already contains media_url, don't double it
        if s.startswith(media_url):
            return urljoin(base, s)
        return urljoin(base, f"{media_url.rstrip('/')}/{s.lstrip('/')}")
    except Exception:
        return ""


def _serialize_media_list(intervention) -> list:
    """
    Supports new model: intervention.media is list of dicts/embedded docs
    Also supports legacy: intervention.media_file / intervention.link / intervention.media_url
    """
    try:
        media = getattr(intervention, "media", None)
        out = []

        # New list
        if isinstance(media, list):
            for m in media:
                if not m:
                    continue
                # dict or embedded doc
                kind = getattr(m, "kind", None) if not isinstance(m, dict) else m.get("kind")
                media_type = (
                    getattr(m, "media_type", None)
                    if not isinstance(m, dict)
                    else m.get("media_type") or m.get("mediaType")
                )
                provider = getattr(m, "provider", None) if not isinstance(m, dict) else m.get("provider")
                title = getattr(m, "title", None) if not isinstance(m, dict) else m.get("title")
                url = getattr(m, "url", None) if not isinstance(m, dict) else m.get("url")
                embed_url = (
                    getattr(m, "embed_url", None)
                    if not isinstance(m, dict)
                    else m.get("embed_url") or m.get("embedUrl")
                )
                file_path = (
                    getattr(m, "file_path", None)
                    if not isinstance(m, dict)
                    else m.get("file_path") or m.get("filePath")
                )
                mime = getattr(m, "mime", None) if not isinstance(m, dict) else m.get("mime")
                thumbnail = getattr(m, "thumbnail", None) if not isinstance(m, dict) else m.get("thumbnail")

                row = {
                    "kind": _as_str(kind, ""),
                    "media_type": _as_str(media_type, ""),
                    "provider": (provider if isinstance(provider, str) or provider is None else str(provider)),
                    "title": (title if isinstance(title, str) or title is None else str(title)),
                    "url": (_abs_media_url(url) if isinstance(url, str) else (url or None)),
                    "embed_url": (embed_url if isinstance(embed_url, str) or embed_url is None else str(embed_url)),
                    "file_path": (file_path if isinstance(file_path, str) or file_path is None else str(file_path)),
                    "mime": (mime if isinstance(mime, str) or mime is None else str(mime)),
                    "thumbnail": (_abs_media_url(thumbnail) if isinstance(thumbnail, str) else (thumbnail or None)),
                }
                # keep only meaningful ones
                if row["kind"] or row["url"] or row["file_path"]:
                    out.append(row)

        if out:
            return out

        # Legacy fallbacks
        link = _as_str(getattr(intervention, "link", ""), "").strip()
        media_file = _as_str(getattr(intervention, "media_file", ""), "").strip()
        media_url = _as_str(getattr(intervention, "media_url", ""), "").strip()
        legacy = []

        if link:
            legacy.append(
                {
                    "kind": "external",
                    "media_type": "website",
                    "provider": "website",
                    "title": getattr(intervention, "title", ""),
                    "url": link,
                    "embed_url": None,
                    "file_path": None,
                    "mime": None,
                    "thumbnail": None,
                }
            )
        if media_url:
            legacy.append(
                {
                    "kind": "external",
                    "media_type": "website",
                    "provider": "website",
                    "title": getattr(intervention, "title", ""),
                    "url": _abs_media_url(media_url),
                    "embed_url": None,
                    "file_path": None,
                    "mime": None,
                    "thumbnail": None,
                }
            )
        if media_file:
            legacy.append(
                {
                    "kind": "file",
                    "media_type": "file",
                    "provider": None,
                    "title": getattr(intervention, "title", ""),
                    "url": _abs_media_url(media_file),
                    "embed_url": None,
                    "file_path": media_file,
                    "mime": None,
                    "thumbnail": None,
                }
            )

        return legacy
    except Exception:
        return []


def _serialize_feedback_entry(fb) -> dict | None:
    """
    Serializes FeedbackEntry into FE-friendly format.
    Handles answerKey stored as list[AnswerOption] or list[str] etc.
    """
    try:
        q = getattr(fb, "questionId", None)
        if not q:
            return None

        q_trans = [
            {"language": tr.language, "text": tr.text}
            for tr in (_as_list(getattr(q, "translations", None)))
            if getattr(tr, "language", None) and getattr(tr, "text", None) is not None
        ]

        answers = []
        ak = getattr(fb, "answerKey", None)

        # ak could be list[AnswerOption] or list[str] or single
        if isinstance(ak, list):
            for opt in ak:
                if hasattr(opt, "key"):
                    answers.append(
                        {
                            "key": opt.key,
                            "translations": [
                                {"language": tr.language, "text": tr.text}
                                for tr in (_as_list(getattr(opt, "translations", None)))
                                if getattr(tr, "language", None) and getattr(tr, "text", None) is not None
                            ],
                        }
                    )
                else:
                    answers.append(
                        {
                            "key": str(opt),
                            "translations": [{"language": "en", "text": str(opt)}],
                        }
                    )
        elif ak is not None:
            answers.append({"key": str(ak), "translations": [{"language": "en", "text": str(ak)}]})

        return {
            "question": {"id": str(getattr(q, "id", "")), "translations": q_trans},
            "answer": answers,
            "comment": _as_str(getattr(fb, "comment", ""), ""),
            "audio_url": getattr(fb, "audio_url", None),
            "date": (getattr(fb, "date", None).isoformat() if getattr(fb, "date", None) else None),
        }
    except Exception:
        return None


def _completion_day_keys_from_logs(logs) -> list[str]:
    """
    Return completion dates as local day keys YYYY-MM-DD (stable for UI).

    Handles BOTH aware and naive datetimes:
      - if naive: assume current timezone (Europe/Zurich on your server)
      - then convert to localtime safely
    """
    out = set()
    tz = timezone.get_current_timezone()

    for lg in logs:
        dt = getattr(lg, "date", None)
        st = getattr(lg, "status", None)

        if not isinstance(dt, datetime.datetime):
            continue

        is_completed = False
        if isinstance(st, list):
            is_completed = any(str(x).lower() == "completed" for x in (st or []))
        elif isinstance(st, str):
            is_completed = "completed" in st.lower()

        if not is_completed:
            continue

        # ✅ make safe for localtime()
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, tz)

        out.add(timezone.localtime(dt).date().isoformat())

    return sorted(out)


def _intervention_meta(intervention) -> dict:
    """
    Whitelisted full intervention fields (expand as needed).
    """
    return {
        "_id": str(getattr(intervention, "id", "")),
        "external_id": getattr(intervention, "external_id", None),
        "language": getattr(intervention, "language", None),
        "provider": getattr(intervention, "provider", None),
        "title": _as_str(getattr(intervention, "title", ""), ""),
        "description": _as_str(getattr(intervention, "description", ""), ""),
        "content_type": getattr(intervention, "content_type", None),
        "input_from": getattr(intervention, "input_from", None),
        "original_language": getattr(intervention, "original_language", None),
        "primary_diagnosis": getattr(intervention, "primary_diagnosis", None),
        "aim": getattr(intervention, "aim", None),
        "topic": _as_list(getattr(intervention, "topic", None)),
        "cognitive_level": getattr(intervention, "cognitive_level", None),
        "physical_level": getattr(intervention, "physical_level", None),
        "duration_bucket": getattr(intervention, "duration_bucket", None),
        "sex_specific": getattr(intervention, "sex_specific", None),
        "where": _as_list(getattr(intervention, "where", None)),
        "setting": _as_list(getattr(intervention, "setting", None)),
        "keywords": _as_list(getattr(intervention, "keywords", None)),
        "duration": getattr(intervention, "duration", None),
        "patient_types": _as_list(getattr(intervention, "patient_types", None)),
        "is_private": bool(getattr(intervention, "is_private", False)),
        "private_patient_id": (
            str(getattr(getattr(intervention, "private_patient_id", None), "id", ""))
            if getattr(intervention, "private_patient_id", None)
            else None
        ),
        "preview_img": _abs_media_url(_as_str(getattr(intervention, "preview_img", ""), "")),
        "media": _serialize_media_list(intervention),
    }


# -----------------------------
# Endpoint
# -----------------------------


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_plan(request, patient_id):
    """
    GET /api/patients/rehabilitation-plan/patient/<patient_id>/
    Returns plan interventions including:
      - full intervention metadata
      - assignment fields (dates/notes/frequency/require_video_feedback)
      - completion_dates as YYYY-MM-DD
      - today's feedback entries (same as before)

    Optional query param: ?lang=de  — if supplied, the best available language
    variant of each intervention is returned instead of the stored assignment
    variant, so the frontend can skip LibreTranslate auto-translation.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    ui_lang = (request.GET.get("lang") or "").strip().lower()[:5]

    def _lang_chain(lang: str):
        chain, seen = [], set()
        for l in [lang, "en", "de"]:
            if l and l not in seen:
                chain.append(l)
                seen.add(l)
        return chain or ["en", "de"]

    def _best_variant(base_intervention, lang: str):
        """Return the lang-preferred variant of an intervention, or the original."""
        if not lang:
            return base_intervention
        ext_id = getattr(base_intervention, "external_id", None)
        if not ext_id:
            return base_intervention
        for l in _lang_chain(lang):
            doc = Intervention.objects(external_id=ext_id, language=l).first()
            if doc:
                return doc
        return base_intervention

    try:
        try:
            patient = Patient.objects.get(userId=ObjectId(patient_id))
        except Patient.DoesNotExist:
            patient = Patient.objects.get(id=ObjectId(patient_id))
        rehab_plan = RehabilitationPlan.objects(patientId=patient).first()

        if not rehab_plan:
            return JsonResponse(
                {"rehab_plan": [], "message": "No rehabilitation plan found"},
                status=200,
            )

        today = timezone.localdate()
        out = []

        for assignment in getattr(rehab_plan, "interventions", None) or []:
            assigned_intervention = getattr(assignment, "interventionId", None)
            if not assigned_intervention:
                continue

            # Use the language-preferred variant for title/metadata display, but
            # always look up logs against the originally assigned document so that
            # completion records are not lost when a language variant is swapped in.
            intervention = _best_variant(assigned_intervention, ui_lang) if ui_lang else assigned_intervention

            logs = PatientInterventionLogs.objects(
                userId=patient,
                rehabilitationPlanId=rehab_plan,
                interventionId=assigned_intervention,
            )

            completion_dates = _completion_day_keys_from_logs(logs)

            feedback_data = []
            tz = timezone.get_current_timezone()

            for lg in logs:
                lg_dt = getattr(lg, "date", None)
                if not isinstance(lg_dt, datetime.datetime):
                    continue

                # ✅ localtime() requires aware datetime
                if timezone.is_naive(lg_dt):
                    lg_dt = timezone.make_aware(lg_dt, tz)

                if timezone.localtime(lg_dt).date() != today:
                    continue

                for fb in getattr(lg, "feedback", None) or []:
                    row = _serialize_feedback_entry(fb)
                    if row:
                        row["log_date"] = lg_dt.isoformat()
                        feedback_data.append(row)

            # assignment dates -> keep as iso
            dates_iso = []
            for d in getattr(assignment, "dates", None) or []:
                try:
                    dates_iso.append(d.isoformat())
                except Exception:
                    dates_iso.append(str(d))

            out.append(
                {
                    # ✅ full intervention doc (language-preferred variant for display)
                    "intervention": _intervention_meta(intervention),
                    # intervention_id must stay as the originally assigned variant so
                    # that completion logs posted by the frontend resolve correctly.
                    "intervention_id": str(getattr(assigned_intervention, "id", "")),
                    "intervention_title": _as_str(getattr(intervention, "title", ""), ""),
                    "description": _as_str(getattr(intervention, "description", ""), ""),
                    "content_type": getattr(intervention, "content_type", "") or "",
                    # assignment fields
                    "frequency": _as_str(getattr(assignment, "frequency", ""), ""),
                    "notes": _as_str(getattr(assignment, "notes", ""), ""),
                    "require_video_feedback": bool(getattr(assignment, "require_video_feedback", False)),
                    "dates": dates_iso,
                    # status + feedback
                    "completion_dates": completion_dates,
                    "feedback": feedback_data,
                }
            )

        return JsonResponse(out, safe=False, status=200)

    except Patient.DoesNotExist:
        logger.warning("[get_patient_plan] Patient not found: %s", patient_id)
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Exception as e:
        logger.error(
            "[get_patient_plan] Error for patient %s: %s",
            patient_id,
            str(e),
            exc_info=True,
        )
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def create_patient_intervention_log(request):
    """
    POST /api/patients/intervention-log/
    Creates a patient intervention log entry.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
        patient = Patient.objects.get(id=ObjectId(data.get("patientId")))
        intervention = Intervention.objects.get(id=ObjectId(data.get("interventionId")))

        log = PatientInterventionLogs(
            userId=patient,
            interventionId=intervention,
            rehabilitationPlanId=rehab_plan,
            date=timezone.now(),
            status=["completed"],
            feedback=[],
            comments="",
        )

        log.save()

        return JsonResponse({"message": "Patient Intervention Log created successfully"}, status=201)

    except (Patient.DoesNotExist, Intervention.DoesNotExist) as e:
        logger.warning(f"[create_patient_intervention_log] Entity not found: {e}")
        return JsonResponse({"error": str(e)}, status=404)

    except Exception as e:
        logger.error(
            f"[create_patient_intervention_log] Unexpected error: {str(e)}",
            exc_info=True,
        )
        return JsonResponse({"error": "Internal Server Error"}, status=500)


TYPE_PREFIX_MAP = {
    "articles": "articles_",
    "educational material": "edu_",
    "exercises": "exercises_",
    "audio": "audio_",
    "video": "video_",
    "pdfs": "pdf_",
    "websites": "web_",
    "manuals": "manual_",
    "apps": "app_",
    "games": "game_",
}


def _serialize_questions(qs):
    return [
        {
            "questionKey": q.questionKey,
            "answerType": q.answer_type,
            "translations": [{"language": tr.language, "text": tr.text} for tr in q.translations],
            "possibleAnswers": [
                {
                    "key": opt.key,
                    "translations": [{"language": t2.language, "text": t2.text} for t2 in opt.translations],
                }
                for opt in (q.possibleAnswers or [])
            ],
        }
        for q in qs
    ]


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_feedback_questions(request, questionaire_type, patient_id, intervention_id=None):
    """
    GET /api/patients/get-questions/<questionaire_type>/<patient_id>/
        ?interventionId=<id>

    Returns feedback questions. For "Intervention", if the assignment has
    require_video_feedback=True, appends a video request question.
    """
    logger = logging.getLogger(__name__)

    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    # allow intervention id via query string too
    intervention_id = intervention_id or request.GET.get("interventionId")

    # Resolve patient by userId first, then by Patient._id
    try:
        oid = ObjectId(patient_id)
    except Exception:
        return JsonResponse({"error": "Invalid patient id"}, status=400)

    patient = None
    try:
        patient = Patient.objects.get(userId=oid)
    except Patient.DoesNotExist:
        try:
            patient = Patient.objects.get(pk=oid)
        except Patient.DoesNotExist:
            logger.warning("[get_feedback_questions] Patient not found: %s", patient_id)
            return JsonResponse({"error": "Patient not found."}, status=404)

    # -------------------- HEALTHSTATUS --------------------
    if questionaire_type == "Healthstatus":
        now = timezone.now()

        # 1) Skip if there was any Healthstatus feedback in last 7 days
        seven_days_ago = now - timedelta(days=7)
        recent = (
            PatientICFRating.objects(
                patientId=patient,
                date__gte=seven_days_ago,
                feedback_entries__exists=True,
                feedback_entries__ne=[],
            )
            .only("id")
            .first()
        )
        if recent:
            return JsonResponse({"questions": []})

        # 2) Every ~14 days ask the full "16_profile_*" block
        fourteen_days_ago = now - timedelta(days=14)

        profile_q_ids = [q.id for q in FeedbackQuestion.objects(questionKey__startswith="16_profile_").only("id")]

        profile_recent = (
            PatientICFRating.objects(
                patientId=patient,
                date__gte=fourteen_days_ago,
                feedback_entries__exists=True,
                feedback_entries__ne=[],
                # any entry whose inner questionId is one of the profile block:
                **{"feedback_entries__questionId__in": profile_q_ids},
            )
            .only("id")
            .first()
        )

        if not profile_recent:
            questions_qs = FeedbackQuestion.objects(
                questionSubject="Healthstatus",
                questionKey__startswith="16_profile_",
            )
            serialized = [
                {
                    "questionKey": q.questionKey,
                    "answerType": q.answer_type,
                    "translations": [{"language": tr.language, "text": tr.text} for tr in q.translations],
                    "possibleAnswers": [
                        {
                            "key": opt.key,
                            "translations": [{"language": t2.language, "text": t2.text} for t2 in opt.translations],
                        }
                        for opt in (q.possibleAnswers or [])
                    ],
                }
                for q in questions_qs
            ]
            return JsonResponse({"questions": serialized})

        # 3) Otherwise weekly department-specific selection
        department = (patient.function or [""])[0].strip().lower()

        if department == "cardiology":
            questions_qs = FeedbackQuestion.objects(
                questionSubject="Healthstatus",
                questionKey__startswith="10_heart_failure",
            )
        elif department == "orthopaedics":
            pool = list(
                FeedbackQuestion.objects(
                    questionSubject="Healthstatus",
                    questionKey__startswith="mobility_bank_",
                )
            )
            questions_qs = random.sample(pool, min(6, len(pool)))
        else:
            pool = list(
                FeedbackQuestion.objects(
                    questionSubject="Healthstatus",
                    questionKey__regex=r"^(fatigue|physical_function)_",
                )
            )
            questions_qs = random.sample(pool, min(6, len(pool)))

        serialized = [
            {
                "questionKey": q.questionKey,
                "answerType": q.answer_type,
                "translations": [{"language": tr.language, "text": tr.text} for tr in q.translations],
                "possibleAnswers": [
                    {
                        "key": opt.key,
                        "translations": [{"language": t2.language, "text": t2.text} for t2 in opt.translations],
                    }
                    for opt in (q.possibleAnswers or [])
                ],
            }
            for q in questions_qs
        ]
        return JsonResponse({"questions": serialized})

    # -------------------- INTERVENTION --------------------
    elif questionaire_type == "Intervention":
        # Try to resolve the assignment + intervention type
        assignment = None
        intervention_type = None

        if intervention_id:
            plan = RehabilitationPlan.objects(patientId=patient).first()
            if plan:
                assignment = next(
                    (
                        a
                        for a in (plan.interventions or [])
                        if str(getattr(a.interventionId, "id", a.interventionId)) == str(intervention_id)
                    ),
                    None,
                )
                if assignment and getattr(assignment, "interventionId", None):
                    # normalize to lower for matching
                    raw_type = str(getattr(assignment.interventionId, "content_type", "") or "")
                    intervention_type = raw_type.strip().lower() or None

        # Fallback: if assignment wasn't found or content_type is empty,
        # look up the Intervention document directly (handles library-browse path
        # where the intervention may not be in any rehabilitation plan yet).
        if not intervention_type and intervention_id:
            try:
                fallback_iv = Intervention.objects.get(pk=ObjectId(intervention_id))
                raw_type = str(getattr(fallback_iv, "content_type", "") or "")
                intervention_type = raw_type.strip().lower() or None
            except Exception:
                pass

        # 1) Core questions (apply to all interventions).
        #    We accept two ways to mark "core":
        #       - No applicable_types field
        #       - OR applicable_types explicitly contains "All"
        core_q = FeedbackQuestion.objects(questionSubject="Intervention").filter(
            Q(applicable_types__exists=False) | Q(applicable_types__size=0) | Q(applicable_types__icontains="all")
        )

        # 2) Type-specific questions:
        type_q = []
        if intervention_type:
            # Prefer explicit tagging via applicable_types
            tagged = FeedbackQuestion.objects(
                questionSubject="Intervention",
                applicable_types__icontains=intervention_type,
            )

            # Fallback: prefix convention on questionKey if your DB doesn’t use applicable_types yet
            prefix = TYPE_PREFIX_MAP.get(intervention_type, "")
            prefixed = []
            if prefix:
                prefixed = FeedbackQuestion.objects(questionSubject="Intervention", questionKey__istartswith=prefix)

            # Merge (avoid duplicates by key)
            seen = set()
            merged = []
            for q in list(tagged) + list(prefixed):
                if q.questionKey not in seen:
                    merged.append(q)
                    seen.add(q.questionKey)
            type_q = merged

        # 3) Build final list — type-specific (stars = Frage 1) first, then core (Frage 2 + open)
        result = _serialize_questions(type_q) + _serialize_questions(core_q)

        # 4) Optional: require video feedback per assignment flag
        if assignment and getattr(assignment, "require_video_feedback", False):
            result.append(
                {
                    "questionKey": "video_example",
                    "answerType": "video",
                    "translations": [
                        {
                            "language": "en",
                            "text": "Your therapist requested a video. Recording will start after a 10 s delay—please position your camera.",
                        },
                        {
                            "language": "it",
                            "text": "Il tuo terapista ha richiesto un video. La registrazione inizierà dopo 10 s—posiziona la fotocamera.",
                        },
                        {
                            "language": "de",
                            "text": "Ihr Therapeut hat ein Video angefordert. Die Aufnahme startet nach 10 s—bitte richten Sie die Kamera aus.",
                        },
                        {
                            "language": "fr",
                            "text": "Votre thérapeute a demandé une vidéo. L’enregistrement commencera après 10 s—veuillez placer votre caméra.",
                        },
                    ],
                    "possibleAnswers": [],
                }
            )

        return JsonResponse({"questions": result})

    else:
        return JsonResponse({"error": "Invalid questionnaire type."}, status=400)


# ---------------------------------------------------------------------
# ID helpers
# ---------------------------------------------------------------------
def _as_oid(val):
    """Best-effort ObjectId coercion."""
    try:
        if isinstance(val, ObjectId):
            return val
        if isinstance(val, str) and ObjectId.is_valid(val):
            return ObjectId(val)
        return val
    except Exception:
        return val


def _normalize_intervention_id(raw):
    """
    Accept:
      - "682ad3..."
      - {"_id":"682ad3..."} / {"id":"..."} / {"pk":"..."}
    Return:
      - 24-hex string or None
    """
    if isinstance(raw, dict):
        raw = raw.get("_id") or raw.get("id") or raw.get("pk")
    if isinstance(raw, ObjectId):
        return str(raw)
    if not isinstance(raw, str):
        return None
    raw = raw.strip()
    return raw if ObjectId.is_valid(raw) else None


# ---------------------------------------------------------------------
# date normalization helpers
# ---------------------------------------------------------------------
def _to_iso(dt_or_str):
    """Return ISO string for datetime/str/None."""
    if isinstance(dt_or_str, dt.datetime):
        return dt_or_str.isoformat()
    if isinstance(dt_or_str, str):
        return dt_or_str
    return None


def _parse_iso_maybe(iso):
    """Parse ISO -> datetime (best-effort)."""
    if not iso or not isinstance(iso, str):
        return None
    try:
        s = iso.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return dt.datetime.fromisoformat(s)
    except Exception:
        return None


def _status_for(dt_iso):
    """Guess status for a date (used only if none provided)."""
    d = _parse_iso_maybe(dt_iso)
    now = timezone.now()
    try:
        if d is None:
            return "upcoming"
        # align tz-awareness for comparison
        if timezone.is_aware(now) and d.tzinfo is None:
            d = timezone.make_aware(d, timezone=dt.timezone.utc)
        if timezone.is_naive(now) and d.tzinfo is not None:
            now = now.astimezone(dt.timezone.utc).replace(tzinfo=None)
        return "upcoming" if d > now else "missed"
    except Exception:
        return "upcoming"


def _normalize_dates_list(seq):
    """
    Normalize a sequence of dates into a list of dicts:
      { "datetime": ISO, "status": "...", "feedback": [...] }
    """
    out = []
    for x in seq or []:
        if isinstance(x, dict):
            iso = _to_iso(x.get("datetime"))
            if not iso:
                continue
            status = x.get("status") or _status_for(iso)
            fb = x.get("feedback", [])
            out.append({**x, "datetime": iso, "status": status, "feedback": fb})
        elif isinstance(x, (dt.datetime, str)):
            iso = _to_iso(x)
            if not iso:
                continue
            out.append({"datetime": iso, "status": _status_for(iso), "feedback": []})
        else:
            continue

    try:
        out.sort(key=lambda d: _to_iso(d.get("datetime")) or "")
    except Exception:
        pass
    return out


def _coerce_object_id(maybe):
    """Accept string or dict {'_id'|'id'|'pk': '...'} and return ObjectId or None."""
    try:
        if isinstance(maybe, dict):
            maybe = maybe.get("_id") or maybe.get("id") or maybe.get("pk")
        if isinstance(maybe, ObjectId):
            return maybe
        if isinstance(maybe, str) and ObjectId.is_valid(maybe):
            return ObjectId(maybe)
        return None
    except Exception:
        return None


def _as_datetime(value):
    """
    Accepts datetime/date/ISO string/dict {'datetime': ...}
    Returns tz-aware UTC datetime (seconds precision).
    """
    if isinstance(value, dict):
        value = value.get("datetime") or value.get("date") or value.get("dt") or value

    if isinstance(value, str):
        s = value.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            dtobj = dt.datetime.fromisoformat(s)
        except ValueError:
            # date-only
            d = dt.datetime.strptime(s[:10], "%Y-%m-%d").date()
            dtobj = dt.datetime(d.year, d.month, d.day)

    elif isinstance(value, dt.datetime):
        dtobj = value

    elif isinstance(value, dt.date):
        dtobj = dt.datetime(value.year, value.month, value.day)

    else:
        raise TypeError(f"Unsupported datetime value: {type(value).__name__}")

    # force aware-UTC
    if dtobj.tzinfo is None:
        dtobj = timezone.make_aware(dtobj, dt.timezone.utc)
    else:
        dtobj = dtobj.astimezone(dt.timezone.utc)

    return dtobj.replace(microsecond=0, tzinfo=dt.timezone.utc)


def _strip_to_datetimes(seq):
    """Map a list of mixed items to a list[datetime], dropping unparseable ones."""
    out = []
    for x in seq or []:
        try:
            out.append(_as_datetime(x))
        except Exception:
            continue
    return out


def _merge_dates(existing, incoming, *, return_naive_for_storage=True):
    """
    Merge two date lists. Deduplicate by exact UTC second.
    Sort chronologically.
    Returns (merged_list, added_count).
    """
    ex = [_as_datetime(d) for d in (existing or [])]
    inc = [_as_datetime(d) for d in (incoming or [])]

    seen = set(ex)
    merged = list(ex)
    added = 0
    for n in inc:
        if n not in seen:
            merged.append(n)
            seen.add(n)
            added += 1

    merged.sort()

    if return_naive_for_storage:
        merged = [d.replace(tzinfo=None) for d in merged]

    return merged, added


# ---------------------------------------------------------------------
# endpoint
# ---------------------------------------------------------------------
@csrf_exempt
@permission_classes([IsAuthenticated])
def add_intervention_to_patient(request):
    """
    POST /api/interventions/add-to-patient/
    """
    if request.method != "POST":
        return JsonResponse(
            {
                "success": False,
                "message": "Method not allowed",
                "field_errors": {},
                "non_field_errors": ["Only POST requests allowed."],
            },
            status=405,
        )

    field_errors: dict = {}
    non_field_errors: list = []

    def add_ferr(field, msg):
        field_errors.setdefault(field, []).append(msg)

    def add_nerr(msg):
        non_field_errors.append(msg)

    def normalize_schedule(item: dict):
        """
        Converts React schedule into backend shape:
          selectedDays → selected_days
          startDate → start_date
          end → end_type/end_date/count_limit
        """
        out = dict(item or {})

        if "selectedDays" in out:
            out["selected_days"] = out.pop("selectedDays") or []
        if "startDate" in out:
            out["start_date"] = out.pop("startDate")

        end = out.pop("end", None)
        if isinstance(end, dict):
            out["end_type"] = end.get("type") or "never"
            out["end_date"] = end.get("date")
            out["count_limit"] = end.get("count")
        else:
            out["end_type"] = out.get("end_type") or "never"
            out["end_date"] = out.get("end_date")
            out["count_limit"] = out.get("count_limit")

        return out

    def to_dt(v):
        """ISO str/datetime -> aware datetime (best-effort)."""
        if not v:
            return None
        if isinstance(v, dt.datetime):
            dtx = v
        else:
            try:
                dtx = dt.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
            except Exception:
                return None
        if timezone.is_naive(dtx):
            dtx = make_aware(dtx)
        return dtx

    def lang_fallback_chain(user_lang: str):
        user_lang = (user_lang or "").strip().lower()
        chain = [user_lang, "en", "de"]
        out = []
        seen = set()
        for l in chain:
            if l and l not in seen:
                out.append(l)
                seen.add(l)
        return out or ["en", "de"]

    def pick_best_variant(external_id: str, chain):
        for l in chain:
            doc = Intervention.objects(external_id=external_id, language=l).first()
            if doc:
                return doc
        return Intervention.objects(external_id=external_id).first()

    # ---- Parse JSON ----
    try:
        payload = json.loads(request.body or "{}")
    except Exception:
        return JsonResponse(
            {
                "success": False,
                "message": "Invalid JSON body.",
                "field_errors": {},
                "non_field_errors": ["The request body is not valid JSON."],
            },
            status=400,
        )

    therapistId = payload.get("therapistId")
    patientId = payload.get("patientId")
    items = payload.get("interventions") or []
    request_lang = (payload.get("language") or payload.get("lang") or "").strip().lower()

    if not therapistId:
        add_ferr("therapistId", "Therapist ID is required.")
    if not patientId:
        add_ferr("patientId", "Patient ID is required.")
    if not items:
        add_ferr("interventions", "At least one intervention entry must be provided.")

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

    # ---- Resolve therapist ----
    try:
        therapist = Therapist.objects.get(userId=_coerce_object_id(therapistId) or therapistId)
    except Therapist.DoesNotExist:
        return JsonResponse(
            {
                "success": False,
                "message": "Therapist not found",
                "field_errors": {"therapistId": ["Therapist does not exist."]},
                "non_field_errors": [],
            },
            status=404,
        )

    # ---- Resolve patient (pk first, then userId) ----
    patient_oid = _coerce_object_id(patientId)
    if not patient_oid:
        return JsonResponse(
            {
                "success": False,
                "message": "Patient not found",
                "field_errors": {"patientId": ["Invalid patient id."]},
                "non_field_errors": [],
            },
            status=404,
        )

    try:
        patient = Patient.objects.get(pk=patient_oid)
    except Patient.DoesNotExist:
        try:
            patient = Patient.objects.get(userId=patient_oid)
        except Patient.DoesNotExist:
            return JsonResponse(
                {
                    "success": False,
                    "message": "Patient not found",
                    "field_errors": {"patientId": ["Patient does not exist."]},
                    "non_field_errors": [],
                },
                status=404,
            )

    # ---- Load/create plan ----
    plan = RehabilitationPlan.objects(patientId=patient).first()
    if not plan:
        plan = RehabilitationPlan(
            patientId=patient,
            therapistId=therapist,
            startDate=getattr(patient.userId, "createdAt", timezone.now()),
            # ✅ critical: never leave endDate None
            endDate=patient.study_end_date or patient.reha_end_date or (timezone.now() + timedelta(days=90)),
            status=payload.get("status", "active"),
            interventions=[],
            createdAt=timezone.now(),
            updatedAt=timezone.now(),
        )

    # Use plan end as authoritative fallback (also non-null)
    plan_end = plan.endDate or (timezone.now() + timedelta(days=90))
    if timezone.is_naive(plan_end):
        plan_end = timezone.make_aware(plan_end, timezone.get_current_timezone())
    # If the plan end is in the past, extend to 90 days from now so future
    # sessions can always be scheduled regardless of an outdated reha_end_date.
    if plan_end < timezone.now():
        plan_end = timezone.now() + timedelta(days=90)

    total_added = 0
    created_assignments = 0

    for raw in items:
        item = normalize_schedule(raw)

        # ---- resolve intervention ----
        intervention = None
        external_id = (item.get("externalId") or item.get("external_id") or "").strip()
        chosen_lang = (item.get("language") or item.get("lang") or request_lang or "").strip().lower()

        if external_id:
            intervention = pick_best_variant(external_id, lang_fallback_chain(chosen_lang or "en"))
            if not intervention:
                add_ferr(
                    "externalId",
                    f"No intervention found for external_id={external_id}.",
                )
                continue
        else:
            int_oid = _coerce_object_id(item.get("interventionId"))
            if not int_oid:
                add_ferr("interventionId", "Invalid interventionId.")
                continue
            intervention = Intervention.objects(id=int_oid).first()
            if not intervention:
                add_ferr("interventionId", f"Intervention {str(int_oid)} not found.")
                continue

        # ---- schedule input ----
        schedule_input = {
            "interval": item.get("interval", 1),
            "unit": item.get("unit"),
            "selected_days": item.get("selected_days") or [],
            "end_type": item.get("end_type") or "never",
            "count_limit": item.get("count_limit"),
            "start_date": to_dt(item.get("start_date")),
            "end_date": to_dt(item.get("end_date")),
        }

        # ✅ safe date generation:
        # - never pass None end date
        # - keep `generated` scoped inside try
        try:
            generated = generate_repeat_dates(plan_end, schedule_input)
            dates = _strip_to_datetimes(generated)
        except Exception as e:
            logger.error(
                "[add_intervention_to_patient] Date generation failed for %s: %s",
                str(getattr(intervention, "id", "")),
                str(e),
                exc_info=True,
            )
            add_ferr(
                "interventionId",
                f"Could not generate dates for {str(intervention.id)}.",
            )
            continue

        if not dates:
            logger.info(
                "[add_intervention_to_patient] No valid dates generated for %s",
                str(intervention.id),
            )
            continue

        require_video = bool(item.get("require_video_feedback"))
        note_txt = (item.get("notes") or "").strip()[:1000]

        new_ext = getattr(intervention, "external_id", None)

        existing = next(
            (
                a
                for a in (plan.interventions or [])
                if (new_ext and getattr(getattr(a, "interventionId", None), "external_id", None) == new_ext)
                or (str(getattr(getattr(a, "interventionId", None), "id", "")) == str(intervention.id))
            ),
            None,
        )

        if existing:
            if new_ext and getattr(existing.interventionId, "id", None) != getattr(intervention, "id", None):
                existing.interventionId = intervention

            merged, added_cnt = _merge_dates(existing.dates, dates)
            if added_cnt > 0:
                existing.dates = merged
                existing.require_video_feedback = require_video
                if "notes" in item:
                    existing.notes = note_txt
                total_added += added_cnt
        else:
            assignment = InterventionAssignment(
                interventionId=intervention,
                frequency=item.get("frequency", ""),
                dates=dates,
                notes=note_txt,
                require_video_feedback=require_video,
            )
            plan.interventions.append(assignment)
            created_assignments += 1
            total_added += len(dates)

    if created_assignments == 0 and total_added == 0:
        return JsonResponse(
            {
                "success": True,
                "message": "No new sessions to add for the selected intervention(s).",
                "field_errors": field_errors,
                "non_field_errors": non_field_errors,
            },
            status=200,
        )

    plan.updatedAt = timezone.now()
    plan.save()

    msg = []
    if created_assignments:
        msg.append(f"created {created_assignments} assignment(s)")
    if total_added:
        msg.append(f"added {total_added} session(s)")

    return JsonResponse(
        {
            "success": True,
            "message": "Successfully " + " and ".join(msg) + ".",
            "field_errors": field_errors,
            "non_field_errors": non_field_errors,
        },
        status=201,
    )


# Map your weekday short labels to Python weekday numbers (Mon=0..Sun=6)
WEEKDAY_MAP = {"Mon": 0, "Dien": 1, "Mitt": 2, "Don": 3, "Fre": 4, "Sam": 5, "Son": 6}


def _tz_local():
    return timezone.get_current_timezone()


def _as_aware_local(d: datetime.datetime) -> datetime.datetime:
    """Return tz-aware datetime in local tz."""
    if timezone.is_naive(d):
        return timezone.make_aware(d, _tz_local())
    return d.astimezone(_tz_local())


def _as_aware_utc(d: datetime.datetime) -> datetime.datetime:
    """Return tz-aware datetime in UTC (uses datetime.timezone.utc)."""
    if timezone.is_naive(d):
        return timezone.make_aware(d, datetime.timezone.utc)
    return d.astimezone(datetime.timezone.utc)


def _parse_iso(s: str) -> datetime.datetime:
    """
    Accepts 'YYYY-MM-DD' or full ISO, with/without 'Z' or offset.
    Returns local tz-aware datetime.
    """
    s = (s or "").strip()
    if not s:
        return _as_aware_local(timezone.now())

    if len(s) == 10:
        d = datetime.date.fromisoformat(s)
        naive = datetime.datetime.combine(d, datetime.time.min)
        return _as_aware_local(naive)

    s = s.replace("Z", "+00:00")
    dt = datetime.datetime.fromisoformat(s)
    if timezone.is_naive(dt):
        return _as_aware_local(dt)
    return dt.astimezone(_tz_local())


def _ceil_to_day(dt: datetime.datetime) -> datetime.datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


# English + German short labels
WEEKDAY_MAP = {
    "Mon": 0,
    "Tue": 1,
    "Wed": 2,
    "Thu": 3,
    "Fri": 4,
    "Sat": 5,
    "Sun": 6,
    "M": 0,
    "T": 1,
    "W": 2,
    "Th": 3,
    "F": 4,
    "Sa": 5,
    "Su": 6,
    "Di": 1,
    "Mi": 2,
    "Do": 3,
    "Fr": 4,
    "Sa": 5,
    "So": 6,
}


def _advance_month(dt: datetime.datetime, n: int = 1) -> datetime.datetime:
    y, m = dt.year, dt.month + n
    while m > 12:
        y += 1
        m -= 12
    days_in_month = [
        31,
        29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ][m - 1]
    day = min(dt.day, days_in_month)
    return dt.replace(year=y, month=m, day=day)


# -----------------------------
# Generator
# -----------------------------


def _generate_dates_from(
    schedule: dict,
    effective_from: datetime.datetime,
    plan_end: datetime.datetime,
    max_count: int = 1000,
):
    """
    schedule = {
      'interval': int,
      'unit': 'day'|'week'|'month',
      'startDate': ISO string,
      'startTime': 'HH:mm',
      'selectedDays': ['Mon','Fre',...],   # for week
      'end': {'type':'never'|'date'|'count','date': ISO|null, 'count': int|null}
    }
    Returns list[datetime.datetime] (aware, LOCAL TZ).
    """
    interval = int(schedule.get("interval", 1))
    unit = schedule.get("unit", "week")
    selected_days = schedule.get("selectedDays") or []
    start_iso = schedule.get("startDate")
    start_time = (schedule.get("startTime") or "08:00").strip()
    end_cfg = schedule.get("end") or {"type": "never", "date": None, "count": None}

    base_start = _parse_iso(start_iso) if start_iso else _as_aware_local(timezone.now())
    hh, mm = (int(x) for x in (start_time or "08:00").split(":"))
    base_start = base_start.replace(hour=hh, minute=mm, second=0, microsecond=0)

    effective_from = _as_aware_local(effective_from)
    plan_end = _as_aware_local(plan_end)

    cursor = max(base_start, effective_from)

    hard_stop = plan_end
    if (end_cfg.get("type") == "date") and end_cfg.get("date"):
        hard_stop = min(hard_stop, _parse_iso(str(end_cfg["date"])))

    out = []

    if unit == "day":
        while cursor <= hard_stop:
            out.append(cursor)
            if end_cfg.get("type") == "count" and len(out) >= int(end_cfg.get("count") or 0):
                break
            cursor = cursor + datetime.timedelta(days=interval)

    elif unit == "week":
        cursor_day = _ceil_to_day(cursor)
        count = 0
        while cursor_day <= hard_stop and count < max_count:
            for label in selected_days:
                wd = WEEKDAY_MAP.get(label, None)
                if wd is None:
                    continue
                candidate = cursor_day + datetime.timedelta(days=(wd - cursor_day.weekday()) % 7)
                candidate = candidate.replace(hour=hh, minute=mm, second=0, microsecond=0)
                if candidate >= cursor and candidate <= hard_stop:
                    out.append(candidate)
                    if end_cfg.get("type") == "count" and len(out) >= int(end_cfg.get("count") or 0):
                        return out
            cursor_day = cursor_day + datetime.timedelta(weeks=interval)
            count += 1

    elif unit == "month":
        cur = cursor
        while cur <= hard_stop:
            out.append(cur)
            if end_cfg.get("type") == "count" and len(out) >= int(end_cfg.get("count") or 0):
                break
            cur = _advance_month(cur, interval).replace(hour=hh, minute=mm, second=0, microsecond=0)

    return out


# -----------------------------
# Modify endpoint
# -----------------------------


@csrf_exempt
@permission_classes([IsAuthenticated])
def modify_intervention_from_date(request):
    """
    POST /api/interventions/modify-patient/

    Safe, structured, detailed error handling.
    Always returns:
    {
        "success": false/true,
        "message": "...",
        "field_errors": {...},
        "non_field_errors": [...]
    }
    """
    if request.method != "POST":
        return JsonResponse(
            {
                "success": False,
                "message": "Method not allowed",
                "field_errors": {},
                "non_field_errors": ["Only POST allowed."],
            },
            status=405,
        )

    field_errors = {}
    non_field_errors = []

    def ferr(field, msg):
        field_errors.setdefault(field, []).append(msg)

    def nerr(msg):
        non_field_errors.append(msg)

    # ----------------------
    # Parse JSON safely
    # ----------------------
    try:
        body = json.loads(request.body or "{}")
    except Exception:
        return JsonResponse(
            {
                "success": False,
                "message": "Invalid JSON body.",
                "field_errors": {},
                "non_field_errors": ["Request body is not valid JSON."],
            },
            status=400,
        )

    patient_id = body.get("patientId")
    intervention_id = body.get("interventionId")
    effective_from_raw = body.get("effectiveFrom")
    keep_current = bool(body.get("keep_current", False))
    require_video = bool(body.get("require_video_feedback", False))
    schedule = body.get("schedule")
    notes = body.get("notes")

    # ----------------------
    # Validate required fields
    # ----------------------
    if not patient_id:
        ferr("patientId", "Patient ID is required.")
    if not intervention_id:
        ferr("interventionId", "Intervention ID is required.")
    if not effective_from_raw:
        ferr("effectiveFrom", "Effective-from date is required.")

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

    # ----------------------
    # Resolve Patient
    # ----------------------
    try:
        if isinstance(patient_id, str) and len(patient_id) == 24:
            patient = Patient.objects.get(pk=ObjectId(patient_id))
        else:
            patient = Patient.objects.get(userId=ObjectId(patient_id))
    except Patient.DoesNotExist:
        return JsonResponse(
            {
                "success": False,
                "message": "Patient not found.",
                "field_errors": {"patientId": ["No patient exists with this ID."]},
                "non_field_errors": [],
            },
            status=404,
        )

    # ----------------------
    # Resolve plan
    # ----------------------
    plan = RehabilitationPlan.objects(patientId=patient).first()
    if not plan:
        return JsonResponse(
            {
                "success": False,
                "message": "Rehabilitation plan not found.",
                "field_errors": {},
                "non_field_errors": ["No rehabilitation plan exists for this patient."],
            },
            status=404,
        )

    # ----------------------
    # Find intervention assignment
    # ----------------------
    target = next(
        (a for a in plan.interventions if str(a.interventionId.id) == str(intervention_id)),
        None,
    )

    if not target:
        return JsonResponse(
            {
                "success": False,
                "message": "Intervention assignment not found.",
                "field_errors": {"interventionId": ["This intervention is not assigned to the patient."]},
                "non_field_errors": [],
            },
            status=404,
        )

    # ----------------------
    # Parse effectiveFrom
    # ----------------------
    try:
        eff_dt_local = _parse_iso(str(effective_from_raw))
        eff_dt_utc = eff_dt_local.astimezone(datetime.timezone.utc)
    except Exception:
        return JsonResponse(
            {
                "success": False,
                "message": "Invalid effectiveFrom date.",
                "field_errors": {"effectiveFrom": ["Must be ISO format: YYYY-MM-DD or ISO string."]},
                "non_field_errors": [],
            },
            status=400,
        )

    # ----------------------
    # Update flags always
    # ----------------------
    target.require_video_feedback = require_video
    if notes is not None:
        target.notes = (notes or "").strip()[:1000]

    # ----------------------
    # Split past/future dates
    # ----------------------
    try:
        existing_utc = [_as_aware_utc(d) for d in (target.dates or [])]
    except Exception as e:
        logger.exception("[modify_intervention_from_date] Failed to convert existing UTC dates")
        return JsonResponse(
            {
                "success": False,
                "message": "Internal date conversion error.",
                "field_errors": {},
                "non_field_errors": [str(e)],
            },
            status=500,
        )

    past_utc = [d for d in existing_utc if d < eff_dt_utc]
    future_utc = [d for d in existing_utc if d >= eff_dt_utc]

    # ----------------------
    # If keep_current → only update flags
    # ----------------------
    if keep_current:
        target.dates = past_utc + future_utc
        plan.updatedAt = timezone.now()
        plan.save()

        return JsonResponse(
            {
                "success": True,
                "message": "Updated schedule flags.",
                "updatedCount": len(target.dates),
                "field_errors": {},
                "non_field_errors": [],
            },
            status=200,
        )

    # ----------------------
    # Else: schedule is required
    # ----------------------
    if not schedule:
        return JsonResponse(
            {
                "success": False,
                "message": "schedule is required when keep_current is false",
                "field_errors": {"schedule": ["Must provide a schedule block."]},
                "non_field_errors": [],
            },
            status=400,
        )

    # ----------------------
    # Generate NEW sessions
    # ----------------------
    try:
        plan_end = plan.endDate or (timezone.now() + datetime.timedelta(days=365))
        plan_end_local = _as_aware_local(plan_end)

        new_local = _generate_dates_from(schedule, eff_dt_local, plan_end_local)
        new_utc = [dt.astimezone(datetime.timezone.utc) for dt in new_local]
    except Exception as e:
        logger.exception("[modify_intervention_from_date] Schedule generation failed")
        return JsonResponse(
            {
                "success": False,
                "message": "Failed to generate new schedule.",
                "field_errors": {"schedule": ["Schedule generation failed."]},
                "non_field_errors": [str(e)],
            },
            status=400,
        )

    target.dates = past_utc + new_utc

    plan.updatedAt = timezone.now()
    plan.save()

    return JsonResponse(
        {
            "success": True,
            "message": "Updated schedule.",
            "updatedCount": len(target.dates),
            "field_errors": {},
            "non_field_errors": [],
        },
        status=200,
    )


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_plan_for_therapist(request, patient_id):
    """
    GET /api/patients/rehabilitation-plan/therapist/<patient_id>/
    Retrieves a structured rehabilitation plan for therapist overview.

    Success (200):
    {
        "success": true,
        "startDate": "...",
        "endDate": "...",
        ...
        "interventions": [...]
    }

    No plan (200):
    {
        "success": false,
        "message": "No rehabilitation plan found",
        "rehab_plan": []
    }

    Errors:
    {
        "success": false,
        "error": "...",
        "details": "..."   # only for 5xx / debugging
    }
    """
    if request.method != "GET":
        return JsonResponse(
            {
                "success": False,
                "error": "Method not allowed",
                "message": "This endpoint only supports GET.",
            },
            status=405,
        )

    try:
        patient = resolve_patient(patient_id)
        if not patient:
            logger.warning(
                "[get_patient_plan_for_therapist] Could not resolve patient: %s",
                patient_id,
            )
            return JsonResponse(
                {
                    "success": False,
                    "error": "Patient not found",
                    "message": "No patient could be found for the given identifier.",
                },
                status=404,
            )

        try:
            plan = RehabilitationPlan.objects.get(patientId=patient)
        except RehabilitationPlan.DoesNotExist:
            logger.info(
                "[get_patient_plan_for_therapist] No rehab plan for patient: %s",
                patient_id,
            )
            return JsonResponse(
                {
                    "success": False,
                    "message": "No rehabilitation plan found",
                    "rehab_plan": [],
                },
                status=200,
            )

        # ── Adherence (7d & overall) ─────────────────────────────
        adh_7, adh_total = _adherence(patient)

        today = timezone.now().date()
        plan_data = {
            "success": True,
            "startDate": plan.startDate.isoformat() if plan.startDate else None,
            "endDate": plan.endDate.isoformat() if plan.endDate else None,
            "status": plan.status,
            "createdAt": plan.createdAt.isoformat() if plan.createdAt else None,
            "updatedAt": plan.updatedAt.isoformat() if plan.updatedAt else None,
            "adherence_rate": adh_7,
            "adherence_total": adh_total,
            "interventions": [],
        }

        for assignment in plan.interventions:
            intervention = assignment.interventionId
            logs = PatientInterventionLogs.objects(userId=patient, interventionId=intervention)

            completed_dates = {log.date.date() for log in logs if "completed" in (log.status or [])}

            intervention_dates = []
            completed_count = 0
            current_total_count = 0
            rating_sum = 0
            rating_count = 0

            for date in assignment.dates:
                log = next((l for l in logs if l.date.date() == date.date()), None)

                if log and "completed" in (log.status or []):
                    status = "completed"
                    completed_count += 1
                    current_total_count += 1
                elif date.date() < today:
                    status = "missed"
                    current_total_count += 1
                elif date.date() == today:
                    status = "today"
                else:
                    status = "upcoming"

                feedback_entries = []
                if log and getattr(log, "feedback", None):
                    for fb in log.feedback:
                        if not fb.questionId:
                            continue

                        question_data = {
                            "id": str(fb.questionId.id),
                            "translations": [
                                {"language": tr.language, "text": tr.text} for tr in fb.questionId.translations
                            ],
                        }

                        answer_data = [
                            {
                                "key": opt.key,
                                "translations": [{"language": tr.language, "text": tr.text} for tr in opt.translations],
                            }
                            for opt in (fb.answerKey or [])
                        ]

                        feedback_entries.append(
                            {
                                "question": question_data,
                                "comment": fb.comment,
                                "audio_url": getattr(fb, "audio_url", None),
                                "answer": answer_data,
                            }
                        )

                        # naive numeric rating from first answer key
                        try:
                            rating_sum += int((fb.answerKey or [])[0].key)
                            rating_count += 1
                        except (ValueError, TypeError, IndexError, AttributeError):
                            pass

                # Video feedback if present
                video_feedback = None
                if log and getattr(log, "video_url", None):
                    normalized_url = urljoin(settings.MEDIA_HOST, log.video_url)
                    video_feedback = {
                        "video_url": normalized_url,
                        "video_expired": getattr(log, "video_expired", False),
                        "comment": getattr(log, "comments", "") or "",
                    }

                intervention_dates.append(
                    {
                        "datetime": date.isoformat(),
                        "status": status,
                        "feedback": feedback_entries,
                        **({"video": video_feedback} if video_feedback else {}),
                    }
                )

            plan_data["interventions"].append(
                {
                    "_id": str(intervention.id),
                    "title": intervention.title,
                    "aim": intervention.aim,
                    "frequency": assignment.frequency,
                    "notes": assignment.notes,
                    "dates": intervention_dates,
                    "totalCount": len(assignment.dates),
                    "currentTotalCount": current_total_count,
                    "completedCount": completed_count,
                    "averageRating": (round(rating_sum / rating_count, 1) if rating_count > 0 else 0),
                    "duration": getattr(intervention, "duration", 0),
                }
            )

        return JsonResponse(plan_data, safe=False, status=200)

    except Patient.DoesNotExist:
        logger.warning(
            "[get_patient_plan_for_therapist] Patient.DoesNotExist for id: %s",
            patient_id,
        )
        return JsonResponse(
            {
                "success": False,
                "error": "Patient not found",
                "message": "No patient could be found for the given identifier.",
            },
            status=404,
        )
    except Exception as e:
        logger.error(
            "[get_patient_plan_for_therapist] Unexpected error: %s",
            str(e),
            exc_info=True,
        )
        return JsonResponse(
            {
                "success": False,
                "error": "Internal Server Error",
                "message": "An unexpected error occurred while loading the rehabilitation plan.",
                "details": str(e),
            },
            status=500,
        )


@csrf_exempt
@permission_classes([IsAuthenticated])
def remove_intervention_from_patient(request):
    """
    POST /api/interventions/remove-from-patient/

    Removes all *future* scheduled dates for a specific intervention from a patient's plan.

    Success:
    {
        "success": true,
        "message": "Intervention dates removed successfully."
    }

    Validation / input error:
    {
        "success": false,
        "message": "Missing required parameters",
        "field_errors": { "intervention": "...", "patientId": "..." }
    }

    Server error:
    {
        "success": false,
        "error": "Internal Server Error",
        "message": "An unexpected error occurred.",
        "details": "Exception text"
    }
    """
    if request.method != "POST":
        return JsonResponse(
            {
                "success": False,
                "error": "Method not allowed",
                "message": "This endpoint only supports POST.",
            },
            status=405,
        )

    try:
        data = json.loads(request.body or "{}")
    except Exception:
        return JsonResponse(
            {
                "success": False,
                "message": "Invalid JSON payload.",
                "non_field_errors": ["Could not parse request body."],
            },
            status=400,
        )

    # Extract fields
    intervention_id = data.get("intervention")
    patient_id = data.get("patientId")

    # Validate required parameters
    field_errors = {}

    if not patient_id:
        field_errors["patientId"] = ["This field is required."]

    if not intervention_id:
        field_errors["intervention"] = ["This field is required."]

    if field_errors:
        return JsonResponse(
            {
                "success": False,
                "message": "Missing required parameters.",
                "field_errors": field_errors,
            },
            status=400,
        )

    # Try processing
    try:
        patient = Patient.objects.get(id=ObjectId(patient_id))
    except Patient.DoesNotExist:
        logger.warning("[remove_intervention_from_patient] Patient not found for supplied identifier.")
        return JsonResponse(
            {
                "success": False,
                "message": "Patient not found.",
                "error": "PatientNotFound",
            },
            status=404,
        )

    try:
        plan = RehabilitationPlan.objects.get(patientId=patient)
    except RehabilitationPlan.DoesNotExist:
        logger.warning(
            "[remove_intervention_from_patient] Plan not found for supplied patient identifier."
        )
        return JsonResponse(
            {
                "success": False,
                "message": "Rehabilitation plan not found.",
                "error": "PlanNotFound",
            },
            status=404,
        )

    try:
        now = timezone.now()
        intervention_found = False

        for assignment in plan.interventions:
            if str(assignment.interventionId.pk) == str(intervention_id):
                intervention_found = True
                # Keep only past or today's dates
                assignment.dates = [d for d in assignment.dates if ensure_aware(d) <= now]

        if not intervention_found:
            return JsonResponse(
                {
                    "success": False,
                    "message": "Intervention not assigned to this patient.",
                    "error": "InterventionNotFound",
                },
                status=404,
            )

        # Remove empty assignments
        plan.interventions = [a for a in plan.interventions if a.dates]
        plan.updatedAt = timezone.now()
        plan.save()

        return JsonResponse(
            {
                "success": True,
                "message": "Intervention dates removed successfully.",
            },
            status=200,
        )

    except Exception as e:
        logger.error(
            "[remove_intervention_from_patient] Unexpected error while removing intervention from patient: %s",
            str(e),
            exc_info=True,
        )
        return JsonResponse(
            {
                "success": False,
                "error": "Internal Server Error",
                "message": "An unexpected error occurred.",
                "details": str(e),
            },
            status=500,
        )


@csrf_exempt
@permission_classes([IsAuthenticated])
def initial_patient_questionaire(request, patient_id):
    """
    GET /users/<patient_id>/initial-questionaire/
        → {"success": true, "requires_questionnaire": true|false}

    POST /users/<patient_id>/initial-questionaire/
        → Saves questionnaire
        → Returns success or field_errors
    """

    def error_response(message, status=400, field_errors=None, non_field=None, details=None):
        resp = {
            "success": False,
            "message": message,
        }
        if field_errors:
            resp["field_errors"] = field_errors
        if non_field:
            resp["non_field_errors"] = non_field
        if details:
            resp["details"] = details
        return JsonResponse(resp, status=status)

    # ----------------------------
    # Load patient
    # ----------------------------
    try:
        patient = Patient.objects.get(userId=ObjectId(patient_id))
    except Patient.DoesNotExist:
        logger.warning("[initial_patient_questionaire] Patient not found for provided patient identifier.")
        return error_response("Patient not found.", status=404)

    # ----------------------------
    # GET → check if questionnaire is needed
    # ----------------------------
    if request.method == "GET":
        # If the questionnaire is disabled for this patient, never prompt it
        if not patient.initial_questionnaire_enabled:
            return JsonResponse({"success": True, "requires_questionnaire": False}, status=200)

        missing = not all(
            [
                patient.level_of_education,
                patient.professional_status,
                patient.marital_status,
                patient.lifestyle,
                patient.personal_goals,
            ]
        )

        return JsonResponse({"success": True, "requires_questionnaire": missing}, status=200)

    # ----------------------------
    # POST → submit questionnaire
    # ----------------------------
    if request.method == "POST":
        try:
            data = json.loads(request.body or "{}")
        except Exception as e:
            return error_response(
                "Invalid JSON payload.",
                field_errors=None,
                non_field=["Could not parse JSON."],
                details=str(e),
                status=400,
            )

        required_fields = [
            "level_of_education",
            "professional_status",
            "marital_status",
            "lifestyle",
            "personal_goals",
        ]

        field_errors = {}
        for f in required_fields:
            if not data.get(f):
                field_errors[f] = ["This field is required."]

        if field_errors:
            return error_response(
                "Some required fields are missing.",
                field_errors=field_errors,
                status=400,
            )

        # Save values
        for key in required_fields:
            setattr(patient, key, data.get(key))

        patient.save()

        return JsonResponse(
            {
                "success": True,
                "message": "Initial questionnaire submitted successfully.",
            },
            status=201,
        )

    # ----------------------------
    # Invalid Method
    # ----------------------------
    return JsonResponse(
        {
            "success": False,
            "error": "Method not allowed",
            "message": "This endpoint only supports GET and POST.",
        },
        status=405,
    )


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_healthstatus_history(request, patient_id):
    """
    GET /api/patients/healthstatus-history/<patient_id>/
    Returns all non-intervention (Healthstatus) feedbacks over time.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        patient = Patient.objects.get(userId=ObjectId(patient_id))

        # Fetch all FeedbackQuestions of type "Healthstatus"
        questions = FeedbackQuestion.objects(questionSubject="Healthstatus")

        # Map questionId to metadata
        question_map = {
            str(q.id): {
                "questionKey": q.questionKey,
                "icfCode": q.icfCode,
                "answerType": q.answer_type,
                "translations": [{"language": tr.language, "text": tr.text} for tr in q.translations],
                "answerMap": {
                    opt.key: [{"language": tr.language, "text": tr.text} for tr in opt.translations]
                    for opt in (q.possibleAnswers or [])
                },
            }
            for q in questions
        }

        # Fetch all PatientICFRating entries
        ratings = PatientICFRating.objects(patientId=patient).order_by("date")

        result = []

        for rating in ratings:
            for entry in rating.feedback_entries:
                qid = str(entry.questionId.id) if entry.questionId and hasattr(entry.questionId, "id") else None
                if not qid or qid not in question_map:
                    continue

                qmeta = question_map[qid]
                result.append(
                    {
                        "questionKey": qmeta["questionKey"],
                        "icfCode": qmeta["icfCode"],
                        "date": rating.date.isoformat(),
                        "answers": [
                            {
                                "key": ans.key,
                                "translations": [{"language": t.language, "text": t.text} for t in ans.translations],
                            }
                            for ans in entry.answerKey
                        ],
                        "comment": entry.comment,
                        "questionTranslations": qmeta["translations"],
                        "answerType": qmeta["answerType"],
                    }
                )

        return JsonResponse({"history": result}, safe=False)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)

    except Exception as e:
        logger.error(f"[get_patient_healthstatus_history] {str(e)}", exc_info=True)
        return JsonResponse({"error": "Internal Server Error"}, status=500)


def _iso(dt):
    """Return ISO 8601 string for dt or None."""
    if dt is None:
        return None
    # support both date and datetime
    if isinstance(dt, datetime.date) and not isinstance(dt, datetime.datetime):
        return datetime.datetime(dt.year, dt.month, dt.day, tzinfo=datetime.timezone.utc).isoformat()
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, datetime.timezone.utc)
    return dt.isoformat()


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_combined_health_data(request, patient_id):
    try:
        if not patient_id or patient_id == "null":
            return JsonResponse({"error": "Invalid patient ID"}, status=400)

        # resolve patient by pk or userId
        try:
            patient = Patient.objects.get(pk=patient_id)
        except Exception:
            patient = Patient.objects.get(userId=ObjectId(patient_id))

        # ---------- date window ----------
        from_str = request.GET.get("from")
        to_str = request.GET.get("to")

        if from_str and to_str:
            from_date = datetime.datetime.strptime(from_str, "%Y-%m-%d")
            to_date = datetime.datetime.strptime(to_str, "%Y-%m-%d")
        else:
            to_date = timezone.now()
            from_date = to_date - datetime.timedelta(days=30)

        # normalize to full days (aware)
        from_datetime = (
            timezone.make_aware(
                datetime.datetime.combine(from_date.date(), datetime.time.min),
                datetime.timezone.utc,
            )
            if timezone.is_naive(from_date)
            else datetime.datetime.combine(from_date.date(), datetime.time.min).replace(tzinfo=from_date.tzinfo)
        )

        to_datetime = (
            timezone.make_aware(
                datetime.datetime.combine(to_date.date(), datetime.time.max),
                datetime.timezone.utc,
            )
            if timezone.is_naive(to_date)
            else datetime.datetime.combine(to_date.date(), datetime.time.max).replace(tzinfo=to_date.tzinfo)
        )

        # ---------- 1) Fitbit + Manual vitals merge ----------
        fitbit_entries = FitbitData.objects(user=patient.userId, date__gte=from_date, date__lte=to_date).order_by(
            "date"
        )

        # manual vitals in the same window (keep latest per day)
        vitals = PatientVitals.objects(patientId=patient, date__gte=from_datetime, date__lte=to_datetime).order_by(
            "date"
        )

        manual_by_day: dict[datetime.date, PatientVitals] = {}
        for v in vitals:
            day = v.date.date()
            if day not in manual_by_day or v.date > manual_by_day[day].date:
                manual_by_day[day] = v

        fitbit_data = []
        # existing Fitbit days
        for entry in fitbit_entries:
            day = entry.date.date()
            man = manual_by_day.get(day)

            weight_val = man.weight_kg if (man and man.weight_kg is not None) else getattr(entry, "weight", None)

            bp_obj = None
            if man and (man.bp_sys is not None or man.bp_dia is not None):
                bp_obj = {
                    "systolic": man.bp_sys,
                    "diastolic": man.bp_dia,
                    "source": "manual",
                }
            else:
                fb_bp = getattr(entry, "blood_pressure", None)
                if fb_bp:
                    bp_obj = {
                        "systolic": getattr(fb_bp, "systolic", None),
                        "diastolic": getattr(fb_bp, "diastolic", None),
                        "source": "fitbit",
                    }

            # map HR zones and sleep to plain dicts
            zones = [
                {
                    "name": z.name,
                    "minutes": z.minutes,
                    "caloriesOut": z.caloriesOut,
                    "min": z.min,
                    "max": z.max,
                }
                for z in (entry.heart_rate_zones or [])
            ]

            if entry.sleep:
                # if sleep start/end are datetimes, convert to strings
                sleep_start = getattr(entry.sleep, "sleep_start", None)
                sleep_end = getattr(entry.sleep, "sleep_end", None)
                sleep_obj = {
                    "sleep_duration": getattr(entry.sleep, "sleep_duration", None),
                    "sleep_start": (
                        _iso(sleep_start)
                        if isinstance(sleep_start, (datetime.datetime, datetime.date))
                        else sleep_start
                    ),
                    "sleep_end": (
                        _iso(sleep_end) if isinstance(sleep_end, (datetime.datetime, datetime.date)) else sleep_end
                    ),
                    "awakenings": getattr(entry.sleep, "awakenings", None),
                }
            else:
                sleep_obj = None

            fitbit_data.append(
                {
                    "date": entry.date.strftime("%Y-%m-%d"),
                    "steps": entry.steps,
                    "resting_heart_rate": entry.resting_heart_rate,
                    "floors": entry.floors,
                    "distance": entry.distance,
                    "calories": entry.calories,
                    "active_minutes": entry.active_minutes,
                    "heart_rate_zones": zones,
                    "sleep": sleep_obj,
                    "breathing_rate": entry.breathing_rate,
                    "hrv": entry.hrv,
                    "exercise": entry.exercise,
                    # unified vitals
                    "weight": weight_val,
                    "blood_pressure": bp_obj,
                    # 🔥 ADD THESE FIELDS (frontend needs them)
                    "weight_kg": weight_val,
                    "bp_sys": bp_obj["systolic"] if bp_obj else None,
                    "bp_dia": bp_obj["diastolic"] if bp_obj else None,
                }
            )

        fitbit_days = {datetime.datetime.strptime(r["date"], "%Y-%m-%d").date() for r in fitbit_data}

        # add manual-only days (no Fitbit row that day)
        for day, man in manual_by_day.items():
            if day in fitbit_days:
                continue
            fitbit_data.append(
                {
                    "date": day.strftime("%Y-%m-%d"),
                    "steps": None,
                    "resting_heart_rate": None,
                    "floors": None,
                    "distance": None,
                    "calories": None,
                    "active_minutes": None,
                    "heart_rate_zones": [],
                    "sleep": None,
                    "breathing_rate": None,
                    "hrv": None,
                    "exercise": None,
                    "weight": man.weight_kg,
                    "blood_pressure": (
                        {
                            "systolic": man.bp_sys,
                            "diastolic": man.bp_dia,
                            "source": "manual",
                        }
                        if (man.bp_sys is not None or man.bp_dia is not None)
                        else None
                    ),
                }
            )

        fitbit_data.sort(key=lambda r: r["date"])

        # ---------- 2) Questionnaire ----------
        questions = FeedbackQuestion.objects(questionSubject="Healthstatus")
        question_map = {
            str(q.id): {
                "questionKey": q.questionKey,
                "icfCode": q.icfCode,
                "answerType": q.answer_type,
                "translations": [{"language": tr.language, "text": tr.text} for tr in q.translations],
                "answerMap": {
                    opt.key: [{"language": tr.language, "text": tr.text} for tr in opt.translations]
                    for opt in (q.possibleAnswers or [])
                },
            }
            for q in questions
        }

        feedback_result = []
        ratings = PatientICFRating.objects(patientId=patient, date__gte=from_date, date__lte=to_date).order_by("date")

        for rating in ratings:
            for ent in rating.feedback_entries:
                if not getattr(ent, "questionId", None):
                    continue
                try:
                    qid = str(ent.questionId.id)
                except Exception:
                    continue
                if qid not in question_map:
                    continue

                parsed_answers = [
                    {
                        "key": ans.key,
                        "translations": [{"language": t.language, "text": t.text} for t in ans.translations],
                    }
                    for ans in (ent.answerKey or [])
                ]

                qmeta = question_map[qid]
                feedback_result.append(
                    {
                        "questionKey": qmeta["questionKey"],
                        "icfCode": qmeta["icfCode"],
                        "date": _iso(rating.date),
                        "answers": parsed_answers,
                        "comment": ent.comment,
                        "questionTranslations": qmeta["translations"],
                        "answerType": qmeta["answerType"],
                    }
                )

        # ---------- 3) Adherence (daily) ----------
        adherence = []
        try:
            plan = RehabilitationPlan.objects(patientId=patient).first()
        except Exception:
            plan = None

        # buckets for scheduled/completed
        scheduled_by_day: dict[datetime.date, int] = {}
        if plan:
            for ia in getattr(plan, "interventions", []) or []:
                for d in getattr(ia, "dates", []) or []:
                    # convert each date to a timezone-aware datetime if possible
                    dt = None
                    if isinstance(d, datetime.datetime):
                        dt = d
                    else:
                        # robust parse for mongo Date/str
                        try:
                            dt = datetime.datetime.fromisoformat(str(d))
                        except Exception:
                            # last resort: treat as date
                            try:
                                dt = datetime.datetime.combine(d, datetime.time.min)
                            except Exception:
                                continue
                    if timezone.is_naive(dt):
                        dt = timezone.make_aware(dt, datetime.timezone.utc)
                    if from_datetime <= dt <= to_datetime:
                        day = dt.date()
                        scheduled_by_day[day] = scheduled_by_day.get(day, 0) + 1

        completed_by_day: dict[datetime.date, int] = {}
        logs = PatientInterventionLogs.objects(userId=patient, date__gte=from_datetime, date__lte=to_datetime)
        for lg in logs:
            dt = getattr(lg, "date", None)
            if not isinstance(dt, datetime.datetime):
                continue
            status = getattr(lg, "status", "")
            is_completed = False
            if isinstance(status, str):
                is_completed = "completed" in status.lower()
            elif isinstance(status, (list, tuple)):
                is_completed = any("completed" in str(s).lower() for s in status)
            if is_completed:
                day = dt.date()
                completed_by_day[day] = completed_by_day.get(day, 0) + 1

        day = from_datetime.date()
        end_day = to_datetime.date()
        while day <= end_day:
            s = scheduled_by_day.get(day, 0)
            c = completed_by_day.get(day, 0)
            pct = round(100 * c / s) if s > 0 else None
            adherence.append(
                {
                    "date": day.strftime("%Y-%m-%d"),
                    "scheduled": int(s),
                    "completed": int(c),
                    "pct": pct,
                }
            )
            day += datetime.timedelta(days=1)

        # ---------- response ----------
        return JsonResponse(
            {
                "fitbit": fitbit_data,
                "questionnaire": feedback_result,
                "adherence": adherence,
            },
            safe=False,
        )

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Exception as e:
        # ensure you have `logger` defined; otherwise replace with print
        logger.error(f"[get_combined_health_data] {str(e)}", exc_info=True)
        return JsonResponse({"error": "Internal Server Error"}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def add_manual_vitals(request, patient_id: str):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    # Resolve patient
    try:
        try:
            patient = Patient.objects.get(pk=patient_id)
        except Exception:
            patient = Patient.objects.get(userId=ObjectId(patient_id))
    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)

    # Parse JSON
    try:
        body = json.loads(request.body or "{}")
    except Exception:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    # Parse date
    when_str = body.get("date")
    if when_str:
        try:
            dt = datetime.datetime.fromisoformat(when_str.replace("Z", "+00:00"))
        except Exception:
            return JsonResponse({"error": "Invalid 'date' (use ISO 8601)."}, status=400)
    else:
        dt = timezone.now()

    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.utc)

    # Validate numeric input
    def as_float(x):
        try:
            return float(x) if x is not None else None
        except:
            return None

    weight_kg = as_float(body.get("weight_kg"))
    bp_sys = as_float(body.get("bp_sys"))
    bp_dia = as_float(body.get("bp_dia"))

    if weight_kg is None and bp_sys is None and bp_dia is None:
        return JsonResponse({"error": "No vitals provided"}, status=400)

    # Upsert for same day
    day_start = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = dt.replace(hour=23, minute=59, second=59, microsecond=999999)

    rec = PatientVitals.objects(patientId=patient, date__gte=day_start, date__lte=day_end).first()

    if not rec:
        rec = PatientVitals(user=patient.userId, patientId=patient, date=dt)

    # Save into actual fields
    if weight_kg is not None:
        rec.weight_kg = weight_kg

    if bp_sys is not None:
        rec.bp_sys = int(bp_sys)

    if bp_dia is not None:
        rec.bp_dia = int(bp_dia)

    rec.save()

    try:
        fields = []
        if weight_kg is not None:
            fields.append(f"weight_kg={weight_kg}")
        if bp_sys is not None:
            fields.append(f"bp_sys={bp_sys}")
        if bp_dia is not None:
            fields.append(f"bp_dia={bp_dia}")
        Logs.objects.create(
            userId=patient.userId,
            action="VITALS_SUBMIT",
            userAgent=(request.headers.get("User-Agent", "") or "")[:20],
            patient=patient,
            details=", ".join(fields),
        )
    except Exception:
        pass

    return JsonResponse({"ok": True, "id": str(rec.id), "date": dt.isoformat()}, status=200)


def _resolve_patient(patient_id: str) -> Patient:
    """
    Try to resolve Patient by primary key first; if that fails, by userId (ObjectId).
    """
    try:
        return Patient.objects.get(pk=patient_id)
    except Exception:
        try:
            return Patient.objects.get(userId=ObjectId(patient_id))
        except Exception:
            raise Patient.DoesNotExist()


def _parse_day(date_str: str) -> tuple[datetime, datetime, datetime]:
    """
    YYYY-MM-DD -> (date_only, day_start_aware, day_end_aware)
    """
    d = datetime.strptime(date_str, "%Y-%m-%d")
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(d.date(), time.min), tz)
    end = timezone.make_aware(datetime.combine(d.date(), time.max), tz)
    return d, start, end


def _has_weight(row) -> bool:
    # Support several shapes/names
    for attr in ("weight_kg", "weightKg", "weight", "body_weight"):
        if hasattr(row, attr) and getattr(row, attr) is not None:
            return True
    w = getattr(row, "weight", None)
    if isinstance(w, dict) and (w.get("kg") is not None or w.get("value") is not None):
        return True
    return False


def _has_bp(row) -> bool:
    # Nested document or dict on row.blood_pressure
    bp = getattr(row, "blood_pressure", None)
    if bp is not None:
        try:
            s = getattr(bp, "systolic", None)
            d = getattr(bp, "diastolic", None)
        except Exception:
            s = bp.get("systolic") if isinstance(bp, dict) else None
            d = bp.get("diastolic") if isinstance(bp, dict) else None
        if s is not None or d is not None:
            return True
    # Flat fields as fallback
    if getattr(row, "bp_sys", None) is not None or getattr(row, "bp_dia", None) is not None:
        return True
    return False


def _parse_date_forgiving(s: str | None) -> datetime.date | None:
    """Accept 'YYYY-MM-DD', 'YYYY-MM-DDTHH:MM[:SS][Z]', or 'YYYY/MM/DD' (with spaces)."""
    if not s:
        return None
    s = s.strip()
    # Fast path: ISO date at the start of the string
    head10 = s[:10]
    try:
        return datetime.date.fromisoformat(head10)
    except Exception:
        pass
    # Try with slashes or single-digit month/day
    m = re.match(r"^\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})", s)
    if m:
        y, mo, d = map(int, m.groups())
        try:
            return datetime.date(y, mo, d)
        except ValueError:
            return None
    return None


def _resolve_patient(patient_id: str):
    """Try Patient.pk first; then Patient.userId."""
    try:
        return Patient.objects.get(pk=patient_id)
    except Exception:
        try:
            return Patient.objects.get(userId=ObjectId(patient_id))
        except Exception:
            return None


@csrf_exempt
@permission_classes([IsAuthenticated])
def vitals_exists_for_day(request, patient_id: str):
    """
    GET /api/patients/vitals/exists/<patient_id>/?date=YYYY-MM-DD
    Returns {"exists": true|false}
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    day = _parse_date_forgiving(request.GET.get("date"))
    if not isinstance(day, datetime.date):
        return JsonResponse({"error": "Invalid 'date'. Expected YYYY-MM-DD."}, status=400)

    patient = _resolve_patient(patient_id)
    if not patient:
        return JsonResponse({"error": "Patient not found"}, status=404)

    # Day window (naive datetimes, consistent with your MongoEngine usage)
    start_dt = datetime.datetime.combine(day, datetime.time.min)
    end_dt = datetime.datetime.combine(day, datetime.time.max)

    exists = False

    # 1) If you have a dedicated PatientVitals model, prefer that
    try:
        from core.models import PatientVitals  # optional

        pv = PatientVitals.objects(patientId=patient, date__gte=start_dt, date__lte=end_dt).only("id").first()
        if pv:
            exists = True
    except Exception:
        # 2) Fallback: store/check inside FitbitData for the same day
        fb = FitbitData.objects(user=patient.userId, date__gte=start_dt, date__lte=end_dt).first()
        if fb:
            # Adjust these field names to match your save_vitals implementation
            weight_present = getattr(fb, "weight_kg", None) is not None
            bp = getattr(fb, "blood_pressure", None)
            systolic_present = getattr(bp, "systolic", None) is not None if bp else False
            diastolic_present = getattr(bp, "diastolic", None) is not None if bp else False
            exists = weight_present or systolic_present or diastolic_present

    return JsonResponse({"exists": bool(exists)}, status=200)


@csrf_exempt
@permission_classes([IsAuthenticated])
def log_intervention_view(request, patient_id: str):
    """
    POST /api/patients/vitals/intervention-view/<patient_id>/
    Records how long a patient spent viewing an intervention detail page.
    Body: { intervention_id, date, seconds_viewed }
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        body = json.loads(request.body or "{}")
    except Exception:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    intervention_id = (body.get("intervention_id") or "").strip()
    seconds_viewed = int(body.get("seconds_viewed") or 0)
    date = (body.get("date") or "").strip()

    if not intervention_id or seconds_viewed < 1:
        return JsonResponse({"ok": False}, status=400)

    patient = _resolve_patient(patient_id)
    if not patient:
        return JsonResponse({"error": "Patient not found"}, status=404)

    try:
        Logs.objects.create(
            userId=patient.userId,
            action="INTERVENTION_VIEW",
            userAgent=(request.headers.get("User-Agent", "") or "")[:20],
            patient=patient,
            details=f"intervention_id={intervention_id} date={date} seconds={seconds_viewed}",
        )
    except Exception:
        pass

    return JsonResponse({"ok": True}, status=200)
