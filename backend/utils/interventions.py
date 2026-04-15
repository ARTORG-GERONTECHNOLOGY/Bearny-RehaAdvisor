import json
import logging
import mimetypes
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from bson import ObjectId
from django.conf import settings
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.utils import timezone
from django.utils.timezone import now as dj_now
from django.views.decorators.csrf import csrf_exempt
from mongoengine.queryset.visitor import Q
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Logs  # Ensure this includes action, userId, userAgent, details
from core.models import (
    DefaultInterventions,
    DiagnosisAssignmentSettings,
    Intervention,
    InterventionAssignment,
    InterventionMedia,
    Patient,
    PatientInterventionLogs,
    PatientType,
    Therapist,
)
from utils.config import config
from utils.scheduling import _merge_date_and_time
from utils.utils import generate_custom_id, get_labels, sanitize_text

DIRECT_AUDIO_EXT = {"mp3", "wav", "m4a", "aac", "ogg", "opus", "flac"}
DIRECT_VIDEO_EXT = {"mp4", "webm", "mov", "m4v", "mkv"}

EMBED_HINTS = [
    r"/embed(?:/|$)",
    r"player\.",
    r"/iframe(?:/|$)",
    r"[?&]embed=1\b",
]


def _url_ext(u: str) -> str:
    try:
        path = urlparse((u or "").strip()).path or ""
        m = re.search(r"\.([a-zA-Z0-9]{2,5})$", path)
        return m.group(1).lower() if m else ""
    except Exception:
        return ""


def _is_direct_media(u: str) -> Optional[str]:
    ext = _url_ext(u)
    if ext in DIRECT_AUDIO_EXT:
        return "audio"
    if ext in DIRECT_VIDEO_EXT:
        return "video"
    return None


def _looks_like_embed(u: str) -> bool:
    s = (u or "").strip().lower()
    return any(re.search(p, s) for p in EMBED_HINTS)


def _lang_fallback_chain(user_lang: str) -> List[str]:
    """
    Priority order: user_lang -> en -> de (and avoid duplicates).
    """
    user_lang = (user_lang or "").strip().lower()
    chain = [user_lang, "en", "de"]
    out = []
    seen = set()
    for l in chain:
        if l and l not in seen:
            out.append(l)
            seen.add(l)
    return out or ["en", "de"]


def _pick_best_variant(external_id: str, lang_chain: List[str]) -> Optional["Intervention"]:
    """
    Return best matching intervention doc for external_id using fallback chain.
    """
    for l in lang_chain:
        doc = Intervention.objects(external_id=external_id, language=l).first()
        if doc:
            return doc
    # last resort: any
    return Intervention.objects(external_id=external_id).first()


def _available_language_variants(external_id: str) -> List[dict]:
    """
    Return all variants for UI dropdown.
    """
    variants = Intervention.objects(external_id=external_id).only("id", "language", "title")
    return [
        {
            "_id": str(v.id),
            "language": getattr(v, "language", None),
            "title": getattr(v, "title", None),
        }
        for v in variants
    ]


def _serialize_intervention_basic(item):
    """
    Use your existing serialize(item) body or call it from here if you prefer.
    This helper is optional; you can inline it.
    """

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
            out["file_url"] = _abs_media_url(out["file_path"])
        return out

    return {
        "_id": str(item.pk),
        "external_id": getattr(item, "external_id", None),
        "language": getattr(item, "language", None),
        "provider": getattr(item, "provider", None),
        "title": getattr(item, "title", None),
        "description": getattr(item, "description", None),
        "content_type": getattr(item, "content_type", None),
        "media": [serialize_media(m) for m in (getattr(item, "media", None) or [])],
        "preview_img": (_abs_media_url(item.preview_img) if getattr(item, "preview_img", None) else ""),
        "duration": getattr(item, "duration", None),
        "patient_types": [
            {
                "type": pt.type,
                "frequency": pt.frequency,
                "include_option": getattr(pt, "include_option", False),
                "diagnosis": getattr(pt, "diagnosis", None),
            }
            for pt in (getattr(item, "patient_types", None) or [])
        ],
        "is_private": bool(getattr(item, "is_private", False)),
    }


def _pick_variant(docs, preferred: str, fallback_order=None):
    """
    docs: list[Intervention] that share external_id
    returns chosen doc + sorted languages
    """
    if fallback_order is None:
        fallback_order = []

    by_lang = {}
    langs = []
    for d in docs:
        l = (getattr(d, "language", None) or "").lower().strip()
        if l and l not in by_lang:
            by_lang[l] = d
            langs.append(l)

    # preference chain
    chain = [preferred.lower()] + [x.lower() for x in fallback_order if x] + ["en", "de"]
    for l in chain:
        if l in by_lang:
            return by_lang[l], sorted(set(langs))

    # fallback: any
    any_doc = docs[0]
    return any_doc, sorted(set(langs))


# --------------------------------------------------------------------
# Embed helpers + provider inference
# --------------------------------------------------------------------


def _media_key(m: InterventionMedia) -> str:
    return f"{m.kind}|{(getattr(m, 'url', '') or '').strip()}|{(getattr(m, 'file_path', '') or '').strip()}|{(getattr(m, 'media_type', '') or '').strip()}"


def _serialize_media(m):
    out = {
        "kind": getattr(m, "kind", None),
        "media_type": getattr(m, "media_type", None),
        "provider": getattr(m, "provider", None),
        "title": getattr(m, "title", None),
        "url": getattr(m, "url", None),
        "embed_url": getattr(m, "embed_url", None),
        "file_path": getattr(m, "file_path", None),
        "file_url": None,
        "mime": getattr(m, "mime", None),
        "thumbnail": getattr(m, "thumbnail", None),
    }
    if out["kind"] == "file" and out.get("file_path"):
        out["file_url"] = _abs_media_url(out["file_path"])
    return out


# --------------------------------------------------------------------
# Template scheduling helpers (yours, kept + cleaned)
# --------------------------------------------------------------------


def _clip_before(blocks: List[DiagnosisAssignmentSettings], new_start_day: int):
    out: List[DiagnosisAssignmentSettings] = []
    for b in blocks:
        end_day = b.end_day if b.end_day and b.end_day >= b.start_day else b.start_day
        if end_day < new_start_day:
            out.append(b)
        elif b.start_day < new_start_day <= end_day:
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
    return out


def _normalize_segments(raw):
    if not raw:
        return []

    def as_dict(x):
        if hasattr(x, "to_mongo"):
            return dict(x.to_mongo().to_dict())
        return dict(x)

    if isinstance(raw, list):
        seq = raw
    elif isinstance(raw, dict) or hasattr(raw, "to_mongo"):
        seq = [raw]
    else:
        return []

    items = []
    for r in seq:
        d = as_dict(r)
        unit = (d.get("unit") or "week").strip().lower()
        intrv = _parse_int(d.get("interval", 1), 1)
        sdays = d.get("selected_days") or d.get("selectedDays") or []
        sday = max(1, _parse_int(d.get("start_day", 1), 1))
        end_day = _parse_int(
            d.get("end_day") or (d.get("end") or {}).get("count") or d.get("count_limit") or 1,
            1,
        )
        end_day = max(end_day, sday)
        stime = (d.get("start_time") or d.get("startTime") or "08:00").strip()

        items.append(
            {
                "unit": unit,
                "interval": max(1, intrv),
                "selected_days": sdays,
                "start_day": sday,
                "end_day": end_day,
                "start_time": stime,
            }
        )

    items.sort(key=lambda x: (x["start_day"], x["end_day"]))
    return items


BASE_ANCHOR = "2000-01-01"  # fixed origin so "Day N" is stable


def _occ_count_for_day_range(start_day, end_day, interval):
    return max(1, (end_day - start_day) // max(1, interval) + 1)


def _anchor_date_for_day(day_n: int) -> str:
    base = datetime.fromisoformat(f"{BASE_ANCHOR}T00:00:00")
    start = base + timedelta(days=max(1, day_n) - 1)
    return start.date().isoformat()


def _dedup_dates(dt_list):
    seen = set()
    out = []
    for d in dt_list:
        key = d.replace(microsecond=0)
        if key not in seen:
            seen.add(key)
            out.append(key)
    return out


def _upsert_intervention(
    plan,
    intervention,
    dates,
    notes="",
    require_video=False,
    overwrite=False,
    effective_from=None,
):
    found = None
    for ia in plan.interventions or []:
        if getattr(getattr(ia, "interventionId", None), "id", None) == intervention.id:
            found = ia
            break

    dates = _dedup_dates(dates)

    if found:
        if overwrite and effective_from:
            eff = make_aware(effective_from) if is_naive(effective_from) else effective_from
            kept = [d for d in (found.dates or []) if d < eff]
            found.dates = kept + dates
        else:
            existing = {d.replace(microsecond=0) for d in (found.dates or [])}
            found.dates = list(existing)
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


def normalize_content_type(raw: str) -> str:
    k = (raw or "").strip()
    if not k:
        return ""
    return settings.CONTENT_TYPE_CANONICAL_MAP.get(k, k.lower())


import unicodedata
from urllib.parse import urlparse


def _safe_title_slug(s: str) -> str:
    """
    Safe filename-ish slug, max 80 chars.
    """
    s = (s or "").strip().lower().replace(" ", "_")
    s = "".join(c for c in s if c.isalnum() or c in ("_", "-"))
    return s[:80] or "intervention"


def _strip_invisible(s: str) -> str:
    # remove control/format chars (Cc/Cf), keeps normal chars
    return "".join(ch for ch in (s or "") if unicodedata.category(ch) not in ("Cc", "Cf"))


def _is_valid_url(u: str) -> bool:
    u0 = u
    u = _strip_invisible((u or "").strip())

    try:
        p = urlparse(u)
    except Exception as e:
        print("[_is_valid_url] urlparse exception")
        return False

    ok = (p.scheme in ("http", "https")) and bool(p.netloc)

    print(ok)
    return ok


def _safe_title_slug(s: str) -> str:
    return (
        "".join(c for c in (s or "").lower().replace(" ", "_") if c.isalnum() or c in ("_", "-"))[:80] or "intervention"
    )


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
            items = [sanitize_text(x).strip() for x in pieces if x]
    else:
        items = [sanitize_text(str(val)).strip()]

    items = items[:MAX_LIST_ITEMS]
    return [x[:MAX_ITEM_LEN] for x in items if x]


def _abs_media_url(path: str) -> str:
    if not path:
        return ""
    if path.startswith("http://") or path.startswith("https://"):
        return path
    media_host = getattr(settings, "MEDIA_HOST", "")
    media_url = getattr(settings, "MEDIA_URL", "/media/")
    return f"{media_host}{media_url.rstrip('/')}/{path.lstrip('/')}"


def _save_file(file_obj, folder: str, title: str) -> str:
    ts = timezone.now().strftime("%Y%m%d_%H%M%S")
    ext = (os.path.splitext(file_obj.name)[1] or "").lower().lstrip(".") or "bin"
    safe_title = _safe_title_slug(title)
    filename = f"{ts}_{safe_title}.{ext}"
    return default_storage.save(f"{folder}/{filename}", file_obj)


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
    # fallback from contentType
    hint = (content_type_hint or "").lower()
    if hint in ALLOWED_CONTENT_TYPES:
        return hint
    return "text"


def _build_external_media(url: str, title: Optional[str] = None, media_type: Optional[str] = None) -> InterventionMedia:
    clean_url = (url or "").strip()
    prov = _guess_provider(clean_url)

    direct = _is_direct_media(clean_url)
    embed = None

    # If it's already an embed URL (generic), keep it as embed_url
    if _looks_like_embed(clean_url):
        embed = clean_url

    # Provider-specific embed builders (optional)
    if prov == "spotify":
        embed = spotify_embed(clean_url) or embed
    elif prov == "youtube":
        embed = youtube_embed(clean_url) or embed
    elif prov == "ard":
        embed = ard_embed(clean_url) or embed
        # normalize stored url if user pasted embed
        if "/embed/episode/" in clean_url:
            clean_url = clean_url.replace("/embed/episode/", "/episode/", 1)

    # Decide media_type
    # 1) explicit override from caller wins
    # 2) direct audio/video file -> audio/video
    # 3) has embed_url -> streaming
    # 4) fallback -> website
    if media_type:
        mt = media_type.lower()
    elif direct:
        mt = direct
    elif embed:
        mt = "streaming"
    else:
        mt = "website"

    return InterventionMedia(
        kind="external",
        media_type=mt,
        provider=prov,
        title=title,
        url=clean_url,
        embed_url=embed,
    )


def _build_file_media(file_path: str, mime: Optional[str], title: Optional[str], media_type: str) -> InterventionMedia:
    return InterventionMedia(
        kind="file",
        media_type=media_type,
        provider=None,
        title=title,
        url=None,
        embed_url=None,
        file_path=file_path,
        mime=mime,
        thumbnail=None,
    )


# -------------------------
# Taxonomy mapping
# -------------------------


def _taxonomy_allowed_sets():
    tx = config.get("interventionsTaxonomy") or config.get("interventionsTaxonomy".lower()) or {}  # just in case
    # if your taxonomy is in interventions.json instead of config, replace this accordingly
    return {
        "input_from": set((tx.get("input_from") or [])),
        "lc9": set((tx.get("lc9") or [])),
        "original_languages": set((tx.get("original_languages") or [])),
        "primary_diagnoses": set((tx.get("primary_diagnoses") or [])),
        "aims": set((tx.get("aims") or [])),
        "topics": set((tx.get("topics") or [])),
        "cognitive_levels": set((tx.get("cognitive_levels") or [])),
        "physical_levels": set((tx.get("physical_levels") or [])),
        "frequency_time": set((tx.get("frequency_time") or [])),
        "timing": set((tx.get("timing") or [])),
        "duration_buckets": set((tx.get("duration_buckets") or [])),
        "sex_specific": set((tx.get("sex_specific") or [])),
        "where": set((tx.get("where") or [])),
        "setting": set((tx.get("setting") or [])),
        "content_types": set((tx.get("content_types") or [])),
    }


def _split_taglist_into_fields(tag_list: List[str]) -> Dict[str, Any]:
    """
    Takes FE tagList (flat list) and places values into model taxonomy fields.
    Unknown values go into keywords.
    """
    allowed = _taxonomy_allowed_sets()

    # normalize comparisons
    def norm(s: str) -> str:
        return (s or "").strip()

    def in_set(v: str, s: set) -> bool:
        # taxonomy values might be case sensitive in config; compare loosely:
        return v in s or v.lower() in {x.lower() for x in s}

    out = {
        "lc9": [],
        "topic": [],
        "where": [],
        "setting": [],
        "keywords": [],
        "aim": None,
        # single-value fields left empty unless FE sends them explicitly elsewhere
    }

    for raw in tag_list or []:
        v = norm(raw)
        if not v:
            continue

        if in_set(v, allowed["lc9"]):
            out["lc9"].append(v)
        elif in_set(v, allowed["topics"]):
            out["topic"].append(v)
        elif in_set(v, allowed["where"]):
            out["where"].append(v)
        elif in_set(v, allowed["setting"]):
            out["setting"].append(v)
        elif in_set(v, allowed["aims"]) and out["aim"] is None:
            # aim is single in your model
            out["aim"] = v
        else:
            out["keywords"].append(v)

    # de-dup keep order
    def dedup(xs: List[str]) -> List[str]:
        seen = set()
        out2 = []
        for x in xs:
            k = x.strip().lower()
            if not k or k in seen:
                continue
            out2.append(x.strip())
            seen.add(k)
        return out2

    out["lc9"] = dedup(out["lc9"])
    out["topic"] = dedup(out["topic"])
    out["where"] = dedup(out["where"])
    out["setting"] = dedup(out["setting"])
    out["keywords"] = dedup(out["keywords"])
    return out


def ard_embed(url: str) -> str | None:
    """
    Accepts either:
      - https://www.ardaudiothek.de/episode/urn:ard:section:...
      - https://www.ardaudiothek.de/embed/episode/urn:ard:publication:...
    Returns the embed URL.
    """
    u = (url or "").strip()
    if not u:
        return None

    # If already embed, keep it
    if "/embed/episode/" in u:
        return u

    # Turn /episode/... into /embed/episode/...
    if "/episode/" in u:
        return u.replace("/episode/", "/embed/episode/", 1)

    return None


def _guess_provider(url: str) -> str | None:
    u = (url or "").strip()
    if not u:
        return "website"

    host = (urlparse(u).hostname or "").lower()

    if host == "ardaudiothek.de" or host.endswith(".ardaudiothek.de"):
        return "ard"
    if host == "spotify.com" or host.endswith(".spotify.com"):
        return "spotify"
    if host == "youtube.com" or host.endswith(".youtube.com") or host == "youtu.be" or host.endswith(".youtu.be"):
        return "youtube"
    if host == "soundcloud.com" or host.endswith(".soundcloud.com"):
        return "soundcloud"
    if host == "vimeo.com" or host.endswith(".vimeo.com"):
        return "vimeo"
    return "website"


def _as_str_or_none(v):
    v = (v or "").strip()
    return v or None


def _first_str_from_any(v):
    """
    FE sometimes sends list for fields that are strings in DB.
    - If list: pick first non-empty string
    - If str: return stripped
    """
    if v is None:
        return None
    if isinstance(v, list):
        for x in v:
            s = _as_str_or_none(str(x))
            if s:
                return s
        return None
    return _as_str_or_none(str(v))


def _list_of_str(v):
    """
    Turn FE taxonomy values into a clean list of strings.
    Accepts: list, json-string-list, csv, single string.
    """
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, str):
        v = v.strip()
        if not v:
            return []
        # try JSON list
        try:
            parsed = json.loads(v)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass
        # csv fallback
        if "," in v:
            return [x.strip() for x in v.split(",") if x.strip()]
        return [v]
    # fallback
    return [str(v).strip()] if str(v).strip() else []
