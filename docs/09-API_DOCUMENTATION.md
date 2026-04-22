# Backend API Documentation

This document reflects the current backend routes in `backend/core/urls.py`.

OpenAPI spec:

- `docs/09-API_OPENAPI.yaml`

## Base URL

- Development: `http://localhost:8001`
- Production: configured via `DJANGO_ALLOWED_HOSTS` / reverse proxy
- All paths include the `/api/` prefix

## Auth and Headers

Most endpoints require a JWT Bearer token:

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

Obtain tokens from `POST /api/auth/login/` (single factor) or `POST /api/auth/verify-code/` (2FA).
Refresh via `POST /api/auth/token/refresh/`.

**HealthSlider download endpoints** use a separate signed token (not JWT):

```
X-Healthslider-Token: <signed_token>
```

Obtain this token via the two-step `POST /api/healthslider/auth/` → `POST /api/healthslider/auth/verify/` flow.

## Notes

- Route matching is order-based (Django `path()` first-match wins).
- `POST /api/analytics/log` and `GET /api/therapists/<therapist_id>/template-plan` have **no trailing slash**.
- `POST /api/interventions/import/excel` has **no trailing slash**.
- Duplicate URL `GET /api/therapists/<therapist_id>/patients/` appears twice in `urls.py`; only the first entry (`list_therapist_patients`) is reachable.
- `GET /api/patients/health-combined-history/<patient_id>/` is also defined twice; the first entry (`patient_views.get_combined_health_data`) wins.
- Some paths keep legacy spelling: `questionaire` (one 'n'), `recomendation` (one 'm').

---

## Endpoint Catalog

### Authentication

#### `POST /api/auth/login/`

No auth required.

**Request body:**

| Field      | Type   | Required | Notes                    |
|------------|--------|----------|--------------------------|
| `email`    | string | yes      | Email or username        |
| `password` | string | yes      |                          |

**Response 200 — single-factor (Patient):**

```json
{
  "user_type": "Patient",
  "id": "<user_id>",
  "access_token": "...",
  "refresh_token": "...",
  "require_2fa": false
}
```

**Response 200 — 2FA required (Therapist / Admin):**

```json
{
  "user_type": "Therapist",
  "id": "<user_id>",
  "require_2fa": true,
  "request_id": "..."
}
```

Follow up with `POST /api/auth/send-verification-code/` then `POST /api/auth/verify-code/`.

**Errors:** 400 missing fields · 401 invalid credentials · 403 account not yet activated · 500

---

#### `POST /api/auth/logout/`

JWT required.

**Request body:**

| Field    | Type   | Required |
|----------|--------|----------|
| `userId` | string | yes      |

**Response 200:** `{ "message": "Logout successful" }`

**Errors:** 400 userId missing · 404 user not found · 500

---

#### `POST /api/auth/forgot-password/`

No auth required.

**Request body:**

| Field   | Type   | Required |
|---------|--------|----------|
| `email` | string | yes      |

**Response 200:** `{ "message": "Password reset successfully, email sent." }`

**Errors:** 400 email missing or invalid JSON · 404 user not found · 500

---

#### `POST /api/auth/register/`

No auth required.

**Register a patient** (`userType: "Patient"`):

| Field                          | Type          | Required | Notes                                                    |
|--------------------------------|---------------|----------|----------------------------------------------------------|
| `userType`                     | string        | yes      | `"Patient"`                                              |
| `email`                        | string        | yes      | Must be unique and valid format                          |
| `password`                     | string        | yes      | 8+ chars, upper, lower, digit, special char              |
| `therapist`                    | string        | yes      | Therapist User ID                                        |
| `clinic`                       | string        | yes      | Must be in therapist's `clinics` list                    |
| `project`                      | string        | yes      | Must be in therapist's `projects` list and valid for clinic |
| `rehaEndDate`                  | string        | yes      | `YYYY-MM-DD`                                             |
| `phone`                        | string        | no       |                                                          |
| `firstName`, `lastName`        | string        | no       |                                                          |
| `age`                          | string        | no       | Birth date `YYYY-MM-DD`                                  |
| `sex`                          | string        | no       |                                                          |
| `patient_code`                 | string        | no       |                                                          |
| `function`                     | array[string] | no       | Specialities                                             |
| `diagnosis`                    | array[string] | no       |                                                          |
| `careGiver`                    | string        | no       |                                                          |
| `restrictions`                 | string        | no       |                                                          |
| `initialQuestionnaireEnabled`  | boolean       | no       | Default `false`                                          |
| `professionalStatus`           | string        | no       |                                                          |
| `levelOfEducation`             | string        | no       |                                                          |
| `civilStatus`                  | string        | no       |                                                          |
| `socialSupport`                | array[string] | no       |                                                          |
| `lifestyle`                    | array[string] | no       |                                                          |
| `lifeGoals`                    | array[string] | no       |                                                          |

**Register a therapist** (`userType: "Therapist"`):

| Field             | Type          | Required | Notes                                        |
|-------------------|---------------|----------|----------------------------------------------|
| `userType`        | string        | yes      | `"Therapist"`                                |
| `email`           | string        | yes      |                                              |
| `password`        | string        | yes      | 8+ chars, upper, lower, digit, special char  |
| `firstName`       | string        | no       |                                              |
| `lastName`        | string        | no       |                                              |
| `phone`           | string        | no       |                                              |
| `clinics`         | array[string] | no       | Valid clinic names from config               |
| `projects`        | array[string] | no       | Valid project names from config              |
| `specialisation`  | array[string] | no       |                                              |

Newly registered therapists have `isActive=False` and must be approved by an Admin via `POST /api/admin/accept-user/`. An email notification is sent to all active Admin users on registration. Mail failures are logged silently and do not affect the response.

**Response 200:**

```json
{ "success": true, "message": "...", "id": "<username>" }
```

**Errors:** 400 validation / field_errors · 404 therapist not found · 500

---

#### `POST /api/auth/send-verification-code/`

No auth required.

**Request body:**

| Field    | Type   | Required |
|----------|--------|----------|
| `userId` | string | yes      |

**Response 200:** `{ "message": "Verification code sent successfully" }`

**Errors:** 400 missing userId · 404 user not found · 500

---

#### `POST /api/auth/verify-code/`

No auth required.

**Request body:**

| Field              | Type   | Required |
|--------------------|--------|----------|
| `userId`           | string | yes      |
| `verificationCode` | string | yes      | 6-digit code |

**Response 200:**

```json
{ "message": "Verification successful", "access_token": "...", "refresh_token": "..." }
```

**Errors:** 400 missing fields / invalid code / expired code · 500

---

#### `POST /api/auth/token/refresh/`

No auth required.

**Request body:**

| Field     | Type   | Required |
|-----------|--------|----------|
| `refresh` | string | yes      | JWT refresh token |

**Response 200:** `{ "access": "<new_access_token>" }`

**Errors:** 401 invalid/expired/blacklisted refresh token

**Important — rotation behaviour:** `ROTATE_REFRESH_TOKENS` and
`BLACKLIST_AFTER_ROTATION` are both enabled. Each successful refresh call:
1. Issues a **new** refresh token (returned in `response.data.refresh` by `simplejwt`)
2. Immediately **blacklists** the old refresh token

The frontend (`client.js`) serialises concurrent refresh calls through a
queue so that only one refresh is in-flight at a time. This prevents the
race condition where two concurrent 401 responses both attempt to exchange the
same refresh token — the second would hit a blacklisted token and fail.

**Session lifetime summary:**

| Token | Lifetime | Stored in |
|---|---|---|
| Access token | 5 minutes | `localStorage.authToken` |
| Refresh token | 24 hours | `localStorage.refreshToken` |
| Client inactivity timeout | 15 minutes | `localStorage.expiresAt` (authStore) |

---

#### `GET /api/auth/get-user-info/<user_id>/`

JWT required.

**Response 200:**

```json
{
  "first_name": "...",
  "last_name": "...",
  "role": "Therapist"
}
```

**Errors:** 404 user not found · 500

---

### Admin / User Management

#### `GET /api/admin/pending-users/`

JWT required.

**Response 200:**

```json
{
  "pending_users": [
    {
      "id": "...",
      "username": "...",
      "email": "...",
      "role": "Therapist",
      "phone": "...",
      "isActive": false,
      "therapistId": "...",
      "name": "...",
      "specializations": [],
      "clinics": [],
      "projects": []
    }
  ]
}
```

**Errors:** 405 · 500

---

#### `POST /api/admin/accept-user/`

JWT required.

**Request body:**

| Field    | Type   | Required |
|----------|--------|----------|
| `userId` | string | yes      |

**Response 200:** `{ "message": "User accepted successfully." }`

**Errors:** 400 missing / invalid userId · 404 user not found · 500

---

#### `POST /api/admin/decline-user/`

JWT required.

**Request body:**

| Field    | Type   | Required |
|----------|--------|----------|
| `userId` | string | yes      |

**Response 200:** `{ "message": "User declined and deleted successfully." }`

**Errors:** 400 missing / invalid userId · 404 user not found · 500

---

#### `GET /api/therapist/access-change-request/`

JWT required. Returns whether the authenticated therapist has a pending clinic/project change request.

**Response 200:**

```json
{ "ok": true, "hasPending": false }
```

**Errors:** 404 therapist profile not found

---

#### `POST /api/therapist/access-change-request/`

JWT required. Submits a new clinic/project access change request for admin approval. Any existing pending request is automatically superseded (status set to `rejected`). All active Admin users are notified by e-mail.

**Request body:**

| Field      | Type          | Required | Notes                             |
|------------|---------------|----------|-----------------------------------|
| `clinics`  | array[string] | yes      | Must be valid values from config  |
| `projects` | array[string] | yes      | Must be valid values from config  |

**Response 201:**

```json
{
  "ok": true,
  "message": "Your request has been submitted and is awaiting admin approval.",
  "requestId": "<ObjectId>"
}
```

**Errors:** 400 invalid clinic or project · 404 therapist not found

---

#### `GET /api/admin/access-change-requests/`

JWT required. Lists `TherapistAccessChangeRequest` documents.

**Query params:**

| Param    | Default   | Notes                          |
|----------|-----------|--------------------------------|
| `status` | `pending` | Pass `all` to include all statuses |

**Response 200:**

```json
{
  "ok": true,
  "requests": [
    {
      "id": "...",
      "therapistId": "...",
      "therapistName": "Jane Doe",
      "therapistEmail": "jane@example.com",
      "currentClinics": ["Inselspital"],
      "currentProjects": ["COPAIN"],
      "requestedClinics": ["Berner Reha Centrum"],
      "requestedProjects": ["COPAIN"],
      "status": "pending",
      "createdAt": "2024-01-15T10:00:00+00:00",
      "reviewedAt": null,
      "reviewedBy": "",
      "note": ""
    }
  ]
}
```

---

#### `PUT /api/admin/access-change-requests/<id>/`

JWT required. Approve or reject a pending access change request.

**Request body:**

| Field    | Type   | Required | Notes                                  |
|----------|--------|----------|----------------------------------------|
| `action` | string | yes      | `"approve"` or `"reject"`              |
| `note`   | string | no       | Shown to therapist in rejection e-mail |

**On approve:** Updates `Therapist.clinics` and `Therapist.projects` with the requested values (filtered against current config). E-mails the therapist.

**On reject:** Marks request as rejected, e-mails therapist with optional note. Therapist access is unchanged.

**Response 200:**

```json
{ "ok": true, "message": "Request approved and therapist access updated." }
```

**Errors:** 400 request already reviewed · 400 invalid action · 404 request not found · 500

---

#### `GET /api/admin/therapist/access/`
#### `GET /api/admin/therapist/access/<therapistId>/`

JWT required.

**Query params (GET without path param):** `therapistId` (required)

**Response 200:**

```json
{
  "ok": true,
  "therapistId": "...",
  "clinics": ["Inselspital"],
  "projects": ["COPAIN"],
  "availableClinics": ["Berner Reha Centrum", "Inselspital", "..."],
  "availableProjects": ["COPAIN", "COMPASS", "..."],
  "clinicProjects": { "Inselspital": ["COPAIN"], "Leuven": ["COMPASS"] }
}
```

**Errors:** 400 therapistId missing · 404 therapist not found

---

#### `PUT /api/admin/therapist/access/`
#### `PUT /api/admin/therapist/access/<therapistId>/`

JWT required.

**Request body:**

| Field         | Type          | Required |
|---------------|---------------|----------|
| `therapistId` | string        | yes (if not in path) |
| `clinics`     | array[string] | yes      |
| `projects`    | array[string] | yes      |

**Response 200:**

```json
{ "ok": true, "message": "Therapist access updated", "clinics": [...], "projects": [...] }
```

**Errors:** 400 missing fields / invalid clinic or project value · 404 therapist not found · 500

---

### User Profile

#### `GET /api/users/<user_id>/profile/`

JWT required. Accepts either a User ID or a Patient ID.

**Response 200 — Therapist:**

```json
{
  "username": "...",
  "email": "...",
  "phone": "...",
  "name": "...",
  "first_name": "...",
  "specializations": [],
  "clinics": [],
  "projects": []
}
```

**Response 200 — Patient** (includes both User and Patient fields):

```json
{
  "username": "...",
  "email": "...",
  "phone": "...",
  "role": "Patient",
  "createdAt": "2025-01-01T00:00:00Z",
  "isActive": true,
  "last_online": "2025-03-01T10:00:00Z",
  "first_name": "...",
  "name": "...",
  "gender": "...",
  "birthdate": "1980-01-01",
  "height": 175.0,
  "weight": 70.0,
  "function": [],
  "diagnosis": [],
  "clinic": "Inselspital",
  "project": "COPAIN",
  "reha_end_date": "2026-06-01",
  "last_clinic_visit": "2026-02-01",
  "level_of_education": "...",
  "professional_status": "...",
  "marital_status": "...",
  "restrictions": "...",
  "lifestyle": [],
  "personal_goals": [],
  "social_support": [],
  "initial_questionnaire_enabled": false,
  "created_by": "Jane Doe"
}
```

**Errors:** 404 not found · 500

---

#### `PUT /api/users/<user_id>/profile/`

JWT required.

**To change password**, include:

| Field          | Type   | Required |
|----------------|--------|----------|
| `oldPassword`  | string | yes      |
| `newPassword`  | string | yes      | 8+ chars, upper, lower, digit, special |

**To update profile fields**, include any subset of the allowed fields listed in the GET response above. Date fields must be `YYYY-MM-DD`. Arrays replace the entire field.

**Response 200:**

```json
{ "message": "Profile updated", "updated": { "<field>": "<new_value>" } }
```

**Errors:** 400 invalid field values / date format / email format / phone format · 403 wrong old password · 404 not found · 500

---

#### `DELETE /api/users/<user_id>/profile/`

JWT required.

**Response 200:** `{ "message": "User deleted" }`

**Errors:** 404 not found · 500

---

#### `PUT /api/users/<therapist_id>/change-password/`

JWT required.

**Request body:**

| Field          | Type   | Required |
|----------------|--------|----------|
| `old_password` | string | yes      |
| `new_password` | string | yes      | 8+ chars, upper, lower, digit, special |

**Response 200:** `{ "message": "Password changed successfully" }`

**Errors:** 400 missing fields / weak password · 403 wrong old password · 404 not found · 405 · 429 too many failed attempts (includes `minutes_remaining`)

---

#### `PUT /api/patients/<patient_id>/reset-password/`

JWT required (Therapist only). Allows resetting a patient's password without knowing the current password.

**Request body:**

| Field          | Type   | Required |
|----------------|--------|----------|
| `new_password` | string | yes (also accepts `newPassword`) | 8+ chars, upper, lower, digit, special |

**Response 200:** `{ "message": "Password reset successfully" }`

**Errors:** 400 missing field / invalid JSON / weak password · 404 patient not found · 405

---

### Therapist

#### `GET /api/therapists/<therapist_id>/patients/`

JWT required. Returns patients the therapist is allowed to see, filtered by both clinic and project.

**Access control:**
- Always filters `patient.clinic` to `therapist.clinics`.
- When the therapist has one or more `projects` assigned, also filters `patient.project` to `therapist.projects`. A therapist at Inselspital assigned only to COPAIN will not see COMPASS patients at Inselspital.
- Therapists with `projects=[]` (legacy accounts created before project-based access was introduced) fall back to clinic-only filtering.
- Inactive patient accounts (`User.isActive=false`) are excluded.

**Response 200:** Array of patient summary objects:

```json
[
  {
    "_id": "<patient_id>",
    "username": "...",
    "patient_code": "...",
    "first_name": "...",
    "name": "...",
    "sex": "...",
    "age": "1980-01-01",
    "diagnosis": [],
    "created_at": "2025-01-01T00:00:00Z",
    "last_online": "2025-03-01T10:00:00Z",
    "last_feedback_at": "2025-02-28T10:00:00Z",
    "questionnaires": [],
    "intervention_feedback": {
      "last_answered_at": "2025-03-01T08:00:00Z",
      "days_since_last": 1,
      "answered_days_total": 4,
      "recent_days_count": 3,
      "recent_avg_score": 3.67,
      "previous_avg_score": 4.1,
      "trend_delta": -0.43,
      "trend_lower": true
    },
    "feedback_low": false,
    "biomarker": {
      "sleep_avg_h": 7.2,
      "activity_min": 45,
      "steps_avg": 6200
    },
    "adherence_rate": 80,
    "adherence_total": 10
  }
]
```

**Feedback summary fields:**
- `intervention_feedback` is computed from `PatientInterventionLogs.feedback` numeric answer keys (`>0`) grouped by answered day.
- `recent_avg_score` uses the most recent answered days (currently window size `3`).
- `trend_delta = recent_avg_score - previous_avg_score`; `trend_lower` is `true` when this delta is negative.
- `feedback_low` remains available as a questionnaire-derived compatibility flag (`questionnaires[].low_score`), but therapist traffic-light UI logic now prioritizes `intervention_feedback`.

**Errors:** 400 invalid therapist ID · 404 therapist not found · 500

---

#### `POST /api/analytics/log`

JWT required. No trailing slash.

**Request body:**

| Field       | Type   | Required |
|-------------|--------|----------|
| `user`      | string | yes      | User ID |
| `action`    | string | no       |
| `started`   | string | no       | ISO datetime |
| `ended`     | string | no       | ISO datetime |
| `userAgent` | string | no       |
| `patient`   | string | no       | Patient ID |
| `details`   | string | no       |

**Response 201:** `{ "status": "ok", "log_id": "..." }`

**Errors:** 500

---

### Rehabilitation Plan

#### `GET /api/patients/rehabilitation-plan/patient/<patient_id>/`

JWT required. Accepts either a User ID or a Patient ID as `patient_id`.

**Response 200:**

```json
{
  "success": true,
  "plan": {
    "id": "...",
    "startDate": "2025-01-01T00:00:00Z",
    "endDate": "2026-01-01T00:00:00Z",
    "interventions": [
      {
        "interventionId": "...",
        "title": "...",
        "sessions": [
          { "date": "2025-01-05T00:00:00Z", "completed": false }
        ]
      }
    ]
  }
}
```

**Errors:** 404 patient not found / no plan found · 500

---

#### `GET /api/patients/rehabilitation-plan/therapist/<patient_id>/`

JWT required. Returns the plan in therapist-oriented format (includes additional metadata).

Same path parameter semantics and error codes as the patient variant.

---

#### `POST /api/interventions/add-to-patient/`

JWT required.

**Request body:**

| Field           | Type          | Required |
|-----------------|---------------|----------|
| `patientId`     | string        | yes      | Patient or User ID |
| `interventions` | array[object] | yes      | Each: `{ "id": "...", "schedule": { ... } }` |
| `therapistId`   | string        | yes      |
| `startDate`     | string        | no       | `YYYY-MM-DD`, defaults to today |

Schedule object fields:

| Field          | Type          | Notes                                          |
|----------------|---------------|------------------------------------------------|
| `unit`         | string        | `"day"`, `"week"`, `"month"`                   |
| `interval`     | integer       | Every N units                                  |
| `selectedDays` | array[string] | For weekly: `["Mon","Wed"]`                    |
| `time`         | string        | `"HH:MM"` optional                             |

If `patient.reha_end_date` is in the past, the plan end is automatically extended to 90 days from today.

**Response 200:**

```json
{ "success": true, "message": "Sessions added successfully", "plan_id": "..." }
```

**Errors:** 400 no sessions generated · 404 patient/therapist not found · 500

---

#### `POST /api/interventions/modify-patient/`

JWT required.

**Request body:**

| Field            | Type   | Required |
|------------------|--------|----------|
| `patientId`      | string | yes      |
| `interventionId` | string | yes      |
| `fromDate`       | string | yes      | `YYYY-MM-DD` — only sessions on/after this date are modified |
| `schedule`       | object | yes      | Same structure as add-to-patient |

**Response 200:** `{ "success": true, "message": "..." }`

**Errors:** 404 · 500

---

#### `POST /api/interventions/remove-from-patient/`

JWT required.

**Request body:**

| Field            | Type   | Required |
|------------------|--------|----------|
| `patientId`      | string | yes      |
| `interventionId` | string | yes      |

**Response 200:** `{ "success": true, "message": "Intervention removed from patient plan." }`

**Errors:** 404 · 500

---

#### `POST /api/interventions/complete/`

JWT required.

**Request body:**

| Field            | Type   | Required |
|------------------|--------|----------|
| `patientId`      | string | yes      |
| `interventionId` | string | yes      |
| `date`           | string | yes      | `YYYY-MM-DD` |

**Response 200:** `{ "success": true }`

**Errors:** 404 · 500

---

#### `POST /api/interventions/uncomplete/`

JWT required. Same body as complete.

**Response 200:** `{ "success": true }`

---

### Questionnaires

#### `GET /api/questionnaires/health/`

JWT required.

**Response 200:** Array of health questionnaire objects with `id`, `key`, `title`, `questions`.

---

#### `GET /api/questionnaires/patient/<patient_id>/`

JWT required.

**Response 200:** Array of questionnaires currently assigned to the patient, each including assignment metadata and schedule.

**Errors:** 404 patient not found · 500

---

#### `POST /api/questionnaires/assign/`

JWT required.

**Request body:**

| Field             | Type   | Required |
|-------------------|--------|----------|
| `patientId`       | string | yes      |
| `questionnaireId` | string | yes      |
| `schedule`        | object | yes      | `{ unit, interval, selectedDays, startDate, endDate }` |

**Response 200:** `{ "success": true, "message": "..." }`

**Errors:** 400 validation · 404 · 500

---

#### `POST /api/questionnaires/remove/`

JWT required.

**Request body:**

| Field             | Type   | Required |
|-------------------|--------|----------|
| `patientId`       | string | yes      |
| `questionnaireId` | string | yes      |

**Response 200:** `{ "success": true }`

**Errors:** 404 · 500

---

#### `GET /api/questionnaires/dynamic/`

JWT required.

**Response 200:** Array of dynamic questionnaire objects.

---

### Patient Feedback

#### `POST /api/patients/feedback/questionaire/`

JWT required. Note: legacy spelling (`questionaire`).

**Request body** (`multipart/form-data` or JSON):

| Field           | Type          | Required |
|-----------------|---------------|----------|
| `patientId`     | string        | yes      |
| `questionnaires`| array[object] | yes      | Each: `{ questionnaireId, feedbackEntries: [{ questionId, answerKey, answerText }] }` |
| `date`          | string        | no       | `YYYY-MM-DD`, defaults to today |
| `videoFile`     | file          | no       |
| `audioFile`     | file          | no       |

**Response 201:**

```json
{ "message": "Feedback submitted successfully", "feedbackId": "...", "date": "..." }
```

**Errors:** 400 · 405 · 500

---

#### `GET /api/patients/get-questions/<questionaire_type>/<patient_id>/`
#### `GET /api/patients/get-questions/<questionaire_type>/<patient_id>/<intervention_id>/`

JWT required.

**Query parameters:**

| Parameter        | Type   | Required | Notes |
|------------------|--------|----------|-------|
| `interventionId` | string | no       | ObjectId of the intervention being rated. Must be provided for the star-rating question to be included. |

**Path parameter `questionaire_type`:** `"Intervention"` or `"Healthstatus"`.

**Response 200** (`{ "questions": [...] }`):

Each question object:

```json
{
  "questionKey": "rating_stars_education",
  "answerType": "select",
  "translations": [
    { "language": "en", "text": "How did you like the content?" },
    { "language": "de", "text": "Wie fandest du den Inhalt?" }
  ],
  "possibleAnswers": [
    { "key": "1", "translations": [{ "language": "en", "text": "★☆☆☆☆ (1/5)" }] },
    { "key": "2", "translations": [{ "language": "en", "text": "★★☆☆☆ (2/5)" }] },
    { "key": "3", "translations": [{ "language": "en", "text": "★★★☆☆ (3/5)" }] },
    { "key": "4", "translations": [{ "language": "en", "text": "★★★★☆ (4/5)" }] },
    { "key": "5", "translations": [{ "language": "en", "text": "★★★★★ (5/5)" }] }
  ]
}
```

**Intervention feedback question order (Frage 1 → 2 → Open):**

| Position | `questionKey` | `answerType` | Condition |
|----------|--------------|--------------|-----------|
| 1 | `rating_stars_education` | `select` | `content_type` ∈ `Education`, `Instruction`, `Text`, `PDF`, `Video`, `Audio`, `Website`, `Apps` |
| 1 | `rating_stars_exercise` | `select` | `content_type` ∈ `Exercise`, `Exercises`, `Physiotherapy`, `Training`, `Movement` |
| 2 | `difficulty_scale` | `select` | always included |
| 3 | `open_feedback` | `text` | always included |

The star-rating question is resolved from the intervention's `content_type`. The lookup first checks the patient's rehabilitation plan assignment; if the intervention is not assigned (library-browse path), the `Intervention` document is looked up directly. When no `interventionId` is supplied, only the `difficulty_scale` and `open_feedback` questions are returned.

The seed command `python manage.py seed_feedback_questions` must be run at least once to populate the `FeedbackQuestions` collection.

**Errors:** 400 invalid patient id · 400 invalid type · 404 patient not found · 405

---

#### `GET /api/users/<patient_id>/initial-questionaire/`

JWT required.

**Response 200:**

```json
{ "requires_questionnaire": true }
```

Returns `false` immediately when `Patient.initial_questionnaire_enabled` is `False` (default). Returns `true` only when enabled **and** any of the five demographic fields are still empty.

---

#### `POST /api/users/<patient_id>/initial-questionaire/`

JWT required.

**Request body:**

| Field                 | Type          | Required |
|-----------------------|---------------|----------|
| `level_of_education`  | string        | no       |
| `professional_status` | string        | no       |
| `marital_status`      | string        | no       |
| `lifestyle`           | array[string] | no       |
| `personal_goals`      | array[string] | no       |

**Response 200:** `{ "success": true }`

---

### Interventions / Recommendations

#### `GET /api/interventions/all/`
#### `GET /api/interventions/all/<patient_id>/`

JWT required. When `patient_id` is provided, filters interventions relevant to the patient's specialities/diagnosis.

**Query parameters:**

| Parameter     | Type   | Required | Notes |
|---------------|--------|----------|-------|
| `lang`        | string | no       | ISO language code (e.g. `de`). Selects the best language variant of each public intervention. |
| `external_id` | string | no       | Returns only the single intervention group matching this external id. |

**Response 200:** Array of intervention summary objects.

```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "external_id": "EXT-001",
    "language": "de",
    "available_languages": ["de", "en"],
    "title": "Kniebeugen",
    "description": "...",
    "content_type": "Exercise",
    "aims": ["exercise"],
    "tags": ["strength", "lower body"],
    "duration": 15,
    "preview_img": "https://...",
    "media": [],
    "is_private": false,
    "avg_rating": 4.3,
    "rating_count": 12
  }
]
```

**`avg_rating` / `rating_count`** — aggregated from all `PatientInterventionLogs` feedback entries whose question key starts with `rating_stars_`. `avg_rating` is rounded to one decimal place and is `null` when no ratings have been submitted. `rating_count` is the total number of individual star ratings across all patients.

---

#### `POST /api/interventions/add/`

JWT required. **`multipart/form-data`** (not JSON) — required when uploading files.

**Form fields:**

| Field          | Type          | Required | Notes |
|----------------|---------------|----------|-------|
| `title`        | string        | yes      | |
| `description`  | string        | yes      | |
| `contentType`  | string        | yes      | `"Video"`, `"Audio"`, `"Text"`, `"Image"`, `"PDF"`, `"Website"`, `"App"`, `"Streaming"` |
| `duration`     | integer       | yes      | Minutes; must be > 0 |
| `language`     | string        | no       | ISO code, default `"en"` |
| `media`        | JSON string   | no       | Array of `{ contentType, language, url, text }` — preferred over `media_file` |
| `img_file`     | file          | no       | Preview image (max 1 GB) |
| `media_file`   | file          | no       | Legacy single-file upload (max 1 GB) |
| `taxonomy`     | JSON string   | no       | Taxonomy metadata object (see below) |
| `patientTypes` | JSON string   | no       | Array of `{ type, diagnosis, frequency, includeOption }` for public interventions |
| `isPrivate`    | boolean       | no       | `"true"` to restrict to one patient |
| `patientId`    | string        | no       | Required when `isPrivate=true` |
| `external_id`  | string        | no       | Deduplicated per `(external_id, language)` |
| `provider`     | string        | no       | Source/provider name |

**`taxonomy` JSON object fields:**

| Key | Type | Notes |
|-----|------|-------|
| `input_from` | string | Input source |
| `lc9` | array[string] | LC9 classification codes |
| `original_language` | string | |
| `primary_diagnosis` | array[string] | |
| `aim` / `aims` | string | Therapeutic aim |
| `topic` / `topics` | array[string] | |
| `cognitive_level` | string | |
| `physical_level` | string | |
| `frequency_time` | string | |
| `timing` | string | |
| `duration_bucket` | string | |
| `sex_specific` | string | |
| `where` | array[string] | Setting location |
| `setting` | array[string] | Environment type |
| `keywords` | array[string] | |

**File upload limits:** max **1 GB** per file. Files above 5 MB are streamed to disk; no in-memory buffering.

**Response 201:** `{ "success": true, "id": "..." }`

**Errors:** 400 validation (field_errors map) · 400 duplicate external_id · 500

---

#### `GET /api/interventions/<intervention_id>/`

JWT required.

**Response 200:**

```json
{
  "id": "...",
  "key": "...",
  "title": "...",
  "contentType": "Video",
  "description": "...",
  "media": [
    { "contentType": "Video", "language": "en", "url": "https://..." }
  ]
}
```

**Errors:** 404 · 500

---

#### `GET /api/interventions/<intervention>/assigned-diagnoses/<specialisation>/therapist/<therapist_id>/`

JWT required.

**Response 200:** Array of diagnoses this intervention is assigned to for the given specialisation/therapist context.

---

#### `POST /api/therapists/<therapist_id>/interventions/assign-to-patient-types/`

JWT required.

**Request body:**

| Field             | Type          | Required |
|-------------------|---------------|----------|
| `interventionId`  | string        | yes      |
| `function`        | array[string] | yes      | Specialities to assign to |
| `diagnosis`       | array[string] | no       |

**Response 200:** `{ "success": true }`

---

#### `POST /api/therapists/<therapist_id>/interventions/remove-from-patient-types/`

JWT required. Same body as assign. Removes the intervention from the listed specialities/diagnoses.

**Response 200:** `{ "success": true }`

---

#### `GET /api/therapists/<therapist_id>/template-plan`

JWT required. No trailing slash.

**Response 200:** Template plan preview for this therapist (intervention recommendations grouped by speciality).

---

#### `POST /api/therapists/<therapist_id>/templates/apply`

JWT required. No trailing slash.

**Request body:**

| Field       | Type   | Required |
|-------------|--------|----------|
| `patientId` | string | yes      |

**Response 200:** `{ "success": true, "applied": <count> }`

**Errors:** 404 · 500

---

#### `POST /api/recomendation/add/patientgroup/`

JWT required. Note: legacy spelling (`recomendation`).

**Request body:**

| Field        | Type          | Required |
|--------------|---------------|----------|
| `name`       | string        | yes      |
| `patientIds` | array[string] | yes      |
| `therapistId`| string        | yes      |

**Response 201:** `{ "success": true, "groupId": "..." }`

---

#### `POST /api/interventions/import/excel`

JWT required. No trailing slash.

Imports interventions from an Excel workbook. Rows are upserted by `(external_id, language)` so the endpoint is safe to call repeatedly — existing interventions are updated, new ones are created.

**Request:** `multipart/form-data`

| Field         | Type    | Required | Notes                                                                 |
|---------------|---------|----------|-----------------------------------------------------------------------|
| `file`        | file    | yes      | `.xlsx` or `.xlsm`. Files with a `.csv` extension are also accepted if their content is a valid xlsx binary (magic-byte detection). |
| `sheet_name`  | string  | no       | Sheet to read. Default `"Content"`. Fuzzy-matched: `"Content (2)"` matches `"Content"`. **Must be set explicitly when the workbook uses a non-default sheet name** (e.g. `MKS_Upload_links`). |
| `dry_run`     | string  | no       | `"true"` to validate and parse without writing to the DB.            |
| `limit`       | integer | no       | Stop after processing this many rows (useful for testing).           |
| `default_lang`| string  | no       | ISO language code applied when the ID and column both omit a language. Default `"en"`. |

**ID format**

Each row requires an `intervention_id` column whose value encodes the external ID, format code, and language:

```
{4-5 digits}_{format}_{lang}        e.g.  3500_web_de   (original content)
                                          30500_vid_pt   (self-made content)
```

Valid format codes: `vid`, `img`, `pdf`, `web`, `aud`, `app`, `br`, `gfx`  
Valid languages: `de`, `fr`, `it`, `pt`, `nl`, `en`

**Column mapping**

Required columns (headers are matched case-insensitively and tolerate suffixes like `(multi-choice)`):

| Column | Matched by |
|---|---|
| `intervention_id` | `intervention_id`, `id` |
| `title` | `title`, `titel`, `name` |
| `description` | `description`, `beschreibung`, `desc` |
| `content_type` | `content type`, `format`, `type`, `medientyp` |

Optional columns: `provider`, `link` / `url`, `language`, `aim`, `topic`, `where`, `setting`, `keywords`, `duration`, `cognitive_level`, `physical_level`, `sex_specific`, `primary_diagnosis`, `input_from`, `duration_bucket`.

**Canonical content-type values stored in DB**

| Excel value | Stored as |
|---|---|
| `brochure`, `pdf`, `text`, `br` | `Brochure` |
| `graphics`, `image`, `img`, `gfx` | `Graphics` |
| `video`, `vid` | `Video` |
| `audio`, `aud`, `podcast` | `Audio` |
| `website`, `web` | `Website` |
| `app` | `App` |

**Response 200:**

```json
{
  "success": true,
  "created": 37,
  "updated": 0,
  "skipped": 695,
  "warnings": 2,
  "errors_count": 0,
  "errors": [
    {
      "row": 5,
      "intervention_id": "5210_web_de",
      "severity": "warning",
      "error": "topic: \"ageing\" is not a valid topic. Allowed: ..."
    }
  ]
}
```

`errors` contains both hard errors (`severity: "error"`, row skipped) and soft warnings (`severity: "warning"`, row still imported with valid fields only). `errors_count` counts hard errors; `warnings` counts soft warnings.

**Errors:** 400 missing file / invalid file type · 413 file too large (> 50 MB) · 405 wrong method · 500 sheet not found or parse failure (response body includes `details` with the exception message, e.g. `"Sheet 'Content' not found. Sheets: ['MKS_Upload_links']"`)

---

### Patient Health Data

#### `GET /api/patients/healthstatus-history/<patient_id>/`

JWT required.

**Response 200:** Array of health status entries with timestamps and scores.

---

#### `GET /api/patients/health-combined-history/<patient_id>/`

JWT required.

**Response 200:** Combined time-series of health data (vitals, steps, sleep, feedback scores).

---

#### `POST /api/patients/vitals/manual/<patient_id>/`

JWT required.

**Request body:**

| Field           | Type   | Required |
|-----------------|--------|----------|
| `heartRate`     | number | no       |
| `bloodPressure` | string | no       | e.g. `"120/80"` |
| `temperature`   | number | no       |
| `notes`         | string | no       |
| `date`          | string | no       | `YYYY-MM-DD`, defaults to today |

**Response 201:** `{ "success": true }`

**Errors:** 400 · 404 patient not found · 500

---

#### `GET /api/patients/vitals/exists/<patient_id>/`

JWT required.

**Query params:** `date` (`YYYY-MM-DD`, optional, defaults to today)

**Response 200:** `{ "exists": true }` or `{ "exists": false }`

---

#### `GET|POST|PATCH /api/patients/<patient_id>/thresholds/`

JWT required.

**GET response 200:**

```json
{
  "success": true,
  "thresholds": {
    "heart_rate_min": 50,
    "heart_rate_max": 120,
    "blood_pressure_systolic_min": 90,
    "blood_pressure_systolic_max": 160,
    "sleep_hours_min": 6.0,
    "steps_min": 3000
  },
  "history": [
    {
      "effective_from": "2025-01-01T00:00:00Z",
      "changed_by": "therapist_username",
      "reason": "Post-surgery",
      "thresholds": { ... }
    }
  ]
}
```

**PATCH request body:**

| Field            | Type   | Required |
|------------------|--------|----------|
| `thresholds`     | object | yes      | Any subset of threshold fields |
| `effective_from` | string | no       | ISO datetime |
| `reason`         | string | no       |

**PATCH response 200:** `{ "success": true, "message": "Thresholds updated", "thresholds": { ... } }`

**Errors:** 400 invalid JSON / validation · 403 access denied · 404 patient not found · 500

---

### Fitbit

#### `GET /api/fitbit/callback/`

No auth required. OAuth 2.0 redirect endpoint.

**Query params:** `code` (Fitbit auth code), `state` (patient ID)

Stores the Fitbit token and redirects to the app.

---

#### `GET /api/fitbit/status/<patient_id>/`

JWT required.

**Response 200:** `{ "connected": true, "last_sync": "2025-03-01T08:00:00Z" }`

**Errors:** 404 patient not found · 500

---

#### `GET /api/fitbit/health-data/<patient_id>/`

JWT required.

**Response 200:** Raw Fitbit health data for the patient.

---

#### `GET /api/fitbit/summary/`
#### `GET /api/fitbit/summary/<patient_id>/`

JWT required. Without `patient_id`, returns data for the authenticated user.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "steps_count": 45000,
    "steps_avg": 6428.6,
    "activity_minutes": 315,
    "activity_min_avg": 45.0,
    "sleep_hours": 50.4,
    "sleep_avg": 7.2,
    "last_updated": "2025-03-01T08:00:00Z"
  }
}
```

**Errors:** 404 patient not found · 500

---

#### `POST /api/fitbit/manual_steps/<patient_id>/`

JWT required.

**Request body:**

| Field   | Type    | Required |
|---------|---------|----------|
| `steps` | integer | yes      |
| `date`  | string  | no       | `YYYY-MM-DD`, defaults to today |

**Response 200:** `{ "success": true }`

**Errors:** 400 · 404 · 500

---

### Healthslider (EVA / ICF)

The HealthSlider download endpoints (`items`, `audio`) are protected by a separate short-lived signed token, not the main JWT. Obtain it via the two-step auth flow below. `submit-item` is open (patients submit without auth).

---

#### `POST /api/healthslider/auth/`

No auth required. Step 1 of 2FA download gate.

**Request body:**

| Field      | Type   | Required |
|------------|--------|----------|
| `password` | string | yes      | Shared download password (env var `HEALTHSLIDER_DOWNLOAD_PASSWORD`) |
| `email`    | string | yes      | Address to receive the 6-digit code |

**Response 200:** `{ "ok": true }`

**Errors:** 400 email missing · 401 invalid password · 500

---

#### `POST /api/healthslider/auth/verify/`

No auth required. Step 2 of 2FA download gate.

**Request body:**

| Field  | Type   | Required |
|--------|--------|----------|
| `code` | string | yes      | 6-digit code sent to email |

**Response 200:** `{ "token": "<signed_download_token>" }`

Token is valid for 8 hours. Pass as `X-Healthslider-Token` header on subsequent requests.

**Errors:** 400 missing code / invalid code / code expired · 500

---

#### `GET /api/healthslider/items/`

Auth: `X-Healthslider-Token` header.

**Query params:**

| Param           | Type   | Required |
|-----------------|--------|----------|
| `participantId` | string | no       | Filter by participant/patient code |
| `from`          | string | no       | `YYYY-MM-DD` start date filter |
| `to`            | string | no       | `YYYY-MM-DD` end date filter |

**Response 200:**

```json
[
  {
    "id": "...",
    "patientCode": "P001",
    "date": "2025-03-01T10:00:00Z",
    "rating": 7,
    "notes": "...",
    "audioUrl": "/api/healthslider/audio/<item_id>/"
  }
]
```

**Errors:** 401 missing / invalid token · 500

---

#### `GET /api/healthslider/audio/<item_id>/`

Auth: `X-Healthslider-Token` header.

**Response 200:** Audio file stream (`audio/mpeg` or similar).

**Errors:** 401 · 404 audio not found · 500

---

#### `POST /api/healthslider/submit-item/`

No auth required.

**Request body** (`multipart/form-data`):

| Field          | Type    | Required |
|----------------|---------|----------|
| `patientToken` | string  | yes      | Patient session token |
| `rating`       | integer | yes      | 0–10 |
| `notes`        | string  | no       |
| `audioFile`    | file    | no       |

**Response 201:** `{ "message": "Item submitted", "itemId": "..." }`

**Errors:** 400 invalid token / missing rating · 401 · 500

---

#### `DELETE /api/healthslider/delete-session/`

Auth: `X-Healthslider-Token` header. Downloads a ZIP of the session data then deletes the session records.

**Request body:**

| Field         | Type   | Required |
|---------------|--------|----------|
| `patientCode` | string | yes      |

**Response 200:** ZIP file (`application/zip`) containing session audio and metadata.

**Errors:** 400 missing patientCode · 401 · 404 no data · 500

---

### REDCap

#### `GET /api/redcap/projects/`

JWT required.

**Response 200:**

```json
{
  "ok": true,
  "clinics": ["Leuven"],
  "therapistProject": "COMPASS",
  "allowedProjects": ["COMPASS"]
}
```

**Errors:** 404 therapist profile not found · 500

---

#### `GET /api/redcap/record/`

JWT required.

**Query params:**

| Param     | Type   | Required |
|-----------|--------|----------|
| `pat_id`  | string | yes      |
| `project` | string | yes      |

**Response 200:**

```json
{
  "ok": true,
  "project": "COMPASS",
  "pat_id": "P001",
  "count": 3,
  "rows": [ { ... } ]
}
```

**Errors:** 400 missing params · 403 not allowed for project · 404 therapist not found · 502 REDCap API error · 500

---

#### `GET /api/redcap/available-patients/`

JWT required.

Returns REDCap records not yet imported into the platform, filtered to the therapist's allowed clinics, projects, and DAGs.

**Query params:**

| Param             | Type   | Required | Notes |
|-------------------|--------|----------|-------|
| `therapistUserId` | string | no       | Mongo User `_id`. Derived from JWT if omitted. |
| `project`         | string | no       | Restrict to one project (must be in therapist's allowed projects). |
| `patientId`       | string | no       | Filter by `pat_id` value. |
| `recordId`        | string | no       | Filter by REDCap `record_id`. |

**Access control:** The endpoint resolves the therapist's `clinics` and `projects`, maps each clinic to its REDCap DAG via `clinic_dag` in `config.json`, and filters out any record whose `redcap_data_access_group` is not in the allowed DAG set. A therapist at Inselspital/COPAIN will not see COMPASS records, and vice versa.

**Field fallback:** Some projects (e.g. COMPASS) do not have a `pat_id` field. The export automatically retries without fields the project does not recognise and falls back to `record_id` as the identifier.

**Response 200:**

```json
{
  "ok": true,
  "projects": ["COPAIN", "COMPASS"],
  "candidates": [
    {
      "project": "COMPASS",
      "record_id": "905-2",
      "pat_id": "",
      "identifier": "905-2",
      "dag": "bern"
    }
  ],
  "errors": [
    {
      "project": "COPAIN",
      "error": "REDCap API returned non-200.",
      "detail": { "status": 400, "text": "..." }
    }
  ]
}
```

`errors` is omitted when all projects succeed. Partial success (some projects fail, some return candidates) returns HTTP 200 with both `candidates` and `errors` populated.

**Errors:** 403 project not in therapist's allowed list · 404 therapist not found · 405 wrong method

---

#### `GET /api/redcap/patient/`

JWT required.

**Query params:**

| Param             | Type   | Required |
|-------------------|--------|----------|
| `patient_code`    | string | yes      |
| `project`         | string | no       | Search all projects if omitted |
| `therapistUserId` | string | no       |

**Response 200:**

```json
{
  "ok": true,
  "patient_code": "P001",
  "searchedProjects": ["COMPASS"],
  "matches": [
    { "project": "COMPASS", "count": 1, "rows": [ { ... } ] }
  ],
  "errors": []
}
```

**Errors:** 400 patient_code missing · 403 no projects configured / not allowed · 404 therapist not found / no record found · 502 · 500

---

#### `POST /api/redcap/import-patient/`

JWT required.

Creates a platform `User` + `Patient` from a single REDCap record.

**Request body:**

| Field             | Type   | Required | Notes |
|-------------------|--------|----------|-------|
| `patient_code`    | string | yes      | REDCap `pat_id` or `record_id` — used as the platform patient code. |
| `project`         | string | yes      | REDCap project name (`COPAIN` / `COMPASS`). Must be in the therapist's allowed projects. |
| `password`        | string | yes      | Temporary password for the new patient account (min 8 chars, upper + lower + digit + special). |
| `therapistUserId` | string | no       | Mongo User `_id`. Derived from JWT if omitted. |

**Access control:** Before creating the patient the endpoint:
1. Verifies the project is in the therapist's allowed projects.
2. Fetches the REDCap record and checks its `redcap_data_access_group` against the therapist's allowed DAGs (derived from `clinic_dag` in `config.json`). Returns 403 if the DAG is not allowed.

**Patient fields set on import:**

| Patient field   | Value |
|-----------------|-------|
| `patient_code`  | `pat_id` if present, else `record_id` |
| `project`       | REDCap project name (e.g. `COMPASS`) |
| `clinic`        | Clinic name resolved from the patient's DAG via reverse `clinic_dag` lookup; falls back to the therapist's first clinic if the DAG is not mapped. |
| `therapist`     | The importing therapist |

**Response 201:**

```json
{
  "ok": true,
  "message": "Patient imported successfully.",
  "identifier": "905-2",
  "username": "905-2",
  "project": "COMPASS",
  "patient_id": "<mongo_id>",
  "user_id": "<mongo_id>"
}
```

**Errors:** 400 validation / weak password / already imported · 403 project not allowed / DAG forbidden · 404 therapist not found / record not found in REDCap · 502 REDCap API error · 500

---

#### `POST /api/wearables/sync-to-redcap/<patient_id>/`

No JWT enforcement (view uses `@csrf_exempt`). Intended for internal/therapist use only.

Manually triggers the Fitbit → REDCap wearables sync for a single patient. Selects the ISO week with the highest wear time within the baseline and follow-up periods, averages the metrics, and writes to the REDCap `wearables` instrument.

**URL parameter:** `patient_id` — MongoDB ObjectId of the patient.

**Request body** (all fields optional):

| Field            | Type   | Description                                            |
|------------------|--------|--------------------------------------------------------|
| `event_baseline` | string | Override REDCap event name for the baseline write      |
| `event_followup` | string | Override REDCap event name for the follow-up write     |

If omitted, defaults come from `REDCAP_WEARABLES_EVENT_BASELINE` / `REDCAP_WEARABLES_EVENT_FOLLOWUP` env vars, then from the per-project hard-coded defaults (COMPASS: `visit_baseline_arm_1` / `visit_6m_arm_1`; COPAIN: `t0_at_disch_arm_1` / `t2_six_months_afte_arm_1`).

**Response 200:**

```json
{
  "ok": true,
  "results": {
    "baseline": "ok",
    "followup": "skipped"
  },
  "summary": {
    "baseline": {
      "monitoring_start": "03-01-2024",
      "monitoring_end": "09-01-2024",
      "monitoring_days": 7,
      "fitbit_steps": 6843,
      "fitbit_pa": 42,
      "fitbit_inactivity": 891,
      "sleep_duration": "07:30"
    },
    "followup": null
  },
  "sent_payloads": {
    "baseline": {
      "status": "sent",
      "record": {
        "record_id": "99",
        "monitoring_start": "03-01-2024",
        "monitoring_end": "09-01-2024",
        "monitoring_days": "7",
        "fitbit_steps": "6843",
        "fitbit_pa": "42",
        "fitbit_inactivity": "891",
        "sleep_duration": "07:30",
        "wearables_complete": "1",
        "redcap_event_name": "visit_baseline_arm_1"
      }
    },
    "followup": {
      "status": "skipped",
      "reason": "no_fitbit_data_in_period"
    }
  }
}
```

`results` values: `"ok"` (written), `"skipped"` (no Fitbit data in period), or `"error: <message>"`.
`sent_payloads` contains what was prepared/sent per period (`status`: `sent`, `skipped`, or `error`).

**Errors:**

| Status | Cause |
|--------|-------|
| 400    | Patient has no `reha_end_date`, or no `project` set |
| 404    | `patient_id` not found |
| 502    | REDCap API rejected the write (`detail` field contains REDCap error) |
| 500    | Unexpected server error |

**REDCap fields written:**

| REDCap field        | Value                                                        |
|---------------------|--------------------------------------------------------------|
| `monitoring_start`  | First day of best wear week (`DD-MM-YYYY`)                   |
| `monitoring_end`    | Last day of best wear week (`DD-MM-YYYY`)                    |
| `monitoring_days`   | Number of days in the selected week                          |
| `fitbit_pa`         | Average Active Zone Minutes/day                              |
| `fitbit_inactivity` | Average inactivity minutes/day                               |
| `fitbit_steps`      | Average steps/day                                            |
| `sleep_duration`    | Average sleep — integer hours (COMPASS) or `HH:MM` (COPAIN) |
| `wearables_complete`| Always `"1"` (Unverified — researcher marks Complete)        |

The nightly Celery task `core.tasks.sync_wearables_to_redcap_all` runs this for all eligible patients at **02:30 UTC** automatically.

---

---

## Named Templates

All endpoints in this section require a valid JWT `Authorization: Bearer <token>` header.

**Auth error codes:**
- `401 Unauthorized` — token missing, expired, or invalid (DRF rejects before the view runs).
- `403 Forbidden` — token is valid but the authenticated user has no associated `Therapist` profile, or the operation requires ownership.

**Visibility rules:**
- Public templates (`is_public: true`) are visible to all therapists.
- Private templates are visible only to their creator.
- Only the creator may modify or delete a template.
- Any therapist who can *see* a template may copy it (copy is always private).

**`_all` sentinel:** When no diagnosis is specified for an intervention assignment, it is stored under the internal key `_all`, meaning it applies to any patient regardless of diagnosis.

---

#### `GET /api/templates/`

List templates visible to the authenticated therapist (own + all public ones).

**Query parameters:**

| Param | Type | Notes |
|---|---|---|
| `name` | string | Case-insensitive substring match |
| `specialization` | string | Case-insensitive substring match |
| `diagnosis` | string | Case-insensitive substring match |

**Response 200:**

```json
{
  "templates": [
    {
      "id": "<ObjectId>",
      "name": "Stroke Recovery Week 1",
      "description": "",
      "is_public": true,
      "created_by": "<user_object_id>",
      "created_by_name": "Alice Smith",
      "specialization": "Neurology",
      "diagnosis": "Stroke",
      "intervention_count": 4,
      "createdAt": "2026-01-01T00:00:00",
      "updatedAt": "2026-01-02T00:00:00"
    }
  ]
}
```

**Errors:** 401 unauthenticated · 403 therapist profile not found

---

#### `POST /api/templates/`

Create a new template.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Max 200 chars |
| `description` | string | no | |
| `is_public` | boolean | no | Default `false` |
| `specialization` | string | no | |
| `diagnosis` | string | no | |

**Response 201:** `{ "template": { ...full template with `recommendations` array } }`

**Errors:** 400 missing/blank name · 400 name > 200 chars · 401 unauthenticated · 403 therapist not found

---

#### `GET /api/templates/<id>/`

Retrieve full template detail including all recommendation entries.

**Response 200:**

```json
{
  "template": {
    "id": "...",
    "name": "...",
    "recommendations": [
      {
        "intervention_id": "<ObjectId>",
        "intervention_title": "Arm Exercise",
        "diagnosis_assignments": {
          "Stroke": [
            {
              "active": true,
              "interval": 1,
              "unit": "day",
              "selected_days": [],
              "start_day": 1,
              "end_day": 14,
              "suggested_execution_time": 30
            }
          ],
          "_all": [ ... ]
        }
      }
    ],
    "intervention_count": 1,
    ...
  }
}
```

**Errors:** 400 invalid ObjectId · 401 unauthenticated · 403 therapist not found · 404 not found or private

---

#### `DELETE /api/templates/<id>/`

Delete a template. Owner only.

**Response 200:** `{ "success": true }`

**Errors:** 400 invalid id · 401 unauthenticated · 403 not owner · 404 not found

---

#### `PATCH /api/templates/<id>/`

Update template metadata. Owner only. All fields are optional.

**Request body:**

| Field | Type | Notes |
|---|---|---|
| `name` | string | Max 200 chars, cannot be blank |
| `description` | string | |
| `is_public` | boolean | |
| `specialization` | string | |
| `diagnosis` | string | |

**Response 200:** `{ "template": { ...full template } }`

**Errors:** 400 blank/overlong name · 401 unauthenticated · 403 not owner · 404 not found

---

#### `POST /api/templates/<id>/copy/`

Duplicate a visible template. The copy is private and owned by the requesting therapist.

**Request body (optional):**

| Field | Type | Notes |
|---|---|---|
| `name` | string | Defaults to `"Copy of <original name>"`, truncated at 200 chars |
| `description` | string | Overrides the original description. If omitted, the original description is inherited. Pass `""` for an empty description. |

**Response 201:** `{ "template": { ...new template (detail) } }`

**Errors:** 400 invalid id · 401 unauthenticated · 403 therapist not found · 404 template not found or private · 405 wrong method

---

#### `POST /api/templates/<id>/interventions/`

Add (or replace) an intervention+schedule entry in the template. Only the template owner may call this.

When `diagnosis` is omitted or empty, the entry is stored under the `_all` sentinel key and will apply to any patient regardless of diagnosis.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `interventionId` | string | yes | Valid ObjectId of an `Intervention` |
| `diagnosis` | string | no | Omit or `""` for "all diagnoses" |
| `start_day` | integer | no | Default `1` |
| `end_day` | integer | yes | |
| `interval` | integer | no | Default `1` |
| `unit` | string | no | `"day"` \| `"week"` \| `"month"`, default `"week"` |
| `selected_days` | string[] | no | e.g. `["Mon","Wed","Fri"]` |
| `suggested_execution_time` | integer | no | Minutes |

**Response 200:** `{ "template": { ...full template } }`

**Errors:** 400 missing interventionId/end_day/invalid unit · 401 unauthenticated · 403 not owner · 404 template/intervention not found · 405 wrong method

---

#### `DELETE /api/templates/<id>/interventions/<intervention_id>/`

Remove an intervention entry from the template.

**Query parameters:**

| Param | Type | Notes |
|---|---|---|
| `diagnosis` | string | If provided, only removes that diagnosis block; omit to remove the entire entry |

**Response 200:** `{ "template": { ...updated template } }`

**Errors:** 400 invalid id · 401 unauthenticated · 403 not owner · 404 intervention not in template · 405 wrong method

---

#### `POST /api/templates/<id>/apply/`

Apply a named template to one or more patients' rehabilitation plans.

Two mutually exclusive targeting modes are supported — exactly one must be provided:

- **`patientIds` mode**: apply to a specific list of patients (by ObjectId or `patient_code`).
- **`diagnosis` mode**: apply to *all* clinic patients whose `diagnosis` list contains the given value.

If no `RehabilitationPlan` exists for a patient, one is created automatically.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `patientIds` | string[] | one of | List of patient ObjectIds or `patient_code` strings |
| `diagnosis` | string | one of | Bulk mode — applies to all clinic patients with this diagnosis |
| `effectiveFrom` | string | yes | `YYYY-MM-DD` |
| `overwrite` | boolean | no | Default `false` |
| `require_video_feedback` | boolean | no | Default `false` |
| `notes` | string | no | Max 1000 chars |

> **Note:** providing both `patientIds` and `diagnosis` at the same time returns 400.

**Response 200:**

```json
{
  "success": true,
  "applied": 3,
  "sessions_created": 12,
  "patients_affected": 2
}
```

When `diagnosis` mode finds no matching patients, the response is still 200 with `applied: 0` and a `message` field explaining there were no matches.

**`created_by` field:** The `created_by` value in all template responses is the **User** ObjectId (what `authStore.id` holds from the JWT claim), not the Therapist document ObjectId. Frontend ownership checks should compare `template.created_by === authStore.id`.

**Errors:** 400 missing patientIds+diagnosis/effectiveFrom/invalid date/both modes given · 401 unauthenticated · 403 therapist not found · 404 template not found or private / patient(s) not found · 405 wrong method

---

#### `GET /api/templates/<id>/calendar/`

Preview the intervention schedule for a template as a flat list of occurrences, anchored to a virtual start date of `2000-01-01`. Used by the frontend Templates tab to render the schedule grid before applying.

**Query parameters:**

| Param | Type | Notes |
|---|---|---|
| `horizon_days` | integer | Number of days to project, default `84` |
| `diagnosis` | string | If set, only entries matching that diagnosis (or `_all`) are included |

**Response 200:**

```json
{
  "horizon_days": 84,
  "items": [
    {
      "diagnosis": "Stroke",
      "intervention": {
        "_id": "<ObjectId>",
        "title": "Arm Exercise",
        "duration": 30,
        "content_type": "video",
        "tags": []
      },
      "schedule": {
        "unit": "week",
        "interval": 1,
        "selectedDays": ["Mon", "Wed"],
        "start_day": 1,
        "end_day": 14
      },
      "occurrences": [
        { "day": 1, "time": "08:00" },
        { "day": 3, "time": "08:00" }
      ],
      "segments": [ ... ]
    }
  ]
}
```

**Errors:** 400 invalid id · 401 unauthenticated · 403 therapist not found · 404 not found or private · 405 wrong method · 500 internal

---

## Common Response Patterns

- `{ "success": true|false, ... }`
- `{ "ok": true|false, ... }`
- `{ "error": "..." }` or `{ "message": "..." }`
- `{ "field_errors": { "<field>": ["<message>"] }, "non_field_errors": ["..."] }` on validation failures
- Raw arrays for some `GET` list endpoints

## Common HTTP Status Codes

| Code | Meaning                                          |
|------|--------------------------------------------------|
| 200  | OK                                               |
| 201  | Created                                          |
| 400  | Bad request / validation error                   |
| 401  | Missing or invalid credentials / token           |
| 403  | Forbidden / account inactive / wrong password    |
| 404  | Resource not found                               |
| 405  | Method not allowed                               |
| 429  | Too many failed attempts (password endpoints)    |
| 500  | Internal server error                            |
| 502  | Upstream service error (Fitbit, REDCap)          |

## For Exact Payloads

- Endpoint-specific tests: `backend/tests/`
- View implementations: `backend/core/views/`
