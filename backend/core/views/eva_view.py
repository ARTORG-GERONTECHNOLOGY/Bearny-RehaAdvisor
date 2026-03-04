"""
ICF Monitor / HealthSlider — backend API views
===============================================

Endpoints
---------
POST   /api/healthslider/submit-item/       No auth required (patients submit from device)
GET    /api/healthslider/items/             Requires X-Healthslider-Token
GET    /api/healthslider/audio/<id>/        Requires X-Healthslider-Token
GET    /api/healthslider/session-zip/       Aggregate ZIP download (internal/admin use)
DELETE /api/healthslider/delete-session/    Delete session data + files (internal/admin use)
POST   /api/healthslider/auth/              Step 1: validate shared password, send email code
POST   /api/healthslider/auth/verify/       Step 2: verify email code, return signed token

Download auth flow (2FA, separate from main app)
------------------------------------------------
1. Researcher POSTs shared password + their email to /api/healthslider/auth/
2. A 6-digit code is emailed to that address (valid 10 min, stored in SMSVerification
   with userId="healthslider_download").
3. Researcher POSTs the code to /api/healthslider/auth/verify/
4. A tamper-proof signed token is returned (django.core.signing, salt "healthslider_dl",
   max_age 8 hours).
5. All subsequent read requests carry the token in the X-Healthslider-Token header.

Environment variables
---------------------
HEALTHSLIDER_DOWNLOAD_PASSWORD   Shared password used in step 1 above.
"""

import datetime
import io
import json
import mimetypes
import os
import random
import re
import string
import zipfile
from datetime import timedelta, timezone as dt_timezone

from django.conf import settings
from django.core import signing
from django.core.files.storage import default_storage
from django.core.mail import EmailMultiAlternatives
from django.http import FileResponse, HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from core.models import HealthSliderEntry, SMSVerification

# ---------------------------------------------------------------------------
# Download-only auth constants
# ---------------------------------------------------------------------------
_DL_SALT = "healthslider_dl"
_DL_TOKEN_MAX_AGE = 28800  # 8 hours


def _check_download_token(request) -> bool:
    """Return True when the request carries a valid, unexpired download token."""
    token = request.META.get("HTTP_X_HEALTHSLIDER_TOKEN", "")
    if not token:
        return False
    try:
        signing.loads(token, salt=_DL_SALT, max_age=_DL_TOKEN_MAX_AGE)
        return True
    except Exception:
        return False


@csrf_exempt
def healthslider_download_auth(request):
    """
    POST /api/healthslider/auth/
    Body: {"password": "...", "email": "..."}
    Validates the shared password, sends a 6-digit code to the given email.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    try:
        data = json.loads(request.body or "{}")
        password = (data.get("password") or "").strip()
        email = (data.get("email") or "").strip()

        expected = os.environ.get("HEALTHSLIDER_DOWNLOAD_PASSWORD", "")
        if not expected or password != expected:
            return JsonResponse({"error": "Invalid password"}, status=401)
        if not email:
            return JsonResponse({"error": "Email required"}, status=400)

        code = "".join(random.choices(string.digits, k=6))
        expires_at = timezone.now() + timedelta(minutes=10)
        SMSVerification(userId="healthslider_download", code=code, expires_at=expires_at).save()

        msg = EmailMultiAlternatives(
            subject="ICF Monitor Download Code",
            body=f"Your download access code is: {code}\n\nValid for 10 minutes.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[email],
        )
        msg.attach_alternative(
            f"<p>Your ICF Monitor download code: <b>{code}</b></p><p>Valid for 10 minutes.</p>",
            "text/html",
        )
        msg.send(fail_silently=False)
        return JsonResponse({"ok": True}, status=200)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def healthslider_download_verify(request):
    """
    POST /api/healthslider/auth/verify/
    Body: {"code": "123456"}
    Verifies the email code and returns a signed download token valid for 8 hours.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    try:
        data = json.loads(request.body or "{}")
        code = (data.get("code") or "").strip()
        if not code:
            return JsonResponse({"error": "Code required"}, status=400)

        verification = (
            SMSVerification.objects(userId="healthslider_download", code=code)
            .order_by("-created_at")
            .first()
        )
        if not verification:
            return JsonResponse({"error": "Invalid code"}, status=400)

        expires_at = verification.expires_at
        if timezone.is_naive(expires_at):
            expires_at = expires_at.replace(tzinfo=dt_timezone.utc)
        if expires_at < timezone.now().astimezone(dt_timezone.utc):
            verification.delete()
            return JsonResponse({"error": "Code expired"}, status=400)

        verification.delete()
        token = signing.dumps({"ok": True}, salt=_DL_SALT)
        return JsonResponse({"token": token}, status=200)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


def _safe_slug(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^A-Za-z0-9_\-\.]", "", s)
    return s[:80]


def _safe_filename(name: str) -> str:
    name = (name or "").strip()
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r"[^A-Za-z0-9_\-\.]", "", name)
    return name[:120] if len(name) > 120 else name


def _guess_ext(mime: str, fallback=".webm") -> str:
    """
    Robust extension mapping for browser-recorded audio.
    - Safari iOS often uses audio/mp4 (AAC) -> .m4a
    - Chrome/Firefox often uses audio/webm (opus) -> .webm
    - Some browsers use audio/ogg -> .ogg
    """
    if not mime:
        return fallback

    mime = mime.strip().lower()

    if mime == "audio/mp4":
        return ".m4a"
    if mime.startswith("audio/ogg"):
        return ".ogg"
    if mime.startswith("audio/webm"):
        return ".webm"

    ext = mimetypes.guess_extension(mime)
    return ext if ext else fallback


@csrf_exempt
def submit_healthslider_item(request):
    """
    POST /api/healthslider/submit-item/
    Fields:
      participantId, sessionId, questionIndex, questionText, answerValue, answeredAt, audioMime (optional), audio (optional)
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        participant_id = (request.POST.get("participantId") or "").strip()
        session_id = (request.POST.get("sessionId") or "").strip()
        q_text = (request.POST.get("questionText") or "").strip()

        if not participant_id or not session_id:
            return JsonResponse({"error": "participantId and sessionId are required"}, status=400)

        question_index = int(request.POST.get("questionIndex", 0))
        answer_raw = (request.POST.get("answerValue") or "").strip()
        answer_value = float(answer_raw) if answer_raw != "" else None

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
        entry.question_text = q_text
        entry.answered_at = dt

        audio = request.FILES.get("audio")
        if audio:
            # delete old file if exists
            if entry.audio_file and default_storage.exists(entry.audio_file):
                default_storage.delete(entry.audio_file)

            mime = (request.POST.get("audioMime") or getattr(audio, "content_type", "") or "").strip()
            if not mime:
                guessed = mimetypes.guess_type(audio.name or "")[0]
                mime = guessed or "application/octet-stream"

            ext_from_name = os.path.splitext(audio.name or "")[1].lower()
            ext = ext_from_name if ext_from_name else _guess_ext(mime)

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
    """
    GET /api/healthslider/items/?participantId=...
    Requires a valid X-Healthslider-Token header.
    """
    if not _check_download_token(request):
        return JsonResponse({"error": "Unauthorized"}, status=401)
    participant_id = request.GET.get("participantId")
    if not participant_id:
        return JsonResponse({"error": "participantId required"}, status=400)

    qs = HealthSliderEntry.objects(participant_id=participant_id).order_by("question_index")
    out = []

    for it in qs:
        size = 0
        if it.has_audio and it.audio_file and default_storage.exists(it.audio_file):
            size = default_storage.size(it.audio_file)

        out.append(
            {
                "id": str(it.id),
                "questionIndex": it.question_index,
                "questionText": it.question_text,
                "answerValue": it.answer_value,
                "hasAudio": it.has_audio,
                "audioSize": size,
                "audioName": it.audio_name,
                "audioMime": it.audio_mime,  # ✅ include to help UI if needed
                "answeredAt": it.answered_at.isoformat() if it.answered_at else None,
            }
        )

    return JsonResponse({"items": out})


@csrf_exempt
def download_healthslider_audio(request, item_id: str):
    """
    GET /api/healthslider/audio/<item_id>/
    Streams stored audio file. Requires a valid X-Healthslider-Token header.
    """
    if not _check_download_token(request):
        return JsonResponse({"error": "Unauthorized"}, status=401)
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    entry = HealthSliderEntry.objects(id=item_id).first()
    if not entry:
        return JsonResponse({"error": "Item not found", "item_id": item_id}, status=404)

    if not entry.audio_file:
        return JsonResponse({"error": "No audio on this item", "item_id": item_id}, status=404)

    if not default_storage.exists(entry.audio_file):
        return JsonResponse(
            {"error": "Audio file missing on server storage", "path": entry.audio_file},
            status=404,
        )

    filename = _safe_filename(entry.audio_name or os.path.basename(entry.audio_file) or "healthslider_audio.webm")

    content_type = (entry.audio_mime or "").strip()
    if not content_type or content_type == "application/octet-stream":
        guessed = mimetypes.guess_type(filename)[0]
        content_type = guessed or "application/octet-stream"

    f = default_storage.open(entry.audio_file, "rb")
    resp = FileResponse(f, content_type=content_type)

    # ✅ IMPORTANT: inline makes <audio> playback reliable
    resp["Content-Disposition"] = f'inline; filename="{filename}"'

    try:
        resp["Content-Length"] = default_storage.size(entry.audio_file)
    except Exception:
        pass

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

    qs = HealthSliderEntry.objects(participant_id=participant_id, has_audio=True)
    if session_id:
        qs = qs.filter(session_id=session_id)

    if not qs.count():
        return JsonResponse({"error": "No audio files found for this criteria"}, status=404)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for entry in qs:
            if entry.audio_file and default_storage.exists(entry.audio_file):
                with default_storage.open(entry.audio_file, "rb") as f:
                    zf.writestr(entry.audio_name or os.path.basename(entry.audio_file), f.read())

    buffer.seek(0)
    zip_filename = f"HealthSlider_{_safe_slug(participant_id)}_{timezone.now().strftime('%Y%m%d')}.zip"
    response = HttpResponse(buffer, content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{zip_filename}"'
    return response


@csrf_exempt
def delete_healthslider_session(request):
    """
    DELETE /api/healthslider/delete-session/?participantId=...&sessionId=...
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

    for entry in qs:
        if entry.audio_file and default_storage.exists(entry.audio_file):
            default_storage.delete(entry.audio_file)

    qs.delete()

    return JsonResponse(
        {
            "ok": True,
            "message": f"Successfully deleted {count} items and their associated files.",
        }
    )
