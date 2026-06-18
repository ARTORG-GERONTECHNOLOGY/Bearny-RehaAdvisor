"""
Test-only DRF authentication class.

Used only when DJANGO_SETTINGS_MODULE = api.settings.test.
Always authenticates so that view-level @permission_classes([IsAuthenticated])
passes without requiring a real JWT token in every test request.

Strategy:
- When a test uses RequestFactory and explicitly sets req.user = real_user,
  the DRF request._request.user will be that real_user. We pass it through
  (wrapped to add is_authenticated=True since MongoEngine User lacks it).
- When a test uses Django's test Client (no explicit req.user), the
  AuthenticationMiddleware sets request._request.user = AnonymousUser().
  We replace it with a synthetic test user so IsAuthenticated passes.

Tests that specifically verify 401/403 behaviour should patch the permission
class or use APIRequestFactory.force_authenticate().
"""
from types import SimpleNamespace

from bson import ObjectId

_TEST_USER_ID = str(ObjectId())
_TEST_USER = SimpleNamespace(is_authenticated=True, id=_TEST_USER_ID)


class _MongoUserProxy:
    """Thin proxy for MongoEngine User objects that adds is_authenticated."""

    is_authenticated = True

    def __init__(self, user):
        object.__setattr__(self, "_user", user)
        object.__setattr__(self, "id", str(user.id))

    def __getattr__(self, name):
        return getattr(object.__getattribute__(self, "_user"), name)

    def __setattr__(self, name, value):
        setattr(object.__getattribute__(self, "_user"), name, value)


class AlwaysAuthenticate:
    """
    Authenticate every request in tests.

    Pass through any real user set on the underlying Django request (via
    RequestFactory + req.user = ...), but replace AnonymousUser with a
    synthetic authenticated user so IsAuthenticated always passes.
    """

    def authenticate(self, request):
        try:
            underlying = request._request.user
        except AttributeError:
            return (_TEST_USER, None)

        from django.contrib.auth.models import AnonymousUser

        if isinstance(underlying, AnonymousUser):
            return (_TEST_USER, None)

        # If it already has is_authenticated (e.g. force_authenticate user),
        # pass it through as-is.
        if hasattr(underlying, "is_authenticated"):
            return (underlying, None)

        # MongoEngine User objects lack is_authenticated; wrap with a proxy.
        # If the user has no 'id' (malformed test setup), fall back to _TEST_USER.
        try:
            return (_MongoUserProxy(underlying), None)
        except Exception:
            return (_TEST_USER, None)

    def authenticate_header(self, request):
        return "Bearer"
