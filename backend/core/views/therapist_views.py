from django.http import JsonResponse
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from bson import ObjectId
from core.models import Therapist, Patient, User

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
        therapist = Therapist.objects.get(userId=ObjectId(therapist_id))
        patients = Patient.objects.filter(therapist=therapist)
        patients_data = [
            {
                "_id": str(patient.pk),
                "therapist": str(patient.therapist.name),
                "created_at": patient.userId.createdAt.isoformat(),  # Directly access the User object
                "username": patient.userId.username,  # Directly access the User object
                "age": patient.age,
                "sex": patient.sex,
                "first_name": patient.first_name,
                "name": patient.name,
                "diagnosis": patient.diagnosis,
                "duration": patient.duration

            } for patient in patients
        ]
        return JsonResponse(patients_data, safe=False, status=200)
    except Therapist.DoesNotExist:
        return JsonResponse({"error": "Therapist not found"}, status=404)
    except Exception as e:
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)

@csrf_exempt
@permission_classes([IsAuthenticated])
def get_rehabilitation_plan(request, patient_id):
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        plans = RehabilitationPlan.objects.filter(patientId=ObjectId(patient_id)).order_by('-createdAt')
        plan_list = []

        for plan in plans:
            plan_data = {
                'planName': plan.planName,
                'startDate': plan.startDate.isoformat(),
                'endDate': plan.endDate.isoformat(),
                'status': plan.status,
                'interventions': []
            }

            for interv in plan.interventions:
                intervention_obj = interv.interventionId
                intervention_name = getattr(intervention_obj, 'title', 'Unnamed Intervention')

                completed_dates = set(
                    log.date.date() for log in PatientInterventionLogs.objects(
                        userId=plan.patientId,
                        interventionId=intervention_obj,
                        status__icontains="completed"
                    )
                )

                logs_with_feedback = PatientInterventionLogs.objects(
                    userId=plan.patientId,
                    interventionId=intervention_obj
                )

                today = timezone.now().date()
                intervention_dates = []
                for date in interv.dates:
                    day = date.date()
                    if day in completed_dates:
                        status = "completed"
                    elif day < today:
                        status = "missed"
                    elif day == today:
                        status = "today"
                    else:
                        status = "upcoming"

                    feedback_entry = next(({
                        'feedback': log.feedback,
                        'comments': log.comments
                    } for log in logs_with_feedback if log.date.date() == day), None)

                    intervention_dates.append({
                        'datetime': date.isoformat(),
                        'status': status,
                        'feedback': feedback_entry
                    })

                plan_data['interventions'].append({
                    'interventionId': str(interv.interventionId.id),
                    'interventionTitle': intervention_name,
                    'frequency': interv.frequency,
                    'notes': interv.notes,
                    'dates': intervention_dates
                })

            plan_data['createdAt'] = plan.createdAt.isoformat()
            plan_data['updatedAt'] = plan.updatedAt.isoformat()

            plan_list.append(plan_data)

        return JsonResponse({'plans': plan_list}, safe=False)

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
