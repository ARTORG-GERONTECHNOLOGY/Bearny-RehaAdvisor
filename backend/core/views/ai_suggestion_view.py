"""
AI therapy plan suggestion endpoints.

Phase 2 implementation:
  - Rule-based suggestion engine (Phase 1 foundation)
  - REDCap comorbidity enrichment via export_record_by_pat_id()
  - Claude API rationale text generation per suggestion

Endpoints:
  POST /api/patients/<patient_id>/ai-suggestion/generate/
  GET  /api/patients/<patient_id>/ai-suggestion/latest/
  POST /api/patients/<patient_id>/ai-suggestion/<suggestion_id>/decide/
"""

import logging
from datetime import timedelta

from bson import ObjectId
from django.http import JsonResponse
from django.utils import timezone
from mongoengine import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import (
    AISuggestion,
    FitbitData,
    GoogleHealthData,
    Intervention,
    InterventionAssignment,
    Patient,
    PatientInterventionLogs,
    RehabilitationPlan,
    SuggestedItem,
    Therapist,
)
from utils.config import config

logger = logging.getLogger(__name__)

# ── Comorbidity contraindication rules ────────────────────────────────────────
# Maps REDCap comorbidity flag → (max_cognitive_level, max_physical_level)
# physical/cognitive levels: "Low", "Medium", "High"  (or None = no restriction)
_LEVEL_ORDER = {"Low": 1, "Medium": 2, "High": 3, None: 4}

_CONTRA_RULES: dict[str, dict] = {
    "cogn_imp": {"max_cognitive_level": "Medium"},
    "depression": {},  # No physical/cognitive restriction — just noted in rationale
    "sarcopenia": {"max_physical_level": "Medium"},
    "arrhythmia": {"max_physical_level": "Medium"},
    "heart_failure": {"max_physical_level": "Low"},
    "copd": {"max_physical_level": "Medium"},
}


# ── Helper: resolve patient with IDOR guard ────────────────────────────────────


def _resolve_patient_and_therapist(request, patient_id: str):
    """Return (patient, therapist) or (None, None) on any error."""
    try:
        therapist = Therapist.objects.get(userId=request.user.id)
    except Therapist.DoesNotExist:
        return None, None

    try:
        if ObjectId.is_valid(patient_id):
            patient = Patient.objects(id=ObjectId(patient_id)).first()
        else:
            patient = None
        if not patient:
            return None, None
    except Exception:
        return None, None

    if patient.clinic not in therapist.clinics:
        return None, None

    return patient, therapist


# ── Clinic gate ────────────────────────────────────────────────────────────────


def _clinic_has_ai_suggestions(clinic: str) -> bool:
    return clinic in config.get("ai_suggestion_clinics", [])


# ── Wearable snapshot helpers ──────────────────────────────────────────────────


def _wearable_snapshot(patient: Patient) -> dict:
    """Compute a 30-day wearable average for the patient snapshot."""
    cutoff = timezone.now() - timedelta(days=30)
    user = patient.userId

    if patient.wearable_device == "google_health":
        qs = GoogleHealthData.objects(user=user, date__gte=cutoff)
    else:
        qs = FitbitData.objects(user=user, date__gte=cutoff)

    records = list(qs.only("steps", "minutes_fairly_active", "minutes_very_active", "minutes_asleep"))
    if not records:
        return {}

    def _avg(attr):
        vals = [getattr(r, attr, None) for r in records if getattr(r, attr, None) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    return {
        "avg_steps": _avg("steps"),
        "avg_active_minutes": _avg("minutes_fairly_active"),
        "avg_very_active_minutes": _avg("minutes_very_active"),
        "avg_sleep_minutes": _avg("minutes_asleep"),
        "record_count": len(records),
    }


# ── Adherence signal ───────────────────────────────────────────────────────────


def _patient_skip_set(patient: Patient) -> set:
    """Return set of intervention external_ids this patient consistently skips."""
    cutoff = timezone.now() - timedelta(days=14)
    logs = PatientInterventionLogs.objects(userId=patient, date__gte=cutoff)
    skip_counts: dict[str, int] = {}
    total_counts: dict[str, int] = {}

    for log in logs:
        try:
            ext_id = log.interventionId.external_id
        except Exception:
            continue
        total_counts[ext_id] = total_counts.get(ext_id, 0) + 1
        if "skipped" in (log.status or []):
            skip_counts[ext_id] = skip_counts.get(ext_id, 0) + 1

    return {eid for eid, cnt in skip_counts.items() if total_counts.get(eid, 0) > 0 and cnt / total_counts[eid] >= 0.6}


# ── Population-level avg_rating aggregation ────────────────────────────────────


def _population_ratings() -> dict[str, float]:
    """Return {intervention_id_str: avg_star_rating} across all patients."""
    try:
        logs_col = PatientInterventionLogs._get_collection()
        pipeline = [
            {"$unwind": "$feedback"},
            {"$match": {"feedback.answerKey": {"$exists": True}}},
            {
                "$group": {
                    "_id": "$interventionId",
                    "total": {"$sum": 1},
                    "sum": {
                        "$sum": {
                            "$convert": {
                                "input": {"$arrayElemAt": ["$feedback.answerKey.key", 0]},
                                "to": "int",
                                "onError": 0,
                                "onNull": 0,
                            }
                        }
                    },
                }
            },
        ]
        return {
            str(row["_id"]): round(row["sum"] / row["total"], 1)
            for row in logs_col.aggregate(pipeline)
            if row["total"] > 0 and 1 <= row["sum"] / row["total"] <= 5
        }
    except Exception:
        logger.exception("Failed to compute population ratings")
        return {}


# ── Comorbidity fetch ──────────────────────────────────────────────────────────


def _fetch_comorbidities(patient: Patient) -> dict:
    """Fetch live comorbidity flags from REDCap. Returns {} if unavailable."""
    try:
        from core.services.redcap_service import export_record_by_pat_id

        project = getattr(patient, "project", None) or ""
        patient_code = getattr(patient, "patient_code", None) or ""
        if not project or not patient_code:
            return {}
        rows = export_record_by_pat_id(project, patient_code)
        if not rows:
            return {}
        row = rows[0]
        return {k: v for k, v in row.items() if v == "1"}
    except Exception:
        logger.debug("REDCap comorbidity fetch failed for patient %s", patient.id)
        return {}


# ── Contraindication filter ────────────────────────────────────────────────────


def _passes_contraindication(intervention: Intervention, comorbidities: dict) -> bool:
    """Return False if any active comorbidity rule blocks this intervention."""
    cog = intervention.cognitive_level
    phy = intervention.physical_level

    for flag, rules in _CONTRA_RULES.items():
        if flag not in comorbidities:
            continue
        max_cog = rules.get("max_cognitive_level")
        max_phy = rules.get("max_physical_level")
        if max_cog and _LEVEL_ORDER.get(cog, 4) > _LEVEL_ORDER.get(max_cog, 4):
            return False
        if max_phy and _LEVEL_ORDER.get(phy, 4) > _LEVEL_ORDER.get(max_phy, 4):
            return False
    return True


# ── Claude rationale generation ────────────────────────────────────────────────


def _generate_rationale(
    intervention: Intervention,
    patient_diagnoses: list[str],
    rule_signals: dict,
    comorbidities: dict,
) -> str:
    """Call Claude API to generate a 2-sentence rationale. Falls back to rule text."""
    try:
        import anthropic

        api_key = __import__("os").environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            return _fallback_rationale(intervention, rule_signals)

        client = anthropic.Anthropic(api_key=api_key)

        comorbidity_names = list(comorbidities.keys())[:5]
        comorbidity_text = ", ".join(comorbidity_names) if comorbidity_names else "none reported"

        prompt = (
            f"You are a clinical rehabilitation assistant. Explain in exactly 2 sentences "
            f"why the intervention '{intervention.title}' (aim: {intervention.aim or 'general'}, "
            f"physical level: {intervention.physical_level or 'any'}, "
            f"cognitive level: {intervention.cognitive_level or 'any'}) "
            f"is suitable for a patient with diagnoses: {', '.join(patient_diagnoses) or 'unspecified'}, "
            f"comorbidities: {comorbidity_text}. "
            f"The intervention has an average patient rating of "
            f"{rule_signals.get('avg_rating', 'unknown')} out of 5. "
            f"Be concise and clinically precise. Do not use bullet points."
        )

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=120,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()
    except Exception:
        logger.debug("Claude rationale generation failed, using fallback")
        return _fallback_rationale(intervention, rule_signals)


def _fallback_rationale(intervention: Intervention, rule_signals: dict) -> str:
    parts = []
    if rule_signals.get("diagnosis_match"):
        parts.append("Matches patient diagnosis profile.")
    avg = rule_signals.get("avg_rating")
    if avg:
        parts.append(f"Population average rating: {avg}/5.")
    wearable = rule_signals.get("wearable_signal")
    if wearable:
        parts.append(f"Wearable data suggests: {wearable}.")
    return " ".join(parts) or "Recommended based on intervention catalog rules."


# ── Core suggestion engine ─────────────────────────────────────────────────────


def _build_suggestions(
    patient: Patient,
    therapist: Therapist,
    comorbidities: dict,
    wearable: dict,
    skip_set: set,
    ratings: dict,
    n: int = 6,
) -> list[dict]:
    """
    Score all eligible interventions and return the top-n as suggestion dicts.
    """
    diagnoses = set(patient.diagnosis or [])
    specializations = set(therapist.specializations or [])

    # Determine wearable signals
    wearable_signals: dict[str, str] = {}
    steps_goal = None
    try:
        steps_goal = patient.thresholds.steps_goal
    except Exception:
        pass

    avg_steps = wearable.get("avg_steps")
    avg_active = wearable.get("avg_active_minutes")
    avg_sleep = wearable.get("avg_sleep_minutes")

    if avg_steps is not None and steps_goal and avg_steps < steps_goal * 0.7:
        wearable_signals["Movement"] = "low step count relative to goal"
    if avg_active is not None and avg_active < 20:
        wearable_signals["Physical Activity"] = "low active minutes"
    if avg_sleep is not None and avg_sleep < 360:
        wearable_signals["Relaxation/Sleep"] = "short sleep duration"

    # Fetch all non-private interventions (language: de preferred, falls back to en)
    interventions = list(
        Intervention.objects(is_private=False).only(
            "id",
            "external_id",
            "title",
            "aim",
            "patient_types",
            "primary_diagnosis",
            "cognitive_level",
            "physical_level",
            "duration_bucket",
        )
    )

    scored: list[tuple[float, Intervention, dict, str]] = []

    aim_counts: dict[str, int] = {}

    for iv in interventions:
        # Contraindication filter (Phase 2)
        if comorbidities and not _passes_contraindication(iv, comorbidities):
            continue

        # Adherence history filter
        if iv.external_id in skip_set:
            continue

        # Diagnosis match
        diag_match = 0.0
        freq_suggestion = "3x / Woche"

        iv_primary = set(iv.primary_diagnosis or [])
        if diagnoses & iv_primary:
            diag_match = 0.5

        for pt in iv.patient_types or []:
            if pt.diagnosis in diagnoses and pt.type in specializations:
                diag_match = 1.0
                if pt.frequency:
                    freq_suggestion = pt.frequency
                break
            elif pt.diagnosis in diagnoses or pt.type in specializations:
                diag_match = max(diag_match, 0.6)
                if pt.frequency:
                    freq_suggestion = pt.frequency

        # Population rating
        iv_id_str = str(iv.id)
        pop_rating = ratings.get(iv_id_str, 3.0)

        # Wearable alignment
        aim = (iv.aim or "").strip()
        wearable_signal = wearable_signals.get(aim, "")
        wearable_boost = 0.2 if wearable_signal else 0.0

        # Diversity penalty: cap same-aim count to 2
        aim_slot = aim or "_none"
        if aim_counts.get(aim_slot, 0) >= 2:
            continue

        score = (pop_rating / 5.0) * 0.4 + diag_match * 0.3 + wearable_boost * 0.2 + (0.1 if diag_match > 0 else 0.0)

        rule_signals = {
            "avg_rating": pop_rating,
            "diagnosis_match": diag_match,
            "wearable_signal": wearable_signal or None,
        }

        scored.append((score, iv, rule_signals, freq_suggestion))

    # Sort by score descending
    scored.sort(key=lambda x: -x[0])

    # Take top-n with diversity enforcement
    selected: list[tuple[float, Intervention, dict, str]] = []
    aim_seen: dict[str, int] = {}
    for score, iv, signals, freq in scored:
        aim_slot = (iv.aim or "_none").strip()
        if aim_seen.get(aim_slot, 0) >= 2:
            continue
        selected.append((score, iv, signals, freq))
        aim_seen[aim_slot] = aim_seen.get(aim_slot, 0) + 1
        if len(selected) >= n:
            break

    # Build dicts (rationale populated later per-item)
    return [
        {
            "intervention": iv,
            "suggested_frequency": freq,
            "suggested_days": [],
            "rule_signals": signals,
        }
        for _, iv, signals, freq in selected
    ]


# ── Serialize suggestion ───────────────────────────────────────────────────────


def _serialize_suggestion(suggestion: AISuggestion) -> dict:
    items_out = []
    for item in suggestion.items or []:
        try:
            iv = item.intervention
            iv_data = {
                "_id": str(iv.id),
                "external_id": iv.external_id,
                "title": iv.title,
                "aim": iv.aim,
                "cognitive_level": iv.cognitive_level,
                "physical_level": iv.physical_level,
                "duration_bucket": iv.duration_bucket,
            }
        except Exception:
            iv_data = {}
        items_out.append(
            {
                "intervention": iv_data,
                "suggested_frequency": item.suggested_frequency,
                "suggested_days": item.suggested_days or [],
                "rationale": item.rationale or "",
                "rule_signals": item.rule_signals or {},
                "decision": item.decision or "pending",
                "modification": item.modification or {},
                "decided_at": item.decided_at.isoformat() if item.decided_at else None,
            }
        )
    return {
        "_id": str(suggestion.id),
        "patient_id": str(suggestion.patient.id),
        "therapist_id": str(suggestion.therapist.id),
        "algorithm_version": suggestion.algorithm_version,
        "suggested_at": suggestion.suggested_at.isoformat() if suggestion.suggested_at else None,
        "patient_snapshot": suggestion.patient_snapshot or {},
        "items": items_out,
        "overall_decision": suggestion.overall_decision or "pending",
        "decided_at": suggestion.decided_at.isoformat() if suggestion.decided_at else None,
        "notes": suggestion.notes or "",
    }


# ── Endpoint: generate ─────────────────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_suggestion(request, patient_id: str):
    """
    POST /api/patients/<patient_id>/ai-suggestion/generate/

    Runs the rule engine (Phase 1) + REDCap comorbidity enrichment + Claude
    rationale generation (Phase 2), stores the result, and returns it.
    """
    patient, therapist = _resolve_patient_and_therapist(request, patient_id)
    if patient is None:
        return JsonResponse({"error": "Patient not found or access denied"}, status=404)

    if not _clinic_has_ai_suggestions(patient.clinic or ""):
        return JsonResponse({"error": "AI suggestions not enabled for this clinic"}, status=403)

    # Phase 2: fetch REDCap comorbidities
    comorbidities = _fetch_comorbidities(patient)

    # Wearable snapshot
    wearable = _wearable_snapshot(patient)

    # Adherence signal
    skip_set = _patient_skip_set(patient)

    # Population ratings
    ratings = _population_ratings()

    # Run suggestion engine
    raw_suggestions = _build_suggestions(patient, therapist, comorbidities, wearable, skip_set, ratings)

    if not raw_suggestions:
        return JsonResponse({"error": "No suitable interventions found for this patient"}, status=200)

    # Phase 2: generate Claude rationale per item
    items = []
    for s in raw_suggestions:
        rationale = _generate_rationale(
            s["intervention"],
            patient.diagnosis or [],
            s["rule_signals"],
            comorbidities,
        )
        items.append(
            SuggestedItem(
                intervention=s["intervention"],
                suggested_frequency=s["suggested_frequency"],
                suggested_days=s["suggested_days"],
                rationale=rationale,
                rule_signals=s["rule_signals"],
                decision="pending",
            )
        )

    # Build patient snapshot
    snapshot = {
        "diagnosis": patient.diagnosis or [],
        "function": patient.function or [],
        "clinic": patient.clinic or "",
        "wearable_device": patient.wearable_device or "",
        "study_group": patient.study_group or "",
        "therapist_specializations": therapist.specializations or [],
        "wearable_30d": wearable,
        "comorbidities": list(comorbidities.keys()),
    }

    suggestion = AISuggestion(
        patient=patient,
        therapist=therapist,
        algorithm_version="2.0",
        suggested_at=timezone.now(),
        patient_snapshot=snapshot,
        items=items,
        overall_decision="pending",
    )
    suggestion.save()

    return JsonResponse({"suggestion": _serialize_suggestion(suggestion)}, status=201)


# ── Endpoint: latest ───────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def latest_suggestion(request, patient_id: str):
    """
    GET /api/patients/<patient_id>/ai-suggestion/latest/

    Returns the most recent pending AISuggestion for this patient.
    """
    patient, therapist = _resolve_patient_and_therapist(request, patient_id)
    if patient is None:
        return JsonResponse({"error": "Patient not found or access denied"}, status=404)

    if not _clinic_has_ai_suggestions(patient.clinic or ""):
        return JsonResponse({"error": "AI suggestions not enabled for this clinic"}, status=403)

    suggestion = AISuggestion.objects(patient=patient, overall_decision="pending").order_by("-suggested_at").first()

    if not suggestion:
        return JsonResponse({"suggestion": None}, status=200)

    return JsonResponse({"suggestion": _serialize_suggestion(suggestion)}, status=200)


# ── Endpoint: decide ───────────────────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def decide_suggestion(request, patient_id: str, suggestion_id: str):
    """
    POST /api/patients/<patient_id>/ai-suggestion/<suggestion_id>/decide/

    Records per-item decisions. Accepted / modified items are added to the
    patient's rehabilitation plan using the same logic as add_intervention_to_patient.

    Payload:
    {
      "items": [
        {"intervention_id": "<ObjectId>", "decision": "accepted"},
        {"intervention_id": "<ObjectId>", "decision": "modified",
         "modification": {"frequency": "2x / Woche", "days": ["Tuesday"]}},
        {"intervention_id": "<ObjectId>", "decision": "rejected"}
      ],
      "notes": "..."
    }
    """
    import json as _json

    patient, therapist = _resolve_patient_and_therapist(request, patient_id)
    if patient is None:
        return JsonResponse({"error": "Patient not found or access denied"}, status=404)

    if not _clinic_has_ai_suggestions(patient.clinic or ""):
        return JsonResponse({"error": "AI suggestions not enabled for this clinic"}, status=403)

    if not ObjectId.is_valid(suggestion_id):
        return JsonResponse({"error": "Invalid suggestion ID"}, status=400)

    try:
        suggestion = AISuggestion.objects.get(id=ObjectId(suggestion_id), patient=patient)
    except AISuggestion.DoesNotExist:
        return JsonResponse({"error": "Suggestion not found"}, status=404)

    try:
        payload = _json.loads(request.body or "{}")
    except Exception:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    item_decisions = {d["intervention_id"]: d for d in (payload.get("items") or [])}
    notes = (payload.get("notes") or "").strip()

    accepted_count = 0
    rejected_count = 0
    modified_count = 0

    for item in suggestion.items or []:
        try:
            iv_id = str(item.intervention.id)
        except Exception:
            continue

        decision_data = item_decisions.get(iv_id)
        if not decision_data:
            continue

        decision = decision_data.get("decision", "pending")
        if decision not in ("accepted", "rejected", "modified"):
            continue

        item.decision = decision
        item.decided_at = timezone.now()

        if decision == "modified":
            item.modification = decision_data.get("modification") or {}
            modified_count += 1
        elif decision == "accepted":
            accepted_count += 1
        elif decision == "rejected":
            rejected_count += 1

    # Add accepted/modified interventions to the rehab plan
    _apply_accepted_to_plan(patient, therapist, suggestion, item_decisions)

    # Record overall outcome
    if accepted_count + modified_count == 0:
        suggestion.overall_decision = "rejected"
    elif rejected_count == 0:
        suggestion.overall_decision = "partially_applied"
    else:
        suggestion.overall_decision = "partially_applied"

    suggestion.decided_at = timezone.now()
    suggestion.notes = notes
    suggestion.save()

    return JsonResponse(
        {
            "success": True,
            "accepted": accepted_count,
            "modified": modified_count,
            "rejected": rejected_count,
            "overall_decision": suggestion.overall_decision,
        }
    )


def _apply_accepted_to_plan(
    patient: Patient,
    therapist: Therapist,
    suggestion: AISuggestion,
    item_decisions: dict,
):
    """Append accepted/modified interventions to the patient's rehabilitation plan."""
    # Gather items to apply
    to_apply = []
    for item in suggestion.items or []:
        try:
            iv_id = str(item.intervention.id)
        except Exception:
            continue
        d = item_decisions.get(iv_id, {})
        if d.get("decision") not in ("accepted", "modified"):
            continue
        try:
            iv = item.intervention
        except Exception:
            continue
        mod = d.get("modification") or {}
        to_apply.append((iv, mod, item.suggested_frequency))

    if not to_apply:
        return

    # Load or create the rehabilitation plan
    plan = RehabilitationPlan.objects(patientId=patient).first()
    if not plan:
        plan = RehabilitationPlan(
            patientId=patient,
            therapistId=therapist,
            startDate=timezone.now(),
            endDate=timezone.now() + timedelta(days=90),
            status="active",
            interventions=[],
            createdAt=timezone.now(),
            updatedAt=timezone.now(),
        )

    for iv, mod, freq in to_apply:
        # Skip if already in plan
        already = any(
            str(getattr(a.interventionId, "id", None) or a.interventionId) == str(iv.id)
            for a in (plan.interventions or [])
        )
        if already:
            continue

        effective_freq = mod.get("frequency") or freq or ""
        plan.interventions.append(
            InterventionAssignment(
                interventionId=iv,
                frequency=effective_freq,
                dates=[],
                notes=f"Added via AI suggestion {suggestion.id}",
                require_video_feedback=False,
            )
        )

    plan.updatedAt = timezone.now()
    plan.save()
