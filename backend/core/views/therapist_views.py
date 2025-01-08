from django.http import JsonResponse
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Therapist, Patient

FILE_TYPE_FOLDERS = {
    'mp4': 'videos',
    'mp3': 'audio',
    'jpg': 'images',
    'png': 'images',
    'pdf': 'documents'
}


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patients_by_therapist(request, therapist_id):
    try:
        therapist = Therapist.objects.get(username=therapist_id)
        patients = Patient.objects.filter(therapist=therapist)
        patients_data = [
            {
                "_id": str(patient.pk),
                "therapist": str(patient.therapist.name),
                "created_at": patient.created_at.isoformat(),
                "age": patient.age,
                "sex": patient.sex,
                "first_name": patient.first_name,
                "name": patient.name,
                "diagnosis": patient.diagnosis,
                "username": patient.username,
                "duration": patient.duration

            } for patient in patients
        ]
        return JsonResponse(patients_data, safe=False, status=200)
    except Therapist.DoesNotExist:
        return JsonResponse({"error": "Therapist not found"}, status=404)
    except Exception as e:
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)
