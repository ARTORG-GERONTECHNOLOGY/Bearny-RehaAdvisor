from bson import ObjectId
from rest_framework.permissions import BasePermission

from core.models import User


class IsAdmin(BasePermission):
    """Allow access only to active users with role="Admin"."""

    message = "Admin role required."

    def has_permission(self, request, view):
        if not getattr(request.user, "is_authenticated", False):
            return False
        try:
            user = User.objects.get(pk=ObjectId(request.user.id))
            return user.role == "Admin" and user.isActive
        except Exception:
            return False
