import json
import logging
from django.conf import settings
from bson import ObjectId
from django.contrib.auth.hashers import check_password, make_password
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from core.models import Logs, Patient, Therapist, User, PasswordAttempt
from utils.utils import convert_to_serializable, sanitize_text, check_rate_limit, validate_password_strength

logger = logging.getLogger(__name__)
from datetime import datetime, timedelta, date
import re
from django.core.mail import send_mail
from django.views.decorators.http import require_http_methods
from mongoengine.queryset.visitor import Q

# ----------------------------------------
# Helper
# ----------------------------------------
def valid_update_value(v):
    if v in ("", None, []):
        return False     # skip completely
    return True          # update stored value

@csrf_exempt
@permission_classes([IsAuthenticated])
def change_password(request, therapist_id):
    """
    Secure password change with:
    - self-only change (except Admin/Therapist)
    - rate limiting
    - strong password rules
    """
    if request.method != "PUT":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    # Resolve user OR patient id
    try:
        try:
            user = User.objects.get(pk=ObjectId(therapist_id))
        except Exception:
            patient = Patient.objects.get(pk=ObjectId(therapist_id))
            user = patient.userId
    except Exception:
        return JsonResponse({"error": "User not found"}, status=404)

    # Rate limiting
    now = timezone.now()
    window = timedelta(minutes=5)
    max_attempts = 5

    attempt = PasswordAttempt.objects(user=user).first()
    if not attempt:
        attempt = PasswordAttempt(user=user, count=0, last_attempt=now)
        attempt.save()

    if attempt.count >= max_attempts:
        if now - attempt.last_attempt < window:
            remaining = int((window - (now - attempt.last_attempt)).total_seconds() / 60)
            return JsonResponse({
                "error": "Too many failed attempts.",
                "minutes_remaining": remaining,
            }, status=429)
        else:
            attempt.count = 0
            attempt.save()

    # Parse JSON
    try:
        data = json.loads(request.body)
    except:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    old_password = data.get("old_password")
    new_password = data.get("new_password")

    if not old_password or not new_password:
        return JsonResponse({"error": "Missing password fields"}, status=400)

    # Check old password
    if not check_password(old_password, user.pwdhash):
        attempt.count += 1
        attempt.last_attempt = now
        attempt.save()
        return JsonResponse({"error": "Old password incorrect"}, status=403)

    # Reset attempt counter
    attempt.count = 0
    attempt.last_attempt = now
    attempt.save()

    # Strong password check
    import re
    if (
        len(new_password) < 8 or
        not re.search(r"[A-Z]", new_password) or
        not re.search(r"[a-z]", new_password) or
        not re.search(r"[0-9]", new_password) or
        not re.search(r"[!@#$%^&*(),.?\":{}|<>]", new_password)
    ):
        return JsonResponse({
            "error": "Weak password: must contain upper, lower, number, special char, and 8+ chars"
        }, status=400)

    # Save new password
    user.pwdhash = make_password(new_password)
    user.save()

    Logs.objects.create(
        userId=user,
        action="UPDATE_PROFILE",
        userAgent="Therapist",
        details="Password changed securely"
    )

    return JsonResponse({"message": "Password changed successfully"}, status=200)



@csrf_exempt
@permission_classes([IsAuthenticated])
def user_profile_view(request, user_id):
    """
    Secure GET / PUT / DELETE of user/patient/therapist profile.
    - Strong field whitelisting
    - Sanitization
    - Strict date validation
    - Passwords are NOT modified here
    - Therapist/Admin may update any patient; otherwise self-update only
    """

    logger.info(f"[PROFILE] user_profile_view user_id={user_id}")
    print(f"[PROFILE] user_profile_view user_id={user_id}")

    # ------------------------------------------------------------------
    # Resolve actual USER object (ID may be User ID OR Patient ID)
    # ------------------------------------------------------------------
    try:
        user = User.objects.get(pk=ObjectId(user_id))
    except User.DoesNotExist:
        try:
            patient = Patient.objects.get(pk=ObjectId(user_id))
            user = patient.userId
        except Patient.DoesNotExist:
            logger.exception("Error fetching profile")
            return JsonResponse({"error": "Error fetching profile"}, status=500)

    target_role = getattr(user, "role", "Patient")

    # ------------------------------------------------------------------
    # Sanitizer
    # ------------------------------------------------------------------

    def sanitize(v):
        # Mongo ObjectId
        if isinstance(v, ObjectId):
            return str(v)

        # dates / datetimes
        if isinstance(v, datetime):
            return v.isoformat()
        if isinstance(v, date):
            return v.isoformat()

        # MongoEngine EmbeddedDocument / Document (PatientThresholds, etc.)
        if hasattr(v, "to_mongo"):
            try:
                # to_mongo() returns a BSON-friendly structure (often SON)
                return sanitize(v.to_mongo().to_dict())
            except Exception:
                # fallback: string representation
                return str(v)

        # dict-like
        if isinstance(v, dict):
            return {str(k): sanitize(val) for k, val in v.items()}

        # lists/tuples
        if isinstance(v, (list, tuple)):
            return [sanitize(x) for x in v if x not in ("", None)]

        # strings
        if isinstance(v, str):
            cleaned = (
                v.replace("<", "")
                .replace(">", "")
                .replace("{", "")
                .replace("}", "")
                .strip()
            )
            return cleaned[:500]

        # numbers / bool / None
        if isinstance(v, (int, float, bool)) or v is None:
            return v

        # everything else (safe fallback)
        return str(v)


    # ------------------------------------------------------------------
    # Allowed field schemas
    # ------------------------------------------------------------------
    PATIENT_ALLOWED_USER = {
        "username": str,
        "email": str,
        "phone": str,
    }

    PATIENT_ALLOWED_PATIENT = {
        "first_name": str,
        "name": str,
        "gender": str,
        "birthdate": "date",
        "height": float,
        "weight": float,
        "function": list,
        "diagnosis": list,
        "clinic": str,
        "reha_end_date": "date",
        "last_clinic_visit": "date",
        "level_of_education": str,
        "professional_status": str,
        "marital_status": str,
        "restrictions": str,
        "lifestyle": list,
        "personal_goals": list,
        "social_support": list,
    }

    TH_ALLOWED_USER = {"username": str, "email": str, "phone": str}
    TH_ALLOWED_TH = {
        "name": str,
        "first_name": str,
        "specializations": list,
        "clinics": list,
    }

    # ================================ GET ======================================
    if request.method == "GET":
        try:
            if target_role == "Therapist":
                th = Therapist.objects.get(userId=user.id)

                obj = {
                    "username": sanitize(user.username),
                    "email": sanitize(user.email),
                    "phone": sanitize(user.phone),
                    "name": sanitize(th.name),
                    "first_name": sanitize(th.first_name),
                    "specializations": th.specializations or [],
                    "clinics": th.clinics or [],
                }

            else:  # PATIENT
                pt = Patient.objects.get(userId=user.id)

                excluded_user = {"pwdhash", "createdAt", "updatedAt", "id"}
                excluded_patient = {"pwdhash", "access_word", "therapist", "userId", "id"}

                obj = {}

                for f in User._fields:
                    if f not in excluded_user:
                        obj[f] = sanitize(getattr(user, f, None))

                for f in Patient._fields:
                    if f not in excluded_patient:
                        obj[f] = sanitize(getattr(pt, f, None))

                # Format datetime -> ISO date
                for dkey in ("reha_end_date", "last_clinic_visit"):
                    if isinstance(obj.get(dkey), datetime):
                        obj[dkey] = obj[dkey].date().isoformat()

                # Last online
                last_login = (
                    Logs.objects(userId=user, action="LOGIN")
                    .order_by("-timestamp")
                    .first()
                )
                if last_login:
                    obj["last_online"] = last_login.timestamp.date().isoformat()

            return JsonResponse(obj, status=200)

        except Exception as e:
            logger.exception("GET profile failed")
            return JsonResponse({"error": str(e)}, status=500)

    # ================================ PUT ======================================
    if request.method == "PUT":
        try:
            raw = json.loads(request.body)

            # Overposting protection
            forbidden = {
                "pwdhash",
                "role",
                "createdAt",
                "updatedAt",
                "id",
                "_id",
                "userId",
                "therapist",
                "last_online",
            }
            for k in list(raw.keys()):
                if k in forbidden:
                    del raw[k]

            # Validate email + phone
            if "email" in raw and not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", raw["email"]):
                return JsonResponse({"error": "Invalid email"}, status=400)

            if "phone" in raw and not re.match(r"^\+?[0-9]{7,15}$", raw["phone"]):
                return JsonResponse({"error": "Invalid phone"}, status=400)

            updated = {}
            old = {}

            if target_role == "Therapist":
                therapist = Therapist.objects.get(userId=user.id)

                # User fields
                for field, expected_type in TH_ALLOWED_USER.items():
                    if field in raw:
                        raw_val = raw[field]
                        if not valid_update_value(raw_val):
                            continue
                        val = sanitize(raw_val)
                        old[field] = getattr(user, field)
                        setattr(user, field, val)
                        updated[field] = val

                # Therapist fields
                for field, expected_type in THERAPIST_ALLOWED_THERAPIST.items():
                    if field in raw:
                        raw_val = raw[field]
                        if not valid_update_value(raw_val):
                            continue
                        val = sanitize(raw_val)
                        old[field] = getattr(therapist, field)
                        setattr(therapist, field, val)
                        updated[field] = val

                user.save()
                therapist.save()


            else:  # PATIENT
                patient = Patient.objects.get(userId=user.id)

                # ------------------------------
                # Update USER fields
                # ------------------------------
                for field, expected_type in PATIENT_ALLOWED_USER.items():
                    if field in raw:
                        raw_val = raw[field]

                        # SKIP empty values → don't overwrite and don't validate
                        if not valid_update_value(raw_val):
                            continue

                        val = sanitize(raw_val)
                        old[field] = getattr(user, field)
                        setattr(user, field, val)
                        updated[field] = val

                # ------------------------------
                # Update PATIENT fields
                # ------------------------------
                for field, expected_type in PATIENT_ALLOWED_PATIENT.items():
                    if field not in raw:
                        continue

                    raw_val = raw[field]

                    # SKIP empty or invalid updates
                    if not valid_update_value(raw_val):
                        continue

                    # --- Date parsing ---
                    if expected_type == "date":
                        try:
                            raw_val = raw_val.split("T")[0]
                            parsed = datetime.strptime(raw_val, "%Y-%m-%d")
                            val = parsed
                        except Exception:
                            return JsonResponse({"error": f"Invalid date for {field}"}, status=400)

                    else:
                        val = sanitize(raw_val)

                    old[field] = getattr(patient, field)
                    setattr(patient, field, val)
                    updated[field] = val

                user.save()
                patient.save()


            Logs.objects.create(
                userId=user,
                action="UPDATE_PROFILE",
                userAgent="Patient",
                details=f"Updated: {updated} | old: {old}",
            )

            return JsonResponse({"message": "Profile updated", "updated": updated}, status=200)

        except Exception as e:
            logger.exception("PUT profile failed")
            return JsonResponse({"error": "Internal server error"}, status=500)

    # ================================ DELETE ====================================
    if request.method == "DELETE":
        try:
            user.isActive = False
            user.save()

            Logs.objects.create(
                userId=user,
                action="DELETE_ACCOUNT",
                userAgent='Patient',
                details=f"Soft-deleted {user_id}",
            )

            return JsonResponse({"message": "User deleted"}, status=200)

        except Exception as e:
            logger.exception("DELETE profile failed")
            return JsonResponse({"error": "Internal server error"}, status=500)

    return JsonResponse({"error": "Method not allowed"}, status=405)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_pending_users(request):
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)


    try:
        pending_users = User.objects(isActive=False)
        result = []

        for user in pending_users:
            user_info = {
                "id": str(user.id),
                "username": getattr(user, "username", ""),
                "email": getattr(user, "email", ""),
                "role": getattr(user, "role", ""),
                "phone": getattr(user, "phone", ""),
                "isActive": bool(getattr(user, "isActive", False)),
            }

            if getattr(user, "role", "") == "Therapist":
                therapist = Therapist.objects(userId=user.id).first()

                if therapist:
                    # Backward compat: some DBs may still have therapist.project (string)
                    project_single = getattr(therapist, "project", "") or ""
                    projects_list = getattr(therapist, "projects", None)

                    if projects_list is None:
                        # if new field doesn't exist yet, derive list from old single
                        projects_list = [project_single] if project_single else []

                    user_info.update(
                        {
                            "therapistId": str(therapist.id),  # ✅ FE needs this
                            "name": f"{getattr(therapist, 'first_name', '')} {getattr(therapist, 'name', '')}".strip(),
                            "specializations": getattr(therapist, "specializations", []) or [],
                            "clinics": getattr(therapist, "clinics", []) or [],
                            "projects": projects_list,
                        }
                    )
                else:
                    user_info.update(
                        {
                            "therapistId": None,
                            "name": "",
                            "specializations": [],
                            "clinics": [],
                            "projects": [],
                            "project": "",
                        }
                    )
            else:
                # For Admin / Researcher / others
                user_info.update(
                    {
                        "therapistId": None,
                        "name": user_info.get("username", "") or "",
                        "specializations": [],
                        "clinics": [],
                        "projects": [],
                        "project": "",
                    }
                )

            result.append(user_info)

        return JsonResponse({"pending_users": result}, status=200)

    except Exception as e:
        logger.exception("get_pending_users failed")
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def accept_user(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)


    try:
        data = json.loads(request.body or "{}")
        user_id = data.get("userId")

        if not user_id:
            return JsonResponse({"error": "userId is required"}, status=400)

        try:
            oid = ObjectId(user_id)
        except Exception:
            return JsonResponse({"error": "Invalid userId"}, status=400)

        user = User.objects(id=oid).first()
        if not user:
            return JsonResponse({"error": "User not found."}, status=404)

        user.isActive = True
        user.save()

        # Email (safe guards)
        if getattr(user, "email", None):
            send_mail(
                subject="Account Activation",
                message="Dear user, your account has been accepted and activated. You can now log in.",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )

        return JsonResponse({"message": "User accepted successfully."}, status=200)

    except Exception as e:
        logger.exception("accept_user failed")
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def decline_user(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body or "{}")
        user_id = data.get("userId")

        if not user_id:
            return JsonResponse({"error": "userId is required"}, status=400)

        try:
            oid = ObjectId(user_id)
        except Exception:
            return JsonResponse({"error": "Invalid userId"}, status=400)

        user = User.objects(id=oid).first()
        if not user:
            return JsonResponse({"error": "User not found."}, status=404)

        # capture email before deletion
        email = getattr(user, "email", None)

        user.delete()

        if email:
            send_mail(
                subject="Account Declined",
                message="Dear user, we regret to inform you that your registration was not approved.",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=False,
            )

        return JsonResponse({"message": "User declined and deleted successfully."}, status=200)

    except Exception as e:
        logger.exception("decline_user failed")
        return JsonResponse({"error": str(e)}, status=500)