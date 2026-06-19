"""
Admin export endpoint: download a ZIP archive containing one CSV per data type,
optionally filtered by clinic.

Routes registered in urls.py:
  GET /api/admin/export/patients/?clinics=all   → ZIP download
  GET /api/admin/export/patients/?clinics=A,B   → ZIP filtered to those clinics
  GET /api/admin/export/clinics/                → JSON list of distinct clinic names

ZIP contents
------------
patients.csv            — demographics
rehab_calendar.csv      — scheduled intervention dates from RehabilitationPlans
intervention_logs.csv   — PatientInterventionLogs execution records
intervention_feedback.csv — per-intervention FeedbackEntry answers
health_vitals.csv       — manually-entered PatientVitals (weight, BP)
health_fitbit.csv       — FitbitData (steps, sleep, HR, ...)
questionnaire_answers.csv — PatientICFRating health-status questionnaire answers
thresholds.csv          — current PatientThresholds per patient
threshold_history.csv   — PatientThresholdsSnapshot change history
activity_logs.csv       — Logs (platform activity events)
"""

import csv
import io
import logging
import zipfile
from datetime import date

from django.http import HttpResponse, JsonResponse
from rest_framework.decorators import api_view, permission_classes

from bson import ObjectId

from core.models import (
    FitbitData,
    GeneralFeedback,
    Intervention,
    Logs,
    Patient,
    PatientICFRating,
    PatientInterventionLogs,
    PatientThresholds,
    PatientThresholdsSnapshot,
    PatientVitals,
    RehabilitationPlan,
    User,
)
from core.permissions import IsAdmin

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _fmt_date(dt):
    if dt is None:
        return ""
    try:
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return ""


def _fmt_datetime(dt):
    if dt is None:
        return ""
    try:
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return ""


def _join(lst):
    """Safely join a list of strings with semicolons."""
    if not lst:
        return ""
    return "; ".join(str(x) for x in lst if x)


def _therapist_name(patient):
    try:
        th = patient.therapist
        if th is None:
            return ""
        return f"{getattr(th, 'first_name', '') or ''} {getattr(th, 'name', '') or ''}".strip()
    except Exception:
        return ""


def _make_csv(headers, rows):
    """Return a StringIO containing a CSV with the given headers and row dicts."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buf


def _question_key(feedback_entry):
    try:
        q = feedback_entry.questionId
        return getattr(q, "questionKey", "") or ""
    except Exception:
        return ""


def _answer_keys(feedback_entry):
    try:
        return "; ".join(a.key for a in (feedback_entry.answerKey or []) if getattr(a, "key", None))
    except Exception:
        return ""


def _intervention_info(ref):
    """Return (external_id, title) from an Intervention reference, safe."""
    try:
        if ref is None:
            return "", ""
        return getattr(ref, "external_id", "") or "", getattr(ref, "title", "") or ""
    except Exception:
        return "", ""


# ---------------------------------------------------------------------------
# CSV sheet builders
# ---------------------------------------------------------------------------


def _csv_patients(patients):
    headers = [
        "clinic",
        "project",
        "patient_code",
        "first_name",
        "last_name",
        "age",
        "sex",
        "diagnosis",
        "function",
        "therapist",
        "reha_end_date",
        "study_end_date",
        "duration_days",
        "preferred_language",
        "created_at",
    ]
    rows = []
    for pt in patients:
        rows.append(
            {
                "clinic": getattr(pt, "clinic", "") or "",
                "project": getattr(pt, "project", "") or "",
                "patient_code": getattr(pt, "patient_code", "") or "",
                "first_name": getattr(pt, "first_name", "") or "",
                "last_name": getattr(pt, "name", "") or "",
                "age": getattr(pt, "age", "") or "",
                "sex": getattr(pt, "sex", "") or "",
                "diagnosis": _join(getattr(pt, "diagnosis", None)),
                "function": _join(getattr(pt, "function", None)),
                "therapist": _therapist_name(pt),
                "reha_end_date": _fmt_date(getattr(pt, "reha_end_date", None)),
                "study_end_date": _fmt_date(getattr(pt, "study_end_date", None)),
                "duration_days": str(getattr(pt, "duration", "") or ""),
                "preferred_language": getattr(pt, "preferred_language", "") or "",
                "created_at": _fmt_date(getattr(pt, "createdAt", None)),
            }
        )
    return _make_csv(headers, rows)


def _csv_rehab_calendar(patients, patient_map):
    """One row per scheduled date per intervention assignment per plan."""
    headers = [
        "clinic",
        "patient_code",
        "plan_status",
        "plan_start",
        "plan_end",
        "intervention_external_id",
        "intervention_title",
        "scheduled_date",
        "frequency",
        "notes",
    ]
    rows = []
    pt_ids = list(patient_map.keys())
    plans = list(RehabilitationPlan.objects(patientId__in=pt_ids))
    for plan in plans:
        pt_id = str(plan.patientId.id) if hasattr(plan.patientId, "id") else str(plan.patientId)
        pt = patient_map.get(pt_id)
        if not pt:
            continue
        clinic = getattr(pt, "clinic", "") or ""
        code = getattr(pt, "patient_code", "") or ""
        plan_start = _fmt_date(getattr(plan, "startDate", None))
        plan_end = _fmt_date(getattr(plan, "endDate", None))
        plan_status = getattr(plan, "status", "") or ""
        for assignment in getattr(plan, "interventions", None) or []:
            ext_id, title = _intervention_info(getattr(assignment, "interventionId", None))
            frequency = getattr(assignment, "frequency", "") or ""
            notes = getattr(assignment, "notes", "") or ""
            dates = getattr(assignment, "dates", None) or []
            if dates:
                for d in dates:
                    rows.append(
                        {
                            "clinic": clinic,
                            "patient_code": code,
                            "plan_status": plan_status,
                            "plan_start": plan_start,
                            "plan_end": plan_end,
                            "intervention_external_id": ext_id,
                            "intervention_title": title,
                            "scheduled_date": _fmt_date(d),
                            "frequency": frequency,
                            "notes": notes,
                        }
                    )
            else:
                rows.append(
                    {
                        "clinic": clinic,
                        "patient_code": code,
                        "plan_status": plan_status,
                        "plan_start": plan_start,
                        "plan_end": plan_end,
                        "intervention_external_id": ext_id,
                        "intervention_title": title,
                        "scheduled_date": "",
                        "frequency": frequency,
                        "notes": notes,
                    }
                )
    return _make_csv(headers, rows)


def _csv_intervention_logs(patient_map):
    headers = [
        "clinic",
        "patient_code",
        "intervention_external_id",
        "intervention_title",
        "date",
        "status",
        "comments",
        "created_at",
    ]
    rows = []
    pt_ids = list(patient_map.keys())
    logs = list(PatientInterventionLogs.objects(userId__in=pt_ids))
    for log in logs:
        try:
            pt_id = str(log.userId.id) if hasattr(log.userId, "id") else str(log.userId)
        except Exception:
            continue
        pt = patient_map.get(pt_id)
        if not pt:
            continue
        ext_id, title = _intervention_info(getattr(log, "interventionId", None))
        rows.append(
            {
                "clinic": getattr(pt, "clinic", "") or "",
                "patient_code": getattr(pt, "patient_code", "") or "",
                "intervention_external_id": ext_id,
                "intervention_title": title,
                "date": _fmt_date(getattr(log, "date", None)),
                "status": _join(getattr(log, "status", None)),
                "comments": getattr(log, "comments", "") or "",
                "created_at": _fmt_datetime(getattr(log, "createdAt", None)),
            }
        )
    return _make_csv(headers, rows)


def _csv_intervention_feedback(patient_map):
    """FeedbackEntry items embedded inside PatientInterventionLogs."""
    headers = [
        "clinic",
        "patient_code",
        "intervention_external_id",
        "log_date",
        "feedback_date",
        "question_key",
        "answer_keys",
        "comment",
    ]
    rows = []
    pt_ids = list(patient_map.keys())
    logs = list(PatientInterventionLogs.objects(userId__in=pt_ids))
    for log in logs:
        try:
            pt_id = str(log.userId.id) if hasattr(log.userId, "id") else str(log.userId)
        except Exception:
            continue
        pt = patient_map.get(pt_id)
        if not pt:
            continue
        ext_id, _ = _intervention_info(getattr(log, "interventionId", None))
        for entry in getattr(log, "feedback", None) or []:
            rows.append(
                {
                    "clinic": getattr(pt, "clinic", "") or "",
                    "patient_code": getattr(pt, "patient_code", "") or "",
                    "intervention_external_id": ext_id,
                    "log_date": _fmt_date(getattr(log, "date", None)),
                    "feedback_date": _fmt_date(getattr(entry, "date", None)),
                    "question_key": _question_key(entry),
                    "answer_keys": _answer_keys(entry),
                    "comment": getattr(entry, "comment", "") or "",
                }
            )
    return _make_csv(headers, rows)


def _csv_health_vitals(patient_map):
    headers = [
        "clinic",
        "patient_code",
        "date",
        "weight_kg",
        "bp_sys",
        "bp_dia",
        "source",
        "note",
    ]
    rows = []
    pt_ids = list(patient_map.keys())
    vitals = list(PatientVitals.objects(patientId__in=pt_ids).order_by("date"))
    for v in vitals:
        try:
            pt_id = str(v.patientId.id) if hasattr(v.patientId, "id") else str(v.patientId)
        except Exception:
            continue
        pt = patient_map.get(pt_id)
        if not pt:
            continue
        rows.append(
            {
                "clinic": getattr(pt, "clinic", "") or "",
                "patient_code": getattr(pt, "patient_code", "") or "",
                "date": _fmt_date(getattr(v, "date", None)),
                "weight_kg": str(getattr(v, "weight_kg", "") or ""),
                "bp_sys": str(getattr(v, "bp_sys", "") or ""),
                "bp_dia": str(getattr(v, "bp_dia", "") or ""),
                "source": getattr(v, "source", "") or "",
                "note": getattr(v, "note", "") or "",
            }
        )
    return _make_csv(headers, rows)


def _csv_health_fitbit(patients, user_map):
    """user_map: user_id string → Patient doc."""
    headers = [
        "clinic",
        "patient_code",
        "date",
        "steps",
        "active_minutes",
        "sleep_duration_min",
        "resting_heart_rate",
        "max_heart_rate",
        "calories",
        "distance_km",
        "weight_kg",
        "bp_sys",
        "bp_dia",
    ]
    rows = []
    user_ids = list(user_map.keys())
    fitbit_rows = list(FitbitData.objects(user__in=user_ids).order_by("date"))
    for fb in fitbit_rows:
        try:
            uid = str(fb.user.id) if hasattr(fb.user, "id") else str(fb.user)
        except Exception:
            continue
        pt = user_map.get(uid)
        if not pt:
            continue
        sleep = getattr(fb, "sleep", None)
        sleep_min = ""
        if sleep:
            sleep_min = str(getattr(sleep, "sleep_duration", "") or getattr(sleep, "minutes_asleep", "") or "")
        rows.append(
            {
                "clinic": getattr(pt, "clinic", "") or "",
                "patient_code": getattr(pt, "patient_code", "") or "",
                "date": _fmt_date(getattr(fb, "date", None)),
                "steps": str(getattr(fb, "steps", "") or ""),
                "active_minutes": str(getattr(fb, "active_minutes", "") or ""),
                "sleep_duration_min": sleep_min,
                "resting_heart_rate": str(getattr(fb, "resting_heart_rate", "") or ""),
                "max_heart_rate": str(getattr(fb, "max_heart_rate", "") or ""),
                "calories": str(getattr(fb, "calories", "") or ""),
                "distance_km": str(getattr(fb, "distance", "") or ""),
                "weight_kg": str(getattr(fb, "weight_kg", "") or ""),
                "bp_sys": str(getattr(fb, "bp_sys", "") or ""),
                "bp_dia": str(getattr(fb, "bp_dia", "") or ""),
            }
        )
    return _make_csv(headers, rows)


def _csv_questionnaire_answers(patient_map):
    """PatientICFRating — health-status questionnaire responses."""
    headers = [
        "clinic",
        "patient_code",
        "date",
        "icf_code",
        "question_key",
        "rating",
        "comment",
    ]
    rows = []
    pt_ids = list(patient_map.keys())
    ratings = list(PatientICFRating.objects(patientId__in=pt_ids).order_by("date"))
    for r in ratings:
        try:
            pt_id = str(r.patientId.id) if hasattr(r.patientId, "id") else str(r.patientId)
        except Exception:
            continue
        pt = patient_map.get(pt_id)
        if not pt:
            continue
        # Resolve question key
        try:
            q_key = getattr(r.questionId, "questionKey", "") or ""
        except Exception:
            q_key = ""
        # Comments from nested feedback_entries
        comments = "; ".join(
            (getattr(fe, "comment", "") or "")
            for fe in (getattr(r, "feedback_entries", None) or [])
            if (getattr(fe, "comment", "") or "").strip()
        )
        rows.append(
            {
                "clinic": getattr(pt, "clinic", "") or "",
                "patient_code": getattr(pt, "patient_code", "") or "",
                "date": _fmt_date(getattr(r, "date", None)),
                "icf_code": getattr(r, "icfCode", "") or "",
                "question_key": q_key,
                "rating": str(getattr(r, "rating", "") or ""),
                "comment": comments,
            }
        )
    return _make_csv(headers, rows)


def _csv_thresholds(patients):
    headers = [
        "clinic",
        "patient_code",
        "steps_goal",
        "active_minutes_green",
        "active_minutes_yellow",
        "sleep_green_min",
        "sleep_yellow_min",
        "bp_sys_green_max",
        "bp_sys_yellow_max",
        "bp_dia_green_max",
        "bp_dia_yellow_max",
    ]
    rows = []
    for pt in patients:
        th = getattr(pt, "thresholds", None)
        if th is None:
            continue
        rows.append(
            {
                "clinic": getattr(pt, "clinic", "") or "",
                "patient_code": getattr(pt, "patient_code", "") or "",
                "steps_goal": str(getattr(th, "steps_goal", "") or ""),
                "active_minutes_green": str(getattr(th, "active_minutes_green", "") or ""),
                "active_minutes_yellow": str(getattr(th, "active_minutes_yellow", "") or ""),
                "sleep_green_min": str(getattr(th, "sleep_green_min", "") or ""),
                "sleep_yellow_min": str(getattr(th, "sleep_yellow_min", "") or ""),
                "bp_sys_green_max": str(getattr(th, "bp_sys_green_max", "") or ""),
                "bp_sys_yellow_max": str(getattr(th, "bp_sys_yellow_max", "") or ""),
                "bp_dia_green_max": str(getattr(th, "bp_dia_green_max", "") or ""),
                "bp_dia_yellow_max": str(getattr(th, "bp_dia_yellow_max", "") or ""),
            }
        )
    return _make_csv(headers, rows)


def _csv_threshold_history(patients):
    headers = [
        "clinic",
        "patient_code",
        "effective_from",
        "changed_by",
        "reason",
        "steps_goal",
        "active_minutes_green",
        "active_minutes_yellow",
        "sleep_green_min",
        "sleep_yellow_min",
        "bp_sys_green_max",
        "bp_sys_yellow_max",
        "bp_dia_green_max",
        "bp_dia_yellow_max",
    ]
    rows = []
    for pt in patients:
        for snap in getattr(pt, "thresholds_history", None) or []:
            th = getattr(snap, "thresholds", None)
            rows.append(
                {
                    "clinic": getattr(pt, "clinic", "") or "",
                    "patient_code": getattr(pt, "patient_code", "") or "",
                    "effective_from": _fmt_datetime(getattr(snap, "effective_from", None)),
                    "changed_by": getattr(snap, "changed_by", "") or "",
                    "reason": getattr(snap, "reason", "") or "",
                    "steps_goal": str(getattr(th, "steps_goal", "") or "") if th else "",
                    "active_minutes_green": str(getattr(th, "active_minutes_green", "") or "") if th else "",
                    "active_minutes_yellow": str(getattr(th, "active_minutes_yellow", "") or "") if th else "",
                    "sleep_green_min": str(getattr(th, "sleep_green_min", "") or "") if th else "",
                    "sleep_yellow_min": str(getattr(th, "sleep_yellow_min", "") or "") if th else "",
                    "bp_sys_green_max": str(getattr(th, "bp_sys_green_max", "") or "") if th else "",
                    "bp_sys_yellow_max": str(getattr(th, "bp_sys_yellow_max", "") or "") if th else "",
                    "bp_dia_green_max": str(getattr(th, "bp_dia_green_max", "") or "") if th else "",
                    "bp_dia_yellow_max": str(getattr(th, "bp_dia_yellow_max", "") or "") if th else "",
                }
            )
    return _make_csv(headers, rows)


def _csv_activity_logs(patient_map):
    """Logs documents where the patient field matches a patient in the export scope."""
    headers = [
        "clinic",
        "patient_code",
        "action",
        "timestamp",
        "actor_role",
        "details",
    ]
    rows = []
    pt_ids = list(patient_map.keys())
    activity_logs = list(Logs.objects(patient__in=pt_ids).order_by("-timestamp"))
    for log in activity_logs:
        try:
            pt_ref = getattr(log, "patient", None)
            pt_id = str(pt_ref.id) if pt_ref and hasattr(pt_ref, "id") else str(pt_ref) if pt_ref else None
        except Exception:
            pt_id = None
        pt = patient_map.get(pt_id) if pt_id else None
        rows.append(
            {
                "clinic": getattr(pt, "clinic", "") if pt else "",
                "patient_code": getattr(pt, "patient_code", "") if pt else "",
                "action": getattr(log, "action", "") or "",
                "timestamp": _fmt_datetime(getattr(log, "timestamp", None)),
                "actor_role": getattr(log, "actor_role", "") or "",
                "details": getattr(log, "details", "") or "",
            }
        )
    return _make_csv(headers, rows)


# ---------------------------------------------------------------------------
# View functions
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_export_patients(request):
    """
    GET /api/admin/export/patients/?clinics=all
    GET /api/admin/export/patients/?clinics=Inselspital,Bern

    Returns a ZIP attachment containing one CSV per data type.
    """
    try:
        clinics_param = (request.GET.get("clinics") or "all").strip()

        if clinics_param.lower() == "all" or not clinics_param:
            qs = Patient.objects.all()
        else:
            requested = [c.strip() for c in clinics_param.split(",") if c.strip()]
            if not requested:
                return JsonResponse({"error": "No valid clinic names provided"}, status=400)
            qs = Patient.objects(clinic__in=requested)

        patients = list(qs.order_by("clinic", "patient_code"))

        # patient_id (str) → Patient doc — used for cross-collection lookups
        patient_map = {str(pt.pk): pt for pt in patients}

        # user_id (str) → Patient doc — used for FitbitData (indexed by User)
        user_map = {}
        for pt in patients:
            try:
                uid = str(pt.userId.id) if hasattr(pt.userId, "id") else str(pt.userId)
                user_map[uid] = pt
            except Exception:
                pass

        sheets = [
            ("patients.csv", _csv_patients(patients)),
            ("rehab_calendar.csv", _csv_rehab_calendar(patients, patient_map)),
            ("intervention_logs.csv", _csv_intervention_logs(patient_map)),
            ("intervention_feedback.csv", _csv_intervention_feedback(patient_map)),
            ("health_vitals.csv", _csv_health_vitals(patient_map)),
            ("health_fitbit.csv", _csv_health_fitbit(patients, user_map)),
            ("questionnaire_answers.csv", _csv_questionnaire_answers(patient_map)),
            ("thresholds.csv", _csv_thresholds(patients)),
            ("threshold_history.csv", _csv_threshold_history(patients)),
            ("activity_logs.csv", _csv_activity_logs(patient_map)),
        ]

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for filename, csv_buf in sheets:
                zf.writestr(filename, csv_buf.getvalue().encode("utf-8"))

        today = date.today().isoformat()
        filename = f"export_{today}.zip"

        response = HttpResponse(zip_buf.getvalue(), content_type="application/zip")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'

        # Audit log — persisted in MongoDB so it survives container restarts.
        # Wrapped in try/except so a DB hiccup never blocks the download.
        try:
            mongo_user = User.objects.get(pk=ObjectId(request.user.id))
            Logs(
                userId=mongo_user,
                action="ADMIN_EXPORT",
                actor_role="Admin",
                user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:300],
                details=f"clinics={clinics_param} rows={len(patients)}",
            ).save()
        except Exception:
            logger.warning("admin_export_patients: could not write audit log for user %s", getattr(request.user, "id", "?"))

        logger.info(
            "ADMIN_EXPORT user=%s clinics=%s patients=%d",
            getattr(request.user, "id", "?"),
            clinics_param,
            len(patients),
        )
        return response

    except Exception:
        logger.exception("admin_export_patients failed")
        return JsonResponse({"error": "Internal server error"}, status=500)


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_export_audit(request):
    """
    GET /api/admin/export/audit/
    Returns the audit log of all patient-data export downloads.
    Requires Admin role. Returns at most 200 most-recent entries.
    """
    try:
        entries = []
        for log in Logs.objects(action="ADMIN_EXPORT").order_by("-timestamp")[:200]:
            email = None
            try:
                email = log.userId.email
            except Exception:
                pass
            entries.append({
                "timestamp": log.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ") if log.timestamp else None,
                "user_email": email,
                "details": log.details or "",
                "user_agent": log.user_agent or "",
            })
        return JsonResponse({"total": len(entries), "entries": entries})
    except Exception:
        logger.exception("admin_export_audit failed")
        return JsonResponse({"error": "Internal server error"}, status=500)


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_export_clinics(request):
    """
    GET /api/admin/export/clinics/
    Returns distinct clinic names present in the Patient collection.
    Used by the frontend to populate the clinic-filter checkboxes.
    """
    try:
        clinics = sorted({(getattr(p, "clinic", "") or "").strip() for p in Patient.objects.only("clinic")} - {""})
        return JsonResponse({"clinics": clinics}, status=200)
    except Exception:
        logger.exception("admin_export_clinics failed")
        return JsonResponse({"error": "Internal server error"}, status=500)
