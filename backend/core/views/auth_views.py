import json
import logging
import random
import string
from datetime import datetime, timedelta
from twilio.rest import Client
from bson import ObjectId
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from django.conf import settings
logger = logging.getLogger(__name__)  # Fallback to file-based logger if needed
email_user = settings.EMAIL_HOST_USER


from core.models import (
    InterventionAssignment,
    Logs,
    Patient,
    PatientInterventionLogs,
    RehabilitationPlan,
    SMSVerification,
    Therapist,
    User,
)
from utils.utils import (
    generate_custom_id,
    generate_repeat_dates,
    get_labels,
    sanitize_text,
)

logger = logging.getLogger(__name__)


def create_rehab_plan(patient, therapist):
    try:
        new_interventions = []
        patient_diagnoses = patient.diagnosis  # Assuming it's a list
        interventions_data = therapist.default_recommendations

        for item in interventions_data:
            for diagnosis in patient_diagnoses:
                # Skip if the intervention is not assigned to this diagnosis
                if diagnosis not in item.diagnosis_assignments:
                    continue

                assignment_data = item.diagnosis_assignments[diagnosis]

                if not assignment_data.active:
                    continue

                # Construct intervention schedule config
                intervention_dates = {
                    "interval": int(assignment_data.interval) or 1,
                    "unit": assignment_data.unit or "week",
                    "selectedDays": assignment_data.selected_days or [],
                    "end": {
                        "type": assignment_data.end_type or "never",
                        "count": assignment_data.count_limit,
                    },
                }
                scheduled_dates = generate_repeat_dates(
                    patient.reha_end_date, intervention_dates
                )
                assignment = InterventionAssignment(
                    interventionId=item.recommendation,
                    frequency="",  # Adjust if needed
                    notes="",
                    dates=scheduled_dates,
                )
                new_interventions.append(assignment)
        # Avoid duplicates by checking existing plan
        existing_plan = RehabilitationPlan.objects(patientId=patient).first()
        if existing_plan:
            existing_ids = {
                str(i.interventionId.id) for i in existing_plan.interventions
            }
            interventions_to_add = [
                ni
                for ni in new_interventions
                if str(ni.interventionId.id) not in existing_ids
            ]
            if interventions_to_add:
                existing_plan.interventions.extend(interventions_to_add)
                existing_plan.updatedAt = timezone.now()
                existing_plan.save()
        else:
            rehab_plan = RehabilitationPlan(
                patientId=patient,
                therapistId=therapist,
                startDate=patient.userId.createdAt,
                endDate=patient.reha_end_date,
                status="active",
                interventions=new_interventions,
                createdAt=timezone.now(),
                updatedAt=timezone.now(),
            )
            rehab_plan.save()

        return True

    except Exception as e:
        print(f"Error creating rehab plan: {e}")


@csrf_exempt  # Disabled for JWT; ensure HTTPS + token usage in frontend
def login_view(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        # Parse login data
        data = json.loads(request.body)
        identifier = data.get("email")
        raw_password = data.get("password")

        if not identifier or not raw_password:
            return JsonResponse(
                {"error": "Email/username and password are required."}, status=400
            )

        # Find user by email or username
        user = User.objects.filter(
            __raw__={"$or": [{"email": identifier}, {"username": identifier}]}
        ).first()

        if not user:
            logger.warning(f"Login failed: User '{identifier}' not found.")
            return JsonResponse({"error": "User not found."}, status=404)

        if not user.isActive:
            logger.warning(f"Login failed: Inactive user '{identifier}'.")
            return JsonResponse(
                {"error": "User has not yet been accepted."}, status=403
            )

        if not check_password(raw_password, user.pwdhash):
            logger.warning(f"Login failed: Invalid password for user '{identifier}'.")
            return JsonResponse({"error": "Invalid credentials."}, status=401)

        # Retrieve user-specific info
        profile_info = {}
        try:
            if user.role == "Therapist":
                therapist = Therapist.objects.get(userId=user)
                profile_info["full_name"] = therapist.first_name
                profile_info["specialisation"] = therapist.specializations
            elif user.role == "Patient":
                patient = Patient.objects.get(userId=user)
                profile_info["full_name"] = patient.first_name
                profile_info["specialisation"] = patient.function
            else:
                profile_info["full_name"] = user.username
                profile_info["specialisation"] = ""
        except (Therapist.DoesNotExist, Patient.DoesNotExist) as e:
            logger.warning(f"Profile data missing for user '{identifier}': {str(e)}")

        # Create auth tokens
        refresh = RefreshToken.for_user(user)
        Logs.objects.create(userId=user, action="LOGIN", userAgent=user.role)

        return JsonResponse(
            {
                "user_type": user.role,
                "id": str(user.id),
                "access_token": str(refresh.access_token),
                "refresh_token": str(refresh),
                **profile_info,
            },
            status=200,
        )

    except json.JSONDecodeError:
        logger.exception("Login failed: Invalid JSON payload.")
        return JsonResponse({"error": "Invalid input format."}, status=400)
    except Exception as e:
        logger.exception("Unexpected error during login.")
        return JsonResponse({"error": "Internal server error."}, status=500)


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

        return JsonResponse(
            {"message": "Password reset successfully, email sent."}, status=200
        )

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def register_view(request):
    """
    Registers a new patient or therapist.
    Endpoint: POST /api/auth/register/
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)

        user_type = data.get("userType")
        email = data.get("email")
        raw_password = data.get("password")

        if not user_type or not email or not raw_password:
            return JsonResponse({"error": "Missing required fields."}, status=400)

        if User.objects.filter(email=email):
            return JsonResponse({"error": "Email already exists"}, status=400)

        user = User(
            username=generate_custom_id(user_type),
            role=user_type,
            email=sanitize_text(email),
            phone=sanitize_text(data.get("phone", "")),
            pwdhash=make_password(raw_password),
            createdAt=datetime.today(),
            isActive=(user_type == "Patient"),
        )
        user.save()

        # --- Patient Registration ---
        if user_type == "Patient":
            try:
                therapist_user = User.objects.get(pk=data.get("therapist"))
                pat_therapist = Therapist.objects.get(userId=therapist_user)
            except (User.DoesNotExist, Therapist.DoesNotExist):
                return JsonResponse(
                    {"error": "Assigned therapist not found."}, status=404
                )

            reha_end_date = datetime.strptime(data.get("rehaEndDate"), "%Y-%m-%d")
            patient = Patient(
                userId=user,
                name=sanitize_text(data.get("lastName"), True),
                first_name=sanitize_text(data.get("firstName"), True),
                age=data.get("age", ""),
                therapist=pat_therapist,
                sex=data.get("sex"),
                diagnosis=data.get("diagnosis"),
                function=data.get("function"),
                medication_intake=sanitize_text(data.get("medicationIntake", "-")),
                access_word=raw_password,
                duration=(reha_end_date.date() - datetime.today().date()).days,
                reha_end_date=reha_end_date,
                care_giver=sanitize_text(data.get("carreGiver", ""), True),
            )
            patient.save()

            if create_rehab_plan(patient, pat_therapist):
                return JsonResponse(
                    {"message": "Patient registered successfully", "id": user.username},
                    status=201,
                )
            else:
                return JsonResponse(
                    {"error": "Rehabilitation plan creation failed."}, status=500
                )

        # --- Therapist Registration ---
        elif user_type == "Therapist":
            therapist = Therapist(
                userId=user,
                name=sanitize_text(data.get("lastName", ""), True),
                first_name=sanitize_text(data.get("firstName", ""), True),
                specializations=data.get("specialisation"),
                clinics=data.get("clinic"),
            )
            therapist.save()
            return JsonResponse(
                {"message": "Therapist registered successfully", "id": user.username},
                status=201,
            )

        return JsonResponse({"message": "Admin added"}, status=200)

    except json.JSONDecodeError:
        logger.warning("Invalid JSON in register_view.")
        return JsonResponse({"error": "Invalid input format."}, status=400)
    except Exception as e:
        logger.exception("Unexpected error during registration.")
        return JsonResponse({"error": "Internal server error"}, status=500)


def generate_code(length=6):
    return "".join(random.choices(string.digits, k=length))





def send_sms(phone_number, message):
    account_sid = "your_twilio_sid"
    auth_token = "your_twilio_auth_token"
    client = Client(account_sid, auth_token)

    client.messages.create(
        body=message, from_="+1234567890", to=phone_number  # Your Twilio number
    )


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

        code = generate_code()
        expires_at = timezone.now() + timedelta(minutes=5)

        # Save to MongoDB
        SMSVerification(userId=user_id, code=code, expires_at=expires_at).save()

        # Example: send via email (replace with SMS sending logic)
        send_mail(
            subject="Your Verification Code",
            message=(
                f"Hello {user.username},\n\n"
                f"Your verification code is: {code}\n\n"
                "It will expire in 5 minutes."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )

        return JsonResponse(
            {"message": "Verification code sent successfully"}, status=200
        )

    except Exception as e:
        logger.error(
            f"[send_verification_code] Unexpected error: {str(e)}", exc_info=True
        )
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def verify_code_view(request):
    try:
        data = json.loads(request.body)
        user_id = data.get("userId")
        code = data.get("verificationCode")

        if not user_id or not code:
            return JsonResponse(
                {"error": "Missing user ID or verification code"}, status=400
            )

        # Find the code in the DB
        verification = SMSVerification.objects.filter(userId=user_id, code=code).first()

        if not verification:
            return JsonResponse({"error": "Invalid verification code"}, status=400)

        # Ensure expires_at is timezone-aware
        expires_at = verification.expires_at
        if timezone.is_naive(expires_at):
            expires_at = timezone.make_aware(expires_at)

        if expires_at < timezone.now():
            verification.delete()
            return JsonResponse({"error": "Verification code expired"}, status=400)

        # Success: delete the verification code
        verification.delete()

        return JsonResponse({"message": "Verification successful"}, status=200)

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
