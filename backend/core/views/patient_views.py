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
from core.models import Intervention, GeneralFeedback, User, Patient, Therapist, InterventionAssignment, RehabilitationPlan, PatientInterventionLogs, FeedbackQuestion, FeedbackEntry, PatientICFRating
from utils.utils import (
    convert_to_serializable,
    serialize_datetime,
    generate_repeat_dates,
    sanitize_text
)
import random
import os
from django.conf import settings


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
def patient_post_questionnaire_feedback(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        user_id = data.get("userId")
        intervention_id = data.get("interventionId")
        responses = data.get("responses", [])

        if not responses:
            return JsonResponse({'error': 'No feedback responses provided.'}, status=400)

        # Retrieve patient
        patient = Patient.objects.get(userId=ObjectId(user_id))

        if intervention_id:
            # Handle intervention-based feedback
            intervention = Intervention.objects.get(id=ObjectId(intervention_id))
            rehab_plan = RehabilitationPlan.objects(patientId=patient).first()
            if not rehab_plan:
                return JsonResponse({'error': 'Rehabilitation plan not found.'}, status=404)

            today = timezone.now().date()
            start = datetime.combine(today, datetime.min.time())
            end = datetime.combine(today, datetime.max.time())

            # Find or create today's log
            log = PatientInterventionLogs.objects(
                userId=patient,
                interventionId=intervention,
                date__gte=start,
                date__lte=end
            ).first()

            if not log:
                log = PatientInterventionLogs(
                    userId=patient,
                    interventionId=intervention,
                    date=timezone.now(),
                    status=[],
                    feedback=[],
                    comments=""
                )

            for response in responses:
                question_text = response.get("question", '')
                answer = response.get("answer")

                question_obj = FeedbackQuestion.objects.filter(
                    translations__text=question_text
                ).first()

                if not question_obj:
                    continue  # Skip if question not found

                answer_str = ", ".join(answer) if isinstance(answer, list) else str(answer)

                log.feedback.append(FeedbackEntry(
                    questionId=question_obj,
                    answer=sanitize_text(answer_str)
                ))

            log.updatedAt = timezone.now()
            log.save()

        else:
            # Handle Healthstatus feedback using PatientICFRating
            for response in responses:
                question_text = response.get("question", '')
                answer = response.get("answer")
                notes = response.get("notes", "")

                question_obj = FeedbackQuestion.objects.filter(
                    translations__text=question_text,
                    questionSubject="Healthstatus"
                ).first()

                if not question_obj:
                    continue

                answer_int = int(answer) if isinstance(answer, (int, str)) and str(answer).isdigit() else None

                PatientICFRating.objects.create(
                    questionId=question_obj,
                    patientId=patient,
                    icfCode=question_obj.icfCode,
                    rating=answer_int,
                    notes=notes,
                    feedback_entries=[
                        FeedbackEntry(
                            questionId=question_obj,
                            answer=sanitize_text(str(answer))
                        )
                    ]
                )

        return JsonResponse({'message': 'Feedback submitted successfully'}, status=201)

    except Patient.DoesNotExist:
        return JsonResponse({'error': 'Patient not found.'}, status=404)
    except Intervention.DoesNotExist:
        return JsonResponse({'error': 'Intervention not found.'}, status=404)
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

        if not patient_id or not intervention_id:
            return JsonResponse({'error': 'Missing patient_id or intervention_id'}, status=400)

        # Get patient and intervention objects
        patient = Patient.objects.get(userId=ObjectId(patient_id))
        intervention = Intervention.objects.get(pk=ObjectId(intervention_id))

        # Get rehabilitation plan
        rehab_plan = RehabilitationPlan.objects(patientId=patient).first()
        if not rehab_plan:
            return JsonResponse({'error': 'No rehabilitation plan found for this patient'}, status=404)

        today = timezone.now().date()
        start = datetime.combine(today, datetime.min.time())
        end = datetime.combine(today, datetime.max.time())

        # Check if a log entry already exists for today
        log = PatientInterventionLogs.objects(
            userId=patient,
            interventionId=intervention,
            rehabilitationPlanId=rehab_plan,
            date__gte=start,
            date__lte=end
        ).first()

        if log:
            if 'completed' not in log.status:
                log.status.append('completed')
                log.updatedAt = timezone.now()
                log.save()
        else:
            # Create a new log entry
            log = PatientInterventionLogs(
                userId=patient,
                rehabilitationPlanId=rehab_plan,
                interventionId=intervention,
                date=timezone.now(),
                status=['completed'],
                createdAt=timezone.now(),
                updatedAt=timezone.now()
            )
            log.save()

        return JsonResponse({'message': 'Marked as done successfully'}, status=200)

    except Patient.DoesNotExist:
        return JsonResponse({'error': 'Patient not found'}, status=404)
    except Intervention.DoesNotExist:
        return JsonResponse({'error': 'Intervention not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)



@csrf_exempt
@permission_classes([IsAuthenticated])
def get_rehab_data(request, patient_id):
    if request.method != 'GET':
        return JsonResponse({'error': 'Invalid request method'}, status=405)

    try:
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


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_reha_plan(request, patient_id):
    if request.method == 'GET':
        try:
            # Fetch patient and their rehab plan
            patient = Patient.objects.get(userId=ObjectId(patient_id))
            rehab_plan = RehabilitationPlan.objects(patientId=patient).first()

            if not rehab_plan:
                return JsonResponse({"rehab_plan": [], "message": "No rehabilitation plan found"}, status=200)

            today = timezone.now().date()
            today_interventions = []

            for intervention in rehab_plan.interventions:
                intervention_obj = intervention.interventionId

                # Fetch all logs for this patient and this intervention
                logs = PatientInterventionLogs.objects(
                    userId=patient,
                    rehabilitationPlanId=rehab_plan,
                    interventionId=intervention_obj
                )

                # Parse feedback logs
                today = timezone.now().date()
                feedback_data = []
                completion_dates = []

                for log in logs:
                    if "completed" in log.status:
                        completion_dates.append(log.date.isoformat())

                    # Today's feedback
                    if log.date.date() == today:
                        for fb in log.feedback:
                            feedback_data.append({
                                'date': log.date.isoformat(),
                                'comment': getattr(log, 'comments', ''),
                                'rating': fb.answer
                            })

                # Build the response structure
                rec_data = {
                    'intervention_id': str(intervention_obj.pk),
                    'intervention_title': intervention_obj.title,
                    'description': intervention_obj.description,
                    'frequency': intervention.frequency,
                    'dates': [d.isoformat() for d in intervention.dates],
                    'completion_dates': completion_dates,
                    'content_type': intervention_obj.content_type,
                    'benefitFor': intervention_obj.benefitFor,
                    'tags': intervention_obj.tags,
                    'preview_img': (
                        f"{settings.MEDIA_HOST}{os.path.join(settings.MEDIA_URL, intervention_obj.preview_img)}"
                        if intervention_obj.preview_img else ''
                    ),
                    'duration': intervention_obj.duration,
                    'feedback': feedback_data
                }
                # Handle content type: link or media file
                if intervention_obj.link:
                    rec_data["link"] = intervention_obj.link
                elif intervention_obj.media_file:
                    media_file = intervention_obj.media_file
                    if media_file:
                        media_file_path = os.path.join(settings.MEDIA_URL, media_file)
                        rec_data["media_file"] = f'{settings.MEDIA_HOST}{media_file_path}'

                today_interventions.append(rec_data)

            return JsonResponse(today_interventions, safe=False)

        except Exception as e:
            return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)

    return JsonResponse({'error': 'Invalid request method'}, status=400)


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
            comments=sanitize_text(data.get("comments", "")),
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
            notes=sanitize_text(data.get("notes", ""))
        )
        icf_rating.save()
        return JsonResponse({'message': 'ICF Rating recorded successfully'}, status=201)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_feedback_questions(request, questionaire_type, patient_id):
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        questions = []

        if questionaire_type == 'Healthstatus':
            patient = Patient.objects.get(userId=ObjectId(patient_id))

            # Get previous ICF ratings for the patient
            ratings = list(PatientICFRating.objects.filter(patientId=patient))

            if ratings: # TODO
                sorted_ratings = sorted(ratings, key=lambda r: r.rating)
                strong_icfs = [r.icfCode for r in sorted_ratings[:2]]
                weak_icfs = [r.icfCode for r in sorted_ratings[-4:]]
                icf_codes = list(set(strong_icfs + weak_icfs))
            else:
                # If no ratings, pick random questions
                all_codes = FeedbackQuestion.objects.filter(questionSubject="Healthstatus").distinct('icfCode')
                icf_codes = random.sample(all_codes, min(5, len(all_codes)))

            # Get questions that match the ICF codes
            questions = FeedbackQuestion.objects.filter(icfCode__in=icf_codes, questionSubject="Healthstatus")

        elif questionaire_type == 'Intervention':
            questions = FeedbackQuestion.objects.filter(questionSubject='Intervention')

        else:
            return JsonResponse({'error': 'Invalid questionnaire type.'}, status=400)

        # Serialize questions
        questions_data = [
            {
                "questionKey": q.questionKey,
                "answerType": q.answer_type,
                "translations": [{"language": t.language, "text": t.text} for t in q.translations],
                "possibleAnswers": [{"language": t.language, "text": t.text} for t in q.possibleAnswers]
            }
            for q in questions
        ]

        return JsonResponse({"questions": questions_data}, safe=False)

    except Patient.DoesNotExist:
        return JsonResponse({'error': 'Patient not found.'}, status=404)
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

        today = timezone.now().date()

        for interv in plan.interventions:
            intervention_obj = interv.interventionId
            intervention_name = getattr(intervention_obj, 'title', 'Unnamed Intervention')

            logs = PatientInterventionLogs.objects(
                userId=plan.patientId,
                interventionId=intervention_obj
            )

            completed_dates = {log.date.date() for log in logs if "completed" in log.status}
            intervention_dates = []
            totalnum_int = len(interv.dates)
            current_total_int = 0
            completed_int = 0
            rating_sum_int = 0
            rating_num_int = 0

            for date in interv.dates:
                day = date.date()
                log = next((l for l in logs if l.date.date() == day), None)

                # Determine status
                if log and "completed" in log.status:
                    status = "completed"
                    completed_int += 1
                    current_total_int += 1
                elif day < today:
                    status = "missed"
                    current_total_int += 1
                elif day == today:
                    status = "today"
                else:
                    status = "upcoming"

                # Gather feedback
                feedback_entries = []
                if log and log.feedback:
                    for fb in log.feedback:
                        if fb.questionId:
                            feedback_entries.append({
                                'question': {
                                    'id': str(fb.questionId.id),
                                    'translations': [
                                        {'language': t.language, 'text': t.text}
                                        for t in fb.questionId.translations
                                    ]
                                },
                                'comment': fb.comment,
                                'answer': fb.answer
                            })

                            # Optional: calculate average rating if numeric
                            if fb.answer.isdigit():
                                rating_sum_int += int(fb.answer)
                                rating_num_int += 1

                date_data = {
                    'datetime': date.isoformat(),
                    'status': status
                }

                if feedback_entries:
                    date_data['feedback'] = feedback_entries

                intervention_dates.append(date_data)


            plan_data['interventions'].append({
                '_id': str(intervention_obj.id),
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