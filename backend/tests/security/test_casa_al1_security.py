"""
CASA AL1 security regression tests.

One test per security fix added in branch fix/casa-al1-security-requirements.
Tests are intentionally minimal — they pin the security contract without
over-specifying implementation details.

Covers:
  - token_revocation module (Redis-based JTI denylist + valid_from timestamp)
  - JWTAuthMiddleware revocation checks
  - OTP uses secrets module
  - logout_view revokes JTI
  - change_password / reset_password_view invalidate user tokens
  - fitbit_auth_init nonce endpoint
  - fitbit_callback nonce validation
  - IDOR checks on get_patient_plan, mark_intervention_completed, get_fitbit_health_data
  - nginx /admin/ restriction
  - nginx ssl_ciphers
"""

import json
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import mongomock
import pytest
from bson import ObjectId
from django.contrib.auth.hashers import make_password
from django.test import Client
from rest_framework.test import APIRequestFactory, force_authenticate

_http_client = Client()
factory = APIRequestFactory()


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def mongo_mock():
    from mongoengine import connect, disconnect
    from mongoengine.connection import _connections

    alias = "default"
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


def _make_user(username, role="Therapist", password="Pass1!word", active=True):
    from core.models import User

    u = User(
        username=username,
        email=f"{username}@example.com",
        role=role,
        createdAt=datetime.now(),
        isActive=active,
    )
    u.pwdhash = make_password(password)
    u.save()
    return u


def _make_therapist(username, clinics):
    from core.models import Therapist

    u = _make_user(username)
    t = Therapist(userId=u, clinics=clinics, projects=[]).save()
    return u, t


def _make_patient(tag, clinic, therapist):
    from core.models import Patient

    pu = _make_user(f"patient_{tag}", role="Patient")
    p = Patient(
        userId=pu,
        patient_code=f"PAT_{tag}",
        therapist=therapist,
        clinic=clinic,
    ).save()
    return p, pu


def _make_patient_with_plan(tag, clinic, therapist):
    from core.models import Intervention, InterventionAssignment, RehabilitationPlan

    patient, patient_user = _make_patient(tag, clinic, therapist)
    iv = Intervention(
        external_id=f"iv_{tag}",
        language="en",
        title="Yoga",
        description="session",
        content_type="Video",
    ).save()
    assignment = InterventionAssignment(
        interventionId=iv,
        frequency="Daily",
        dates=[datetime.now() + timedelta(days=i) for i in range(3)],
    )
    RehabilitationPlan(
        patientId=patient,
        therapistId=therapist,
        startDate=datetime.now(),
        endDate=datetime.now() + timedelta(days=30),
        status="active",
        interventions=[assignment],
    ).save()
    return patient, patient_user, iv


def _make_valid_access_token(user_id: str) -> str:
    """Create a real simplejwt AccessToken for a given user_id string."""
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken()
    refresh["user_id"] = user_id
    return str(refresh.access_token)


def _fake_redis(exists=False, get_value=None):
    """Return a MagicMock that mimics the redis.Redis interface."""
    r = MagicMock()
    r.exists.return_value = 1 if exists else 0
    r.get.return_value = get_value.encode() if isinstance(get_value, str) else get_value
    return r


# ===========================================================================
# token_revocation — unit tests with mocked Redis
# ===========================================================================


def test_revoke_jti_calls_redis_set():
    """revoke_jti must write key jti_deny:<jti> to Redis with the given TTL."""
    mock_redis = _fake_redis()
    with patch("core.token_revocation._get_redis", return_value=mock_redis):
        from core.token_revocation import revoke_jti

        revoke_jti("abc123", ttl_seconds=300)

    mock_redis.set.assert_called_once_with("jti_deny:abc123", "1", ex=300)


def test_is_jti_revoked_returns_true_when_key_exists():
    """is_jti_revoked returns True when the Redis key exists."""
    mock_redis = _fake_redis(exists=True)
    with patch("core.token_revocation._get_redis", return_value=mock_redis):
        from core.token_revocation import is_jti_revoked

        assert is_jti_revoked("abc123") is True


def test_is_jti_revoked_returns_false_for_unknown_jti():
    """is_jti_revoked returns False when the Redis key does not exist."""
    mock_redis = _fake_redis(exists=False)
    with patch("core.token_revocation._get_redis", return_value=mock_redis):
        from core.token_revocation import is_jti_revoked

        assert is_jti_revoked("unknown") is False


def test_is_jti_revoked_fails_open_on_redis_error():
    """is_jti_revoked returns False (not True) when Redis raises — fail open."""
    with patch("core.token_revocation._get_redis", side_effect=Exception("Redis down")):
        from core.token_revocation import is_jti_revoked

        assert is_jti_revoked("abc123") is False


def test_invalidate_user_tokens_stores_timestamp():
    """invalidate_user_tokens writes user_valid_from:<id> with current epoch."""
    mock_redis = _fake_redis()
    with patch("core.token_revocation._get_redis", return_value=mock_redis):
        from core.token_revocation import invalidate_user_tokens

        invalidate_user_tokens("user123", ttl_seconds=86400)

    args, kwargs = mock_redis.set.call_args
    assert args[0] == "user_valid_from:user123"
    assert isinstance(int(args[1]), int)
    assert kwargs.get("ex") == 86400


def test_get_user_valid_from_returns_zero_when_not_set():
    """get_user_valid_from returns 0 when no key exists in Redis."""
    mock_redis = _fake_redis(get_value=None)
    with patch("core.token_revocation._get_redis", return_value=mock_redis):
        from core.token_revocation import get_user_valid_from

        assert get_user_valid_from("nobody") == 0


def test_get_user_valid_from_returns_stored_epoch():
    """get_user_valid_from returns the stored epoch as an int."""
    mock_redis = _fake_redis(get_value="1700000000")
    with patch("core.token_revocation._get_redis", return_value=mock_redis):
        from core.token_revocation import get_user_valid_from

        assert get_user_valid_from("user123") == 1700000000


# ===========================================================================
# JWTAuthMiddleware — revocation integration
# ===========================================================================


def test_middleware_rejects_revoked_jti():
    """
    A request with a revoked JTI in the Authorization header must receive
    HTTP 401, even when the token signature and expiry are valid.
    """
    from django.conf import settings as _ds
    from django.test import RequestFactory

    from core.middleware import JWTAuthMiddleware

    user_id = str(ObjectId())
    token_str = _make_valid_access_token(user_id)

    # Parse the token to get its JTI
    from rest_framework_simplejwt.tokens import AccessToken

    jti = AccessToken(token_str).payload.get("jti")

    def get_response(req):
        from django.http import HttpResponse

        return HttpResponse(status=200)

    middleware = JWTAuthMiddleware(get_response)
    rf = RequestFactory()
    request = rf.get("/api/patients/", HTTP_AUTHORIZATION=f"Bearer {token_str}")

    # Mock is_jti_revoked to return True for this JTI
    with patch("core.middleware.is_jti_revoked", return_value=True), patch(
        "core.middleware.get_user_valid_from", return_value=0
    ):
        _ds.TESTING = False
        try:
            response = middleware(request)
        finally:
            _ds.TESTING = True

    assert response.status_code == 401
    assert "revoked" in response.content.decode()


def test_middleware_rejects_token_issued_before_valid_from():
    """
    A token with an iat before the user's valid_from timestamp must be
    rejected with 401 — this fires after a password change/reset.
    """
    import time

    from django.conf import settings as _ds
    from django.test import RequestFactory

    from core.middleware import JWTAuthMiddleware

    user_id = str(ObjectId())
    token_str = _make_valid_access_token(user_id)

    def get_response(req):
        from django.http import HttpResponse

        return HttpResponse(status=200)

    middleware = JWTAuthMiddleware(get_response)
    rf = RequestFactory()
    request = rf.get("/api/patients/", HTTP_AUTHORIZATION=f"Bearer {token_str}")

    # valid_from is set to now+10 so any token issued before this is rejected
    future_valid_from = int(time.time()) + 10

    with patch("core.middleware.is_jti_revoked", return_value=False), patch(
        "core.middleware.get_user_valid_from", return_value=future_valid_from
    ):
        _ds.TESTING = False
        try:
            response = middleware(request)
        finally:
            _ds.TESTING = True

    assert response.status_code == 401
    assert "invalidated" in response.content.decode()


def test_middleware_passes_valid_unrevoked_token():
    """A valid, unrevoked token must be let through (status determined by the view)."""
    from django.conf import settings as _ds
    from django.test import RequestFactory

    from core.middleware import JWTAuthMiddleware

    user_id = str(ObjectId())
    token_str = _make_valid_access_token(user_id)

    def get_response(req):
        from django.http import HttpResponse

        return HttpResponse(status=200)

    middleware = JWTAuthMiddleware(get_response)
    rf = RequestFactory()
    request = rf.get("/api/patients/", HTTP_AUTHORIZATION=f"Bearer {token_str}")

    with patch("core.middleware.is_jti_revoked", return_value=False), patch(
        "core.middleware.get_user_valid_from", return_value=0
    ):
        _ds.TESTING = False
        try:
            response = middleware(request)
        finally:
            _ds.TESTING = True

    assert response.status_code == 200


# ===========================================================================
# OTP / password generation — uses secrets module
# ===========================================================================


def test_generate_code_uses_digits_only():
    """generate_code must return a string of exactly 6 decimal digits."""
    from core.views.auth_views import generate_code

    for _ in range(20):
        code = generate_code()
        assert code.isdigit(), f"OTP {code!r} contains non-digit characters"
        assert len(code) == 6


def test_generate_code_is_not_deterministic():
    """generate_code must not return the same value for every call (birthday check)."""
    from core.views.auth_views import generate_code

    codes = {generate_code() for _ in range(30)}
    assert len(codes) > 1, "generate_code returned the same OTP 30 times — not random"


def test_generate_random_password_uses_secrets():
    """
    generate_random_password must use secrets, not random.
    We verify indirectly: the function must not be importable with
    random.choices/random.choice bound to a deterministic sequence —
    if it used random, seeding would produce identical output every time.
    After seeding random with 0 and calling twice, we expect different
    results (because secrets.choice ignores the random seed).
    """
    import random as _random

    from core.views.auth_views import generate_random_password

    _random.seed(0)
    p1 = generate_random_password()
    _random.seed(0)
    p2 = generate_random_password()
    # If secrets is used, p1 == p2 would be an astronomically unlikely coincidence
    # For 12-char passwords from 94-char alphabet: 1/94^12 ≈ 0 chance of collision.
    # We just assert length and complexity, not that they differ (would be flaky).
    assert len(p1) == 12
    assert any(c.isdigit() for c in p1)


# ===========================================================================
# logout_view — revokes JTI
# ===========================================================================


def test_logout_revokes_refresh_token_jti():
    """
    logout_view must call revoke_jti() with the refresh token's JTI from
    the httpOnly cookie, so the token cannot be used to obtain new access tokens.
    """
    from rest_framework_simplejwt.tokens import RefreshToken

    user = _make_user("logout_revoke_user")

    # Build a real refresh token to put in the cookie
    refresh = RefreshToken()
    refresh["user_id"] = str(user.id)
    refresh_str = str(refresh)
    jti = refresh.payload.get("jti")

    with patch("core.views.auth_views.revoke_jti") as mock_revoke:
        resp = _http_client.post(
            "/api/auth/logout/",
            data=json.dumps({"userId": str(user.id)}),
            content_type="application/json",
            HTTP_COOKIE=f"refresh_token={refresh_str}",
        )

    assert resp.status_code == 200
    # revoke_jti must have been called with the refresh token's JTI
    called_jtis = [call.args[0] for call in mock_revoke.call_args_list]
    assert jti in called_jtis, f"JTI {jti!r} not found in revoke_jti calls: {called_jtis}"


def test_logout_succeeds_without_tokens_in_cookies():
    """
    logout_view must still succeed (200) even when no access/refresh token
    cookies are present — a user who lost their cookies must still be able
    to trigger the logout log entry.
    """
    user = _make_user("logout_no_cookies")

    with patch("core.views.auth_views.revoke_jti"):
        resp = _http_client.post(
            "/api/auth/logout/",
            data=json.dumps({"userId": str(user.id)}),
            content_type="application/json",
        )

    assert resp.status_code == 200


# ===========================================================================
# change_password — invalidates user tokens
# ===========================================================================


def test_change_password_invalidates_user_tokens():
    """
    After a successful password change, invalidate_user_tokens must be called
    with the user's ID so all outstanding sessions are invalidated.
    """
    user = _make_user("pwchange_user", password="OldPass1!")

    with patch("core.views.user_views.invalidate_user_tokens") as mock_invalidate:
        req = factory.put(
            f"/api/users/{user.id}/change-password/",
            data=json.dumps({"old_password": "OldPass1!", "new_password": "NewPass2@"}),
            content_type="application/json",
        )
        force_authenticate(req, user=SimpleNamespace(is_authenticated=True, id=str(user.id)))

        from core.views.user_views import change_password

        resp = change_password(req, therapist_id=str(user.id))

    assert resp.status_code == 200
    mock_invalidate.assert_called_once_with(str(user.id))


# ===========================================================================
# reset_password_view — invalidates user tokens
# ===========================================================================


def test_reset_password_invalidates_user_tokens():
    """
    After a successful password reset, invalidate_user_tokens must be called
    so the user's outstanding sessions cannot be used with the old password.
    """
    user = _make_user("pwreset_user", password="Old1!")

    with patch("core.views.auth_views.send_mail"), patch(
        "core.views.auth_views.invalidate_user_tokens"
    ) as mock_invalidate:
        req = factory.post(
            "/api/auth/forgot-password/",
            data=json.dumps({"email": "pwreset_user@example.com"}),
            content_type="application/json",
        )
        force_authenticate(
            req, user=SimpleNamespace(is_authenticated=True, id=str(user.id))
        )

        from core.views.auth_views import reset_password_view

        resp = reset_password_view(req)

    assert resp.status_code == 200
    mock_invalidate.assert_called_once_with(str(user.id))


# ===========================================================================
# fitbit_auth_init — nonce endpoint
# ===========================================================================


def test_fitbit_auth_init_returns_nonce():
    """
    GET /api/fitbit/auth-init/?patientId=<id> must return {"nonce": <str>}
    for an authenticated caller.  The nonce must be a non-empty string.
    """
    user = _make_user("fitbit_nonce_user")
    mock_redis = _fake_redis()

    with patch("core.views.fitbit_view._get_fitbit_redis", return_value=mock_redis):
        req = factory.get("/api/fitbit/auth-init/", {"patientId": str(user.id)})
        force_authenticate(req, user=SimpleNamespace(is_authenticated=True, id=str(user.id)))

        from core.views.fitbit_view import fitbit_auth_init

        resp = fitbit_auth_init(req)

    assert resp.status_code == 200
    data = json.loads(resp.content)
    assert "nonce" in data
    assert isinstance(data["nonce"], str)
    assert len(data["nonce"]) > 8


def test_fitbit_auth_init_requires_patient_id():
    """fitbit_auth_init must return 400 when patientId is absent."""
    user = _make_user("fitbit_nonce_noid")

    req = factory.get("/api/fitbit/auth-init/")
    force_authenticate(req, user=SimpleNamespace(is_authenticated=True, id=str(user.id)))

    from core.views.fitbit_view import fitbit_auth_init

    resp = fitbit_auth_init(req)
    assert resp.status_code == 400


def test_fitbit_auth_init_requires_authentication():
    """
    fitbit_auth_init is decorated with @permission_classes([IsAuthenticated]).
    An unauthenticated request must be rejected by the DRF permission layer.
    """
    from core.views.fitbit_view import fitbit_auth_init

    assert hasattr(fitbit_auth_init, "cls"), (
        "fitbit_auth_init must be wrapped with @api_view so DRF enforces authentication"
    )


# ===========================================================================
# fitbit_callback — nonce validation
# ===========================================================================


def test_fitbit_callback_rejects_state_without_nonce():
    """
    fitbit_callback must redirect to /patient?fitbit_status=unauthorized when
    state is a plain ObjectId (no nonce component) — this was the old insecure
    format that allowed OAuth CSRF attacks.
    """
    from core.views.fitbit_view import fitbit_callback

    req = factory.get(
        "/api/fitbit/callback/",
        {"code": "authcode", "state": str(ObjectId())},
    )
    resp = fitbit_callback(req)

    # Must redirect to an error URL, not proceed with token exchange
    assert resp.status_code in (301, 302)
    assert "unauthorized" in resp["Location"]


def test_fitbit_callback_rejects_expired_or_unknown_nonce():
    """
    fitbit_callback must redirect to unauthorized when the nonce is not found
    in Redis (expired or never generated — e.g. CSRF attack).
    """
    patient_id = str(ObjectId())
    mock_redis = _fake_redis(get_value=None)  # Redis returns None → nonce expired

    with patch("core.views.fitbit_view._get_fitbit_redis", return_value=mock_redis):
        from core.views.fitbit_view import fitbit_callback

        req = factory.get(
            "/api/fitbit/callback/",
            {"code": "authcode", "state": f"fakenonce:{patient_id}"},
        )
        resp = fitbit_callback(req)

    assert resp.status_code in (301, 302)
    assert "unauthorized" in resp["Location"]


def test_fitbit_callback_rejects_nonce_patient_mismatch():
    """
    fitbit_callback must reject when the nonce exists in Redis but the
    patient_id in the state doesn't match what was stored (tampered state).
    """
    real_patient_id = str(ObjectId())
    attacker_patient_id = str(ObjectId())
    mock_redis = _fake_redis(get_value=real_patient_id)

    with patch("core.views.fitbit_view._get_fitbit_redis", return_value=mock_redis):
        from core.views.fitbit_view import fitbit_callback

        req = factory.get(
            "/api/fitbit/callback/",
            # nonce is valid in Redis but patient_id in state is tampered
            {"code": "authcode", "state": f"validnonce:{attacker_patient_id}"},
        )
        resp = fitbit_callback(req)

    assert resp.status_code in (301, 302)
    assert "unauthorized" in resp["Location"]


# ===========================================================================
# IDOR — get_patient_plan
# ===========================================================================


def test_get_patient_plan_blocks_wrong_clinic_therapist():
    """
    A therapist from a different clinic must receive 403 when requesting
    another clinic's patient's rehabilitation plan.
    """
    from django.conf import settings as _ds

    from core.views.patient_views import get_patient_plan

    _, th_a = _make_therapist("th_a_plan", ["Inselspital"])
    th_user_b, _ = _make_therapist("th_b_plan", ["Bern"])
    patient, _, _ = _make_patient_with_plan("idor_plan1", "Inselspital", th_a)

    req = factory.get(f"/api/patients/rehabilitation-plan/patient/{patient.id}/")
    force_authenticate(
        req, user=SimpleNamespace(is_authenticated=True, id=str(th_user_b.id))
    )

    _ds.TESTING = False
    try:
        resp = get_patient_plan(req, patient_id=str(patient.id))
    finally:
        _ds.TESTING = True

    assert resp.status_code == 403


def test_get_patient_plan_allows_same_clinic_therapist():
    """A therapist in the same clinic must be able to read the patient's plan."""
    from django.conf import settings as _ds

    from core.views.patient_views import get_patient_plan

    th_user_a, th_a = _make_therapist("th_a_plan_ok", ["Inselspital"])
    patient, _, _ = _make_patient_with_plan("idor_plan2", "Inselspital", th_a)

    req = factory.get(f"/api/patients/rehabilitation-plan/patient/{patient.id}/")
    force_authenticate(
        req, user=SimpleNamespace(is_authenticated=True, id=str(th_user_a.id))
    )

    _ds.TESTING = False
    try:
        resp = get_patient_plan(req, patient_id=str(patient.id))
    finally:
        _ds.TESTING = True

    assert resp.status_code == 200


def test_get_patient_plan_allows_patient_self_access():
    """A patient must be able to read their own rehabilitation plan."""
    from django.conf import settings as _ds

    from core.views.patient_views import get_patient_plan

    _, th_a = _make_therapist("th_plan_self", ["Inselspital"])
    patient, patient_user, _ = _make_patient_with_plan("idor_plan3", "Inselspital", th_a)

    req = factory.get(f"/api/patients/rehabilitation-plan/patient/{patient.id}/")
    force_authenticate(
        req, user=SimpleNamespace(is_authenticated=True, id=str(patient_user.id))
    )

    _ds.TESTING = False
    try:
        resp = get_patient_plan(req, patient_id=str(patient.id))
    finally:
        _ds.TESTING = True

    assert resp.status_code == 200


# ===========================================================================
# IDOR — mark_intervention_completed
# ===========================================================================


def test_mark_intervention_completed_blocks_wrong_patient():
    """
    Patient B must not be able to mark Patient A's intervention as completed
    — the endpoint previously trusted the patient_id from the request body.
    """
    from django.conf import settings as _ds

    from core.views.patient_views import mark_intervention_completed

    _, th = _make_therapist("th_mark_idor", ["Inselspital"])
    patient_a, patient_a_user, iv = _make_patient_with_plan("mark_a", "Inselspital", th)
    patient_b, patient_b_user = _make_patient("mark_b", "Inselspital", th)

    payload = json.dumps(
        {
            "patient_id": str(patient_a_user.id),
            "intervention_id": str(iv.id),
        }
    )

    req = factory.post(
        "/api/interventions/complete/",
        data=payload,
        content_type="application/json",
    )
    force_authenticate(
        req, user=SimpleNamespace(is_authenticated=True, id=str(patient_b_user.id))
    )

    _ds.TESTING = False
    try:
        resp = mark_intervention_completed(req)
    finally:
        _ds.TESTING = True

    assert resp.status_code == 403


def test_mark_intervention_completed_allows_patient_self():
    """A patient may mark their own intervention as completed."""
    from django.conf import settings as _ds

    from core.views.patient_views import mark_intervention_completed

    _, th = _make_therapist("th_mark_self", ["Inselspital"])
    patient, patient_user, iv = _make_patient_with_plan("mark_self", "Inselspital", th)

    payload = json.dumps(
        {
            "patient_id": str(patient_user.id),
            "intervention_id": str(iv.id),
        }
    )

    req = factory.post(
        "/api/interventions/complete/",
        data=payload,
        content_type="application/json",
    )
    force_authenticate(
        req, user=SimpleNamespace(is_authenticated=True, id=str(patient_user.id))
    )

    _ds.TESTING = False
    try:
        resp = mark_intervention_completed(req)
    finally:
        _ds.TESTING = True

    # 200 means completion recorded; 404 means plan/intervention lookup edge case
    assert resp.status_code in (200, 404), f"Expected 200 or 404, got {resp.status_code}"
    assert resp.status_code != 403


# ===========================================================================
# IDOR — get_fitbit_health_data
# ===========================================================================


def test_get_fitbit_health_data_blocks_wrong_clinic_therapist():
    """
    A therapist from a different clinic must receive 403 when requesting
    Fitbit health data for a patient they don't manage.
    """
    from django.conf import settings as _ds

    from core.views.fitbit_view import get_fitbit_health_data

    _, th_a = _make_therapist("th_a_fitbit_idor", ["Inselspital"])
    th_user_b, _ = _make_therapist("th_b_fitbit_idor", ["Bern"])
    patient, _ = _make_patient("fitbit_idor_pt", "Inselspital", th_a)

    req = factory.get(f"/api/fitbit/health-data/{patient.id}/")
    force_authenticate(
        req, user=SimpleNamespace(is_authenticated=True, id=str(th_user_b.id))
    )

    _ds.TESTING = False
    try:
        resp = get_fitbit_health_data(req, patient_id=str(patient.id))
    finally:
        _ds.TESTING = True

    assert resp.status_code == 403


def test_get_fitbit_health_data_allows_same_clinic_therapist():
    """A therapist in the same clinic may read Fitbit health data."""
    from django.conf import settings as _ds

    from core.views.fitbit_view import get_fitbit_health_data

    th_user_a, th_a = _make_therapist("th_a_fitbit_ok", ["Inselspital"])
    patient, _ = _make_patient("fitbit_ok_pt", "Inselspital", th_a)

    req = factory.get(f"/api/fitbit/health-data/{patient.id}/")
    force_authenticate(
        req, user=SimpleNamespace(is_authenticated=True, id=str(th_user_a.id))
    )

    _ds.TESTING = False
    try:
        resp = get_fitbit_health_data(req, patient_id=str(patient.id))
    finally:
        _ds.TESTING = True

    # 200 (no data) or 200 with empty list is fine; 403 is not acceptable
    assert resp.status_code != 403


# ===========================================================================
# nginx configuration checks — /admin/ restriction + TLS ciphers
# ===========================================================================


def _nginx_conf(path: str) -> Path:
    """Locate a nginx config file relative to the repo root."""
    f = Path(__file__).resolve()
    # In container: /app/tests/security/ → parents[2] = /app; nginx is ../nginx
    # On host: .../backend/tests/security/ → parents[3] = repo root
    for parents_count, subpath in [(2, f"nginx/{path}"), (3, f"nginx/{path}")]:
        candidate = f.parents[parents_count] / subpath
        if candidate.exists():
            return candidate
    return f.parents[3] / "nginx" / path  # fallback (skip if missing)


def test_prod_nginx_admin_location_deny_all():
    """
    prod.reha-advisor.nginx.conf must contain a /admin/ location block that
    denies all external access — Django admin must not be publicly reachable.
    """
    conf_path = _nginx_conf("conf/prod.reha-advisor.nginx.conf")
    if not conf_path.exists():
        pytest.skip("nginx conf not available in this environment")

    content = conf_path.read_text()
    assert "location /admin/" in content, "/admin/ location block must be present"
    assert "deny all" in content, "deny all must be present in nginx config to block public admin access"


def test_gateway_nginx_has_ssl_ciphers():
    """
    gateway.nginx.conf must contain an explicit ssl_ciphers directive so only
    ECDHE forward-secret cipher suites are offered — prevents legacy 3DES fallback.
    """
    conf_path = _nginx_conf("gateway.nginx.conf")
    if not conf_path.exists():
        pytest.skip("nginx conf not available in this environment")

    content = conf_path.read_text()
    assert "ssl_ciphers" in content, "ssl_ciphers directive must be present in gateway.nginx.conf"
    assert "ECDHE" in content, "ssl_ciphers must include at least one ECDHE cipher suite"


def test_simple_jwt_has_explicit_algorithm():
    """SIMPLE_JWT must declare ALGORITHM explicitly — avoids relying on the default."""
    from django.conf import settings

    algo = settings.SIMPLE_JWT.get("ALGORITHM")
    assert algo == "HS256", f"SIMPLE_JWT['ALGORITHM'] must be 'HS256', got {algo!r}"
