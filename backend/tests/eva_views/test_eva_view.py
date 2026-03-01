import io
import json
from datetime import datetime
from unittest.mock import patch

import mongomock
import pytest
from bson import ObjectId
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, RequestFactory

from core.models import HealthSliderEntry
from core.views.eva_view import (
    _guess_ext,
    _safe_filename,
    _safe_slug,
    delete_healthslider_session,
    download_healthslider_session_zip,
)

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


def test_list_items_requires_participant_id():
    r = client.get("/api/healthslider/items/")
    assert r.status_code == 400


def test_list_items_success():
    HealthSliderEntry(participant_id="P1", session_id="S1", question_index=0, question_text="Q").save()
    r = client.get("/api/healthslider/items/?participantId=P1")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1


def test_download_audio_method_and_not_found():
    missing_id = str(ObjectId())
    r1 = client.post(f"/api/healthslider/audio/{missing_id}/")
    assert r1.status_code == 405

    r2 = client.get(f"/api/healthslider/audio/{missing_id}/")
    assert r2.status_code == 404


def test_download_audio_no_audio_on_item():
    e = HealthSliderEntry(participant_id="P1", session_id="S1", question_index=0, question_text="Q").save()
    r = client.get(f"/api/healthslider/audio/{e.id}/")
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
    with patch("core.views.eva_view.default_storage.exists", return_value=False):
        r = client.get(f"/api/healthslider/audio/{e.id}/")
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
    with (
        patch("core.views.eva_view.default_storage.exists", return_value=True),
        patch("core.views.eva_view.default_storage.open", return_value=io.BytesIO(b"abc")),
        patch("core.views.eva_view.default_storage.size", return_value=3),
    ):
        r = client.get(f"/api/healthslider/audio/{e.id}/")
    assert r.status_code == 200
    assert "inline;" in r["Content-Disposition"]


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
