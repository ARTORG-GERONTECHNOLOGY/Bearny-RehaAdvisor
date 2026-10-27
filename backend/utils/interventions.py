import json
import logging
import os
import time
import unicodedata
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from bson import ObjectId
from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone
from mongoengine.errors import DoesNotExist

from core.models import (
    DiagnosisAssignmentSettings,
    FeedbackQuestion,
    Intervention,
    InterventionAssignment,
    InterventionMedia,
)
from utils.config import config
from utils.scheduling import _as_utc
from utils.utils import sanitize_text

# Module-level cache since star question IDs rarely change; re-query at most every 10 minutes.
_star_q_ids_cache: dict = {"ids": None, "ts": 0.0}
_STAR_Q_CACHE_TTL = 600  # seconds

MAX_LIST_ITEMS = 30
MAX_ITEM_LEN = 80
_MEDIA_TYPES = set(InterventionMedia.media_type.choices)


def _get_star_q_ids() -> list:
    now = time.monotonic()
    cached_ids = _star_q_ids_cache["ids"]
    if cached_ids is None or now - _star_q_ids_cache["ts"] > _STAR_Q_CACHE_TTL:
        ids = [q.id for q in FeedbackQuestion.objects(questionKey__startswith="rating_stars_").only("id")]
        _star_q_ids_cache.update({"ids": ids, "ts": now})
        return ids
    return cached_ids


def _parse_star_key(key) -> Optional[int]:
    """Parse a single answerKey.key into a 1-5 star rating, or None if it isn't one.

    The single source of truth for what counts as a valid star rating - every
    view that aggregates ratings (Python or Mongo) must funnel through this so
    they can't silently disagree on borderline values (e.g. stray whitespace).
    """
    try:
        v = int(str(key).strip())
    except (ValueError, TypeError):
        return None
    return v if 1 <= v <= 5 else None


def _star_rating_value(question_id, answer_keys, star_q_ids) -> Optional[int]:
    """Return the 1-5 star rating in answer_keys if question_id is a star question, else None."""
    if question_id not in star_q_ids:
        return None
    for ak in answer_keys or []:
        key = ak if isinstance(ak, str) else getattr(ak, "key", None)
        value = _parse_star_key(key)
        if value is not None:
            return value
    return None


logger = logging.getLogger(__name__)


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


def _variant_ids_for_external_id(external_id: str) -> List[ObjectId]:
    """Ids of all Intervention documents sharing this external_id (its language variants)."""
    if not external_id:
        return []
    return [v.id for v in Intervention.objects(external_id=external_id).only("id")]


def _variant_ids_by_external_id(external_ids) -> Dict[str, List[ObjectId]]:
    """The same mapping for many external_ids at once, in a single query.

    Callers rendering a whole plan would otherwise pay one round trip per assignment.
    """
    wanted = {e for e in external_ids if e}
    if not wanted:
        return {}

    out: Dict[str, List[ObjectId]] = {e: [] for e in wanted}
    for v in Intervention.objects(external_id__in=list(wanted)).only("id", "external_id"):
        out[v.external_id].append(v.id)
    return out


# --------------------------------------------------------------------------------------
# Plan-assignment resolution
#
# Matching on interventionId alone treats two language variants of one intervention as
# unrelated, which is how a plan ends up holding the same intervention twice.
# --------------------------------------------------------------------------------------


def _safe_intervention(assignment):
    """An assignment's Intervention, or None when the reference dangles.

    A deleted Intervention raises the base DoesNotExist on dereference, which getattr's default
    does not catch - so every caller that walks plan.interventions needs this, not getattr.
    """
    try:
        return assignment.interventionId
    except DoesNotExist:
        return None


def _plan_assignments_for(plan, intervention):
    """Every assignment on the plan holding this logical intervention, in plan order.

    Grouped by external_id, which is what makes two language variants one intervention: the plan
    stores whichever variant document was assigned, while callers arrive holding another. A
    document without an external_id can only be matched by its own id.
    """
    external_id = getattr(intervention, "external_id", None)
    target_id = str(getattr(intervention, "id", None))

    out = []
    for a in plan.interventions or []:
        iv = _safe_intervention(a)
        if iv is None:
            continue
        if external_id:
            matched = getattr(iv, "external_id", None) == external_id
        else:
            matched = str(iv.id) == target_id
        if matched:
            out.append(a)
    return out


def _canonical_assignment_for(plan, intervention):
    """The one assignment readers display and writers merge into, or None.

    A plan holding the same intervention twice is legacy data, so the first in plan order wins:
    it is the row both plan views already render as canonical.
    """
    matches = _plan_assignments_for(plan, intervention)
    return matches[0] if matches else None


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
        "media_slot": getattr(m, "media_slot", None),
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


BASE_ANCHOR = "2000-01-03"  # fixed Monday origin so "Day N" is stable and Day 1 previews as Monday


def _occ_count_for_day_range(start_day, end_day, interval):
    return max(1, (end_day - start_day) // max(1, interval) + 1)


def _segment_end(day_one, unit, interval, start_day, end_day):
    """Returns (end, max_occurrences) for _expand_dates so a block covers template days start_day..end_day."""
    if unit == "day":
        count = _occ_count_for_day_range(start_day, end_day, interval)
        return {"type": "count", "count": count}, count
    last_day = day_one + timedelta(days=max(start_day, end_day) - 1)
    return {"type": "date", "date": last_day.isoformat()[:10]}, 2000


def _anchor_date_for_day(day_n: int) -> str:
    base = datetime.fromisoformat(f"{BASE_ANCHOR}T00:00:00")
    start = base + timedelta(days=max(1, day_n) - 1)
    return start.date().isoformat()


def _instant_key(value: datetime) -> datetime:
    """Second-precision UTC key for date dedup.

    Mongo hands assignment dates back naive while callers pass aware local ones; comparing the two
    frames unnormalised never matches, so the same session gets appended twice.
    """
    return _as_utc(value).replace(microsecond=0)


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
    found = _canonical_assignment_for(plan, intervention)

    dates = _dedup_dates(dates)

    if found:
        if overwrite and effective_from:
            # effective_from arrives in local time; found.dates come back from Mongo naive, where
            # naive means UTC. Comparing the two frames unnormalised raises TypeError.
            eff = effective_from if effective_from.tzinfo else timezone.make_aware(effective_from)
            kept = [d for d in (found.dates or []) if _as_utc(d) < eff]
            found.dates = kept + dates
        else:
            # Existing dates are filtered too, not just carried over: a legacy assignment holding
            # the same instant twice would otherwise keep serving two sessions for one day.
            seen = set()
            merged = []
            for d in list(found.dates or []) + list(dates):
                key = _instant_key(d)
                if key not in seen:
                    seen.add(key)
                    merged.append(d)
            found.dates = merged
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


def _strip_invisible(s: str) -> str:
    # remove control/format chars (Cc/Cf), keeps normal chars
    return "".join(ch for ch in (s or "") if unicodedata.category(ch) not in ("Cc", "Cf"))


def _is_valid_url(u: str) -> bool:
    try:
        p = urlparse(_strip_invisible((u or "").strip()))
    except ValueError:
        return False
    return p.scheme in ("http", "https") and bool(p.netloc)


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
    return hint if hint in _MEDIA_TYPES else "text"


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
