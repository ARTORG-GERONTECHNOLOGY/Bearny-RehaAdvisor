# REDCap Import Views — Test Documentation

Tests in [`test_redcap_import_views.py`](test_redcap_import_views.py) cover:

- `GET /api/redcap/available-patients/`
- `POST /api/redcap/import-patient/`
- Service helpers and utility functions in `redcap_import_views.py`

---

## Coverage Summary

| Group | Tests |
|---|---|
| `available_redcap_patients` | 9 |
| `import_patient_from_redcap` | 12 |
| Utility and service helpers | 6 |

**Total: 27 tests**

---

## Covered Scenarios

### Utility helpers
- `_norm`, `_is_objectid`, `_safe_json_body`, `_bad` — basic input normalisation and error response helpers.
- `_is_strong_password` — password strength validation.
- `_parse_invalid_fields` — extraction of field names from REDCap "not valid" error messages (used for field-fallback retry).

### Environment and therapist resolution
- REDCap API URL resolution from env var with trimming.
- Token resolution (`REDCAP_TOKEN_<PROJECT>`) — present and absent.
- `get_therapist_by_user_id` — valid, invalid ObjectId, and not-found branches.
- `get_allowed_redcap_projects_for_therapist` — both `projects` list and legacy `project` string.
- `allowed_dags_by_project` — returns the correct DAG set for a given therapist and project based on `clinic_dag` / `clinic_projects` config (e.g. Inselspital+COPAIN → `{"inselspital"}`).

### REDCap minimal export (`redcap_export_minimal`)
- Success — filters returned rows by `patient_id`.
- Network exception raises `RedcapError`.
- Non-200 response raises `RedcapError`.
- Non-list JSON payload raises `RedcapError`.
- **Field fallback** — if REDCap returns 400 "fields not valid", invalid fields are stripped and the request is retried (e.g. COMPASS projects that lack `pat_id`).

### `GET /api/redcap/available-patients/`
- `405` on non-GET method.
- Therapist not found → `404`.
- Project not in therapist's allowed projects → `403`.
- Missing REDCap token → `200` with error in `errors[]`.
- REDCap export error collected per project → `200` with `errors[]` populated.
- DAG filter: records whose `redcap_data_access_group` is not in the allowed DAG set are excluded.
- Deduplication: duplicate `(project, identifier)` pairs collapsed.
- Already-imported patients excluded from candidates.
- Successful candidate listing.

### `POST /api/redcap/import-patient/`
- `405` on non-POST method.
- Missing required fields → `400`.
- Weak password → `400`.
- Project not in therapist's allowed projects → `403`.
- Already-imported patient (existing `patient_code`) → `409`.
- Missing REDCap token → `400`.
- DAG forbidden: record's DAG not in therapist's allowed DAGs → `403`.
- Record not found in REDCap → `404`.
- Fallback: first lookup by `record_id` returns empty → retries by `pat_id` filter.
- Fallback REDCap error on second attempt → `502`.
- Username collision: existing username gets `_2` suffix.
- Successful import: `User` + `Patient` created with correct `project` and `clinic` fields.
- Import log: `Logs` document with `action="REDCAP_IMPORT"` is written on success.

---

## Key Invariants Tested

| Invariant | Test |
|---|---|
| Inselspital+COPAIN therapist → allowed DAGs = `{"inselspital"}` | `test_env_helpers_and_therapist_resolution_branches` |
| Record with DAG outside allowed set is blocked | `test_import_patient_dag_forbidden` |
| Imported patient receives `project` field | `test_import_patient_success` |
| Imported patient `clinic` is derived from DAG, not therapist's first clinic | `test_import_patient_success` |
| Per-project errors surface in `errors[]` at HTTP 200 | `test_available_patients_collects_errors` |

---

## Running

```bash
# All REDCap import tests
docker exec django pytest tests/redcap_import_views/ -v

# With coverage
docker exec django pytest tests/redcap_import_views/ --cov=core.views.redcap_import_views -v
```
