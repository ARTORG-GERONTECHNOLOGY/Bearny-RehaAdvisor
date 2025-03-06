import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from datetime import datetime
from core.models import Therapist, Patient
from utils.utils import (
    convert_to_serializable
)


@csrf_exempt
@permission_classes([IsAuthenticated])
def user_profile(request, user_id):

    # Fields to return in the response
    allowed_fields = [
        "username", "name", "first_name", "email", "phone",
        "specializations", "clinics", "accepted"
    ] 
    if request.method == 'GET':
        try:
            user = Therapist.objects.get(username=user_id)
            
            user_data = {field: getattr(user, field, None) for field in allowed_fields}
            return JsonResponse(user_data, safe=False)
        except Therapist.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            user = Therapist.objects.get(username=user_id)

            # Handle password update logic
            new_password = data.get("newPassword")
            old_password = data.get("oldPassword")
            
            if new_password:
                if not old_password:
                    return JsonResponse({"error": "Old password is required to change the password."}, status=400)
                
                # Hash the provided old password and compare with stored hash
                old_password_hash = hashlib.pbkdf2_hmac('sha256', old_password.encode(), b'salt', 870000)
                stored_password_hash = user.pwdhash.split('$')[-1]  # Extract actual hash part
                
                if old_password_hash.hex() != stored_password_hash:
                    return JsonResponse({"error": "Old password is incorrect."}, status=400)
                
                # Hash the new password and update
                new_password_hash = hashlib.pbkdf2_hmac('sha256', new_password.encode(), b'salt', 870000)
                user.pwdhash = f'pbkdf2_sha256$870000$salt${new_password_hash.hex()}'

            # Update other fields except `created_at`
            for key, value in data.items():
                if key not in ["created_at", "oldPassword", "newPassword", "default_recommendations"] and value:
                    setattr(user, key, value)

            user.save()
            user_data = {field: getattr(user, field, None) for field in allowed_fields}
            return JsonResponse(user_data, status=200)
        except Therapist.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    elif request.method == 'DELETE':
        try:
            user = Therapist.objects.get(username=user_id)
            user.delete()
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
            user = Patient.objects.get(username=user_id)

            # Handle date correctly
            if 'reha_end_date' in data and data['reha_end_date']:
                data['reha_end_date'] = datetime.strptime(data.get('reha_end_date').split("T")[0], "%Y-%m-%d")

            # Update other fields except `created_at`
            for key, value in data.items():
                if key not in ["created_at", "pwdhash", "access_word", "therapist"] and value:
                    setattr(user, key, value)

            user.save()
            allowed_fields = ["username", "name", "email", "phone", "reha_end_date"]
            user_data = {field: getattr(user, field, None) for field in allowed_fields}
            return JsonResponse(user_data, status=200)

        except Patient.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    elif request.method == 'DELETE':
        try:
            user = Patient.objects.get(username=user_id)
            user.delete()
            return JsonResponse({"message": "User deleted successfully."}, status=200)
        except Patient.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    else:
        return JsonResponse({'error': 'Method not allowed'}, status=405)