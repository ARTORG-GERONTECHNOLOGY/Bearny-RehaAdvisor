from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from core.models import Logs, User
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


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_active_users(request):
    """Distinct users per role active in the last 15 min, plus registered account totals; counts only."""
    now = timezone.now()
    pipeline = [
        {"$match": {"timestamp": {"$gte": now - ACTIVE_WINDOW}}},
        # Skip entries written on someone else's behalf (e.g. an admin editing a therapist), whose userId didn't act.
        {"$lookup": {"from": "users", "localField": "userId", "foreignField": "_id", "as": "user"}},
        {"$unwind": "$user"},
        {"$match": {"$expr": {"$eq": ["$userAgent", "$user.role"]}}},
        {"$group": {"_id": "$userId", "role": {"$first": "$user.role"}}},
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
            "registered": _registered_accounts(),
        }
    )


def _registered_accounts():
    # Like login, anything but isActive=True is inactive (awaiting approval or soft-deleted).
    by_role = {role: 0 for role in ACTIVE_ROLES}
    inactive = 0
    pipeline = [
        {"$match": {"role": {"$in": list(ACTIVE_ROLES)}}},
        {"$group": {"_id": {"role": "$role", "active": "$isActive"}, "count": {"$sum": 1}}},
    ]
    for row in User.objects.aggregate(pipeline):
        if row["_id"].get("active") is True:
            by_role[row["_id"]["role"]] += row["count"]
        else:
            inactive += row["count"]
    return {"active": sum(by_role.values()), "by_role": by_role, "inactive": inactive}
