import json
import logging
from datetime import datetime
from django.conf import settings
from bson import ObjectId
from django.contrib.auth.hashers import check_password, make_password
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Logs, Patient, Therapist, User
from utils.utils import convert_to_serializable, sanitize_text

logger = logging.getLogger(__name__)
from datetime import datetime, timedelta

from django.core.mail import send_mail
from django.views.decorators.http import require_http_methods
from mongoengine.queryset.visitor import Q


@csrf_exempt
@permission_classes([IsAuthenticated])
def user_profile_view(request, user_id):
    """
    GET / PUT / DELETE user profile logic.
    """
    logger.info(f"Hit user_profile_view with user_id={user_id}")

    try:
        user = User.objects.get(pk=ObjectId(user_id))
    except User.DoesNotExist:
        try:
            patient = Patient.objects.get(pk=ObjectId(user_id))
            user = patient.userId
        except Patient.DoesNotExist:
            logger.exception("Error fetching profile")
            return JsonResponse({"error": "Error fetching profile"}, status=500)

    role = getattr(user, "role", "Patient")

    if request.method == "GET":
        try:
            if role == "Therapist":
                therapist = Therapist.objects.get(userId=user.id)
                data = {
                    "username": user.username,
                    "email": user.email,
                    "phone": user.phone,
                    "name": therapist.name,
                    "first_name": therapist.first_name,
                    "specializations": therapist.specializations,
                    "clinics": therapist.clinics,
                }
            else:
                patient = Patient.objects.get(userId=user.id)
                excluded_user_fields = ["id", "pwdhash", "createdAt", "updatedAt"]
                excluded_patient_fields = [
                    "id",
                    "pwdhash",
                    "access_word",
                    "therapist",
                    "userId",
                ]

                user_fields = [
                    field.name
                    for field in User._fields.values()
                    if field.name not in excluded_user_fields
                ]
                patient_fields = [
                    field.name
                    for field in Patient._fields.values()
                    if field.name not in excluded_patient_fields
                ]

                data = {
                    field: (
                        getattr(user, field, None)
                        if field in user_fields
                        else getattr(patient, field, None)
                    )
                    for field in (user_fields + patient_fields)
                }

            return JsonResponse(data, safe=False)
        except (Therapist.DoesNotExist, Patient.DoesNotExist):
            return JsonResponse({"error": f"{role} profile not found."}, status=404)

    elif request.method == "PUT":
        try:
            data = json.loads(request.body)
            new_password = data.get("newPassword")
            old_password = data.get("oldPassword")

            if new_password:
                if not old_password:
                    return JsonResponse({"error": "Old password required."}, status=400)
                if check_password(old_password, user.pwdhash):
                    user.pwdhash = make_password(new_password)
                else:
                    return JsonResponse(
                        {"error": "Old password incorrect."}, status=403
                    )

            updated_fields = []
            if role == "Therapist":
                therapist = Therapist.objects.get(userId=user.id)
                for key in [
                    "username",
                    "email",
                    "phone",
                    "name",
                    "first_name",
                    "specializations",
                    "clinics",
                ]:
                    val = data.get(key)
                    if val:
                        setattr(
                            user if hasattr(user, key) else therapist,
                            key,
                            sanitize_text(val),
                        )
                        updated_fields.append(key)

                user.save()
                therapist.save()
            elif role == "Patient":
                patient = Patient.objects.get(userId=user.id)
                if data.get("reha_end_date"):
                    try:
                        data["reha_end_date"] = datetime.strptime(
                            data.get("reha_end_date").split("T")[0], "%Y-%m-%d"
                        )
                    except ValueError:
                        return JsonResponse(
                            {"error": "Invalid date format for reha_end_date"},
                            status=400,
                        )

                for model, allowed_fields in [
                    (user, User._fields),
                    (patient, Patient._fields),
                ]:
                    for key in allowed_fields:
                        if key in data:
                            setattr(model, key, sanitize_text(data[key]))
                            updated_fields.append(key)

                user.save()
                patient.save()

            Logs.objects.create(userId=user, action="UPDATE_PROFILE", userAgent=role)
            return JsonResponse(
                {"message": "Profile updated", "updated": updated_fields}, status=200
            )
        except Exception as e:
            logger.exception("Error updating profile for user %s", user_id)
            return JsonResponse({"error": str(e)}, status=500)

    elif request.method == "DELETE":
        try:
            user.is_active = False
            user.save()
            Logs.objects.create(
                userId=user,
                action="DELETE_ACCOUNT",
                userAgent=role,
                details=f"Soft-deleted account for {user.username}",
            )
            return JsonResponse({"message": "User deleted successfully."}, status=200)
        except Exception as e:
            logger.exception("Error deleting user %s", user_id)
            return JsonResponse({"error": str(e)}, status=500)

    return JsonResponse({"error": "Method not allowed"}, status=405)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_pending_users(request):
    if request.method == "GET":
        try:
            pending_users = User.objects(isActive=False)
            result = []

            for user in pending_users:
                user_info = {
                    "id": str(user.id),
                    "username": user.username,
                    "email": user.email,
                    "role": user.role,
                    "phone": user.phone,
                    "isActive": user.isActive,
                }

                if user.role == "Therapist":
                    try:
                        therapist = Therapist.objects.get(userId=user.id)
                        user_info.update(
                            {
                                "name": therapist.first_name + " " + therapist.name,
                                "specializations": therapist.specializations,
                                "clinics": therapist.clinics,
                            }
                        )
                    except Therapist.DoesNotExist:
                        user_info.update(
                            {
                                "name": "",
                                "specializations": [],
                                "clinics": [],
                            }
                        )
                else:  # Admin or other roles without therapist info
                    user_info.update(
                        {
                            "name": "",
                            "specializations": [],
                            "clinics": [],
                        }
                    )

                result.append(user_info)

            return JsonResponse({"pending_users": result}, status=200)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def accept_user(request):
    try:
        data = json.loads(request.body)
        user_id = data.get("userId")
        user = User.objects.get(id=user_id)

        user.isActive = True
        user.save()

        send_mail(
            subject="Account Activation",
            message=(
                "Dear user, your account has been accepted and activated. You can now log in."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )

        return JsonResponse({"message": "User accepted successfully."}, status=200)

    except User.DoesNotExist:
        return JsonResponse({"error": "User not found."}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def decline_user(request):
    try:
        data = json.loads(request.body)
        user_id = data.get("userId")
        user = User.objects.get(id=ObjectId(user_id))

        # Delete and send email...
        user.delete()
        send_mail(
            subject="Account Declined",
            message=(
                f"Dear user, we regret to inform you that your registration was not approved."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
        

        return JsonResponse(
            {"message": "User declined and deleted successfully."}, status=200
        )

    except User.DoesNotExist:
        return JsonResponse({"error": "User not found."}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
