import json
import tempfile
from datetime import datetime
import speech_recognition as sr
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from mongoengine.queryset.visitor import Q
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from bson import ObjectId


from core.models import Intervention, PatientInterventions, Feedback, GeneralFeedback, User, Patient, Therapist, InterventionAssignment, RehabilitationPlan, PatientInterventionLogs
from utils.utils import (
    convert_to_serializable,
    serialize_datetime,
    generate_repeat_dates
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
        user = User.objects.get(username=patient_id)
        patient = Patient.objects.get(userId=user)
        # Combine all data from user and patient objects
        # Dynamically get model fields
        user_fields = [field.name for field in User._fields.values() if field.name not in ["id", "pwdhash", "createdAt", "updatedAt"]]
        patient_fields = [field.name for field in Patient._fields.values() if field.name not in ["id", "pwdhash", "access_word", "therapist", 'userId']]
        response_data = {field: getattr(user, field, None) if field in user_fields else getattr(patient, field, None) for field in (user_fields + patient_fields)}
        return JsonResponse(response_data, status=200)

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
        recommendation = Intervention.objects.get(id=intervention_id)

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
    except Intervention.DoesNotExist:
        return JsonResponse({'error': 'Intervention not found.'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@permission_classes([IsAuthenticated])
def patient_post_questionnaire_feedback(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        files = request.FILES
        user_id = data.get("userId")
        intervention_id = data.get("interventionId")

        responses = data.get("responses")
        processed_responses = []


        # TODO audio processing

        if not intervention_id =='':
            patient_intervention = PatientInterventions.objects.get(patient_id=user_id, intervention_id=intervention_id)
            recommendation = Intervention.objects.get(id=intervention_id)
 
            patient_intervention.feedback.append(
                Feedback(intervention_id=recommendation, comment=str(responses)) # TODO
            )
            patient_intervention.save()
        else:
            # patient = Patient.objects.get(pk=ObjectId(user_id)) TODO
            patient = Patient.objects.get(userId=ObjectId(patient_id))
            general_feedback = GeneralFeedback.objects.create(
                patient_id=patient, comment=responses
            )
            general_feedback.save()
        
        return JsonResponse({'message': 'Feedback submitted successfully'}, status=201)
    except PatientInterventions.DoesNotExist:
        return JsonResponse({'error': 'Intervention not found for the patient.'}, status=404)
    except Intervention.DoesNotExist:
        return JsonResponse({'error': 'Intervention not found.'}, status=404)
    except Patient.DoesNotExist:
        return JsonResponse({'error': 'Patient not found.'}, status=404)
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

        # patient = Patient.objects.get(username=patient_id) TODO
        patient = Patient.objects.get(userId=ObjectId(patient_id)) 
        intervention = Intervention.objects.get(pk=intervention_id)

        patient_intervention, created = PatientInterventions.get_or_create(patient, intervention)
        if created:
            return JsonResponse({'message': 'Intervention added successfully'}, status=201)
        else:
            return JsonResponse({'error': 'Intervention already assigned'}, status=400)
    except Patient.DoesNotExist:
        return JsonResponse({'error': 'Patient not found'}, status=404)
    except Intervention.DoesNotExist:
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

        intervention = PatientInterventions.objects.get(patient_id=patient_id, intervention_id=intervention_id)
        date = timezone.now()
        print("hii")
        intervention.mark_done()
        
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
        # patient = Patient.objects.get(username=patient_id) TODO
        patient = Patient.objects.get(userId=ObjectId(patient_id))
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
            # patient = Patient.objects.get(username=patient_id) TODO
            patient = Patient.objects.get(userId=ObjectId(patient_id))
        except Patient.DoesNotExist:
            return JsonResponse({'error': 'Patient not found'}, status=404)

        # Patient's diagnosis list
        patient_diagnoses = patient.diagnosis

        # Fetch recommendations where diagnosis matches patient diagnosis, patient.function===rec.specialisation or includes 'All'
        recommendations = Intervention.objects.filter(Q(patient_types__type__in=patient.function) |
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
        recommendations = PatientIntervention.get_todays_recommendations(patient_id)
        return JsonResponse({'recommendations': recommendations}, safe=False, status=200)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt  # For simplicity; handle CSRF properly in production
@permission_classes([IsAuthenticated])
def get_patient_reha_today(request, patient_id):
    if request.method == 'GET':
        try:
            # Fetch user info using the User model
            # patient = Patient.objects.get(pk=patient_id) TODO
            patient = Patient.objects.get(userId=ObjectId(patient_id))
            today_rec = PatientInterventions.get_today_recommendations(patient)
            # Convert to a serializable dictionary
            return JsonResponse(today_rec, safe=False)

        except Exception as e:
            return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def create_patient_intervention_log(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        patient = Patient.objects.get(id=ObjectId(data.get("patientId")))
        intervention = Intervention.objects.get(id=ObjectId(data.get("interventionId")))

        intervention_log = PatientInterventionLogs(
            userId=patient,
            rehabilitationPlanId=ObjectId(data.get("rehabilitationPlanId")),
            interventionId=intervention,
            date=timezone.now(),
            status=data.get("status", []),
            feedback=data.get("feedback", []),
            comments=data.get("comments", ""),
            createdAt=timezone.now(),
            updatedAt=timezone.now()
        )
        intervention_log.save()
        return JsonResponse({'message': 'Patient Intervention Log created successfully'}, status=201)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def create_patient_icf_rating(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        patient = Patient.objects.get(id=ObjectId(data.get("patientId")))

        icf_rating = PatientICFRating(
            patientId=patient,
            icfCode=data.get("icfCode"),
            date=timezone.now(),
            rating=int(data.get("rating")),
            notes=data.get("notes", "")
        )
        icf_rating.save()
        return JsonResponse({'message': 'ICF Rating recorded successfully'}, status=201)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_feedback_questions(request, question_key):
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        if question_key == 'Healthstatus':
            patient_id = request.GET.get('patient_id')
            patient = Patient.objects.get(id=ObjectId(patient_id))

            # Get previous ICF ratings for the patient
            ratings = list(PatientICFRating.objects.filter(patientId=patient))
            if ratings:
                # Sort ratings from best (low) to worst (high)
                sorted_ratings = sorted(ratings, key=lambda r: r.rating)
                strong_icfs = [r.icfCode for r in sorted_ratings[:2]]
                weak_icfs = [r.icfCode for r in sorted_ratings[-4:]]
                icf_codes = strong_icfs + weak_icfs
            else:
                # Pick 10 random ICF codes if no ratings available
                all_codes = FeedbackQuestion.objects.filter(questionKey='Healthstatus').distinct('icfCode')
                icf_codes = random.sample(all_codes, min(10, len(all_codes)))

            questions = FeedbackQuestion.objects.filter(questionKey__in=icf_codes)
        else:
            # For non-ICF types (e.g., intervention-based)
            questions = FeedbackQuestion.objects.filter(questionKey=question_key)

        questions_data = [
            {
                "questionKey": q.questionKey,
                "translations": [{"language": t.language, "text": t.text} for t in q.translations],
                "possibleAnswers": [{"language": t.language, "text": t.text} for t in q.possibleAnswers]
            }
            for q in questions
        ]
        return JsonResponse({"questions": questions_data}, safe=False)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def create_rehabilitation_plan(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        therapist = Therapist.objects.get(userId=data.get("therapistId"))
        interventions_data = data.get("interventions", [])

        # Load patient and therapist TODO
        patient = Patient.objects.get(pk=data.get('patientId'))
        
        
        new_interventions = []

        for item in interventions_data:
            intervention = Intervention.objects.get(id=ObjectId(item["interventionId"]['_id']))
            scheduled_dates = generate_repeat_dates(patient.reha_end_date, item)

            assignment = InterventionAssignment(
                interventionId=intervention,
                frequency=item.get("frequency", ""),
                notes=item.get("notes", ""),
                dates=scheduled_dates
            )
            new_interventions.append(assignment)

        existing_plan = RehabilitationPlan.objects(patientId=patient).first()

        if existing_plan:
            # Get current intervention IDs to avoid duplicates
            existing_ids = {str(i.interventionId.id) for i in existing_plan.interventions}

            # Filter out already added interventions
            interventions_to_add = [
                ni for ni in new_interventions
                if str(ni.interventionId.id) not in existing_ids
            ]

            if interventions_to_add:
                existing_plan.interventions.extend(interventions_to_add)
                existing_plan.updatedAt = timezone.now()
                existing_plan.save()
                message = 'Rehabilitation plan updated with new interventions'
            else:
                message = 'No new interventions added (already exist)'
        else:
            rehab_plan = RehabilitationPlan(
                patientId=patient,
                therapistId=therapist,
                planName=data.get("planName", f"Rehab Plan {timezone.now().date()}"),
                startDate=patient.userId.createdAt,
                endDate=patient.reha_end_date,
                status=data.get("status", "active"),
                interventions=new_interventions,
                createdAt=timezone.now(),
                updatedAt=timezone.now()
            )
            rehab_plan.save()
            message = 'Rehabilitation plan created successfully'

        return JsonResponse({'message': message}, status=201)

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@permission_classes([IsAuthenticated])
def get_rehabilitation_plan(request, patient_id):

    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        patient = Patient.objects.get(id=ObjectId(patient_id))
        plan = RehabilitationPlan.objects.get(patientId=patient)

        plan_data = {
            'startDate': plan.startDate.isoformat(),
            'endDate': plan.endDate.isoformat(),
            'status': plan.status,
            'interventions': []
        }

        for interv in plan.interventions:
            # Get intervention details
            intervention_obj = interv.interventionId
            intervention_name = getattr(intervention_obj, 'title', 'Unnamed Intervention')

            # Prepare status tracking
            completed_dates = set(
                log.date.date() for log in PatientInterventionLogs.objects(
                    userId=plan.patientId,
                    interventionId=intervention_obj,
                    status__icontains="completed"
                )
            )
            feedbacks = set(
                log.feedback for log in PatientInterventionLogs.objects(
                    userId=plan.patientId,
                    interventionId=intervention_obj,
                    status__icontains="completed"
                )
            )
            
            questions = set(
                log.feedback.questionId.translations for log in PatientInterventionLogs.objects(
                    userId=plan.patientId,
                    interventionId=intervention_obj,
                    status__icontains="completed"
                )
            )

            totalnum_int = len(interv.dates)
            current_total_int = 0
            completed_int = 0
            rating_sum_int = 0
            rating_num_int = 0
            
            today = timezone.now().date()
            intervention_dates = []
            for idx, date in enumerate(interv.dates):
                day = date.date()
                if day in completed_dates:
                    status = "completed"
                    feed = feedbacks[idx]
                    quest = questions[idx]
                    completed_int += 1
                    current_total_int += 1
                    
                elif day < today:
                    status = "missed"
                    feed = ''
                    quest = ''
                    current_total_int += 1
                elif day == today:
                    status = "today"
                    feed = ''
                    quest = ''
                else:
                    status = "upcoming"
                    feed = ''
                    quest = ''

                intervention_dates.append({
                    'datetime': date.isoformat(),
                    'status': status,
                    'feedback': feed,
                    'question': quest
                })

            plan_data['interventions'].append({
                '_id': str(interv.interventionId.id),
                'title': intervention_name,
                'frequency': interv.frequency,
                'notes': interv.notes,
                'dates': intervention_dates,
                'totalCount': totalnum_int,
                'currentTotalCount': current_total_int,
                'completedCount': completed_int,
                'averageRating': (rating_sum_int / rating_num_int) if rating_num_int > 0 else 0,
                'duration': getattr(intervention_obj, 'duration', 0)
            })

        plan_data['createdAt'] = plan.createdAt.isoformat()
        plan_data['updatedAt'] = plan.updatedAt.isoformat()


        return JsonResponse(plan_data, safe=False)

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def del_rehabilitation_plan_intervention(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        intervention = data.get('intervention')
        # 
        patient = Patient.objects.get(id=ObjectId(data.get(patientId)))
        plan = RehabilitationPlan.objects.get(patientId=patient)

        now = datetime.utcnow()

        for i in plan.interventions:
            if str(i.interventionId.pk) == str(intervention):
                # Keep only past or current dates
                i.dates = [d for d in i.dates if d.datetime <= now]

        # Optionally remove the intervention entirely if no dates left
        plan.interventions = [i for i in plan.interventions if i.dates]

        plan.save()


        plan["interventions"] = updated_interventions
        plan.save()

        return JsonResponse({"message": "Intervention removed from rehabilitation plan."}, status=200)

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)