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
| `import_patient_from_redcap` | 14 |
| Utility and service helpers | 6 |

**Total: 29 tests**

---

## Covered Scenarios

### Utility helpers
- `_norm`, `_is_objectid`, `_safe_json_body`, `_bad` — basic input normalisation and error response helpers.
- `_is_strong_password` — password strength validation.
- `_parse_invalid_fields` — extraction of field names from REDCap "not valid" error messages (used for the field-fallback retry).

### Environment and therapist resolution
- REDCap API URL resolution from env var with trimming.
- Token resolution (`REDCAP_TOKEN_<PROJECT>`) — present and absent.
- `get_therapist_by_user_id` — valid ObjectId, invalid ObjectId, and not-found branches.
- `get_allowed_redcap_projects_for_therapist` — both `projects` list and legacy `project` string.
- `allowed_dags_by_project`:
  - Returns the correct DAG set when the therapist's clinics map to the requested project (e.g. Inselspital + COPAIN → `{"inselspital"}`).
  - Returns `None` (no DAG restriction) when the therapist has no clinics that map to any DAG for the project — project access is already gated by the `projects` list, so blocking everything would be wrong.
  - Returns `None` when the therapist has no clinics at all.
  - Correctly resolves a single-project clinic (e.g. Leuven → `{"leuven"}` for COMPASS, `None` for COPAIN).

### REDCap minimal export (`redcap_export_minimal`)
- Success — filters returned rows by `patient_id`.
- Network exception raises `RedcapError`.
- Non-200 response raises `RedcapError`.
- Non-list JSON payload raises `RedcapError`.
- **Field fallback** — if REDCap returns 400 "fields not valid", invalid fields are stripped and the request is retried (e.g. COPAIN and COMPASS projects both lack `pat_id`; it is dropped automatically).

### `GET /api/redcap/available-patients/`
- `405` on non-GET method.
- Therapist not found → `404`.
- Project not in therapist's allowed projects → `403`.
- Missing REDCap token → `200` with error entry in `errors[]`.
- REDCap export error collected per project → `200` with `errors[]` populated.
- **DAG mismatch detection**: when no rows in the export carry a config-recognised DAG name, the DAG filter is skipped (handles projects like COPAIN where REDCap uses abbreviations such as `brz`/`neuro` that don't appear in `clinic_dag`). When records do use config DAG names (e.g. COMPASS with `leuven`, `bern`), the filter is applied normally.
- **Informed-consent filter**: records with `ic != 1` are excluded from candidates.
- Deduplication: duplicate `(project, identifier)` pairs collapsed into one candidate.
- Already-imported patients (matched by `redcap_identifier` or by `patient_code` scoped to the same project) excluded from candidates.
- Successful candidate listing returns `project`, `record_id`, `pat_id`, `identifier`, and `dag` per candidate.

### `POST /api/redcap/import-patient/`
- `405` on non-POST method.
- Missing required fields → `400`.
- Weak password → `400`.
- Project not in therapist's allowed projects → `403`.
- Already-imported patient → `409` (matched by `redcap_identifier` scoped to project, with fallback to `patient_code`).
- Missing REDCap token → `400`.
- DAG forbidden: record's DAG not in therapist's allowed DAG set → `403`.
- **Non-consented REDCap record** (`ic != 1`) is rejected → `403` before any database write.
- Record not found in REDCap → `404`.
- Fallback: first lookup by `record_id` returns empty → retries by `pat_id` filter.
- Fallback REDCap error on second attempt → `502`.
- Username collision: existing username gets `_2` suffix.
- Successful import: `User` + `Patient` created with correct `project`, `clinic`, `redcap_project`, `redcap_identifier`, `redcap_record_id`, `redcap_pat_id`, and `redcap_dag` fields.
- Import log: `Logs` document with `action="REDCAP_IMPORT"` is written on success.

---

## Key Invariants Tested

| Invariant | Test |
|---|---|
| Inselspital + COPAIN therapist → allowed DAGs = `{"inselspital"}` | `test_env_helpers_and_therapist_resolution_branches` |
| Leuven therapist requesting COPAIN → `None` (no DAG restriction) | `test_env_helpers_and_therapist_resolution_branches` |
| Leuven therapist requesting COMPASS → `{"leuven"}` | `test_env_helpers_and_therapist_resolution_branches` |
| No-clinic therapist → `None` (no DAG restriction) | `test_env_helpers_and_therapist_resolution_branches` |
| DAG filter applied when export uses config DAG names | `test_available_patients_dag_filter_and_dedupe` |
| Record with DAG outside allowed set is blocked (COMPASS context) | `test_available_patients_dag_filter_and_dedupe` |
| Record with `ic = 0` is excluded from available candidates | `test_available_patients_excludes_non_consented_records` |
| Record with `ic = 0` is rejected at import | `test_import_patient_rejects_non_consented_record` |
| Already-imported patient uses `project`-scoped lookup | `test_import_patient_already_imported`, `test_available_patients_excludes_existing` |
| Imported patient receives `project` field | `test_import_patient_success` |
| Imported patient `clinic` is derived from DAG, not therapist's first clinic | `test_import_patient_success` |
| Per-project errors surface in `errors[]` at HTTP 200 | `test_available_patients_collects_errors` |

---

## Informed-Consent Gate

The consent check is applied at two independent points, so neither endpoint can be bypassed to import a non-consented participant:

1. **List endpoint** (`available_redcap_patients`) — `_has_informed_consent(row)` is called for every row returned by REDCap. Records with `ic = ""` (no decision) or `ic = "0"` (refused) are silently skipped.
2. **Import endpoint** (`import_patient_from_redcap`) — consent is re-checked on the single row fetched for the specific participant. If `ic != 1` the endpoint returns `403` before any database write.

`_has_informed_consent` accepts `"1"` (string) or `1.0` (numeric float). Anything else — including an empty string or a missing `ic` key — is treated as not consented.

---

## DAG Filter and Config Mismatch

The platform compares each row's `redcap_data_access_group` against the DAG set derived from the therapist's clinics. However, some REDCap projects use DAG name abbreviations that don't match the strings in `config.json → clinic_dag` (e.g. COPAIN uses `brz` and `neuro` rather than `berner_reha_centrum` / `inselspital`).

To handle this without false-blocking all records, the filter checks whether any row in the export carries a DAG name that appears in the full configured set. If none do, the DAG filter is skipped for that project and all consented, not-yet-imported records are returned. If at least one row does use a configured DAG name (e.g. COMPASS with `leuven`, `bern`, etc.), the filter is applied normally.

---

## Already-Imported Lookup

`_get_existing_identifiers_for_project(project)` determines which identifiers are already in the platform database, to prevent duplicate imports:

1. **Preferred path**: queries `Patient.objects(redcap_project=project)` and reads `redcap_identifier`. Works for patients imported after the `redcap_project` / `redcap_identifier` fields were added to the model.
2. **Fallback path**: queries `Patient.objects(project=project)` and reads `patient_code`. Scoped to the same project to prevent cross-project false positives (e.g. a COMPASS patient with `patient_code="2"` must not block a COPAIN record with `record_id="2"`).

---

## Running

```bash
# All REDCap import tests
docker exec django pytest tests/redcap_import_views/ -v

# With coverage
docker exec django pytest tests/redcap_import_views/ --cov=core.views.redcap_import_views -v
```
