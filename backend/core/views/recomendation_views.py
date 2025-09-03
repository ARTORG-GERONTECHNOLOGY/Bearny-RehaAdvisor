import json
import logging
import os
from mongoengine.queryset.visitor import Q
from bson import ObjectId
from django.conf import settings
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.utils import timezone
from django.utils.timezone import now as dj_now
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import Logs  # Ensure this includes action, userId, userAgent, details
from core.models import (
    DefaultInterventions,
    DiagnosisAssignmentSettings,
    Intervention,
    InterventionAssignment,
    Patient,
    PatientInterventionLogs,
    PatientType,
    Therapist,
)
from utils.config import config
from utils.utils import generate_custom_id, get_labels, sanitize_text

logger = logging.getLogger(__name__)  # Fallback to file-based logger if needed
FILE_TYPE_FOLDERS = {
    "mp4": "videos",
    "mp3": "audio",
    "jpg": "images",
    "png": "images",
    "pdf": "documents",
}


@csrf_exempt
@permission_classes([IsAuthenticated])
def list_all_interventions(request, patient_id=None):
    """
    GET /api/interventions/all/(<str:patient_id>/)?
    Return public interventions and optionally private ones for the patient (listed first).
    """
    try:
        public_interventions = Intervention.objects.filter(Q(is_private=False) | Q(is_private__exists=False))

        private_interventions = []
        if patient_id:
            try:
                private_interventions = Intervention.objects.filter(
                    is_private=True,
                    private_patient_id=ObjectId(patient_id)
                )
            except Exception as e:
                logger.warning(f"Invalid patient ID or private fetch error: {e}")

        def serialize(item):
            return {
                "_id": str(item.pk),
                "title": item.title,
                "description": item.description,
                "content_type": item.content_type,
                "patient_types": [
                    {
                        "type": pt.type,
                        "frequency": pt.frequency,
                        "include_option": pt.include_option,
                        "diagnosis": pt.diagnosis,
                    }
                    for pt in item.patient_types
                ],
                "link": item.link or "",
                "media_file": (
                    f"{settings.MEDIA_HOST}{os.path.join(settings.MEDIA_URL, item.media_file)}"
                    if item.media_file else ""
                ),
                "preview_img": (
                    f"{settings.MEDIA_HOST}{os.path.join(settings.MEDIA_URL, item.preview_img)}"
                    if item.preview_img else ""
                ),
                "duration": item.duration,
                "benefitFor": item.benefitFor,
                "tags": item.tags,
                "is_private": item.is_private,  # Include privacy status
            }

        serialized_data = [serialize(i) for i in private_interventions] + [serialize(i) for i in public_interventions]

        return JsonResponse(serialized_data, safe=False, status=200)

    except Exception as e:
        logger.error(f"[list_all_interventions] Unexpected error: {str(e)}", exc_info=True)
        return JsonResponse({"error": "Internal Server Error", "details": str(e)}, status=500)



@csrf_exempt
@permission_classes([IsAuthenticated])
def add_new_intervention(request):
    """
    POST /api/interventions/add/
    Create a new intervention (public or private).
    Accepts multipart/form-data (with files) or application/json.
    Robustly parses tags/benefitFor whether sent as JSON arrays or comma-separated strings.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    def parse_body():
        # Support both multipart and JSON
        if request.content_type and "application/json" in request.content_type:
            try:
                return json.loads(request.body.decode("utf-8")) if request.body else {}
            except Exception:
                return {}
        # multipart/form-data
        return request.POST.dict()

    def parse_str_list(val):
        """
        Turn val into a list[str].
        - If list already, sanitize each.
        - If JSON array string, parse.
        - Else split by comma.
        """
        if val is None:
            return []
        if isinstance(val, list):
            return [sanitize_text(str(x)).strip() for x in val if str(x).strip()]
        if isinstance(val, str):
            s = val.strip()
            if not s:
                return []
            # Try JSON first
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return [sanitize_text(str(x)).strip() for x in parsed if str(x).strip()]
            except json.JSONDecodeError:
                pass
            # Fallback: comma-separated string
            items = [p.strip().strip('"').strip("'") for p in s.split(",")]
            return [sanitize_text(x) for x in items if x]
        # Anything else → stringify and return as single element
        return [sanitize_text(str(val)).strip()]

    def parse_bool(val, default=False):
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.lower() in {"1", "true", "yes", "y", "on"}
        return bool(val) if val is not None else default

    def parse_int(val, default=None):
        if val in (None, ""):
            return default
        try:
            return int(val)
        except Exception:
            return default

    try:
        data = parse_body()

        # Patient types may come as an array or JSON string or under either key
        raw_patient_types = data.get("patientTypes") or data.get("patient_types") or []
        if isinstance(raw_patient_types, str):
            try:
                raw_patient_types = json.loads(raw_patient_types)
            except json.JSONDecodeError:
                raw_patient_types = []

        # Build PatientType embeddeds
        patient_types = []
        for pt in raw_patient_types or []:
            # Support includeOption/include_option; frequency/type/diagnosis names as provided
            patient_types.append(
                PatientType(
                    type=pt.get("type", ""),
                    diagnosis=pt.get("diagnosis", ""),
                    frequency=pt.get("frequency", ""),
                    include_option=bool(pt.get("includeOption", pt.get("include_option", False))),
                )
            )

        # Privacy flags / ids
        is_private = parse_bool(data.get("isPrivate", data.get("is_private", False)))
        patient_id = data.get("patientId") or data.get("patient_id")

        # Duplicate title check
        title_raw = data.get("title", "")
        if Intervention.objects.filter(title=title_raw).first():
            return JsonResponse(
                {"success": False, "error": "An intervention with this title already exists."},
                status=400,
            )

        timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")

        # Private path (if needed)
        private_path = os.path.join("private", str(patient_id)) if is_private and patient_id else ""

        # --- Save media file (optional) ---
        media_path = ""
        if "media_file" in request.FILES:
            media_file = request.FILES["media_file"]
            ext = media_file.name.split(".")[-1].lower()
            folder = private_path if is_private else FILE_TYPE_FOLDERS.get(ext, "others")
            filename = f"{timestamp}_{media_file.name}"
            media_path = default_storage.save(os.path.join(folder, filename), media_file)

        # --- Save preview image (optional) ---
        preview_path = ""
        if "img_file" in request.FILES:
            img = request.FILES["img_file"]
            ext = img.name.split(".")[-1].lower()
            folder = private_path if is_private else FILE_TYPE_FOLDERS.get(ext, "others")
            filename = f"{timestamp}_{img.name}"
            preview_path = default_storage.save(os.path.join(folder, filename), img)

        # --- Parse & normalize lists ---
        # Accept either 'benefitFor' (preferred) or 'benefits'
        raw_benefit_for = data.get("benefitFor", data.get("benefits"))
        benefit_for_list = parse_str_list(raw_benefit_for)

        # Accept either 'tagList' (preferred) or 'tags'
        raw_tags = data.get("tagList", data.get("tags"))
        tags_list = parse_str_list(raw_tags)

        # Build intervention
        new_intervention = Intervention(
            title=sanitize_text(title_raw),
            description=sanitize_text(data.get("description", "")),
            content_type=data.get("contentType") or data.get("content_type") or "",
            link=data.get("link", ""),
            media_file=media_path,
            preview_img=preview_path,
            patient_types=patient_types if not is_private else [],
            duration=parse_int(data.get("duration")),
            benefitFor=benefit_for_list,
            tags=tags_list,
            is_private=is_private,
            private_patient_id=ObjectId(patient_id) if is_private and patient_id else None,
        )

        new_intervention.save()

        return JsonResponse({"success": True, "message": "Intervention added successfully!"}, status=201)

    except Exception as e:
        logger.error("[add_new_intervention] Unexpected error: %s", str(e), exc_info=True)
        return JsonResponse({"success": False, "error": str(e)}, status=500)





@csrf_exempt
@permission_classes([IsAuthenticated])
def get_intervention_detail(request, intervention_id):
    """
    GET /api/interventions/<intervention_id>/
    Returns intervention metadata and feedbacks (if any).
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        intervention = Intervention.objects.get(pk=intervention_id)

        feedbacks = []
        patient_logs = PatientInterventionLogs.objects.filter(
            interventionId=intervention
        )

        for log in patient_logs:
            for entry in log.feedback:
                feedbacks.append(
                    {
                        "date": entry.date.isoformat(),
                        "comment": entry.comment,
                        "rating": entry.rating,
                    }
                )

        data = {
            "title": intervention.title,
            "description": intervention.description,
            "content_type": intervention.content_type,
            "patient_types": [
                {
                    "type": pt.type,
                    "frequency": pt.frequency,
                    "include_option": pt.include_option,
                    "diagnosis": pt.diagnosis,
                }
                for pt in intervention.patient_types
            ],
            "link": intervention.link or "",
            "media_file": intervention.media_file or "",
        }

        return JsonResponse({"recommendation": data, "feedback": feedbacks}, status=200)

    except Intervention.DoesNotExist as e:
        logger.warning(f"[get_intervention_detail] Entity not found: {e}")
        return JsonResponse({"error": "Intervention not found"}, status=404)

    except Exception as e:
        logger.error(
            f"[get_intervention_detail] Unexpected error: {str(e)}", exc_info=True
        )
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def list_intervention_diagnoses(request, intervention, specialisation, therapist_id):
    """
    GET /api/interventions/<intervention>/assigned-diagnoses/<specialisation>/therapist/<therapist_id>/
    Returns a mapping of diagnoses to their assigned status and the 'all' flag.
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        therapist = Therapist.objects.get(userId=ObjectId(therapist_id))
        intervention_id = ObjectId(intervention)

        # Parse all diagnoses based on specialisation(s)
        specialisation_list = [s.strip() for s in specialisation.split(",")]
        all_diagnoses = []
        for spec in specialisation_list:
            all_diagnoses.extend(
                config["patientInfo"]["function"].get(spec, {}).get("diagnosis", [])
            )

        diagnosis_map = {d: False for d in all_diagnoses}
        all_flag = False

        # Match default recommendation
        default_rec = next(
            (
                r
                for r in therapist.default_recommendations
                if r.recommendation.id == intervention_id
            ),
            None,
        )

        if default_rec:
            for diagnosis, settings in default_rec.diagnosis_assignments.items():
                if diagnosis == "all":
                    all_flag = settings.active
                elif diagnosis in diagnosis_map:
                    diagnosis_map[diagnosis] = settings.active

        return JsonResponse({"diagnoses": diagnosis_map, "all": all_flag}, status=200)

    except Therapist.DoesNotExist as e:
        logger.warning(f"[list_intervention_diagnoses] Entity not found: {e}")
        return JsonResponse({"error": "Therapist not found"}, status=404)
    except Exception as e:
        logger.error(
            f"[list_intervention_diagnoses] Unexpected error: {str(e)}", exc_info=True
        )
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def assign_intervention_to_types(request):
    """
    POST /api/interventions/assign-to-patient-types/
    Assign an intervention with repeat settings to a diagnosis group for a therapist.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
        therapist = Therapist.objects.get(userId=ObjectId(data.get("therapistId")))
        interventions_data = data.get("interventions", [])

        if not interventions_data:
            return JsonResponse({"error": "No intervention data provided"}, status=400)

        intervention_data = interventions_data[0]
        intervention = Intervention.objects.get(
            id=ObjectId(intervention_data.get("interventionId"))
        )
        diagnosis = data.get("patientId")

        # Prepare repeat settings
        settings = DiagnosisAssignmentSettings(
            active=True,
            interval=intervention_data.get("interval"),
            unit=intervention_data.get("unit"),
            selected_days=intervention_data.get("selectedDays"),
            end_type=intervention_data.get("end", {}).get("type"),
            count_limit=intervention_data.get("end", {}).get("count"),
        )

        # Check if the intervention is already in the default recommendations
        existing_entry = next(
            (
                rec
                for rec in therapist.default_recommendations
                if rec.recommendation == intervention
            ),
            None,
        )

        if existing_entry:
            existing_entry.diagnosis_assignments[diagnosis] = settings
        else:
            therapist.default_recommendations.append(
                DefaultInterventions(
                    recommendation=intervention,
                    diagnosis_assignments={diagnosis: settings},
                )
            )

        therapist.save()
        return JsonResponse(
            {"success": "Default intervention settings saved"}, status=201
        )

    except (Therapist.DoesNotExist, Intervention.DoesNotExist) as e:
        logger.warning(f"[assign_intervention_to_types] Entity not found: {e}")
        return JsonResponse(
            {"error": "Therapist or intervention not found"}, status=404
        )
    except json.JSONDecodeError as e:
        logger.error(
            f"[assign_intervention_to_types] Unexpected error: {str(e)}", exc_info=True
        )
        return JsonResponse({"error": "Bad request"}, status=400)
    except Exception as e:
        logger.error(
            f"[assign_intervention_to_types] Unexpected error: {str(e)}", exc_info=True
        )
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def remove_intervention_from_types(request):
    """
    POST /api/interventions/remove-from-patient-types/
    Removes the assignment of an intervention to a diagnosis type from a therapist's defaults.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)
        therapist = Therapist.objects.get(userId=ObjectId(data.get("therapist")))
        intervention = Intervention.objects.get(
            id=ObjectId(data.get("intervention_id"))
        )
        diagnosis = data.get("diagnosis")

        for rec in therapist.default_recommendations:
            if (
                rec.recommendation == intervention
                and diagnosis in rec.diagnosis_assignments
            ):
                del rec.diagnosis_assignments[diagnosis]
                break

        therapist.save()
        return JsonResponse(
            {"success": "Diagnosis removed from intervention"}, status=200
        )

    except (Therapist.DoesNotExist, Intervention.DoesNotExist) as e:
        logger.warning(f"[remove_intervention_from_types] Entity not found: {e}")
        return JsonResponse(
            {"error": "Therapist or intervention not found"}, status=404
        )
    except json.JSONDecodeError:
        logger.error(
            f"[remove_intervention_from_types] Unexpected error: {str(e)}",
            exc_info=True,
        )
        return JsonResponse({"error": "Invalid JSON body"}, status=400)
    except Exception as e:
        logger.error(
            f"[remove_intervention_from_types] Unexpected error: {str(e)}",
            exc_info=True,
        )
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def create_patient_group(request):
    """
    POST /api/interventions/add/patientgroup/
    Adds a new diagnosis entry to an intervention's specialization group.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        data = json.loads(request.body)

        intervention_id = data.get("interventionId")
        diagnosis = data.get("diagnosis")
        spec_type = data.get("speciality")
        frequency = data.get("frequency")

        if not all([intervention_id, diagnosis, spec_type, frequency]):
            return JsonResponse({"error": "Missing required fields"}, status=400)

        intervention = Intervention.objects.get(pk=ObjectId(intervention_id))

        new_entry = PatientType(
            type=spec_type,
            diagnosis=diagnosis,
            frequency=frequency,
            include_option=True,
        )

        if not intervention.patient_types:
            intervention.patient_types = []

        # Avoid duplicates
        for pt in intervention.patient_types:
            if pt["diagnosis"] == diagnosis and pt["type"] == spec_type:
                return JsonResponse(
                    {"success": False, "message": "Diagnosis already exists"},
                    status=400,
                )

        intervention.patient_types.append(new_entry)
        intervention.save()

        return JsonResponse(
            {"success": True, "message": "Diagnosis added successfully"}
        )

    except Intervention.DoesNotExist:
        logger.warning(f"[create_patient_group] Entity not found: {e}")
        return JsonResponse({"error": "Intervention not found"}, status=404)
    except Exception as e:
        logger.error(
            f"[create_patient_group] Unexpected error: {str(e)}", exc_info=True
        )
        return JsonResponse({"success": False, "error": str(e)}, status=500)


# TODO
@csrf_exempt
def update_daily_recomendations(request):
    if request.method == "GET":
        try:
            patients = Patient.objects.get()
            for patient in patients:
                _ = PatientInterventionLogs.get_patient_interventions_with_feedback_and_future_dates(
                    patient
                )

            return JsonResponse({"success": "Done."}, status=200)
        except Exception as e:
            return JsonResponse({"error": "Failed."}, status=400)
