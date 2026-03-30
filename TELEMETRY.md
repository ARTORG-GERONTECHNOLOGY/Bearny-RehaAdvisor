# Platform Telemetry & Usage Taxonomy

This document describes every event that the platform records, where it is stored, what it means, and how to query it.

---

## 1. Storage locations

| Store | Collection / Sink | Retention |
|---|---|---|
| **`Logs` model** (MongoDB) | `logs` | Permanent |
| **`PatientInterventionLogs` model** (MongoDB) | `InterventionLogs` | Permanent |
| **`PasswordAttempt` model** (MongoDB) | `password_attempts` | Permanent |
| **Sentry** | Sentry project (env: `SENTRY_DSN` / `VITE_SENTRY_DSN`) | Per Sentry plan |
| **Django stdout** (structured) | Container log / log aggregator | Per infra policy |

---

## 2. `Logs` collection — action taxonomy

Every `Logs` document has these fields:

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId (ref User) | The user who triggered the action |
| `action` | string (enum) | See table below |
| `timestamp` | datetime | Auto-set to `now()` |
| `started` | datetime \| null | Page/session open time (for timed events) |
| `ended` | datetime \| null | Page/session close time (for timed events) |
| `userAgent` | string (max 20) | Truncated UA header |
| `patient` | ObjectId (ref Patient) \| null | The patient this event relates to |
| `details` | string (max 1000) | Key=value pairs with event-specific context |

### Action values

| Action | Triggered by | `details` content | `patient` set? |
|---|---|---|---|
| `LOGIN` | Successful authentication | — | No |
| `LOGOUT` | User logs out | — | No |
| `UPDATE_PROFILE` | Profile or therapist info edited | Changed fields summary | No |
| `DELETE_ACCOUNT` | Account deletion | — | No |
| `REHATABLE` | Therapist opens rehab table | — | Yes |
| `HEALTH_PAGE` | Therapist opens patient health page | — | Yes |
| `VITALS_SUBMIT` | Patient submits daily weight / BP | `weight_kg=X, bp_sys=X, bp_dia=X` | Yes |
| `QUESTIONNAIRE_SUBMIT` | Patient submits a questionnaire | questionnaire type, intervention id | Yes |
| `OPEN_PATIENT` | Therapist loads patient list | `patient_count=N` | No |
| `ASSIGN_INTERVENTION` | Therapist applies a template to a patient | `diagnosis=X applied=N sessions=N` | Yes |
| `UPDATE_PLAN` | Therapist edits an existing rehab plan | plan id, change summary | Yes |
| `REDCAP_IMPORT` | Therapist imports a patient from REDCap | `project=X identifier=X dag=X` | Yes |
| `INTERVENTION_VIEW` | Patient navigates away from intervention detail | `intervention_id=X date=X seconds=N` | Yes |

### Example queries (MongoDB shell)

```js
// How many vitals were submitted today?
db.logs.countDocuments({ action: "VITALS_SUBMIT", timestamp: { $gte: ISODate("2026-03-21") } })

// Which patients viewed interventions for less than 10 seconds?
db.logs.find({ action: "INTERVENTION_VIEW", details: /seconds=[0-9]$/ })

// How many REDCap imports per project?
db.logs.aggregate([
  { $match: { action: "REDCAP_IMPORT" } },
  { $group: { _id: "$details", count: { $sum: 1 } } }
])

// Therapist login frequency (last 30 days)
db.logs.countDocuments({ action: "LOGIN", timestamp: { $gte: new Date(Date.now() - 30*86400*1000) } })
```

---

## 3. `InterventionLogs` collection

Records every patient interaction with a scheduled intervention.

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId (ref Patient) | |
| `interventionId` | ObjectId (ref Intervention) | |
| `rehabilitationPlanId` | ObjectId (ref RehabilitationPlan) | |
| `date` | datetime | Scheduled date of the intervention |
| `status` | list[string] | `completed`, `skipped`, `upcoming`, `postponed` |
| `feedback` | list[FeedbackEntry] | Questionnaire answers |
| `video_url` | string \| null | Feedback video if recorded |
| `video_expired` | bool | True after 14-day auto-delete |

---

## 4. `PasswordAttempt` collection

Tracks failed login attempts for rate-limiting.

| Field | Notes |
|---|---|
| `user` | ref User |
| `count` | Failed attempt counter (reset on success) |
| `last_attempt` | Timestamp of most recent failure |

---

## 5. Sentry error tracking

### Backend (`sentry-sdk[django]`)

Configured via `SENTRY_DSN` env var. Captures:
- Unhandled exceptions (automatic)
- 100 % of transactions (traces_sample_rate=1.0)
- 100 % of profiling sessions

### Frontend (`@sentry/react`)

Configured via `VITE_SENTRY_DSN` env var. Captures:
- Unhandled JS exceptions (automatic)
- Browser performance traces
- Explicit soft-error captures in stores:

| Store method | Sentry `extra.context` | Captured when |
|---|---|---|
| `patientVitalsStore.submit` | `patientVitalsStore.submit` | POST to `/patients/vitals/manual/` fails |
| `patientQuestionnairesStore.openInterventionFeedback` | `openInterventionFeedback` | GET questions fails |
| `patientQuestionnairesStore.loadHealthQuestionnaire` | `loadHealthQuestionnaire` | GET health questions fails |
| `patientQuestionnairesStore.checkInitialQuestionnaire` | `checkInitialQuestionnaire` | GET initial questionnaire fails |

All captures include `extra.patientId` (or `extra.userId`) for filtering in the Sentry dashboard.

---

## 6. Celery task outcome logging

Both periodic tasks log a structured outcome line to stdout after every run:

```
[delete_expired_videos] ✅ finished in 0.8s
[fetch_fitbit_data]     ✅ finished in 47.3s
[fetch_fitbit_data]     ❌ failed after 12.1s     ← also logged to Sentry if DSN set
```

The Fitbit intraday fetch additionally logs a per-user summary:

```
[Intraday HR] 28 days with data, 3 empty, 0 error code(s)
[Intraday HR] HTTP 401 (first seen on 2026-03-20): {"errors":[{"errorType":"expired_token"...
```

---

## 7. Django structured logging

Log format: `[YYYY-MM-DDTHH:MM:SS] LEVEL logger: message`

Controlled by `APP_LOG_LEVEL` environment variable (default `INFO`).
Only `core.*` loggers and `django.request` (ERROR only) are configured; all other Django internals are suppressed.

---

## 8. Metrics not yet collected (known gaps)

| Metric | Recommended approach |
|---|---|
| Page load / navigation timing | Add Web Vitals via `@sentry/react` `browserTracingIntegration` |
| Questionnaire completion rate | Aggregate `InterventionLogs.feedback` vs. `status=completed` |
| Fitbit sync success rate per user | Extend `[Intraday HR]` log line with `user_id` |
| Therapist session duration | Use `started`/`ended` fields on `Logs` (already present, not yet written) |
| REDCap import batch size | Already in `details`; add a Celery task for nightly report |
