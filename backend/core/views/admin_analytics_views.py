from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.models import Logs


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_device_analytics(request):
    if request.user_obj.role != "Admin":
        return Response(status=403)

    pipeline = [
        {"$match": {"action": "LOGIN", "device_type": {"$exists": True, "$ne": None}}},
        {
            "$group": {
                "_id": {"device": "$device_type", "role": "$userAgent"},
                "count": {"$sum": 1},
            }
        },
    ]
    rows = list(Logs.objects.aggregate(pipeline))

    by_device: dict = {}
    by_role: dict = {}
    for row in rows:
        device = row["_id"]["device"] or "Unknown"
        role = row["_id"]["role"] or "Unknown"
        by_device[device] = by_device.get(device, 0) + row["count"]
        by_role.setdefault(role, {})[device] = by_role.get(role, {}).get(device, 0) + row["count"]

    return Response({"by_device": by_device, "by_role": by_role})
