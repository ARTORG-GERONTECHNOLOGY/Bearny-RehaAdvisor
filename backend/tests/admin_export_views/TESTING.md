# Admin Export Views — Test Documentation

This document describes every test in
[`test_admin_export_views.py`](test_admin_export_views.py) for the two
endpoints under `/api/admin/export/`.

---

## Endpoints and their test coverage

| Endpoint | HTTP verb | View function | Tests |
|---|---|---|---|
| `/api/admin/export/patients/` | GET | `admin_export_patients` | 22 |
| `/api/admin/export/clinics/` | GET | `admin_export_clinics` | 4 |

**Total: 26 tests**

---

## Feature overview

The export feature lets an Admin download a complete snapshot of patient-related
data as a ZIP archive, optionally scoped to one or more clinics.

```
Admin GET /api/admin/export/clinics/
  → JSON list of distinct clinic names present in the Patient collection

Admin GET /api/admin/export/patients/?clinics=all
  → ZIP attachment — all patients, all data types

Admin GET /api/admin/export/patients/?clinics=Inselspital,Bern
  → ZIP attachment — same data, filtered to those clinics
```

### ZIP contents — one CSV per data type

| File | Source model(s) | Description |
|---|---|---|
| `patients.csv` | `Patient` | Demographic data |
| `rehab_calendar.csv` | `RehabilitationPlan` + `InterventionAssignment` | Scheduled intervention dates |
| `intervention_logs.csv` | `PatientInterventionLogs` | Daily execution records |
| `intervention_feedback.csv` | `FeedbackEntry` (embedded in logs) | Per-intervention questionnaire answers |
| `health_vitals.csv` | `PatientVitals` | Manually entered weight and blood pressure |
| `health_fitbit.csv` | `FitbitData` | Wearable data (steps, sleep, HR, …) |
| `questionnaire_answers.csv` | `PatientICFRating` | Health-status ICF questionnaire responses |
| `thresholds.csv` | `PatientThresholds` (embedded in Patient) | Current alert thresholds per patient |
| `threshold_history.csv` | `PatientThresholdsSnapshot` (embedded list) | History of threshold changes |
| `activity_logs.csv` | `Logs` | Platform activity events linked to patients |

### CSV column schemas

#### `patients.csv`
`clinic`, `project`, `patient_code`, `first_name`, `last_name`, `age`, `sex`,
`diagnosis` (`;`-joined), `function` (`;`-joined), `therapist`, `reha_end_date`,
`study_end_date`, `duration_days`, `preferred_language`, `created_at`

#### `rehab_calendar.csv`
`clinic`, `patient_code`, `plan_status`, `plan_start`, `plan_end`,
`intervention_external_id`, `intervention_title`, `scheduled_date`,
`frequency`, `notes`
— One row per scheduled date per `InterventionAssignment`; if an assignment has
no dates, one row is emitted with an empty `scheduled_date`.

#### `intervention_logs.csv`
`clinic`, `patient_code`, `intervention_external_id`, `intervention_title`,
`date`, `status` (`;`-joined list), `comments`, `created_at`

#### `intervention_feedback.csv`
`clinic`, `patient_code`, `intervention_external_id`, `log_date`,
`feedback_date`, `question_key`, `answer_keys` (`;`-joined), `comment`

#### `health_vitals.csv`
`clinic`, `patient_code`, `date`, `weight_kg`, `bp_sys`, `bp_dia`,
`source`, `note`

#### `health_fitbit.csv`
`clinic`, `patient_code`, `date`, `steps`, `active_minutes`,
`sleep_duration_min`, `resting_heart_rate`, `max_heart_rate`,
`calories`, `distance_km`, `weight_kg`, `bp_sys`, `bp_dia`
— Resolved via `FitbitData.user → User → Patient` using a pre-built lookup map.

#### `questionnaire_answers.csv`
`clinic`, `patient_code`, `date`, `icf_code`, `question_key`, `rating`,
`comment` (from nested `feedback_entries`)

#### `thresholds.csv`
`clinic`, `patient_code`, `steps_goal`, `active_minutes_green`,
`active_minutes_yellow`, `sleep_green_min`, `sleep_yellow_min`,
`bp_sys_green_max`, `bp_sys_yellow_max`, `bp_dia_green_max`, `bp_dia_yellow_max`

#### `threshold_history.csv`
`clinic`, `patient_code`, `effective_from`, `changed_by`, `reason`,
+ same threshold columns as above

#### `activity_logs.csv`
`clinic`, `patient_code`, `action`, `timestamp`, `actor_role`, `details`
— Only logs where `Logs.patient` is set (i.e. patient-linked events).

---

## `admin_export_patients` — `GET /api/admin/export/patients/`

### Query parameters

| Parameter | Default | Description |
|---|---|---|
| `clinics` | `all` | Comma-separated clinic names, or `"all"` for every patient |

### Tests

#### ZIP structure and response headers

| Test | Scenario | Expected |
|---|---|---|
| `test_export_returns_zip_content_type` | GET with no params | 200, `Content-Type: application/zip` |
| `test_export_returns_attachment_header` | GET with no params | `Content-Disposition` contains `attachment`, `export_`, `.zip` |
| `test_export_zip_contains_all_expected_csv_files` | GET with no params | ZIP namelist equals the 10-file set exactly |
| `test_export_method_not_allowed` | POST | 405 |

#### Clinic filtering

| Test | Scenario | Expected |
|---|---|---|
| `test_export_all_includes_all_patients` | Two patients in different clinics, no filter | Both present in `patients.csv` |
| `test_export_clinics_all_param_returns_all` | `?clinics=all` | Both patients returned |
| `test_export_filters_by_single_clinic` | `?clinics=Inselspital` | Only the Inselspital patient returned |
| `test_export_filters_by_multiple_clinics` | `?clinics=Inselspital,Bern` | Exactly those two patients |
| `test_export_empty_when_clinic_not_in_db` | `?clinics=NonExistent` | `patients.csv` is header-only |

#### `patients.csv`

| Test | Scenario | Expected |
|---|---|---|
| `test_patients_csv_has_expected_headers` | GET | Header row contains all required column names |
| `test_patients_csv_correct_field_values` | One patient with specific data | All fields match; list fields are semicolon-joined; date is YYYY-MM-DD |
| `test_patients_csv_sorted_by_clinic` | Three patients with clinics Zurich, Aachen, Bern | Rows ordered alphabetically by clinic |

#### `rehab_calendar.csv`

| Test | Scenario | Expected |
|---|---|---|
| `test_rehab_calendar_csv_contains_scheduled_dates` | Plan with two scheduled dates | Two rows; correct `patient_code`, `clinic`, `intervention_external_id`, `scheduled_date`, `frequency`, `notes` |
| `test_rehab_calendar_empty_without_plans` | Patient with no RehabilitationPlan | Empty CSV |

#### `intervention_logs.csv`

| Test | Scenario | Expected |
|---|---|---|
| `test_intervention_logs_csv_contains_log_rows` | One PatientInterventionLog | Row with correct `patient_code`, `clinic`, `status`, `comments`, `date` |

#### `intervention_feedback.csv`

| Test | Scenario | Expected |
|---|---|---|
| `test_intervention_feedback_csv_contains_feedback_entries` | Log with one FeedbackEntry referencing a FeedbackQuestion | Row with correct `question_key` and `comment` |

#### `health_vitals.csv`

| Test | Scenario | Expected |
|---|---|---|
| `test_health_vitals_csv_contains_vitals_rows` | One PatientVitals record | Row with `weight_kg`, `bp_sys`, `bp_dia`, `source` |

#### `health_fitbit.csv`

| Test | Scenario | Expected |
|---|---|---|
| `test_health_fitbit_csv_contains_fitbit_rows` | One FitbitData document | Row resolved via user → patient; correct `steps`, `active_minutes`, `resting_heart_rate` |

#### `questionnaire_answers.csv`

| Test | Scenario | Expected |
|---|---|---|
| `test_questionnaire_answers_csv_contains_icf_ratings` | One PatientICFRating | Row with `icf_code`, `question_key`, `rating` |

#### `thresholds.csv`

| Test | Scenario | Expected |
|---|---|---|
| `test_thresholds_csv_contains_current_thresholds` | Patient with `steps_goal=12000` | Row reflects the updated value |

#### `threshold_history.csv`

| Test | Scenario | Expected |
|---|---|---|
| `test_threshold_history_csv_contains_snapshots` | One PatientThresholdsSnapshot | Row with `changed_by`, `reason`, `effective_from`, `steps_goal` |

#### `activity_logs.csv`

| Test | Scenario | Expected |
|---|---|---|
| `test_activity_logs_csv_contains_patient_logs` | One Logs document with `patient` reference | Row with `action`, `actor_role`, `details`, resolved `patient_code` and `clinic` |

---

## `admin_export_clinics` — `GET /api/admin/export/clinics/`

Returns a sorted JSON list of distinct, non-empty clinic names from the
Patient collection. Used by the frontend to populate checkboxes dynamically.

### Response shape

```json
{ "clinics": ["Bern", "Inselspital", "Leuven"] }
```

### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_clinics_returns_200` | GET | 200, `clinics` key present |
| `test_clinics_returns_distinct_sorted_names` | Two patients in `Inselspital`, one in `Bern` | `["Bern", "Inselspital"]` |
| `test_clinics_empty_when_no_patients` | Empty DB | `{ "clinics": [] }` |
| `test_clinics_method_not_allowed` | POST | 405 |

---

## Running the tests

```bash
docker exec django pytest tests/admin_export_views/ -v
```

---

## Test infrastructure

### `mongo_mock` fixture

Function-scoped `autouse` fixture — clean in-memory mongomock per test.

### Factory helpers

| Helper | Creates |
|---|---|
| `_make_therapist(suffix)` | `User` + `Therapist` |
| `_make_patient(therapist, patient_code, clinic, ...)` | `User` + `Patient` |
| `_make_intervention(external_id, language)` | `Intervention` |
| `_open_zip(response)` | Returns `ZipFile` from HTTP response bytes |
| `_read_csv_from_zip(zf, filename)` | Returns list of row dicts from a named CSV in the ZIP |
