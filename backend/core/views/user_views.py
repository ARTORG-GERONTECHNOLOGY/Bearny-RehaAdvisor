import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Therapist
from utils.utils import (
    convert_to_serializable
)


@csrf_exempt
@permission_classes([IsAuthenticated])
def user_profile(request, user_id):
    if request.method == 'GET':
        try:
            user = Therapist.objects.get(username=user_id)
            return JsonResponse(convert_to_serializable(user.to_mongo()), safe=False)
        except Therapist.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            user = Therapist.objects.get(username=user_id)

            for key, value in data.items():
                if key != "created_at":
                    setattr(user, key, value)
            user.save()
            return JsonResponse(convert_to_serializable(user.to_mongo()), safe=False, status=200)
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
