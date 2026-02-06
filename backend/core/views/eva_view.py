import datetime
import mimetypes
import os
import re
from django.http import HttpResponse, FileResponse
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
import io      
import zipfile
from core.models import HealthSliderEntry

def _safe_slug(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^A-Za-z0-9_\-\.]", "", s)
    return s[:80]

def _guess_ext(mime: str, fallback=".webm") -> str:
    if not mime:
        return fallback
    # iPad/Safari fix: mimetypes sometimes struggles with 'audio/mp4' on Linux servers
    if mime == "audio/mp4":
        return ".mp4"
    ext = mimetypes.guess_extension(mime)
    return ext if ext else fallback

@csrf_exempt
def submit_healthslider_item(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        participant_id = (request.POST.get("participantId") or "").strip()
        session_id = (request.POST.get("sessionId") or "").strip()
        q_text = (request.POST.get("questionText") or "").strip() # Capture Text
        
        if not participant_id or not session_id:
            return JsonResponse({"error": "participantId and sessionId are required"}, status=400)

        question_index = int(request.POST.get("questionIndex", 0))
        answer_raw = (request.POST.get("answerValue") or "").strip()
        answer_value = float(answer_raw) if answer_raw != "" else None

        # Handle Date (Timestamp from FE or Server fallback)
        answered_at_raw = (request.POST.get("answeredAt") or "").strip()
        if answered_at_raw:
            dt = datetime.datetime.fromisoformat(answered_at_raw.replace("Z", "+00:00"))
        else:
            dt = timezone.now()

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
        entry.question_text = q_text # Save question text
        entry.answered_at = dt

        audio = request.FILES.get("audio")
        if audio:
            if entry.audio_file and default_storage.exists(entry.audio_file):
                default_storage.delete(entry.audio_file)

            mime = (request.POST.get("audioMime") or getattr(audio, "content_type", "")).strip()
            ext = os.path.splitext(audio.name or "")[1].lower() or _guess_ext(mime)

            ts = timezone.now().strftime("%Y%m%dT%H%M%S")
            disk_name = f"{_safe_slug(participant_id)}_q{question_index+1:02d}_{ts}{ext}"
            storage_path = f"healthslider/{_safe_slug(participant_id)}/{disk_name}"

            saved_path = default_storage.save(storage_path, audio)
            entry.audio_file = saved_path
            entry.audio_name = disk_name
            entry.audio_mime = mime
            entry.has_audio = True

        entry.save()
        return JsonResponse({"ok": True}, status=201)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
def list_healthslider_items(request):
    participant_id = request.GET.get("participantId")
    if not participant_id:
        return JsonResponse({"error": "participantId required"}, status=400)

    qs = HealthSliderEntry.objects(participant_id=participant_id).order_by("question_index")
    out = []
    for it in qs:
        size = 0
        if it.has_audio and it.audio_file and default_storage.exists(it.audio_file):
            size = default_storage.size(it.audio_file) # Audio size in bytes

        out.append({
            "id": str(it.id),
            "questionIndex": it.question_index,
            "questionText": it.question_text, # Included for Dashboard
            "answerValue": it.answer_value,
            "hasAudio": it.has_audio,
            "audioSize": size,
            "audioName": it.audio_name,
            "answeredAt": it.answered_at.isoformat() if it.answered_at else None,
        })
    return JsonResponse({"items": out})



def _safe_filename(name: str) -> str:
    name = (name or "").strip()
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r'[^A-Za-z0-9_\-\.]', "", name)
    return name[:120] if len(name) > 120 else name


@csrf_exempt
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

@csrf_exempt
def download_healthslider_session_zip(request):
    """
    GET /api/healthslider/session-zip/?participantId=...&sessionId=...
    Aggregates all audio files for a session into one ZIP.
    """
    participant_id = (request.GET.get("participantId") or "").strip()
    session_id = (request.GET.get("sessionId") or "").strip()

    if not participant_id:
        return JsonResponse({"error": "participantId is required"}, status=400)

    # Filter entries that actually have audio
    qs = HealthSliderEntry.objects(participant_id=participant_id, has_audio=True)
    if session_id:
        qs = qs.filter(session_id=session_id)
    
    if not qs.count():
        return JsonResponse({"error": "No audio files found for this criteria"}, status=404)

    # Create an in-memory ZIP file
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for entry in qs:
            if default_storage.exists(entry.audio_file):
                with default_storage.open(entry.audio_file, 'rb') as f:
                    # Use the saved audio_name for the filename inside the zip
                    zf.writestr(entry.audio_name, f.read())

    buffer.seek(0)
    
    zip_filename = f"HealthSlider_{_safe_slug(participant_id)}_{timezone.now().strftime('%Y%m%d')}.zip"
    response = HttpResponse(buffer, content_type='application/zip')
    response['Content-Disposition'] = f'attachment; filename="{zip_filename}"'
    return response

@csrf_exempt
def delete_healthslider_session(request):
    """
    DELETE /api/healthslider/delete-session/?participantId=...&sessionId=...
    Wipes DB records and physical files for a participant/session.
    """
    if request.method != "DELETE":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    participant_id = (request.GET.get("participantId") or "").strip()
    session_id = (request.GET.get("sessionId") or "").strip()

    if not participant_id:
        return JsonResponse({"error": "participantId is required"}, status=400)

    qs = HealthSliderEntry.objects(participant_id=participant_id)
    if session_id:
        qs = qs.filter(session_id=session_id)

    count = qs.count()
    if count == 0:
        return JsonResponse({"error": "No recordings found to delete."}, status=404)

    # Delete physical files first
    for entry in qs:
        if entry.audio_file and default_storage.exists(entry.audio_file):
            default_storage.delete(entry.audio_file)

    # Delete DB records
    qs.delete()

    return JsonResponse({
        "ok": True, 
        "message": f"Successfully deleted {count} items and their associated files."
    })