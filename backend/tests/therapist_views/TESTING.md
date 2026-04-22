# Therapist Views — Test Documentation

This document describes every test in
[`test_therapist_views.py`](test_therapist_views.py) for therapist-facing
endpoints in `core/views/therapist_views.py`.

---

## Endpoints and their test coverage

| Endpoint | HTTP verb | View function | Tests |
|---|---|---|---|
| `/api/therapists/<therapist_id>/patients/` | GET | `list_therapist_patients` | 14 |
| `/api/analytics/log` | POST | `create_log` | 4 |
| Internal helpers (unit-level) | N/A | `_avg`, `_day_key`, `_sum_points_for_day`, `_adherence`, `_feedback_computing`, `_intervention_feedback_summary` | 9 |
| Project-based access filter (unit-level) | N/A | `list_therapist_patients` queryset | 4 |

**Total: 35 tests**

---

## Data model overview

```
User (Therapist) ──► Therapist
User (Patient)   ──► Patient ──► Therapist

Logs
  ├── userId   → User
  ├── action   (LOGIN, REHATABLE, HEALTH_PAGE, ...)
  ├── started / ended
  └── patient  → Patient (optional)

FitbitData
  ├── user              → User
  ├── steps
  ├── active_minutes
  ├── wear_time_minutes   (minutes with HR > 0; null if not recorded)
  └── sleep
      ├── sleep_duration    (total time in bed, ms)
      └── minutes_asleep    (actual sleep time, min — matches Fitbit app)
```

---

## `list_therapist_patients`  —  `GET /api/therapists/<therapist_id>/patients/`

Returns the therapist's active patients as a flat list used by therapist patient dashboards.

**Access control:** Patients are filtered by both clinic and project:
- `patient.clinic in therapist.clinics` — always applied.
- `patient.project in therapist.projects` — applied when the therapist has at least one project assigned. Therapists with `projects=[]` fall back to clinic-only filtering for backward compatibility.

### Response fields (per patient)

| Field | Meaning |
|---|---|
| `_id` | Patient document id |
| `username` | Patient `User.username` |
| `patient_code` | Patient code |
| `first_name`, `name`, `sex`, `diagnosis`, `age` | Basic profile fields |
| `last_online` | Last login log timestamp, if any |
| `biomarker` | `{ sleep_avg_h, activity_min, steps_avg, wear_time_avg_min, wear_time_days_since }` (7-day averages) |
| `adherence_rate`, `adherence_total` | Adherence percentages |
| `questionnaires` | Questionnaire summary entries |
| `intervention_feedback` | Intervention-feedback summary: recency, recent average score, and trend |
| `feedback_low` | `true` if any questionnaire is flagged low-score |

**`intervention_feedback` fields:**

| Field | Meaning |
|---|---|
| `last_answered_at` | Latest intervention feedback timestamp with numeric score |
| `days_since_last` | Days since latest scored intervention feedback |
| `answered_days_total` | Number of calendar days with scored intervention feedback |
| `recent_days_count` | Number of answered days in the recent window |
| `recent_avg_score` | Mean score across recent answered days |
| `previous_avg_score` | Mean score across previous answered-day window |
| `trend_delta` | `recent_avg_score - previous_avg_score` |
| `trend_lower` | `true` if `trend_delta < 0` |

**Biomarker fields detail:**

| Field | Meaning |
|---|---|
| `sleep_avg_h` | Average hours asleep per night over 7 days. Uses `minutes_asleep` (actual sleep from Fitbit) when available; falls back to `sleep_duration / 60000 / 60` (time in bed). |
| `wear_time_avg_min` | Average daily Fitbit wear time in minutes over 7 days. `null` if no wear data. |
| `wear_time_days_since` | Days since the last day the device had any wear recorded. `null` if no wear data. Used by the frontend to colour-code the Wear badge (red ≥ 2 days; yellow < 12 h avg; green otherwise). |

### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_list_therapist_patients_success` | Therapist with one active patient | 200, JSON list includes patient username |
| `test_list_therapist_patients_not_found` | Valid ObjectId but no therapist | 404, `error: Therapist not found` |
| `test_list_therapist_patients_invalid_id_returns_400` | Invalid ObjectId string in path | 400, `error: Invalid therapist ID` |
| `test_list_therapist_patients_method_not_allowed` | POST instead of GET | 405, `error: Method not allowed` |
| `test_list_therapist_patients_excludes_inactive_users` | Patient user exists but `isActive=False` | 200, patient excluded from list |
| `test_list_therapist_patients_includes_login_and_biomarker_fields` | Login log + Fitbit metrics exist | 200, `last_online` set, biomarker averages populated |
| `test_biomarker_includes_wear_time_fields` | Two FitbitData docs with `wear_time_minutes` | `wear_time_avg_min` = average of both; `wear_time_days_since` = 1 |
| `test_biomarker_wear_time_none_when_no_fitbit_data` | No FitbitData for patient | Both wear fields are `null` |
| `test_biomarker_sleep_avg_h_uses_minutes_asleep` | FitbitData has `minutes_asleep=420` (7 h) and `sleep_duration=28800000` (8 h) | `sleep_avg_h` is 7.0, not 8.0 |
| `test_biomarker_sleep_falls_back_to_duration_when_no_minutes_asleep` | FitbitData has only `sleep_duration=27000000` (7.5 h), no `minutes_asleep` | `sleep_avg_h` is 7.5 |

### Project-based access isolation tests

| Test | Scenario | Expected |
|---|---|---|
| `test_project_filter_hides_other_project_patients` | COPAIN therapist at Inselspital; COMPASS patient also at Inselspital | COMPASS patient excluded from response |
| `test_project_filter_shows_all_assigned_projects` | Therapist with COPAIN+COMPASS at Inselspital | Both patients returned |
| `test_project_filter_respects_clinic_boundary` | Inselspital/COPAIN therapist; Berner Reha Centrum/COPAIN patient | Berner Reha patient excluded |
| `test_no_projects_assigned_falls_back_to_clinic_filter` | Therapist with `projects=[]`; patient at same clinic | Patient returned (backward-compat fallback) |

---

## `create_log`  —  `POST /api/analytics/log`

Creates an analytics/audit log entry. Optional patient linkage is supported.

### Important behaviour covered

- `details` is truncated to 500 characters before save.
- Unknown referenced `user` or malformed JSON currently returns HTTP 500.

### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_create_log_success_for_existing_user` | Valid user + payload | 201, `status: ok`, log persisted, details truncated |
| `test_create_log_with_patient_reference` | Valid user + valid patient reference | 201, saved log contains patient reference |
| `test_create_log_invalid_json_returns_500` | Non-JSON payload with JSON content type | 500, `error: Failed to create log` |
| `test_create_log_unknown_user_returns_500` | Non-existing user id in payload | 500, `error: Failed to create log` |

---

## Helper function tests (unit-level)

These tests directly validate branch-heavy helper functions in
`core/views/therapist_views.py`.

| Test | Scenario | Expected |
|---|---|---|
| `test_helper_avg_filters_non_numeric_values` | Mixed numeric + non-numeric inputs | Average from numeric values only; `None` if no numeric values |
| `test_helper_day_key_returns_date_component` | Datetime input | Returns only calendar date |
| `test_sum_points_for_day_ignores_non_numeric_zero_and_other_questions` | Mixed answer keys (`2`, `0`, invalid, other question) | Counts only valid positive numeric keys for relevant question ids |
| `test_adherence_uses_schedule_when_plan_exists` | Plan has scheduled dates + completed/skipped logs | Uses schedule-based denominator for 7d/total adherence |
| `test_adherence_falls_back_to_logs_when_no_schedule` | No scheduled denominator, but logs exist | Falls back to `completed / (completed + skipped)` |
| `test_adherence_returns_none_when_no_logs_and_no_schedule` | No schedule and no logs | Returns `(None, None)` |
| `test_feedback_computing_returns_empty_without_assignments` | No questionnaire assignments | Returns empty summary and `None` last feedback |
| `test_feedback_computing_handles_questionnaire_without_questions` | Assigned questionnaire has no questions | Summary item with zero expected/answered and no score |
| `test_feedback_computing_scores_and_adherence_for_two_answer_days` | Two scheduled dates and two answer days | Computes expected/answered counts, adherence, scores, delta, low-score flag, and last timestamp |

---

## Running the tests

```bash
# From the backend/ directory
pytest tests/therapist_views/ -v
```

To run only this file:

```bash
pytest tests/therapist_views/test_therapist_views.py -v
```

---

## Test infrastructure

### `mongo_mock` fixture

Each test uses an `autouse` function-scoped fixture that:

1. Disconnects any existing mongoengine default connection.
2. Connects to a fresh in-memory `mongomock` database.
3. Tears down the connection after the test.

This guarantees test isolation and prevents database state leakage.
