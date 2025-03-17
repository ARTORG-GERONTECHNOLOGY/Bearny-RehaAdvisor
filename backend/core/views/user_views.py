import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from datetime import datetime
from core.models import Therapist, Patient, Logs, User
from bson import ObjectId
from utils.utils import (
    convert_to_serializable
)
from django.contrib.auth.hashers import check_password, make_password

@csrf_exempt
@permission_classes([IsAuthenticated])
def user_profile(request, user_id):

    # Fields to return in the response
    allowed_fields_user = ["username", "email", "phone"]
    allowed_fields_therapist = ["specializations", "clinics", "name", "first_name"]

    if request.method == 'GET':
        try:
            user = User.objects.get(pk=ObjectId(user_id))
            therapist = Therapist.objects.get(userId=ObjectId(user_id))

            # Extract data separately and combine
            user_data = {field: getattr(user, field, None) for field in allowed_fields_user}
            therapist_data = {field: getattr(therapist, field, None) for field in allowed_fields_therapist}

            # Merge both dictionaries
            combined_data = {**user_data, **therapist_data}

            return JsonResponse(combined_data, safe=False)

        except User.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)
        except Therapist.DoesNotExist:
            return JsonResponse({"error": "Therapist data not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    elif request.method == 'PUT':
        allowed_fields = ["username", "name", "email", "phone", "specializations", "clinics"]
        try:
            data = json.loads(request.body)
            user = User.objects.get(pk=ObjectId(user_id))
            therapist = Therapist.objects.get(userId=ObjectId(user_id))

            # Handle password update logic
            new_password = data.get("newPassword")
            old_password = data.get("oldPassword")
            
            if new_password:
                if not old_password:
                    return JsonResponse({"error": "Old password is required to change the password."}, status=400)
                if check_password(old_password, user['pwdhash']):
                    make_password(new_password)

            # Update other fields except
            for key, value in data.items():
                if key not in ["created_at", "oldPassword", "newPassword", "default_recommendations"] and value:
                    setattr(user, key, value)
                    setattr(therapist, key, value)

            user.save()
             # Combine user and patient data dynamically
            user_data = {}
            therapist_data = {}

            for field in allowed_fields:
                try:
                    user_data[field] = getattr(user, field)
                except AttributeError:
                    pass  # Ignore missing fields

            for field in allowed_fields:
                try:
                    therapist_data[field] = getattr(therapist, field)
                except AttributeError:
                    pass  # Ignore missing fields

            combined_data = {**user_data, **therapist_data}
            log = Logs(
                        userId = user,
                        action = 'UPDATE_PROFILE',
                        userAgent = user.role
                    )
            log.save()
            return JsonResponse(combined_data, status=200)
        except Therapist.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    elif request.method == 'DELETE':
        try:
            user = User.objects.get(pk=ObjectId(user_id))
            therapist = Therapist.objects.get(userId=ObjectId(user_id))
            log = Logs(
                        userId = user,
                        action = 'DELETE_ACCOUNT',
                        userAgent = "Patient",
                        details = f"{str(user)} {str(patient)}"
                    )
            log.save()
            #user.delete()
            user.is_active = False
            user.save()
            return JsonResponse({"message": "User deleted successfully."}, status=200)
        except Therapist.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    else:
        return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
@permission_classes([IsAuthenticated])
def user_profile_patient(request, user_id):

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
                    setattr(user, key, data[key])
            user.save()

            # Update Patient model fields
            for key in patient_fields:
                if key in data and data[key]:
                    setattr(patient, key, data[key])
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