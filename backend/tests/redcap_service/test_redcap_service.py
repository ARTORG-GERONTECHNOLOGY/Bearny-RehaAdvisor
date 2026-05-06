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


def test_export_record_by_pat_id_pat_id_400_falls_back_to_record_id(monkeypatch):
    """
    When the pat_id filterLogic returns 400 (field doesn't exist in the project),
    export_record_by_pat_id must fall through to the record_id lookup instead of
    propagating the error. Reproduces the COPAIN pat_id-missing scenario.
    """
    monkeypatch.setattr(svc, "resolve_project", lambda p: p)
    monkeypatch.setattr(svc, "get_token_for_project", lambda p: "tok")
    monkeypatch.setattr(
        svc,
        "config",
        {"RedCap_Characteristics": ["pat_id", "record_id"]},
        raising=False,
    )

    pat_id_error = RedcapError(
        "REDCap API returned non-200.",
        detail={
            "status": 400,
            "text": '{"error":"The following values in the parameter \\"fields\\" are not valid: \'pat_id\'"}',
        },
    )
    record_id_row = json.dumps([{"record_id": "934-18"}])

    # First _post_redcap call (pat_id filter, first attempt) → 400
    # Second call (record_id filter) → success
    with patch(
        "core.services.redcap_service._post_redcap",
        side_effect=[pat_id_error, record_id_row],
    ) as mock_post:
        rows = export_record_by_pat_id("COPAIN", "934-18")

    assert rows == [{"record_id": "934-18"}]
    assert mock_post.call_count == 2


def test_export_record_by_pat_id_pat_id_408_falls_back_to_record_id(monkeypatch):
    """
    When the pat_id filterLogic causes a 408 timeout (REDCap times out evaluating
    a filterLogic on a field that doesn't exist — happens after _post_redcap_with_field_fallback
    strips pat_id from fields but filterLogic still references [pat_id]),
    export_record_by_pat_id must fall through to the record_id lookup.
    """
    monkeypatch.setattr(svc, "resolve_project", lambda p: p)
    monkeypatch.setattr(svc, "get_token_for_project", lambda p: "tok")
    monkeypatch.setattr(
        svc,
        "config",
        {"RedCap_Characteristics": ["pat_id", "record_id"]},
        raising=False,
    )

    timeout_error = RedcapError(
        "REDCap API returned non-200.",
        detail={"status": 408, "text": "<html>408 Request Timeout</html>"},
    )
    record_id_row = json.dumps([{"record_id": "934-18"}])

    # First call (pat_id filter, retry after field-strip) → 408
    # Second call (record_id filter) → success
    with patch(
        "core.services.redcap_service._post_redcap",
        side_effect=[timeout_error, record_id_row],
    ) as mock_post:
        rows = export_record_by_pat_id("COPAIN", "934-18")

    assert rows == [{"record_id": "934-18"}]
    assert mock_post.call_count == 2


def test_export_record_by_pat_id_non_400_408_error_still_raises(monkeypatch):
    """Non-400/408 errors from the pat_id filter must still propagate."""
    monkeypatch.setattr(svc, "resolve_project", lambda p: p)
    monkeypatch.setattr(svc, "get_token_for_project", lambda p: "tok")
    monkeypatch.setattr(
        svc,
        "config",
        {"RedCap_Characteristics": ["record_id"]},
        raising=False,
    )

    server_error = RedcapError(
        "REDCap API returned non-200.",
        detail={"status": 500, "text": "Internal Server Error"},
    )
    with patch("core.services.redcap_service._post_redcap", side_effect=server_error):
        with pytest.raises(RedcapError) as exc_info:
            export_record_by_pat_id("COPAIN", "934-18")
    assert exc_info.value.detail["status"] == 500


# ---------------------------------------------------------------------------
# REDCap connection tests
# ---------------------------------------------------------------------------


def test_redcap_connection_success(monkeypatch):
    """A well-formed POST with a valid token and correct API URL returns data."""
    monkeypatch.setattr(
        svc,
        "settings",
        SimpleNamespace(REDCAP_API_URL="https://redcap.example/api/"),
        raising=False,
    )
    ok_resp = SimpleNamespace(status_code=200, text='[{"record_id":"1","pat_id":"P01"}]')
    with patch("core.services.redcap_service.requests.post", return_value=ok_resp) as mocked:
        result = _post_redcap("valid-token", {"content": "record", "format": "json"})

    assert '"record_id"' in result
    call_data = mocked.call_args.kwargs["data"]
    assert call_data["token"] == "valid-token"
    assert mocked.call_args.args[0] == "https://redcap.example/api/"


def test_redcap_connection_timeout_raises_redcap_error(monkeypatch):
    """A connection timeout is wrapped in RedcapError (not a raw exception)."""
    monkeypatch.setattr(
        svc,
        "settings",
        SimpleNamespace(REDCAP_API_URL="https://redcap.example/api/"),
        raising=False,
    )
    import requests as req_lib

    with patch(
        "core.services.redcap_service.requests.post",
        side_effect=req_lib.exceptions.Timeout("timed out"),
    ):
        with pytest.raises(RedcapError) as exc_info:
            _post_redcap("tok", {"content": "record"})
    assert "REDCap" in str(exc_info.value)


def test_redcap_connection_network_error_raises_redcap_error(monkeypatch):
    """A generic network/connection error is wrapped in RedcapError."""
    monkeypatch.setattr(
        svc,
        "settings",
        SimpleNamespace(REDCAP_API_URL="https://redcap.example/api/"),
        raising=False,
    )
    import requests as req_lib

    with patch(
        "core.services.redcap_service.requests.post",
        side_effect=req_lib.exceptions.ConnectionError("refused"),
    ):
        with pytest.raises(RedcapError):
            _post_redcap("tok", {"content": "record"})


def test_redcap_connection_invalid_token_raises_redcap_error(monkeypatch):
    """A 403 response (bad/missing token) is raised as RedcapError."""
    monkeypatch.setattr(
        svc,
        "settings",
        SimpleNamespace(REDCAP_API_URL="https://redcap.example/api/"),
        raising=False,
    )
    forbidden = SimpleNamespace(status_code=403, text="ERROR: You do not have privileges")
    with patch("core.services.redcap_service.requests.post", return_value=forbidden):
        with pytest.raises(RedcapError):
            _post_redcap("bad-token", {"content": "record"})


def test_redcap_connection_uses_env_url_when_settings_empty(monkeypatch):
    """Falls back to REDCAP_API_URL env var when Django settings value is blank."""
    monkeypatch.setattr(svc, "settings", SimpleNamespace(REDCAP_API_URL=""), raising=False)
    monkeypatch.setenv("REDCAP_API_URL", "https://env.redcap.example/api/")

    ok_resp = SimpleNamespace(status_code=200, text="[]")
    with patch("core.services.redcap_service.requests.post", return_value=ok_resp) as mocked:
        _post_redcap("tok", {"content": "record"})

    assert mocked.call_args.args[0] == "https://env.redcap.example/api/"


def test_redcap_connection_falls_back_to_default_url(monkeypatch):
    """Falls back to hardcoded unibe.ch URL when neither settings nor env is set."""
    monkeypatch.setattr(svc, "settings", SimpleNamespace(REDCAP_API_URL=""), raising=False)
    monkeypatch.delenv("REDCAP_API_URL", raising=False)

    ok_resp = SimpleNamespace(status_code=200, text="[]")
    with patch("core.services.redcap_service.requests.post", return_value=ok_resp) as mocked:
        _post_redcap("tok", {"content": "record"})

    assert "redcap.unibe.ch" in mocked.call_args.args[0]
