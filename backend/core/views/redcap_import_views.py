import json
import logging
import os
from typing import Optional, List, Dict, Any, Set, Tuple

import requests
from bson import ObjectId
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.contrib.auth.hashers import make_password

from core.models import Therapist, Patient, User  # MongoEngine models (as in your project)

logger = logging.getLogger(__name__)


# ----------------------------
# Utilities
# ----------------------------
def _norm(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _is_objectid(v: str) -> bool:
    try:
        ObjectId(str(v))
        return True
    except Exception:
        return False


def _bad(message: str, status: int = 400, extra: dict | None = None):
    payload = {"ok": False, "error": message}
    if extra:
        payload.update(extra)
    return JsonResponse(payload, status=status)


def _safe_json_body(request) -> dict:
    try:
        return json.loads((request.body or b"{}").decode("utf-8") or "{}")
    except Exception:
        return {}


def get_redcap_api_url() -> str:
    # env.dev: REDCAP_API_URL=https://redcap.rehab.ch/api/
    url = os.getenv("REDCAP_API_URL", "").strip()
    if not url:
        # fallback (optional)
        url = "https://redcap.unibe.ch/api/"
    return url


def get_redcap_token_for_project(project: str) -> Optional[str]:
    """
    env.dev example:
      REDCAP_TOKEN_COPAIN=...
      REDCAP_TOKEN_COMPASS=...
    """
    key = f"REDCAP_TOKEN_{project.upper()}"
    token = os.getenv(key, "").strip()
    return token or None


# ----------------------------
# Therapist resolution
# ----------------------------
def get_therapist_for_user(user: User) -> Optional[Therapist]:
    """
    Your system uses User (MongoEngine) and Therapist.userId points to that User.
    """
    try:
        return Therapist.objects(userId=user).first()
    except Exception:
        return None


def get_therapist_by_user_id(user_id: str) -> Optional[Therapist]:
    if not user_id or not _is_objectid(user_id):
        return None
    try:
        u = User.objects(id=ObjectId(user_id)).first()
        if not u:
            return None
        return Therapist.objects(userId=u).first()
    except Exception:
        return None


def get_allowed_redcap_projects_for_therapist(th: Therapist) -> List[str]:
    """
    You already manage therapist.projects (list) and/or therapist.project (legacy).
    This function returns the list to query.
    """
    projs = getattr(th, "projects", None)
    if isinstance(projs, list) and projs:
        return [str(x).strip() for x in projs if str(x).strip()]

    legacy = getattr(th, "project", "") or ""
    legacy = str(legacy).strip()
    return [legacy] if legacy else []


def allowed_dags_by_project(th: Therapist, project: str) -> Optional[Set[str]]:
    """
    If you have “specific GABs” logic, implement here.
    Return:
      - None => no DAG filtering
      - set(...) => only allow these DAGs

    For now: no filtering.
    """
    return None


# ----------------------------
# REDCap export (minimal)
# ----------------------------
class RedcapError(Exception):
    def __init__(self, message: str, detail: Any = None):
        super().__init__(message)
        self.detail = detail


def redcap_export_minimal(
    token: str,
    project: str,
    patient_id: Optional[str] = None,
    record_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Minimal export:
      fields: record_id, pat_id
      and DAG field via exportDataAccessGroups=true

    If patient_id provided: filter by pat_id in REDCap (not always supported directly),
    so we filter client-side.
    If record_id provided: we can request that record specifically.
    """
    api_url = get_redcap_api_url()

    data = {
        "token": token,
        "content": "record",
        "action": "export",
        "format": "json",
        "type": "flat",
        "rawOrLabel": "raw",
        "rawOrLabelHeaders": "raw",
        "exportCheckboxLabel": "false",
        "exportSurveyFields": "false",
        "exportDataAccessGroups": "true",  # ✅ ensures redcap_data_access_group returned
        "returnFormat": "json",
        "fields[0]": "record_id",
        "fields[1]": "pat_id",
        # optionally restrict forms (keeps export small)
        # "forms[0]": "eligibility",
    }

    # REDCap supports exporting specific record ids via records[i]
    if record_id:
        data["records[0]"] = record_id

    try:
        r = requests.post(api_url, data=data, timeout=30)
    except Exception as e:
        raise RedcapError("Failed to reach REDCap API.", detail=str(e))

    if r.status_code != 200:
        raise RedcapError("REDCap API returned non-200.", detail={"status": r.status_code, "text": r.text[:400]})

    try:
        rows = r.json()
    except Exception:
        raise RedcapError("REDCap returned invalid JSON.", detail=r.text[:400])

    if not isinstance(rows, list):
        raise RedcapError("Unexpected REDCap response format.", detail=rows)

    # client-side filter by patient_id (pat_id)
    if patient_id:
        pid = _norm(patient_id)
        rows = [x for x in rows if _norm(x.get("pat_id")) == pid]

    # client-side filter by record_id (if not passed as records[0])
    if record_id and "records[0]" not in data:
        rid = _norm(record_id)
        rows = [x for x in rows if _norm(x.get("record_id")) == rid]

    return rows


# ----------------------------
# DB comparison helper
# ----------------------------
def _get_existing_identifiers_for_project(project: str) -> Set[str]:
    """
    Identify patients already imported for a project.

    We compare against stored redcap identifier.
    If your Patient model doesn't have redcap_* fields yet, we fall back to patient_code.
    """
    existing: Set[str] = set()

    # Preferred: store a project + identifier on Patient (if you have fields)
    # We'll try to read safely; if fields don't exist, fallback.
    try:
        # If you have these fields:
        #   Patient.redcap_project
        #   Patient.redcap_identifier
        qs = Patient.objects(redcap_project=project).only("redcap_identifier").scalar("redcap_identifier")
        if qs:
            for x in qs:
                s = _norm(x)
                if s:
                    existing.add(s)
    except Exception:
        pass

    # Fallback: compare by patient_code (common in your system)
    if not existing:
        try:
            qs2 = Patient.objects.only("patient_code").scalar("patient_code")
            if qs2:
                for x in qs2:
                    s = _norm(x)
                    if s:
                        existing.add(s)
        except Exception:
            pass

    return existing


# ----------------------------
# PASSWORD validation (simple)
# ----------------------------
def _is_strong_password(pw: str) -> bool:
    if not pw or len(pw) < 8:
        return False
    has_upper = any(c.isupper() for c in pw)
    has_lower = any(c.islower() for c in pw)
    has_digit = any(c.isdigit() for c in pw)
    has_special = any(not c.isalnum() for c in pw)
    return has_upper and has_lower and has_digit and has_special


# =========================================================
# 1) GET /api/redcap/available-patients/
# =========================================================
@csrf_exempt
@permission_classes([IsAuthenticated])
def available_redcap_patients(request):
    """
    GET /api/redcap/available-patients/?therapistUserId=<mongo_user_id>&project=COPAIN&patientId=...&recordId=...

    Returns ONLY import candidates:
      - project
      - record_id
      - pat_id
      - identifier (pat_id if present else record_id)
      - dag (redcap_data_access_group)
    """
    if request.method != "GET":
        return _bad("Method not allowed.", status=405)

    therapist_user_id = _norm(request.GET.get("therapistUserId"))

    # Allow both: (A) therapistUserId param OR (B) derive from request.user
    therapist = get_therapist_by_user_id(therapist_user_id) if therapist_user_id else get_therapist_for_user(request.user)
    if not therapist:
        return _bad("Therapist profile not found.", status=404)

    allowed_projects = get_allowed_redcap_projects_for_therapist(therapist) or []
    if not allowed_projects:
        return JsonResponse({"ok": True, "projects": [], "candidates": []}, status=200)

    project_q = _norm(request.GET.get("project"))
    patient_id_q = _norm(request.GET.get("patientId"))
    record_id_q = _norm(request.GET.get("recordId"))

    projects_to_check = allowed_projects
    if project_q:
        if project_q not in allowed_projects:
            return _bad("Project not allowed.", status=403, extra={"allowedProjects": allowed_projects})
        projects_to_check = [project_q]

    candidates: List[dict] = []
    errors: List[dict] = []

    for project in projects_to_check:
        try:
            token = get_redcap_token_for_project(project)
            if not token:
                errors.append({"project": project, "error": "Missing REDCap token for project."})
                continue

            rows = redcap_export_minimal(
                token=token,
                project=project,
                patient_id=patient_id_q or None,
                record_id=record_id_q or None,
            )

            # DAG filter (specific GABs) if configured
            allowed_dags = allowed_dags_by_project(therapist, project)
            if allowed_dags is not None:
                rows = [r for r in rows if _norm(r.get("redcap_data_access_group")) in allowed_dags]

            existing_ids = _get_existing_identifiers_for_project(project)

            for r in rows:
                record_id = _norm(r.get("record_id"))
                pat_id = _norm(r.get("pat_id"))
                dag = _norm(r.get("redcap_data_access_group"))

                identifier = pat_id or record_id
                if not identifier:
                    continue

                # only return those not in DB:
                if identifier in existing_ids:
                    continue

                candidates.append(
                    {
                        "project": project,
                        "record_id": record_id,
                        "pat_id": pat_id,
                        "identifier": identifier,
                        "dag": dag,
                    }
                )

        except RedcapError as e:
            logger.exception("available_redcap_patients: REDCap error project=%s", project)
            errors.append({"project": project, "error": str(e), "detail": e.detail})
        except Exception as e:
            logger.exception("available_redcap_patients failed project=%s", project)
            errors.append({"project": project, "error": "Unexpected server error.", "detail": str(e)})

    # Deduplicate across (project, identifier)
    seen: Set[Tuple[str, str]] = set()
    uniq: List[dict] = []
    for c in candidates:
        k = (c["project"], c["identifier"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(c)

    resp = {"ok": True, "projects": projects_to_check, "candidates": uniq}
    if errors:
        resp["errors"] = errors

    return JsonResponse(resp, status=200)


# =========================================================
# 2) POST /api/redcap/import-patient/
# =========================================================
@csrf_exempt
@permission_classes([IsAuthenticated])
def import_patient_from_redcap(request):
    """
    POST /api/redcap/import-patient/
    body:
      {
        "project": "COPAIN",
        "patient_code": "<identifier>",   # identifier = pat_id or record_id
        "password": "TempPass123!"
        "therapistUserId": "<mongo_user_id>"  # optional; if not provided, derive from request.user
      }

    Imports ONE patient:
      - verifies therapist + project access
      - pulls minimal record to retrieve record_id/pat_id/dag (so we can store them)
      - creates platform User + Patient
      - stores redcap_project + identifier (+ record_id/pat_id/dag if model supports)
    """
    if request.method != "POST":
        return _bad("Method not allowed.", status=405)

    payload = _safe_json_body(request)

    project = _norm(payload.get("project"))
    identifier = _norm(payload.get("patient_code"))  # FE sends identifier here
    password = _norm(payload.get("password"))
    therapist = get_therapist_by_user_id(payload.get("therapistUserId")) if payload.get("therapistUserId") else get_therapist_for_user(request.user)

    if not project:
        return _bad("project is required.", status=400)
    if not identifier:
        return _bad("patient_code (identifier) is required.", status=400)
    if not password:
        return _bad("password is required.", status=400)
    if not _is_strong_password(password):
        return _bad("Weak password: 8+ chars with upper, lower, number, special char.", status=400)
    if not therapist:
        return _bad("Therapist profile not found.", status=404)

    allowed_projects = get_allowed_redcap_projects_for_therapist(therapist) or []
    if project not in allowed_projects:
        return _bad("Project not allowed for this therapist.", status=403, extra={"allowedProjects": allowed_projects})

    # Already imported?
    existing_ids = _get_existing_identifiers_for_project(project)
    if identifier in existing_ids:
        # try to find patient (best effort)
        p = None
        try:
            p = Patient.objects(redcap_project=project, redcap_identifier=identifier).first()
        except Exception:
            try:
                p = Patient.objects(patient_code=identifier).first()
            except Exception:
                p = None

        return JsonResponse(
            {
                "ok": False,
                "error": "Patient already imported.",
                "project": project,
                "identifier": identifier,
                "patientId": str(p.id) if p else None,
            },
            status=409,
        )

    # Pull minimal record(s) and locate the row for this identifier
    token = get_redcap_token_for_project(project)
    if not token:
        return _bad("Missing REDCap token for project.", status=500)

    # We don't know if identifier is pat_id or record_id.
    # Try:
    #  1) treat as record_id export
    #  2) fallback: export minimal and find by pat_id
    rc_row = None
    try:
        rows_by_record = redcap_export_minimal(token=token, project=project, record_id=identifier)
        if rows_by_record:
            # if identifier matches record_id, first row is correct
            rc_row = rows_by_record[0]
    except RedcapError:
        rc_row = None

    if rc_row is None:
        # fallback: export minimal (small) and find by pat_id
        try:
            rows = redcap_export_minimal(token=token, project=project, patient_id=identifier)
            if rows:
                rc_row = rows[0]
        except RedcapError as e:
            return JsonResponse({"ok": False, "error": str(e), "detail": e.detail}, status=502)

    if rc_row is None:
        return _bad("No REDCap record found for this identifier in this project.", status=404, extra={"project": project, "identifier": identifier})

    # DAG rule (specific GABs)
    allowed_dags = allowed_dags_by_project(therapist, project)
    dag = _norm(rc_row.get("redcap_data_access_group"))
    if allowed_dags is not None and dag not in allowed_dags:
        return _bad("Forbidden: record DAG not allowed for this therapist.", status=403, extra={"dag": dag})

    record_id = _norm(rc_row.get("record_id"))
    pat_id = _norm(rc_row.get("pat_id"))
    # final identifier rule:
    final_identifier = pat_id or record_id or identifier

    # Create platform user + patient
    now = timezone.now()
    user = None
    patient = None

    try:
        # username uniqueness: if already taken, we can suffix
        base_username = final_identifier
        username = base_username
        n = 1
        while User.objects(username=username).first() is not None:
            n += 1
            username = f"{base_username}_{n}"

        # Create User (Patient)
        user = User(
            username=username,
            role="Patient",
            isActive=True,
            createdAt=now,
            updatedAt=now,
            pwdhash=make_password(password),
        )
        user.save()

        # Choose default clinic (first therapist clinic, if you use it)
        clinic = ""
        try:
            clinics = getattr(therapist, "clinics", None) or []
            clinic = clinics[0] if clinics else ""
        except Exception:
            clinic = ""

        # Create Patient
        patient = Patient(
            userId=user,
            therapist=therapist,
            patient_code=final_identifier,  # keep consistent with your platform
            clinic=clinic,
            access_word=password,  # if you still use it
        )

        # Optional: store REDCap metadata if your Patient model has fields
        # (safe setattr so it won't crash if field doesn't exist)
        try:
            setattr(patient, "redcap_project", project)
        except Exception:
            pass
        try:
            setattr(patient, "redcap_identifier", final_identifier)
        except Exception:
            pass
        try:
            setattr(patient, "redcap_record_id", record_id)
        except Exception:
            pass
        try:
            setattr(patient, "redcap_pat_id", pat_id)
        except Exception:
            pass
        try:
            setattr(patient, "redcap_dag", dag)
        except Exception:
            pass

        patient.save()

        return JsonResponse(
            {
                "ok": True,
                "message": "Patient imported successfully.",
                "project": project,
                "identifier": final_identifier,
                "record_id": record_id,
                "pat_id": pat_id,
                "dag": dag,
                "patientId": str(patient.id),
                "userId": str(user.id),
                "username": username,
            },
            status=201,
        )

    except RedcapError as e:
        logger.exception("import_patient_from_redcap: REDCap error")
        # cleanup
        try:
            if patient:
                patient.delete()
        except Exception:
            pass
        try:
            if user:
                user.delete()
        except Exception:
            pass
        return JsonResponse({"ok": False, "error": str(e), "detail": e.detail}, status=502)

    except Exception as e:
        logger.exception("import_patient_from_redcap failed")
        # cleanup
        try:
            if patient:
                patient.delete()
        except Exception:
            pass
        try:
            if user:
                user.delete()
        except Exception:
            pass
        return JsonResponse({"ok": False, "error": "Failed to import patient.", "detail": str(e)}, status=500)
