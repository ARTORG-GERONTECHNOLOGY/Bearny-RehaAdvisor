"""
Tests for POST /api/interventions/import/media/

Pattern mirrors test_intervention_import_view.py:
- mongomock fixture (autouse, function-scope)
- Django test Client
- patch _save_file for storage side-effects
"""

from unittest.mock import patch

import mongomock
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from core.models import Intervention, InterventionMedia
from core.views.intervention_media_upload import (
    _FILENAME_RE,
    _parse_external_id_and_lang,
)

client = Client()
URL = "/api/interventions/import/media/"
AUTH = {"HTTP_AUTHORIZATION": "Bearer test"}


# ── Fixtures ──────────────────────────────────────────────────────────────────


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


def _file(
    name: str, content: bytes = b"fake-data", content_type: str = "application/octet-stream"
) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content, content_type=content_type)


def _mp4(name: str) -> SimpleUploadedFile:
    return _file(name, b"fake-mp4-data", "video/mp4")


def _make_intervention(external_id: str, language: str, title: str = "Test") -> Intervention:
    doc = Intervention(
        external_id=external_id,
        language=language,
        title=title,
        description="desc",
        content_type="Video",
    )
    doc.save()
    return doc


# ── Helper unit tests ─────────────────────────────────────────────────────────


class TestParseExternalIdAndLang:
    def test_new_format_strips_lang_suffix(self):
        ext_id, lang = _parse_external_id_and_lang("3500_web_de")
        assert ext_id == "3500_web"
        assert lang == "de"

    def test_new_format_vid(self):
        ext_id, lang = _parse_external_id_and_lang("30500_vid_pt")
        assert ext_id == "30500_vid"
        assert lang == "pt"

    def test_audio_format(self):
        ext_id, lang = _parse_external_id_and_lang("3500_aud_fr")
        assert ext_id == "3500_aud"
        assert lang == "fr"

    def test_pdf_format(self):
        ext_id, lang = _parse_external_id_and_lang("3500_pdf_nl")
        assert ext_id == "3500_pdf"
        assert lang == "nl"

    def test_all_lowercase(self):
        ext_id, lang = _parse_external_id_and_lang("3500_WEB_DE")
        assert ext_id == "3500_web"
        assert lang == "de"


class TestFilenameRegex:
    def test_mp4_new_format_accepted(self):
        assert _FILENAME_RE.match("3500_web_de.mp4")
        assert _FILENAME_RE.match("30500_vid_pt.mp4")
        assert _FILENAME_RE.match("3500_aud_fr.mp4")

    def test_mp3_accepted(self):
        assert _FILENAME_RE.match("3500_aud_de.mp3")
        assert _FILENAME_RE.match("30500_aud_fr.mp3")

    def test_wav_accepted(self):
        assert _FILENAME_RE.match("3500_aud_it.wav")

    def test_pdf_accepted(self):
        assert _FILENAME_RE.match("3500_pdf_de.pdf")
        assert _FILENAME_RE.match("30500_pdf_en.pdf")

    def test_jpg_accepted(self):
        assert _FILENAME_RE.match("3500_img_de.jpg")
        assert _FILENAME_RE.match("3500_img_de.jpeg")

    def test_png_accepted(self):
        assert _FILENAME_RE.match("3500_img_nl.png")

    def test_unknown_format_code_rejected(self):
        assert not _FILENAME_RE.match("3500_xyz_de.mp4")

    def test_unsupported_extension_rejected(self):
        assert not _FILENAME_RE.match("3500_web_de.avi")
        assert not _FILENAME_RE.match("3500_web_de.mov")

    def test_random_name_rejected(self):
        assert not _FILENAME_RE.match("myvideo.mp4")
        assert not _FILENAME_RE.match("random_name.mp4")

    def test_three_digit_prefix_rejected(self):
        assert not _FILENAME_RE.match("350_web_de.mp4")

    def test_six_digit_prefix_rejected(self):
        assert not _FILENAME_RE.match("350000_web_de.mp4")


# ── HTTP method ───────────────────────────────────────────────────────────────


def test_wrong_method_returns_405():
    r = client.get(URL, **AUTH)
    assert r.status_code == 405


# ── Missing files ─────────────────────────────────────────────────────────────


def test_no_files_returns_400():
    r = client.post(URL, data={}, **AUTH)
    assert r.status_code == 400
    body = r.json()
    assert body["success"] is False
    assert "files" in body["error"].lower()


# ── Per-file validation errors ────────────────────────────────────────────────


def test_invalid_naming_convention_returns_error():
    f = _mp4("random_video.mp4")
    r = client.post(URL, data={"files[]": f}, **AUTH)
    assert r.status_code == 200
    result = r.json()["results"][0]
    assert result["status"] == "error"
    assert "naming convention" in result["error"].lower()
    assert result["external_id"] is None


def test_unsupported_extension_returns_error():
    f = _file("3500_web_de.avi", b"data", "video/x-msvideo")
    r = client.post(URL, data={"files[]": f}, **AUTH)
    assert r.status_code == 200
    result = r.json()["results"][0]
    assert result["status"] == "error"
    assert "naming convention" in result["error"].lower()


def test_unknown_format_code_returns_error():
    f = _mp4("3500_xyz_de.mp4")
    r = client.post(URL, data={"files[]": f}, **AUTH)
    assert r.status_code == 200
    assert r.json()["results"][0]["status"] == "error"


def test_valid_name_but_no_intervention_returns_error():
    f = _mp4("3500_web_de.mp4")
    r = client.post(URL, data={"files[]": f}, **AUTH)
    assert r.status_code == 200
    result = r.json()["results"][0]
    assert result["status"] == "error"
    assert "3500_web" in result["error"]
    assert result["external_id"] == "3500_web"
    assert result["interventions_updated"] == []


def test_wrong_language_variant_gives_specific_error():
    """Intervention exists for 'en' but uploaded file is for 'de' — clear error."""
    _make_intervention("3500_web", "en", "English only")

    f = _mp4("3500_web_de.mp4")
    r = client.post(URL, data={"files[]": f}, **AUTH)
    assert r.status_code == 200
    result = r.json()["results"][0]
    assert result["status"] == "error"
    assert "de" in result["error"]
    assert "other languages" in result["error"]


# ── Successful uploads ────────────────────────────────────────────────────────


@patch("core.views.intervention_media_upload._save_file", return_value="videos/3500_web.mp4")
def test_valid_mp4_returns_ok_and_updates_correct_language(mock_save):
    _make_intervention("3500_web", "de", "German Video")
    _make_intervention("3500_web", "en", "English Video")  # should NOT be updated

    f = _mp4("3500_web_de.mp4")
    r = client.post(URL, data={"files[]": f}, **AUTH)
    assert r.status_code == 200
    result = r.json()["results"][0]
    assert result["status"] == "ok"
    assert result["external_id"] == "3500_web"
    assert result["language"] == "de"
    assert len(result["interventions_updated"]) == 1

    # German variant updated
    de_doc = Intervention.objects(external_id="3500_web", language="de").first()
    assert len(de_doc.media) == 1
    assert de_doc.media[0].media_type == "video"
    assert de_doc.media[0].mime == "video/mp4"
    assert de_doc.media[0].file_path == "videos/3500_web.mp4"

    # English variant NOT updated
    en_doc = Intervention.objects(external_id="3500_web", language="en").first()
    assert len(en_doc.media) == 0


@patch("core.views.intervention_media_upload._save_file", return_value="audio/3500_aud.mp3")
def test_mp3_upload_sets_audio_media_type(mock_save):
    _make_intervention("3500_aud", "de", "German Audio")

    f = _file("3500_aud_de.mp3", b"fake-audio", "audio/mpeg")
    r = client.post(URL, data={"files[]": f}, **AUTH)
    assert r.status_code == 200
    result = r.json()["results"][0]
    assert result["status"] == "ok"
    assert result["language"] == "de"

    doc = Intervention.objects(external_id="3500_aud", language="de").first()
    assert len(doc.media) == 1
    assert doc.media[0].media_type == "audio"
    assert doc.media[0].mime == "audio/mpeg"


@patch("core.views.intervention_media_upload._save_file", return_value="documents/3500_pdf.pdf")
def test_pdf_upload_sets_pdf_media_type(mock_save):
    _make_intervention("3500_pdf", "fr", "French PDF")

    f = _file("3500_pdf_fr.pdf", b"fake-pdf", "application/pdf")
    r = client.post(URL, data={"files[]": f}, **AUTH)
    assert r.status_code == 200
    result = r.json()["results"][0]
    assert result["status"] == "ok"

    doc = Intervention.objects(external_id="3500_pdf", language="fr").first()
    assert doc.media[0].media_type == "pdf"
    assert doc.media[0].mime == "application/pdf"


@patch("core.views.intervention_media_upload._save_file", return_value="images/3500_img.jpg")
def test_jpg_upload_sets_image_media_type(mock_save):
    _make_intervention("3500_img", "it", "Italian Image")

    f = _file("3500_img_it.jpg", b"fake-image", "image/jpeg")
    r = client.post(URL, data={"files[]": f}, **AUTH)
    assert r.status_code == 200

    doc = Intervention.objects(external_id="3500_img", language="it").first()
    assert doc.media[0].media_type == "image"
    assert doc.media[0].mime == "image/jpeg"


# ── Language isolation: only the matching language is updated ─────────────────


@patch("core.views.intervention_media_upload._save_file", return_value="videos/lang_test.mp4")
def test_only_matching_language_variant_receives_file(mock_save):
    for lang in ("de", "en", "fr", "it", "pt", "nl"):
        _make_intervention("5000_web", lang, f"{lang} title")

    f = _mp4("5000_web_fr.mp4")
    r = client.post(URL, data={"files[]": f}, **AUTH)
    result = r.json()["results"][0]
    assert result["status"] == "ok"
    assert result["language"] == "fr"
    assert len(result["interventions_updated"]) == 1

    # Only French has media
    fr_doc = Intervention.objects(external_id="5000_web", language="fr").first()
    assert len(fr_doc.media) == 1

    # All other languages untouched
    for lang in ("de", "en", "it", "pt", "nl"):
        doc = Intervention.objects(external_id="5000_web", language=lang).first()
        assert len(doc.media) == 0, f"Expected no media for lang={lang}"


# ── Dedup: same file_path not added twice ─────────────────────────────────────


@patch("core.views.intervention_media_upload._save_file", return_value="videos/dedup.mp4")
def test_dedup_does_not_add_duplicate_media(mock_save):
    doc = _make_intervention("4000_web", "en", "Dedup Test")

    client.post(URL, data={"files[]": _mp4("4000_web_en.mp4")}, **AUTH)
    client.post(URL, data={"files[]": _mp4("4000_web_en.mp4")}, **AUTH)

    doc.reload()
    assert len(doc.media) == 1


# ── Mixed batch ───────────────────────────────────────────────────────────────


@patch("core.views.intervention_media_upload._save_file", return_value="videos/ok.mp4")
def test_mixed_batch_partial_results(mock_save):
    _make_intervention("9999_vid", "en", "Good One")

    files = [
        _mp4("9999_vid_en.mp4"),  # valid + intervention exists → ok
        _mp4("bad_name.mp4"),  # invalid format → error
        _file("no_match_xyz_de.mp4", b"data", "video/mp4"),  # invalid format code → error
    ]
    r = client.post(URL, data={"files[]": files}, **AUTH)
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 3
    assert results[0]["status"] == "ok"
    assert results[1]["status"] == "error"
    assert results[2]["status"] == "error"


# ── Storage folder matches file type ─────────────────────────────────────────


@patch("core.views.intervention_media_upload._save_file", return_value="videos/saved.mp4")
def test_mp4_uses_videos_folder(mock_save):
    _make_intervention("1234_web", "en", "Folder Test")
    client.post(URL, data={"files[]": _mp4("1234_web_en.mp4")}, **AUTH)
    assert mock_save.call_args[0][1] == "videos"


@patch("core.views.intervention_media_upload._save_file", return_value="audio/saved.mp3")
def test_mp3_uses_audio_folder(mock_save):
    _make_intervention("1234_aud", "en", "Audio Folder Test")
    f = _file("1234_aud_en.mp3", b"data", "audio/mpeg")
    client.post(URL, data={"files[]": f}, **AUTH)
    assert mock_save.call_args[0][1] == "audio"


@patch("core.views.intervention_media_upload._save_file", return_value="documents/saved.pdf")
def test_pdf_uses_documents_folder(mock_save):
    _make_intervention("1234_pdf", "en", "PDF Folder Test")
    f = _file("1234_pdf_en.pdf", b"data", "application/pdf")
    client.post(URL, data={"files[]": f}, **AUTH)
    assert mock_save.call_args[0][1] == "documents"


@patch("core.views.intervention_media_upload._save_file", return_value="images/saved.jpg")
def test_jpg_uses_images_folder(mock_save):
    _make_intervention("1234_img", "en", "Image Folder Test")
    f = _file("1234_img_en.jpg", b"data", "image/jpeg")
    client.post(URL, data={"files[]": f}, **AUTH)
    assert mock_save.call_args[0][1] == "images"


# ── Unexpected exception is caught per-file ───────────────────────────────────


@patch(
    "core.views.intervention_media_upload._save_file",
    side_effect=RuntimeError("disk full"),
)
def test_unexpected_error_is_caught_per_file(mock_save):
    _make_intervention("5555_web", "de", "Error Test")

    f = _mp4("5555_web_de.mp4")
    r = client.post(URL, data={"files[]": f}, **AUTH)
    assert r.status_code == 200
    result = r.json()["results"][0]
    assert result["status"] == "error"
    assert "disk full" in result["error"]
