# Patient Views — Test Documentation

This document describes every test across the patient-views test suite.
Tests are split across five files that map to logical feature groups.
It also includes [`test_helpers.py`](test_helpers.py) for pure helper logic in
`core/views/patient_views.py` (serialization, date normalization, ID coercion, and media URL handling).

---

## Endpoints and their test coverage

| Endpoint | HTTP verb(s) | View function | Tests |
|---|---|---|---|
| `/api/patients/feedback/questionaire/` | POST | `submit_patient_feedback` | 6 |
| `/api/interventions/complete/` | POST | `mark_intervention_completed` | 9 |
| `/api/interventions/uncomplete/` | POST | `unmark_intervention_completed` | 6 |
| `/api/interventions/remove-from-patient/` | POST | `remove_intervention_from_patient` | 4 |
| `/api/interventions/add-to-patient/` | POST | `add_intervention_to_patient` | 3 |
| `/api/interventions/modify-patient/` | POST | `modify_intervention_from_date` | 13 |
| `/api/patients/rehabilitation-plan/patient/<id>/` | GET | `get_patient_plan` | 11 |
| `/api/patients/rehabilitation-plan/therapist/<id>/` | GET | `get_patient_plan_for_therapist` | 4 |
| `/api/patients/get-questions/<type>/<id>/` | GET | `get_feedback_questions` | 7 |
| `/api/users/<id>/initial-questionaire/` | GET, POST | `initial_patient_questionaire` | 7 |
| `/api/patients/vitals/manual/<id>/` | POST | `add_manual_vitals` | 6 |
| `/api/patients/vitals/exists/<id>/` | GET | `vitals_exists_for_day` | 6 |
| `/api/patients/healthstatus-history/<id>/` | GET | `get_patient_healthstatus_history` | 3 |
| `/api/patients/feedback/questionaire/` (audio) | POST | `submit_patient_feedback` | 1 |

**Total: 93 tests**

---

## Data model overview

```
User ──(role=Therapist)──► Therapist
     ──(role=Patient)────► Patient ──► Therapist (treating)

RehabilitationPlan
  ├── patientId  → Patient
  ├── therapistId → Therapist
  └── interventions []
        └── InterventionAssignment
              ├── interventionId → Intervention
              ├── dates []        (scheduled datetime instances)
              ├── frequency
              └── require_video_feedback

PatientInterventionLogs   (one per completion event)
  ├── userId → Patient
  ├── interventionId → Intervention
  ├── rehabilitationPlanId → RehabilitationPlan
  ├── date
  ├── status []   ("completed" | …)
  └── feedback []   (FeedbackEntry)

PatientVitals
  ├── patientId → Patient
  ├── date
  ├── weight_kg
  ├── bp_sys / bp_dia
  └── source ("manual" | …)

PatientICFRating            (Healthstatus history)
  ├── patientId → Patient
  ├── date
  └── feedback_entries []
```

---

## `submit_patient_feedback`  —  `POST /api/patients/feedback/questionaire/`

Accepts `multipart/form-data`.  Required field: `userId`.  Optional: `interventionId`, `date` (YYYY-MM-DD), plus one key per `FeedbackQuestion.questionKey` containing the answer (JSON-encoded if a list).  File fields whose content type is `audio/*` or `video/*` are transcribed / stored.

### Tests (`test_patient_views.py`, `test_audio.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_submit_feedback_success_intervention` | Patient + question exist | 200/201, 'Feedback submitted successfully' |
| `test_submit_feedback_no_responses` | Empty answers map | 400, 'No feedback responses provided' |
| `test_submit_feedback_patient_not_found` | Unknown userId | 404, 'Patient not found' |
| `test_submit_feedback_missing_user_id` | No `userId` field | 400, 'Missing userId' |
| `test_submit_feedback_invalid_date_format` | `date = "not-a-date"` | 400, 'Invalid date format' |
| `test_submit_feedback_get_method_not_allowed` | GET | 405 |
| `test_audio_upload_and_recognition` | Audio file + mocked speech-recognition | 200/201, recognizer called |

---

## `mark_intervention_completed`  —  `POST /api/interventions/complete/`

JSON body: `{ patient_id, intervention_id, date? }`.  Ensures at most one log per (patient, plan, intervention, day).  Optional `date` (YYYY-MM-DD) defaults to today.

### Date storage behaviour

Logs are stored with a **naive local datetime** — no UTC conversion.  The old
code converted local midnight to UTC (e.g. local 00:00 UTC+2 → stored as
previous-day 22:00 UTC), causing the stored date's `.date()` to be one day
before the target day.

The fix stores:
1. If the target day matches a scheduled entry in `InterventionAssignment.dates`:
   the exact scheduled datetime, converted to naive local time (preserves the
   original session time for back-dated completions).
2. Otherwise: `datetime.datetime.combine(target_day, datetime.time.min)` —
   local midnight, no timezone conversion.

`unmark_intervention_completed` uses the same naive local day window
`[00:00, 23:59:59]` for querying, keeping both operations consistent.

### Tests (`test_patient_views.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_mark_intervention_completed_success` | Valid patient + intervention | 200, 'Marked as completed successfully' |
| `test_mark_intervention_completed_missing_params` | Empty body | 400, 'Missing patient_id or intervention_id' |
| `test_mark_intervention_completed_patient_not_found` | Unknown patient | 404, 'Patient not found' |
| `test_mark_intervention_completed_get_method_not_allowed` | GET | 405 |
| `test_mark_intervention_completed_no_rehab_plan` | Patient exists but no plan | 404, 'Rehabilitation plan not found' |
| `test_mark_intervention_completed_with_explicit_date` | Valid `date` (yesterday) | 200, 'Marked as completed successfully' |
| `test_mark_intervention_completed_invalid_date` | `date = "invalid-date"` | 400 |
| `test_mark_completed_stores_local_date_not_utc` | Mark today — verify `log.date.date() == today` | 200, stored date == local today (regression) |
| `test_mark_completed_uses_scheduled_datetime_from_plan` | Target day matches plan entry at 08:30 — verify stored time is 08:30, not midnight | 200, `log.date == scheduled datetime` |

---

## `unmark_intervention_completed`  —  `POST /api/interventions/uncomplete/`

JSON body: `{ patient_id, intervention_id, date }` (all required).  Removes 'completed' status from the log for that day; deduplicates duplicate logs.

### Tests (`test_uncomplete_and_modify.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_unmark_intervention_completed_success` | Log exists for today | 200, 'Unmarked' |
| `test_unmark_intervention_completed_no_log_for_day` | No log for requested day | 200, 'No completion log for this day' |
| `test_unmark_intervention_completed_missing_params` | Only `patient_id` provided | 400, 'Missing required fields' |
| `test_unmark_intervention_completed_patient_not_found` | Unknown patient | 404 |
| `test_unmark_intervention_completed_invalid_date` | `date = "not-a-date"` | 400 |
| `test_unmark_intervention_completed_get_method_not_allowed` | GET | 405 |

---

## `remove_intervention_from_patient`  —  `POST /api/interventions/remove-from-patient/`

JSON body: `{ intervention, patientId }`.  Removes all *future* scheduled dates.

### Tests (`test_patient_views.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_remove_intervention_success` | Valid patient + plan | 200, 'Intervention dates removed successfully' |
| `test_remove_intervention_missing_params` | Empty body | 400, 'Missing required parameters' |
| `test_remove_intervention_patient_not_found` | Unknown patientId | 404, 'Patient not found' |
| `test_remove_intervention_get_method_not_allowed` | GET | 405 |

---

## `add_intervention_to_patient`  —  `POST /api/interventions/add-to-patient/`

JSON body: `{ therapistId, patientId, interventions: [...] }`.  Creates or appends to a RehabilitationPlan.

### Tests (`test_patient_views.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_add_intervention_to_patient_success` | Full valid payload | 200/201, `success: true` |
| `test_add_intervention_to_patient_get_method_not_allowed` | GET | 405 |
| `test_add_intervention_to_patient_missing_required_fields` | Empty body | 400, `field_errors` present |

---

## `modify_intervention_from_date`  —  `POST /api/interventions/modify-patient/`

JSON body: `{ patientId, interventionId, effectiveFrom, keep_current?, schedule?, notes? }`.  Splits existing dates into past/future, optionally regenerates future schedule.

### Tests (`test_uncomplete_and_modify.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_modify_intervention_from_date_missing_fields` | Empty body | 400, `field_errors` with `patientId`, `interventionId`, `effectiveFrom` |
| `test_modify_intervention_from_date_patient_not_found` | Unknown patient | 404 |
| `test_modify_intervention_from_date_intervention_not_assigned` | Valid patient but unassigned intervention | 404 |
| `test_modify_intervention_from_date_keep_current` | `keep_current: true` | 200, `success: true` |
| `test_modify_intervention_from_date_invalid_effective_from` | `effectiveFrom = "not-a-date"` | 400, `field_errors.effectiveFrom` |
| `test_modify_intervention_from_date_get_method_not_allowed` | GET | 405 |
| `test_modify_intervention_from_date_invalid_json_body` | malformed JSON request | 400 |
| `test_modify_intervention_from_date_no_rehab_plan` | patient exists without plan | 404 |
| `test_modify_intervention_from_date_requires_schedule_when_keep_current_false` | missing schedule when `keep_current=false` | 400 |
| `test_modify_intervention_from_date_schedule_generation_failed` | invalid schedule block | 400 |
| `test_modify_intervention_from_date_schedule_success` | valid schedule regeneration | 200 |
| `test_modify_intervention_from_date_internal_date_conversion_error` | `_as_aware_utc` failure branch | 500 |

---

## `get_patient_plan`  —  `GET /api/patients/rehabilitation-plan/patient/<id>/`

Returns the rehabilitation plan as a list of assignment rows, each containing full intervention metadata, scheduled dates, completion dates, and today's feedback.

### Tests (`test_patient_views.py`, `test_get_endpoints.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_get_patient_plan_success` | Patient + plan | 200, list or dict |
| `test_get_patient_plan_patient_not_found` | Unknown patient | 404, 'Patient not found' |
| `test_get_patient_plan_no_plan_returns_empty_list` | Patient but no plan | 200, `rehab_plan: []` |
| `test_get_patient_plan_invalid_patient_id_500_or_400` | Malformed ObjectId | 400 or 500 |
| `test_get_patient_plan_returns_interventions_with_meta_and_flat_fields` | Plan with one assignment | 200, row has `intervention`, `dates`, `completion_dates`, `feedback` |
| `test_get_patient_plan_completion_dates_from_logs_naive_and_aware` | Two logs (naive + aware) | Both dates in `completion_dates` |
| `test_get_patient_plan_feedback_only_for_today` | Logs from yesterday + today | Only today's feedback returned |
| `test_get_patient_plan_includes_require_video_feedback_flag` | Assignment with flag | `require_video_feedback: true` in row |
| `test_get_patient_plan_multiple_assignments` | Two-assignment plan | Two rows returned |
| `test_get_patient_plan_patient_not_found_404` | Unknown ObjectId | 404 |
| `test_get_patient_plan_post_method_not_allowed` | POST | 405 |

---

## `get_patient_plan_for_therapist`  —  `GET /api/patients/rehabilitation-plan/therapist/<patient_id>/`

Returns a structured plan with adherence metadata for the therapist dashboard.  `patient_id` here is the **Patient** document's ObjectId (not the User's).

### Tests (`test_get_endpoints.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_get_patient_plan_for_therapist_success` | Patient + plan | 200, `interventions` or `message` key |
| `test_get_patient_plan_for_therapist_patient_not_found` | Unknown Patient ObjectId | 404, 'Patient not found' |
| `test_get_patient_plan_for_therapist_no_plan` | Patient but no plan | 200, 'No rehabilitation plan found' |
| `test_get_patient_plan_for_therapist_post_method_not_allowed` | POST | 405 |

---

## `get_feedback_questions`  —  `GET /api/patients/get-questions/<type>/<patient_id>/`

Returns the list of feedback questions for the given questionnaire type ('Intervention', 'Healthstatus').  Accepts an optional `intervention_id` path segment or query parameter.

### Tests (`test_get_endpoints.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_fetch_feedback_questions_intervention_type` | Type = 'Intervention' | 200, list |
| `test_fetch_feedback_questions_healthstatus_type` | Type = 'Healthstatus' | 200 |
| `test_fetch_feedback_questions_with_intervention_id_in_url` | URL includes `intervention_id` | 200 |
| `test_fetch_feedback_questions_invalid_type` | Type = 'InvalidType' | 400, 'Invalid questionnaire type' |
| `test_fetch_feedback_questions_patient_not_found` | Unknown patient | 404, 'Patient not found' |
| `test_fetch_feedback_questions_post_method_not_allowed` | POST | 405 |
| `test_fetch_feedback_questions_invalid_patient_id` | Non-ObjectId `patient_id` | 400, 'Invalid patient id' |

---

## `initial_patient_questionaire`  —  `GET/POST /api/users/<patient_id>/initial-questionaire/`

GET returns `{ requires_questionnaire: true|false }` based on whether demographics are filled.  POST saves the five required demographic fields.

### Tests (`test_initial_questionnaire.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_get_requires_questionnaire` | No demographics | 200, `requires_questionnaire: true` |
| `test_get_filled_out_questionnaire` | All demographics present | 200, `requires_questionnaire: false` |
| `test_get_patient_not_found` | Unknown patient | 404, `success: false` |
| `test_post_valid_submission` | All 5 fields provided | 201 |
| `test_post_saves_demographics_to_database` | Valid POST | DB value persisted |
| `test_post_missing_fields_returns_400` | Empty body | 400 |
| `test_post_patient_not_found` | Unknown patient | 404 |
| `test_method_not_allowed` | PUT | 405 |

---

## `add_manual_vitals`  —  `POST /api/patients/vitals/manual/<patient_id>/`

Records blood pressure (``bp_sys``, ``bp_dia``) and/or weight (``weight_kg``).  Upserts for the same calendar day.  Accepts optional ISO 8601 ``date``.

### Tests (`test_vitals_and_health.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_add_manual_vitals_success_with_bp` | Valid `bp_sys` + `bp_dia` | 200, `ok: true`, `id` present |
| `test_add_manual_vitals_success_with_weight` | Valid `weight_kg` | 200, `ok: true` |
| `test_add_manual_vitals_no_vitals_provided` | Empty body | 400, 'No vitals provided' |
| `test_add_manual_vitals_patient_not_found` | Unknown patient | 404 |
| `test_add_manual_vitals_invalid_date` | `date = "not-a-date"` | 400 |
| `test_add_manual_vitals_get_method_not_allowed` | GET | 405 |

---

## `vitals_exists_for_day`  —  `GET /api/patients/vitals/exists/<patient_id>/?date=YYYY-MM-DD`

Returns `{ "exists": true|false }`.  The frontend uses this to suppress the data-entry form when vitals have already been recorded for the day.

### Tests (`test_vitals_and_health.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_vitals_exists_for_day_false_when_no_data` | No vitals in DB | 200, `exists: false` |
| `test_vitals_exists_for_day_true_after_adding_vitals` | PatientVitals record exists | 200, `exists: true` |
| `test_vitals_exists_for_day_patient_not_found` | Unknown patient | 404 |
| `test_vitals_exists_for_day_missing_date` | No `date` param | 400 |
| `test_vitals_exists_for_day_post_method_not_allowed` | POST | 405 |
| `test_vitals_exists_for_day_fallback_to_fitbit_data` | fallback branch when `PatientVitals` query fails | 200, `exists: true` |

---

## `get_patient_healthstatus_history`  —  `GET /api/patients/healthstatus-history/<patient_id>/`

Returns `{ "history": [...] }` — all ICF-based healthstatus ratings for the patient, sorted by date.

### Tests (`test_vitals_and_health.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_get_healthstatus_history_success_empty` | No ratings in DB | 200, `history: []` |
| `test_get_healthstatus_history_patient_not_found` | Unknown patient | 404 |
| `test_get_healthstatus_history_post_method_not_allowed` | POST | 405 |

---

## Running the tests

```bash
# From the backend/ directory
pytest tests/patient_views/ -v
```

---

## Test infrastructure

### `mongo_mock` fixture

Function-scoped `autouse` fixture providing a clean in-memory mongomock
connection for every test.  Present in every test file.

### Factory helpers

| Helper | File | Creates |
|---|---|---|
| `setup_patient_with_plan()` | `test_patient_views.py` | User + Therapist + Patient + Intervention + RehabilitationPlan |
| `setup_basic_plan(with_plan=True)` | `test_get_endpoints.py` | Same as above; `with_plan=False` omits the plan |
| `create_patient()` | `test_vitals_and_health.py` | User + Therapist + Patient (no plan) |
| `create_patient(complete=False)` | `test_initial_questionnaire.py` | Patient with optional demographics |
| `setup_patient_with_plan()` | `test_uncomplete_and_modify.py` | Full chain including plan |

### Mocking

- `core.views.patient_views.getattr` — patched in `test_submit_feedback_success_intervention`
  to avoid attribute-resolution issues in the feedback view.
- `speech_recognition.Recognizer.recognize_google` / `.record` / `AudioFile` — mocked in
  `test_audio.py` to prevent real network calls and filesystem access.

### Authorization note

The patient-view endpoints are decorated with
`@permission_classes([IsAuthenticated])` but applied to plain Django function
views (not `@api_view`-wrapped).  As with other views in this project, the
decorator has **no runtime effect** — unauthenticated requests are accepted.
All tests pass `HTTP_AUTHORIZATION="Bearer test"` to document this expectation
explicitly.
