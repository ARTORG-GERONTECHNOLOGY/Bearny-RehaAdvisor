# Frontend E2E Tests — Test Documentation

This directory contains end-to-end tests that validate browser -> frontend -> backend ->
frontend behavior.

---

## Test files

| File                                                | Flow covered                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin-security.spec.ts`                            | Security regression for `/api/admin/` endpoint auth enforcement. All admin routes return 401 without a token (no credentials required to run). Non-admin JWT (patient credentials) returns 403. Public auth endpoints (`/auth/login/`, `/auth/register/`) remain unblocked. Always runs in CI. 403 checks skip gracefully when `E2E_PATIENT_LOGIN` / `E2E_PATIENT_PASSWORD` are absent.                                                                     |
| `auth-security.spec.ts`                             | Authentication hardening regression. User-enumeration prevention (Fix 10): unknown e-mail and wrong-password both return `{"error":"Invalid credentials."}` with no account-existence hints. No credentials required; always runs in CI. Rate-limiting (Fix 8) tests are skipped here — the counter is per-user-account and cannot be triggered with non-existent e-mails; covered by `backend/tests/security/test_security_fixes.py::test_fix8_*` instead. |
| `patient-plan.spec.ts`                              | Patient plan page (`/patient/plan`): auth guard redirects unauthenticated users, plan API is fetched on load, previous/next week navigation changes the displayed date range, day-of-week filter chips update visible day sections. Requires `E2E_PATIENT_LOGIN` / `E2E_PATIENT_PASSWORD`; tests skip gracefully without them.                                                                                                                              |
| `home-login.spec.ts`                                | Home page opens login modal, submits credentials to `/auth/login/`, and verifies error feedback is rendered on failed login.                                                                                                                                                                                                                                                                                                                                |
| `home-login-success-redirects.spec.ts`              | Home login succeeds for seeded users and verifies role-based redirects (`/patient` and `/admin`).                                                                                                                                                                                                                                                                                                                                                           |
| `home-login-therapist.spec.ts`                      | Seeded therapist login validates `/auth/login/` 2FA response and 2FA step rendering in modal.                                                                                                                                                                                                                                                                                                                                                               |
| `home-register-therapist.spec.ts`                   | Home register modal submits therapist registration payload to `/auth/register/` and validates user-facing feedback.                                                                                                                                                                                                                                                                                                                                         |
| `patient-page.spec.ts`                              | Patient page access-control, core patient API call triggers, day/week/today navigation controls, and daily vitals submission behavior.                                                                                                                                                                                                                                                                                                                      |
| `patient-interventions-page.spec.ts`                | Patient interventions library auth-guard, API load trigger, filter interactions, and details modal open/close behavior.                                                                                                                                                                                                                                                                                                                                     |
| `therapist-interventions-templates.spec.ts`         | Named-template management on `/interventions` Templates tab: create, select, apply, copy, delete, and calendar load. Requires `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD`; tests skip gracefully without them.                                                                                                                                                                                                                                         |
| `therapist-interventions-import.spec.ts`            | Import Interventions modal — Excel tab, Upload Media tab, UI validation, upload batching summary, and friendly 413 upload error messaging. Also covers COPAIN MSK file import using the real `COPAIN_MSK_LINKS_UPLOAD.xlsm` fixture: dry-run, live import, idempotency, wrong-sheet-name error (API-level, 4 tests) and modal-level import flow (UI-level, 2 tests). Requires `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD`.                             |
| `template-assign-apply.spec.ts`                     | Template assign/apply and auto-apply scope regression: assign → apply produces sessions, schedule update persists, diagnosis block removal persists, and diagnosis auto-apply modes (`future`, `all_past_and_future`) including `auto_apply_starting_from` defaulting behavior. API-level (8) + UI-level (2). Requires `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD` / `E2E_PATIENT_ID` (some API tests only require therapist creds).                   |
| `spurious-logout.spec.ts`                           | Spurious logout regression: concurrent 401 refresh-token race, stale `expiresAt` on reload, corrupted `expiresAt`, multi-tab logout sync. Requires `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD`.                                                                                                                                                                                                                                                        |
| `therapist-rehabtable-questionnaires.spec.ts`       | Therapist RehabTable questionnaire tab: endpoint fetches, schedule modal open, questionnaire-content visibility, and answered-results rendering for assigned questionnaires. Requires `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD` / `E2E_PATIENT_ID`.                                                                                                                                                                                                  |
| `therapist-health-export-questionnaire-csv.spec.ts` | Therapist Health page export regression: CSV questionnaire section includes question text, multi-answer keys/texts, comments, and media URLs. Requires `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD` / `E2E_PATIENT_ID`.                                                                                                                                                                                                                                 |
| `therapist-feedback-chips.spec.ts`                  | Therapist patient-list feedback chip logic: uses mocked `/api/therapists/<id>/patients` response to verify intervention-feedback-based chip level and tooltip text, and that Health chip remains hidden for ongoing patients. Requires seeded therapist login.                                                                                                                                                                                              |
| `therapist-characteristics-space-input.spec.ts`     | Therapist patient-popup characteristics regression: verifies multi-word values can be typed in comma-separated fields and that save payload preserves spaces within words (normalizing by comma). Requires `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD` / `E2E_EMAIL_DIR`.                                                                                                                                                                              |
| `therapist-wearables-sync.spec.ts`                  | Therapist patient popup wearables sync regression: verifies sync success status (`ok`/`skipped`), payload detail rendering (`sent_payloads` table view), and informative backend error visibility on failed sync. Requires `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD` / `E2E_EMAIL_DIR`.                                                                                                                                                              |
| `therapist-patient-delete.spec.ts`                  | Therapist patient delete regression (bug #223): verifies the Delete button in the patient popup calls `DELETE /users/:id/profile/` (not the defunct `/patients/:id/` which returned 404), the confirmation dialog appears before the request is sent, the popup closes on success, and backend errors are surfaced to the user. Requires `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD` / `E2E_EMAIL_DIR`.                                                |
| `LoginForm.test.tsx` (unit)                         | 2FA double-send regression (bug #235): double-clicking Login sends verification code exactly once because the button is disabled while the request is in flight.                                                                                                                                                                                                                                                                                            |
| `patient-health-questionnaire-ui.spec.ts`           | Patient UI questionnaire flow: therapist assigns questionnaire (API setup), patient logs in, answers popup questions, and submits to `/patients/feedback/questionaire/`. Requires seeded therapist + patient credentials.                                                                                                                                                                                                                                   |
| `therapist-recommendation-content-type.spec.ts`     | Add Recommendation content type field regression: verifies dropdown exposes original taxonomy labels (`brochure`, `graphics`, etc.) rather than backend type names, and that the frontend maps each label to the correct backend value (`graphics`→`Image`, `brochure`→`PDF`, etc.) in the multipart POST payload. Requires `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD` / `E2E_EMAIL_DIR`.                                                             |
| `multi-media-intervention.spec.ts`                  | Multi-media per intervention feature: verifies Add Intervention modal shows multi-media info text and allows adding multiple media rows; Upload Media tab shows slot-suffix naming convention (`_2`, `_3`); Excel Import tab shows slot hint. Requires `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD` / `E2E_EMAIL_DIR`.                                                                                                                                  |

---

## What this validates

- **Admin endpoint security** (`admin-security.spec.ts`, always runs):
  - Every `/api/admin/` route returns 401 without an Authorization header (JWTAuthMiddleware).
  - Every `/api/admin/` route returns 403 when called with a non-admin Bearer token (IsAdmin permission class).
  - Public auth endpoints (`/auth/login/`, `/auth/register/`) are not blocked by the middleware.
- **Authentication hardening** (`auth-security.spec.ts`, always runs):
  - Login rate-limiting locks an account after 5 wrong-password attempts (HTTP 429 on the 6th).
  - The 429 response body contains a human-readable `error` field.
  - Unknown e-mail and wrong-password login attempts return identical `{"error":"Invalid credentials."}` responses (no account-existence information leaked).
- **Patient plan page** (`patient-plan.spec.ts`, requires seeded patient):
  - Unauthenticated access to `/patient/plan` redirects to the root.
  - Authenticated load triggers a `GET .../patients/rehabilitation-plan/patient/` request.
  - Previous/next week navigation changes the displayed date range heading.
  - Day-of-week filter chips (when visible) reduce or restore the number of rendered day sections.
- The home page is reachable from the frontend root route (`/`).
- Login modal opens from the home page CTA.
- Credentials are posted to backend endpoint `/auth/login/`.
- Frontend handles backend login failure and renders visible error feedback.
- Frontend role-based post-login redirects:
  - Patient -> `/patient`
  - Admin -> `/admin`
- Therapist login first-step behavior:
  - Backend returns `require_2fa`
  - Frontend renders verification code step
- Therapist registration submission from home register modal.
- Patient page behavior:
  - unauthenticated redirect from `/patient`
  - authenticated load calling fitbit/plan/questionnaire endpoints
  - day/week/today control interactions
  - daily vitals manual submit request (when prompt is present)
  - intervention completion/uncompletion request path (`/interventions/complete/`, `/interventions/uncomplete/`)
  - intervention feedback question fetch and feedback submit request path (`/patients/feedback/questionaire/`)
- Patient interventions library behavior:
  - unauthenticated redirect from `/patient-interventions`
  - authenticated interventions list fetch trigger (`/interventions/all/`)
  - search/content-type filter and reset interactions
  - intervention details modal open/close when list is non-empty
- Named-template management on `/interventions` → Templates tab (seeded therapist required):
  - Templates tab is visible and clickable
  - Template management bar (selector, "+ New" button) renders
  - New Template modal opens and `POST /api/templates/` is called with correct body; new option appears in selector
  - Selecting a named template reveals Apply / Copy / Delete buttons
  - Apply button opens `ApplyTemplateModal` with diagnosis optional ("All diagnoses" option present)
  - Copy button calls `POST /api/templates/<id>/copy/`; copy appears in selector
  - Delete button (with `window.confirm` accepted) calls `DELETE /api/templates/<id>/`; option removed from selector
  - Switching to a named template triggers `GET /api/templates/<id>/calendar/`
- Template assign/apply regression (`template-assign-apply.spec.ts`, seeded therapist + patient required):
  - Assigning an intervention then applying returns `applied=1` and `sessions_created > 0`
  - Updating an existing schedule (second assign) persists to DB and apply uses the new `end_day`
  - Removing a diagnosis block via `DELETE ?diagnosis=` survives a DB reload
  - Applying an empty template returns `applied=0, sessions_created=0`
  - Named template diagnosis auto-apply:
    - `future` stores diagnosis rule under `auto_apply_rules`
    - `all_past_and_future` with explicit `auto_apply_starting_from` persists date and returns `existing_patients_applied`
    - `all_past_and_future` without `auto_apply_starting_from` defaults to today's date
  - Legacy diagnosis assignment endpoint accepts `all_past_and_future` + `auto_apply_starting_from` and returns `existing_patients_applied`
  - Full UI flow: create via UI + apply → `sessions_created > 0`
  - Apply dialog shows a non-zero session count
  - Auto-apply scope API checks:
    - `auto_apply_scope=future` persists diagnosis rule in template
    - `auto_apply_scope=all_past_and_future` returns existing-patient backfill summary
- Import Interventions modal (`therapist-interventions-import.spec.ts`, seeded therapist required):
  - Excel tab is shown by default; both tab links are visible
  - Switching to Upload Media tab and back restores the correct UI
  - File input `accept` attribute covers all media types
  - Upload button disabled with no files selected
  - Valid mp4 / pdf filenames show ✓ badge and enable Upload button
  - Media upload summary explains automatic smaller request batches
  - Proxy-style 413 upload response is shown as a friendly size-limit message
  - Invalid filename shows ✗ badge and Upload button stays disabled
  - Naming convention examples rendered correctly
  - Close button dismisses the modal
  - COPAIN MSK file (API-level, `MKS_Upload_links` sheet):
    - Dry-run parses all rows without fatal errors (`created=0`, `errors_count=0`)
    - Live import creates / updates interventions (`created + updated > 0`, `errors_count=0`)
    - Re-import is idempotent (`created=0`, `updated > 0` on second run)
    - Wrong sheet name (`"Content"`) returns HTTP 500 with details
  - COPAIN MSK file (UI-level):
    - Setting correct sheet name + attaching file shows result panel after import
    - Leaving default sheet name surfaces failure alert in modal
- Spurious-logout regression (`spurious-logout.spec.ts`, seeded therapist required):
  - Concurrent 401 responses (race condition) do not log the user out
  - A single non-401 error does not log the user out
  - Hard reload with a stale `expiresAt` + valid refresh token → user stays logged in
  - Hard reload with stale `expiresAt` and no refresh token → user is redirected to login
  - Corrupted `expiresAt` with valid refresh token → silent refresh keeps session alive
  - Explicit logout in one tab removes the token from shared storage
- Therapist questionnaires tab (`therapist-rehabtable-questionnaires.spec.ts`, seeded therapist + patient required):
  - Questionnaires tab renders available/assigned panels
  - Schedule modal opens from action buttons
  - Therapist can expand questionnaire details and see question texts + answer options
  - Assigned questionnaire cards display answered results (date/question/answers/comment) when present
- Therapist health export CSV (`therapist-health-export-questionnaire-csv.spec.ts`, seeded therapist + patient required):
  - CSV export flow works from `/health` page
  - Questionnaire CSV columns include question key/text, all answer keys/texts, comment, and media URLs
  - Multi-answer values are serialized as `value1 | value2`
- Therapist feedback chips (`therapist-feedback-chips.spec.ts`, seeded therapist required):
  - Intercepts `GET /api/therapists/<id>/patients` with controlled fixtures
  - Verifies `Feedback good` for recent/high-average intervention feedback and tooltip average text
  - Verifies `Feedback bad` when trend is lower
  - Verifies Health chip is hidden for ongoing (active) patient rows
- Therapist characteristics space-input regression (`therapist-characteristics-space-input.spec.ts`, seeded therapist required):
  - Opens patient popup from `/therapist`
  - Enters multi-word comma-separated text in Characteristics input
  - Confirms saved profile payload keeps internal spaces while normalizing by commas
- Therapist wearables sync (`therapist-wearables-sync.spec.ts`, seeded therapist required):
  - Opens patient popup from `/therapist` and triggers `POST /wearables/sync-to-redcap/<patient_id>/`
  - Confirms success alert shows per-period sync outcomes and the rendered payload detail table (`sent_payloads`)
  - Confirms skipped period reason is visible (for example `no_fitbit_data_in_period`)
  - Confirms sync failure shows informative backend error text to the user
- Therapist patient delete regression (`therapist-patient-delete.spec.ts`, seeded therapist required):
  - Opens patient popup from `/therapist`
  - Confirms "Delete Patient" button opens a confirmation dialog before any API call is made
  - Confirms DELETE request is sent to `DELETE /users/:id/profile/` (not the defunct `/patients/:id/` that returned 404 — bug #223)
  - Confirms popup closes after a successful delete (200 response)
  - Confirms backend error message is surfaced via error alert when delete fails (500 response)
- Patient questionnaire UI submission (`patient-health-questionnaire-ui.spec.ts`, seeded therapist + patient required):
  - Setup assigns a due Healthstatus questionnaire for the patient
  - Patient login opens the questionnaire popup
  - Patient answers at least one question through UI controls
  - Frontend submits to `/patients/feedback/questionaire/`
- Add Recommendation content type regression (`therapist-recommendation-content-type.spec.ts`, seeded therapist required):
  - Content type dropdown shows original taxonomy labels (`brochure`, `video`, `audio`, `graphics`, `app`, `website`)
  - Dropdown does NOT expose raw backend type names (`Image`, `PDF`, `Streaming`, `Text`)
  - Each label is mapped to the correct backend value in the multipart POST payload:
    - `graphics` → `image`, `brochure` → `pdf`, `video` → `video`
    - `audio` → `audio`, `app` → `app`, `website` → `website`
    - (backend `normalize_content_type` then maps lowercase → stored title-case)

## Known flaky / currently failing notes

- `template-assign-apply.spec.ts`
  - UI scenario for scope options + backfill summary is currently marked `test.fixme`.
  - Reason: environment-dependent diagnosis distribution and modal timing make this unstable in CI.
  - API-level tests for the same behavior are active and stable.

---

## Prerequisites

- Backend API is running and reachable (default expected URL: `http://127.0.0.1:8001/api`).
- Frontend dependencies are installed.
- Playwright browsers are installed.

---

## Run commands

```bash
# from frontend/
npm run test:e2e
```

```bash
# headed mode
npm run test:e2e:headed
```

```bash
# playwright interactive UI
npm run test:e2e:ui
```

Security regression tests (no credentials required):

```bash
# Admin endpoint auth enforcement
npm run test:e2e -- e2e/admin-security.spec.ts

# Login rate-limiting + user-enumeration prevention
npm run test:e2e -- e2e/auth-security.spec.ts
```

Patient plan page (requires seeded patient credentials):

```bash
E2E_PATIENT_LOGIN=<email> E2E_PATIENT_PASSWORD=<password> \
npm run test:e2e -- e2e/patient-plan.spec.ts
```

Install browsers (one-time):

```bash
npx playwright install --with-deps chromium
```

---

## Environment knobs

- `E2E_API_URL`: backend base URL used by the frontend in E2E.
- `E2E_PORT`: frontend dev-server port (default `4173`).
- `E2E_BASE_URL`: Playwright base URL (default `http://127.0.0.1:<E2E_PORT>`).
- `E2E_PATIENT_LOGIN`: seeded patient login identifier (email or patient ID).
- `E2E_PATIENT_PASSWORD`: seeded patient password.
- `E2E_ADMIN_LOGIN`: seeded admin login identifier (email).
- `E2E_ADMIN_PASSWORD`: seeded admin password.
- `E2E_THERAPIST_LOGIN`: seeded therapist login identifier (email).
- `E2E_THERAPIST_PASSWORD`: seeded therapist password.
- `E2E_EMAIL_DIR`: directory used by Django file-based email backend so E2E can read therapist OTP codes.

Example:

```bash
E2E_API_URL=http://localhost:8001/api npm run test:e2e
```

Seeded login redirect tests:

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_PATIENT_LOGIN=<seeded-patient-email-or-id> \
E2E_PATIENT_PASSWORD=<seeded-patient-password> \
E2E_ADMIN_LOGIN=<seeded-admin-email> \
E2E_ADMIN_PASSWORD=<seeded-admin-password> \
npm run test:e2e -- e2e/home-login-success-redirects.spec.ts
```

If seeded credential variables are not provided, redirect tests are marked as skipped.

Therapist 2FA login test:

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_THERAPIST_LOGIN=<seeded-therapist-email> \
E2E_THERAPIST_PASSWORD=<seeded-therapist-password> \
npm run test:e2e -- e2e/home-login-therapist.spec.ts
```

Named-template management test (requires seeded therapist with at least one named template for full coverage):

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_THERAPIST_LOGIN=<seeded-therapist-email> \
E2E_THERAPIST_PASSWORD=<seeded-therapist-password> \
npm run test:e2e -- e2e/therapist-interventions-templates.spec.ts
```

Template assign/apply regression (requires seeded therapist + patient):

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_THERAPIST_LOGIN=<seeded-therapist-email> \
E2E_THERAPIST_PASSWORD=<seeded-therapist-password> \
E2E_PATIENT_ID=<patient-object-id> \
npm run test:e2e -- e2e/template-assign-apply.spec.ts
```

Import Interventions (requires seeded therapist; real `COPAIN_MSK_LINKS_UPLOAD.xlsm` fixture is committed at `src/__tests__/test_data/`):

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_THERAPIST_LOGIN=<seeded-therapist-email> \
E2E_THERAPIST_PASSWORD=<seeded-therapist-password> \
npm run test:e2e -- e2e/therapist-interventions-import.spec.ts
```

Spurious-logout regression (requires seeded therapist):

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_THERAPIST_LOGIN=<seeded-therapist-email> \
E2E_THERAPIST_PASSWORD=<seeded-therapist-password> \
npm run test:e2e -- e2e/spurious-logout.spec.ts
```

Therapist questionnaire + export regressions (requires seeded therapist + patient):

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_THERAPIST_LOGIN=<seeded-therapist-email> \
E2E_THERAPIST_PASSWORD=<seeded-therapist-password> \
E2E_PATIENT_ID=<patient-object-id> \
npm run test:e2e -- e2e/therapist-rehabtable-questionnaires.spec.ts e2e/therapist-health-export-questionnaire-csv.spec.ts
```

Therapist feedback-chip regression (requires seeded therapist):

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_THERAPIST_LOGIN=<seeded-therapist-email> \
E2E_THERAPIST_PASSWORD=<seeded-therapist-password> \
E2E_EMAIL_DIR=<shared-email-dir-for-2fa> \
npm run test:e2e -- e2e/therapist-feedback-chips.spec.ts
```

Therapist characteristics space-input regression (requires seeded therapist + OTP email directory):

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_THERAPIST_LOGIN=<seeded-therapist-email> \
E2E_THERAPIST_PASSWORD=<seeded-therapist-password> \
E2E_EMAIL_DIR=<shared-email-dir> \
npm run test:e2e -- e2e/therapist-characteristics-space-input.spec.ts
```

Therapist wearables sync regression (requires seeded therapist + OTP email directory):

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_THERAPIST_LOGIN=<seeded-therapist-email> \
E2E_THERAPIST_PASSWORD=<seeded-therapist-password> \
E2E_EMAIL_DIR=<shared-email-dir> \
npm run test:e2e -- e2e/therapist-wearables-sync.spec.ts
```

Patient questionnaire popup submission (requires seeded therapist + patient):

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_THERAPIST_LOGIN=<seeded-therapist-email> \
E2E_THERAPIST_PASSWORD=<seeded-therapist-password> \
E2E_PATIENT_LOGIN=<seeded-patient-email-or-id> \
E2E_PATIENT_PASSWORD=<seeded-patient-password> \
E2E_PATIENT_ID=<patient-object-id> \
npm run test:e2e -- e2e/patient-health-questionnaire-ui.spec.ts
```

Add Recommendation content type mapping regression (requires seeded therapist + OTP email directory):

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_THERAPIST_LOGIN=<seeded-therapist-email> \
E2E_THERAPIST_PASSWORD=<seeded-therapist-password> \
E2E_EMAIL_DIR=<shared-email-dir> \
npm run test:e2e -- e2e/therapist-recommendation-content-type.spec.ts
```

Patient delete regression — bug #223 (requires seeded therapist + OTP email directory):

```bash
E2E_API_URL=http://localhost:8001/api \
E2E_THERAPIST_LOGIN=<seeded-therapist-email> \
E2E_THERAPIST_PASSWORD=<seeded-therapist-password> \
E2E_EMAIL_DIR=<shared-email-dir> \
npm run test:e2e -- e2e/therapist-patient-delete.spec.ts
```

---

## GitHub Actions secrets

To run seeded redirect tests in CI, add these repository secrets:

- `E2E_PATIENT_LOGIN`
- `E2E_PATIENT_PASSWORD`
- `E2E_ADMIN_LOGIN`
- `E2E_ADMIN_PASSWORD`
- `E2E_THERAPIST_LOGIN`
- `E2E_THERAPIST_PASSWORD`
- `E2E_PATIENT_ID`

Path: `GitHub -> Settings -> Secrets and variables -> Actions -> New repository secret`.
