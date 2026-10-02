from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from core.models import Logs
from core.permissions import IsAdmin


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_device_analytics(request):
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


ACTIVE_WINDOW = timedelta(minutes=15)
ACTIVE_ROLES = ("Patient", "Therapist", "Admin")
_LOGOUT_ACTIONS = ["LOGOUT", "FORCE_LOGOUT"]


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_active_users(request):
    """Distinct users per role with a logged action in the last 15 min; counts only, never identities."""
    now = timezone.now()
    pipeline = [
        {"$match": {"timestamp": {"$gte": now - ACTIVE_WINDOW}}},
        # Skip entries written on someone else's behalf (e.g. an admin editing a therapist), whose userId didn't act.
        {"$lookup": {"from": "users", "localField": "userId", "foreignField": "_id", "as": "user"}},
        {"$unwind": "$user"},
        {"$match": {"$expr": {"$eq": ["$userAgent", "$user.role"]}}},
        {"$sort": {"timestamp": -1}},
        {"$group": {"_id": "$userId", "role": {"$first": "$userAgent"}, "last_action": {"$first": "$action"}}},
        # Someone whose latest action was logging out has left.
        {"$match": {"last_action": {"$nin": _LOGOUT_ACTIONS}}},
        {"$group": {"_id": "$role", "count": {"$sum": 1}}},
    ]
    by_role = {role: 0 for role in ACTIVE_ROLES}
    for row in Logs.objects.aggregate(pipeline):
        role = row["_id"] or "Unknown"
        by_role[role] = by_role.get(role, 0) + row["count"]

    return Response(
        {
            "as_of": now.isoformat(),
            "window_minutes": int(ACTIVE_WINDOW.total_seconds() // 60),
            "total": sum(by_role.values()),
            "by_role": by_role,
        }
    )
