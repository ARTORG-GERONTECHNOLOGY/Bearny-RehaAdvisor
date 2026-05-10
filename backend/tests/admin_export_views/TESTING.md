# Admin Export Views — Test Documentation

This document describes every test in
[`test_admin_export_views.py`](test_admin_export_views.py) for the two
endpoints under `/api/admin/export/`.

---

## Endpoints and their test coverage

| Endpoint | HTTP verb | View function | Tests |
|---|---|---|---|
| `/api/admin/export/patients/` | GET | `admin_export_patients` | 12 |
| `/api/admin/export/clinics/` | GET | `admin_export_clinics` | 4 |

**Total: 16 tests**

---

## Feature overview

The export feature lets an Admin download patient data as a CSV file,
optionally scoped to one or more clinics.

```
Admin GET /api/admin/export/clinics/
  → JSON list of distinct clinic names present in the Patient collection

Admin GET /api/admin/export/patients/?clinics=all
  → CSV attachment — all patients, sorted by clinic then patient_code

Admin GET /api/admin/export/patients/?clinics=Inselspital,Bern
  → CSV attachment — only patients whose clinic matches the filter
```

### CSV column order

| Column | Source field |
|---|---|
| `clinic` | `Patient.clinic` |
| `project` | `Patient.project` |
| `patient_code` | `Patient.patient_code` |
| `first_name` | `Patient.first_name` |
| `last_name` | `Patient.name` |
| `age` | `Patient.age` |
| `sex` | `Patient.sex` |
| `diagnosis` | `Patient.diagnosis` (list → semicolon-joined) |
| `function` | `Patient.function` (list → semicolon-joined) |
| `therapist` | `Therapist.first_name + Therapist.name` (safe dereference) |
| `reha_end_date` | `Patient.reha_end_date` (YYYY-MM-DD) |
| `study_end_date` | `Patient.study_end_date` (YYYY-MM-DD) |
| `duration_days` | `Patient.duration` |
| `preferred_language` | `Patient.preferred_language` |
| `created_at` | `Patient.createdAt` (YYYY-MM-DD) |

### Grouping

Rows are sorted by `clinic` (ascending) then `patient_code` (ascending),
so the file is naturally "grouped by clinic" without requiring a split into
separate sheets.

---

## `admin_export_patients` — `GET /api/admin/export/patients/`

### Query parameters

| Parameter | Default | Description |
|---|---|---|
| `clinics` | `all` | Comma-separated clinic names, or the literal string `"all"` to include every patient |

### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_export_returns_csv_content_type` | GET with no params | 200, `Content-Type: text/csv` |
| `test_export_returns_attachment_header` | GET with no params | `Content-Disposition` contains `attachment`, `patients_export_`, `.csv` |
| `test_export_all_returns_all_patients` | Two patients in different clinics, no filter | Both patients present in CSV |
| `test_export_clinics_all_param_returns_all_patients` | Two patients, `?clinics=all` | Both patients present in CSV |
| `test_export_filters_by_single_clinic` | Two patients, filter to one clinic | Only the matching patient returned |
| `test_export_filters_by_multiple_clinics` | Three patients in three clinics, filter to two | Exactly the two matching patients returned |
| `test_export_csv_has_expected_headers` | GET with no params | Header row contains `clinic`, `project`, `patient_code`, `first_name`, `last_name`, `therapist`, `reha_end_date`, `preferred_language` |
| `test_export_row_contains_correct_field_values` | One patient with specific data | Row values match patient fields; `reha_end_date` formatted as YYYY-MM-DD; `duration_days` as string |
| `test_export_multivalued_fields_joined_by_semicolon` | Patient with `diagnosis=["Stroke","Parkinson"]` and `function=["balance","coordination"]` | Fields serialised as `"Stroke; Parkinson"` and `"balance; coordination"` |
| `test_export_grouped_sorted_by_clinic` | Three patients with clinics Zurich, Aachen, Bern | `clinic` column values are in ascending order |
| `test_export_empty_when_clinic_not_in_db` | Filter to a clinic with no patients | Empty CSV (header row only) |
| `test_export_method_not_allowed` | POST | 405 |

---

## `admin_export_clinics` — `GET /api/admin/export/clinics/`

Returns a sorted JSON list of distinct, non-empty clinic names from the
Patient collection.  The frontend uses this to populate the clinic-filter
checkboxes so the list stays in sync with whatever is actually in the database.

### Response shape

```json
{ "clinics": ["Bern", "Inselspital", "Leuven"] }
```

### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_clinics_returns_200` | GET | 200, `clinics` key present |
| `test_clinics_returns_distinct_non_empty_names` | Two patients in `Inselspital`, one in `Bern` | `["Bern", "Inselspital"]` (no duplicates, sorted) |
| `test_clinics_empty_when_no_patients` | Empty DB | `{ "clinics": [] }` |
| `test_clinics_method_not_allowed` | POST | 405 |

---

## Running the tests

```bash
# From the project root (runs inside the django container)
docker exec django pytest tests/admin_export_views/ -v
```

---

## Test infrastructure

### `mongo_mock` fixture

Function-scoped `autouse` fixture that connects to an in-memory mongomock
instance for every test and disconnects after.  Tests are fully isolated —
no shared state between test functions.

### Factory helpers

| Helper | Creates |
|---|---|
| `_make_therapist(suffix)` | A `User` + `Therapist` document |
| `_make_patient(therapist, patient_code, clinic, ...)` | A `User` + `Patient` document with the given attributes |
| `_parse_csv(response)` | Decodes the response body as UTF-8 and returns a list of `dict` rows via `csv.DictReader` |
