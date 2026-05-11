import re
from typing import Any, Dict, List, Optional, Tuple

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Intervention, InterventionMedia
from utils.interventions import _save_file

# Matches: {4-5 digits}_{format}_{lang}[_{slot}].{ext}
# The optional trailing _{slot} (integer ≥ 2) identifies additional media slots
# for the same intervention (e.g. 3500_web_de_2.mp4 is slot 2 of 3500_web_de).
_FILENAME_RE = re.compile(
    r"^(\d{4,5}_(?:vid|img|pdf|web|aud|app|br|gfx)_[a-z]{2}(?:_\d+)?)\.(mp4|mp3|m4a|wav|pdf|jpg|jpeg|png)$",
    re.IGNORECASE,
)

# extension (lower) → (media_type, mime, storage_subfolder)
# media_type values must match InterventionMedia.media_type choices in models.py
_EXT_INFO: Dict[str, Tuple[str, str, str]] = {
    "mp4": ("video", "video/mp4", "videos"),
    "mp3": ("audio", "audio/mpeg", "audio"),
    "m4a": ("audio", "audio/mp4", "audio"),
    "wav": ("audio", "audio/wav", "audio"),
    "pdf": ("pdf", "application/pdf", "documents"),
    "jpg": ("image", "image/jpeg", "images"),
    "jpeg": ("image", "image/jpeg", "images"),
    "png": ("image", "image/png", "images"),
}


def _parse_external_id_and_lang(stem: str) -> Tuple[str, str, Optional[int]]:
    """
    Derive (external_id, lang_code, media_slot) from the filename stem.

    '3500_web_de'   -> ('3500_web', 'de', None)
    '3500_web_de_2' -> ('3500_web', 'de', 2)
    '3500_pdf_fr'   -> ('3500_pdf', 'fr', None)
    """
    parts = stem.lower().split("_")

    # Detect optional trailing slot number (integer ≥ 2)
    media_slot: Optional[int] = None
    if parts and re.match(r"^\d+$", parts[-1]) and len(parts) > 1:
        slot_candidate = int(parts[-1])
        if slot_candidate >= 2:
            media_slot = slot_candidate
            parts = parts[:-1]

    # Trailing 2-char alpha = language suffix
    if len(parts) >= 2 and len(parts[-1]) == 2 and parts[-1].isalpha():
        return "_".join(parts[:-1]), parts[-1], media_slot
    return "_".join(parts), "", media_slot


def _process_single_file(file_obj) -> Dict[str, Any]:
    filename = (getattr(file_obj, "name", "") or "").strip()

    # 1. Filename must match naming convention
    m = _FILENAME_RE.match(filename)
    if not m:
        return {
            "filename": filename,
            "status": "error",
            "external_id": None,
            "interventions_updated": [],
            "error": (
                "Filename does not match naming convention. "
                "Expected: {4-5 digits}_{format}_{lang}[_{slot}].{ext}  "
                "e.g. 3500_web_de.mp4, 3500_web_de_2.mp4 (slot 2), "
                "3500_aud_de.mp3, 3500_aud_de.m4a, 3500_pdf_de.pdf, 3500_img_de.jpg. "
                "Valid formats: vid, img, pdf, web, aud, app, br, gfx. "
                "Valid languages: de, fr, it, pt, nl, en. "
                "Valid extensions: mp4, mp3, m4a, wav, pdf, jpg, jpeg, png."
            ),
        }

    stem = m.group(1)
    ext = m.group(2).lower()
    external_id, lang_code, media_slot = _parse_external_id_and_lang(stem)
    media_type, mime, folder = _EXT_INFO[ext]

    # 2. Look up the intervention for the specific language from the filename
    intervention = Intervention.objects(external_id=external_id, language=lang_code).first()
    if intervention is None:
        # Check whether the external_id exists at all (any language)
        any_lang = Intervention.objects(external_id=external_id).first()
        if any_lang:
            error_msg = (
                f'No "{lang_code}" intervention found for external_id "{external_id}". '
                f'The intervention exists in other languages but not "{lang_code}".'
            )
        else:
            error_msg = f'No intervention found with external_id "{external_id}".'
        return {
            "filename": filename,
            "status": "error",
            "external_id": external_id,
            "interventions_updated": [],
            "error": error_msg,
        }

    # 3. Save file to media/{folder}/
    saved_path = _save_file(file_obj, folder, external_id)

    # 4. Slot-level upsert: replace media with the same slot, keep all other slots.
    title = getattr(intervention, "title", None) or external_id
    new_item = InterventionMedia(
        kind="file",
        media_type=media_type,
        file_path=saved_path,
        mime=mime,
        title=title,
        media_slot=media_slot,
    )
    if intervention.media is None:
        intervention.media = []

    if media_slot is not None:
        # Replace any existing entry with the same slot number
        intervention.media = [med for med in intervention.media if getattr(med, "media_slot", None) != media_slot]
        intervention.media.append(new_item)
    else:
        # Primary slot (None): replace primary, keep numbered slots
        intervention.media = [med for med in intervention.media if getattr(med, "media_slot", None) is not None]
        intervention.media.append(new_item)

    intervention.save()

    return {
        "filename": filename,
        "status": "ok",
        "external_id": external_id,
        "language": lang_code,
        "media_slot": media_slot,
        "interventions_updated": [str(intervention.pk)],
    }


@csrf_exempt
@permission_classes([IsAuthenticated])
def upload_intervention_media(request):
    """
    POST /api/interventions/import/media/
    multipart/form-data, files under key 'files[]'

    Each file must:
      - have a filename matching {4-5 digits}_{format}_{lang}.{ext}
        e.g. 3500_web_de.mp4, 3500_aud_de.mp3, 3500_aud_de.m4a, 3500_pdf_de.pdf, 3500_img_de.jpg
      - correspond to an existing Intervention with the matching external_id AND language

    The language suffix (e.g. _de) determines which language variant receives the file.
    Returns per-file results — never aborts the whole batch on a single error.
    """
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "Method not allowed"}, status=405)

    files = request.FILES.getlist("files[]")
    if not files:
        return JsonResponse(
            {"success": False, "error": 'No files provided. Use key "files[]".'},
            status=400,
        )

    max_media_bytes = 1024 * 1024 * 1024  # 1 GB

    results = []
    for f in files:
        if getattr(f, "size", 0) > max_media_bytes:
            results.append(
                {
                    "filename": getattr(f, "name", ""),
                    "status": "error",
                    "external_id": None,
                    "interventions_updated": [],
                    "error": "Media file is too large. Maximum allowed size is 1 GB.",
                }
            )
            continue
        try:
            result = _process_single_file(f)
        except Exception as e:
            result = {
                "filename": getattr(f, "name", ""),
                "status": "error",
                "external_id": None,
                "interventions_updated": [],
                "error": f"Unexpected error: {str(e)}",
            }
        results.append(result)

    return JsonResponse({"success": True, "results": results}, status=200)
