# Activity Logs — Test Documentation

Tests for the `Logs` MongoDB collection after the **190-improve-db-logs** refactor.
Every test in [`test_activity_logs.py`](test_activity_logs.py) asserts that the
correct `action`, `actor_role`, `userId`, `patient`, and `details` values are
written to the collection by each view.

---

## What changed in the refactor

| Before | After |
|---|---|
| `action="OTHER"` used for intervention complete/uncomplete | Dedicated `INTERVENTION_COMPLETE` / `INTERVENTION_UNCOMPLETE` actions |
| No log on questionnaire submit | `QUESTIONNAIRE_SUBMIT` log added |
| No log on patient registration | `PATIENT_REGISTER` log added |
| `OPEN_PATIENT` fired on every patient-list load | `OPEN_PATIENT` fires only when a therapist opens a specific patient's profile |
| `userAgent` field stored actor role (e.g. `"Patient"`) | `actor_role` field stores actor role; `user_agent` stores the HTTP User-Agent header |
| `create_log` defaulted to `action="OTHER"` (now invalid) | Defaults to `action="REHATABLE"` |
| No indexes on `Logs` collection | Composite index `(userId, action, -timestamp)` and time-range index `(-timestamp)` added |

### Backward compatibility

`actor_role` is stored in MongoDB under the key `userAgent` via MongoEngine's
`db_field="userAgent"`.  Existing documents written before the refactor remain
readable — the Python attribute name changed but the database field name did not.

---

## Endpoints covered

| Endpoint | HTTP verb | Log action written |
|---|---|---|
| `/api/interventions/complete/` | POST | `INTERVENTION_COMPLETE` |
| `/api/interventions/uncomplete/` | POST | `INTERVENTION_UNCOMPLETE` |
| `/api/patients/feedback/questionaire/` | POST | `QUESTIONNAIRE_SUBMIT` |
| `/api/auth/register/` (Patient path) | POST | `PATIENT_REGISTER` |
| `/api/users/<id>/profile/` (Therapist viewer) | GET | `OPEN_PATIENT` |
| `/api/analytics/log` | POST | `REHATABLE` / any valid action |

---

## Test cases

### INTERVENTION_COMPLETE

| Test | Scenario | Asserts |
|---|---|---|
| `test_mark_intervention_completed_writes_intervention_complete_log` | Patient marks an intervention done | `Logs(action="INTERVENTION_COMPLETE")` written; `userId=patient.userId`, `patient=patient`, `actor_role="Patient"`, intervention title in details |
| `test_mark_intervention_completed_log_details_contain_date` | Same, today's date | Today's ISO date appears in `details` |

### INTERVENTION_UNCOMPLETE

| Test | Scenario | Asserts |
|---|---|---|
| `test_unmark_intervention_completed_writes_intervention_uncomplete_log` | Completion log exists; patient unmarks it | `Logs(action="INTERVENTION_UNCOMPLETE")` written; correct user/patient linkage |
| `test_unmark_no_log_does_not_write_uncomplete_log` | No completion log for the requested day | Zero `INTERVENTION_UNCOMPLETE` logs (nothing changed → nothing to record) |

### QUESTIONNAIRE_SUBMIT

| Test | Scenario | Asserts |
|---|---|---|
| `test_submit_patient_feedback_writes_questionnaire_submit_log` | Patient submits questionnaire answers | `Logs(action="QUESTIONNAIRE_SUBMIT")` written; `userId=patient.userId`, `patient=patient`, `actor_role="Patient"` |

### PATIENT_REGISTER

| Test | Scenario | Asserts |
|---|---|---|
| `test_patient_registration_writes_patient_register_log` | Therapist registers a new patient | `Logs(action="PATIENT_REGISTER")` written; `userId=therapist.userId`, `actor_role="Therapist"`, patient_code and clinic in details |
| `test_patient_registration_log_missing_on_failure` | Registration fails (missing `rehaEndDate`) | Zero `PATIENT_REGISTER` logs |

### OPEN_PATIENT

| Test | Scenario | Asserts |
|---|---|---|
| `test_open_patient_log_written_when_therapist_views_patient_profile` | Therapist GETs a patient's profile | `Logs(action="OPEN_PATIENT")` written; `userId=therapist.userId`, `patient=patient`, `actor_role="Therapist"`, patient_code in details |
| `test_open_patient_log_not_written_when_patient_views_own_profile` | Patient GETs their own profile | Zero `OPEN_PATIENT` logs |

### create_log  (`POST /api/analytics/log`)

| Test | Scenario | Asserts |
|---|---|---|
| `test_create_log_defaults_to_rehatable_action` | Body omits `action` | Stored action is `REHATABLE` (not the old invalid `"OTHER"`) |
| `test_create_log_accepts_legacy_useragent_key` | Body sends `userAgent: "Therapist"` | `actor_role == "Therapist"` |
| `test_create_log_accepts_actor_role_key` | Body sends `actor_role: "Patient"` | `actor_role == "Patient"` |
| `test_create_log_captures_http_user_agent_header` | HTTP `User-Agent` header set | `log.user_agent` contains the header value |
| `test_create_log_truncates_details_to_500_chars` | `details` is 600 chars | Stored `details` has length 500 |
| `test_create_log_returns_log_id_in_response` | Valid request | Response contains `log_id` matching the saved document |
| `test_create_log_unknown_user_returns_500` | Non-existent user ObjectId | 500 (documented behaviour) |
| `test_create_log_invalid_json_returns_500` | Malformed JSON body | 500 |

### Logs model — field mapping

| Test | Scenario | Asserts |
|---|---|---|
| `test_logs_actor_role_stored_in_useragent_db_field` | Save a `Logs` doc, inspect raw MongoDB doc | Raw document key is `userAgent`, not `actor_role` |
| `test_logs_invalid_action_raises_validation_error` | Save with `action="OTHER"` (removed choice) | MongoEngine `ValidationError` raised |

---

## Running the tests

```bash
# From the backend/ directory (inside the django container)
docker exec django pytest tests/activity_logs/ -v
```

---

## Test infrastructure

### `mongo_mock` fixture

Function-scoped `autouse` fixture that:
1. Disconnects any existing mongoengine default connection.
2. Creates a fresh in-memory `mongomock.MongoClient` connection.
3. Tears down after each test.

Guarantees full test isolation — no state leaks between tests.

### Factory helpers

| Helper | Creates |
|---|---|
| `_make_therapist(suffix)` | `User` (Therapist role) + linked `Therapist` doc |
| `_make_patient(therapist, suffix)` | `User` (Patient role) + `Patient` doc |
| `_make_plan_with_intervention(patient, therapist)` | `Intervention` + `RehabilitationPlan` with one assignment |

### Mocking

- `core.views.auth_views.send_mail` — mocked in `PATIENT_REGISTER` tests to avoid SMTP calls.
- `core.jwt_auth.MongoJWTAuthentication.authenticate` — mocked in `OPEN_PATIENT` tests to inject
  a specific authenticated user, since the JWT middleware has no effect in plain Django test client
  calls but `request.user` is read by the view to decide whether to write the log.
