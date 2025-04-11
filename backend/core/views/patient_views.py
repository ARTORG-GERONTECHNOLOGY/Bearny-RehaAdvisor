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
from core.models import Intervention, GeneralFeedback, User, Patient, Translation, Therapist, InterventionAssignment, RehabilitationPlan, PatientInterventionLogs, FeedbackQuestion, FeedbackEntry, PatientICFRating, AnswerOption
from utils.utils import (
    convert_to_serializable,
    serialize_datetime,
    generate_repeat_dates,
    sanitize_text,
    ensure_aware
)
import random
import os
from django.conf import settings
import logging
from core.models import Logs  # Ensure this includes action, userId, userAgent, details
from django.utils.timezone import now as dj_now

logger = logging.getLogger(__name__)  # Fallback to file-based logger if needed

FILE_TYPE_FOLDERS = {
    'mp4': 'videos',
    'mp3': 'audio',
    'jpg': 'images',
    'png': 'images',
    'pdf': 'documents'
}


@csrf_exempt
@permission_classes([IsAuthenticated])
def submit_patient_feedback(request):
    """
    POST /api/patients/feedback/questionnaire/
    Submit feedback for either an intervention or healthstatus.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        user_id = data.get("userId")
        intervention_id = data.get("interventionId")
        responses = data.get("responses", [])

        if not responses:
            return JsonResponse({'error': 'No feedback responses provided.'}, status=400)

        patient = Patient.objects.get(userId=ObjectId(user_id))

        def resolve_answers(question_obj, answer):
            """ Match the submitted answer(s) to the question's possibleAnswers """
            answer_keys = []
            if isinstance(answer, list):
                for ans in answer:
                    matched = next((opt for opt in question_obj.possibleAnswers if opt.key == ans), None)
                    answer_keys.append(matched or AnswerOption(
                        key=ans,
                        translations=[Translation(language='en', text=ans)]
                    ))
            else:
                answer_keys.append(AnswerOption(
                    key='text',
                    translations=[Translation(language='en', text=str(answer))]
                ))
            return answer_keys

        if intervention_id:
            # 🟢 Handle intervention-based feedback
            intervention = Intervention.objects.get(id=ObjectId(intervention_id))
            rehab_plan = RehabilitationPlan.objects(patientId=patient).first()

            if not rehab_plan:
                return JsonResponse({'error': 'Rehabilitation plan not found.'}, status=404)

            today = timezone.now().date()
            start = datetime.combine(today, datetime.min.time())
            end = datetime.combine(today, datetime.max.time())

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

                if question_obj:
                    log.feedback.append(FeedbackEntry(
                        questionId=question_obj,
                        answerKey=resolve_answers(question_obj, answer)
                    ))

            log.updatedAt = timezone.now()
            log.save()

        else:
            # 🟢 Handle health status feedback
            for response in responses:
                question_text = response.get("question", '')
                answer = response.get("answer")
                notes = response.get("notes", "")

                question_obj = FeedbackQuestion.objects.filter(
                    translations__text=question_text,
                    questionSubject="Healthstatus"
                ).first()

                if question_obj:
                    numeric_rating = (
                        int(answer[0]) if isinstance(answer, list) and str(answer[0]).isdigit() else None
                    )

                    PatientICFRating.objects.create(
                        questionId=question_obj,
                        patientId=patient,
                        icfCode=question_obj.icfCode,
                        rating=numeric_rating,
                        notes=notes,
                        feedback_entries=[
                            FeedbackEntry(
                                questionId=question_obj,
                                answerKey=resolve_answers(question_obj, answer)
                            )
                        ]
                    )

        return JsonResponse({'message': 'Feedback submitted successfully'}, status=201)

    except Patient.DoesNotExist:
        logger.warning(f"[submit_patient_feedback] Entity not found: {e}")
        return JsonResponse({'error': 'Patient not found.'}, status=404)
    except Intervention.DoesNotExist:
        logger.warning(f"[submit_patient_feedback] Entity not found: {e}")
        return JsonResponse({'error': 'Intervention not found.'}, status=404)
    except Exception as e:
        # Log exception to DB or file here if needed
        logger.error(f"[submit_patient_feedback] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def add_intervention_to_patient_1(request):
    """
    POST /api/recommendations/add-to-patient/
    Assigns an intervention to a single patient.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        patient_id = data.get('patient_id')
        intervention_id = data.get('intervention_id')

        if not patient_id or not intervention_id:
            return JsonResponse({'error': 'Missing patient_id or intervention_id'}, status=400)

        patient = Patient.objects.get(userId=ObjectId(patient_id))
        intervention = Intervention.objects.get(pk=intervention_id)

        # Create the relation if it doesn't exist already
        patient_intervention, created = PatientInterventions.get_or_create(patient, intervention)

        if created:
            return JsonResponse({'message': 'Intervention successfully assigned'}, status=201)
        else:
            return JsonResponse({'error': 'Intervention is already assigned to the patient'}, status=400)

    except Patient.DoesNotExist:
        logger.warning(f"[add_intervention_to_patient] Entity not found: {e}")
        return JsonResponse({'error': 'Patient not found'}, status=404)
    except Intervention.DoesNotExist:
        logger.warning(f"[add_intervention_to_patient] Entity not found: {e}")
        return JsonResponse({'error': 'Intervention not found'}, status=404)
    except Exception as e:
        logger.error(f"[add_intervention_to_patient] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def mark_intervention_completed(request):
    """
    POST /api/recommendations/mark-done/
    Marks an intervention as completed for the current day.
    Logs action and handles rapid duplicate marking.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        patient_id = data.get('patient_id')
        intervention_id = data.get('intervention_id')

        if not patient_id or not intervention_id:
            return JsonResponse({'error': 'Missing patient_id or intervention_id'}, status=400)

        patient = Patient.objects.get(userId=ObjectId(patient_id))
        intervention = Intervention.objects.get(pk=ObjectId(intervention_id))
        rehab_plan = RehabilitationPlan.objects(patientId=patient).first()

        if not rehab_plan:
            return JsonResponse({'error': 'Rehabilitation plan not found for this patient'}, status=404)

        now = timezone.now()
        today_start = datetime.combine(now.date(), datetime.min.time())
        today_end = datetime.combine(now.date(), datetime.max.time())

        log = PatientInterventionLogs.objects(
            userId=patient,
            rehabilitationPlanId=rehab_plan,
            interventionId=intervention,
            date__gte=today_start,
            date__lte=today_end
        ).first()

        if log:
            if 'completed' in log.status:
                return JsonResponse({'message': 'Already marked as completed'}, status=200)
            else:
                log.status.append('completed')
                log.updatedAt = now
                log.save()
        else:
            log = PatientInterventionLogs(
                userId=patient,
                rehabilitationPlanId=rehab_plan,
                interventionId=intervention,
                date=now,
                status=['completed'],
                createdAt=now,
                updatedAt=now
            )
            log.save()

        Logs(
            userId=patient.userId,
            action='MARK_INTERVENTION_COMPLETED',
            userAgent='Patient',
            details=f"Marked intervention {intervention.title} as done on {dj_now().isoformat()}"
        ).save()

        return JsonResponse({'message': 'Marked as completed successfully'}, status=200)

    except Patient.DoesNotExist:
        logger.warning(f"[mark_intervention_completed] Entity not found: {e}")
        return JsonResponse({'error': 'Patient not found'}, status=404)

    except Intervention.DoesNotExist:
        logger.warning(f"[mark_intervention_completed] Entity not found: {e}")
        return JsonResponse({'error': 'Intervention not found'}, status=404)

    except Exception as e:
        logger.error(f"[mark_intervention_completed] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({'error': 'Internal Server Error', 'details': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_recommendation_options_for_patient(request, patient_id):
    """
    GET /api/patients/<patient_id>/recommendation-options/
    Returns interventions filtered by patient's function or diagnosis.
    """
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        patient = Patient.objects.get(userId=ObjectId(patient_id))
        patient_diagnoses = patient.diagnosis or []
        patient_functions = patient.function or []

        # Filter based on function or diagnosis (including 'All')
        recommendations = Intervention.objects.filter(
            Q(patient_types__type__in=patient_functions) |
            Q(patient_types__diagnosis__in=patient_diagnoses) |
            Q(patient_types__diagnosis="All")
        ).distinct()

        result = []
        for rec in recommendations:
            result.append({
                '_id': str(rec.id),
                'title': rec.title,
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
            })

        return JsonResponse({'recommendations': result}, status=200)

    except Patient.DoesNotExist:
        ogger.warning(f"[get_recommendation_options_for_patient] Entity not found: {e}")
        return JsonResponse({'error': 'Patient not found'}, status=404)

    except Exception as e:
        logger.error(f"[get_recommendation_options_for_patient] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({'error': 'Internal server error', 'details': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_recommendations(request, patient_id):
    """
    GET /api/patients/<patient_id>/recommendations/
    Fetches today's assigned interventions for a patient.
    """
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        recommendations = PatientIntervention.get_todays_recommendations(patient_id)
        return JsonResponse({'recommendations': recommendations}, safe=False, status=200)

    except Exception as e:
        logger.error(f"[get_patient_recommendations] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({'error': 'Internal server error', 'details': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_plan(request, patient_id):
    """
    GET /api/patients/rehabilitation-plan/patient/<patient_id>/
    Fetches rehabilitation plan and today's feedback for the patient.
    """
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        patient = Patient.objects.get(userId=ObjectId(patient_id))
        rehab_plan = RehabilitationPlan.objects(patientId=patient).first()

        if not rehab_plan:
            return JsonResponse({"rehab_plan": [], "message": "No rehabilitation plan found"}, status=200)

        today = timezone.now().date()
        today_interventions = []

        for assignment in rehab_plan.interventions:
            intervention = assignment.interventionId

            logs = PatientInterventionLogs.objects(
                userId=patient,
                rehabilitationPlanId=rehab_plan,
                interventionId=intervention
            )

            completion_dates = [
                log.date.isoformat()
                for log in logs
                if "completed" in log.status
            ]

            feedback_data = []
            for log in logs:
                if log.date.date() != today:
                    continue

                for fb in log.feedback:
                    if not fb.questionId:
                        continue

                    question_translations = [
                        {'language': t.language, 'text': t.text}
                        for t in fb.questionId.translations
                    ]

                    answer_output = []
                    answer_keys = fb.answerKey if isinstance(fb.answerKey, list) else [fb.answerKey]

                    for key in answer_keys:
                        matched_option = next(
                            (opt for opt in fb.questionId.possibleAnswers if opt.key == key),
                            None
                        )
                        if matched_option:
                            answer_output.append({
                                'key': matched_option.key,
                                'translations': [
                                    {'language': t.language, 'text': t.text}
                                    for t in matched_option.translations
                                ]
                            })

                    feedback_data.append({
                        'date': log.date.isoformat(),
                        'question': {
                            'id': str(fb.questionId.id),
                            'translations': question_translations
                        },
                        'answer': answer_output,
                        'comment': fb.comment or ''
                    })

            intervention_record = {
                'intervention_id': str(intervention.id),
                'intervention_title': intervention.title,
                'description': intervention.description,
                'frequency': assignment.frequency,
                'dates': [d.isoformat() for d in assignment.dates],
                'completion_dates': completion_dates,
                'content_type': intervention.content_type,
                'benefitFor': intervention.benefitFor,
                'tags': intervention.tags,
                'duration': intervention.duration,
                'feedback': feedback_data,
                'preview_img': (
                    f"{settings.MEDIA_HOST}{os.path.join(settings.MEDIA_URL, intervention.preview_img)}"
                    if intervention.preview_img else ''
                )
            }

            if intervention.link:
                intervention_record["link"] = intervention.link
            elif intervention.media_file:
                intervention_record["media_file"] = f"{settings.MEDIA_HOST}{os.path.join(settings.MEDIA_URL, intervention.media_file)}"

            today_interventions.append(intervention_record)

        return JsonResponse(today_interventions, safe=False, status=200)

    except Patient.DoesNotExist:
        logger.warning(f"[get_patient_plan] Entity not found: {e}")
        return JsonResponse({'error': 'Patient not found'}, status=404)
    except Exception as e:
        logger.error(f"[get_patient_plan] Error for patient {patient_id}: {str(e)}", exc_info=True)
        return JsonResponse({'error': 'Internal Server Error', 'details': str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def create_patient_intervention_log(request):
    """
    POST /api/patients/intervention-log/
    Creates a patient intervention log entry.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        patient = Patient.objects.get(id=ObjectId(data.get("patientId")))
        intervention = Intervention.objects.get(id=ObjectId(data.get("interventionId")))

        log = PatientInterventionLogs(
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
        log.save()

        return JsonResponse({'message': 'Patient Intervention Log created successfully'}, status=201)

    except (Patient.DoesNotExist, Intervention.DoesNotExist) as e:
        logger.warning(f"[create_patient_intervention_log] Entity not found: {e}")
        return JsonResponse({'error': str(e)}, status=404)

    except Exception as e:
        logger.error(f"[create_patient_intervention_log] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({'error': 'Internal Server Error'}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def fetch_feedback_questions(request, questionaire_type, patient_id):
    """
    GET /api/patients/get-questions/<questionaire_type>/<patient_id>/
    Returns feedback questions unless already answered today.
    """
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        questions = []

        if questionaire_type == 'Healthstatus':
            patient = Patient.objects.get(userId=ObjectId(patient_id))
            today = timezone.now().date()

            # Avoid repeating Healthstatus if answered today
            today_feedback = PatientICFRating.objects.filter(
                patientId=patient,
                date__gte=datetime.combine(today, datetime.min.time()),
                date__lte=datetime.combine(today, datetime.max.time()),
                feedback_entries__exists=True,
                feedback_entries__ne=[]
            )
            if today_feedback:
                return JsonResponse({"questions": []}, safe=False)

            ratings = list(PatientICFRating.objects.filter(patientId=patient, rating__ne=None))

            if ratings:
                sorted_ratings = sorted(ratings, key=lambda r: r.rating)
                strong = [r.icfCode for r in sorted_ratings[:2]]
                weak = [r.icfCode for r in sorted_ratings[-4:]]
                icf_codes = list(set(strong + weak))
            else:
                all_codes = FeedbackQuestion.objects.filter(questionSubject="Healthstatus").distinct('icfCode')
                icf_codes = random.sample(all_codes, min(5, len(all_codes)))

            questions = FeedbackQuestion.objects.filter(icfCode__in=icf_codes, questionSubject="Healthstatus")

        elif questionaire_type == 'Intervention':
            questions = FeedbackQuestion.objects.filter(questionSubject="Intervention")
        else:
            return JsonResponse({'error': 'Invalid questionnaire type.'}, status=400)

        serialized_questions = [
            {
                "questionKey": q.questionKey,
                "answerType": q.answer_type,
                "translations": [{"language": t.language, "text": t.text} for t in q.translations],
                "possibleAnswers": [
                    {
                        "key": ans.key,
                        "translations": [{"language": tr.language, "text": tr.text} for tr in ans.translations]
                    }
                    for ans in q.possibleAnswers
                ] if q.possibleAnswers else []
            }
            for q in questions
        ]

        return JsonResponse({"questions": serialized_questions}, safe=False)

    except Patient.DoesNotExist:
        logger.warning(f"[fetch_feedback_questions] Entity not found: {e}")
        return JsonResponse({'error': 'Patient not found.'}, status=404)

    except Exception as e:
        logger.error(f"[fetch_feedback_questions] Error for patient {patient_id}: {str(e)}", exc_info=True)
        return JsonResponse({'error': 'Internal Server Error'}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def add_intervention_to_patient(request):
    """
    POST /api/recommendations/add-to-patient/
    Adds interventions to a patient's rehabilitation plan.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        therapist = Therapist.objects.get(userId=data.get("therapistId"))
        patient = Patient.objects.get(pk=data.get("patientId"))
        interventions_data = data.get("interventions", [])

        new_assignments = []
        for item in interventions_data:
            intervention = Intervention.objects.get(id=ObjectId(item["interventionId"]["_id"]))
            scheduled_dates = generate_repeat_dates(patient.reha_end_date, item)

            assignment = InterventionAssignment(
                interventionId=intervention,
                frequency=item.get("frequency", ""),
                notes=item.get("notes", ""),
                dates=scheduled_dates
            )
            new_assignments.append(assignment)

        existing_plan = RehabilitationPlan.objects(patientId=patient).first()

        if existing_plan:
            # Avoid duplicate entries
            current_ids = {str(i.interventionId.id) for i in existing_plan.interventions}
            to_add = [a for a in new_assignments if str(a.interventionId.id) not in current_ids]

            if to_add:
                existing_plan.interventions.extend(to_add)
                existing_plan.updatedAt = timezone.now()
                existing_plan.save()
                message = "Rehabilitation plan updated."
            else:
                message = "No new interventions added (already exist)."
        else:
            new_plan = RehabilitationPlan(
                patientId=patient,
                therapistId=therapist,
                startDate=patient.userId.createdAt,
                endDate=patient.reha_end_date,
                status=data.get("status", "active"),
                interventions=new_assignments,
                createdAt=timezone.now(),
                updatedAt=timezone.now()
            )
            new_plan.save()
            message = "Rehabilitation plan created successfully."

        return JsonResponse({'message': message}, status=201)

    except (Therapist.DoesNotExist, Patient.DoesNotExist, Intervention.DoesNotExist) as e:
        logger.warning(f"[add_intervention_to_patient] Missing entity: {e}")
        return JsonResponse({'error': str(e)}, status=404)

    except Exception as e:
        logger.error(f"[add_intervention_to_patient] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({'error': 'Internal Server Error'}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_plan_for_therapist(request, patient_id):
    """
    GET /api/patients/rehabilitation-plan/therapist/<patient_id>/
    Retrieves a structured rehabilitation plan for therapist overview.
    """
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        patient = Patient.objects.get(id=ObjectId(patient_id))
        plan = RehabilitationPlan.objects.get(patientId=patient)

        today = timezone.now().date()
        plan_data = {
            'startDate': plan.startDate.isoformat(),
            'endDate': plan.endDate.isoformat(),
            'status': plan.status,
            'createdAt': plan.createdAt.isoformat(),
            'updatedAt': plan.updatedAt.isoformat(),
            'interventions': []
        }

        for assignment in plan.interventions:
            intervention = assignment.interventionId
            logs = PatientInterventionLogs.objects(
                userId=patient,
                interventionId=intervention
            )

            completed_dates = {log.date.date() for log in logs if 'completed' in log.status}
            intervention_dates = []
            completed_count = 0
            current_total_count = 0
            rating_sum = 0
            rating_count = 0

            for date in assignment.dates:
                log = next((l for l in logs if l.date.date() == date.date()), None)

                if log and "completed" in log.status:
                    status = "completed"
                    completed_count += 1
                    current_total_count += 1
                elif date.date() < today:
                    status = "missed"
                    current_total_count += 1
                elif date.date() == today:
                    status = "today"
                else:
                    status = "upcoming"

                feedback_entries = []
                if log and log.feedback:
                    for fb in log.feedback:
                        if not fb.questionId:
                            continue

                        question_data = {
                            'id': str(fb.questionId.id),
                            'translations': [{'language': t.language, 'text': t.text} for t in fb.questionId.translations]
                        }

                        answer_data = [
                            {
                                'key': opt.key,
                                'translations': [{'language': tr.language, 'text': tr.text} for tr in opt.translations]
                            } for opt in fb.answerKey
                        ]

                        feedback_entries.append({
                            'question': question_data,
                            'comment': fb.comment,
                            'answer': answer_data
                        })

                        # Try numeric rating
                        try:
                            rating_sum += int(fb.answerKey[0].key)
                            rating_count += 1
                        except (ValueError, TypeError, IndexError):
                            pass

                intervention_dates.append({
                    'datetime': date.isoformat(),
                    'status': status,
                    'feedback': feedback_entries
                })

            plan_data['interventions'].append({
                '_id': str(intervention.id),
                'title': intervention.title,
                'frequency': assignment.frequency,
                'notes': assignment.notes,
                'dates': intervention_dates,
                'totalCount': len(assignment.dates),
                'currentTotalCount': current_total_count,
                'completedCount': completed_count,
                'averageRating': round(rating_sum / rating_count, 1) if rating_count > 0 else 0,
                'duration': getattr(intervention, 'duration', 0)
            })

        return JsonResponse(plan_data, safe=False)

    except Patient.DoesNotExist:
        logger.warning(f"[get_patient_plan_for_therapist] Patient not found: {patient_id}")
        return JsonResponse({'error': 'Patient not found'}, status=404)
    except RehabilitationPlan.DoesNotExist:
        logger.info(f"[get_patient_plan_for_therapist] No rehab plan for patient: {patient_id}")
        return JsonResponse({'message': 'No rehabilitation plan found', 'rehab_plan': []}, status=200)
    except Exception as e:
        logger.error(f"[get_patient_plan_for_therapist] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({'error': 'Internal Server Error'}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def remove_intervention_from_patient(request):
    """
    POST /api/recommendations/remove-from-patient/
    Removes all future dates for a specific intervention from the patient's plan.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        intervention_id = data.get('intervention')
        patient_id = data.get('patientId')

        if not intervention_id or not patient_id:
            return JsonResponse({'error': 'Missing required parameters'}, status=400)

        patient = Patient.objects.get(id=ObjectId(patient_id))
        plan = RehabilitationPlan.objects.get(patientId=patient)
        now = timezone.now()

        for assignment in plan.interventions:
            if str(assignment.interventionId.pk) == str(intervention_id):
                # Keep only past or current dates
                assignment.dates = [d for d in assignment.dates if ensure_aware(d) <= now]


        # Remove interventions that no longer have any dates
        plan.interventions = [a for a in plan.interventions if a.dates]
        plan.updatedAt = timezone.now()
        plan.save()

        return JsonResponse({"message": "Intervention dates removed successfully."}, status=200)

    except Patient.DoesNotExist:
        logger.warning(f"[remove_intervention_from_patient] Patient not found: {patient_id}")
        return JsonResponse({'error': 'Patient not found'}, status=404)
    except RehabilitationPlan.DoesNotExist:
        logger.warning(f"[remove_intervention_from_patient] Plan not found for patient: {patient_id}")
        return JsonResponse({'error': 'Rehabilitation plan not found'}, status=404)
    except Exception as e:
        logger.error(f"[remove_intervention_from_patient] Error removing intervention {intervention_id} from {patient_id}: {str(e)}", exc_info=True)
        return JsonResponse({'error': 'Internal Server Error'}, status=500)
