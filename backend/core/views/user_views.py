import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from datetime import datetime
from core.models import Therapist, Patient, Logs, User
from bson import ObjectId
from utils.utils import (
    convert_to_serializable,
    sanitize_text
)
from django.contrib.auth.hashers import check_password, make_password
import logging
logger = logging.getLogger(__name__)


@csrf_exempt
@permission_classes([IsAuthenticated])
def user_profile_view(request, user_id):
    """
    GET     /api/users/<user_id>/profile/     -> retrieve user therapist/patient profile
    PUT     /api/users/<user_id>/profile/     -> update profile
    DELETE  /api/users/<user_id>/profile/     -> soft-delete account
    """
    from django.contrib.auth.hashers import check_password, make_password
    from datetime import datetime
    import logging

    logger = logging.getLogger(__name__)
    
    try:
        user = User.objects.get(pk=ObjectId(user_id))
    except User.DoesNotExist:
        return JsonResponse({'error': 'User not found'}, status=404)

    role = getattr(user, "role", "Patient")

    if request.method == 'GET':
        try:
            if role == 'Therapist':
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
                # Exclude sensitive/internal fields
                excluded_user_fields = ["id", "pwdhash", "createdAt", "updatedAt"]
                excluded_patient_fields = ["id", "pwdhash", "access_word", "therapist", "userId"]

                user_fields = [field.name for field in User._fields.values() if field.name not in excluded_user_fields]
                patient_fields = [field.name for field in Patient._fields.values() if field.name not in excluded_patient_fields]

                # Combine into one dictionary
                response_data = {
                    field: getattr(user, field, None) if field in user_fields else getattr(patient, field, None)
                    for field in (user_fields + patient_fields)
                }

            return JsonResponse(data, safe=False)

        except (Therapist.DoesNotExist, Patient.DoesNotExist) as e:
            return JsonResponse({"error": f"{role} profile not found."}, status=404)
        except Exception as e:
            logger.exception("Error fetching profile for user %s", user_id)
            return JsonResponse({"error": str(e)}, status=500)

    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)

            # Update password if requested
            new_password = data.get("newPassword")
            old_password = data.get("oldPassword")

            if new_password:
                if not old_password:
                    return JsonResponse({"error": "Old password required."}, status=400)
                if check_password(old_password, user.pwdhash):
                    user.pwdhash = make_password(new_password)
                else:
                    return JsonResponse({"error": "Old password incorrect."}, status=403)

            # Handle field updates
            updated_fields = []
            if role == 'Therapist':
                therapist = Therapist.objects.get(userId=user.id)
                for key in ["username", "email", "phone", "name", "first_name", "specializations", "clinics"]:
                    val = data.get(key)
                    if val:
                        setattr(user if hasattr(user, key) else therapist, key, sanitize_text(val))
                        updated_fields.append(key)

                user.save()
                therapist.save()

            elif role == 'Patient':
                patient = Patient.objects.get(userId=user.id)

                if data.get('reha_end_date'):
                    try:
                        data['reha_end_date'] = datetime.strptime(data.get('reha_end_date').split("T")[0], "%Y-%m-%d")
                    except ValueError:
                        return JsonResponse({'error': 'Invalid date format for reha_end_date'}, status=400)

                for model, allowed_fields in [(user, User._fields), (patient, Patient._fields)]:
                    for key in allowed_fields:
                        if key in data:
                            setattr(model, key, sanitize_text(data[key]))
                            updated_fields.append(key)

                user.save()
                patient.save()

            Logs.objects.create(userId=user, action='UPDATE_PROFILE', userAgent=role)

            return JsonResponse({"message": "Profile updated", "updated": updated_fields}, status=200)

        except Exception as e:
            logger.exception("Error updating profile for user %s", user_id)
            return JsonResponse({"error": str(e)}, status=500)

    elif request.method == 'DELETE':
        try:
            user.is_active = False
            user.save()

            Logs.objects.create(
                userId=user,
                action='DELETE_ACCOUNT',
                userAgent=role,
                details=f"Soft-deleted account for {user.username}"
            )

            return JsonResponse({"message": "User deleted successfully."}, status=200)

        except Exception as e:
            logger.exception("Error deleting user %s", user_id)
            return JsonResponse({"error": str(e)}, status=500)

    else:
        return JsonResponse({'error': 'Method not allowed'}, status=405)



    if request.method == 'PUT':
        

        try:
            data = json.loads(request.body)
            user = User.objects.get(username=user_id)
            patient = Patient.objects.get(userId=user)

            # Handle date correctly
            if 'reha_end_date' in data and data['reha_end_date']:
                data['reha_end_date'] = datetime.strptime(data.get('reha_end_date').split("T")[0], "%Y-%m-%d")

            # Dynamically get model fields
            user_fields = [field.name for field in User._fields.values() if field.name not in ["id", "pwdhash", "createdAt", "updatedAt"]]
            patient_fields = [field.name for field in Patient._fields.values() if field.name not in ["id", "pwdhash", "access_word", "therapist", "userId"]]

            # Update User model fields
            for key in user_fields:
                if key in data and data[key]:
                    setattr(user, key, sanitize_text(data[key]))
            user.save()

            # Update Patient model fields
            for key in patient_fields:
                if key in data and data[key]:
                    setattr(patient, key, sanitize_text(data[key]))
            patient.save()

            # Log the update action
            log = Logs(
                userId=user,
                action='UPDATE_PROFILE',
                userAgent=user.role
            )
            log.save()

            # Fields to return dynamically
            response_data = {field: getattr(user, field, None) if field in user_fields else getattr(patient, field, None) for field in (user_fields + patient_fields)}
            
            
            return JsonResponse(response_data, status=200)

        except User.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)
        except Patient.DoesNotExist:
            return JsonResponse({"error": "Patient data not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    elif request.method == 'DELETE':
        try:
            user = User.objects.get(pk=ObjectId(user_id))
            patient = Patient.objects.get(username=user)
            log = Logs(
                        userId = user,
                        action = 'DELETE_ACCOUNT',
                        userAgent = "Patient",
                        details = f"{str(user)} {str(patient)}"
                    )
            log.save()
            # user.delete() 
            # Instead of deleting the user:
            user.is_active = False
            user.save()
            return JsonResponse({"message": "User deleted successfully."}, status=200)
        except Patient.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    else:
        return JsonResponse({'error': 'Method not allowed'}, status=405)