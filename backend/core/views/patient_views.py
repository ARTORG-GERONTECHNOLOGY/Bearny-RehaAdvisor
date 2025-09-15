import json
import logging
import random
import datetime as dt
import re, tempfile, os
from pydub import AudioSegment
from pydub.utils import which as pd_which
from datetime import timedelta
from utils.utils import (
    generate_custom_id,
    generate_repeat_dates,
    get_labels,
    sanitize_text,
)
import datetime, json
from urllib.parse import urljoin

import speech_recognition as sr
from bson import ObjectId
from django.conf import settings
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.utils import timezone
from django.utils.timezone import now as dj_now
from django.views.decorators.csrf import csrf_exempt
from mongoengine.queryset.visitor import Q
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from pydub import AudioSegment   
from core.models import Logs  # Ensure this includes action, userId, userAgent, details
from core.models import (
    AnswerOption,
    FeedbackEntry,
    FeedbackQuestion,
    GeneralFeedback,
    Intervention,
    InterventionAssignment,
    Patient,
    PatientICFRating,
    PatientInterventionLogs,
    RehabilitationPlan,
    Therapist,
    Translation,
    User,
    FitbitData
)
from utils.utils import (
    convert_to_serializable,
    ensure_aware,
    generate_repeat_dates,
    sanitize_text,
    serialize_datetime,
    transcribe_file,
)

logger = logging.getLogger(__name__)  # Fallback to file-based logger if needed

FILE_TYPE_FOLDERS = {
    "mp4": "videos",
    "mp3": "audio",
    "jpg": "images",
    "png": "images",
    "pdf": "documents",
}


import os
import json
import tempfile

from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.core.files.storage import default_storage

import speech_recognition as sr
from pydub import AudioSegment
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from bson import ObjectId
from core.models import (
    Patient,
    Intervention,
    RehabilitationPlan,
    PatientInterventionLogs,
    PatientICFRating,
    FeedbackQuestion,
    FeedbackEntry,
    AnswerOption,
    Translation,
)
FILE_TYPE_FOLDERS = {
    "mp4": "videos",
    "mp3": "audio",
    "jpg": "images",
    "png": "images",
    "pdf": "documents",
}
FFMPEG_OK = bool(pd_which("ffmpeg") and pd_which("ffprobe"))

logger = logging.getLogger(__name__)  # Fallback to file-based logger if needed


@csrf_exempt
@permission_classes([IsAuthenticated])
def submit_patient_feedback(request):
    """
    POST /api/patients/feedback/questionaire/
    Handles submission of patient feedback with optional video/audio input.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        user_id = request.POST.get("userId")
        intervention_id = request.POST.get("interventionId", None)
        if not user_id:
            return JsonResponse({"error": "Missing userId"}, status=400)

        recognizer = sr.Recognizer()
        answers = {}

        for key, upload in request.FILES.items():
            ct = upload.content_type or ""
            ts = timezone.now().strftime("%Y%m%d%H%M%S")

            # --- Video (unchanged) ---
            if ct.startswith("video/"):
                ext = upload.name.rsplit(".", 1)[-1].lower()
                fname = f"{ts}_{upload.name}"
                path = default_storage.save(f"video_feedback/{fname}", upload)
                url = f"{settings.MEDIA_HOST}{default_storage.url(path)}"
                logger.info(f"[submit_patient_feedback] Saved video to {path}")
                normalized_key = re.sub(r"_(video)$", "", key)
                answers[normalized_key] = {"video_url": url, "uploaded_at": timezone.now()}
                continue

            # --- Audio (robust) ---
            ext = upload.name.rsplit(".", 1)[-1].lower()
            folder = FILE_TYPE_FOLDERS.get(ext, "audio")
            fname = f"{ts}_{upload.name}"
            saved_path = default_storage.save(os.path.join(folder, fname), upload)
            public_url = f"{settings.MEDIA_HOST}{default_storage.url(saved_path)}"
            logger.info(f"[submit_patient_feedback] Saved raw audio to {saved_path}")

            # Normalize key to match FeedbackQuestion.questionKey (e.g. q1_audio -> q1)
            normalized_key = re.sub(r"_(audio|file|voice|recording)$", "", key)

            transcription = ""
            converted_ok = False
            try:
                if ext in {"wav", "flac", "aiff", "aif"}:
                    # These are directly supported by speech_recognition
                    with default_storage.open(saved_path, "rb") as f:
                        with sr.AudioFile(f) as source:
                            audio_data = recognizer.record(source)
                            transcription = recognizer.recognize_google(audio_data)
                    converted_ok = True
                elif FFMPEG_OK:
                    # Convert to wav using ffmpeg/pydub
                    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp_in:
                        for chunk in default_storage.open(saved_path).chunks():
                            tmp_in.write(chunk)
                        tmp_in_path = tmp_in.name

                    wav_path = tmp_in_path + ".wav"
                    try:
                        AudioSegment.from_file(tmp_in_path).export(wav_path, format="wav")
                        with sr.AudioFile(wav_path) as source:
                            audio_data = recognizer.record(source)
                            transcription = recognizer.recognize_google(audio_data)
                        converted_ok = True
                    except Exception as e:
                        logger.error("[submit_patient_feedback] ffmpeg/pydub conversion failed for %s: %s",
                                    key, e, exc_info=True)
                    finally:
                        try: os.remove(tmp_in_path)
                        except Exception: pass
                        try: os.remove(wav_path)
                        except Exception: pass
                else:
                    logger.warning("[submit_patient_feedback] ffmpeg not available; skipping transcription for %s", key)
            except (ValueError, sr.UnknownValueError, sr.RequestError) as e:
                # ValueError is what you see in the screenshot when a non-supported file hits AudioFile
                logger.warning("[submit_patient_feedback] Transcription failed for %s: %s", key, e)

            # ALWAYS record the answer—even if transcription failed or conversion isn't possible
            answers[normalized_key] = {
                "file_path": saved_path,
                "audio_url": public_url,
                "transcription": transcription,  # may be ""
                "converted_ok": converted_ok,    # optional debug flag
            }


        # --- Plain-text answers ---
        for key, val in request.POST.items():
            if key in ("userId", "interventionId"):
                continue
            if key not in answers:
                try:
                    answers[key] = json.loads(val)
                except Exception:
                    answers[key] = val
        logger.info(f"[submit_patient_feedback] Collected answers: {answers}")
        # --- Lookup patient ---
        try:
            patient = Patient.objects.get(userId=ObjectId(user_id))
        except Patient.DoesNotExist:
            return JsonResponse({"error": "Patient not found."}, status=404)

        if intervention_id:
            intervention = Intervention.objects.filter(id=ObjectId(intervention_id)).first()
            if not intervention:
                return JsonResponse({"error": "Intervention not found."}, status=404)

            plan = RehabilitationPlan.objects(patientId=patient).first()
            if not plan:
                return JsonResponse({"error": "Rehabilitation plan not found."}, status=404)

            today = timezone.now().date()
            log = PatientInterventionLogs.objects(
                userId=patient,
                interventionId=intervention,
                date__gte=datetime.datetime.combine(today, datetime.time.min),
                date__lte=datetime.datetime.combine(today, datetime.time.max),
            ).first()


            if not log:
                log = PatientInterventionLogs(
                    userId=patient,
                    interventionId=intervention,
                    rehabilitationPlanId=plan,
                    date=timezone.now(),
                    status=[],
                    feedback=[],
                    comments="",
                )

            for qkey, answer_val in answers.items():
                if qkey == "video_example" and isinstance(answer_val, dict) and "video_url" in answer_val:
                    log.video_url = answer_val["video_url"]
                    log.video_expired = False
                    log.comments += f"\nVideo uploaded at {answer_val['uploaded_at']:%Y-%m-%d %H:%M}"
                    continue

                qobj = FeedbackQuestion.objects.filter(questionKey=qkey).first()
                if not qobj:
                    logger.warning("[submit_patient_feedback] No FeedbackQuestion found for key: %s", qkey)
                    continue

                entry_kwargs = {"questionId": qobj}
                opts = []
                comment = ""

                if isinstance(answer_val, dict) and ("audio_url" in answer_val or "transcription" in answer_val):
                    text_ans = (answer_val.get("transcription") or "").strip()
                    comment = f"Audio saved at {answer_val.get('file_path')}"
                    # Put a placeholder text if transcription is empty, so there's always one AnswerOption
                    opts = [AnswerOption(key="text",
                                        translations=[Translation(language="en", text=text_ans or " ")])]
                    entry_kwargs["audio_url"] = answer_val.get("audio_url")
                elif isinstance(answer_val, list):
                    for val in answer_val:
                        opt = next((o for o in qobj.possibleAnswers if o.key == val), None)
                        opts.append(opt if opt else AnswerOption(key=val,
                                    translations=[Translation(language="en", text=val)]))
                else:
                    val = str(answer_val)
                    opt = next((o for o in qobj.possibleAnswers if o.key == val), None)
                    opts = [opt if opt else AnswerOption(key=val,
                                translations=[Translation(language="en", text=val)])]

                entry_kwargs["answerKey"] = opts
                entry_kwargs["comment"] = comment
                log.feedback.append(FeedbackEntry(**entry_kwargs))


            log.updatedAt = timezone.now()
            log.save()

        else:
            # Health-status feedback (similar pattern)
            for qkey, answer_val in answers.items():
                qobj = FeedbackQuestion.objects.filter(
                    questionKey=qkey, questionSubject="Healthstatus"
                ).first()
                if not qobj:
                    continue

                if isinstance(answer_val, dict):
                    text_ans = answer_val.get("transcription", "").strip()
                    notes = f"Audio saved at {answer_val.get('file_path')}"
                elif isinstance(answer_val, list):
                    text_ans = answer_val[0].strip() if answer_val else ""
                    notes = ""
                else:
                    text_ans = str(answer_val).strip()
                    notes = ""

                # Prevent accidental saving of stringified lists
                if text_ans.startswith("[") and text_ans.endswith("]"):
                    try:
                        text_ans = json.loads(text_ans)[0]
                    except Exception:
                        text_ans = text_ans.strip("[]").strip("'").strip('"')

                # Find matching answer option to reuse translations
                opt_match = next((opt for opt in qobj.possibleAnswers if opt.key == text_ans), None)

                if opt_match:
                    translations = opt_match.translations
                else:
                    translations = [Translation(language="en", text=text_ans)]

                entry = FeedbackEntry(
                    questionId=qobj,
                    answerKey=[
                        AnswerOption(
                            key=text_ans,
                            translations=translations
                        )
                    ],
                    comment=notes,
                )

                rating = PatientICFRating(
                    questionId=qobj,
                    patientId=patient,
                    icfCode=qobj.icfCode,
                    rating=int(text_ans) if text_ans.isdigit() else None,
                    notes=notes,
                    feedback_entries=[entry],
                )

                rating.save()


        return JsonResponse({"message": "Feedback submitted successfully"}, status=201)

    except Exception as e:
        logger.exception("Unexpected error in submit_patient_feedback")
        return JsonResponse({"error": str(e)}, status=500)





@csrf_exempt
@permission_classes([IsAuthenticated])
def add_intervention_to_patient_1(request):
    """
    POST /api/interventions/add-to-patient/
    Assigns an intervention to a single patient.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
        patient_id = data.get("patient_id")
        intervention_id = data.get("intervention_id")

        if not patient_id or not intervention_id:
            return JsonResponse(
                {"error": "Missing patient_id or intervention_id"}, status=400
            )

        patient = Patient.objects.get(userId=ObjectId(patient_id))
        intervention = Intervention.objects.get(pk=intervention_id)

        # Create the relation if it doesn't exist already
        patient_intervention, created = PatientInterventionLogs.get_or_create(
            patient, intervention
        )

        if created:
            return JsonResponse(
                {"message": "Intervention successfully assigned"}, status=201
            )
        else:
            return JsonResponse(
                {"error": "Intervention is already assigned to the patient"}, status=400
            )

    except Patient.DoesNotExist:
        logger.warning(f"[add_intervention_to_patient] Entity not found")
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Intervention.DoesNotExist:
        logger.warning(f"[add_intervention_to_patient] Entity not found")
        return JsonResponse({"error": "Intervention not found"}, status=404)
    except Exception as e:
        logger.error(
            f"[add_intervention_to_patient] Unexpected error: {str(e)}", exc_info=True
        )
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def mark_intervention_completed(request):
    """
    POST /api/interventions/complete/
    Body: { patient_id, intervention_id, date?: 'YYYY-MM-DD' }  # 'date' optional; defaults to today
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
        patient_id = data.get("patient_id")
        intervention_id = data.get("intervention_id")
        target_date_str = data.get("date")  # optional

        if not patient_id or not intervention_id:
          return JsonResponse({"error": "Missing patient_id or intervention_id"}, status=400)

        patient = Patient.objects.get(userId=ObjectId(patient_id))
        intervention = Intervention.objects.get(pk=ObjectId(intervention_id))
        rehab_plan = RehabilitationPlan.objects(patientId=patient).first()
        if not rehab_plan:
          return JsonResponse({"error": "Rehabilitation plan not found for this patient"}, status=404)

        # Determine target day (timezone-aware start/end of day)
        tz_now = timezone.localtime(timezone.now())
        if target_date_str:
            # YYYY-MM-DD
            y, m, d = [int(x) for x in target_date_str.split('-')]
            target = timezone.make_aware(datetime.datetime(y, m, d, 0, 0, 0), tz_now.tzinfo)
        else:
            target = tz_now.replace(hour=0, minute=0, second=0, microsecond=0)

        day_start = target
        day_end = target.replace(hour=23, minute=59, second=59, microsecond=999999)

        log = PatientInterventionLogs.objects(
            userId=patient,
            rehabilitationPlanId=rehab_plan,
            interventionId=intervention,
            date__gte=day_start,
            date__lte=day_end,
        ).first()

        if log:
            if "completed" in log.status:
                return JsonResponse({"message": "Already marked as completed"}, status=200)
            else:
                log.status.append("completed")
                log.updatedAt = timezone.now()
                log.save()
        else:
            log = PatientInterventionLogs(
                userId=patient,
                interventionId=intervention,
                rehabilitationPlanId=rehab_plan,
                date=timezone.now(),
                status=["completed"],
                feedback=[],
                comments="",
            )
            log.save()

        Logs(
            userId=patient.userId,
            action="OTHER",
            userAgent="Patient",
            details=f"Marked intervention {intervention.title} as done on {timezone.now().isoformat()}",
        ).save()

        return JsonResponse({"message": "Marked as completed successfully"}, status=200)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Intervention.DoesNotExist:
        return JsonResponse({"error": "Intervention not found"}, status=404)
    except Exception as e:
        logger.error("[mark_intervention_completed] Unexpected error: %s", str(e), exc_info=True)
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def unmark_intervention_completed(request):
    """
    POST /api/interventions/uncomplete/
    Body: { patient_id, intervention_id, date: 'YYYY-MM-DD' }  # date required for safety
    Removes 'completed' status for the specified calendar day.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
        patient_id = data.get("patient_id")
        intervention_id = data.get("intervention_id")
        target_date_str = data.get("date")

        if not patient_id or not intervention_id or not target_date_str:
            return JsonResponse({"error": "Missing required fields (patient_id, intervention_id, date)"}, status=400)

        patient = Patient.objects.get(userId=ObjectId(patient_id))
        intervention = Intervention.objects.get(pk=ObjectId(intervention_id))
        rehab_plan = RehabilitationPlan.objects(patientId=patient).first()
        if not rehab_plan:
            return JsonResponse({"error": "Rehabilitation plan not found for this patient"}, status=404)

        tz_now = timezone.localtime(timezone.now())
        y, m, d = [int(x) for x in target_date_str.split('-')]
        target = timezone.make_aware(datetime.datetime(y, m, d, 0, 0, 0), tz_now.tzinfo)
        day_start = target
        day_end = target.replace(hour=23, minute=59, second=59, microsecond=999999)

        log = PatientInterventionLogs.objects(
            userId=patient,
            rehabilitationPlanId=rehab_plan,
            interventionId=intervention,
            date__gte=day_start,
            date__lte=day_end,
        ).first()

        if not log:
            # idempotent “ok”
            return JsonResponse({"message": "No completion log for this day"}, status=200)

        if "completed" in log.status:
            log.status = [s for s in log.status if s != "completed"]
            log.updatedAt = timezone.now()

            # If there’s nothing meaningful left, you may choose to delete the log
            if not log.status and not log.feedback:
                log.delete()
            else:
                log.save()

        Logs(
            userId=patient.userId,
            action="OTHER",
            userAgent="Patient",
            details=f"Unmarked intervention {intervention.title} as done on {timezone.now().isoformat()}",
        ).save()

        return JsonResponse({"message": "Unmarked successfully"}, status=200)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Intervention.DoesNotExist:
        return JsonResponse({"error": "Intervention not found"}, status=404)
    except Exception as e:
        logger.error("[unmark_intervention_completed] Unexpected error: %s", str(e), exc_info=True)
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)



@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_recommendations(request, patient_id):
    """
    GET /api/patients/<patient_id>/recommendations/
    Fetches today's assigned interventions for a patient.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        recommendations = PatientIntervention.get_todays_recommendations(patient_id)
        return JsonResponse(
            {"recommendations": recommendations}, safe=False, status=200
        )

    except Exception as e:
        logger.error(
            f"[get_patient_recommendations] Unexpected error: {str(e)}", exc_info=True
        )
        return JsonResponse(
            {"error": "Internal server error", "details": str(e)}, status=500
        )


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_plan(request, patient_id):
    """
    GET /api/patients/rehabilitation-plan/patient/<patient_id>/
    Fetches rehabilitation plan and today's feedback for the patient.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        patient = Patient.objects.get(userId=ObjectId(patient_id))
        rehab_plan = RehabilitationPlan.objects(patientId=patient).first()

        if not rehab_plan:
            return JsonResponse(
                {"rehab_plan": [], "message": "No rehabilitation plan found"},
                status=200,
            )

        today = timezone.now().date()
        today_interventions = []

        for assignment in rehab_plan.interventions:
            intervention = assignment.interventionId

            logs = PatientInterventionLogs.objects(
                userId=patient,
                rehabilitationPlanId=rehab_plan,
                interventionId=intervention,
            )

            completion_dates = [
                log.date.isoformat() for log in logs if "completed" in log.status
            ]

            feedback_data = []
            for log in logs:
                if log.date.date() != today:
                    continue

                for fb in log.feedback:
                    if not fb.questionId:
                        continue

                    question_translations = [
                        {"language": t.language, "text": t.text}
                        for t in fb.questionId.translations
                    ]

                    answer_output = []
                    answer_keys = fb.answerKey if isinstance(fb.answerKey, list) else [fb.answerKey]

                    for key in answer_keys:
                        matched_option = next(
                            (opt for opt in fb.questionId.possibleAnswers if opt.key == key),
                            None,
                        )
                        if matched_option:
                            answer_output.append(
                                {
                                    "key": matched_option.key,
                                    "translations": [
                                        {"language": t.language, "text": t.text}
                                        for t in matched_option.translations
                                    ],
                                }
                            )

                    feedback_data.append(
                        {
                            "date": log.date.isoformat(),
                            "question": {
                                "id": str(fb.questionId.id),
                                "translations": question_translations,
                            },
                            "answer": answer_output,
                            "comment": fb.comment or "",
                        }
                    )

            intervention_record = {
                "intervention_id": str(intervention.id),
                "intervention_title": intervention.title,
                "description": intervention.description,
                "frequency": assignment.frequency,
                "notes": assignment.notes or "",  # ← NEW: therapist’s personal instruction for the patient
                "dates": [d.isoformat() for d in assignment.dates],
                "completion_dates": completion_dates,
                "content_type": intervention.content_type,
                "benefitFor": intervention.benefitFor,
                "tags": intervention.tags,
                "duration": intervention.duration,
                "feedback": feedback_data,
                "preview_img": (
                    f"{settings.MEDIA_HOST}{os.path.join(settings.MEDIA_URL, intervention.preview_img)}"
                    if intervention.preview_img
                    else ""
                ),
            }

            if intervention.link:
                intervention_record["link"] = intervention.link
            elif intervention.media_file:
                intervention_record["media_file"] = (
                    f"{settings.MEDIA_HOST}{os.path.join(settings.MEDIA_URL, intervention.media_file)}"
                )

            today_interventions.append(intervention_record)

        return JsonResponse(today_interventions, safe=False, status=200)

    except Patient.DoesNotExist:
        logger.warning(f"[get_patient_plan] Entity not found")
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Exception as e:
        logger.error(
            f"[get_patient_plan] Error for patient {patient_id}: {str(e)}",
            exc_info=True,
        )
        return JsonResponse(
            {"error": "Internal Server Error", "details": str(e)}, status=500
        )





@csrf_exempt
@permission_classes([IsAuthenticated])
def create_patient_intervention_log(request):
    """
    POST /api/patients/intervention-log/
    Creates a patient intervention log entry.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
        patient = Patient.objects.get(id=ObjectId(data.get("patientId")))
        intervention = Intervention.objects.get(id=ObjectId(data.get("interventionId")))

        log = PatientInterventionLogs(
            userId=patient,
            interventionId=intervention,
            rehabilitationPlanId=rehab_plan,  
            date=timezone.now(),
            status=['completed'],
            feedback=[],
            comments="",
        )

        log.save()

        return JsonResponse(
            {"message": "Patient Intervention Log created successfully"}, status=201
        )

    except (Patient.DoesNotExist, Intervention.DoesNotExist) as e:
        logger.warning(f"[create_patient_intervention_log] Entity not found: {e}")
        return JsonResponse({"error": str(e)}, status=404)

    except Exception as e:
        logger.error(
            f"[create_patient_intervention_log] Unexpected error: {str(e)}",
            exc_info=True,
        )
        return JsonResponse({"error": "Internal Server Error"}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_feedback_questions(request, questionaire_type, patient_id, intervention_id=None):
    """
    GET /api/patients/get-questions/<questionaire_type>/<patient_id>/
        ?interventionId=<id>

    Returns feedback questions. For "Intervention", if the assignment has
    require_video_feedback=True, appends a video request question.
    """
    logger = logging.getLogger(__name__)

    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    # allow intervention id via query string too
    intervention_id = intervention_id or request.GET.get("interventionId")

    # Resolve patient by userId first, then by Patient._id
    try:
        oid = ObjectId(patient_id)
    except Exception:
        return JsonResponse({"error": "Invalid patient id"}, status=400)

    patient = None
    try:
        patient = Patient.objects.get(userId=oid)
    except Patient.DoesNotExist:
        try:
            patient = Patient.objects.get(pk=oid)
        except Patient.DoesNotExist:
            logger.warning("[get_feedback_questions] Patient not found: %s", patient_id)
            return JsonResponse({"error": "Patient not found."}, status=404)

    # -------------------- HEALTHSTATUS --------------------
    if questionaire_type == "Healthstatus":
        now = timezone.now()

        # 1) Skip if there was any Healthstatus feedback in last 7 days
        seven_days_ago = now - timedelta(days=7)
        recent = (
            PatientICFRating.objects(
                patientId=patient,
                date__gte=seven_days_ago,
                feedback_entries__exists=True,
                feedback_entries__ne=[],
            )
            .only("id")
            .first()
        )
        if recent:
            return JsonResponse({"questions": []})

        # 2) Every ~14 days ask the full "16_profile_*" block
        fourteen_days_ago = now - timedelta(days=14)

        profile_q_ids = [q.id for q in FeedbackQuestion.objects(
            questionKey__startswith="16_profile_"
        ).only("id")]

        profile_recent = (
            PatientICFRating.objects(
                patientId=patient,
                date__gte=fourteen_days_ago,
                feedback_entries__exists=True,
                feedback_entries__ne=[],
                # any entry whose inner questionId is one of the profile block:
                **{"feedback_entries__questionId__in": profile_q_ids}
            )
            .only("id")
            .first()
        )

        if not profile_recent:
            questions_qs = FeedbackQuestion.objects(
                questionSubject="Healthstatus",
                questionKey__startswith="16_profile_",
            )
            serialized = [
                {
                    "questionKey": q.questionKey,
                    "answerType": q.answer_type,
                    "translations": [
                        {"language": tr.language, "text": tr.text}
                        for tr in q.translations
                    ],
                    "possibleAnswers": [
                        {
                            "key": opt.key,
                            "translations": [
                                {"language": t2.language, "text": t2.text}
                                for t2 in opt.translations
                            ],
                        }
                        for opt in (q.possibleAnswers or [])
                    ],
                }
                for q in questions_qs
            ]
            return JsonResponse({"questions": serialized})

        # 3) Otherwise weekly department-specific selection
        department = (patient.function or [""])[0].strip().lower()

        if department == "cardiology":
            questions_qs = FeedbackQuestion.objects(
                questionSubject="Healthstatus",
                questionKey__startswith="10_heart_failure",
            )
        elif department == "orthopaedics":
            pool = list(
                FeedbackQuestion.objects(
                    questionSubject="Healthstatus",
                    questionKey__startswith="mobility_bank_",
                )
            )
            questions_qs = random.sample(pool, min(6, len(pool)))
        else:
            pool = list(
                FeedbackQuestion.objects(
                    questionSubject="Healthstatus",
                    questionKey__regex=r"^(fatigue|physical_function)_",
                )
            )
            questions_qs = random.sample(pool, min(6, len(pool)))

        serialized = [
            {
                "questionKey": q.questionKey,
                "answerType": q.answer_type,
                "translations": [
                    {"language": tr.language, "text": tr.text}
                    for tr in q.translations
                ],
                "possibleAnswers": [
                    {
                        "key": opt.key,
                        "translations": [
                            {"language": t2.language, "text": t2.text}
                            for t2 in opt.translations
                        ],
                    }
                    for opt in (q.possibleAnswers or [])
                ],
            }
            for q in questions_qs
        ]
        return JsonResponse({"questions": serialized})

    # -------------------- INTERVENTION --------------------
    elif questionaire_type == "Intervention":
        # Base intervention questions
        questions_qs = FeedbackQuestion.objects(questionSubject="Intervention")
        serialized = [
            {
                "questionKey": q.questionKey,
                "answerType": q.answer_type,
                "translations": [
                    {"language": tr.language, "text": tr.text}
                    for tr in q.translations
                ],
                "possibleAnswers": [
                    {
                        "key": opt.key,
                        "translations": [
                            {"language": t2.language, "text": t2.text}
                            for t2 in opt.translations
                        ],
                    }
                    for opt in (q.possibleAnswers or [])
                ],
            }
            for q in questions_qs
        ]

        # If we know which intervention this is for, check the plan flag
        if intervention_id:
            plan = RehabilitationPlan.objects(patientId=patient).first()
            if plan:
                # interventionId is a ReferenceField; compare by its ObjectId
                assignment = next(
                    (
                        a
                        for a in (plan.interventions or [])
                        if str(getattr(a.interventionId, "id", a.interventionId)) == str(intervention_id)
                    ),
                    None,
                )
                if assignment and getattr(assignment, "require_video_feedback", False):
                    serialized.append(
                        {
                            "questionKey": "video_example",
                            "answerType": "video",
                            "translations": [
                                {
                                    "language": "en",
                                    "text": "Your therapist requested a video. Recording will start after a 10 s delay—please position your camera.",
                                },
                                {
                                    "language": "it",
                                    "text": "Il tuo terapista ha richiesto un video. La registrazione inizierà dopo 10 s di attesa—posiziona la fotocamera.",
                                },
                                {
                                    "language": "de",
                                    "text": "Ihr Therapeut hat ein Video angefordert. Die Aufnahme startet nach 10 s Verzögerung—bitte richten Sie die Kamera aus.",
                                },
                                {
                                    "language": "fr",
                                    "text": "Votre thérapeute a demandé une vidéo. L’enregistrement commencera après un délai de 10 s—veuillez placer votre caméra.",
                                },
                            ],
                            "possibleAnswers": [],
                        }
                    )

        return JsonResponse({"questions": serialized})

    else:
        return JsonResponse({"error": "Invalid questionnaire type."}, status=400)




def _as_oid(val):
    try:
        return ObjectId(val) if isinstance(val, str) and len(val) == 24 else val
    except Exception:
        return val

def _normalize_intervention_id(raw):
    """
    Accept "682ad3..." or {"_id":"682ad3..."} or {"id":"682ad3..."} -> hex string
    """
    if isinstance(raw, dict):
        raw = raw.get("_id") or raw.get("id")
    if not isinstance(raw, str) or len(raw) != 24:
        return None
    return raw

# --- helpers (replace the previous versions) ---

def _to_iso(dt_or_str):
    """Return ISO string for datetime/str/None (keeps 'Z' if provided)."""
    if isinstance(dt_or_str, dt.datetime):
        return dt_or_str.isoformat()
    if isinstance(dt_or_str, str):
        return dt_or_str
    return None

def _parse_iso_maybe(iso):
    """Parse ISO -> datetime (best-effort)."""
    if not iso or not isinstance(iso, str):
        return None
    try:
        s = iso.replace('Z', '+00:00') if iso.endswith('Z') else iso
        return dt.datetime.fromisoformat(s)
    except Exception:
        return None

def _status_for(dt_iso):
    """Guess status for a date (used only if none provided)."""
    d = _parse_iso_maybe(dt_iso)
    now = timezone.now()
    try:
        # align tz-awareness for comparison
        if d is None:
            return "upcoming"
        if timezone.is_aware(now) and (d.tzinfo is None):
            d = timezone.make_aware(d, timezone=timezone.utc)
        if timezone.is_naive(now) and (d.tzinfo is not None):
            now = now.astimezone(timezone.utc).replace(tzinfo=None)
        return "upcoming" if d > now else "missed"
    except Exception:
        return "upcoming"

def _normalize_dates_list(seq):
    """
    Normalize a sequence of dates into a list of dicts:
    { "datetime": ISO, "status": "...", "feedback": [...] }
    Handles:
      - dict entries with 'datetime' as str or datetime
      - bare datetime objects
      - bare ISO strings
    """
    out = []
    for x in (seq or []):
        if isinstance(x, dict):
            iso = _to_iso(x.get("datetime"))
            if not iso:
                continue
            status = x.get("status") or _status_for(iso)
            fb = x.get("feedback", [])
            nx = {**x, "datetime": iso, "status": status, "feedback": fb}
            out.append(nx)

        elif isinstance(x, (dt.datetime, str)):
            iso = _to_iso(x)
            status = _status_for(iso)
            out.append({"datetime": iso, "status": status, "feedback": []})

        else:
            # unknown type -> ignore
            continue

    # sort by datetime asc (robust to bad values)
    try:
        out.sort(key=lambda d: _to_iso(d.get("datetime")) or "")
    except Exception:
        pass
    return out


def _coerce_object_id(maybe):
    """Accept string or dict {'_id'| 'id' | 'pk': '...'} and return ObjectId."""
    if isinstance(maybe, dict):
        maybe = maybe.get("_id") or maybe.get("id") or maybe.get("pk")
    if not maybe:
        return None
    return ObjectId(str(maybe))

def _strip_to_datetimes(seq):
    """Map a list of mixed items to a list[datetime], dropping unparseable ones."""
    out = []
    for x in (seq or []):
        d = _as_datetime(x)
        if d:
            out.append(d)
    return out

def _as_datetime(value):
    """
    Accepts datetime/date/ISO string/dict {'datetime': ...}
    Returns tz-aware UTC datetime (seconds precision).
    """
    # unwrap dicts like {'datetime': '...'}
    if isinstance(value, dict):
        value = value.get("datetime") or value.get("date") or value.get("dt") or value

    # parse strings
    if isinstance(value, str):
        s = value.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"          # make fromisoformat() accept Zulu
        try:
            dtobj = dt.datetime.fromisoformat(s)
        except ValueError:
            # try date-only
            try:
                d = dt.datetime.strptime(s, "%Y-%m-%d").date()
                dtobj = dt.datetime(d.year, d.month, d.day)
            except Exception as ex:
                raise ValueError(f"Unsupported datetime format: {value!r}") from ex

    elif isinstance(value, dt.datetime):
        dtobj = value

    elif isinstance(value, dt.date):
        dtobj = dt.datetime(value.year, value.month, value.day)

    else:
        raise TypeError(f"Unsupported datetime value: {type(value).__name__}")

    # force aware-UTC
    if dtobj.tzinfo is None:
        dtobj = timezone.make_aware(dtobj, dt.timezone.utc)
    else:
        dtobj = dtobj.astimezone(dt.timezone.utc)

    return dtobj.replace(microsecond=0, tzinfo=dt.timezone.utc)


def _merge_dates(existing, incoming, *, return_naive_for_storage=True):
    """
    Merge two date lists. Deduplicate by exact UTC second.
    Sort chronologically.
    Returns (merged_list, added_count).

    existing/incoming may contain datetime/date/str/dict{'datetime':...}.
    """
    # normalize both sides to aware UTC
    ex = [_as_datetime(d) for d in (existing or [])]
    inc = [_as_datetime(d) for d in (incoming or [])]

    # dedupe while preserving all unique values
    seen = set(ex)
    merged = list(ex)
    added = 0
    for n in inc:
        if n not in seen:
            merged.append(n)
            seen.add(n)
            added += 1

    merged.sort()  # safe: all are aware-UTC

    # MongoEngine commonly stores naive UTC; strip tz if you need that
    if return_naive_for_storage:
        merged = [d.replace(tzinfo=None) for d in merged]

    return merged, added


@csrf_exempt
@permission_classes([IsAuthenticated])
def add_intervention_to_patient(request):
    """
    POST /api/interventions/add-to-patient/
    Adds an intervention schedule to a patient's plan.
    - Accepts interventions[].dates in any of these shapes emitted by the FE/generator:
        * list[datetime]
        * list[iso-string]
        * list[{'datetime': <iso|datetime>, 'status': ..., 'feedback': ...}]
      but stores ONLY datetime values, matching the MongoEngine schema.
    - If the intervention already exists on the plan, new (future) dates are merged in.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body or "{}")

        therapist = Therapist.objects.get(userId=data.get("therapistId"))
        patient   = Patient.objects.get(pk=data.get("patientId"))
        items     = data.get("interventions", []) or []

        if not items:
            return JsonResponse({"error": "No interventions provided."}, status=400)

        # Load or create the patient's plan
        plan = RehabilitationPlan.objects(patientId=patient).first()

        if not plan:
            plan = RehabilitationPlan(
                patientId=patient,
                therapistId=therapist,
                startDate=patient.userId.createdAt,
                endDate=patient.reha_end_date,
                status=data.get("status", "active"),
                interventions=[],
                createdAt=timezone.now(),
                updatedAt=timezone.now(),
            )

        total_added = 0
        created_assignments = 0

        for item in items:
            # Accept interventionId as string or dict
            int_oid = _coerce_object_id(item.get("interventionId"))
            if not int_oid:
                return JsonResponse({"error": "Invalid interventionId."}, status=400)

            intervention = Intervention.objects.get(id=int_oid)

            # The generator typically returns dates; if you compute here instead,
            # replace the next line with your generator call.
            # Example if you have a helper:
            # generated = generate_repeat_dates(patient.reha_end_date, item)
            generated = item.get("dates") or []  # allow direct dates (optional)
            # In your current flow, you don't send "dates"; you send a schedule.
            # generate on the server if needed:
            if not generated:
                generated = generate_repeat_dates(patient.reha_end_date, item)

            new_dates = _strip_to_datetimes(generated)

            # Require at least one date
            if not new_dates:
                logger.info("No valid dates generated for intervention %s", str(int_oid))
                # Keep going; nothing to add for this one.
                continue

            # Merge into existing assignment if present
            existing = None
            for a in (plan.interventions or []):
                if str(a.interventionId.id) == str(intervention.id):
                    existing = a
                    break

            require_video = bool(item.get("require_video_feedback", False))
            note_in = (item.get("notes") or "").strip()[:1000]  # simple length cap

            if existing:
                merged, added = _merge_dates(existing.dates, new_dates)
                if added > 0:
                    existing.dates = merged
                    existing.require_video_feedback = require_video
                    if "notes" in item:
                        existing.notes = note_in
                    total_added += added
                # else nothing new for this intervention
            else:
                assignment = InterventionAssignment(
                    interventionId=intervention,
                    frequency=item.get("frequency", ""),
                    dates=new_dates, 
                    notes=note_in,                       # <-- pure datetimes
                    require_video_feedback=require_video,
                )
                plan.interventions.append(assignment)
                created_assignments += 1
                total_added += len(new_dates)

        if created_assignments == 0 and total_added == 0:
            # Nothing changed at all
            return JsonResponse(
                {"message": "No new sessions to add for the selected intervention(s)."},
                status=200,
            )

        plan.updatedAt = timezone.now()
        plan.save()

        msg_parts = []
        if created_assignments:
            msg_parts.append(f"created {created_assignments} assignment(s)")
        if total_added:
            msg_parts.append(f"added {total_added} session(s)")
        return JsonResponse({"message": "Successfully " + " and ".join(msg_parts) + "."}, status=201)

    except (Therapist.DoesNotExist, Patient.DoesNotExist, Intervention.DoesNotExist) as e:
        logger.warning(f"[add_intervention_to_patient] Missing entity: {e}")
        return JsonResponse({"error": str(e)}, status=404)

    except Exception as e:
        logger.error("[add_intervention_to_patient] Unexpected error", exc_info=True)
        return JsonResponse({"error": "Internal Server Error"}, status=500)


# Map your weekday short labels to Python weekday numbers (Mon=0..Sun=6)
WEEKDAY_MAP = {'Mon':0, 'Dien':1, 'Mitt':2, 'Don':3, 'Fre':4, 'Sam':5, 'Son':6}

def _tz_local():
    return timezone.get_current_timezone()

def _as_aware_local(d: datetime.datetime) -> datetime.datetime:
    """Return tz-aware datetime in local tz."""
    if timezone.is_naive(d):
        return timezone.make_aware(d, _tz_local())
    return d.astimezone(_tz_local())

def _as_aware_utc(d: datetime.datetime) -> datetime.datetime:
    """Return tz-aware datetime in UTC (uses datetime.timezone.utc)."""
    if timezone.is_naive(d):
        return timezone.make_aware(d, datetime.timezone.utc)
    return d.astimezone(datetime.timezone.utc)

def _parse_iso(s: str) -> datetime.datetime:
    """
    Accepts 'YYYY-MM-DD' or full ISO, with/without 'Z' or offset.
    Returns local tz-aware datetime.
    """
    s = (s or "").strip()
    if not s:
        return _as_aware_local(timezone.now())

    if len(s) == 10:
        d = datetime.date.fromisoformat(s)
        naive = datetime.datetime.combine(d, datetime.time.min)
        return _as_aware_local(naive)

    s = s.replace("Z", "+00:00")
    dt = datetime.datetime.fromisoformat(s)
    if timezone.is_naive(dt):
        return _as_aware_local(dt)
    return dt.astimezone(_tz_local())

def _ceil_to_day(dt: datetime.datetime) -> datetime.datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)

# English + German short labels
WEEKDAY_MAP = {
    "Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6,
    "M": 0, "T": 1, "W": 2, "Th": 3, "F": 4, "Sa": 5, "Su": 6,
    "Di": 1, "Mi": 2, "Do": 3, "Fr": 4, "Sa": 5, "So": 6,
}

def _advance_month(dt: datetime.datetime, n: int = 1) -> datetime.datetime:
    y, m = dt.year, dt.month + n
    while m > 12:
        y += 1
        m -= 12
    days_in_month = [31, 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28,
                     31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    day = min(dt.day, days_in_month)
    return dt.replace(year=y, month=m, day=day)


# -----------------------------
# Generator
# -----------------------------

def _generate_dates_from(
    schedule: dict,
    effective_from: datetime.datetime,
    plan_end: datetime.datetime,
    max_count: int = 1000
):
    """
    schedule = {
      'interval': int,
      'unit': 'day'|'week'|'month',
      'startDate': ISO string,
      'startTime': 'HH:mm',
      'selectedDays': ['Mon','Fre',...],   # for week
      'end': {'type':'never'|'date'|'count','date': ISO|null, 'count': int|null}
    }
    Returns list[datetime.datetime] (aware, LOCAL TZ).
    """
    interval = int(schedule.get('interval', 1))
    unit = schedule.get('unit', 'week')
    selected_days = schedule.get('selectedDays') or []
    start_iso = schedule.get('startDate')
    start_time = (schedule.get('startTime') or '08:00').strip()
    end_cfg = schedule.get('end') or {'type': 'never', 'date': None, 'count': None}

    base_start = _parse_iso(start_iso) if start_iso else _as_aware_local(timezone.now())
    hh, mm = (int(x) for x in (start_time or '08:00').split(':'))
    base_start = base_start.replace(hour=hh, minute=mm, second=0, microsecond=0)

    effective_from = _as_aware_local(effective_from)
    plan_end = _as_aware_local(plan_end)

    cursor = max(base_start, effective_from)

    hard_stop = plan_end
    if (end_cfg.get('type') == 'date') and end_cfg.get('date'):
        hard_stop = min(hard_stop, _parse_iso(str(end_cfg['date'])))

    out = []

    if unit == 'day':
        while cursor <= hard_stop:
            out.append(cursor)
            if end_cfg.get('type') == 'count' and len(out) >= int(end_cfg.get('count') or 0):
                break
            cursor = cursor + datetime.timedelta(days=interval)

    elif unit == 'week':
        cursor_day = _ceil_to_day(cursor)
        count = 0
        while cursor_day <= hard_stop and count < max_count:
            for label in selected_days:
                wd = WEEKDAY_MAP.get(label, None)
                if wd is None:
                    continue
                candidate = cursor_day + datetime.timedelta(days=(wd - cursor_day.weekday()) % 7)
                candidate = candidate.replace(hour=hh, minute=mm, second=0, microsecond=0)
                if candidate >= cursor and candidate <= hard_stop:
                    out.append(candidate)
                    if end_cfg.get('type') == 'count' and len(out) >= int(end_cfg.get('count') or 0):
                        return out
            cursor_day = cursor_day + datetime.timedelta(weeks=interval)
            count += 1

    elif unit == 'month':
        cur = cursor
        while cur <= hard_stop:
            out.append(cur)
            if end_cfg.get('type') == 'count' and len(out) >= int(end_cfg.get('count') or 0):
                break
            cur = _advance_month(cur, interval).replace(hour=hh, minute=mm, second=0, microsecond=0)

    return out


# -----------------------------
# Modify endpoint
# -----------------------------

@csrf_exempt
@permission_classes([IsAuthenticated])
def modify_intervention_from_date(request):
    """
    POST /api/interventions/modify-patient/
    Body:
    {
      therapistId, patientId, interventionId,
      effectiveFrom: 'YYYY-MM-DD' | ISO,
      require_video_feedback: bool,
      keep_current: bool?,                 # if true, only update flags
      schedule: { ... }                    # required if keep_current is not true
    }
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        body = json.loads(request.body or "{}")
        patient_id = body.get("patientId")
        intervention_id = body.get("interventionId")
        effective_from_raw = body.get("effectiveFrom")
        keep_current = bool(body.get("keep_current", False))
        require_video = bool(body.get("require_video_feedback", False))
        schedule = body.get("schedule")
        notes = body.get("notes", None)

        if not (patient_id and intervention_id and effective_from_raw):
            return JsonResponse({"error": "Missing required fields"}, status=400)

        # Patient / Plan
        if isinstance(patient_id, str) and len(patient_id) == 24:
            patient = Patient.objects.get(pk=ObjectId(patient_id))
        else:
            patient = Patient.objects.get(userId=ObjectId(patient_id))

        plan = RehabilitationPlan.objects(patientId=patient).first()
        if not plan:
            return JsonResponse({"error": "Rehabilitation plan not found."}, status=404)

        # Find assignment
        target = next((a for a in plan.interventions
                       if str(a.interventionId.id) == str(intervention_id)), None)
        if not target:
            return JsonResponse({"error": "Intervention assignment not found."}, status=404)

        # Always update flags
        target.require_video_feedback = require_video
        if notes is not None:
            target.notes = (notes or "").strip()[:1000]

        # Normalize effectiveFrom
        eff_dt_local = _parse_iso(str(effective_from_raw))                 # aware local
        eff_dt_utc = eff_dt_local.astimezone(datetime.timezone.utc)        # aware UTC

        # Plan end fallback
        plan_end = plan.endDate or (timezone.now() + datetime.timedelta(days=365))
        plan_end_local = _as_aware_local(plan_end)

        # Split existing using UTC
        existing_utc = [_as_aware_utc(d) for d in (target.dates or [])]
        past_utc = [d for d in existing_utc if d < eff_dt_utc]
        future_utc = [d for d in existing_utc if d >= eff_dt_utc]  # kept when keep_current=True

        if not keep_current:
            if not schedule:
                return JsonResponse({"error": "schedule required when keep_current is false"}, status=400)

            # Generate from local, store as UTC
            new_local = _generate_dates_from(schedule, eff_dt_local, plan_end_local)
            new_utc = [dt.astimezone(datetime.timezone.utc) for dt in new_local]

            target.dates = past_utc + new_utc
        else:
            target.dates = past_utc + future_utc

        plan.updatedAt = timezone.now()
        plan.save()

        return JsonResponse({"message": "Updated", "updatedCount": len(target.dates)}, status=200)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found."}, status=404)
    except Exception as e:
        import logging
        logging.exception("modify_intervention_from_date failed")
        return JsonResponse({"error": str(e)}, status=500)




@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_plan_for_therapist(request, patient_id):
    """
    GET /api/patients/rehabilitation-plan/therapist/<patient_id>/
    Retrieves a structured rehabilitation plan for therapist overview.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        patient = Patient.objects.get(id=ObjectId(patient_id))
        plan = RehabilitationPlan.objects.get(patientId=patient)

        today = timezone.now().date()
        plan_data = {
            "startDate": plan.startDate.isoformat(),
            "endDate": plan.endDate.isoformat(),
            "status": plan.status,
            "createdAt": plan.createdAt.isoformat(),
            "updatedAt": plan.updatedAt.isoformat(),
            "interventions": [],
        }

        for assignment in plan.interventions:
            intervention = assignment.interventionId
            logs = PatientInterventionLogs.objects(
                userId=patient, interventionId=intervention
            )

            completed_dates = {
                log.date.date() for log in logs if "completed" in log.status
            }
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
                            "id": str(fb.questionId.id),
                            "translations": [
                                {"language": t.language, "text": t.text}
                                for t in fb.questionId.translations
                            ],
                        }

                        answer_data = [
                            {
                                "key": opt.key,
                                "translations": [
                                    {"language": tr.language, "text": tr.text}
                                    for tr in opt.translations
                                ],
                            }
                            for opt in fb.answerKey
                        ]

                        feedback_entries.append(
                            {
                                "question": question_data,
                                "comment": fb.comment,
                                'audio_url': fb.audio_url,
                                "answer": answer_data,
                            }
                        )

                        try:
                            rating_sum += int(fb.answerKey[0].key)
                            rating_count += 1
                        except (ValueError, TypeError, IndexError):
                            pass

                # Add video feedback if present on the log
                video_feedback = None
                if log and log.video_url:
                    normalized_url = urljoin(settings.MEDIA_HOST, log.video_url)
                    video_feedback = {
                        "video_url": normalized_url,
                        "video_expired": log.video_expired,
                        "comment": log.comments or "",
                    }

                intervention_dates.append(
                    {
                        "datetime": date.isoformat(),
                        "status": status,
                        "feedback": feedback_entries,
                        **({"video": video_feedback} if video_feedback else {}),
                    }
                )

            plan_data["interventions"].append(
                {
                    "_id": str(intervention.id),
                    "title": intervention.title,
                    "frequency": assignment.frequency,
                    "notes": assignment.notes,
                    "dates": intervention_dates,
                    "totalCount": len(assignment.dates),
                    "currentTotalCount": current_total_count,
                    "completedCount": completed_count,
                    "averageRating": (
                        round(rating_sum / rating_count, 1) if rating_count > 0 else 0
                    ),
                    "duration": getattr(intervention, "duration", 0),
                }
            )

        return JsonResponse(plan_data, safe=False)

    except Patient.DoesNotExist:
        logger.warning(
            f"[get_patient_plan_for_therapist] Patient not found: {patient_id}"
        )
        return JsonResponse({"error": "Patient not found"}, status=404)
    except RehabilitationPlan.DoesNotExist:
        logger.info(
            f"[get_patient_plan_for_therapist] No rehab plan for patient: {patient_id}"
        )
        return JsonResponse(
            {"message": "No rehabilitation plan found", "rehab_plan": []}, status=200
        )
    except Exception as e:
        logger.error(
            f"[get_patient_plan_for_therapist] Unexpected error: {str(e)}",
            exc_info=True,
        )
        return JsonResponse({"error": "Internal Server Error"}, status=500)



@csrf_exempt
@permission_classes([IsAuthenticated])
def remove_intervention_from_patient(request):
    """
    POST /api/interventions/remove-from-patient/
    Removes all future dates for a specific intervention from the patient's plan.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
        intervention_id = data.get("intervention")
        patient_id = data.get("patientId")

        if not intervention_id or not patient_id:
            return JsonResponse({"error": "Missing required parameters"}, status=400)

        patient = Patient.objects.get(id=ObjectId(patient_id))
        plan = RehabilitationPlan.objects.get(patientId=patient)
        now = timezone.now()

        for assignment in plan.interventions:
            if str(assignment.interventionId.pk) == str(intervention_id):
                # Keep only past or current dates
                assignment.dates = [
                    d for d in assignment.dates if ensure_aware(d) <= now
                ]

        # Remove interventions that no longer have any dates
        plan.interventions = [a for a in plan.interventions if a.dates]
        plan.updatedAt = timezone.now()
        plan.save()

        return JsonResponse(
            {"message": "Intervention dates removed successfully."}, status=200
        )

    except Patient.DoesNotExist:
        logger.warning(
            f"[remove_intervention_from_patient] Patient not found: {patient_id}"
        )
        return JsonResponse({"error": "Patient not found"}, status=404)
    except RehabilitationPlan.DoesNotExist:
        logger.warning(
            f"[remove_intervention_from_patient] Plan not found for patient: {patient_id}"
        )
        return JsonResponse({"error": "Rehabilitation plan not found"}, status=404)
    except Exception as e:
        logger.error(
            f"[remove_intervention_from_patient] Error removing intervention {intervention_id} from {patient_id}: {str(e)}",
            exc_info=True,
        )
        return JsonResponse({"error": "Internal Server Error"}, status=500)

@csrf_exempt
@permission_classes([IsAuthenticated])
def initial_patient_questionaire(request, patient_id):
    """
    GET /users/<patient_id>/initial-questionaire/
    Returns the initial questionnaire for a patient.

    POST /users/<patient_id>/initial-questionaire/
    Submits the initial questionnaire for a patient.
    """

    try:
        patient = Patient.objects.get(userId=ObjectId(patient_id))
        if request.method == "GET":
            
            if not all([
                patient.level_of_education,
                patient.professional_status,
                patient.marital_status,
                patient.lifestyle,
                patient.personal_goals
            ]):
                return JsonResponse({"data": True}, status=200)
            else:
                return JsonResponse({"data": False}, status=200)
        
        elif request.method == "POST":
            data = json.loads(request.body)
            level_of_education = data.get("level_of_education")
            professional_status = data.get("professional_status")
            marital_status = data.get("marital_status")
            lifestyle = data.get("lifestyle")
            personal_goals = data.get("personal_goals")

            if not all([level_of_education, professional_status, marital_status, lifestyle, personal_goals]):
                return JsonResponse({"error": "All fields are required."}, status=400)

            patient.level_of_education = level_of_education
            patient.professional_status = professional_status
            patient.marital_status = marital_status
            patient.lifestyle = lifestyle
            patient.personal_goals = personal_goals
            patient.save()

            return JsonResponse({"message": "Initial questionnaire submitted successfully."}, status=201)
        else:
            return JsonResponse({"error": "Method not allowed"}, status=405)
    except Patient.DoesNotExist:
        logger.warning(f"[initial_patient_questionaire] Patient not found: {patient_id}")
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Exception as e:
        logger.error(f"[initial_patient_questionaire] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({"error": "Internal Server Error"}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_patient_healthstatus_history(request, patient_id):
    """
    GET /api/patients/healthstatus-history/<patient_id>/
    Returns all non-intervention (Healthstatus) feedbacks over time.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        patient = Patient.objects.get(userId=ObjectId(patient_id))

        # Fetch all FeedbackQuestions of type "Healthstatus"
        questions = FeedbackQuestion.objects(questionSubject="Healthstatus")

        # Map questionId to metadata
        question_map = {
            str(q.id): {
                "questionKey": q.questionKey,
                "icfCode": q.icfCode,
                "answerType": q.answer_type,
                "translations": [
                    {"language": tr.language, "text": tr.text}
                    for tr in q.translations
                ],
                "answerMap": {
                    opt.key: [
                        {"language": tr.language, "text": tr.text}
                        for tr in opt.translations
                    ]
                    for opt in (q.possibleAnswers or [])
                },
            }
            for q in questions
        }

        # Fetch all PatientICFRating entries
        ratings = PatientICFRating.objects(patientId=patient).order_by("date")

        result = []

        for rating in ratings:
            for entry in rating.feedback_entries:
                qid = str(entry.questionId.id) if entry.questionId and hasattr(entry.questionId, 'id') else None
                if not qid or qid not in question_map:
                    continue


                qmeta = question_map[qid]
                result.append({
                    "questionKey": qmeta["questionKey"],
                    "icfCode": qmeta["icfCode"],
                    "date": rating.date.isoformat(),
                    "answers": [
                        {
                            "key": ans.key,
                            "translations": [
                                {"language": t.language, "text": t.text}
                                for t in ans.translations
                            ]
                        } for ans in entry.answerKey
                    ],
                    "comment": entry.comment,
                    "questionTranslations": qmeta["translations"],
                    "answerType": qmeta["answerType"],
                })

        return JsonResponse({"history": result}, safe=False)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)

    except Exception as e:
        logger.error(f"[get_patient_healthstatus_history] {str(e)}", exc_info=True)
        return JsonResponse({"error": "Internal Server Error"}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def get_combined_health_data(request, patient_id):
    try:
        if not patient_id or patient_id == "null":
            return JsonResponse({"error": "Invalid patient ID"}, status=400)

        try:
            patient = Patient.objects.get(pk=patient_id)
        except Exception:
            patient = Patient.objects.get(userId=ObjectId(patient_id))

        from_str = request.GET.get("from")
        to_str = request.GET.get("to")

        if from_str and to_str:
            from_date = datetime.datetime.strptime(from_str, '%Y-%m-%d')
            to_date = datetime.datetime.strptime(to_str, '%Y-%m-%d')
        else:
            to_date = timezone.now()
            from_date = to_date - datetime.timedelta(days=30)

        # Normalize to start and end of day
        from_datetime = datetime.datetime.combine(from_date.date(), datetime.time.min)
        to_datetime = datetime.datetime.combine(to_date.date(), datetime.time.max)


        # 1. Fitbit Data
        fitbit_entries = FitbitData.objects(
            user=patient.userId,
            date__gte=from_date,
            date__lte=to_date
        ).order_by("date")

        fitbit_data = []
        for entry in fitbit_entries:
            fitbit_data.append({
                "date": entry.date.strftime('%Y-%m-%d'),
                "steps": entry.steps,
                "resting_heart_rate": entry.resting_heart_rate,
                "floors": entry.floors,
                "distance": entry.distance,
                "calories": entry.calories,
                "active_minutes": entry.active_minutes,
                "heart_rate_zones": [
                    {
                        "name": zone.name,
                        "minutes": zone.minutes,
                        "caloriesOut": zone.caloriesOut,
                        "min": zone.min,
                        "max": zone.max
                    } for zone in (entry.heart_rate_zones or [])
                ],
                "sleep": {
                    "sleep_duration": entry.sleep.sleep_duration if entry.sleep else None,
                    "sleep_start": entry.sleep.sleep_start if entry.sleep else None,
                    "sleep_end": entry.sleep.sleep_end if entry.sleep else None,
                    "awakenings": entry.sleep.awakenings if entry.sleep else None
                },
                "breathing_rate": entry.breathing_rate,
                "hrv": entry.hrv,
                "exercise": entry.exercise
            })

        # 2. Healthstatus Feedback Data
        questions = FeedbackQuestion.objects(questionSubject="Healthstatus")
        question_map = {
            str(q.id): {
                "questionKey": q.questionKey,
                "icfCode": q.icfCode,
                "answerType": q.answer_type,
                "translations": [
                    {"language": tr.language, "text": tr.text}
                    for tr in q.translations
                ],
                "answerMap": {
                    opt.key: [
                        {"language": tr.language, "text": tr.text}
                        for tr in opt.translations
                    ]
                    for opt in (q.possibleAnswers or [])
                },
            }
            for q in questions
        }

        feedback_result = []
        print(f"Querying ratings for patient {patient.userId} from {from_date} to {to_date}")
        print("Available dates: %s", [r.date for r in PatientICFRating.objects(patientId=patient)])

        ratings = PatientICFRating.objects(
            patientId=patient,
            date__gte=from_date,
            date__lte=to_date
        ).order_by("date")
        print(f"DEBUG: Found {ratings.count()} ratings for patient {patient_id} from {from_date} to {to_date}")

        for rating in ratings:
            for entry in rating.feedback_entries:
                if not hasattr(entry, "questionId") or not entry.questionId:
                    continue
                try:
                    qid = str(entry.questionId.id)
                except Exception:
                    continue
                if qid not in question_map:
                    continue

                qmeta = question_map[qid]
                parsed_answers = []
                for ans in entry.answerKey:
                    parsed_answers.append({
                        "key": ans.key,
                        "translations": [
                            {"language": t.language, "text": t.text}
                            for t in ans.translations
                        ]
                    })

                feedback_result.append({
                    "questionKey": qmeta["questionKey"],
                    "icfCode": qmeta["icfCode"],
                    "date": rating.date.isoformat(),
                    "answers": parsed_answers,
                    "comment": entry.comment,
                    "questionTranslations": qmeta["translations"],
                    "answerType": qmeta["answerType"],
                })




        return JsonResponse({
            "fitbit": fitbit_data,
            "questionnaire": feedback_result,
        }, safe=False)

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)

    except Exception as e:
        logger.error(f"[get_combined_health_data] {str(e)}", exc_info=True)
        return JsonResponse({"error": "Internal Server Error"}, status=500)

