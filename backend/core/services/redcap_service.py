# core/services/redcap_service.py
import json
import logging
import os
from dataclasses import dataclass
from typing import Dict, List, Optional, Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class RedcapError(Exception):
    """Raised for REDCap API errors (network, auth, payload, etc.)."""
    def __init__(self, message: str, *, status_code: Optional[int] = None, detail: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class RedcapProjectCfg:
    name: str
    pid: int
    token_env: str


def _get_redcap_cfg() -> Dict[str, Any]:
    # You said you store config in utils.config.config
    from utils.config import config  # local import to avoid import cycles
    rc = (config or {}).get("redcap") or {}
    if not rc.get("api_url"):
        raise RedcapError("REDCap API URL is missing from config.redcap.api_url")
    if not rc.get("projects"):
        raise RedcapError("No REDCap projects configured under config.redcap.projects")
    return rc


def list_project_names() -> List[str]:
    rc = _get_redcap_cfg()
    return list((rc.get("projects") or {}).keys())


def resolve_project(project_name: str) -> RedcapProjectCfg:
    rc = _get_redcap_cfg()
    projects = rc.get("projects") or {}
    p = projects.get(project_name)
    if not p:
        raise RedcapError(f"Unknown REDCap project '{project_name}'")
    try:
        pid = int(p.get("pid"))
    except Exception:
        raise RedcapError(f"Invalid pid for project '{project_name}'")
    token_env = str(p.get("token_env") or "").strip()
    if not token_env:
        raise RedcapError(f"Missing token_env for project '{project_name}'")
    return RedcapProjectCfg(name=project_name, pid=pid, token_env=token_env)


def allowed_projects_for_clinics(clinics: List[str]) -> List[str]:
    rc = _get_redcap_cfg()
    mapping = rc.get("clinic_project_map") or {}
    allowed = set()
    for c in clinics or []:
        for p in mapping.get(c, []):
            allowed.add(p)
    return sorted(allowed)


def get_token_for_project(project: RedcapProjectCfg) -> str:
    token = os.environ.get(project.token_env, "").strip()
    if not token:
        raise RedcapError(
            f"Missing REDCap token in env var '{project.token_env}' for project '{project.name}'"
        )
    return token


def _post_redcap(token: str, payload: Dict[str, Any]) -> str:
    rc = _get_redcap_cfg()
    url = rc["api_url"]

    # REDCap API expects form-encoded POST by default
    try:
        resp = requests.post(url, data={"token": token, **payload}, timeout=30)
    except requests.RequestException as e:
        logger.exception("REDCap request failed (network)")
        raise RedcapError("REDCap request failed (network error).") from e

    if resp.status_code != 200:
        # REDCap often returns plaintext error
        text = (resp.text or "").strip()
        logger.error("REDCap error %s: %s", resp.status_code, text[:800])
        raise RedcapError(
            f"REDCap returned HTTP {resp.status_code}.",
            status_code=resp.status_code,
            detail=text[:2000] if text else None,
        )

    return resp.text


def export_record_by_pat_id(project_name: str, pat_id: str) -> List[Dict[str, Any]]:
    """
    Fetch records filtered by pat_id.
    Returns list of dicts (REDCap rows). May be empty.
    """
    project = resolve_project(project_name)
    token = get_token_for_project(project)

    # Filter logic:
    # - We request all rows where [pat_id] equals provided pat_id.
    # REDCap filterLogic syntax: [field_name] = 'value'
    filter_logic = f"[pat_id] = '{pat_id}'"

    payload = {
        "content": "record",
        "format": "json",
        "type": "flat",          # easiest to consume
        "rawOrLabel": "raw",
        "rawOrLabelHeaders": "raw",
        "exportCheckboxLabel": "false",
        "exportSurveyFields": "false",
        "exportDataAccessGroups": "false",
        "filterLogic": filter_logic,
        # If you want to restrict forms/events later, add:
        # "forms[0]": "eligibility",
        # "events[0]": "t0_arm_1",
    }

    text = _post_redcap(token, payload)

    try:
        data = json.loads(text)
        if not isinstance(data, list):
            raise ValueError("JSON is not a list")
        return data
    except Exception as e:
        logger.exception("Failed parsing REDCap JSON")
        raise RedcapError("REDCap returned invalid JSON.") from e
