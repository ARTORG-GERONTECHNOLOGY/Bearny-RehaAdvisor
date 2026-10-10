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
from django.contrib.auth.hashers import check_password, make_password
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
    from core.views.patient_views import get_patient_plan_for_therapist
    from core.views.therapist_views import list_therapist_patients

    for view_fn in (
        list_therapist_patients,
        get_patient_plan_for_therapist,
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


def test_fix8_parallel_failed_logins_all_count():
    """Requests that read the counter before either saved (parallel gunicorn threads) must each count."""
    from core.models import PasswordAttempt
    from utils.utils import check_rate_limit, increment_attempt

    user = _make_user("ratelimit_parallel_fix8", password="correct!")
    _, first = check_rate_limit(user)
    _, second = check_rate_limit(user)  # read before the first increment landed
    increment_attempt(first)
    increment_attempt(second)

    assert PasswordAttempt.objects(user=user).first().count == 2


def test_fix11_parallel_wrong_codes_all_count():
    """Requests that read the counter before either saved (parallel gunicorn threads) must each count."""
    _, first = check_verify_rate_limit("fix11_parallel_key")
    _, second = check_verify_rate_limit("fix11_parallel_key")  # read before the first increment landed
    increment_verify_attempt(first)
    increment_verify_attempt(second)

    assert VerifyAttempt.objects(key="fix11_parallel_key").first().count == 2


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


def test_fixfp6_patient_can_reschedule_own_session():
    """
    Patients now self-serve rescheduling of their own sessions (feature #426),
    which reuses the therapist-facing reschedule endpoint. The owning patient
    must be authorized even though they are not a Therapist/Admin.
    """
    from django.conf import settings as _ds
    from rest_framework.test import APIRequestFactory, force_authenticate

    from core.views.patient_views import reschedule_intervention_date

    _, th_a = _make_therapist("th_owner_fp6", ["Inselspital"])
    patient, intervention, plan = _make_patient_with_plan("owner_fp6", "Inselspital", th_a)
    old_dt = plan.interventions[0].dates[1]

    payload = {
        "patientId": str(patient.id),
        "interventionId": str(intervention.id),
        "oldDatetime": old_dt.isoformat(),
        "newDatetime": (old_dt + timedelta(days=10)).isoformat(),
    }

    factory = APIRequestFactory()
    request = factory.post(RESCHEDULE_URL, data=json.dumps(payload), content_type="application/json")
    force_authenticate(
        request,
        user=SimpleNamespace(is_authenticated=True, id=str(patient.userId.id), role="Patient"),
    )

    _ds.TESTING = False
    try:
        resp = reschedule_intervention_date(request)
    finally:
        _ds.TESTING = True

    assert resp.status_code == 200, "A patient must be able to reschedule their own session"


def test_fixfp6_patient_cannot_reschedule_other_patients_session():
    """A patient must not be able to reschedule a different patient's session."""
    from django.conf import settings as _ds
    from rest_framework.test import APIRequestFactory, force_authenticate

    from core.views.patient_views import reschedule_intervention_date

    _, th_a = _make_therapist("th_a_fp6b", ["Inselspital"])
    patient_a, intervention_a, plan_a = _make_patient_with_plan("a_fp6b", "Inselspital", th_a)
    patient_b, _, _ = _make_patient_with_plan("b_fp6b", "Bern", th_a)
    old_dt = plan_a.interventions[0].dates[1]

    payload = {
        "patientId": str(patient_a.id),
        "interventionId": str(intervention_a.id),
        "oldDatetime": old_dt.isoformat(),
        "newDatetime": (old_dt + timedelta(days=5)).isoformat(),
    }

    factory = APIRequestFactory()
    request = factory.post(RESCHEDULE_URL, data=json.dumps(payload), content_type="application/json")
    force_authenticate(
        request,
        user=SimpleNamespace(is_authenticated=True, id=str(patient_b.userId.id), role="Patient"),
    )

    _ds.TESTING = False
    try:
        resp = reschedule_intervention_date(request)
    finally:
        _ds.TESTING = True

    assert resp.status_code == 403, "Patient B must not be able to reschedule Patient A's session"


# ===========================================================================
# GHSA-xhrj-r59c-3c87 — missing authorization on patient and profile endpoints
# ===========================================================================


def _call_as(caller, view_fn, method, url, payload=None, *args):
    """Call view_fn as caller (a User) with authorization checks enabled."""
    from django.conf import settings as _ds
    from rest_framework.test import APIRequestFactory, force_authenticate

    factory = APIRequestFactory()
    if method == "get":
        request = factory.get(url)
    elif method == "multipart":
        request = factory.post(url, data=payload or {}, format="multipart")
    else:
        request = getattr(factory, method)(url, data=json.dumps(payload or {}), content_type="application/json")
    # Same shape as the production JWT user (core/jwt_auth.py): no role attribute.
    force_authenticate(request, user=SimpleNamespace(is_authenticated=True, id=str(caller.id)))
    _ds.TESTING = False
    try:
        return view_fn(request, *args)
    finally:
        _ds.TESTING = True


@pytest.fixture
def xhrj_world():
    """Therapist A (Inselspital) owns patient A; therapist B is in Bern; patient B is in Bern."""
    th_user_a, th_a = _make_therapist("th_a_xhrj", ["Inselspital"])
    th_user_b, th_b = _make_therapist("th_b_xhrj", ["Bern"])
    patient_a, intervention, plan = _make_patient_with_plan("a_xhrj", "Inselspital", th_a)
    patient_b, _, _ = _make_patient_with_plan("b_xhrj", "Bern", th_b)
    return SimpleNamespace(
        th_user_a=th_user_a,
        th_a=th_a,
        th_user_b=th_user_b,
        th_b=th_b,
        patient_a=patient_a,
        patient_b=patient_b,
        intervention=intervention,
        plan=plan,
        admin=_make_user("admin_xhrj", role="Admin"),
    )


@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_xhrj_patient_cannot_touch_other_users_profile(xhrj_world, method):
    from core.views.user_views import user_profile_view

    w = xhrj_world
    payload = {"email": "x@example.com"} if method == "put" else None
    for target in (w.patient_a.userId, w.th_user_a, w.admin):
        url = f"/api/users/{target.id}/profile/"
        resp = _call_as(w.patient_b.userId, user_profile_view, method, url, payload, str(target.id))
        assert resp.status_code == 403, f"patient must not {method} {target.role} profile"
    w.patient_a.userId.reload()
    assert w.patient_a.userId.email != "x@example.com"
    assert w.admin.reload().isActive


def test_xhrj_therapist_cannot_touch_other_clinic_patient_or_therapist_profile(xhrj_world):
    from core.views.user_views import user_profile_view

    w = xhrj_world
    for target in (w.patient_a.userId, w.th_user_a):
        resp = _call_as(w.th_user_b, user_profile_view, "get", "/api/users/x/profile/", None, str(target.id))
        assert resp.status_code == 403


def test_xhrj_profile_allowed_for_self_clinic_therapist_and_admin(xhrj_world):
    from core.views.user_views import user_profile_view

    w = xhrj_world
    for caller, target in (
        (w.patient_a.userId, w.patient_a.userId),
        (w.th_user_a, w.patient_a.userId),
        (w.th_user_a, w.th_user_a),
        (w.admin, w.th_user_b),
    ):
        resp = _call_as(caller, user_profile_view, "get", "/api/users/x/profile/", None, str(target.id))
        assert resp.status_code == 200, f"{caller.username} should read {target.username}"

    # Profile ids may also be Patient ids.
    resp = _call_as(w.th_user_a, user_profile_view, "get", "/api/users/x/profile/", None, str(w.patient_a.id))
    assert resp.status_code == 200


def test_xhrj_clinic_changes_limited_to_callers_clinics(xhrj_world):
    from core.views.user_views import user_profile_view

    w = xhrj_world
    resp = _call_as(w.th_user_a, user_profile_view, "put", "/", {"clinic": "Bern"}, str(w.patient_a.userId.id))
    assert resp.status_code == 403, "therapist must not move a patient to a clinic they don't belong to"
    assert w.patient_a.reload().clinic == "Inselspital"

    resp = _call_as(w.patient_a.userId, user_profile_view, "put", "/", {"clinic": "Bern"}, str(w.patient_a.userId.id))
    assert resp.status_code == 403, "patient must not change their own clinic"

    payload = {"clinics": ["Inselspital", "Bern"]}
    resp = _call_as(w.th_user_a, user_profile_view, "put", "/", payload, str(w.th_user_a.id))
    assert resp.status_code == 403, "therapist must not add clinics to their own account"
    assert w.th_a.reload().clinics == ["Inselspital"]

    resp = _call_as(w.admin, user_profile_view, "put", "/", {"clinic": "Bern"}, str(w.patient_a.userId.id))
    assert resp.status_code == 200
    assert w.patient_a.reload().clinic == "Bern"


def test_xhrj_add_intervention_requires_patient_access_and_own_therapist_id(xhrj_world):
    from core.views.patient_views import add_intervention_to_patient

    w = xhrj_world
    url = "/api/interventions/add-to-patient/"

    def payload(therapist_user):
        return {
            "therapistId": str(therapist_user.id),
            "patientId": str(w.patient_a.id),
            "interventions": [{"interventionId": str(w.intervention.id), "unit": "day", "interval": 1}],
        }

    for caller, therapist_user in (
        (w.patient_b.userId, w.th_user_a),  # patient spoofing a therapist
        (w.th_user_b, w.th_user_b),  # therapist of another clinic
        (w.th_user_b, w.th_user_a),  # therapist spoofing the patient's therapist
    ):
        resp = _call_as(caller, add_intervention_to_patient, "post", url, payload(therapist_user))
        assert resp.status_code == 403, f"{caller.username} acting as {therapist_user.username}"


def test_xhrj_remove_intervention_requires_patient_access(xhrj_world):
    from core.views.patient_views import remove_intervention_from_patient

    w = xhrj_world
    url = "/api/interventions/remove-from-patient/"
    payload = {"patientId": str(w.patient_a.id), "intervention": str(w.intervention.id)}

    for caller in (w.patient_b.userId, w.patient_a.userId, w.th_user_b):
        resp = _call_as(caller, remove_intervention_from_patient, "post", url, payload)
        assert resp.status_code == 403, f"{caller.username} must not edit patient A's plan"

    resp = _call_as(w.th_user_a, remove_intervention_from_patient, "post", url, payload)
    assert resp.status_code == 200


def test_xhrj_apply_named_template_rejects_other_clinic_patients(xhrj_world):
    from core.models import InterventionTemplate
    from core.views.template_views import apply_named_template

    w = xhrj_world
    tmpl = InterventionTemplate(name="Shared", is_public=True, created_by=w.th_b).save()
    payload = {"patientIds": [w.patient_a.patient_code], "effectiveFrom": "2030-01-01"}
    resp = _call_as(w.th_user_b, apply_named_template, "post", "/", payload, str(tmpl.id))
    # Same answer as an unknown code, so other clinics' codes can't be probed.
    unknown = _call_as(
        w.th_user_b, apply_named_template, "post", "/", {**payload, "patientIds": ["NOPE"]}, str(tmpl.id)
    )
    assert resp.status_code == unknown.status_code == 404


def test_xhrj_apply_template_to_patient_checks_therapist_and_patient(xhrj_world):
    from core.views.recomendation_views import apply_template_to_patient

    w = xhrj_world
    payload = {"patientId": str(w.patient_a.id), "diagnosis": "Stroke", "effectiveFrom": "2030-01-01"}

    resp = _call_as(w.th_user_b, apply_template_to_patient, "post", "/", payload, str(w.th_user_a.id))
    assert resp.status_code == 403, "therapist must not act under another therapist's id"

    resp = _call_as(w.th_user_b, apply_template_to_patient, "post", "/", payload, str(w.th_user_b.id))
    assert resp.status_code == 403, "therapist must not apply a template to another clinic's patient"


def test_xhrj_reset_password_and_force_logout_require_patient_access(xhrj_world):
    from core.views.user_views import force_logout_patient, reset_patient_password

    w = xhrj_world
    old_hash = w.patient_a.userId.pwdhash
    for caller in (w.patient_b.userId, w.th_user_b):
        resp = _call_as(
            caller, reset_patient_password, "put", "/", {"new_password": "Hijack3d!pw"}, str(w.patient_a.id)
        )
        assert resp.status_code == 403
        resp = _call_as(caller, force_logout_patient, "post", "/", None, str(w.patient_a.id))
        assert resp.status_code == 403
    assert w.patient_a.userId.reload().pwdhash == old_hash

    resp = _call_as(w.th_user_a, force_logout_patient, "post", "/", None, str(w.patient_a.id))
    assert resp.status_code == 200


def _xhrj_sweep_cases(w):
    """(label, view, method, url, payload, args, caller) that must all be refused with 403."""
    from core.views import (
        auth_views,
        fitbit_view,
        google_health_view,
        intervention_import,
        intervention_media_upload,
        patient_thresholds,
        patient_views,
        questionaires_view,
        recomendation_views,
        redcap_import_views,
        redcap_patient_views,
        therapist_views,
        wearables_redcap_view,
    )

    pa, pa_user, intruder, th_b = str(w.patient_a.id), str(w.patient_a.userId.id), w.patient_b.userId, w.th_user_b
    th_a_id, iv = str(w.th_user_a.id), str(w.intervention.id)
    return [
        # patient data, read or written by another patient
        (
            "unmark",
            patient_views.unmark_intervention_completed,
            "post",
            "/",
            {"patient_id": pa_user, "intervention_id": iv, "date": "2030-01-01"},
            (),
            intruder,
        ),
        (
            "feedback",
            patient_views.submit_patient_feedback,
            "multipart",
            "/",
            {"userId": pa_user, "q1": "5"},
            (),
            intruder,
        ),
        ("feedback-questions", patient_views.get_feedback_questions, "get", "/", None, ("Healthstatus", pa), intruder),
        ("initial-questionnaire", patient_views.initial_patient_questionaire, "get", "/", None, (pa_user,), intruder),
        (
            "healthstatus-history",
            patient_views.get_patient_healthstatus_history,
            "get",
            "/",
            None,
            (pa_user,),
            intruder,
        ),
        ("combined-health", patient_views.get_combined_health_data, "get", "/", None, (pa,), intruder),
        ("manual-vitals", patient_views.add_manual_vitals, "post", "/", {"weight_kg": 70}, (pa,), intruder),
        ("vitals-exists", patient_views.vitals_exists_for_day, "get", "/?date=2030-01-01", None, (pa,), intruder),
        (
            "intervention-view",
            patient_views.log_intervention_view,
            "post",
            "/",
            {"intervention_id": iv, "seconds_viewed": 5},
            (pa,),
            intruder,
        ),
        ("thresholds-read", patient_thresholds.patient_thresholds_view, "get", "/", None, (pa,), intruder),
        (
            "thresholds-self-write",
            patient_thresholds.patient_thresholds_view,
            "post",
            "/",
            {},
            (pa,),
            w.patient_a.userId,
        ),
        ("fitbit-summary", fitbit_view.fitbit_summary, "get", "/", None, (pa,), intruder),
        ("fitbit-status", fitbit_view.fitbit_status, "get", "/", None, (pa,), intruder),
        (
            "fitbit-manual-steps",
            fitbit_view.manual_steps,
            "post",
            "/",
            {"date": "2030-01-01", "steps": 10},
            (pa,),
            intruder,
        ),
        ("fitbit-auth-init", fitbit_view.fitbit_auth_init, "get", f"/?patientId={pa_user}", None, (), intruder),
        ("google-summary", google_health_view.google_health_summary, "get", "/", None, (pa,), intruder),
        ("google-status", google_health_view.google_health_status, "get", "/", None, (pa,), intruder),
        (
            "google-manual-steps",
            google_health_view.google_manual_steps,
            "post",
            "/",
            {"date": "2030-01-01", "steps": 10},
            (pa,),
            intruder,
        ),
        (
            "google-auth-init",
            google_health_view.google_health_auth_init,
            "get",
            f"/?patientId={pa_user}",
            None,
            (),
            intruder,
        ),
        ("google-health-data", google_health_view.get_google_health_data, "get", "/", None, (pa,), th_b),
        ("user-info", auth_views.get_user_info, "get", "/", None, (pa_user,), intruder),
        ("analytics-log-spoofed-user", therapist_views.create_log, "post", "/", {"user": th_a_id}, (), th_b),
        (
            "analytics-log-other-patient",
            therapist_views.create_log,
            "post",
            "/",
            {"user": str(th_b.id), "patient": pa},
            (),
            th_b,
        ),
        # therapist-only actions on another clinic's patient
        ("questionnaires-list", questionaires_view.list_patient_questionnaires, "get", "/", None, (pa,), th_b),
        (
            "questionnaires-assign",
            questionaires_view.assign_questionnaire,
            "post",
            "/",
            {"patientId": pa, "questionnaireKey": "x"},
            (),
            th_b,
        ),
        (
            "questionnaires-remove",
            questionaires_view.remove_questionnaire,
            "post",
            "/",
            {"patientId": pa, "questionnaireId": iv},
            (),
            th_b,
        ),
        ("questionnaires-reset", questionaires_view.reset_patient_feedback, "post", "/", {"patientId": pa}, (), th_b),
        ("wearables-redcap-sync", wearables_redcap_view.sync_wearables_to_redcap_view, "post", "/", {}, (pa,), th_b),
        ("private-interventions", recomendation_views.list_all_interventions, "get", "/", None, (pa,), intruder),
        # acting under another therapist's id
        ("template-plan", recomendation_views.template_plan_preview, "get", "/", None, (th_a_id,), th_b),
        ("assign-to-types", recomendation_views.assign_intervention_to_types, "post", "/", {}, (th_a_id,), th_b),
        ("remove-from-types", recomendation_views.remove_intervention_from_types, "post", "/", {}, (th_a_id,), th_b),
        (
            "assigned-diagnoses",
            recomendation_views.list_intervention_diagnoses,
            "get",
            "/",
            None,
            (iv, "Neuro", th_a_id),
            th_b,
        ),
        (
            "redcap-patient",
            redcap_patient_views.redcap_patient,
            "get",
            f"/?patient_code=P1&therapistUserId={th_a_id}",
            None,
            (),
            th_b,
        ),
        (
            "redcap-available",
            redcap_import_views.available_redcap_patients,
            "get",
            f"/?project=COPAIN&therapistUserId={th_a_id}",
            None,
            (),
            th_b,
        ),
        (
            "redcap-import",
            redcap_import_views.import_patient_from_redcap,
            "post",
            "/",
            {"project": "COPAIN", "patient_code": "P1", "therapistUserId": th_a_id},
            (),
            th_b,
        ),
        # catalog writes by a patient
        (
            "create-questionnaire",
            questionaires_view.list_health_questionnaires,
            "post",
            "/",
            {"title": "x", "questions": [{"text": "q", "type": "text"}]},
            (),
            intruder,
        ),
        ("add-intervention", recomendation_views.add_new_intervention, "multipart", "/", {"title": "x"}, (), intruder),
        ("patient-group", recomendation_views.create_patient_group, "post", "/", {}, (), intruder),
        ("intervention-detail", recomendation_views.get_intervention_detail, "get", "/", None, (iv,), intruder),
        ("import-excel", intervention_import.import_interventions, "multipart", "/", {}, (), intruder),
        ("import-media", intervention_media_upload.upload_intervention_media, "multipart", "/", {}, (), intruder),
    ]


def test_xhrj_sweep_endpoints_refuse_unauthorised_callers(xhrj_world):
    refused = []
    for label, view_fn, method, url, payload, args, caller in _xhrj_sweep_cases(xhrj_world):
        resp = _call_as(caller, view_fn, method, url, payload, *args)
        if resp.status_code != 403:
            refused.append(f"{label}: {resp.status_code}")
    assert not refused, "endpoints that did not return 403: " + ", ".join(refused)


def test_xhrj_sweep_legitimate_callers_still_allowed(xhrj_world):
    from core.views import auth_views, patient_thresholds, patient_views, questionaires_view

    w = xhrj_world
    pa, pa_user = str(w.patient_a.id), str(w.patient_a.userId.id)
    for label, caller, view_fn, args in (
        ("patient reads own thresholds", w.patient_a.userId, patient_thresholds.patient_thresholds_view, (pa,)),
        ("therapist reads thresholds", w.th_user_a, patient_thresholds.patient_thresholds_view, (pa,)),
        (
            "patient reads own health history",
            w.patient_a.userId,
            patient_views.get_patient_healthstatus_history,
            (pa_user,),
        ),
        ("therapist reads health history", w.th_user_a, patient_views.get_patient_healthstatus_history, (pa_user,)),
        ("admin reads plan", w.admin, patient_views.get_patient_plan, (pa,)),
        ("therapist lists questionnaires", w.th_user_a, questionaires_view.list_patient_questionnaires, (pa,)),
        ("user reads own info", w.patient_a.userId, auth_views.get_user_info, (pa_user,)),
    ):
        resp = _call_as(caller, view_fn, "get", "/", None, *args)
        assert resp.status_code == 200, f"{label}: {resp.status_code}"


def test_xhrj_private_intervention_lookup_by_external_id(xhrj_world):
    from core.views.recomendation_views import list_all_interventions

    w = xhrj_world
    Intervention(
        external_id="custom_xhrj",
        language="en",
        title="Private",
        description="Only for patient A",
        content_type="Video",
        is_private=True,
        private_patient_id=w.patient_a,
    ).save()

    url = "/?external_id=custom_xhrj"
    for caller, expected in ((w.patient_a.userId, 1), (w.th_user_a, 1), (w.patient_b.userId, 0), (w.th_user_b, 0)):
        resp = _call_as(caller, list_all_interventions, "get", url)
        assert resp.status_code == 200
        assert len(json.loads(resp.content)) == expected, caller.username


def test_xhrj_private_intervention_of_deleted_patient_is_hidden_not_500(xhrj_world):
    from core.views.recomendation_views import get_intervention_detail, list_all_interventions

    w = xhrj_world
    orphan = Patient(
        userId=_make_user("patient_gone_xhrj", role="Patient"),
        patient_code="PAT_gone",
        therapist=w.th_a,
        clinic="Inselspital",
    )
    orphan.save()
    iv = Intervention(
        external_id="custom_gone_xhrj",
        language="en",
        title="Orphan",
        description="Patient was hard-deleted",
        content_type="Video",
        is_private=True,
        private_patient_id=orphan,
    ).save()
    orphan.delete()

    resp = _call_as(w.th_user_a, list_all_interventions, "get", "/?external_id=custom_gone_xhrj")
    assert resp.status_code == 200
    assert json.loads(resp.content) == []

    resp = _call_as(w.th_user_a, get_intervention_detail, "get", "/", None, str(iv.id))
    assert resp.status_code == 404

    resp = _call_as(w.patient_b.userId, list_all_interventions, "get", "/", None, str(orphan.id))
    assert resp.status_code == 200
    assert "custom_gone_xhrj" not in [i.get("external_id") for i in json.loads(resp.content)]


def test_xhrj_feedback_refused_before_uploads_are_stored(xhrj_world):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from core.views.patient_views import submit_patient_feedback

    w = xhrj_world
    upload = SimpleUploadedFile("answer.mp4", b"\x00\x01", content_type="video/mp4")
    with patch("core.views.patient_views.default_storage.save") as save:
        resp = _call_as(
            w.patient_b.userId,
            submit_patient_feedback,
            "multipart",
            "/",
            {"userId": str(w.patient_a.userId.id), "q1_video": upload},
        )
    assert resp.status_code == 403
    save.assert_not_called()


def test_xhrj_detail_ignores_private_variant_sharing_public_external_id(xhrj_world):
    from core.views.recomendation_views import get_intervention_detail

    w = xhrj_world
    w.intervention.update(set__external_id="pub_xhrj")
    Intervention(
        external_id="pub_xhrj",
        language="fr",
        title="Private French",
        description="Patient A only",
        content_type="Video",
        is_private=True,
        private_patient_id=w.patient_a,
    ).save()

    resp = _call_as(w.th_user_b, get_intervention_detail, "get", "/?lang=fr", None, str(w.intervention.id))
    assert resp.status_code == 200
    assert "Private French" not in resp.content.decode()

    resp = _call_as(w.th_user_a, get_intervention_detail, "get", "/?lang=fr", None, str(w.intervention.id))
    assert "Private French" in resp.content.decode()

    # Hidden fr falls through the chain (fr, en, de) to the public en variant, not the requested de doc.
    de = Intervention(
        external_id="pub_xhrj", language="de", title="Deutsch", description="Public", content_type="Video"
    ).save()
    resp = _call_as(w.th_user_b, get_intervention_detail, "get", "/?lang=fr", None, str(de.id))
    assert json.loads(resp.content)["recommendation"]["selected_language"] == "en"


def test_xhrj_oauth_init_is_self_only_even_for_admins(xhrj_world):
    from core.views.fitbit_view import fitbit_auth_init
    from core.views.google_health_view import google_health_auth_init

    w = xhrj_world
    url = f"/?patientId={w.patient_a.userId.id}"
    for view_fn in (fitbit_auth_init, google_health_auth_init):
        assert _call_as(w.admin, view_fn, "get", url).status_code == 403
        assert _call_as(w.patient_a.userId, view_fn, "get", url).status_code == 200


def test_xhrj_profile_rejects_malformed_clinics(xhrj_world):
    from core.views.user_views import user_profile_view

    w = xhrj_world
    for bad_clinics in ("Inselspital", [{"name": "Bern"}]):
        resp = _call_as(w.th_user_a, user_profile_view, "put", "/", {"clinics": bad_clinics}, str(w.th_user_a.id))
        assert resp.status_code == 400, bad_clinics


def test_xhrj_create_questionnaire_rejects_foreign_therapist_id(xhrj_world):
    from core.views.questionaires_view import list_health_questionnaires

    w = xhrj_world
    payload = {"title": "x", "questions": [{"text": "q", "type": "text"}], "therapistId": str(w.th_user_a.id)}
    resp = _call_as(w.th_user_b, list_health_questionnaires, "post", "/", payload)
    assert resp.status_code == 403


def test_xhrj_therapist_limited_to_own_projects(xhrj_world):
    from core.views.patient_views import get_patient_plan

    w = xhrj_world
    user = _make_user("th_copain_xhrj")
    Therapist(userId=user, clinics=["Inselspital"], projects=["COPAIN"]).save()
    w.patient_a.update(set__project="COMPASS")
    assert _call_as(user, get_patient_plan, "get", "/", None, str(w.patient_a.id)).status_code == 403
    w.patient_a.update(set__project="COPAIN")
    assert _call_as(user, get_patient_plan, "get", "/", None, str(w.patient_a.id)).status_code == 200


def test_xhrj_deactivated_therapist_loses_access_and_tokens(xhrj_world):
    from core.views.patient_views import get_patient_plan
    from core.views.user_views import user_profile_view

    w = xhrj_world
    with patch("core.views.user_views.invalidate_user_tokens") as invalidate:
        resp = _call_as(w.admin, user_profile_view, "delete", "/", None, str(w.th_user_a.id))
    assert resp.status_code == 200
    invalidate.assert_called_once_with(str(w.th_user_a.id))

    w.th_user_a.reload()
    assert _call_as(w.th_user_a, get_patient_plan, "get", "/", None, str(w.patient_a.id)).status_code == 403


def test_xhrj_intervention_feedback_limited_to_accessible_patients(xhrj_world):
    from core.models import FeedbackEntry, FeedbackQuestion, PatientInterventionLogs
    from core.views.recomendation_views import get_intervention_detail

    w = xhrj_world
    question = FeedbackQuestion(questionSubject="Intervention", questionKey="q_xhrj", answer_type="text").save()
    plan_b = RehabilitationPlan.objects(patientId=w.patient_b).first()
    for patient, plan, comment in ((w.patient_a, w.plan, "from clinic A"), (w.patient_b, plan_b, "from clinic B")):
        PatientInterventionLogs(
            userId=patient,
            interventionId=w.intervention,
            rehabilitationPlanId=plan,
            date=datetime.now(),
            feedback=[FeedbackEntry(questionId=question, comment=comment)],
        ).save()

    def comments(caller):
        resp = _call_as(caller, get_intervention_detail, "get", "/", None, str(w.intervention.id))
        return sorted(f["comment"] for f in json.loads(resp.content)["feedback"])

    assert comments(w.th_user_a) == ["from clinic A"]
    assert comments(w.admin) == ["from clinic A", "from clinic B"]


def test_xhrj_change_password_is_self_only(xhrj_world):
    from core.views.user_views import change_password

    w = xhrj_world
    payload = {"old_password": "wrong", "new_password": "N3w!password"}
    resp = _call_as(w.patient_b.userId, change_password, "put", "/", payload, str(w.th_user_a.id))
    assert resp.status_code == 403


def test_xhrj_therapist_projects_is_admin_only(xhrj_world):
    from core.views.therapist_projects import therapist_projects

    w = xhrj_world
    payload = {"therapistId": str(w.th_a.id), "projects": []}
    assert _call_as(w.th_user_a, therapist_projects, "put", "/", payload).status_code == 403


def test_xhrj_profile_password_change_is_self_only(xhrj_world):
    from core.views.user_views import user_profile_view

    w = xhrj_world
    patient_user = w.patient_a.userId
    patient_user.pwdhash = make_password("Correct-Old-1")
    patient_user.save()

    # Correct old password, so only the self-only guard can refuse it.
    payload = {"oldPassword": "Correct-Old-1", "newPassword": "weak"}
    resp = _call_as(w.th_user_a, user_profile_view, "put", "/", payload, str(patient_user.id))
    assert resp.status_code == 403
    patient_user.reload()
    assert check_password("Correct-Old-1", patient_user.pwdhash)


def test_xhrj_admin_can_list_any_therapists_patients(xhrj_world):
    from core.views.therapist_views import list_therapist_patients

    w = xhrj_world
    assert _call_as(w.admin, list_therapist_patients, "get", "/", None, str(w.th_user_a.id)).status_code == 200
    assert _call_as(w.th_user_b, list_therapist_patients, "get", "/", None, str(w.th_user_a.id)).status_code == 403


def test_xhrj_admin_without_therapist_profile_can_manage_templates(xhrj_world):
    from core.models import InterventionTemplate
    from core.views.template_views import template_detail

    w = xhrj_world
    tmpl = InterventionTemplate(name="Private", is_public=False, created_by=w.th_a).save()
    assert _call_as(w.admin, template_detail, "get", "/", None, str(tmpl.id)).status_code == 200
    assert _call_as(w.th_user_b, template_detail, "get", "/", None, str(tmpl.id)).status_code == 404


def _private_intervention(owner, external_id, language="en"):
    return Intervention(
        external_id=external_id,
        language=language,
        title=f"Private {external_id} {language}",
        description="Private",
        content_type="Video",
        is_private=True,
        private_patient_id=owner,
    ).save()


def _add_to_patient_a(w, item):
    from core.views.patient_views import add_intervention_to_patient

    start = (datetime.now() + timedelta(days=1)).isoformat()
    payload = {
        "therapistId": str(w.th_user_a.id),
        "patientId": str(w.patient_a.id),
        "interventions": [
            {"unit": "day", "interval": 1, "startDate": start, "end": {"type": "count", "count": 2}, **item}
        ],
    }
    return _call_as(w.th_user_a, add_intervention_to_patient, "post", "/", payload)


def test_xhrj_private_intervention_only_assignable_to_its_patient(xhrj_world):
    w = xhrj_world
    foreign = _private_intervention(w.patient_b, "custom_b_xhrj")
    own = _private_intervention(w.patient_a, "custom_a_xhrj")

    resp = _add_to_patient_a(w, {"interventionId": str(foreign.id)})
    assert resp.status_code == 400
    assert "not found" in json.loads(resp.content)["field_errors"]["interventionId"][0]

    assert _add_to_patient_a(w, {"interventionId": str(own.id)}).status_code == 201


def test_xhrj_external_id_lookup_skips_other_patients_private_variant(xhrj_world):
    w = xhrj_world
    w.intervention.update(set__external_id="shared_xhrj")
    _private_intervention(w.patient_b, "shared_xhrj", language="fr")

    resp = _add_to_patient_a(w, {"externalId": "shared_xhrj", "language": "fr"})
    assert resp.status_code == 201
    plan = RehabilitationPlan.objects(patientId=w.patient_a).first()
    assigned = {a.interventionId.id for a in plan.interventions}
    assert assigned == {w.intervention.id}


def test_xhrj_private_intervention_not_assignable_to_diagnosis_group(xhrj_world):
    from core.views.recomendation_views import assign_intervention_to_types

    w = xhrj_world
    private = _private_intervention(w.patient_a, "custom_group_xhrj")
    payload = {
        "diagnosis": "Stroke",
        "interventions": [{"interventionId": str(private.id), "interval": 1, "unit": "week"}],
    }
    resp = _call_as(w.th_user_a, assign_intervention_to_types, "post", "/", payload, str(w.th_user_a.id))
    assert resp.status_code == 400
    assert json.loads(resp.content)["field_errors"]["interventions[0].interventionId"] == [
        "Private interventions cannot be assigned to diagnosis groups."
    ]


def test_xhrj_templates_refuse_and_skip_private_interventions(xhrj_world):
    from core.models import DefaultInterventions, DiagnosisAssignmentSettings, InterventionTemplate
    from core.views.template_views import apply_named_template, template_intervention_assign

    w = xhrj_world
    private = _private_intervention(w.patient_b, "custom_tmpl_xhrj")
    tmpl = InterventionTemplate(name="T", is_public=False, created_by=w.th_a).save()

    payload = {"interventionId": str(private.id), "end_day": 10, "interval": 1, "unit": "day"}
    resp = _call_as(w.th_user_a, template_intervention_assign, "post", "/", payload, str(tmpl.id))
    assert resp.status_code == 400
    assert json.loads(resp.content)["error"] == "Private interventions cannot be added to templates."

    # A template that already holds a private intervention must not hand it to other patients.
    block = DiagnosisAssignmentSettings(active=True, interval=1, unit="day", start_day=1, end_day=3)
    tmpl.recommendations.append(DefaultInterventions(recommendation=private, diagnosis_assignments={"_all": [block]}))
    tmpl.save()
    apply = {"patientIds": [w.patient_a.patient_code], "effectiveFrom": "2030-01-01"}
    assert _call_as(w.th_user_a, apply_named_template, "post", "/", apply, str(tmpl.id)).status_code == 200
    plan = RehabilitationPlan.objects(patientId=w.patient_a).first()
    assert private.id not in {a.interventionId.id for a in plan.interventions}


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
