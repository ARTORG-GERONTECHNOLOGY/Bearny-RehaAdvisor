import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Set

import requests
from django.conf import settings

from utils.config import config

logger = logging.getLogger(__name__)


class RedcapError(Exception):
    def __init__(self, message: str, detail: Any = None):
        super().__init__(message)
        self.detail = detail


def _norm(v: Any) -> str:
    return "" if v is None else str(v).strip()


def _get_redcap_api_url() -> str:
    url = getattr(settings, "REDCAP_API_URL", None)
    if url and str(url).strip():
        return str(url).strip()
    env_url = os.getenv("REDCAP_API_URL", "").strip()
    if env_url:
        return env_url
    return "https://redcap.unibe.ch/api/"


def _parse_invalid_fields(error_text: str) -> Set[str]:
    """
    Extract field names from a REDCap 'not valid' error message such as:
      'The following values in the parameter "fields" are not valid: 'pat_id','diabetes''
    Returns a set of field name strings.
    """
    m = re.search(r"not valid[:\s]+(.*)", error_text, re.IGNORECASE)
    if not m:
        return set()
    raw = m.group(1)
    return {f.strip().strip("'\"") for f in raw.split(",") if f.strip().strip("'\"")}


def _post_redcap(token: str, payload: Dict[str, Any], timeout: int = 30) -> str:
    url = _get_redcap_api_url()
    data = {"token": token, **payload}
    try:
        r = requests.post(url, data=data, timeout=timeout)
    except Exception as e:
        raise RedcapError("Failed to reach REDCap API.", detail=str(e))
    if r.status_code != 200:
        raise RedcapError(
            "REDCap API returned non-200.",
            detail={"status": r.status_code, "text": r.text[:500]},
        )
    return r.text


def _post_redcap_with_field_fallback(token: str, payload: Dict[str, Any], fields: List[str], timeout: int = 30) -> str:
    """
    Like _post_redcap but automatically removes fields that REDCap says are
    invalid and retries once.  Returns the response text of the successful call.
    """

    # Inject field list into payload
    def _with_fields(f_list: List[str]) -> Dict[str, Any]:
        p = {k: v for k, v in payload.items() if not k.startswith("fields[")}
        for i, f in enumerate(f_list):
            p[f"fields[{i}]"] = f
        return p

    try:
        return _post_redcap(token, _with_fields(fields), timeout)
    except RedcapError as e:
        detail_text = e.detail.get("text", "") if isinstance(e.detail, dict) else str(e.detail or "")
        invalid = _parse_invalid_fields(detail_text)
        if not invalid or e.args[0] != "REDCap API returned non-200.":
            raise
        trimmed = [f for f in fields if f not in invalid]
        if not trimmed or trimmed == fields:
            raise
        logger.info("Retrying REDCap export without unsupported fields: %s", sorted(invalid))
        return _post_redcap(token, _with_fields(trimmed), timeout)


# -------------------------------------------------------------------
# You already have these in your project; keep your implementations:
#   resolve_project(project_name)
#   get_token_for_project(project)
# -------------------------------------------------------------------
def resolve_project(project_name: str) -> str:
    # existing implementation in your codebase
    return project_name


def get_token_for_project(project: str) -> str:
    # existing implementation in your codebase
    key = f"REDCAP_TOKEN_{project.upper()}"
    token = os.getenv(key, "").strip()
    if not token:
        raise RedcapError(f"Missing REDCap token for project {project}.")
    return token


def export_record_by_pat_id(project_name: str, pat_id: str) -> List[Dict[str, Any]]:
    """
    Fetch records by pat_id, but ALSO fallback by record_id because:
      - Some projects (e.g., COMPASS) may have empty pat_id values.
      - Your "patient_code" may actually be record_id.
    Returns list of REDCap rows (flat). May be empty.

    This version also exports the patient characteristics fields needed by the PatientPopup.
    """

    project = resolve_project(project_name)
    token = get_token_for_project(project)

    identifier = _norm(pat_id)
    if not identifier:
        return []

    # ---- fields you likely want in the PatientPopup ----
    # Keep this list "small but useful". Add more if you need them.
    fields = config["RedCap_Characteristics"]

    base_payload: Dict[str, Any] = {
        "content": "record",
        "format": "json",
        "type": "flat",
        "rawOrLabel": "raw",
        "rawOrLabelHeaders": "raw",
        "exportCheckboxLabel": "false",
        "exportSurveyFields": "false",
        "exportDataAccessGroups": "true",
        "returnFormat": "json",
    }

    def _export_with_filter(filter_logic: str) -> List[Dict[str, Any]]:
        payload = {**base_payload, "filterLogic": filter_logic}
        text = _post_redcap_with_field_fallback(token, payload, fields)
        try:
            data = json.loads(text)
            if not isinstance(data, list):
                raise ValueError("JSON is not a list")
            return data
        except Exception as e:
            logger.exception("Failed parsing REDCap JSON")
            raise RedcapError("REDCap returned invalid JSON.", detail=text[:500]) from e

    # 1) Try filter by pat_id
    try:
        rows = _export_with_filter(f"[pat_id] = '{identifier}'")
        if rows:
            return rows
    except RedcapError:
        raise

    # 2) Fallback: try record_id match (works for identifiers like "1" or "905-1")
    try:
        rows = _export_with_filter(f"[record_id] = '{identifier}'")
        if rows:
            return rows
    except RedcapError:
        raise

    return []
