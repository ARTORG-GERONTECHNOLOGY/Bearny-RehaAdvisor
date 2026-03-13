# Frontend E2E Tests — Test Documentation

This directory contains end-to-end tests that validate browser -> frontend -> backend ->
frontend behavior.

Current scope starts with the home/login journey.

---

## Test files

| File                                   | Flow covered                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `home-login.spec.ts`                   | Home page opens login modal, submits credentials to `/auth/login/`, and verifies error feedback is rendered on failed login.           |
| `home-login-success-redirects.spec.ts` | Home login succeeds for seeded users and verifies role-based redirects (`/patient` and `/admin`).                                      |
| `home-login-therapist.spec.ts`         | Seeded therapist login validates `/auth/login/` 2FA response and 2FA step rendering in modal.                                          |
| `home-register-therapist.spec.ts`      | Home register modal submits therapist registration payload to `/auth/register/` and validates user-facing feedback.                    |
| `patient-page.spec.ts`                 | Patient page access-control, core patient API call triggers, day/week/today navigation controls, and daily vitals submission behavior. |
| `patient-interventions-page.spec.ts`   | Patient interventions library auth-guard, API load trigger, filter interactions, and details modal open/close behavior.                |
| `therapist-interventions-templates.spec.ts` | Named-template management on `/interventions` Templates tab: create, select, apply, copy, delete, and calendar load. Requires `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD`; tests skip gracefully without them. |

---

## What this validates

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

---

## GitHub Actions secrets

To run seeded redirect tests in CI, add these repository secrets:

- `E2E_PATIENT_LOGIN`
- `E2E_PATIENT_PASSWORD`
- `E2E_ADMIN_LOGIN`
- `E2E_ADMIN_PASSWORD`
- `E2E_THERAPIST_LOGIN`
- `E2E_THERAPIST_PASSWORD`

Path: `GitHub -> Settings -> Secrets and variables -> Actions -> New repository secret`.
