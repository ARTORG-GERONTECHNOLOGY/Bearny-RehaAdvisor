import json
import os

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Recommendation, PatientInterventions, PatientType, RecommendationAssignment
from core.models import Therapist, Patient
from utils.config import config

FILE_TYPE_FOLDERS = {
    'mp4': 'videos',
    'mp3': 'audio',
    'jpg': 'images',
    'png': 'images',
    'pdf': 'documents'
}


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_recommendations(request):
    try:
        recommendations = Recommendation.objects.all()
        recommendations_list = [
            {
                "_id": str(rec.id),
                "title": rec.title,
                "description": rec.description,
                "content_type": rec.content_type,
                "patient_types": [
                    {
                        "type": pt.type,
                        "frequency": pt.frequency,
                        "include_option": pt.include_option,
                        "diagnosis": pt.diagnosis
                    } for pt in rec.patient_types
                ],
                "link": rec.link or '',
                "media_url": f"{settings.MEDIA_HOST}{os.path.join(settings.MEDIA_URL, rec.media_file)}" if rec.media_file else ''

            }
            for rec in recommendations
        ]
        return JsonResponse(recommendations_list, safe=False)
    except Exception as e:
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def create_intervention(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request method'}, status=400)

    try:
        # Parse form data or JSON body
        data = request.POST.dict()

        # Parse patientTypes JSON field if present
        if 'patientTypes' in data:
            data['patientTypes'] = json.loads(data['patientTypes'])

        # Check if a recommendation with the same title already exists
        if Recommendation.objects(title=data['title']).first():
            return JsonResponse({'success': False, 'error': 'A recommendation with this title already exists.'},
                                status=400)

        # Create PatientType embedded documents
        patient_types = [
            PatientType(type=pt['type'], frequency=pt['frequency'], include_option=pt['includeOption'], diagnosis=pt['diagnosis'])
            for pt in data.get('patientTypes', [])
        ]

        # Handle media file upload
        media_file_path = ""
        if 'media_file' in request.FILES:
            media_file = request.FILES['media_file']
            file_extension = media_file.name.split('.')[-1].lower()

            # Choose the folder based on file extension
            folder = FILE_TYPE_FOLDERS.get(file_extension, 'others')
            file_path = os.path.join(folder, f"{timezone.now().strftime('%Y%m%d%H%M%S')}_{media_file.name}")

            # Save the file to media directory
            media_file_path = default_storage.save(file_path, media_file)

        # Create the new Recommendation document
        recommendation = Recommendation(
            title=data['title'],
            description=data['description'],
            content_type=data['contentType'],
            link=data.get('link', ''),  # Use `link` instead of `blogLink`
            media_file=media_file_path,  # Path to uploaded media if any
            patient_types=patient_types
        )
        recommendation.save()

        return JsonResponse({'success': True, 'message': 'Recommendation added successfully!'})

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

    return JsonResponse({'error': 'Invalid request method'}, status=400)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_recommendation_info(request, intervention_id):
    if request.method != 'GET':
        return JsonResponse({'error': 'Invalid request method'}, status=400)

    try:
        recommendation = Recommendation.objects.get(pk=intervention_id)
        feedbacks = [
            {
                'date': fb.date,
                'comment': fb.comment,
                'rating': fb.rating,
            }
            for patient_intervention in PatientInterventions.objects.filter(intervention_id=intervention_id)
            for fb in patient_intervention.feedback
        ]

        recommendation_data = {
            'title': recommendation.title,
            'description': recommendation.description,
            'content_type': recommendation.content_type,
            'patient_types': [pt.to_mongo() for pt in recommendation.patient_types],
            'link': recommendation.link,
            'media_file': recommendation.media_file,
        }

        return JsonResponse({'recommendation': recommendation_data, 'feedback': feedbacks}, status=200)
    except Recommendation.DoesNotExist:
        return JsonResponse({'error': 'Recommendation not found.'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_recommended_diagnoses_for_intervention(request, intervention, specialisation, therapist_id):
    if request.method == 'GET':
        try:
            # Retrieve the therapist
            therapist = Therapist.objects.get(username=therapist_id)

            # Fetch all diagnoses for the given specialization
            all_diagnoses = config["patientInfo"]["function"][specialisation]["diagnosis"]

            # Initialize the response structure
            diagnosis_status = {diagnosis: False for diagnosis in all_diagnoses}
            all_flag = False

            # Check if the therapist has default recommendations for the provided intervention
            default_rec = next(
                (rec for rec in therapist.default_recommendations if rec.recommendation == intervention),
                None
            )

            if default_rec:
                # Mark diagnoses as true if they're part of the default recommendation
                for diagnosis, assigned in default_rec.diagnosis_assignments.items():
                    if diagnosis == "all":
                        all_flag = assigned
                    elif diagnosis in diagnosis_status:
                        diagnosis_status[diagnosis] = assigned

            return JsonResponse({"diagnoses": diagnosis_status, "all": all_flag}, status=200)

        except Therapist.DoesNotExist:
            return JsonResponse({"error": "Therapist not found"}, status=404)
        except Recommendation.DoesNotExist:
            return JsonResponse({"error": "Recommendation not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    return JsonResponse({"error": "Invalid request method"}, status=400)


@csrf_exempt
@permission_classes([IsAuthenticated])
def assign_intervention_to_patient_types(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            diagnosis = data.get('diagnosis')
            intervention_id = data.get('intervention_id')
            therapist_id = data.get('therapist')

            if not diagnosis or not intervention_id or not therapist_id:
                return JsonResponse({'error': 'Missing diagnosis, intervention_id, or therapist'}, status=400)

            intervention = Recommendation.objects.get(pk=intervention_id)
            therapist = Therapist.objects.get(username=therapist_id)

            if diagnosis == "all":
                patients = Patient.objects.filter(therapist=therapist)
            else:
                patients = Patient.objects.filter(therapist=therapist, diagnosis__contains=diagnosis)

            for patient in patients:
                PatientInterventions.get_or_create(patient, intervention)

            # Update therapist's default recommendations
            for rec in therapist.default_recommendations:
                if rec.recommendation == intervention_id:
                    rec.diagnosis_assignments[diagnosis] = True
                    break
            else:
                therapist.default_recommendations.append(RecommendationAssignment(
                    recommendation=intervention_id,
                    diagnosis_assignments={diagnosis: True}
                ))
            therapist.save()

            return JsonResponse({'success': f'Intervention assigned to {patients.count()} patients'}, status=201)

        except Recommendation.DoesNotExist:
            return JsonResponse({'error': 'Intervention not found'}, status=404)
        except Therapist.DoesNotExist:
            return JsonResponse({'error': 'Therapist not found'}, status=404)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'error': 'Invalid request method'}, status=405)


@csrf_exempt
@permission_classes([IsAuthenticated])
def delete_intervention_from_patient_types(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            diagnosis = data.get('diagnosis')
            intervention_id = data.get('intervention_id')
            therapist_id = data.get('therapist')

            if not diagnosis or not intervention_id or not therapist_id:
                return JsonResponse({'error': 'Missing diagnosis, intervention_id, or therapist'}, status=400)

            intervention = Recommendation.objects.get(pk=intervention_id)
            therapist = Therapist.objects.get(username=therapist_id)

            if diagnosis == "all":
                patients = Patient.objects.filter(therapist=therapist)
            else:
                patients = Patient.objects.filter(therapist=therapist, diagnosis__contains=diagnosis)

            for patient in patients:
                PatientInterventions.un_recommend(patient, intervention)

            # Update therapist's default recommendations
            for rec in therapist.default_recommendations:
                if rec.recommendation == intervention_id and diagnosis in rec.diagnosis_assignments:
                    del rec.diagnosis_assignments[diagnosis]
            therapist.save()

            return JsonResponse({'success': f'Intervention removed from {patients.count()} patients'}, status=201)

        except Recommendation.DoesNotExist:
            return JsonResponse({'error': 'Intervention not found'}, status=404)
        except Therapist.DoesNotExist:
            return JsonResponse({'error': 'Therapist not found'}, status=404)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'error': 'Invalid request method'}, status=405)

#TODO
@csrf_exempt
def update_daily_recomendations(request):
    if request.method == "GET":
        try:
            patients = Patient.objects.get()
            for patient in patients:
                _ = PatientInterventions.get_patient_interventions_with_feedback_and_future_dates(patient)

            return JsonResponse({'success': 'Done.'}, status=200)
        except Exception as e:
            return JsonResponse({'error': 'Failed.'}, status=400)