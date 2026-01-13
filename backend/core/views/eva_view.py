# core/views.py
import datetime
import mimetypes
import os
import re

from django.core.files.storage import default_storage
from django.http import FileResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import HealthSliderEntry


def _safe_slug(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^A-Za-z0-9_\-\.]", "", s)
    return s[:80] if len(s) > 80 else s


def _guess_ext(mime: str, fallback=".webm") -> str:
    if not mime:
        return fallback
    ext = mimetypes.guess_extension(mime)
    return ext if ext else fallback


@csrf_exempt
@permission_classes([IsAuthenticated])
def submit_healthslider_item(request):
    """
    POST multipart/form-data
      participantId   (required) - user-entered code
      sessionId       (required) - session identifier created on FE
      questionIndex   (required int, 0-based)
      answerValue     (optional float; if missing => null)
      answeredAt      (optional ISO)
      audio           (optional file)
      audioName       (optional preferred download name)
      audioMime       (optional override)
    Saves HealthSliderEntry (MongoEngine) + optional audio file on storage.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        participant_id = (request.POST.get("participantId") or "").strip()
        session_id = (request.POST.get("sessionId") or "").strip()

        if not participant_id:
            return JsonResponse({"error": "participantId is required"}, status=400)
        if not session_id:
            return JsonResponse({"error": "sessionId is required"}, status=400)

        # question index (required)
        try:
            question_index = int(request.POST.get("questionIndex", "").strip())
        except Exception:
            return JsonResponse({"error": "Invalid questionIndex"}, status=400)

        # answer value (optional float)
        answer_raw = (request.POST.get("answerValue") or "").strip()
        answer_value = None
        if answer_raw != "":
            try:
                answer_value = float(answer_raw)
            except Exception:
                return JsonResponse({"error": "Invalid answerValue"}, status=400)

        # answered_at (optional ISO)
        answered_at_raw = (request.POST.get("answeredAt") or "").strip()
        if answered_at_raw:
            try:
                dt = datetime.datetime.fromisoformat(answered_at_raw.replace("Z", "+00:00"))
            except Exception:
                return JsonResponse({"error": "Invalid answeredAt (ISO 8601 expected)"}, status=400)
        else:
            dt = timezone.now()

        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.utc)

        # ---- create or update (upsert) one per participant+session+question_index ----
        entry = HealthSliderEntry.objects(
            participant_id=participant_id,
            session_id=session_id,
            question_index=question_index,
        ).first()

        if not entry:
            entry = HealthSliderEntry(
                participant_id=participant_id,
                session_id=session_id,
                question_index=question_index,
            )

        entry.answer_value = answer_value
        entry.answered_at = dt

        # ---- optional audio file ----
        audio = request.FILES.get("audio")
        if audio:
            # mime + extension
            mime = (request.POST.get("audioMime") or getattr(audio, "content_type", "") or "").strip()
            if not mime:
                mime = "audio/webm"

            ext = os.path.splitext(audio.name or "")[1].lower()
            if not ext:
                ext = _guess_ext(mime, ".webm")

            # file naming: <participant>_<session>_qXX_<timestamp>.<ext>
            ts = timezone.now().strftime("%Y%m%dT%H%M%S")
            qnum = question_index + 1
            safe_part = _safe_slug(participant_id)
            safe_sess = _safe_slug(session_id)

            disk_name = f"{safe_part}_{safe_sess}_q{qnum:02d}_{ts}{ext}"
            storage_path = f"healthslider/{safe_part}/{safe_sess}/{disk_name}"

            saved_path = default_storage.save(storage_path, audio)

            # friendly name for FE downloads (optional override)
            preferred_name = (request.POST.get("audioName") or "").strip()
            if preferred_name:
                preferred_name = _safe_slug(preferred_name)
                if not preferred_name.lower().endswith(ext):
                    preferred_name = preferred_name + ext
            else:
                preferred_name = disk_name

            entry.audio_file = saved_path
            entry.audio_name = preferred_name
            entry.audio_mime = mime
            entry.has_audio = True

        entry.save()

        return JsonResponse(
            {
                "ok": True,
                "id": str(entry.id),
                "participantId": entry.participant_id,
                "sessionId": entry.session_id,
                "questionIndex": entry.question_index,
                "hasAudio": bool(entry.has_audio),
            },
            status=201,
        )

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def list_healthslider_items(request):
    """
    GET /api/healthslider/items/?participantId=...&sessionId=...
    Returns items ordered by question_index.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    participant_id = (request.GET.get("participantId") or "").strip()
    session_id = (request.GET.get("sessionId") or "").strip()

    if not participant_id:
        return JsonResponse({"error": "participantId is required"}, status=400)

    qs = HealthSliderEntry.objects(participant_id=participant_id)
    if session_id:
        qs = qs.filter(session_id=session_id)

    out = []
    for it in qs.order_by("question_index"):
        out.append(
            {
                "id": str(it.id),
                "participantId": it.participant_id,
                "sessionId": it.session_id,
                "questionIndex": it.question_index,
                "answerValue": it.answer_value,
                "hasAudio": bool(it.has_audio),
                "audioName": it.audio_name,
                "audioMime": it.audio_mime,
                "answeredAt": it.answered_at.isoformat() if it.answered_at else None,
            }
        )

    return JsonResponse({"items": out}, status=200)


def _safe_filename(name: str) -> str:
    name = (name or "").strip()
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r'[^A-Za-z0-9_\-\.]', "", name)
    return name[:120] if len(name) > 120 else name


@csrf_exempt
@permission_classes([IsAuthenticated])
def download_healthslider_audio(request, item_id: str):
    """
    GET /api/healthslider/audio/<item_id>/
    Streams stored audio file based on HealthSliderEntry.audio_file (storage path).
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    # IMPORTANT: do NOT force ObjectId conversion; MongoEngine can cast string ids safely.
    entry = HealthSliderEntry.objects(id=item_id).first()
    if not entry:
        return JsonResponse(
            {"error": "Item not found", "item_id": item_id},
            status=404
        )

    if not entry.audio_file:
        return JsonResponse(
            {"error": "No audio on this item", "item_id": item_id},
            status=404
        )

    if not default_storage.exists(entry.audio_file):
        return JsonResponse(
            {"error": "Audio file missing on server storage", "path": entry.audio_file},
            status=404
        )

    filename = _safe_filename(entry.audio_name or os.path.basename(entry.audio_file) or "healthslider_audio.webm")
    content_type = entry.audio_mime or mimetypes.guess_type(filename)[0] or "application/octet-stream"

    f = default_storage.open(entry.audio_file, "rb")
    resp = FileResponse(f, content_type=content_type)
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp

