"""
Custom JWT authentication backend for MongoEngine.

Django's default User model uses an integer primary key. This app stores users
in MongoDB (MongoEngine) with ObjectId PKs. The simplejwt default get_user()
calls Django ORM and crashes with:

    ValueError: Field 'id' expected a number but got '<ObjectId string>'

This subclass overrides get_user() to return a minimal user-like object that:
  - satisfies DRF's IsAuthenticated permission check (is_authenticated=True)
  - exposes `id` as the raw MongoDB ObjectId string from the JWT user_id claim
    so that _get_therapist() and get_therapist_for_user() can look up Therapist

No database (SQL or Mongo) query is made during authentication; the Therapist
lookup happens inside each view function after the token is validated.
"""

from types import SimpleNamespace

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.settings import api_settings


class MongoJWTAuthentication(JWTAuthentication):
    """JWT auth that returns a lightweight user object instead of an ORM lookup."""

    def get_user(self, validated_token):
        try:
            user_id = validated_token[api_settings.USER_ID_CLAIM]
        except KeyError:
            raise InvalidToken("Token contained no recognizable user identification")

        # A minimal user-like object understood by DRF's permission checks and
        # by the _get_therapist() helper (which reads request.user.id).
        return SimpleNamespace(is_authenticated=True, id=str(user_id))
