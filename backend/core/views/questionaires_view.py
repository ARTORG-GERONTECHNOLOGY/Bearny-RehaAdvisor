# views_questionnaires.py
import calendar
import json
import logging
import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import (
    AnswerOption,
    FeedbackQuestion,
    HealthQuestionnaire,
    Patient,
    PatientICFRating,
    QuestionnaireAssignment,
    RehabilitationPlan,
    Therapist,
    Translation,
    User,
)
from utils.scheduling import (
    _expand_dates,
    _merge_date_and_time,
    _parse_yyyy_mm_dd,
    _to_aware,
)

logger = logging.getLogger(__name__)


# --- frequency helpers --------------------------------------------------------
def _render_frequency(schedule: dict) -> str:
    """
    Build a human-readable summary from schedule dict:
    {interval, unit: 'day'|'week'|'month', selectedDays: ['Mon',...]}
    """
    if not schedule:
        return ""

    unit = (schedule.get("unit") or "week").lower()
    try:
        interval = max(1, int(schedule.get("interval") or 1))
    except Exception:
        interval = 1

    if unit == "day":
        return "Every day" if interval == 1 else f"Every {interval} days"

    if unit == "week":
        days = schedule.get("selectedDays") or []
        if days:
            daystr = ", ".join(days)
        else:
            daystr = "the same weekday"
        return ("Weekly on " + daystr) if interval == 1 else f"Every {interval} weeks on {daystr}"

    if unit == "month":
        return "Monthly" if interval == 1 else f"Every {interval} months"

    return ""


def _infer_frequency_from_dates(dts: list) -> str:
    """
    Very lightweight fallback if frequency wasn't stored:
    looks at first 2–4 dates and guesses daily/weekly/monthly cadence.
    """
    try:
        dates = sorted([d for d in dts])  # they are already datetimes
        if len(dates) < 2:
            return "Scheduled"
        # compute average delta in days between first few occurrences
        deltas = [(dates[i + 1] - dates[i]).days for i in range(min(3, len(dates) - 1))]
        if not deltas:
            return "Scheduled"
        avg = round(sum(deltas) / len(deltas))
        if avg <= 1:
            return "Every day" if avg == 1 else "Scheduled"
        if avg % 7 == 0:
            weeks = avg // 7
            return "Weekly" if weeks == 1 else f"Every {weeks} weeks"
        # simple monthly guess: ~30±2 days
        if 28 <= avg <= 32:
            return "Monthly"
        return f"Every {avg} days"
    except Exception:
        return "Scheduled"


# ------------------------------------------------------------------------------

# ─────────────────────────── ID helpers ───────────────────────────
_GROUP_RE = re.compile(r"^([A-Za-z0-9]+_[A-Za-z]+)")


def _prettify(group_key: str) -> str:
    parts = group_key.split("_", 1)
    if len(parts) == 2 and parts[0].isdigit():
        return f"{parts[1].capitalize()} ({parts[0]})"
    return group_key.replace("_", " ").title()


def _slugify(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")
    return s or "questionnaire"


def _resolve_creator_name(q: HealthQuestionnaire) -> str:
    try:
        creator = getattr(q, "created_by", None)
        if creator is None:
            return "System"
        return f"{creator.first_name or ''} {creator.name or ''}".strip() or "Unknown"
    except Exception:
        return "Unknown"


def _serialize_question_for_payload(question: FeedbackQuestion) -> Dict[str, Any]:
    return {
        "questionKey": question.questionKey,
        "answerType": question.answer_type,
        "translations": [
            {"language": tr.language, "text": tr.text} for tr in (getattr(question, "translations", None) or [])
        ],
        "possibleAnswers": [
            {
                "key": opt.key,
                "translations": [
                    {"language": tr.language, "text": tr.text} for tr in (getattr(opt, "translations", None) or [])
                ],
            }
            for opt in (getattr(question, "possibleAnswers", None) or [])
        ],
    }


def _serialize_answer_option(opt: Any) -> Dict[str, Any]:
    if hasattr(opt, "key"):
        return {
            "key": str(getattr(opt, "key", "")),
            "translations": [
                {"language": tr.language, "text": tr.text} for tr in (getattr(opt, "translations", None) or [])
            ],
        }
    return {"key": str(opt), "translations": [{"language": "en", "text": str(opt)}]}


def _serialize_health_questionnaire(q: HealthQuestionnaire) -> Dict[str, Any]:
    created_by_user_id = None
    try:
        creator = getattr(q, "created_by", None)
        if creator and creator.userId:
            created_by_user_id = str(creator.userId.id)
    except Exception:
        created_by_user_id = None

    questions = [qq for qq in (getattr(q, "questions", None) or []) if qq]
    return {
        "_id": str(q.id),
        "key": q.key,
        "title": q.title,
        "description": q.description or "",
        "tags": q.tags or [],
        "question_count": len(questions),
        "questions": [_serialize_question_for_payload(qq) for qq in questions],
        "created_by": created_by_user_id,
        "created_by_name": _resolve_creator_name(q),
    }


def _ensure_health_q_from_group(group_key: str, subject: str = "Healthstatus") -> HealthQuestionnaire:
    """
    Create or refresh a HealthQuestionnaire from grouped FeedbackQuestions
    (all questions whose questionKey starts with '<group_key>_').
    """
    qs = FeedbackQuestion.objects(questionSubject=subject, questionKey__startswith=f"{group_key}_")
    if not qs:
        raise HealthQuestionnaire.DoesNotExist(f"No FeedbackQuestions found for group '{group_key}'")

    try:
        hq = HealthQuestionnaire.objects.get(key=group_key)
        # refresh questions (and title if it was empty)
        hq.questions = list(qs)
        if not hq.title:
            hq.title = _prettify(group_key)
        if hq.tags is None:
            hq.tags = []
        if "dynamic" not in (hq.tags or []):
            hq.tags.append("dynamic")
        hq.save()
        return hq
    except HealthQuestionnaire.DoesNotExist:
        hq = HealthQuestionnaire(
            key=group_key,
            title=_prettify(group_key),
            description="",
            questions=list(qs),
            tags=["dynamic"],
        )
        hq.save()
        return hq


def _is_oid(val: str) -> bool:
    try:
        return bool(ObjectId.is_valid(str(val)))
    except Exception:
        return False


def _get_user_by_any(user_like) -> User:
    if user_like is None:
        raise User.DoesNotExist("No user value provided")
    s = str(user_like).strip()

    if _is_oid(s):
        try:
            return User.objects.get(pk=ObjectId(s))
        except User.DoesNotExist:
            pass
    try:
        return User.objects.get(username=s)
    except User.DoesNotExist:
        return User.objects.get(email=s)


def _get_patient_by_any_id(s: str) -> Patient:
    try:
        oid = ObjectId(s)
    except InvalidId:
        raise Patient.DoesNotExist
    try:
        return Patient.objects.get(id=oid)
    except Patient.DoesNotExist:
        return Patient.objects.get(userId=oid)


def _get_therapist_by_any(therapist_like) -> Therapist:
    if therapist_like is None:
        raise Therapist.DoesNotExist("No therapist value provided")
    s = str(therapist_like).strip()

    if _is_oid(s):
        try:
            return Therapist.objects.get(pk=ObjectId(s))
        except Therapist.DoesNotExist:
            try:
                user = User.objects.get(pk=ObjectId(s))
                return Therapist.objects.get(userId=user)
            except (User.DoesNotExist, Therapist.DoesNotExist):
                pass
    try:
        user = _get_user_by_any(s)
        return Therapist.objects.get(userId=user)
    except Exception:
        raise Therapist.DoesNotExist("Therapist matching query does not exist.")


# ───────────────────────── scheduling helpers ─────────────────────────

_WEEKDAY_IDX = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}


def _last_day_of_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _add_months(dt: datetime, months: int) -> datetime:
    y = dt.year + (dt.month - 1 + months) // 12
    m = (dt.month - 1 + months) % 12 + 1
    d = min(dt.day, _last_day_of_month(y, m))
    return dt.replace(year=y, month=m, day=d)


def _expand_dates(
    *,
    start_date: str | datetime,
    start_time: Optional[str] = "08:00",
    unit: str = "week",  # 'day' | 'week' | 'month'
    interval: int = 1,
    selected_days: Optional[List[str]] = None,  # for 'week'
    end: Optional[Dict[str, Any]] = None,  # {'type':'never'|'date'|'count', ...}
    max_occurrences: int = 365,
) -> List[datetime]:
    end = end or {"type": "never", "date": None, "count": None}
    interval = max(1, int(interval or 1))

    if isinstance(start_date, datetime):
        base_date_naive = datetime(start_date.year, start_date.month, start_date.day)
    else:
        parsed = _parse_yyyy_mm_dd(start_date)
        if not parsed:
            raise ValueError("start_date must be 'YYYY-MM-DD' or a datetime")
        base_date_naive = parsed
    current = _merge_date_and_time(base_date_naive, start_time)

    end_type = (end.get("type") or "never").lower()
    end_date_dt = _parse_yyyy_mm_dd(end.get("date")) if end_type == "date" else None
    end_date_aware = _merge_date_and_time(end_date_dt, start_time) if end_date_dt else None
    count_limit = int(end.get("count") or 0) if end_type == "count" else 0

    out: List[datetime] = []

    if unit == "day":
        while True:
            out.append(current)
            if end_type == "count" and len(out) >= count_limit:
                break
            if end_type == "date" and end_date_aware and current >= end_date_aware:
                break
            if len(out) >= max_occurrences:
                break
            current = current + timedelta(days=interval)
        return out

    if unit == "week":
        sel = sorted({_WEEKDAY_IDX[d] for d in (selected_days or []) if d in _WEEKDAY_IDX})
        if not sel:
            sel = [current.weekday()]
        week_monday = current - timedelta(days=current.weekday())
        weeks_added = 0
        while True:
            this_week_start = week_monday + timedelta(weeks=weeks_added * interval)
            for wd in sel:
                dt = this_week_start + timedelta(days=wd)
                dt = dt.replace(
                    hour=current.hour,
                    minute=current.minute,
                    second=0,
                    microsecond=0,
                    tzinfo=current.tzinfo,
                )
                if dt < current:
                    continue
                out.append(dt)
                if end_type == "count" and len(out) >= count_limit:
                    return sorted(out)[:count_limit]
                if end_type == "date" and end_date_aware and dt >= end_date_aware:
                    return sorted([d for d in out if d <= end_date_aware])
                if len(out) >= max_occurrences:
                    return sorted(out)[:max_occurrences]
            weeks_added += 1

    if unit == "month":
        while True:
            out.append(current)
            if end_type == "count" and len(out) >= count_limit:
                break
            if end_type == "date" and end_date_aware and current >= end_date_aware:
                break
            if len(out) >= max_occurrences:
                break
            current = _add_months(current, interval)
        return out

    # Fallback: weekly on start weekday
    return _expand_dates(
        start_date=start_date,
        start_time=start_time,
        unit="week",
        interval=interval,
        selected_days=[["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][current.weekday()]],
        end=end,
        max_occurrences=max_occurrences,
    )


# ───────────────────── list available questionnaires ─────────────────────


@csrf_exempt
@permission_classes([IsAuthenticated])
def list_health_questionnaires(request):
    """GET/POST /api/questionnaires/health/"""
    if request.method == "GET":
        # Ensure dynamic grouped questionnaires are represented as documents too,
        # so FE can list all assignable questionnaires from a single endpoint.
        dynamic_keys = set()
        for fq in FeedbackQuestion.objects(questionSubject="Healthstatus").only("questionKey"):
            m = _GROUP_RE.match(fq.questionKey or "")
            if m:
                dynamic_keys.add(m.group(1))
        for gk in dynamic_keys:
            try:
                _ensure_health_q_from_group(gk, subject="Healthstatus")
            except Exception:
                logger.warning("Could not ensure dynamic questionnaire for key '%s'", gk)

        qs = HealthQuestionnaire.objects().order_by("title")
        data = [_serialize_health_questionnaire(q) for q in qs]
        return JsonResponse(data, safe=False, status=200)

    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        payload = json.loads(request.body or "{}")
    except Exception:
        return JsonResponse({"error": "Invalid JSON payload"}, status=400)

    title = str(payload.get("title") or "").strip()
    description = str(payload.get("description") or "").strip()
    subject = str(payload.get("subject") or "Healthstatus").strip() or "Healthstatus"
    questions_raw = payload.get("questions") or []

    if not title:
        return JsonResponse({"error": "Missing title"}, status=400)
    if not isinstance(questions_raw, list) or not questions_raw:
        return JsonResponse({"error": "At least one question is required"}, status=400)

    # Resolve creator therapist from authenticated JWT user OR explicit therapistId fallback.
    creator = None
    try:
        if getattr(request, "user", None) and getattr(request.user, "id", None):
            creator = Therapist.objects.get(userId=str(request.user.id))
    except Exception:
        creator = None

    if creator is None:
        therapist_like = payload.get("therapistId")
        if therapist_like:
            try:
                creator = _get_therapist_by_any(therapist_like)
            except Exception:
                creator = None

    allowed_types = {"text", "select", "multi-select", "one-choice", "multiple-choice", "open-answer"}
    base_key = f"custom_{_slugify(title)}_{str(ObjectId())[-8:]}"
    created_questions: List[FeedbackQuestion] = []

    try:
        for idx, raw in enumerate(questions_raw, start=1):
            q_text = str((raw or {}).get("text") or "").strip()
            q_type = str((raw or {}).get("type") or "").strip().lower()
            options = (raw or {}).get("options") or []

            if not q_text:
                raise ValueError(f"Question #{idx}: missing text")
            if q_type not in allowed_types:
                raise ValueError(f"Question #{idx}: unsupported type '{q_type}'")

            if q_type in {"one-choice"}:
                q_type = "select"
            elif q_type in {"multiple-choice"}:
                q_type = "multi-select"
            elif q_type in {"open-answer"}:
                q_type = "text"

            option_docs: List[AnswerOption] = []
            if q_type in {"select", "multi-select"}:
                if not isinstance(options, list) or len([o for o in options if str(o).strip()]) < 2:
                    raise ValueError(f"Question #{idx}: at least two non-empty options are required")

                key_counts: Counter[str] = Counter()
                for opt in options:
                    opt_text = str(opt).strip()
                    if not opt_text:
                        continue
                    base_opt_key = _slugify(opt_text)
                    key_counts[base_opt_key] += 1
                    suffix = f"_{key_counts[base_opt_key]}" if key_counts[base_opt_key] > 1 else ""
                    option_docs.append(
                        AnswerOption(
                            key=f"{base_opt_key}{suffix}",
                            translations=[Translation(language="en", text=opt_text)],
                        )
                    )

            fq = FeedbackQuestion(
                questionSubject=subject,
                questionKey=f"{base_key}_{idx}_{str(ObjectId())[-6:]}",
                answer_type=q_type,
                translations=[Translation(language="en", text=q_text)],
                possibleAnswers=option_docs,
            ).save()
            created_questions.append(fq)

        hq = HealthQuestionnaire(
            key=base_key,
            title=title,
            description=description,
            questions=created_questions,
            tags=["custom", "shared"],
            created_by=creator,
        ).save()

        return JsonResponse(_serialize_health_questionnaire(hq), status=201)

    except ValueError as ve:
        logger.warning(
            "Invalid payload while creating custom health questionnaire: %s",
            ve,
            exc_info=True,
        )
        return JsonResponse({"error": str(ve)}, status=400)
    except Exception:
        logger.exception("Failed to create custom health questionnaire")
        return JsonResponse({"error": "An internal error has occurred."}, status=500)


# ───────────────────── optional dynamic grouping (for FE display only) ─────────────────────

_GROUP_RE = re.compile(r"^([A-Za-z0-9]+_[A-Za-z]+)")


def _prettify(group_key: str) -> str:
    parts = group_key.split("_", 1)
    if len(parts) == 2 and parts[0].isdigit():
        return f"{parts[1].capitalize()} ({parts[0]})"
    return group_key.replace("_", " ").title()


@csrf_exempt
@permission_classes([IsAuthenticated])
def list_dynamic_questionnaires(request):
    """
    GET /api/questionnaires/dynamic?subject=Healthstatus
    Groups FeedbackQuestions by the prefix of questionKey (e.g., "16_profile").
    """
    subject = request.GET.get("subject", "Healthstatus")
    qs = FeedbackQuestion.objects(questionSubject=subject)

    groups: Dict[str, Dict[str, Any]] = {}
    for q in qs:
        key = q.questionKey or ""
        m = _GROUP_RE.match(key)
        group_key = m.group(1) if m else "Ungrouped"
        grp = groups.setdefault(
            group_key,
            {
                "id": group_key,
                "title": _prettify(group_key),
                "question_ids": [],
                "count": 0,
            },
        )
        grp["question_ids"].append(str(q.id))
        grp["count"] += 1

    def _sort_key(item: Dict[str, Any]):
        gid = item["id"]
        num = gid.split("_", 1)[0]
        try:
            return (-int(num), item["title"])
        except ValueError:
            return (0, item["title"])

    out = sorted(groups.values(), key=_sort_key)
    return JsonResponse(out, safe=False, status=200)


# ───────────────────── list patient assignments ─────────────────────


@csrf_exempt
@permission_classes([IsAuthenticated])
def list_patient_questionnaires(request, patient_id):
    """GET /api/questionnaires/patient/<patient_id>/"""
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    try:
        patient = _get_patient_by_any_id(patient_id)
        plan = RehabilitationPlan.objects(patientId=patient).first()
        if not plan:
            return JsonResponse([], safe=False, status=200)

        now = timezone.now()
        ratings = list(PatientICFRating.objects(patientId=patient).order_by("-date"))

        out = []
        for a in plan.questionnaires or []:
            qdoc = getattr(a, "questionnaireId", None)
            if not qdoc:
                continue
            freq = (a.frequency or "").strip()
            if not freq:
                # infer from dates if needed
                freq = _infer_frequency_from_dates(a.dates or [])
            questions = [qq for qq in (getattr(qdoc, "questions", None) or []) if qq]
            question_ids = {str(qq.id) for qq in questions if getattr(qq, "id", None)}

            answered_entries = []
            for rating in ratings:
                rating_date = getattr(rating, "date", None)
                for entry in getattr(rating, "feedback_entries", None) or []:
                    qref = getattr(entry, "questionId", None)
                    qid = str(getattr(qref, "id", qref)) if qref else ""
                    if qid not in question_ids:
                        continue

                    q_trans = [
                        {"language": tr.language, "text": tr.text} for tr in (getattr(qref, "translations", None) or [])
                    ]
                    answers = [_serialize_answer_option(ans) for ans in (getattr(entry, "answerKey", None) or [])]
                    audio_url = getattr(entry, "audio_url", None)
                    media_urls = [audio_url] if audio_url else []
                    answered_at = getattr(entry, "date", None) or rating_date
                    if answered_at and timezone.is_naive(answered_at):
                        answered_at = timezone.make_aware(answered_at, timezone.get_current_timezone())
                    if answered_at and answered_at > now:
                        continue

                    answered_entries.append(
                        {
                            "questionKey": getattr(qref, "questionKey", "") or "",
                            "questionTranslations": q_trans,
                            "answerType": getattr(qref, "answer_type", None) or "text",
                            "answers": answers,
                            "comment": getattr(entry, "comment", "") or "",
                            "audio_url": audio_url,
                            "media_urls": media_urls,
                            "answered_at": answered_at.isoformat() if answered_at else None,
                        }
                    )

            out.append(
                {
                    "_id": str(qdoc.id),
                    "title": qdoc.title,
                    "description": qdoc.description or "",
                    "frequency": freq,
                    "dates": [d.isoformat() for d in (a.dates or [])],
                    "question_count": len(questions),
                    "questions": [_serialize_question_for_payload(qq) for qq in questions],
                    "answered_entries": answered_entries,
                }
            )
        return JsonResponse(out, safe=False, status=200)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)


# ───────────────────── assign / remove ─────────────────────


def _resolve_patient(pid: str) -> Patient:
    try:
        return Patient.objects.get(userId=ObjectId(pid))
    except Exception:
        return Patient.objects.get(pk=ObjectId(pid))


def _resolve_therapist(tid: Optional[str], patient: Optional[Patient]) -> Optional[Therapist]:
    if tid:
        try:
            return _get_therapist_by_any(tid)
        except Therapist.DoesNotExist:
            pass
    if patient and patient.therapist:
        return patient.therapist
    return None


@csrf_exempt
@permission_classes([IsAuthenticated])
def assign_questionnaire(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body or "{}")

        patient_id = data.get("patientId")
        therapist_id = data.get("therapistId")
        qid_raw = data.get("questionnaireId")
        qkey_raw = data.get("questionnaireKey") or data.get("groupKey")
        schedule = data.get("schedule") or {}
        frequency_in = (data.get("frequency") or "").strip()
        notes = data.get("notes") or ""
        effective_from = data.get("effectiveFrom")  # YYYY-MM-DD
        subject = data.get("subject") or "Healthstatus"

        if not patient_id:
            return JsonResponse({"error": "Missing patientId"}, status=400)
        if not (qid_raw or qkey_raw):
            return JsonResponse({"error": "Missing questionnaireId or questionnaireKey"}, status=400)

        # resolve patient & therapist (your existing helpers)
        patient = _get_patient_by_any_id(patient_id)
        therapist = _resolve_therapist(therapist_id, patient)
        if therapist is None:
            return JsonResponse({"error": "Therapist not found"}, status=404)

        # resolve HealthQuestionnaire document (your existing logic)
        q_doc = None
        if qid_raw and _is_oid(qid_raw):
            q_doc = HealthQuestionnaire.objects.get(pk=ObjectId(qid_raw))
        if q_doc is None and (qkey_raw or qid_raw):
            key = (qkey_raw or qid_raw).strip()
            try:
                q_doc = HealthQuestionnaire.objects.get(key=key)
            except HealthQuestionnaire.DoesNotExist:
                if _GROUP_RE.match(key):
                    q_doc = _ensure_health_q_from_group(key, subject=subject)
                else:
                    return JsonResponse(
                        {"error": "questionnaireId must be a valid ObjectId or known key"},
                        status=400,
                    )

        # get or create the plan
        plan = RehabilitationPlan.objects(patientId=patient).first()
        if not plan:
            plan = RehabilitationPlan(
                patientId=patient,
                therapistId=therapist,
                startDate=timezone.now(),
                endDate=getattr(patient, "study_end_date", None)
                or getattr(patient, "reha_end_date", None)
                or (timezone.now() + timedelta(days=365)),
                status="active",
                interventions=[],
                questionnaires=[],
            )

        if not hasattr(plan, "questionnaires") or plan.questionnaires is None:
            plan.questionnaires = []

        # default start if none provided
        start_for_schedule = effective_from or schedule.get("startDate")
        if not start_for_schedule:
            start_for_schedule = (timezone.now() + timedelta(days=1)).date().isoformat()

        # expand occurrences (uses your _expand_dates helper)
        dates = _expand_dates(
            start_date=start_for_schedule,
            start_time=schedule.get("startTime") or "08:00",
            unit=(schedule.get("unit") or "week"),
            interval=int(schedule.get("interval") or 1),
            selected_days=(schedule.get("selectedDays") or []),
            end=(schedule.get("end") or {"type": "never"}),
            max_occurrences=365,
        )

        # build frequency string (prefer FE-provided, else render from schedule)
        freq_str = frequency_in or _render_frequency(schedule)

        # upsert by questionnaireId
        updated = False
        for qa in plan.questionnaires:
            if getattr(qa, "questionnaireId", None) and str(qa.questionnaireId.id) == str(q_doc.id):
                if effective_from:
                    eff_naive = _parse_yyyy_mm_dd(effective_from)
                    eff = _merge_date_and_time(eff_naive, schedule.get("startTime") or "08:00") if eff_naive else None
                    cutoff_date = eff.date() if eff else None
                    qa.dates = [
                        d for d in (qa.dates or []) if (not cutoff_date or _to_aware(d).date() < cutoff_date)
                    ] + dates
                else:
                    qa.dates = dates or qa.dates
                # update frequency string (keeps old if both empty)
                qa.frequency = (freq_str or qa.frequency or "").strip()
                qa.notes = notes or qa.notes
                updated = True
                break

        if not updated:
            plan.questionnaires.append(
                QuestionnaireAssignment(
                    questionnaireId=q_doc,
                    frequency=(freq_str or "").strip(),
                    dates=dates,
                    notes=notes,
                )
            )

        plan.updatedAt = timezone.now()
        plan.save()
        return JsonResponse({"message": "assigned", "questionnaireId": str(q_doc.id)}, status=200)

    except HealthQuestionnaire.DoesNotExist:
        return JsonResponse({"error": "Questionnaire not found"}, status=404)
    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Exception as e:
        logger.exception("assign_questionnaire failed")
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def remove_questionnaire(request):
    """POST /api/questionnaires/remove/"""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        payload = json.loads(request.body or "{}")
        patient_id = payload.get("patientId")
        questionnaire_id = payload.get("questionnaireId")

        if not (patient_id and questionnaire_id):
            return JsonResponse({"error": "Missing patientId or questionnaireId"}, status=400)
        if not _is_oid(questionnaire_id):
            return JsonResponse({"error": "questionnaireId must be a valid ObjectId"}, status=400)

        try:
            patient = _get_patient_by_any_id(patient_id)
        except Patient.DoesNotExist:
            return JsonResponse({"error": "Patient not found"}, status=404)

        plan = RehabilitationPlan.objects(patientId=patient).first()
        if not plan or not getattr(plan, "questionnaires", None):
            return JsonResponse({"message": "ok"}, status=200)

        q_oid = ObjectId(questionnaire_id)
        plan.questionnaires = [
            qa
            for qa in plan.questionnaires
            if not (getattr(qa, "questionnaireId", None) and qa.questionnaireId.id == q_oid)
        ]
        plan.updatedAt = timezone.now()
        plan.save()
        return JsonResponse({"message": "removed"}, status=200)

    except Exception as e:
        logger.exception("remove_questionnaire failed")
        return JsonResponse({"error": str(e)}, status=500)
