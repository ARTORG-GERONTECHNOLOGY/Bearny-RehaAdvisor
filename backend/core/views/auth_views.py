import json
import logging
import random
import string
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

from bson import ObjectId
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from core.tasks import fetch_fitbit_data_async
from core.views.fitbit_sync import fetch_fitbit_today_for_user

logger = logging.getLogger(__name__)  # Fallback to file-based logger if needed
email_user = settings.EMAIL_HOST_USER
import uuid

from django.core.mail import EmailMultiAlternatives
from django.utils.html import strip_tags

from core.models import (
    InterventionAssignment,
    Logs,
    PasswordAttempt,
    Patient,
    PatientInterventionLogs,
    RehabilitationPlan,
    SMSVerification,
    Therapist,
    User,
)
from utils.utils import (
    check_rate_limit,
    convert_to_serializable,
    generate_custom_id,
    generate_repeat_dates,
    get_labels,
    sanitize_text,
    validate_password_strength,
)

logger = logging.getLogger(__name__)
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from mongoengine.queryset.visitor import Q

from utils.config import config
from utils.scheduling import _expand_dates  # already in your project


def _as_list_of_blocks(maybe_blocks):
    """
    Normalise diagnosis_assignments[...] into a list of settings-like objects.
    Accepts:
      - list[DiagnosisAssignmentSettings]
      - single DiagnosisAssignmentSettings
      - dict-like (legacy)
      - None
    """
    if maybe_blocks is None:
        return []
    # Already a list?
    try:
        # MongoEngine BaseList behaves like list
        if (
            isinstance(maybe_blocks, list)
            or hasattr(maybe_blocks, "__iter__")
            and not hasattr(maybe_blocks, "to_mongo")
        ):
            # If it's an iterable of embedded docs / dicts
            return list(maybe_blocks)
    except Exception:
        pass

    # Single embedded document object
    return [maybe_blocks]


def _safe_get(obj, key, default=None):
    """Read attribute or dict key safely."""
    if hasattr(obj, key):
        return getattr(obj, key)
    if isinstance(obj, dict):
        return obj.get(key, default)
    return default


def _make_count(unit, interval, selected_days, start_day, end_day, fallback=50):
    """
    Convert (start_day..end_day, interval) into a count when possible.
    If end_day not provided, fall back to a reasonable default.
    """
    interval = max(int(interval or 1), 1)
    if end_day and start_day:
        span = max(0, int(end_day) - int(start_day))
        if unit == "day":
            return (span // interval) + 1
        elif unit == "week":
            # rough count: weeks in span * selected-days-per-week (or 1)
            per_week = max(len(selected_days or []) or 1, 1)
            weeks = max(1, (span // 7) // interval + 1)
            return weeks * per_week
        elif unit == "month":
            # very rough: ~30 days/month
            months = max(1, (span // 30) // interval + 1)
            return months
    return fallback


def create_rehab_plan(patient, therapist):
    try:
        # 1) Anchor "Day 1" for initial schedule
        plan_start_date = (patient.userId.createdAt or timezone.now()).date()
        default_start_time = "08:00"

        # 2) Collect dates per intervention (so multiple blocks merge into one assignment)
        dates_by_intervention: dict[str, list[datetime]] = {}

        patient_diagnoses = patient.diagnosis or []
        for rec in therapist.default_recommendations or []:
            intervention = rec.recommendation
            if not intervention:
                continue

            for dx in patient_diagnoses:
                if dx not in (rec.diagnosis_assignments or {}):
                    continue

                blocks = _as_list_of_blocks(rec.diagnosis_assignments.get(dx))
                if not blocks:
                    continue

                for block in blocks:
                    active = bool(_safe_get(block, "active", True))
                    if not active:
                        continue

                    unit = _safe_get(block, "unit", "week") or "week"
                    interval = int(_safe_get(block, "interval", 1) or 1)
                    selected_days = _safe_get(block, "selected_days", []) or []

                    start_day = int(_safe_get(block, "start_day", 1) or 1)
                    end_day = _safe_get(block, "end_day", None)
                    end_day = int(end_day) if end_day is not None else None

                    # optional time per block, otherwise default
                    start_time = _safe_get(block, "start_time", default_start_time) or default_start_time

                    # legacy 'count_limit' still respected; else derive from start/end days
                    count_limit = _safe_get(block, "count_limit", None)
                    if count_limit is None:
                        count_limit = _make_count(
                            unit,
                            interval,
                            selected_days,
                            start_day,
                            end_day,
                            fallback=50,
                        )
                    else:
                        count_limit = int(count_limit or 1)

                    # Compute the actual start date for this block
                    block_start_date = (plan_start_date + timedelta(days=max(0, start_day - 1))).isoformat()

                    # Expand to concrete datetimes
                    occ = (
                        _expand_dates(
                            start_date=block_start_date,  # 'YYYY-MM-DD'
                            start_time=start_time,  # 'HH:MM'
                            unit=unit,
                            interval=interval,
                            selected_days=selected_days,
                            end={"type": "count", "count": count_limit},
                            max_occurrences=count_limit,
                        )
                        or []
                    )

                    # TZ-aware & collect
                    aware_dates = [
                        (d if timezone.is_aware(d) else timezone.make_aware(d)) for d in occ if isinstance(d, datetime)
                    ]
                    key = str(intervention.id)
                    dates_by_intervention.setdefault(key, []).extend(aware_dates)

        # 3) Upsert into the patient’s plan
        if not dates_by_intervention:
            return True

        # dedupe + sort each list
        for k, lst in dates_by_intervention.items():
            # dedupe to second precision
            seen = set()
            uniq = []
            for d in sorted(lst):
                dt = d.replace(microsecond=0)
                if dt not in seen:
                    seen.add(dt)
                    uniq.append(dt)
            dates_by_intervention[k] = uniq

        plan = RehabilitationPlan.objects(patientId=patient).first()
        if not plan:
            plan = RehabilitationPlan(
                patientId=patient,
                therapistId=therapist,
                startDate=datetime.combine(
                    plan_start_date,
                    datetime.min.time(),
                    tzinfo=timezone.get_current_timezone(),
                ),
                endDate=patient.study_end_date or patient.reha_end_date,
                status="active",
                interventions=[],
                questionnaires=[],
                createdAt=timezone.now(),
                updatedAt=timezone.now(),
            )

        # merge each intervention’s dates
        for rec in therapist.default_recommendations or []:
            intervention = rec.recommendation
            if not intervention:
                continue
            key = str(intervention.id)
            if key not in dates_by_intervention:
                continue
            new_dates = dates_by_intervention[key]

            existing = None
            for ia in plan.interventions or []:
                if getattr(getattr(ia, "interventionId", None), "id", None) == intervention.id:
                    existing = ia
                    break

            if existing:
                # keep all past; merge future without dupes
                have = {d.replace(microsecond=0) for d in (existing.dates or [])}
                for d in new_dates:
                    if d.replace(microsecond=0) not in have:
                        existing.dates.append(d)
            else:
                plan.interventions.append(
                    InterventionAssignment(
                        interventionId=intervention,
                        frequency="",  # optional label
                        dates=new_dates,
                        notes="",
                        require_video_feedback=False,
                    )
                )

        plan.updatedAt = timezone.now()
        plan.save()
        return True

    except Exception as e:
        # Keep your logging
        print(f"Error creating rehab plan: {e}")
        return False


def make_aware(dt):
    if timezone.is_naive(dt):
        return timezone.make_aware(dt)
    return dt


from datetime import datetime, timedelta

from django.utils import timezone

MAX_ATTEMPTS = 5  # allowed failed attempts
LOCKOUT_MINUTES = 15  # lockout duration


def _parse_body(request):
    """
    Parse JSON or form body without crashing.
    Returns dict.
    """
    content_type = (request.META.get("CONTENT_TYPE") or "").lower()
    # JSON
    if "application/json" in content_type:
        try:
            return json.loads((request.body or b"{}").decode("utf-8") or "{}")
        except Exception:
            return {}
    # Form or unknown: try POST first, else try JSON fallback
    if request.POST:
        return request.POST.dict()
    try:
        return json.loads((request.body or b"{}").decode("utf-8") or "{}")
    except Exception:
        return {}


# ---------------------------------------------------------------------
# LOGIN
# ---------------------------------------------------------------------
@csrf_exempt
def login_view(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    request_id = uuid.uuid4().hex[:10]

    try:
        data = _parse_body(request)

        identifier = (data.get("email") or data.get("username") or "").strip()

        raw_password = data.get("password") or ""

        if not identifier or not raw_password:
            return JsonResponse(
                {
                    "error": "Email/username and password are required.",
                    "request_id": request_id,
                },
                status=400,
            )
        users = User.objects()  # all docs
        print("count:", users.count())

        user = User.objects(Q(email=identifier) | Q(username=identifier)).first()

        print(f"Found user: {user}")
        print(User.objects(Q(email=identifier) | Q(username=identifier)).first())

        # IMPORTANT: never touch user fields before checking user exists
        if not user:
            return JsonResponse(
                {"error": "Invalid credentials (username).", "request_id": request_id},
                status=401,
            )

        # If a user exists but pwdhash missing / empty
        pwdhash = getattr(user, "pwdhash", None)
        if not pwdhash:
            logger.warning(f"[LOGIN][{request_id}] User has no pwdhash user_id={user.id}")
            return JsonResponse(
                {
                    "error": "Invalid credentials. Password is missing.",
                    "request_id": request_id,
                },
                status=401,
            )

        if not check_password(raw_password, pwdhash):
            return JsonResponse({"error": "Invalid credentials.", "request_id": request_id}, status=401)

        if not getattr(user, "isActive", False):
            return JsonResponse(
                {"error": "User is not yet accepted.", "request_id": request_id},
                status=403,
            )

        user_id_str = str(user.id)

        # Therapists and Admins: require 2FA
        if user.role in ("Therapist", "Admin"):
            return JsonResponse(
                {
                    "user_type": user.role,
                    "id": user_id_str,
                    "require_2fa": True,
                    "request_id": request_id,
                },
                status=200,
            )

        # Others: issue JWT immediately
        Logs.objects.create(userId=user, action="LOGIN", userAgent=user.role)

        refresh = RefreshToken()
        refresh["user_id"] = user_id_str
        refresh["role"] = user.role
        refresh["username"] = getattr(user, "username", "") or ""

        return JsonResponse(
            {
                "user_type": user.role,
                "id": user_id_str,
                "access_token": str(refresh.access_token),
                "refresh_token": str(refresh),
                "require_2fa": False,
                "request_id": request_id,
            },
            status=200,
        )

    except Exception as e:
        logger.exception(f"[LOGIN][{request_id}] Internal server error: {e}")
        return JsonResponse({"error": "Internal server error.", "request_id": request_id}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    Logs a user out and creates a log entry.
    Endpoint: POST /api/auth/logout/
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
        user_id = data.get("userId")
        if not user_id:
            return JsonResponse({"error": "User ID is required"}, status=400)

        user = User.objects.get(pk=ObjectId(user_id))

        Logs.objects.create(userId=user, action="LOGOUT", userAgent=user.role)

        return JsonResponse({"message": "Logout successful"}, status=200)

    except User.DoesNotExist:
        logger.warning("Logout attempt for non-existent user.")
        return JsonResponse({"error": "User not found"}, status=404)
    except Exception as e:
        logger.exception("Unexpected error during logout.")
        return JsonResponse({"error": "Internal server error"}, status=500)


def generate_random_password(length=12):
    chars = string.ascii_letters + string.digits + string.punctuation
    return "".join(random.choice(chars) for _ in range(length))


@csrf_exempt
@permission_classes([IsAuthenticated])
def reset_password_view(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
        email = data.get("email")

        if not email:
            return JsonResponse({"error": "Email is required"}, status=400)

        user = User.objects.filter(email=email).first()
        if not user:
            return JsonResponse({"error": "User not found"}, status=404)

        # Generate random password
        new_password = generate_random_password()

        # Hash and save the new password
        hashed_password = make_password(new_password)
        User.objects.filter(email=email).update(pwdhash=hashed_password)

        # Send email with the new password
        send_mail(
            subject="Your Password Has Been Reset",
            message=(
                f"Dear {user.username},\n\nYour new password is:\n\n{new_password}\n\nPlease change it after login."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )

        return JsonResponse({"message": "Password reset successfully, email sent."}, status=200)

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    except Exception:
        logger.exception("Unexpected error during password reset.")
        return JsonResponse({"error": "Internal server error"}, status=500)


def _norm_email(raw: str) -> str:
    # Trim + collapse + lower
    return (raw or "").strip().lower()


def _err(message: str, status: int = 400, field_errors=None, non_field_errors=None):
    payload = {"success": False, "message": message}
    if field_errors:
        payload["field_errors"] = field_errors
    if non_field_errors:
        payload["non_field_errors"] = non_field_errors
    return JsonResponse(payload, status=status)


def _notify_admins_new_therapist(user, therapist):
    """
    Send a notification e-mail to every active Admin user when a new therapist
    registers.  Failures are logged but never surface to the caller so that a
    misconfigured mail server cannot block registration.
    """
    try:
        admins = User.objects.filter(role="Admin", isActive=True)
        admin_emails = [u.email for u in admins if u.email]
        if not admin_emails:
            return

        first = getattr(therapist, "first_name", "") or ""
        last = getattr(therapist, "name", "") or ""
        full_name = f"{first} {last}".strip() or user.username

        subject = "New therapist registration pending approval"
        message = (
            f"A new therapist has registered and is awaiting approval.\n\n"
            f"Name:     {full_name}\n"
            f"Email:    {user.email}\n"
            f"Username: {user.username}\n\n"
            f"Please log in to the admin panel to accept or decline the account."
        )

        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=admin_emails,
            fail_silently=True,
        )
    except Exception:
        logger.exception("Failed to notify admins of new therapist registration")


@csrf_exempt
def register_view(request):
    """
    Registers a new patient or therapist.
    Endpoint: POST /api/auth/register/
    """
    if request.method != "POST":
        return _err("Method not allowed", status=405)

    user = None
    patient = None
    therapist = None

    def rollback():
        """Best-effort cleanup so we don't keep a User if downstream creation fails."""
        nonlocal user, patient, therapist

        # delete child first
        try:
            if patient is not None:
                patient.delete()
        except Exception:
            logger.exception("Rollback: patient delete failed")

        try:
            if therapist is not None:
                therapist.delete()
        except Exception:
            logger.exception("Rollback: therapist delete failed")

        # delete user last
        try:
            if user is not None:
                user.delete()
        except Exception:
            logger.exception("Rollback: user delete failed")

        patient = None
        therapist = None
        user = None

    try:
        # -------- Parse JSON --------
        try:
            data = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            logger.warning("Invalid JSON in register_view.")
            return _err("Invalid input format.", status=400)

        field_errors = {}

        user_type = (data.get("userType") or "").strip()
        email_raw = data.get("email")
        email = _norm_email(email_raw)
        raw_password = data.get("password")

        # -------- Basic required fields --------
        if not user_type:
            field_errors["userType"] = ["This field is required."]
        if not email:
            field_errors["email"] = ["This field is required."]
        if not raw_password:
            field_errors["password"] = ["This field is required."]

        if field_errors:
            return _err("Validation error.", status=400, field_errors=field_errors)

        # -------- Validate email --------
        try:
            validate_email(email)
        except ValidationError:
            return _err(
                "Validation error.",
                status=400,
                field_errors={"email": ["Enter a valid email address."]},
            )

        # reject any whitespace in the raw email input
        if any(ch.isspace() for ch in (email_raw or "")):
            return _err(
                "Validation error.",
                status=400,
                field_errors={"email": ["Email must not contain whitespace."]},
            )

        # -------- Extra validation by role --------
        if user_type == "Patient":
            if not data.get("therapist"):
                field_errors["therapist"] = ["Assigned therapist is required."]
            if not data.get("rehaEndDate"):
                field_errors["rehaEndDate"] = ["Rehabilitation end date is required."]
        elif user_type == "Therapist":
            # add required therapist fields here if needed
            pass

        if field_errors:
            return _err("Validation error.", status=400, field_errors=field_errors)

        # -------- Uniqueness check (MongoEngine) --------
        if User.objects(email=email).first():
            return _err(
                "Validation error.",
                status=400,
                field_errors={"email": ["An account with this email already exists."]},
            )

        # -------- Create user (but rollback if anything later fails) --------
        user = User(
            username=generate_custom_id(user_type),
            role=user_type,
            email=sanitize_text(email),
            phone=sanitize_text((data.get("phone") or "").strip()),
            pwdhash=make_password(raw_password),
            createdAt=timezone.now(),
            isActive=(user_type == "Patient"),
        )

        try:
            user.save()
        except Exception:
            # If you have a unique index on email at DB level, this can still race
            logger.exception("User save failed")
            rollback()
            return _err(
                "Validation error.",
                status=400,
                field_errors={"email": ["An account with this email already exists."]},
            )

        # ===================== Patient Registration =====================
        if user_type == "Patient":
            try:
                therapist_user_id = data.get("therapist")
                # therapist_user_id is likely a string/ObjectId; pk works for both in mongoengine
                therapist_user = User.objects.get(pk=therapist_user_id)
                pat_therapist = Therapist.objects.get(userId=therapist_user)
            except (User.DoesNotExist, Therapist.DoesNotExist):
                rollback()
                return _err("Assigned therapist not found.", status=404)

            # Validate clinic
            clinic = (data.get("clinic") or "").strip()
            if not clinic:
                rollback()
                return _err(
                    "Validation error.",
                    status=400,
                    field_errors={"clinic": ["Clinic is required."]},
                )
            if clinic not in (pat_therapist.clinics or []):
                rollback()
                return _err(
                    "Validation error.",
                    status=400,
                    field_errors={"clinic": ["Selected clinic is not assigned to this therapist."]},
                )

            # Validate project
            project = (data.get("project") or "").strip()
            if not project:
                rollback()
                return _err(
                    "Validation error.",
                    status=400,
                    field_errors={"project": ["Project is required."]},
                )
            if project not in (pat_therapist.projects or []):
                rollback()
                return _err(
                    "Validation error.",
                    status=400,
                    field_errors={"project": ["Selected project is not assigned to this therapist."]},
                )
            clinic_projects = config.get("therapistInfo", {}).get("clinic_projects") or {}
            if project not in clinic_projects.get(clinic, []):
                rollback()
                return _err(
                    "Validation error.",
                    status=400,
                    field_errors={"project": ["Selected project is not valid for the chosen clinic."]},
                )

            # Parse rehaEndDate (actual end of rehabilitation programme) — required
            raw_reha_end = (data.get("rehaEndDate") or "").strip()
            try:
                cleaned = raw_reha_end.split("T")[0]
                reha_end_date = datetime.strptime(cleaned, "%Y-%m-%d")
            except Exception as e:
                logger.warning(
                    "Invalid rehaEndDate. raw=%r cleaned=%r error=%s",
                    raw_reha_end,
                    (raw_reha_end.split("T")[0] if raw_reha_end else ""),
                    e,
                )
                rollback()
                return _err(
                    "Validation error.",
                    status=400,
                    field_errors={"rehaEndDate": ["Invalid date format. Use YYYY-MM-DD."]},
                )

            # Parse studyEndDate (study / after-rehab monitoring plan end) — optional
            study_end_date = None
            raw_study_end = (data.get("studyEndDate") or "").strip()
            if raw_study_end:
                try:
                    cleaned_study = raw_study_end.split("T")[0]
                    study_end_date = datetime.strptime(cleaned_study, "%Y-%m-%d")
                except Exception as e:
                    logger.warning("Invalid studyEndDate. raw=%r error=%s", raw_study_end, e)
                    rollback()
                    return _err(
                        "Validation error.",
                        status=400,
                        field_errors={"studyEndDate": ["Invalid date format. Use YYYY-MM-DD."]},
                    )

            patient = Patient(
                userId=user,
                patient_code=(data.get("patient_code") or "").strip(),
                name=sanitize_text(data.get("lastName"), True),
                first_name=sanitize_text(data.get("firstName"), True),
                age=(data.get("age") or ""),
                therapist=pat_therapist,
                clinic=clinic,
                project=project,
                created_by=pat_therapist,
                sex=((data.get("sex") or "").strip() if isinstance(data.get("sex"), str) else data.get("sex")),
                diagnosis=data.get("diagnosis"),
                function=data.get("function"),
                restrictions=sanitize_text(data.get("restrictions", "-")),
                access_word=raw_password,
                duration=(reha_end_date.date() - timezone.now().date()).days,
                reha_end_date=reha_end_date,
                study_end_date=study_end_date,
                # ✅ FIX: correct key (your payload uses "careGiver")
                care_giver=sanitize_text(data.get("careGiver", ""), True),
                initial_questionnaire_enabled=bool(data.get("initialQuestionnaireEnabled", False)),
            )

            try:
                patient.save()
            except Exception as e:
                logger.exception("Patient save failed.")
                rollback()
                return _err("Patient creation failed.", status=400, non_field_errors=[str(e)])

            # create rehab plan; if fails -> rollback patient + user
            try:
                ok = create_rehab_plan(patient, pat_therapist)
            except Exception as e:
                logger.exception("create_rehab_plan crashed.")
                rollback()
                return _err(
                    "Rehabilitation plan creation failed.",
                    status=500,
                    non_field_errors=[str(e)],
                )

            if not ok:
                rollback()
                return _err("Rehabilitation plan creation failed.", status=500)

            return JsonResponse(
                {
                    "success": True,
                    "message": "Patient registered successfully",
                    "id": user.username,
                },
                status=200,
            )

        # ===================== Therapist Registration =====================
        if user_type == "Therapist":
            clinics = data.get("clinic") or []
            projects = data.get("projects") or []

            clinic_projects = config.get("therapistInfo", {}).get("clinic_projects") or {}

            # allowed projects from selected clinics
            allowed = set()
            for c in clinics:
                for p in clinic_projects.get(c, []):
                    allowed.add(p)

            invalid = [p for p in projects if p not in allowed]
            if invalid:
                rollback()
                return _err(
                    "Validation error.",
                    status=400,
                    field_errors={"projects": [f"Invalid project(s) for selected clinics: {', '.join(invalid)}"]},
                )

            therapist = Therapist(
                userId=user,
                name=sanitize_text(data.get("lastName", ""), True),
                first_name=sanitize_text(data.get("firstName", ""), True),
                specializations=data.get("specialisation") or [],
                clinics=clinics,
                projects=projects,  # ✅ NEW
            )

            try:
                therapist.save()
            except Exception as e:
                logger.exception("Therapist save failed.")
                rollback()
                return _err("Therapist creation failed.", status=400, non_field_errors=[str(e)])

            # Notify all admin users that a new therapist is awaiting approval
            _notify_admins_new_therapist(user, therapist)

            return JsonResponse(
                {
                    "success": True,
                    "message": "Therapist registered successfully",
                    "id": user.username,
                },
                status=200,
            )

        # ===================== Admin / other =====================
        # If you later create other docs here, follow the same rollback pattern.
        return JsonResponse({"success": True, "message": "Admin added"}, status=200)

    except Exception as e:
        logger.exception("Unexpected error in register_view")
        rollback()
        return _err("Internal server error", status=500, non_field_errors=[str(e)])


def generate_code(length=6):
    return "".join(random.choices(string.digits, k=length))


# =============================
# SEND 2FA CODE (Therapist)
# - Fixes MongoEngine ValidationError by forcing str(user.id)
# - Deletes old codes first
# - Logs what's saved
# =============================
@csrf_exempt
def send_verification_code(request):
    try:
        data = json.loads(request.body)
        user_id = data.get("userId")

        if not user_id:
            return JsonResponse({"error": "Missing user ID"}, status=400)

        user = User.objects.filter(pk=user_id).first()
        if not user:
            return JsonResponse({"error": "User not found"}, status=404)
        if not getattr(user, "email", None):
            return JsonResponse({"error": "User has no email address configured"}, status=400)

        code = generate_code()
        expires_at = timezone.now() + timedelta(minutes=5)

        # Save to MongoDB
        SMSVerification(userId=user_id, code=code, expires_at=expires_at).save()

        # Localized subjects
        subject = "RehaAdvisor Verification Code"

        # ----- HTML Email (Multilingual Version) -----
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>🔐 Verification Code</h2>

            <!-- GERMAN -->
            <h3>🇩🇪 Deutsch</h3>
            <p>Hallo {user.username},</p>
            <p>Ihr Verifizierungscode lautet: <b>{code}</b></p>
            <p>Er ist für <b>5 Minuten</b> gültig.</p>

            <!-- FRENCH -->
            <h3>🇫🇷 Français</h3>
            <p>Bonjour {user.username},</p>
            <p>Votre code de vérification est : <b>{code}</b></p>
            <p>Il est valable pendant <b>5 minutes</b>.</p>

            <!-- ITALIAN -->
            <h3>🇮🇹 Italiano</h3>
            <p>Ciao {user.username},</p>
            <p>Il tuo codice di verifica è: <b>{code}</b></p>
            <p>È valido per <b>5 minuti</b>.</p>

            <!-- ENGLISH -->
            <h3>🇬🇧 English</h3>
            <p>Hello {user.username},</p>
            <p>Your verification code is: <b>{code}</b></p>
            <p>It will expire in <b>5 minutes</b>.</p>

            <br>
            <p style="font-size: 12px; color: #999;">
                If you did not request this code, you can safely ignore this message.
            </p>
        </body>
        </html>
        """

        # Plain text fallback (auto-generated)
        text_content = strip_tags(html_content)

        # Build and send email
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        )
        msg.attach_alternative(html_content, "text/html")
        sent_count = msg.send(fail_silently=False)
        if isinstance(sent_count, int) and sent_count < 1:
            return JsonResponse({"error": "Verification email could not be delivered"}, status=500)

        return JsonResponse({"message": "Verification code sent successfully"}, status=200)

    except Exception as e:
        logger.error(f"[send_verification_code] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def verify_code_view(request):
    try:
        data = json.loads(request.body or "{}")
        user_id = (data.get("userId") or "").strip()
        code = (data.get("verificationCode") or "").strip()

        if not user_id or not code:
            return JsonResponse({"error": "Missing user ID or verification code"}, status=400)

        verification = SMSVerification.objects(userId=user_id, code=code).order_by("-created_at").first()
        if not verification:
            return JsonResponse({"error": "Invalid verification code"}, status=400)

        # ---- Compare in UTC (+00:00) ALWAYS ----
        expires_at = verification.expires_at
        if timezone.is_naive(expires_at):
            expires_at_utc = expires_at.replace(tzinfo=dt_timezone.utc)
        else:
            expires_at_utc = expires_at.astimezone(dt_timezone.utc)

        now_utc = timezone.now().astimezone(dt_timezone.utc)

        if expires_at_utc < now_utc:
            verification.delete()
            return JsonResponse({"error": "Verification code expired"}, status=400)

        user = User.objects.get(pk=user_id)
        verification.delete()

        refresh = RefreshToken.for_user(user)
        Logs.objects.create(userId=user, action="LOGIN", userAgent=user.role)

        return JsonResponse(
            {
                "message": "Verification successful",
                "access_token": str(refresh.access_token),
                "refresh_token": str(refresh),
            },
            status=200,
        )

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_user_info(request, user_id):
    try:
        user = User.objects.filter(pk=ObjectId(user_id)).first()
        if not user:
            return JsonResponse({"error": "User not found"}, status=404)

        first_name = ""
        last_name = ""
        specialisation = ""
        function = ""

        if user.role == "Therapist":
            therapist = Therapist.objects.filter(userId=user).first()
            if therapist:
                first_name = therapist.first_name
                last_name = therapist.name
                specialisation = therapist.specializations

        elif user.role == "Patient":
            patient = Patient.objects.filter(userId=user).first()
            if patient:
                first_name = patient.first_name
                last_name = patient.name
                function = patient.function

        else:  # Admin fallback
            first_name = user.username

        return JsonResponse(
            {
                "first_name": first_name,
                "last_name": last_name,
                "specialisation": specialisation,
                "function": function,
                "role": user.role,
            },
            status=200,
        )

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
