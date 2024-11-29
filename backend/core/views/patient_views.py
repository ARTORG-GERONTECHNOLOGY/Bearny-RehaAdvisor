import json

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from mongoengine.queryset.visitor import Q
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Patient
from core.models import Recommendation, PatientInterventions, Feedback
from utils.utils import (
    convert_to_serializable,
    serialize_datetime
)

FILE_TYPE_FOLDERS = {
    'mp4': 'videos',
    'mp3': 'audio',
    'jpg': 'images',
    'png': 'images',
    'pdf': 'documents'
}


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient(request, patient_id):
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        patient = Patient.objects.get(username=patient_id)
        return JsonResponse(convert_to_serializable(patient.to_mongo()), safe=False)
    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Exception as e:
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def patient_post_feedback(request, patient_id, intervention_id):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        comment = data.get('comment', '')
        rating = data.get('rating', '')

        if not comment and not rating:
            return JsonResponse({'error': 'At least one of comment or rating is required.'}, status=400)

        patient_intervention = PatientInterventions.objects.get(patient_id=patient_id, intervention_id=intervention_id)
        recommendation = Recommendation.objects.get(id=intervention_id)

        today = timezone.now().date()
        feedback = next(
            (fb for fb in patient_intervention.feedback if
             fb.intervention_id == recommendation and fb.date.date() == today),
            None
        )

        if feedback:
            if comment:
                feedback.comment = comment
            if rating:
                feedback.rating = str(rating)
        else:
            patient_intervention.feedback.append(
                Feedback(intervention_id=recommendation, comment=comment, rating=str(rating))
            )

        patient_intervention.save()
        return JsonResponse({'message': 'Feedback submitted successfully'}, status=201)
    except PatientInterventions.DoesNotExist:
        return JsonResponse({'error': 'Intervention not found for the patient.'}, status=404)
    except Recommendation.DoesNotExist:
        return JsonResponse({'error': 'Recommendation not found.'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def add_intervention_to_patient(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        patient_id = data.get('patient_id')
        intervention_id = data.get('intervention_id')

        if not patient_id or not intervention_id:
            return JsonResponse({'error': 'Missing patient_id or intervention_id'}, status=400)

        patient = Patient.objects.get(username=patient_id)
        intervention = Recommendation.objects.get(pk=intervention_id)

        patient_intervention, created = PatientInterventions.get_or_create(patient, intervention)
        if created:
            return JsonResponse({'message': 'Intervention added successfully'}, status=201)
        else:
            return JsonResponse({'error': 'Intervention already assigned'}, status=400)
    except Patient.DoesNotExist:
        return JsonResponse({'error': 'Patient not found'}, status=404)
    except Recommendation.DoesNotExist:
        return JsonResponse({'error': 'Intervention not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def mark_intervention_done_by_patient(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        patient_id = data.get('patient_id')
        intervention_id = data.get('intervention_id')
        feedback = data.get('feedback', None)

        intervention = PatientInterventions.objects.get(patient_id=patient_id, intervention_id=intervention_id)
        date = timezone.now()

        intervention.mark_done(date=date, feedback=feedback)
        intervention.not_completed_dates = [d for d in intervention.not_completed_dates if d.date() != date.date()]
        intervention.save()

        return JsonResponse({'message': 'Marked as done successfully'}, status=200)
    except PatientInterventions.DoesNotExist:
        return JsonResponse({'error': 'Intervention not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_rehab_data(request, patient_id):
    if request.method != 'GET':
        return JsonResponse({'error': 'Invalid request method'}, status=405)

    try:
        patient = Patient.objects.get(username=patient_id)
        reha_data = PatientInterventions.get_patient_interventions_with_feedback_and_future_dates(patient)
        return JsonResponse({
            'reha_data': reha_data,
            'patient_name': f'{patient.first_name} {patient.name}',
            'function': patient.function
        }, safe=False, json_dumps_params={'default': serialize_datetime}, status=200)
    except Patient.DoesNotExist:
        return JsonResponse({'error': 'Patient not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_recommendation_options_for_patient(request, patient_id):
    if request.method == 'GET':
        # Retrieve the patient using the provided patient_id
        try:
            patient = Patient.objects.get(username=patient_id)
        except Patient.DoesNotExist:
            return JsonResponse({'error': 'Patient not found'}, status=404)

        # Patient's diagnosis list
        patient_diagnoses = patient.diagnosis

        # Fetch recommendations where diagnosis matches patient diagnosis, patient.function===rec.specialisation or includes 'All'
        recommendations = Recommendation.objects.filter(Q(patient_types__type__in=patient.function) |
                                                        (Q(patient_types__diagnosis__in=patient.diagnosis) | Q(
                                                            patient_types__diagnosis__in="All")))

        # Prepare the response data
        recommendation_list = [
            {
                'title': rec.title,
                '_id': str(rec.id),
                'description': rec.description,
                'content_type': rec.content_type,
                'link': rec.link,
                'media_file': rec.media_file,
                'patient_types': [
                    {
                        'type': pt.type,
                        'diagnosis': pt.diagnosis,
                        'frequency': pt.frequency,
                        'include_option': pt.include_option,
                    } for pt in rec.patient_types
                ]
            }
            for rec in recommendations
        ]

        return JsonResponse({'recommendations': recommendation_list}, status=200, safe=False)
    else:
        return JsonResponse({'error': 'Invalid request method'}, status=405)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_recommendations(request, patient_id):
    if request.method != 'GET':
        return JsonResponse({'error': 'Invalid request method'}, status=400)

    try:
        recommendations = PatientRecommendation.get_todays_recommendations(patient_id)
        return JsonResponse({'recommendations': recommendations}, safe=False, status=200)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt  # For simplicity; handle CSRF properly in production
@permission_classes([IsAuthenticated])
def get_patient_reha_today(request, patient_id):
    if request.method == 'GET':
        try:
            # Fetch user info using the User model
            patient = Patient.objects.get(pk=patient_id)
            today_rec = PatientInterventions.get_today_recommendations(patient)
            # Convert to a serializable dictionary
            return JsonResponse(today_rec, safe=False)

        except Exception as e:
            return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)
