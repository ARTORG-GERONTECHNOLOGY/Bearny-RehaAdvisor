from bson import ObjectId
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
import json
from core.models import Patient, Therapist, User, Logs
from django.utils.dateparse import parse_datetime


FILE_TYPE_FOLDERS = {
    "mp4": "videos",
    "mp3": "audio",
    "jpg": "images",
    "png": "images",
    "pdf": "documents",
}


import logging

from django.utils import timezone

from core.models import PatientInterventionLogs, RehabilitationPlan

logger = logging.getLogger(__name__)


@csrf_exempt
@permission_classes([IsAuthenticated])
def list_therapist_patients(request, therapist_id):
    """
    Returns a list of patients for a given therapist ID.
    """
    try:
        therapist = Therapist.objects.get(userId=ObjectId(therapist_id))
        patients = Patient.objects.filter(therapist=therapist)

        patient_list = []
        for patient in patients:
            patient_list.append(
                {
                    "_id": str(patient.pk),
                    "therapist": str(patient.therapist.name),
                    "created_at": patient.userId.createdAt.isoformat(),
                    "username": patient.userId.username,
                    "age": patient.age,
                    "sex": patient.sex,
                    "first_name": patient.first_name,
                    "name": patient.name,
                    "diagnosis": patient.diagnosis,
                    "duration": patient.duration,
                }
            )

        return JsonResponse(patient_list, safe=False, status=200)

    except Therapist.DoesNotExist:
        logger.warning(f"Therapist with ID {therapist_id} not found.")
        return JsonResponse({"error": "Therapist not found"}, status=404)

    except Exception as e:
        logger.error(f"Error in list_therapist_patients: {e}")
        return JsonResponse(
            {"error": "Internal Server Error", "details": str(e)}, status=500
        )


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_rehabilitation_plan(request, patient_id):
    """
    Returns the full rehabilitation plan history for a given patient.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        plans = RehabilitationPlan.objects.filter(
            patientId=ObjectId(patient_id)
        ).order_by("-createdAt")
        plan_list = []

        for plan in plans:
            plan_info = {
                "startDate": plan.startDate.isoformat(),
                "endDate": plan.endDate.isoformat(),
                "status": plan.status,
                "interventions": [],
                "createdAt": plan.createdAt.isoformat(),
                "updatedAt": plan.updatedAt.isoformat(),
            }

            today = timezone.now().date()

            for assignment in plan.interventions:
                intervention = assignment.interventionId
                intervention_title = getattr(
                    intervention, "title", "Unnamed Intervention"
                )
                logs = PatientInterventionLogs.objects(
                    userId=plan.patientId, interventionId=intervention
                )

                completed_dates = {
                    log.date.date() for log in logs if "completed" in log.status
                }
                logs_with_feedback = [log for log in logs if log.feedback]

                dates_info = []
                for scheduled_date in assignment.dates:
                    date_only = scheduled_date.date()

                    if date_only in completed_dates:
                        status = "completed"
                    elif date_only < today:
                        status = "missed"
                    elif date_only == today:
                        status = "today"
                    else:
                        status = "upcoming"

                    feedback_log = next(
                        (
                            log
                            for log in logs_with_feedback
                            if log.date.date() == date_only
                        ),
                        None,
                    )
                    feedback_data = {
                        "feedback": (
                            [fb.to_mongo() for fb in feedback_log.feedback]
                            if feedback_log
                            else []
                        ),
                        "comments": feedback_log.comments if feedback_log else "",
                    }

                    dates_info.append(
                        {
                            "datetime": scheduled_date.isoformat(),
                            "status": status,
                            "feedback": feedback_data if feedback_log else [],
                        }
                    )

                plan_info["interventions"].append(
                    {
                        "interventionId": str(intervention.id),
                        "interventionTitle": intervention_title,
                        "frequency": assignment.frequency,
                        "notes": assignment.notes,
                        "dates": dates_info,
                    }
                )

            plan_list.append(plan_info)

        return JsonResponse({"plans": plan_list}, safe=False)

    except Exception as e:
        logger.error(f"Error in get_rehabilitation_plan: {e}")
        return JsonResponse(
            {"error": "Internal Server Error", "details": str(e)}, status=500
        )
@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patients_by_therapist(request, therapist_id):
    """
    GET /api/therapists/<therapist_id>/patients/
    Returns list of patients (first name, last name, id) assigned to a therapist.
    """
    try:
        patients = Patient.objects.filter(therapistId=ObjectId(therapist_id))
        data = [
            {
                "id": str(p.userId),
                "firstName": p.first_name,
                "lastName": p.name,
            }
            for p in patients
        ]
        return JsonResponse(data, safe=False, status=200)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
@permission_classes([IsAuthenticated])
def create_log(request):
    try:
        data = json.loads(request.body)
        user = data.get('user')
      
        # Parse datetime safely
        started = parse_datetime(data.get("started")) if data.get("started") else None
        ended = parse_datetime(data.get("ended")) if data.get("ended") else None
        patient = data.get("patient")  # Optional patient reference
        if patient:
            patient = Patient.objects.get(pk=ObjectId(patient))
        if user:
            user = User.objects.get(id=ObjectId(user))
        log = Logs(
            userId=user,
            action=data.get("action", "OTHER"),
            started=started,
            ended=ended,
            userAgent=data.get("userAgent", ""),
            patient=patient,
            details=data.get("details", "")[:500],
        )
        log.save()
        logger.info(f"[i13n] Log saved for user {user.id} with action {log.action}")
        return JsonResponse({"status": "ok", "log_id": str(log.id)}, status=201)

    except Exception as e:
        logger.error(f"[i13n] Failed to save log: {e}", exc_info=True)
        return JsonResponse({"error": "Failed to create log"}, status=500)
