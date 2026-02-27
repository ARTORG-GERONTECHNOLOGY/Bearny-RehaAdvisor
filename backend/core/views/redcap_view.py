# core/views.py
from bson import ObjectId
from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated

from core.models import RedcapParticipant, Therapist, User
from core.redcap import redcap_export_record


@csrf_exempt
@permission_classes([IsAuthenticated])
def import_redcap_participant(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        body = json.loads(request.body or "{}")
        record_id = (body.get("record_id") or "").strip()
        if not record_id:
            return JsonResponse({"error": "record_id is required"}, status=400)

        # resolve therapist
        user = request.user  # DRF user
        therapist = Therapist.objects.filter(userId=user).first()
        if not therapist:
            return JsonResponse({"error": "Only therapists can import participants"}, status=403)

        existing = RedcapParticipant.objects(record_id=record_id).first()
        if existing:
            if str(existing.assigned_therapist.id) != str(therapist.id):
                return JsonResponse(
                    {"error": "Participant already assigned to another therapist"},
                    status=409,
                )
            # optionally refresh if old
            return JsonResponse(
                {"ok": True, "id": str(existing.id), "record_id": existing.record_id},
                status=200,
            )

        # fetch from REDCap
        fields = ["record_id", "gender", "primary_diagnosis", "clinic"]
        rec = redcap_export_record(settings.REDCAP_API_URL, settings.REDCAP_API_TOKEN, record_id, fields)
        if not rec:
            return JsonResponse({"error": "record_id not found in REDCap"}, status=404)

        p = RedcapParticipant(
            record_id=str(rec.get("record_id") or record_id),
            gender=str(rec.get("gender") or ""),
            primary_diagnosis=str(rec.get("primary_diagnosis") or ""),
            clinic=str(rec.get("clinic") or ""),
            assigned_therapist=therapist,
            imported_by_user=user,
            last_synced_at=timezone.now(),
        )
        p.save()

        return JsonResponse({"ok": True, "id": str(p.id), "record_id": p.record_id}, status=201)

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@permission_classes([IsAuthenticated])
def list_my_redcap_participants(request):
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    user = request.user
    therapist = Therapist.objects.filter(userId=user).first()
    if not therapist:
        return JsonResponse({"error": "Only therapists"}, status=403)

    q = (request.GET.get("q") or "").strip().lower()
    clinic = (request.GET.get("clinic") or "").strip()

    qs = RedcapParticipant.objects(assigned_therapist=therapist, is_active=True)
    if clinic:
        qs = qs.filter(clinic=clinic)
    if q:
        qs = qs.filter(record_id__icontains=q)

    out = []
    for p in qs.order_by("-updated_at"):
        out.append(
            {
                "id": str(p.id),
                "record_id": p.record_id,
                "gender": p.gender,
                "primary_diagnosis": p.primary_diagnosis,
                "clinic": p.clinic,
                "last_synced_at": (p.last_synced_at.isoformat() if p.last_synced_at else None),
            }
        )

    return JsonResponse({"items": out}, status=200)
