# REDCap Import Views — Test Documentation

Tests in [`test_redcap_import_views.py`](test_redcap_import_views.py) cover:

- `GET /api/redcap/available-patients/`
- `POST /api/redcap/import-patient/`

---

## Coverage Summary

| Endpoint | Tests |
|---|---|
| `available_redcap_patients` | 9 |
| `import_patient_from_redcap` | 12 |
| Utility and service helpers | 6 |

**Total: 27 tests**

---

## Covered scenarios

- Method enforcement.
- Utility helpers (`_norm`, `_is_objectid`, `_safe_json_body`, `_bad`).
- Environment helpers for REDCap URL/token resolution.
- Therapist-resolution helpers (valid/invalid `therapistUserId`, legacy project field).
- REDCap export service branches:
  - success filtering by `patient_id`
  - network exception
  - non-200 API response
  - invalid/non-list payload handling
- Therapist resolution and allowed project checks.
- Missing project token handling.
- Candidate listing with dedup/existing-patient exclusion.
- DAG filtering and mixed per-project error collection.
- Import validation errors (missing fields, weak password).
- Already-imported conflict handling.
- Import DAG-forbidden branch.
- REDCap not-found handling.
- Record-id lookup fallback to patient-id lookup.
- REDCap fallback failure returns 502.
- Username collision suffix generation during import.
- Successful patient import path (User + Patient creation).

---

## Running

```bash
pytest tests/redcap_import_views/ -v
```
