# Therapist Views — Test Documentation

This document describes every test in
[`test_therapist_views.py`](test_therapist_views.py) for therapist-facing
endpoints in `core/views/therapist_views.py`.

---

## Endpoints and their test coverage

| Endpoint | HTTP verb | View function | Tests |
|---|---|---|---|
| `/api/therapists/<therapist_id>/patients/` | GET | `list_therapist_patients` | 6 |
| `/api/analytics/log` | POST | `create_log` | 4 |
| Internal helpers (unit-level) | N/A | `_avg`, `_day_key`, `_sum_points_for_day`, `_adherence`, `_feedback_computing` | 9 |

**Total: 19 tests**

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
  ├── user     → User
  ├── steps
  ├── active_minutes
  └── sleep.sleep_duration
```

---

## `list_therapist_patients`  —  `GET /api/therapists/<therapist_id>/patients/`

Returns the therapist's active patients as a flat list used by therapist
patient dashboards.

### Response fields (per patient)

| Field | Meaning |
|---|---|
| `_id` | Patient document id |
| `username` | Patient `User.username` |
| `patient_code` | Patient code |
| `first_name`, `name`, `sex`, `diagnosis`, `age` | Basic profile fields |
| `last_online` | Last login log timestamp, if any |
| `biomarker` | `{ sleep_avg_h, activity_min, steps_avg }` (7-day averages) |
| `adherence_rate`, `adherence_total` | Adherence percentages |
| `questionnaires` | Questionnaire summary entries |
| `feedback_low` | `true` if any questionnaire is flagged low-score |

### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_list_therapist_patients_success` | Therapist with one active patient | 200, JSON list includes patient username |
| `test_list_therapist_patients_not_found` | Valid ObjectId but no therapist | 404, `error: Therapist not found` |
| `test_list_therapist_patients_invalid_id_returns_400` | Invalid ObjectId string in path | 400, `error: Invalid therapist ID` |
| `test_list_therapist_patients_method_not_allowed` | POST instead of GET | 405, `error: Method not allowed` |
| `test_list_therapist_patients_excludes_inactive_users` | Patient user exists but `isActive=False` | 200, patient excluded from list |
| `test_list_therapist_patients_includes_login_and_biomarker_fields` | Login log + Fitbit metrics exist | 200, `last_online` set, biomarker averages populated |

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
