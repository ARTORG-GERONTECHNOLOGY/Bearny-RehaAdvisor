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
    FitbitData,
    PatientVitals
)
from utils.utils import (
    convert_to_serializable,
    ensure_aware,
    generate_repeat_dates,
    sanitize_text,
    serialize_datetime,
    transcribe_file,
    resolve_patient,
    _adherence
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

TYPE_PREFIX_MAP = {
    "articles": "articles_",
    "educational material": "edu_",
    "exercises": "exercises_",
    "audio": "audio_",
    "video": "video_",
    "pdfs": "pdf_",
    "websites": "web_",
    "manuals": "manual_",
    "apps": "app_",
    "games": "game_",
}

def _serialize_questions(qs):
    return [
        {
            "questionKey": q.questionKey,
            "answerType": q.answer_type,
            "translations": [{"language": tr.language, "text": tr.text} for tr in q.translations],
            "possibleAnswers": [
                {
                    "key": opt.key,
                    "translations": [{"language": t2.language, "text": t2.text} for t2 in opt.translations],
                }
                for opt in (q.possibleAnswers or [])
            ],
        }
        for q in qs
    ]
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
        # Try to resolve the assignment + intervention type
        assignment = None
        intervention_type = None

        if intervention_id:
            plan = RehabilitationPlan.objects(patientId=patient).first()
            if plan:
                assignment = next(
                    (
                        a for a in (plan.interventions or [])
                        if str(getattr(a.interventionId, "id", a.interventionId)) == str(intervention_id)
                    ),
                    None,
                )
                if assignment and getattr(assignment, "interventionId", None):
                    # normalize to lower for matching
                    raw_type = str(getattr(assignment.interventionId, "content_type", "") or "")
                    intervention_type = raw_type.strip().lower() or None

        # 1) Core questions (apply to all interventions).
        #    We accept two ways to mark "core":
        #       - No applicable_types field
        #       - OR applicable_types explicitly contains "All"
        core_q = FeedbackQuestion.objects(
            questionSubject="Intervention"
        ).filter(
            Q(applicable_types__exists=False) | Q(applicable_types__size=0) | Q(applicable_types__icontains="all")
        )

        # 2) Type-specific questions:
        type_q = []
        if intervention_type:
            # Prefer explicit tagging via applicable_types
            tagged = FeedbackQuestion.objects(
                questionSubject="Intervention",
                applicable_types__icontains=intervention_type
            )

            # Fallback: prefix convention on questionKey if your DB doesn’t use applicable_types yet
            prefix = TYPE_PREFIX_MAP.get(intervention_type, "")
            prefixed = []
            if prefix:
                prefixed = FeedbackQuestion.objects(
                    questionSubject="Intervention",
                    questionKey__istartswith=prefix
                )

            # Merge (avoid duplicates by key)
            seen = set()
            merged = []
            for q in list(tagged) + list(prefixed):
                if q.questionKey not in seen:
                    merged.append(q)
                    seen.add(q.questionKey)
            type_q = merged

        # 3) Build final list
        result = _serialize_questions(core_q) + _serialize_questions(type_q)

        # 4) Optional: require video feedback per assignment flag
        if assignment and getattr(assignment, "require_video_feedback", False):
            result.append(
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
                            "text": "Il tuo terapista ha richiesto un video. La registrazione inizierà dopo 10 s—posiziona la fotocamera.",
                        },
                        {
                            "language": "de",
                            "text": "Ihr Therapeut hat ein Video angefordert. Die Aufnahme startet nach 10 s—bitte richten Sie die Kamera aus.",
                        },
                        {
                            "language": "fr",
                            "text": "Votre thérapeute a demandé une vidéo. L’enregistrement commencera après 10 s—veuillez placer votre caméra.",
                        },
                    ],
                    "possibleAnswers": [],
                }
            )

        return JsonResponse({"questions": result})

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
        patient = resolve_patient(patient_id)
        plan = RehabilitationPlan.objects.get(patientId=patient)

        # ── NEW: compute adherence (7d & overall) ─────────────────────────────
        adh_7, adh_total = _adherence(patient)

        today = timezone.now().date()
        plan_data = {
            "startDate": plan.startDate.isoformat(),
            "endDate": plan.endDate.isoformat(),
            "status": plan.status,
            "createdAt": plan.createdAt.isoformat(),
            "updatedAt": plan.updatedAt.isoformat(),
            # ── NEW: return adherence in payload ───────────────────────────────
            "adherence_rate": adh_7,       # last 7 days, 0–100 or null
            "adherence_total": adh_total,  # overall, 0–100 or null
            "interventions": [],
        }

        for assignment in plan.interventions:
            intervention = assignment.interventionId
            logs = PatientInterventionLogs.objects(
                userId=patient, interventionId=intervention
            )

            # set() of completed dates (not strictly needed for below, but kept)
            completed_dates = {
                log.date.date() for log in logs if "completed" in (log.status or [])
            }

            intervention_dates = []
            completed_count = 0
            current_total_count = 0
            rating_sum = 0
            rating_count = 0

            for date in assignment.dates:
                log = next((l for l in logs if l.date.date() == date.date()), None)

                if log and "completed" in (log.status or []):
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
                if log and getattr(log, "feedback", None):
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
                            for opt in (fb.answerKey or [])
                        ]

                        feedback_entries.append(
                            {
                                "question": question_data,
                                "comment": fb.comment,
                                "audio_url": getattr(fb, "audio_url", None),
                                "answer": answer_data,
                            }
                        )

                        try:
                            rating_sum += int((fb.answerKey or [])[0].key)
                            rating_count += 1
                        except (ValueError, TypeError, IndexError, AttributeError):
                            pass

                # Video feedback if present
                video_feedback = None
                if log and getattr(log, "video_url", None):
                    normalized_url = urljoin(settings.MEDIA_HOST, log.video_url)
                    video_feedback = {
                        "video_url": normalized_url,
                        "video_expired": getattr(log, "video_expired", False),
                        "comment": getattr(log, "comments", "") or "",
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


def _iso(dt):
    """Return ISO 8601 string for dt or None."""
    if dt is None:
        return None
    # support both date and datetime
    if isinstance(dt, datetime.date) and not isinstance(dt, datetime.datetime):
        return datetime.datetime(dt.year, dt.month, dt.day, tzinfo=datetime.timezone.utc).isoformat()
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, datetime.timezone.utc)
    return dt.isoformat()

@csrf_exempt
@permission_classes([IsAuthenticated])
def get_combined_health_data(request, patient_id):
    try:
        if not patient_id or patient_id == "null":
            return JsonResponse({"error": "Invalid patient ID"}, status=400)

        # resolve patient by pk or userId
        try:
            patient = Patient.objects.get(pk=patient_id)
        except Exception:
            patient = Patient.objects.get(userId=ObjectId(patient_id))

        # ---------- date window ----------
        from_str = request.GET.get("from")
        to_str   = request.GET.get("to")

        if from_str and to_str:
            from_date = datetime.datetime.strptime(from_str, "%Y-%m-%d")
            to_date   = datetime.datetime.strptime(to_str, "%Y-%m-%d")
        else:
            to_date   = timezone.now()
            from_date = to_date - datetime.timedelta(days=30)

        # normalize to full days (aware)
        from_datetime = timezone.make_aware(
            datetime.datetime.combine(from_date.date(), datetime.time.min), datetime.timezone.utc
        ) if timezone.is_naive(from_date) else datetime.datetime.combine(from_date.date(), datetime.time.min).replace(tzinfo=from_date.tzinfo)

        to_datetime = timezone.make_aware(
            datetime.datetime.combine(to_date.date(), datetime.time.max), datetime.timezone.utc
        ) if timezone.is_naive(to_date) else datetime.datetime.combine(to_date.date(), datetime.time.max).replace(tzinfo=to_date.tzinfo)

        # ---------- 1) Fitbit + Manual vitals merge ----------
        fitbit_entries = FitbitData.objects(
            user=patient.userId, date__gte=from_date, date__lte=to_date
        ).order_by("date")

        # manual vitals in the same window (keep latest per day)
        vitals = PatientVitals.objects(
            patientId=patient, date__gte=from_datetime, date__lte=to_datetime
        ).order_by("date")

        manual_by_day: dict[datetime.date, PatientVitals] = {}
        for v in vitals:
            day = v.date.date()
            if day not in manual_by_day or v.date > manual_by_day[day].date:
                manual_by_day[day] = v

        fitbit_data = []
        # existing Fitbit days
        for entry in fitbit_entries:
            day = entry.date.date()
            man = manual_by_day.get(day)

            weight_val = man.weight_kg if (man and man.weight_kg is not None) else getattr(entry, "weight", None)

            bp_obj = None
            if man and (man.bp_sys is not None or man.bp_dia is not None):
                bp_obj = {"systolic": man.bp_sys, "diastolic": man.bp_dia, "source": "manual"}
            else:
                fb_bp = getattr(entry, "blood_pressure", None)
                if fb_bp:
                    bp_obj = {
                        "systolic": getattr(fb_bp, "systolic", None),
                        "diastolic": getattr(fb_bp, "diastolic", None),
                        "source": "fitbit",
                    }

            # map HR zones and sleep to plain dicts
            zones = [
                {
                    "name": z.name,
                    "minutes": z.minutes,
                    "caloriesOut": z.caloriesOut,
                    "min": z.min,
                    "max": z.max,
                }
                for z in (entry.heart_rate_zones or [])
            ]

            if entry.sleep:
                # if sleep start/end are datetimes, convert to strings
                sleep_start = getattr(entry.sleep, "sleep_start", None)
                sleep_end   = getattr(entry.sleep, "sleep_end", None)
                sleep_obj = {
                    "sleep_duration": getattr(entry.sleep, "sleep_duration", None),
                    "sleep_start": _iso(sleep_start) if isinstance(sleep_start, (datetime.datetime, datetime.date)) else sleep_start,
                    "sleep_end": _iso(sleep_end) if isinstance(sleep_end, (datetime.datetime, datetime.date)) else sleep_end,
                    "awakenings": getattr(entry.sleep, "awakenings", None),
                }
            else:
                sleep_obj = None

            fitbit_data.append(
                {
                    "date": entry.date.strftime("%Y-%m-%d"),
                    "steps": entry.steps,
                    "resting_heart_rate": entry.resting_heart_rate,
                    "floors": entry.floors,
                    "distance": entry.distance,
                    "calories": entry.calories,
                    "active_minutes": entry.active_minutes,
                    "heart_rate_zones": zones,
                    "sleep": sleep_obj,
                    "breathing_rate": entry.breathing_rate,
                    "hrv": entry.hrv,
                    "exercise": entry.exercise,
                    # unified vitals
                    "weight": weight_val,
                    "blood_pressure": bp_obj,
                }
            )

        fitbit_days = {datetime.datetime.strptime(r["date"], "%Y-%m-%d").date() for r in fitbit_data}

        # add manual-only days (no Fitbit row that day)
        for day, man in manual_by_day.items():
            if day in fitbit_days:
                continue
            fitbit_data.append({
                "date": day.strftime("%Y-%m-%d"),
                "steps": None, "resting_heart_rate": None, "floors": None, "distance": None,
                "calories": None, "active_minutes": None, "heart_rate_zones": [],
                "sleep": None, "breathing_rate": None, "hrv": None, "exercise": None,
                "weight": man.weight_kg,
                "blood_pressure": (
                    {"systolic": man.bp_sys, "diastolic": man.bp_dia, "source": "manual"}
                    if (man.bp_sys is not None or man.bp_dia is not None)
                    else None
                ),
            })


        fitbit_data.sort(key=lambda r: r["date"])

        # ---------- 2) Questionnaire ----------
        questions = FeedbackQuestion.objects(questionSubject="Healthstatus")
        question_map = {
            str(q.id): {
                "questionKey": q.questionKey,
                "icfCode": q.icfCode,
                "answerType": q.answer_type,
                "translations": [{"language": tr.language, "text": tr.text} for tr in q.translations],
                "answerMap": {
                    opt.key: [{"language": tr.language, "text": tr.text} for tr in opt.translations]
                    for opt in (q.possibleAnswers or [])
                },
            }
            for q in questions
        }

        feedback_result = []
        ratings = PatientICFRating.objects(
            patientId=patient, date__gte=from_date, date__lte=to_date
        ).order_by("date")

        for rating in ratings:
            for ent in rating.feedback_entries:
                if not getattr(ent, "questionId", None):
                    continue
                try:
                    qid = str(ent.questionId.id)
                except Exception:
                    continue
                if qid not in question_map:
                    continue

                parsed_answers = [
                    {
                        "key": ans.key,
                        "translations": [{"language": t.language, "text": t.text} for t in ans.translations],
                    }
                    for ans in (ent.answerKey or [])
                ]

                qmeta = question_map[qid]
                feedback_result.append(
                    {
                        "questionKey": qmeta["questionKey"],
                        "icfCode": qmeta["icfCode"],
                        "date": _iso(rating.date),
                        "answers": parsed_answers,
                        "comment": ent.comment,
                        "questionTranslations": qmeta["translations"],
                        "answerType": qmeta["answerType"],
                    }
                )

        # ---------- 3) Adherence (daily) ----------
        adherence = []
        try:
            plan = RehabilitationPlan.objects(patientId=patient).first()
        except Exception:
            plan = None

        # buckets for scheduled/completed
        scheduled_by_day: dict[datetime.date, int] = {}
        if plan:
            for ia in (getattr(plan, "interventions", []) or []):
                for d in (getattr(ia, "dates", []) or []):
                    # convert each date to a timezone-aware datetime if possible
                    dt = None
                    if isinstance(d, datetime.datetime):
                        dt = d
                    else:
                        # robust parse for mongo Date/str
                        try:
                            dt = datetime.datetime.fromisoformat(str(d))
                        except Exception:
                            # last resort: treat as date
                            try:
                                dt = datetime.datetime.combine(d, datetime.time.min)
                            except Exception:
                                continue
                    if timezone.is_naive(dt):
                        dt = timezone.make_aware(dt, datetime.timezone.utc)
                    if from_datetime <= dt <= to_datetime:
                        day = dt.date()
                        scheduled_by_day[day] = scheduled_by_day.get(day, 0) + 1

        completed_by_day: dict[datetime.date, int] = {}
        logs = PatientInterventionLogs.objects(
            userId=patient, date__gte=from_datetime, date__lte=to_datetime
        )
        for lg in logs:
            dt = getattr(lg, "date", None)
            if not isinstance(dt, datetime.datetime):
                continue
            status = getattr(lg, "status", "")
            is_completed = False
            if isinstance(status, str):
                is_completed = "completed" in status.lower()
            elif isinstance(status, (list, tuple)):
                is_completed = any("completed" in str(s).lower() for s in status)
            if is_completed:
                day = dt.date()
                completed_by_day[day] = completed_by_day.get(day, 0) + 1

        day = from_datetime.date()
        end_day = to_datetime.date()
        while day <= end_day:
            s = scheduled_by_day.get(day, 0)
            c = completed_by_day.get(day, 0)
            pct = round(100 * c / s) if s > 0 else None
            adherence.append(
                {
                    "date": day.strftime("%Y-%m-%d"),
                    "scheduled": int(s),
                    "completed": int(c),
                    "pct": pct,
                }
            )
            day += datetime.timedelta(days=1)

        # ---------- response ----------
        return JsonResponse(
            {
                "fitbit": fitbit_data,
                "questionnaire": feedback_result,
                "adherence": adherence,
            },
            safe=False,
        )

    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)
    except Exception as e:
        # ensure you have `logger` defined; otherwise replace with print
        logger.error(f"[get_combined_health_data] {str(e)}", exc_info=True)
        return JsonResponse({"error": "Internal Server Error"}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def add_manual_vitals(request, patient_id: str):
    """
    POST /api/patients/vitals/manual/<patient_id>/
    Body JSON: { "date": ISO8601, "weight_kg": number, "bp_sys": number, "bp_dia": number }
    - If "date" missing, uses now()
    - Upserts (per patient, per calendar day)
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    # Resolve patient by pk or userId
    try:
        try:
            patient = Patient.objects.get(pk=patient_id)
        except Exception:
            patient = Patient.objects.get(userId=ObjectId(patient_id))
    except Patient.DoesNotExist:
        return JsonResponse({"error": "Patient not found"}, status=404)

    # Parse JSON
    try:
        body = json.loads(request.body or "{}")
    except Exception:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    # Parse/normalize the datetime
    when_str = body.get("date")
    if when_str:
        try:
            # accept Z by converting to +00:00
            dt = datetime.datetime.fromisoformat(when_str.replace("Z", "+00:00"))
        except Exception:
            return JsonResponse({"error": "Invalid 'date' (use ISO 8601)."}, status=400)
    else:
        dt = timezone.now()

    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.utc)

    # Validate numeric inputs
    def as_float(x):
        try:
            return float(x) if x is not None else None
        except (TypeError, ValueError):
            return None

    weight_kg = as_float(body.get("weight_kg"))
    bp_sys    = as_float(body.get("bp_sys"))
    bp_dia    = as_float(body.get("bp_dia"))

    if weight_kg is None and bp_sys is None and bp_dia is None:
        return JsonResponse({"error": "No vitals provided"}, status=400)

    # Upsert one record per calendar day (UTC)
    day_start = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end   = dt.replace(hour=23, minute=59, second=59, microsecond=999999)

    rec = PatientVitals.objects(
        patientId=patient,
        date__gte=day_start,
        date__lte=day_end
    ).first()

    if not rec:
        rec = PatientVitals(
            user=patient.userId,
            patientId=patient,
            date=dt
        )

    if weight_kg is not None:
        rec.weight_kg = weight_kg
    if bp_sys is not None or bp_dia is not None:
        # adjust to your field structure if it’s an EmbeddedDocument
        # e.g., rec.blood_pressure.systolic = bp_sys ; rec.blood_pressure.diastolic = bp_dia
        rec.blood_pressure = {
            "systolic": bp_sys,
            "diastolic": bp_dia,
        }

    rec.save()
    return JsonResponse({"ok": True, "id": str(rec.id), "date": dt.isoformat()}, status=200)


def _resolve_patient(patient_id: str) -> Patient:
    """
    Try to resolve Patient by primary key first; if that fails, by userId (ObjectId).
    """
    try:
        return Patient.objects.get(pk=patient_id)
    except Exception:
        try:
            return Patient.objects.get(userId=ObjectId(patient_id))
        except Exception:
            raise Patient.DoesNotExist()

def _parse_day(date_str: str) -> tuple[datetime, datetime, datetime]:
    """
    YYYY-MM-DD -> (date_only, day_start_aware, day_end_aware)
    """
    d = datetime.strptime(date_str, "%Y-%m-%d")
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(d.date(), time.min), tz)
    end   = timezone.make_aware(datetime.combine(d.date(), time.max), tz)
    return d, start, end

def _has_weight(row) -> bool:
    # Support several shapes/names
    for attr in ("weight_kg", "weightKg", "weight", "body_weight"):
        if hasattr(row, attr) and getattr(row, attr) is not None:
            return True
    w = getattr(row, "weight", None)
    if isinstance(w, dict) and (w.get("kg") is not None or w.get("value") is not None):
        return True
    return False

def _has_bp(row) -> bool:
    # Nested document or dict on row.blood_pressure
    bp = getattr(row, "blood_pressure", None)
    if bp is not None:
        try:
            s = getattr(bp, "systolic", None)
            d = getattr(bp, "diastolic", None)
        except Exception:
            s = bp.get("systolic") if isinstance(bp, dict) else None
            d = bp.get("diastolic") if isinstance(bp, dict) else None
        if s is not None or d is not None:
            return True
    # Flat fields as fallback
    if getattr(row, "bp_sys", None) is not None or getattr(row, "bp_dia", None) is not None:
        return True
    return False

def _parse_date_forgiving(s: str | None) -> datetime.date | None:
    """Accept 'YYYY-MM-DD', 'YYYY-MM-DDTHH:MM[:SS][Z]', or 'YYYY/MM/DD' (with spaces)."""
    if not s:
        return None
    s = s.strip()
    # Fast path: ISO date at the start of the string
    head10 = s[:10]
    try:
        return datetime.date.fromisoformat(head10)
    except Exception:
        pass
    # Try with slashes or single-digit month/day
    m = re.match(r"^\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})", s)
    if m:
        y, mo, d = map(int, m.groups())
        try:
            return datetime.date(y, mo, d)
        except ValueError:
            return None
    return None


def _resolve_patient(patient_id: str):
    """Try Patient.pk first; then Patient.userId."""
    try:
        return Patient.objects.get(pk=patient_id)
    except Exception:
        try:
            return Patient.objects.get(userId=ObjectId(patient_id))
        except Exception:
            return None


@csrf_exempt
@permission_classes([IsAuthenticated])
def vitals_exists_for_day(request, patient_id: str):
    """
    GET /api/patients/vitals/exists/<patient_id>/?date=YYYY-MM-DD
    Returns {"exists": true|false}
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    day = _parse_date_forgiving(request.GET.get("date"))
    if not isinstance(day, datetime.date):
        return JsonResponse({"error": "Invalid 'date'. Expected YYYY-MM-DD."}, status=400)

    patient = _resolve_patient(patient_id)
    if not patient:
        return JsonResponse({"error": "Patient not found"}, status=404)

    # Day window (naive datetimes, consistent with your MongoEngine usage)
    start_dt = datetime.datetime.combine(day, datetime.time.min)
    end_dt   = datetime.datetime.combine(day, datetime.time.max)

    exists = False

    # 1) If you have a dedicated PatientVitals model, prefer that
    try:
        from core.models import PatientVitals  # optional
        pv = PatientVitals.objects(
            patientId=patient,
            date__gte=start_dt,
            date__lte=end_dt
        ).only("id").first()
        if pv:
            exists = True
    except Exception:
        # 2) Fallback: store/check inside FitbitData for the same day
        fb = FitbitData.objects(
            user=patient.userId,
            date__gte=start_dt,
            date__lte=end_dt
        ).first()
        if fb:
            # Adjust these field names to match your save_vitals implementation
            weight_present = getattr(fb, "weight_kg", None) is not None
            bp = getattr(fb, "blood_pressure", None)
            systolic_present = getattr(bp, "systolic", None) is not None if bp else False
            diastolic_present = getattr(bp, "diastolic", None) is not None if bp else False
            exists = weight_present or systolic_present or diastolic_present

    return JsonResponse({"exists": bool(exists)}, status=200)