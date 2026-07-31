"""
JWT authentication enforcement middleware.

Background
──────────
Throughout the codebase, views are decorated with:

    @csrf_exempt
    @permission_classes([IsAuthenticated])
    def some_view(request): ...

Without the @api_view wrapper, DRF's authentication and permission machinery
never runs — @permission_classes is silently ignored on plain Django FBVs.
This left ~50 endpoints accessible without any credentials.

This middleware enforces JWT authentication at the Django request level,
before any view is reached, closing the gap for all routes at once.

What it does
────────────
• Checks the Authorization: Bearer <token> header on every /api/ request.
• Returns HTTP 401 if the header is missing or the token is invalid/expired.
• Does NOT perform role checks — those stay in per-view @permission_classes.
• Skips entirely in test environments (settings.TESTING = True) so tests that
  use DRF's force_authenticate() continue to work without modification.

Public routes (no token required)
──────────────────────────────────
• /api/auth/login/, /api/auth/register/, /api/auth/forgot-password/,
  /api/auth/send-verification-code/, /api/auth/verify-code/,
  /api/auth/token/refresh/ — these are how users obtain tokens
• /api/auth/logout/ — may be called even after a token expires
• /api/healthslider/ — ICF Monitor uses its own password+OTP protocol
• /api/fitbit/callback/ — called by Fitbit's OAuth server, not our users
• /api/ — root health probe
"""

import logging

from django.conf import settings
from django.http import JsonResponse
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

logger = logging.getLogger(__name__)
audit_logger = logging.getLogger("core.api_audit")

# Exact-match public paths (no token needed)
_PUBLIC_EXACT: frozenset[str] = frozenset(
    {
        "/api/",
        "/api/app-mode/",
    }
)

# Prefix-match public paths — any path starting with one of these is public
_PUBLIC_PREFIXES: tuple[str, ...] = (
    "/api/auth/login/",
    "/api/auth/register/",
    "/api/auth/logout/",
    "/api/auth/forgot-password/",
    "/api/auth/reset-password/",
    "/api/auth/send-verification-code/",
    "/api/auth/verify-code/",
    "/api/auth/token/",  # covers /api/auth/token/refresh/
    "/api/healthslider/",  # ICF Monitor — own auth protocol
    "/api/fitbit/callback/",  # Fitbit OAuth server callback
    "/api/google-health/callback/",  # Google OAuth server callback
)


class JWTAuthMiddleware:
    """Enforce Bearer token authentication on all /api/ routes."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Skip entirely in test environments so that force_authenticate()-based
        # unit/integration tests work without needing real JWT tokens.
        if getattr(settings, "TESTING", False):
            return self.get_response(request)

        path = request.path

        # Only apply to API routes
        if not path.startswith("/api/"):
            return self.get_response(request)

        # Public routes skip the token check
        if self._is_public(path):
            return self.get_response(request)

        # Accept token from httpOnly cookie (preferred) or Authorization header (fallback)
        token_str = request.COOKIES.get("access_token", "")
        if not token_str:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token_str = auth_header.split(" ", 1)[1]

        if not token_str:
            return JsonResponse(
                {"detail": "Authentication credentials were not provided."},
                status=401,
            )

        # Validate the token (signature + expiry)
        try:
            AccessToken(token_str)
        except (TokenError, Exception):
            return JsonResponse(
                {"detail": "Given token is not valid or has expired."},
                status=401,
            )

        return self.get_response(request)

    @staticmethod
    def _is_public(path: str) -> bool:
        if path in _PUBLIC_EXACT:
            return True
        return any(path.startswith(prefix) for prefix in _PUBLIC_PREFIXES)


class ApiAuditMiddleware:
    """
    Log every authenticated API request to the core.api_audit logger.

    In production (when LOG_DIR is set) this logger writes to a rotating file
    at <LOG_DIR>/api_access.log which is bind-mounted to the host — so the log
    survives container restarts and redeployments.

    Format per line:
        method path status user_id=<id> ip=<ip>

    Skips public routes (auth, healthslider) and test mode.
    User identity is extracted from the Bearer JWT without a DB lookup.
    For full user details (email, role) cross-reference with the MongoDB
    User collection using the logged user_id.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        if getattr(settings, "TESTING", False):
            return response

        path = request.path
        if not path.startswith("/api/") or JWTAuthMiddleware._is_public(path):
            return response

        auth_header = request.headers.get("Authorization", "")
        user_id = "-"
        if auth_header.startswith("Bearer "):
            try:
                token = AccessToken(auth_header.split(" ", 1)[1])
                user_id = str(token.get("user_id", "-"))
            except Exception:
                pass

        ip = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR", "-")

        audit_logger.info(
            "%s %s %s user_id=%s ip=%s",
            request.method,
            request.path,
            response.status_code,
            user_id,
            ip,
        )
        return response
