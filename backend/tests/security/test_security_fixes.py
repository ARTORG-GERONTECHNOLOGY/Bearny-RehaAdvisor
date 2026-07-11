"""
Security fix regression tests.

One test per security fix, verifying the corrected behaviour and guarding
against regression.  Tests are intentionally minimal — they pin the exact
security contract without over-specifying implementation details.
"""

import json
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.contrib.auth.hashers import make_password
from django.test import Client
from rest_framework.test import APIClient

from core.models import (
    Intervention,
    InterventionAssignment,
    Patient,
    RehabilitationPlan,
    Therapist,
    User,
    VerifyAttempt,
)
from utils.utils import check_verify_rate_limit, increment_verify_attempt

# ---------------------------------------------------------------------------
# Shared mongomock fixture
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

_http_client = Client()


def _make_user(username, role="Therapist", active=True, password=None):
    u = User(
        username=username,
        email=f"{username}@example.com",
        role=role,
        createdAt=datetime.now(),
        isActive=active,
    )
    u.pwdhash = make_password(password) if password else "!"
    u.save()
    return u


def _make_therapist(username, clinics):
    u = _make_user(username)
    t = Therapist(userId=u, clinics=clinics, projects=[]).save()
    return u, t


def _make_patient_with_plan(tag, clinic, owning_therapist):
    """Patient (with a clinic) → Intervention → RehabilitationPlan with one assignment."""
    patient_user = _make_user(f"patient_{tag}", role="Patient")
    patient = Patient(
        userId=patient_user,
        patient_code=f"PAT_{tag}",
        therapist=owning_therapist,
        clinic=clinic,
    ).save()
    intervention = Intervention(
        external_id=f"iv_{tag}",
        language="en",
        title="Yoga",
        description="Yoga session",
        content_type="Video",
    ).save()
    assignment = InterventionAssignment(
        interventionId=intervention,
        frequency="Daily",
        dates=[datetime.now() + timedelta(days=i) for i in range(3)],
    )
    plan = RehabilitationPlan(
        patientId=patient,
        therapistId=owning_therapist,
        startDate=datetime.now(),
        endDate=datetime.now() + timedelta(days=30),
        status="active",
        interventions=[assignment],
    ).save()
    return patient, intervention, plan


MODIFY_URL = "/api/interventions/modify-patient/"
RESCHEDULE_URL = "/api/interventions/reschedule-date/"


# ===========================================================================
# Fix 5 — @api_view on non-admin views
# ===========================================================================


def test_fix5_non_admin_views_carry_api_view_decorator():
    """
    Prior to Fix 5, @csrf_exempt + @permission_classes without @api_view meant
    DRF's auth machinery never ran — every request was let through.

    @api_view wraps the function and attaches a .cls attribute (WrappedAPIView).
    Its presence proves DRF will now actually run auth and permission checks.
    """
    from core.views.patient_views import (
        get_patient_plan_for_therapist,
        get_patient_recommendations,
    )
    from core.views.therapist_views import list_therapist_patients

    for view_fn in (
        list_therapist_patients,
        get_patient_plan_for_therapist,
        get_patient_recommendations,
    ):
        assert hasattr(view_fn, "cls"), (
            f"{view_fn.__name__} must be wrapped with @api_view " "so DRF enforces authentication"
        )


# ===========================================================================
# Fix 6 — Therapist cross-access
# ===========================================================================


def test_fix6_therapist_cannot_access_other_therapists_patient_list():
    """
    Therapist B must receive 403 when requesting the patient list URL that
    belongs to Therapist A.  (Previously any authenticated therapist could
    substitute any other therapist's user ID in the URL parameter.)

    We call the view directly via APIRequestFactory to bypass JWTAuthMiddleware
    (which is also gated on TESTING), then flip TESTING=False only for the
    duration of the view call so the self-auth check actually runs.
    """
    from django.conf import settings as _ds
    from rest_framework.test import APIRequestFactory, force_authenticate

    from core.views.therapist_views import list_therapist_patients

    th_user_a, _ = _make_therapist("th_a_fix6", ["Inselspital"])
    th_user_b, _ = _make_therapist("th_b_fix6", ["Bern"])

    factory = APIRequestFactory()
    request = factory.get(f"/api/therapists/{th_user_a.id}/patients/")
    force_authenticate(request, user=SimpleNamespace(is_authenticated=True, id=str(th_user_b.id)))

    _ds.TESTING = False
    try:
        resp = list_therapist_patients(request, therapist_id=str(th_user_a.id))
    finally:
        _ds.TESTING = True

    assert resp.status_code == 403, "Therapist B must not be able to read Therapist A's patient list"


def test_fix6_therapist_can_access_own_patient_list():
    """A therapist can still access their own patient list."""
    from django.conf import settings as _ds
    from rest_framework.test import APIRequestFactory, force_authenticate

    from core.views.therapist_views import list_therapist_patients

    th_user, _ = _make_therapist("th_self_fix6", ["Inselspital"])

    factory = APIRequestFactory()
    request = factory.get(f"/api/therapists/{th_user.id}/patients/")
    force_authenticate(request, user=SimpleNamespace(is_authenticated=True, id=str(th_user.id)))

    _ds.TESTING = False
    try:
        resp = list_therapist_patients(request, therapist_id=str(th_user.id))
    finally:
        _ds.TESTING = True

    # 200 (empty patient list is fine) — the important thing is it's not 403
    assert resp.status_code == 200


# ===========================================================================
# Fix 7 — REDCap filterLogic injection
# ===========================================================================


def test_fix7_malicious_identifier_raises_redcap_error():
    """
    User-supplied identifiers are interpolated into a REDCap filterLogic string.
    Strings containing quotes or operators must be rejected before reaching the
    HTTP call — not silently forwarded to the external API.
    """
    from core.services.redcap_service import RedcapError, export_record_by_pat_id

    with pytest.raises(RedcapError, match="Invalid identifier format"):
        export_record_by_pat_id("COPAIN", "test' OR '1'='1")


def test_fix7_alphanumeric_identifier_is_accepted():
    """Alphanumeric, hyphen, and underscore identifiers must not be rejected."""
    from core.services.redcap_service import export_record_by_pat_id

    with patch(
        "core.services.redcap_service._post_redcap_with_field_fallback",
        return_value="[]",
    ):
        result = export_record_by_pat_id("COPAIN", "P-123_valid")

    assert result == []


# ===========================================================================
# Fix 8 — Login rate limiting
# ===========================================================================


def test_fix8_sixth_failed_login_returns_429():
    """
    The PasswordAttempt counter must lock the account after 5 consecutive
    wrong-password attempts and return 429 on the next attempt.
    """
    _make_user("ratelimit_fix8", password="correct!")

    payload = json.dumps({"username": "ratelimit_fix8@example.com", "password": "wrong!"})
    for _ in range(5):
        r = _http_client.post("/api/auth/login/", payload, content_type="application/json")
        assert r.status_code == 401

    # Sixth attempt must be locked out
    r = _http_client.post("/api/auth/login/", payload, content_type="application/json")
    assert r.status_code == 429, "Login must be locked after 5 failed attempts"


def test_fix8_successful_login_resets_attempt_counter():
    """A correct login after failures must reset the attempt counter."""
    from core.models import PasswordAttempt

    user = _make_user("ratelimit_reset_fix8", password="correct!")

    # Simulate 3 failed attempts directly in the DB
    record = PasswordAttempt(user=user, count=3, last_attempt=datetime.utcnow())
    record.save()

    resp = _http_client.post(
        "/api/auth/login/",
        json.dumps({"username": "ratelimit_reset_fix8@example.com", "password": "correct!"}),
        content_type="application/json",
    )
    # Patient role → 200 with tokens; Therapist/Admin role → 200 with require_2fa
    assert resp.status_code == 200

    # Counter is reset
    record.reload()
    assert record.count == 0


# ===========================================================================
# Fix 9 — Media authentication endpoint
# ===========================================================================


def test_fix9_media_auth_check_returns_200_for_authenticated_user():
    """/api/media-auth/ must return 200 so nginx auth_request forwards the file."""
    c = APIClient()
    c.force_authenticate(user=SimpleNamespace(is_authenticated=True, id=str(ObjectId())))
    resp = c.get("/api/media-auth/")
    assert resp.status_code == 200


def test_fix9_media_auth_view_is_wrapped_with_api_view():
    """media_auth_check must carry @api_view so IsAuthenticated is enforced."""
    from core.views.media_auth_view import media_auth_check

    assert hasattr(media_auth_check, "cls"), "media_auth_check must be decorated with @api_view"


# ===========================================================================
# Fix 10 — User-enumeration via login error messages
# ===========================================================================


def test_fix10_nonexistent_user_returns_generic_error():
    """
    Login with an unknown e-mail must return the same response as a wrong
    password — an attacker must not be able to tell whether an account exists.
    """
    resp = _http_client.post(
        "/api/auth/login/",
        json.dumps({"username": "ghost_fix10@example.com", "password": "anything"}),
        content_type="application/json",
    )
    assert resp.status_code == 401
    assert resp.json()["error"] == "Invalid credentials."


def test_fix10_wrong_password_returns_same_generic_error():
    """Wrong password must produce the exact same error text as unknown user."""
    _make_user("enumeration_fix10", password="correctpass!")

    resp = _http_client.post(
        "/api/auth/login/",
        json.dumps({"username": "enumeration_fix10@example.com", "password": "wrongpass!"}),
        content_type="application/json",
    )
    assert resp.status_code == 401
    assert resp.json()["error"] == "Invalid credentials."


# ===========================================================================
# Fix 11 — 2FA / email-code rate limiting
# ===========================================================================


def test_fix11_verify_rate_limit_locks_after_10_failures():
    """
    The VerifyAttempt counter must report a lockout once 10 bad codes have
    been submitted within the 30-minute window.
    """
    is_locked, record = check_verify_rate_limit("fix11_test_key")
    assert not is_locked

    for _ in range(10):
        increment_verify_attempt(record)
        record.reload()

    is_locked, _ = check_verify_rate_limit("fix11_test_key")
    assert is_locked, "Must be locked after 10 verify failures"


def test_fix11_healthslider_download_verify_returns_429_when_locked():
    """
    healthslider_download_verify must return 429 when the shared
    "healthslider_download" VerifyAttempt record is at the threshold.
    """
    # Seed the lockout state directly in the DB
    VerifyAttempt(
        key="healthslider_download",
        count=10,
        last_attempt=datetime.utcnow(),
    ).save()

    resp = _http_client.post(
        "/api/healthslider/auth/verify/",
        json.dumps({"code": "000000"}),
        content_type="application/json",
    )
    assert resp.status_code == 429


# ===========================================================================
# Fix 14 — Hardcoded plaintext HTTP IP in frontend config
# ===========================================================================


def test_fix14_frontend_config_has_no_hardcoded_server_ip():
    """
    The frontend config.json must not contain the old hardcoded production IP
    (http://159.100.246.89:8000/api).  That URL exposed the server address and
    forced all traffic over plaintext HTTP.

    Skipped when the frontend is not mounted (e.g. the backend-only Docker
    container used in CI); run on the host to verify the fix.
    """
    config_path = Path(__file__).resolve().parents[3] / "frontend" / "src" / "config" / "config.json"
    if not config_path.exists():
        pytest.skip("Frontend not mounted in this environment; run on host to verify Fix 14")

    raw = config_path.read_text()
    data = json.loads(raw)

    assert "URL" not in data, "Hardcoded URL key must be removed from config.json"
    assert "159.100.246.89" not in raw, "Production server IP must not appear in the frontend config"


# ===========================================================================
# Fix 15 — Removed dead REDCAP_API_TOKEN reference
# ===========================================================================


def test_fix15_import_redcap_participant_is_removed():
    """
    import_redcap_participant referenced settings.REDCAP_API_TOKEN which
    does not exist in any environment.  The function was dead code and has
    been removed entirely.
    """
    import core.views.redcap_view as rv

    assert not hasattr(rv, "import_redcap_participant"), (
        "import_redcap_participant must not exist — it referenced " "the non-existent settings.REDCAP_API_TOKEN"
    )


# ===========================================================================
# Fix 17 — CORS_ALLOW_ALL_ORIGINS env-var escape hatch
# ===========================================================================


def test_fix17_cors_allow_all_origins_is_not_true():
    """
    An env-var path that set CORS_ALLOW_ALL_ORIGINS = True has been removed.
    The setting must never be True — it would allow any origin to make
    credentialed cross-site requests to the API.
    """
    from django.conf import settings as _s

    assert not getattr(
        _s, "CORS_ALLOW_ALL_ORIGINS", False
    ), "CORS_ALLOW_ALL_ORIGINS must not be True in any environment"


# ===========================================================================
# Fix FP1 — User enumeration via forgot-password endpoint
# ===========================================================================


def test_fixfp1_nonexistent_email_returns_200_not_404():
    """
    POST /api/auth/forgot-password/ with an email that does not exist in the
    database must return HTTP 200 — not 404 — so an attacker cannot probe
    which email addresses are registered.
    """
    from unittest.mock import patch

    from rest_framework.test import APIRequestFactory, force_authenticate

    from core.views.auth_views import reset_password_view

    user = _make_user("fp1_caller", password="Pass1!")

    factory = APIRequestFactory()
    request = factory.post(
        "/api/auth/forgot-password/",
        data=json.dumps({"email": "ghost-nobody@e2e.invalid"}),
        content_type="application/json",
    )
    force_authenticate(request, user=SimpleNamespace(is_authenticated=True, id=str(user.id)))

    with patch("core.views.auth_views.send_mail"):
        resp = reset_password_view(request)

    assert resp.status_code == 200, "Non-existent email must return 200, not 404, to prevent email enumeration"


def test_fixfp1_existing_and_nonexistent_email_return_identical_body():
    """
    The response body for an unknown email and a known email must be identical
    so the caller cannot distinguish between the two cases.
    """
    from unittest.mock import patch

    from rest_framework.test import APIRequestFactory, force_authenticate

    from core.views.auth_views import reset_password_view

    caller = _make_user("fp1_caller2", password="Pass1!")
    _make_user("fp1_target", password="Pass1!")
    target_email = "fp1_target@example.com"

    factory = APIRequestFactory()

    def _call(email):
        req = factory.post(
            "/api/auth/forgot-password/",
            data=json.dumps({"email": email}),
            content_type="application/json",
        )
        force_authenticate(req, user=SimpleNamespace(is_authenticated=True, id=str(caller.id)))
        with patch("core.views.auth_views.send_mail"):
            return reset_password_view(req)

    resp_unknown = _call("ghost-nobody2@e2e.invalid")
    resp_known = _call(target_email)

    assert resp_unknown.status_code == 200
    assert resp_known.status_code == 200
    assert json.loads(resp_unknown.content) == json.loads(
        resp_known.content
    ), "Response body must be identical for existing and non-existing emails"


# ===========================================================================
# Fix FP2 — get_patients_by_therapist authorization gap
# ===========================================================================


def test_fixfp2_therapist_b_cannot_access_therapist_a_patient_list():
    """
    GET /api/therapists/<a_id>/patients/ must return 403 when called by
    Therapist B — any authenticated user could previously read any therapist's
    patient list through this endpoint (the sister endpoint list_therapist_patients
    was fixed in Fix 6, but get_patients_by_therapist was missed).
    """
    from django.conf import settings as _ds
    from rest_framework.test import APIRequestFactory, force_authenticate

    from core.views.therapist_views import get_patients_by_therapist

    th_user_a, _ = _make_therapist("th_a_fp2", ["Inselspital"])
    th_user_b, _ = _make_therapist("th_b_fp2", ["Bern"])

    factory = APIRequestFactory()
    request = factory.get(f"/api/therapists/{th_user_a.id}/patients/")
    force_authenticate(
        request,
        user=SimpleNamespace(is_authenticated=True, id=str(th_user_b.id), role="Therapist"),
    )

    _ds.TESTING = False
    try:
        resp = get_patients_by_therapist(request, therapist_id=str(th_user_a.id))
    finally:
        _ds.TESTING = True

    assert resp.status_code == 403, "Therapist B must not be able to read Therapist A's patient list"


def test_fixfp2_therapist_can_access_own_patient_list():
    """
    A therapist accessing their own list must not be rejected by the auth guard.

    Note: get_patients_by_therapist is shadowed by list_therapist_patients in
    urls.py (same path registered first).  list_therapist_patients has its own
    more thorough tests in test_fix6_*.  Here we only validate the auth guard
    lets the owner through — the Patient query is mocked so the view reaches 200.
    """
    from unittest.mock import patch

    from django.conf import settings as _ds
    from rest_framework.test import APIRequestFactory, force_authenticate

    from core.views.therapist_views import get_patients_by_therapist

    th_user, _ = _make_therapist("th_self_fp2", ["Inselspital"])

    factory = APIRequestFactory()
    request = factory.get(f"/api/therapists/{th_user.id}/patients/")
    force_authenticate(
        request,
        user=SimpleNamespace(is_authenticated=True, id=str(th_user.id), role="Therapist"),
    )

    _ds.TESTING = False
    try:
        with patch("core.views.therapist_views.Patient") as mock_patient:
            mock_patient.objects.filter.return_value = []
            resp = get_patients_by_therapist(request, therapist_id=str(th_user.id))
    finally:
        _ds.TESTING = True

    assert resp.status_code == 200


def test_fixfp2_admin_can_access_any_therapist_patient_list():
    """Admin can reach any therapist's list — auth guard must pass them through."""
    from unittest.mock import patch

    from django.conf import settings as _ds
    from rest_framework.test import APIRequestFactory, force_authenticate

    from core.views.therapist_views import get_patients_by_therapist

    th_user, _ = _make_therapist("th_target_fp2", ["Inselspital"])
    admin_user = _make_user("admin_fp2", role="Admin")

    factory = APIRequestFactory()
    request = factory.get(f"/api/therapists/{th_user.id}/patients/")
    force_authenticate(
        request,
        user=SimpleNamespace(is_authenticated=True, id=str(admin_user.id), role="Admin"),
    )

    _ds.TESTING = False
    try:
        with patch("core.views.therapist_views.Patient") as mock_patient:
            mock_patient.objects.filter.return_value = []
            resp = get_patients_by_therapist(request, therapist_id=str(th_user.id))
    finally:
        _ds.TESTING = True

    assert resp.status_code == 200


# ===========================================================================
# Fix FP3 — Hardcoded production IP in backend config.json
# ===========================================================================


def test_fixfp3_backend_config_has_no_hardcoded_ip():
    """
    backend/config.json previously contained 'URL': 'http://159.100.246.89:8000/api'.
    The key has been removed entirely.  The IP must never reappear in this file.
    """
    # Inside the django container, ./backend is mounted as /app, so config.json
    # sits at parents[2] (/app/config.json).  On the host, it is at parents[3]/backend/.
    f = Path(__file__).resolve()
    config_path = (
        (f.parents[2] / "config.json")
        if (f.parents[2] / "config.json").exists()
        else (f.parents[3] / "backend" / "config.json")
    )
    raw = config_path.read_text()
    data = json.loads(raw)

    assert "URL" not in data, "The 'URL' key must be removed from backend/config.json"
    assert "159.100.246.89" not in raw, "Production server IP must not appear in backend/config.json"


# ===========================================================================
# Fix FP5 — Missing @api_view on three user_views.py endpoints
# ===========================================================================


def test_fixfp5_user_views_carry_api_view_decorator():
    """
    change_password, user_profile_view, and reset_patient_password previously
    used @csrf_exempt + @permission_classes without @api_view, so DRF's auth
    machinery was silently bypassed.  @api_view wraps each function and attaches
    a .cls attribute (WrappedAPIView) — its presence proves DRF now enforces auth.
    """
    from core.views.user_views import (
        change_password,
        reset_patient_password,
        user_profile_view,
    )

    for view_fn in (change_password, user_profile_view, reset_patient_password):
        assert hasattr(view_fn, "cls"), (
            f"{view_fn.__name__} must be wrapped with @api_view " "so DRF enforces authentication"
        )


# ===========================================================================
# Fix FP6 — reschedule/modify-intervention authorization gap
# ===========================================================================


def test_fixfp6_therapist_cannot_access_other_clinics_patient():
    """
    POST /api/interventions/reschedule-date/ and /api/interventions/modify-patient/
    must return 403 when Therapist B (a different clinic) supplies Therapist A's
    patientId — previously both endpoints only checked IsAuthenticated and trusted
    patientId from the body, letting any authenticated caller reschedule or modify
    any patient's rehabilitation plan.
    """
    from django.conf import settings as _ds
    from rest_framework.test import APIRequestFactory, force_authenticate

    from core.views.patient_views import (
        modify_intervention_from_date,
        reschedule_intervention_date,
    )

    _, th_a = _make_therapist("th_a_fp6", ["Inselspital"])
    th_user_b, _ = _make_therapist("th_b_fp6", ["Bern"])
    patient, intervention, plan = _make_patient_with_plan("fp6", "Inselspital", th_a)
    old_dt = plan.interventions[0].dates[1]

    cases = [
        (
            reschedule_intervention_date,
            RESCHEDULE_URL,
            {
                "patientId": str(patient.id),
                "interventionId": str(intervention.id),
                "oldDatetime": old_dt.isoformat(),
                "newDatetime": (old_dt + timedelta(days=5)).isoformat(),
            },
        ),
        (
            modify_intervention_from_date,
            MODIFY_URL,
            {
                "patientId": str(patient.id),
                "interventionId": str(intervention.id),
                "effectiveFrom": "2025-01-01T00:00:00",
                "keep_current": True,
            },
        ),
    ]

    factory = APIRequestFactory()
    for view_fn, url, payload in cases:
        request = factory.post(url, data=json.dumps(payload), content_type="application/json")
        force_authenticate(
            request,
            user=SimpleNamespace(is_authenticated=True, id=str(th_user_b.id), role="Therapist"),
        )

        _ds.TESTING = False
        try:
            resp = view_fn(request)
        finally:
            _ds.TESTING = True

        assert (
            resp.status_code == 403
        ), f"Therapist B must not be able to call {view_fn.__name__} on Therapist A's patient"


# ===========================================================================
# HealthSlider session-zip and delete-session — token required
# ===========================================================================


def test_healthslider_session_zip_requires_token():
    """
    GET /api/healthslider/session-zip/ must return 401 when no
    X-Healthslider-Token header is present.  Previously the endpoint
    had no token check — any unauthenticated caller could download
    all audio for any participant.
    """
    resp = _http_client.get("/api/healthslider/session-zip/?participantId=P001")
    assert resp.status_code == 401, "session-zip must require a valid X-Healthslider-Token"


def test_healthslider_delete_session_requires_token():
    """
    DELETE /api/healthslider/delete-session/ must return 401 when no
    X-Healthslider-Token header is present.  The delete function was
    previously unregistered in urls.py (dead code); now that it is
    registered it must also be guarded.
    """
    resp = _http_client.delete("/api/healthslider/delete-session/?participantId=P001")
    assert resp.status_code == 401, "delete-session must require a valid X-Healthslider-Token"


# ===========================================================================
# Content Security Policy — prod nginx config
# ===========================================================================


def _prod_nginx_conf() -> Path:
    # On the host:  .../telerehabapp/backend/tests/security/test_*.py → parents[3] = project root
    # In container: /app/tests/security/test_*.py → parents[3] = / (file won't exist → skip)
    return Path(__file__).resolve().parents[3] / "nginx" / "conf" / "prod.reha-advisor.nginx.conf"


def _parse_csp(conf_text: str) -> dict[str, str]:
    """
    Extract the CSP header value and split it into a dict keyed by directive name.
    Returns an empty dict when no CSP header is found.
    """
    import re

    m = re.search(r'Content-Security-Policy\s+"([^"]+)"', conf_text)
    if not m:
        return {}
    directives = {}
    for part in m.group(1).split(";"):
        part = part.strip()
        if not part:
            continue
        tokens = part.split(None, 1)
        key = tokens[0]
        value = tokens[1] if len(tokens) > 1 else ""
        directives[key] = value
    return directives


def test_csp_header_present_in_prod_nginx_conf():
    """prod.reha-advisor.nginx.conf must contain a Content-Security-Policy header."""
    if not _prod_nginx_conf().exists():
        pytest.skip("nginx conf not available in this environment")
    assert "Content-Security-Policy" in _prod_nginx_conf().read_text()


def test_csp_frame_ancestors_none():
    """frame-ancestors 'none' must be set to block clickjacking."""
    if not _prod_nginx_conf().exists():
        pytest.skip("nginx conf not available in this environment")
    csp = _parse_csp(_prod_nginx_conf().read_text())
    assert "frame-ancestors" in csp, "frame-ancestors directive must be present"
    assert "'none'" in csp["frame-ancestors"], "frame-ancestors must be 'none'"


def test_csp_frame_src_allows_https():
    """
    frame-src must allow HTTPS iframes so intervention videos from YouTube
    and other platforms are not blocked.
    """
    if not _prod_nginx_conf().exists():
        pytest.skip("nginx conf not available in this environment")
    csp = _parse_csp(_prod_nginx_conf().read_text())
    assert "frame-src" in csp, "frame-src directive must be present"
    assert "https:" in csp["frame-src"], "frame-src must include https: to allow external video embeds"


def test_csp_img_src_allows_https():
    """
    img-src must allow HTTPS images so intervention images hosted on external
    CDNs are not blocked.
    """
    if not _prod_nginx_conf().exists():
        pytest.skip("nginx conf not available in this environment")
    csp = _parse_csp(_prod_nginx_conf().read_text())
    assert "img-src" in csp, "img-src directive must be present"
    assert "https:" in csp["img-src"], "img-src must include https: to allow external images"


def test_csp_connect_src_covers_sentry_ingest():
    """
    Sentry's error-reporting endpoint is <org-id>.ingest.sentry.io — two levels
    under sentry.io.  A wildcard *.sentry.io only matches one level, so the
    POST was being blocked.  Both *.sentry.io and *.ingest.sentry.io must appear
    in connect-src.
    """
    if not _prod_nginx_conf().exists():
        pytest.skip("nginx conf not available in this environment")
    csp = _parse_csp(_prod_nginx_conf().read_text())
    assert "connect-src" in csp, "connect-src directive must be present"
    assert "https://*.ingest.sentry.io" in csp["connect-src"], (
        "connect-src must include https://*.ingest.sentry.io — "
        "*.sentry.io alone does not match <org-id>.ingest.sentry.io"
    )


def test_csp_object_src_none():
    """object-src 'none' must block browser plugins (Flash, Java, etc.)."""
    if not _prod_nginx_conf().exists():
        pytest.skip("nginx conf not available in this environment")
    csp = _parse_csp(_prod_nginx_conf().read_text())
    assert "object-src" in csp, "object-src directive must be present"
    assert "'none'" in csp["object-src"], "object-src must be 'none'"
