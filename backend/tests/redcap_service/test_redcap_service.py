import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

import core.services.redcap_service as svc
from core.services.redcap_service import (
    RedcapError,
    _get_redcap_api_url,
    _norm,
    _post_redcap,
    export_record_by_pat_id,
    get_token_for_project,
)


def test_redcap_service_norm_and_api_url_resolution(monkeypatch):
    assert _norm(None) == ""
    assert _norm(" a ") == "a"

    monkeypatch.setattr(
        svc,
        "settings",
        SimpleNamespace(REDCAP_API_URL="https://settings.example/api/"),
        raising=False,
    )
    assert _get_redcap_api_url() == "https://settings.example/api/"

    monkeypatch.setattr(svc, "settings", SimpleNamespace(REDCAP_API_URL=""), raising=False)
    monkeypatch.setenv("REDCAP_API_URL", "https://env.example/api/")
    assert _get_redcap_api_url() == "https://env.example/api/"


def test_get_token_for_project_success_and_missing(monkeypatch):
    monkeypatch.setenv("REDCAP_TOKEN_COMPASS", "tok")
    assert get_token_for_project("compass") == "tok"

    monkeypatch.delenv("REDCAP_TOKEN_COMPASS", raising=False)
    with pytest.raises(RedcapError):
        get_token_for_project("compass")


def test_post_redcap_success_and_error_paths(monkeypatch):
    monkeypatch.setattr(
        svc,
        "settings",
        SimpleNamespace(REDCAP_API_URL="https://rc.example/api/"),
        raising=False,
    )

    ok_resp = SimpleNamespace(status_code=200, text='[{"record_id":"1"}]')
    with patch("core.services.redcap_service.requests.post", return_value=ok_resp) as mocked:
        out = _post_redcap("T", {"content": "record"})
    assert out == '[{"record_id":"1"}]'
    assert mocked.call_args.kwargs["data"]["token"] == "T"

    bad_resp = SimpleNamespace(status_code=500, text="bad")
    with patch("core.services.redcap_service.requests.post", return_value=bad_resp):
        with pytest.raises(RedcapError):
            _post_redcap("T", {"content": "record"})

    with patch("core.services.redcap_service.requests.post", side_effect=RuntimeError("net")):
        with pytest.raises(RedcapError):
            _post_redcap("T", {"content": "record"})


def test_export_record_by_pat_id_empty_identifier(monkeypatch):
    monkeypatch.setattr(svc, "resolve_project", lambda p: p)
    monkeypatch.setattr(svc, "get_token_for_project", lambda p: "tok")
    assert export_record_by_pat_id("COMPASS", "") == []


def test_export_record_by_pat_id_primary_and_fallback(monkeypatch):
    monkeypatch.setattr(svc, "resolve_project", lambda p: p)
    monkeypatch.setattr(svc, "get_token_for_project", lambda p: "tok")
    monkeypatch.setattr(
        svc,
        "config",
        {"RedCap_Characteristics": ["pat_id", "record_id"]},
        raising=False,
    )

    # primary filter returns rows
    with patch(
        "core.services.redcap_service._post_redcap",
        return_value=json.dumps([{"record_id": "A1"}]),
    ):
        rows = export_record_by_pat_id("COMPASS", "A1")
    assert rows[0]["record_id"] == "A1"

    # primary empty -> fallback by record_id returns rows
    with patch(
        "core.services.redcap_service._post_redcap",
        side_effect=[json.dumps([]), json.dumps([{"record_id": "B2"}])],
    ) as mocked:
        rows = export_record_by_pat_id("COMPASS", "B2")
    assert rows[0]["record_id"] == "B2"
    assert mocked.call_count == 2


def test_export_record_by_pat_id_invalid_json_and_redcap_error(monkeypatch):
    monkeypatch.setattr(svc, "resolve_project", lambda p: p)
    monkeypatch.setattr(svc, "get_token_for_project", lambda p: "tok")
    monkeypatch.setattr(svc, "config", {"RedCap_Characteristics": ["pat_id"]}, raising=False)

    with patch("core.services.redcap_service._post_redcap", return_value="{bad"):
        with pytest.raises(RedcapError):
            export_record_by_pat_id("COMPASS", "X1")

    with patch("core.services.redcap_service._post_redcap", side_effect=RedcapError("boom")):
        with pytest.raises(RedcapError):
            export_record_by_pat_id("COMPASS", "X1")
