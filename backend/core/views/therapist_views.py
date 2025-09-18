from bson import ObjectId
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
import json
from core.models import Patient, Therapist, User, Logs, PatientICFRating, FitbitData, PatientInterventionLogs, GeneralFeedback
from django.utils.dateparse import parse_datetime
from datetime import datetime, timedelta
from statistics import mean
from utils.utils import _adherence, resolve_patient
LOOKBACK_DAYS = 7
FILE_TYPE_FOLDERS = {
    "mp4": "videos",
    "mp3": "audio",
    "jpg": "images",
    "png": "images",
    "pdf": "documents",
}

def _avg(lst):
    lst = [x for x in lst if isinstance(x, (int, float))]
    return round(mean(lst), 1) if lst else None
import logging

from django.utils import timezone
LOOKBACK_DAYS_7 = 7
from core.models import PatientInterventionLogs, RehabilitationPlan

logger = logging.getLogger(__name__)

from datetime import datetime, timedelta
from django.utils import timezone

def _adherence(patient, lookback_days: int = 7):
    """
    Returns (adherence_7d, adherence_total_until_now) for the patient.

    - Denominator uses scheduled occurrences from RehabilitationPlan.interventions[].dates
      that fall inside the window (7d) or up to 'now'.
    - Numerator uses PatientInterventionLogs with status containing 'completed'.
    - All datetimes (schedule + logs) are normalized to timezone-aware before comparison.
    - Falls back to completed/(completed+skipped) if no schedule was created for the window.
    """
    now = timezone.now()                       # aware
    since = now - timedelta(days=lookback_days)

    # ---- helpers ------------------------------------------------------------
    def _to_dt(v):
        """Accept datetime or ISO string -> datetime (may be naive)."""
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            try:
                s = v.strip()
                if s.endswith("Z"):
                    s = s[:-1] + "+00:00"
                return datetime.fromisoformat(s)
            except Exception:
                return None
        return None

    def _aware(dt: datetime | None) -> datetime | None:
        """Make a datetime timezone-aware (current TZ; fallback UTC)."""
        if not isinstance(dt, datetime):
            return None
        if timezone.is_naive(dt):
            try:
                return timezone.make_aware(dt, timezone.get_current_timezone())
            except Exception:
                return timezone.make_aware(dt, timezone.utc)
        return dt

    # ---- scheduled dates from the plan -------------------------------------
    denom_total = 0
    denom_7 = 0
    plan = RehabilitationPlan.objects(patientId=patient).first()
    if plan:
        for ia in (getattr(plan, "interventions", []) or []):
            for d in (getattr(ia, "dates", []) or []):
                dt = _aware(_to_dt(d))
                if not dt:
                    continue
                if dt <= now:
                    denom_total += 1
                if since <= dt <= now:
                    denom_7 += 1

    # ---- logs (don’t date-filter in query; normalize per-row) --------------
    comp_total = comp_7 = 0
    skip_total = skip_7 = 0
    for lg in PatientInterventionLogs.objects(userId=patient).only("date", "status"):
        dt = _aware(getattr(lg, "date", None))
        if not dt:
            continue
        statuses = {s.lower() for s in (lg.status or [])}
        is_completed = "completed" in statuses
        is_skipped = "skipped" in statuses

        if dt <= now:
            if is_completed: comp_total += 1
            if is_skipped:   skip_total += 1
        if since <= dt <= now:
            if is_completed: comp_7 += 1
            if is_skipped:   skip_7 += 1

    # ---- adherence (fallback to completed/(completed+skipped) when no schedule)
    adh_total = round(100 * comp_total / denom_total) if denom_total else (
        round(100 * comp_total / (comp_total + skip_total)) if (comp_total + skip_total) else None
    )
    adh_7 = round(100 * comp_7 / denom_7) if denom_7 else (
        round(100 * comp_7 / (comp_7 + skip_7)) if (comp_7 + skip_7) else None
    )

    return adh_7, adh_total


now = timezone.now()
since7 = now - timedelta(days=LOOKBACK_DAYS_7)

def _day_key(dt):
    # compare by calendar day; tolerant to time-of-day differences
    return dt.date()

# core/views/therapist_views.py  (helpers)

from datetime import datetime, timedelta
from django.utils import timezone
from bson import ObjectId

from core.models import RehabilitationPlan, PatientICFRating, GeneralFeedback  # GeneralFeedback unused here but OK to import

def _sum_points_for_day(rating_docs, question_ids_set):
    """
    Sum numeric answer keys for the given day across rating docs,
    only for entries whose questionId belongs to the questionnaire's questions.
    Accepts AnswerOption objects with `.key` or plain strings.
    Ignores "0" (Do not want to answer).
    """
    total = 0
    for r in rating_docs:
        for fe in (getattr(r, "feedback_entries", None) or []):
            qid = getattr(fe, "questionId", None)
            if not qid:
                continue
            # deref or plain id → string
            qid_str = str(getattr(qid, "id", qid))
            if qid_str not in question_ids_set:
                continue

            for ak in (getattr(fe, "answerKey", None) or []):
                key = ak if isinstance(ak, str) else getattr(ak, "key", None)
                try:
                    v = int(str(key).strip())
                except Exception:
                    v = 0
                if v > 0:
                    total += v
    return total


def _feedback_computing(patient):
    """
    Build a questionnaires_summary for a patient and return (summary, last_feedback_at_dt).

    Each item:
      {
        questionnaireId, key, title,
        expected_total, expected_7,
        answered_total, answered_7,
        adherence_total, adherence_7,
        last_answered_at, last_score, prev_score, delta_score,
        low_score
      }
    All datetimes returned ISO formatted strings (aware).
    """
    now = timezone.now()                 # aware
    since7 = now - timedelta(days=7)

    def _to_dt(val):
        """Accept datetime or ISO string -> datetime (naive or aware)."""
        if isinstance(val, datetime):
            return val
        if isinstance(val, str):
            try:
                s = val.strip()
                if s.endswith("Z"):
                    s = s[:-1] + "+00:00"
                return datetime.fromisoformat(s)
            except Exception:
                return None
        return None

    def _aware(dt):
        """Make datetime timezone-aware (current TZ; fall back to UTC)."""
        if not isinstance(dt, datetime):
            return None
        if timezone.is_naive(dt):
            try:
                return timezone.make_aware(dt, timezone.get_current_timezone())
            except Exception:
                try:
                    return timezone.make_aware(dt, timezone.utc)
                except Exception:
                    return dt
        return dt

    # Resolve plan & assignments
    plan = RehabilitationPlan.objects(patientId=patient).first()
    assignments = list(getattr(plan, "questionnaires", []) or [])
    if not assignments:
        return [], None

    summary = []
    global_last = None  # aware dt

    for qa in assignments:
        qdoc = getattr(qa, "questionnaireId", None)
        if not qdoc:
            continue

        # ---- set of question ids (strings) this questionnaire contains ----
        question_ids_set = set()
        for q in (getattr(qdoc, "questions", []) or []):
            try:
                question_ids_set.add(str(q.id if hasattr(q, "id") else ObjectId(str(q))))
            except Exception:
                pass

        if not question_ids_set:
            # Nothing to compute for this assignment
            summary.append({
                "questionnaireId": str(getattr(qdoc, "id", "")),
                "key": getattr(qdoc, "key", None),
                "title": getattr(qdoc, "title", None),
                "expected_total": 0,
                "expected_7": 0,
                "answered_total": 0,
                "answered_7": 0,
                "adherence_total": None,
                "adherence_7": None,
                "last_answered_at": None,
                "last_score": None,
                "prev_score": None,
                "delta_score": None,
                "low_score": False,
            })
            continue

        # ---- normalize scheduled dates for this questionnaire ----
        raw_dates = getattr(qa, "dates", []) or []
        dates = []
        for d in raw_dates:
            dt = _aware(_to_dt(d))
            if dt:
                dates.append(dt)

        expected_total = sum(1 for d in dates if d <= now)
        expected_7 = sum(1 for d in dates if since7 <= d <= now)

        # We only need ratings from the earliest scheduled date (if any)
        earliest_cut = None
        if dates:
            try:
                earliest_cut = min(dates)
            except Exception:
                earliest_cut = None

        # ---- pull PatientICFRating docs, newest first ----
        ratings_qs = PatientICFRating.objects(patientId=patient).order_by("-date")
        if earliest_cut:
            ratings_qs = ratings_qs.filter(date__gte=earliest_cut)

        # ---- group relevant ratings by calendar day ----
        day_to_docs = {}  # {date(): [rating_docs]}
        for r in ratings_qs:
            rdt = _aware(getattr(r, "date", None))
            if not isinstance(rdt, datetime):
                continue

            # skip docs that don't contain any entry for this questionnaire
            contains_relevant = False
            for fe in (getattr(r, "feedback_entries", None) or []):
                qid = getattr(fe, "questionId", None)
                qid_str = str(getattr(qid, "id", qid))
                if qid_str in question_ids_set:
                    contains_relevant = True
                    break
            if not contains_relevant:
                continue

            dkey = rdt.date()
            day_to_docs.setdefault(dkey, []).append(r)

        # answered counts
        all_answer_days_sorted = sorted(
            [d for d in day_to_docs.keys() if d <= now.date()],
            reverse=True
        )
        answered_total = len(all_answer_days_sorted)
        answered_7 = sum(1 for d in all_answer_days_sorted if since7.date() <= d <= now.date())

        # scores: last day & previous day (sum of numeric answer keys)
        last_dt = None
        last_score = None
        prev_score = None

        if all_answer_days_sorted:
            last_day = all_answer_days_sorted[0]
            # pick the max datetime within that day as "last answered at"
            last_dt = max(
                (_aware(getattr(doc, "date", None)) for doc in day_to_docs[last_day] if getattr(doc, "date", None)),
                default=None
            )
            last_score = _sum_points_for_day(day_to_docs[last_day], question_ids_set)

        if len(all_answer_days_sorted) > 1:
            prev_day = all_answer_days_sorted[1]
            prev_score = _sum_points_for_day(day_to_docs[prev_day], question_ids_set)

        delta_score = (last_score - prev_score) if (last_score is not None and prev_score is not None) else None

        adherence_total = round(100 * answered_total / expected_total) if expected_total else None
        adherence_7 = round(100 * answered_7 / expected_7) if expected_7 else None

        # update global last
        if last_dt and (global_last is None or last_dt > global_last):
            global_last = last_dt

        summary.append(
            {
                "questionnaireId": str(getattr(qdoc, "id", "")),
                "key": getattr(qdoc, "key", None),
                "title": getattr(qdoc, "title", None),

                "expected_total": expected_total,
                "expected_7": expected_7,
                "answered_total": answered_total,
                "answered_7": answered_7,
                "adherence_total": adherence_total,
                "adherence_7": adherence_7,

                "last_answered_at": (last_dt.isoformat() if last_dt else None),
                "last_score": last_score,
                "prev_score": prev_score,
                "delta_score": delta_score,
                "low_score": bool(last_score is not None and last_score <= 2),
            }
        )

    return summary, global_last





@csrf_exempt
@permission_classes([IsAuthenticated])
def list_therapist_patients(request, therapist_id):
    try:
        therapist = Therapist.objects.get(userId=ObjectId(therapist_id))
    except Therapist.DoesNotExist:
        logger.warning("Therapist with ID %s not found.", therapist_id)
        return JsonResponse({"error": "Therapist not found"}, status=404)

    since = datetime.utcnow() - timedelta(days=LOOKBACK_DAYS)
    out = []

    # Avoid automatic deref (prevents exceptions on broken refs)
    patients_qs = (
        Patient.objects(therapist=therapist)
        .only("first_name", "name", "sex", "diagnosis", "age",
              "patient_code", "userId", "reha_end_date")
        .no_dereference()
    )

    for patient in patients_qs:
        # ---- resolve user safely ----
        uid_ref = getattr(patient, "userId", None)  # DBRef or ObjectId or None
        uid = getattr(uid_ref, "id", uid_ref) if uid_ref else None  # extract ObjectId
        u = User.objects(id=uid).first() if uid else None  # may be None

        # ---- last online / login ----
        last_online_dt = None
        if u:
            last_login_log = Logs.objects(userId=u, action="LOGIN").order_by("-timestamp").first()
            if last_login_log:
                last_online_dt = last_login_log.timestamp
            if last_online_dt is None:
                last_online_dt = getattr(u, "last_online", None) or getattr(u, "last_login", None)

        # ---- latest feedback summary ----
        summary, last_feedback_at_dt = _feedback_computing(patient)

        # ---- Fitbit 7-day averages ----
        steps_vals, activity_vals, sleep_hours = [], [], []
        if u:
            fitbit_qs = FitbitData.objects(user=u, date__gte=since).only("steps", "active_minutes", "sleep")
            steps_vals = [doc.steps for doc in fitbit_qs if doc.steps is not None]
            activity_vals = [doc.active_minutes for doc in fitbit_qs if doc.active_minutes is not None]
            for doc in fitbit_qs:
                dur_ms = getattr(getattr(doc, "sleep", None), "sleep_duration", None)
                if isinstance(dur_ms, (int, float)):
                    sleep_hours.append(dur_ms / 3600000.0)

        biomarker = {
            "sleep_avg_h": _avg(sleep_hours),
            "activity_min": _avg(activity_vals),
            "steps_avg": _avg(steps_vals),
        }

        adh_7, adh_total = _adherence(patient)

        out.append({
            "_id": str(patient.pk),
            "first_name": patient.first_name,
            "name": patient.name,
            "sex": patient.sex,
            "diagnosis": patient.diagnosis,
            "age": patient.age,
            "created_at": (u.createdAt.isoformat() if (u and getattr(u, "createdAt", None)) else None),
            "patient_code": getattr(patient, "patient_code", "-"),
            "last_online": (last_online_dt.isoformat() if isinstance(last_online_dt, datetime) else None),
            "last_feedback_at": (last_feedback_at_dt.isoformat() if last_feedback_at_dt else None),
            "questionnaires": summary,
            "feedback_low": any(it.get("low_score") for it in summary),
            "biomarker": biomarker,
            "adherence_rate": adh_7,
            "adherence_total": adh_total,
        })

    return JsonResponse(out, safe=False, status=200)



@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patients_by_therapist(request, therapist_id):
    """
    GET /api/therapists/<therapist_id>/patients/
    Returns list of patients (first name, last name, id) assigned to a therapist.
    """
    try:
        patients = Patient.objects.filter(therapistId=ObjectId(therapist_id))
        data = [
            {
                "id": str(p.userId),
                "firstName": p.first_name,
                "lastName": p.name,
            }
            for p in patients
        ]
        return JsonResponse(data, safe=False, status=200)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
@permission_classes([IsAuthenticated])
def create_log(request):
    try:
        data = json.loads(request.body)
        user = data.get('user')
      
        # Parse datetime safely
        started = parse_datetime(data.get("started")) if data.get("started") else None
        ended = parse_datetime(data.get("ended")) if data.get("ended") else None
        patient = data.get("patient")  # Optional patient reference
        if patient:
            patient = Patient.objects.get(pk=ObjectId(patient))
        if user:
            user = User.objects.get(id=ObjectId(user))
        log = Logs(
            userId=user,
            action=data.get("action", "OTHER"),
            started=started,
            ended=ended,
            userAgent=data.get("userAgent", ""),
            patient=patient,
            details=data.get("details", "")[:500],
        )
        log.save()
        logger.info(f"[i13n] Log saved for user {user.id} with action {log.action}")
        return JsonResponse({"status": "ok", "log_id": str(log.id)}, status=201)

    except Exception as e:
        logger.error(f"[i13n] Failed to save log: {e}", exc_info=True)
        return JsonResponse({"error": "Failed to create log"}, status=500)
