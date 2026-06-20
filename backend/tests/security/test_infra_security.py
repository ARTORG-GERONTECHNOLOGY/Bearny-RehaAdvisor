"""
Infrastructure security tests — fix/security-infra

Covers the four hardening measures added alongside the code-level security
fixes.  Each section pins one security contract so regressions are caught
before they reach production.

Sections
--------
1. httpOnly JWT cookies  — login sets cookies; logout clears them; middleware
                           accepts a cookie in place of an Authorization header
2. Data retention        — prune_old_logs deletes expired activity entries and
                           keeps ADMIN_EXPORT entries for the compliance window
3. Content-Security-Policy — nginx config contains the CSP header directive
4. Beat schedule         — prune_old_logs is registered in CELERY_BEAT_SCHEDULE
"""

import json
from datetime import datetime, timedelta
from pathlib import Path

import mongomock
import pytest
from django.contrib.auth.hashers import make_password
from django.test import Client
from django.utils import timezone
from mongoengine import connect, disconnect
from rest_framework_simplejwt.tokens import AccessToken

from core.models import Logs, User

# ---------------------------------------------------------------------------
# Shared mongomock fixture
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def mongo_mock():
    alias = "default"
    from mongoengine.connection import _connections

    if alias in _connections:
        disconnect(alias)
    conn = connect(
        "mongoenginetest",
        alias=alias,
        host="mongodb://localhost",
        mongo_client_class=mongomock.MongoClient,
    )
    yield conn
    disconnect(alias)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_client = Client()
LOGIN_URL = "/api/auth/login/"
LOGOUT_URL = "/api/auth/logout/"


def _make_user(email="u@example.com", password="pass1234", role="Patient"):
    return User(
        username=email.split("@")[0],
        email=email,
        role=role,
        pwdhash=make_password(password),
        createdAt=datetime.now(),
        isActive=True,
    ).save()


def _make_jwt(username: str) -> str:
    token = AccessToken()
    token["username"] = username
    return str(token)


def _post(url, payload):
    return _client.post(url, data=json.dumps(payload), content_type="application/json")


# ===========================================================================
# 1. httpOnly JWT cookies
# ===========================================================================


def test_login_sets_access_token_cookie(mongo_mock):
    """Successful login must set an access_token cookie."""
    _make_user("c1@example.com", "pass1234")
    resp = _post(LOGIN_URL, {"email": "c1@example.com", "password": "pass1234"})

    assert resp.status_code == 200
    assert "access_token" in resp.cookies, "access_token cookie must be set on login"


def test_login_sets_refresh_token_cookie(mongo_mock):
    """Successful login must set a refresh_token cookie."""
    _make_user("c2@example.com", "pass1234")
    resp = _post(LOGIN_URL, {"email": "c2@example.com", "password": "pass1234"})

    assert resp.status_code == 200
    assert "refresh_token" in resp.cookies, "refresh_token cookie must be set on login"


def test_login_access_cookie_is_httponly(mongo_mock):
    """access_token cookie must carry the HttpOnly flag."""
    _make_user("c3@example.com", "pass1234")
    resp = _post(LOGIN_URL, {"email": "c3@example.com", "password": "pass1234"})

    assert resp.status_code == 200
    cookie = resp.cookies.get("access_token")
    assert cookie is not None
    assert cookie["httponly"], "access_token must be HttpOnly to prevent JS access"


def test_login_refresh_cookie_is_httponly(mongo_mock):
    """refresh_token cookie must carry the HttpOnly flag."""
    _make_user("c4@example.com", "pass1234")
    resp = _post(LOGIN_URL, {"email": "c4@example.com", "password": "pass1234"})

    assert resp.status_code == 200
    cookie = resp.cookies.get("refresh_token")
    assert cookie is not None
    assert cookie["httponly"], "refresh_token must be HttpOnly to prevent JS access"


def test_login_access_cookie_samesite_strict(mongo_mock):
    """access_token cookie must use SameSite=Strict to mitigate CSRF."""
    _make_user("c5@example.com", "pass1234")
    resp = _post(LOGIN_URL, {"email": "c5@example.com", "password": "pass1234"})

    assert resp.status_code == 200
    cookie = resp.cookies.get("access_token")
    assert cookie is not None
    assert cookie.get("samesite", "").lower() == "strict"


def test_logout_clears_access_token_cookie(mongo_mock):
    """logout must delete the access_token cookie (max-age 0 / empty value)."""
    user = _make_user("c6@example.com", "pass1234")
    resp = _post(LOGOUT_URL, {"userId": str(user.pk)})

    assert resp.status_code == 200
    # Django delete_cookie sets the value to "" and max-age to 0
    cookie = resp.cookies.get("access_token")
    assert cookie is not None, "logout must send a Set-Cookie for access_token to clear it"
    assert cookie.value == "" or cookie["max-age"] == 0


def test_logout_clears_refresh_token_cookie(mongo_mock):
    """logout must delete the refresh_token cookie."""
    user = _make_user("c7@example.com", "pass1234")
    resp = _post(LOGOUT_URL, {"userId": str(user.pk)})

    assert resp.status_code == 200
    cookie = resp.cookies.get("refresh_token")
    assert cookie is not None, "logout must send a Set-Cookie for refresh_token to clear it"
    assert cookie.value == "" or cookie["max-age"] == 0


def _make_middleware():
    """Return a JWTAuthMiddleware instance with a trivial downstream."""
    from django.http import HttpResponse

    from core.middleware import JWTAuthMiddleware

    def _passthrough(request):
        return HttpResponse("ok", status=200)

    return JWTAuthMiddleware(_passthrough)


def test_middleware_accepts_token_from_cookie(mongo_mock):
    """
    JWTAuthMiddleware must grant access when the token is in the access_token
    cookie rather than the Authorization header.

    The middleware skips auth in the TESTING environment (for test-client
    compatibility), so we call it directly with override_settings(TESTING=False)
    to exercise the real code path.
    """
    from django.test import RequestFactory, override_settings

    user = _make_user("c8@example.com", "pass1234")
    token = _make_jwt(user.username)

    request = RequestFactory().get("/api/protected/")
    request.COOKIES = {"access_token": token}

    middleware = _make_middleware()
    with override_settings(TESTING=False):
        response = middleware(request)

    assert response.status_code == 200, (
        f"Expected 200 with cookie-based JWT but got {response.status_code}. "
        "JWTAuthMiddleware may not be reading the access_token cookie."
    )


def test_middleware_rejects_request_with_no_token(mongo_mock):
    """A request with neither cookie nor Authorization header must get 401."""
    from django.test import RequestFactory, override_settings

    request = RequestFactory().get("/api/protected/")
    request.COOKIES = {}

    middleware = _make_middleware()
    with override_settings(TESTING=False):
        response = middleware(request)

    assert response.status_code == 401


# ===========================================================================
# 2. Data retention — prune_old_logs
# ===========================================================================


@pytest.fixture()
def _log_user(mongo_mock):
    return _make_user("loguser@example.com", "pass1234", role="Patient")


def _make_log(action="LOGIN", age_days=0, user=None):
    """Create a Logs entry with a timestamp offset by age_days into the past."""
    ts = timezone.now() - timedelta(days=age_days)
    return Logs(
        userId=user,
        action=action,
        actor_role="Patient",
        timestamp=ts,
    ).save()


def test_prune_deletes_old_activity_logs(mongo_mock):
    """Logs older than LOG_RETENTION_DAYS (default 365) must be deleted."""
    from core.tasks import prune_old_logs

    user = _make_user("prune1@example.com", "pass1234")
    _make_log(action="LOGIN", age_days=400, user=user)  # old — should be pruned
    _make_log(action="LOGIN", age_days=10, user=user)  # recent — must survive

    result = prune_old_logs()

    assert result["deleted_activity"] == 1
    assert Logs.objects(action="LOGIN").count() == 1


def test_prune_keeps_recent_activity_logs(mongo_mock):
    """Logs within the retention window must not be deleted."""
    from core.tasks import prune_old_logs

    user = _make_user("prune2@example.com", "pass1234")
    _make_log(action="LOGOUT", age_days=30, user=user)

    prune_old_logs()

    assert Logs.objects(action="LOGOUT").count() == 1


def test_prune_keeps_admin_export_within_compliance_window(mongo_mock):
    """
    ADMIN_EXPORT entries older than the activity retention but within the
    compliance window (default 5 years) must NOT be deleted.
    """
    from core.tasks import prune_old_logs

    user = _make_user("prune3@example.com", "pass1234")
    _make_log(action="ADMIN_EXPORT", age_days=400, user=user)  # beyond 365, but < 5 years

    result = prune_old_logs()

    assert result["deleted_exports"] == 0
    assert Logs.objects(action="ADMIN_EXPORT").count() == 1


def test_prune_deletes_very_old_admin_export_logs(mongo_mock):
    """ADMIN_EXPORT entries beyond the compliance window (5 years) are deleted."""
    from core.tasks import prune_old_logs

    user = _make_user("prune4@example.com", "pass1234")
    _make_log(action="ADMIN_EXPORT", age_days=2000, user=user)  # ~5.5 years

    result = prune_old_logs()

    assert result["deleted_exports"] == 1


def test_prune_returns_counts(mongo_mock):
    """prune_old_logs must return a dict with deleted_activity and deleted_exports."""
    from core.tasks import prune_old_logs

    result = prune_old_logs()

    assert "deleted_activity" in result
    assert "deleted_exports" in result


# ===========================================================================
# 3. Content-Security-Policy in nginx config (static check)
# ===========================================================================

# nginx config is mounted in the nginx container, not django.
# Try a few candidate paths so the tests work both on the host (running pytest
# directly) and inside the django container if the repo root happens to be
# accessible via a bind mount.
_NGINX_CONF = next(
    (
        p
        for p in [
            Path(__file__).resolve().parents[2] / "nginx" / "conf" / "prod.reha-advisor.nginx.conf",
            Path("/home/ubuntu/repos/telerehabapp/nginx/conf/prod.reha-advisor.nginx.conf"),
        ]
        if p.exists()
    ),
    None,
)

_skip_nginx = pytest.mark.skipif(
    _NGINX_CONF is None,
    reason="nginx config not accessible from this test environment (run on host)",
)


@_skip_nginx
def test_nginx_conf_has_content_security_policy():
    """prod nginx config must contain a Content-Security-Policy header directive."""
    text = _NGINX_CONF.read_text()
    assert "Content-Security-Policy" in text, (
        "Content-Security-Policy header missing from prod nginx config. " "XSS mitigation relies on this header."
    )


@_skip_nginx
def test_nginx_csp_blocks_object_src():
    """CSP must contain object-src 'none' to block plugin-based attacks."""
    text = _NGINX_CONF.read_text()
    assert "object-src 'none'" in text


@_skip_nginx
def test_nginx_csp_sets_frame_ancestors_none():
    """CSP must include frame-ancestors 'none' to prevent clickjacking."""
    text = _NGINX_CONF.read_text()
    assert "frame-ancestors 'none'" in text


# ===========================================================================
# 4. Beat schedule — prune_old_logs registered
# ===========================================================================


def test_prune_old_logs_in_beat_schedule(mongo_mock):
    """prune_old_logs must appear in CELERY_BEAT_SCHEDULE so it actually runs."""
    from django.conf import settings

    schedule = getattr(settings, "CELERY_BEAT_SCHEDULE", {})
    task_names = [entry.get("task") for entry in schedule.values()]
    assert "core.tasks.prune_old_logs" in task_names, (
        "prune_old_logs not found in CELERY_BEAT_SCHEDULE — " "log retention will never run automatically."
    )
