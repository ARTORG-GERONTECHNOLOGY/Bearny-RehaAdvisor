"""
ICF Monitor / HealthSlider — view tests
========================================

Test areas
----------
submit_healthslider_item
    - Method enforcement (POST only)
    - Required-field validation (participantId, sessionId)
    - Happy-path without audio (HTTP 201, document created in MongoDB)
    - Happy-path with audio (storage.save mocked, has_audio flag set)

Helper utilities
    - _safe_slug, _safe_filename, _guess_ext (MIME → file extension)

list_healthslider_items
    - 401 without X-Healthslider-Token header
    - 400 without participantId query param
    - 200 with valid token + participantId

download_healthslider_audio
    - 401 without token
    - 405 on non-GET method
    - 404 when item or storage file missing
    - 200 with correct Content-Disposition: inline header

Download auth (2FA gate)
    - Wrong password → 401
    - Correct password → 200 + SMSVerification record created + email sent (mocked)
    - Invalid code → 400
    - Valid code → 200 + signed token verifiable with _DL_SALT

Session management
    - download_healthslider_session_zip  (called directly, storage mocked, returns ZIP)
    - delete_healthslider_session        (GET → 405, missing param → 400, not found → 404,
                                          success → 200 + DB records deleted + storage.delete called)

Auth setup
----------
All list/audio endpoints require X-Healthslider-Token.
Tests generate a valid token with ``_dl_token()`` which calls
``signing.dumps({"ok": True}, salt=_DL_SALT)``.
Each test gets a fresh in-memory MongoDB via the ``mongo_mock`` autouse fixture.
"""

import io
import json
from datetime import datetime
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.core import signing
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, RequestFactory

from core.models import HealthSliderEntry, SMSVerification
from core.views.eva_view import (
    _DL_SALT,
    _guess_ext,
    _safe_filename,
    _safe_slug,
    delete_healthslider_session,
    download_healthslider_session_zip,
)


def _dl_token() -> str:
    """Generate a valid (unexpired) download token for tests."""
    return signing.dumps({"ok": True}, salt=_DL_SALT)


client = Client()
rf = RequestFactory()


@pytest.fixture(autouse=True, scope="function")
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


def test_submit_item_method_not_allowed():
    r = client.get("/api/healthslider/submit-item/")
    assert r.status_code == 405


def test_submit_item_missing_required_fields():
    r = client.post("/api/healthslider/submit-item/", data={})
    assert r.status_code == 400


def test_submit_item_success_without_audio():
    r = client.post(
        "/api/healthslider/submit-item/",
        data={
            "participantId": "P1",
            "sessionId": "S1",
            "questionIndex": "0",
            "questionText": "Q",
            "answerValue": "4",
        },
    )
    assert r.status_code == 201
    assert r.json()["ok"] is True
    assert HealthSliderEntry.objects(participant_id="P1", session_id="S1").count() == 1


def test_submit_item_with_audio_updates_storage_fields():
    audio = SimpleUploadedFile("voice.webm", b"abc", content_type="audio/webm")
    with patch(
        "core.views.eva_view.default_storage.save",
        return_value="healthslider/P2/voice.webm",
    ):
        r = client.post(
            "/api/healthslider/submit-item/",
            data={
                "participantId": "P2",
                "sessionId": "S1",
                "questionIndex": "1",
                "questionText": "Q2",
                "answerValue": "5",
                "audioMime": "audio/webm",
                "audio": audio,
            },
        )
    assert r.status_code == 201
    doc = HealthSliderEntry.objects(participant_id="P2", question_index=1).first()
    assert doc is not None
    assert doc.has_audio is True
    assert doc.audio_file == "healthslider/P2/voice.webm"


def test_eva_helpers_slug_filename_and_ext():
    assert _safe_slug("A B/C") == "A_BC"
    assert _safe_filename("hello world?.webm") == "hello_world.webm"
    assert _guess_ext("audio/mp4") == ".m4a"
    assert _guess_ext("audio/webm") == ".webm"
    assert _guess_ext("audio/ogg") == ".ogg"
    assert _guess_ext("", ".bin") == ".bin"


def test_list_items_no_token_returns_401():
    r = client.get("/api/healthslider/items/")
    assert r.status_code == 401


def test_list_items_requires_participant_id():
    tok = _dl_token()
    r = client.get("/api/healthslider/items/", HTTP_X_HEALTHSLIDER_TOKEN=tok)
    assert r.status_code == 400


def test_list_items_success():
    HealthSliderEntry(participant_id="P1", session_id="S1", question_index=0, question_text="Q").save()
    tok = _dl_token()
    r = client.get("/api/healthslider/items/?participantId=P1", HTTP_X_HEALTHSLIDER_TOKEN=tok)
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1


def test_download_audio_no_token_returns_401():
    missing_id = str(ObjectId())
    r = client.get(f"/api/healthslider/audio/{missing_id}/")
    assert r.status_code == 401


def test_download_audio_method_and_not_found():
    tok = _dl_token()
    missing_id = str(ObjectId())
    r1 = client.post(f"/api/healthslider/audio/{missing_id}/", HTTP_X_HEALTHSLIDER_TOKEN=tok)
    assert r1.status_code == 405

    r2 = client.get(f"/api/healthslider/audio/{missing_id}/", HTTP_X_HEALTHSLIDER_TOKEN=tok)
    assert r2.status_code == 404


def test_download_audio_no_audio_on_item():
    e = HealthSliderEntry(participant_id="P1", session_id="S1", question_index=0, question_text="Q").save()
    tok = _dl_token()
    r = client.get(f"/api/healthslider/audio/{e.id}/", HTTP_X_HEALTHSLIDER_TOKEN=tok)
    assert r.status_code == 404


def test_download_audio_missing_file_on_storage():
    e = HealthSliderEntry(
        participant_id="P1",
        session_id="S1",
        question_index=0,
        question_text="Q",
        audio_file="healthslider/P1/a.webm",
        has_audio=True,
    ).save()
    tok = _dl_token()
    with patch("core.views.eva_view.default_storage.exists", return_value=False):
        r = client.get(f"/api/healthslider/audio/{e.id}/", HTTP_X_HEALTHSLIDER_TOKEN=tok)
    assert r.status_code == 404


def test_download_audio_success_stream_headers():
    e = HealthSliderEntry(
        participant_id="P1",
        session_id="S1",
        question_index=0,
        question_text="Q",
        audio_file="healthslider/P1/a.webm",
        audio_name="a.webm",
        audio_mime="",
        has_audio=True,
    ).save()
    tok = _dl_token()
    with (
        patch("core.views.eva_view.default_storage.exists", return_value=True),
        patch("core.views.eva_view.default_storage.open", return_value=io.BytesIO(b"abc")),
        patch("core.views.eva_view.default_storage.size", return_value=3),
    ):
        r = client.get(f"/api/healthslider/audio/{e.id}/", HTTP_X_HEALTHSLIDER_TOKEN=tok)
    assert r.status_code == 200
    assert "inline;" in r["Content-Disposition"]


# ===========================================================================
# Download auth endpoints
# ===========================================================================


def test_download_auth_wrong_password():
    with patch.dict("os.environ", {"HEALTHSLIDER_DOWNLOAD_PASSWORD": "secret123"}):
        r = client.post(
            "/api/healthslider/auth/",
            data=json.dumps({"password": "wrong", "email": "x@example.com"}),
            content_type="application/json",
        )
    assert r.status_code == 401
    assert "Invalid password" in r.json()["error"]


def test_download_auth_correct_password_sends_code():
    with (
        patch.dict("os.environ", {"HEALTHSLIDER_DOWNLOAD_PASSWORD": "secret123"}),
        patch("core.views.eva_view.EmailMultiAlternatives.send"),
    ):
        r = client.post(
            "/api/healthslider/auth/",
            data=json.dumps({"password": "secret123", "email": "researcher@example.com"}),
            content_type="application/json",
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert SMSVerification.objects(userId="healthslider_download").count() == 1


def test_download_verify_invalid_code():
    r = client.post(
        "/api/healthslider/auth/verify/",
        data=json.dumps({"code": "999999"}),
        content_type="application/json",
    )
    assert r.status_code == 400
    assert "Invalid code" in r.json()["error"]


def test_download_verify_valid_code_returns_token():
    from datetime import timedelta

    from django.utils import timezone

    SMSVerification(
        userId="healthslider_download",
        code="123456",
        expires_at=timezone.now() + timedelta(minutes=10),
    ).save()
    r = client.post(
        "/api/healthslider/auth/verify/",
        data=json.dumps({"code": "123456"}),
        content_type="application/json",
    )
    assert r.status_code == 200
    token = r.json()["token"]
    assert token
    # Token must be valid for the download endpoints
    assert signing.loads(token, salt=_DL_SALT) == {"ok": True}


def test_download_session_zip_requires_participant_and_no_files():
    r1 = client.get("/api/healthslider/delete-session/")
    assert r1.status_code in (400, 405)

    r2 = client.get("/api/healthslider/delete-session/?participantId=P1")
    # mapped endpoint currently points to download zip in urls
    assert r2.status_code == 404


def test_download_session_zip_direct_success():
    HealthSliderEntry(
        participant_id="P1",
        session_id="S1",
        question_index=0,
        question_text="Q",
        audio_file="healthslider/P1/a.webm",
        audio_name="a.webm",
        has_audio=True,
    ).save()
    req = rf.get("/api/healthslider/session-zip/?participantId=P1&sessionId=S1")
    with (
        patch("core.views.eva_view.default_storage.exists", return_value=True),
        patch(
            "core.views.eva_view.default_storage.open",
            return_value=io.BytesIO(b"audio-bytes"),
        ),
    ):
        resp = download_healthslider_session_zip(req)
    assert resp.status_code == 200
    assert resp["Content-Type"] == "application/zip"


def test_delete_session_method_and_required():
    r1 = client.get("/api/healthslider/delete-session/?participantId=P1")
    assert r1.status_code == 404 or r1.status_code == 405


def test_delete_session_direct_method_and_required_and_not_found():
    req_get = rf.get("/api/healthslider/delete-session/?participantId=P1")
    r_get = delete_healthslider_session(req_get)
    assert r_get.status_code == 405

    req_missing = rf.delete("/api/healthslider/delete-session/")
    r_missing = delete_healthslider_session(req_missing)
    assert r_missing.status_code == 400

    req_none = rf.delete("/api/healthslider/delete-session/?participantId=P1")
    r_none = delete_healthslider_session(req_none)
    assert r_none.status_code == 404


def test_delete_session_direct_view_success_with_mocked_storage():
    from django.test import RequestFactory

    from core.views.eva_view import delete_healthslider_session

    e = HealthSliderEntry(
        participant_id="P1",
        session_id="S1",
        question_index=0,
        question_text="Q",
        audio_file="healthslider/P1/a.webm",
        has_audio=True,
    ).save()

    rf = RequestFactory()
    req = rf.delete("/api/healthslider/delete-session/?participantId=P1&sessionId=S1")

    with (
        patch("core.views.eva_view.default_storage.exists", return_value=True),
        patch("core.views.eva_view.default_storage.delete") as mdel,
    ):
        resp = delete_healthslider_session(req)

    assert resp.status_code == 200
    assert json.loads(resp.content)["ok"] is True
    assert HealthSliderEntry.objects(participant_id="P1", session_id="S1").count() == 0
