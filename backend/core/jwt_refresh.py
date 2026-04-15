"""Mongo-aware JWT refresh serializer/view."""

from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.views import TokenRefreshView

from core.models import User


class MongoTokenRefreshSerializer(TokenRefreshSerializer):
    """
    Refresh JWTs without querying Django's SQL auth.User model.

    The stock TokenRefreshSerializer validates the token's ``user_id`` claim
    via ``get_user_model().objects.get(id=...)``, which crashes for our Mongo
    ObjectId strings. We instead resolve the token subject against the
    MongoEngine ``core.models.User`` collection.
    """

    def validate(self, attrs):
        refresh = self.token_class(attrs["refresh"])

        user_id = refresh.payload.get(api_settings.USER_ID_CLAIM, None)
        if user_id:
            user = User.objects(id=str(user_id)).first()
            if not user or not getattr(user, "isActive", False):
                raise AuthenticationFailed(
                    self.error_messages["no_active_account"],
                    "no_active_account",
                )

        data = {"access": str(refresh.access_token)}

        if api_settings.ROTATE_REFRESH_TOKENS:
            if api_settings.BLACKLIST_AFTER_ROTATION:
                try:
                    refresh.blacklist()
                except AttributeError:
                    pass

            refresh.set_jti()
            refresh.set_exp()
            refresh.set_iat()
            refresh.outstand()

            data["refresh"] = str(refresh)

        return data


class MongoTokenRefreshView(TokenRefreshView):
    """Use the Mongo-aware refresh serializer for /api/auth/token/refresh/."""

    serializer_class = MongoTokenRefreshSerializer
