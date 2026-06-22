"""
Custom JWT helpers for MongoEngine-backed users.

Django's default auth stack assumes integer primary keys on the SQL auth.User
model. This app stores users in MongoDB (MongoEngine) with ObjectId PKs, so
simplejwt's default helpers crash when they try to resolve a token's user_id
claim through the Django ORM:

    ValueError: Field 'id' expected a number but got '<ObjectId string>'

This module provides a Mongo-aware authentication override:
  - MongoJWTAuthentication: returns a lightweight authenticated user object
    instead of querying Django's auth.User table.
  - Also accepts the token from the httpOnly access_token cookie as a fallback
    to the standard Authorization: Bearer header, so @api_view endpoints work
    with cookie-based auth (same-origin production) and cross-port E2E tests.
"""

from types import SimpleNamespace

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.settings import api_settings


class MongoJWTAuthentication(JWTAuthentication):
    """JWT auth that reads from Bearer header OR httpOnly cookie."""

    def authenticate(self, request):
        # Try the standard Authorization: Bearer header first.
        result = super().authenticate(request)
        if result is not None:
            return result

        # Fall back to the httpOnly access_token cookie.
        raw_token = request.COOKIES.get("access_token")
        if not raw_token:
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        except Exception:
            return None

    def get_user(self, validated_token):
        try:
            user_id = validated_token[api_settings.USER_ID_CLAIM]
        except KeyError:
            raise InvalidToken("Token contained no recognizable user identification")

        # A minimal user-like object understood by DRF's permission checks and
        # by the _get_therapist() helper (which reads request.user.id).
        return SimpleNamespace(is_authenticated=True, id=str(user_id))
