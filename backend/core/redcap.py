# core/redcap.py
import requests


def redcap_export_record(api_url: str, token: str, record_id: str, fields: list[str]):
    payload = {
        "token": token,
        "content": "record",
        "format": "json",
        "type": "flat",
        "records[0]": record_id,
        "rawOrLabel": "raw",
        "rawOrLabelHeaders": "raw",
        "exportCheckboxLabel": "false",
        "exportSurveyFields": "false",
        "exportDataAccessGroups": "false",
    }

    # add fields
    for i, f in enumerate(fields):
        payload[f"fields[{i}]"] = f

    r = requests.post(api_url, data=payload, timeout=20)
    r.raise_for_status()
    data = r.json()
    # data is typically a list of dicts
    return data[0] if data else None
