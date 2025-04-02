import json
import os

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from bson import ObjectId
from core.models import Intervention, PatientInterventions, PatientType, InterventionAssignment, DefaultInterventions, DiagnosisAssignmentSettings
from core.models import Therapist, Patient
from utils.config import config
from utils.utils import (
    get_labels,
    generate_custom_id
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
def get_recommendations(request):
    try:
        recommendations = Intervention.objects.all()
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
                "media_file": f"{settings.MEDIA_HOST}{os.path.join(settings.MEDIA_URL, rec.media_file)}" if rec.media_file else '',
                "preview_img": f"{settings.MEDIA_HOST}{os.path.join(settings.MEDIA_URL, rec.preview_img)}" if rec.preview_img else '',
                "duration": rec.duration,
                "benefitFor": rec.benefitFor,
                "tags":rec.tags,

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
        if Intervention.objects(title=data['title']).first():
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

        img_file_path = ''
        if 'img_file' in request.FILES:
            img_file = request.FILES['img_file']
            file_extension = img_file.name.split('.')[-1].lower()

            # Choose the folder based on file extension
            folder = FILE_TYPE_FOLDERS.get(file_extension, 'others')
            file_path = os.path.join(folder, f"{timezone.now().strftime('%Y%m%d%H%M%S')}_{img_file.name}")

            # Save the file to media directory
            
            img_file_path = default_storage.save(file_path, img_file)

        # Create the new Intervention document
        recommendation = Intervention(
            title=data['title'],
            description=data['description'],
            content_type=data['contentType'],
            link=data.get('link', ''),  # Use `link` instead of `blogLink`
            media_file=media_file_path,  # Path to uploaded media if any
            preview_img=img_file_path,
            patient_types=patient_types,
            duration=data['duration'],
            benefitFor=data['benefitFor'].split(','),
            tags=data['tagList'].split(','),
        )
        recommendation.save()

        return JsonResponse({'success': True, 'message': 'Intervention added successfully!'})

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

    return JsonResponse({'error': 'Invalid request method'}, status=400)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_recommendation_info(request, intervention_id):
    if request.method != 'GET':
        return JsonResponse({'error': 'Invalid request method'}, status=400)

    try:
        recommendation = Intervention.objects.get(pk=intervention_id)
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
    except Intervention.DoesNotExist:
        return JsonResponse({'error': 'Intervention not found.'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_recommended_diagnoses_for_intervention(request, intervention, specialisation, therapist_id):
    if request.method == 'GET':
        try:
            # Convert IDs to ObjectId
            therapist = Therapist.objects.get(userId=ObjectId(therapist_id))
            intervention_id = ObjectId(intervention)

            # Parse all diagnoses from specialisations
            specialisations = [s.strip() for s in specialisation.split(',')]
            all_diagnoses = []
            for spec in specialisations:
                diagnoses = config["patientInfo"]["function"].get(spec, {}).get("diagnosis", [])
                all_diagnoses.extend(diagnoses)

            # Prepare response structure
            diagnosis_status = {diagnosis: False for diagnosis in all_diagnoses}
            all_flag = False

            # Find the default recommendation matching this intervention
            default_rec = next(
                (rec for rec in therapist.default_recommendations if rec.recommendation.id == intervention_id),
                None
            )

            if default_rec:
                for diagnosis, settings in default_rec.diagnosis_assignments.items():
                    if diagnosis == "all":
                        all_flag = settings.active
                    elif diagnosis in diagnosis_status:
                        diagnosis_status[diagnosis] = settings.active


            return JsonResponse({"diagnoses": diagnosis_status, "all": all_flag}, status=200)

        except Therapist.DoesNotExist:
            return JsonResponse({"error": "Therapist not found"}, status=404)
        except Intervention.DoesNotExist:
            return JsonResponse({"error": "Intervention not found"}, status=404)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    return JsonResponse({"error": "Invalid request method"}, status=400)


@csrf_exempt
@permission_classes([IsAuthenticated])
def assign_intervention_to_patient_types(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            therapist = Therapist.objects.get(userId=ObjectId(data.get("therapistId")))
            interventions_data = data.get("interventions", [])

            if not interventions_data:
                return JsonResponse({'error': 'No intervention data provided'}, status=400)

            intervention_data = interventions_data[0]
            intervention = Intervention.objects.get(id=ObjectId(intervention_data.get("interventionId")))
            diagnosis = data.get('patientId')

            # Prepare settings for this diagnosis
            diagnosis_settings = {
                'active': True,
                'interval': intervention_data.get('interval'),
                'unit': intervention_data.get('unit'),
                'selected_days': intervention_data.get('selectedDays'),
                'end_type': intervention_data.get('end', {}).get('type'),
                'count_limit': intervention_data.get('end', {}).get('count'),
            }
            print(diagnosis_settings)
            print(intervention)

            # Check if this intervention already exists in the therapist's defaults
            for rec in therapist.default_recommendations:
                print(rec.recommendation)
                if rec.recommendation == intervention:
                    print(rec.diagnosis_assignments)
                    # FIX
                    rec.diagnosis_assignments[diagnosis] = DiagnosisAssignmentSettings(**diagnosis_settings)
                    break
                else:
                    print('hi')
                    # Add new intervention with settings for this diagnosis
                    therapist.default_recommendations.append(DefaultInterventions(
                        recommendation=intervention,
                        diagnosis_assignments={
                            diagnosis: DiagnosisAssignmentSettings(**diagnosis_settings)
                        }
                    ))

            therapist.save()
            return JsonResponse({'success': 'Default Intervention created'}, status=201)

        except Intervention.DoesNotExist:
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
            intervention_id = data.get("intervention_id")
            diagnosis = data.get('diagnosis')

            therapist = Therapist.objects.get(userId=ObjectId(data.get("therapist")))
            intervention = Intervention.objects.get(id=ObjectId(intervention_id))

            # Update therapist's default recommendations
            for rec in therapist.default_recommendations:
                if rec.recommendation == intervention and diagnosis in rec.diagnosis_assignments:
                    del rec.diagnosis_assignments[diagnosis]
                    break  # Optional: stop once found

            therapist.save()

            return JsonResponse({'success': 'Intervention removed from default recommendations'}, status=201)

        except Intervention.DoesNotExist:
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
def post_add_new_patient_group(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request method'}, status=400)

    try:
        data = json.loads(request.body)

        intervention_id = data.get("interventionId")
        diagnosis = data.get("diagnosis")
        spec_type = data.get("speciality")
        frequency = data.get("frequency")

        if not all([intervention_id, diagnosis, spec_type, frequency]):
            return JsonResponse({'error': 'Missing required fields'}, status=400)

        intervention = Intervention.objects.get(pk=ObjectId(intervention_id))

        new_entry = PatientType(
            type= spec_type,
            diagnosis= diagnosis,
            frequency= frequency,
            include_option= True
        )

        # Initialize if necessary
        if not intervention.patient_types:
            intervention.patient_types = []

        # Prevent duplicates
        for pt in intervention.patient_types:
            if pt['diagnosis'] == diagnosis and pt['type'] == spec_type:
                return JsonResponse({'success': False, 'message': 'Diagnosis already exists for this specialization'}, status=400)
        intervention.patient_types.append(new_entry)
        intervention.save()

        return JsonResponse({'success': True, 'message': 'Diagnosis added successfully to intervention'})

    except Intervention.DoesNotExist:
        return JsonResponse({'error': 'Intervention not found'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

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