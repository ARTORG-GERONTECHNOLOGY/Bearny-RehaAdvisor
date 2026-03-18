# Frontend E2E Test Documentation

## Overview

This document covers the Playwright-based frontend end-to-end tests for RehaAdvisor.
These tests validate complete browser -> frontend -> backend -> frontend behavior.

Current E2E scope starts with home/login flows.

## Location and Structure

E2E tests are located in:

```text
frontend/
  e2e/
    home-login.spec.ts
    home-login-success-redirects.spec.ts
    home-login-therapist.spec.ts
    home-register-therapist.spec.ts
    patient-page.spec.ts
    therapist-interventions-templates.spec.ts
    TESTING.md
  playwright.config.ts
```

## Test Coverage

### `home-login.spec.ts`

Validates failed login flow:
- Opens home page (`/`)
- Opens login modal
- Submits credentials to `POST /auth/login/`
- Confirms request payload is sent
- Confirms frontend shows error alert on failed login

### `home-login-success-redirects.spec.ts`

Validates role-based successful login redirects using seeded users:
- Patient login redirects to `/patient`
- Admin login redirects to `/admin`

If seeded env vars are missing, these tests are skipped (not failed).

### `home-login-therapist.spec.ts`

Validates therapist login first-step behavior:
- Submits therapist credentials to `/auth/login/`
- Confirms backend indicates 2FA required
- Confirms frontend shows verification code input
- Confirms frontend attempts `/auth/send-verification-code/`

### `home-register-therapist.spec.ts`

Validates therapist registration from the Home register modal:
- Fills registration wizard fields
- Submits to `/auth/register/`
- Confirms registration request is sent and user feedback is shown

### `patient-page.spec.ts`

Validates patient page and core user functions:
- Unauthenticated access to `/patient` is redirected to `/`
- Seeded patient login reaches `/patient`
- Core patient API calls are triggered on load:
  - Fitbit status
  - Rehabilitation plan
  - Initial questionnaire check
- Day/week/today controls are interactive
- Daily vitals submission sends manual vitals payload (if prompt is shown)
- Intervention completion toggles backend endpoint calls:
  - `/interventions/complete/`
  - `/interventions/uncomplete/`
- Feedback flow checks:
  - intervention feedback question fetch
  - feedback submission request to `/patients/feedback/questionaire/`

### `therapist-interventions-templates.spec.ts`

Validates the named-template management flow on `/interventions` → Templates tab.
All tests skip gracefully when `E2E_THERAPIST_LOGIN` / `E2E_THERAPIST_PASSWORD` are absent.

**Helpers:**
- `loginAsTherapist(page)` — authenticates via the home-page login modal and waits for `/therapist` redirect
- `openTemplatesTab(page)` — navigates to `/interventions` and clicks the Templates tab
- `skipUnlessSeeded(test)` — skips the current test when credentials env vars are missing

**Test scenarios:**

| Test | What it checks |
|---|---|
| Navigates to /interventions and shows the Templates tab | Tab element is visible |
| Templates tab shows template management bar after clicking | Template selector combobox is present |
| Opens New Template modal when "+ New" button is clicked | Modal appears with "New Template" heading |
| Creates a new template via the modal and shows it in the selector | Intercepts `POST /api/templates/` — verifies request body includes `name`; modal closes; new option appears in selector |
| Selecting a named template shows Apply, Copy, Delete buttons | After selecting a named option, all three action buttons are visible |
| Apply button opens ApplyTemplateModal with correct templateId | Modal title "Apply template to patient" appears; "All diagnoses" option is present (confirming `templateId` was passed) |
| Copy button calls `POST /api/templates/<id>/copy/` | Intercepts copy request; "Copy of …" option appears in selector |
| Delete button calls `DELETE /api/templates/<id>/` after confirmation | Creates a template, selects it, accepts `window.confirm`, intercepts DELETE request, confirms option disappears |
| Switching to a named template loads its calendar via `GET /api/templates/<id>/calendar/` | Intercepts calendar request after option selection |

**Patterns used:**
- `page.waitForRequest(req => req.url().includes(...) && req.method() === '...')` — API call verification
- `page.once('dialog', d => d.accept())` — handle `window.confirm` for delete
- `test.skip(!value, 'reason')` — conditional skipping per-test when no seeded data

---

## Prerequisites

- Backend API is reachable
- Frontend dependencies are installed
- Playwright Chromium is installed

## Run Locally

### Recommended (inside existing Docker containers)

Run all E2E tests:

```bash
docker exec react sh -lc 'cd /app && E2E_API_URL=http://django:8000/api npm run test:e2e'
```

Run only base login test:

```bash
docker exec react sh -lc 'cd /app && E2E_API_URL=http://django:8000/api npm run test:e2e -- e2e/home-login.spec.ts'
```

Run seeded redirect tests:

```bash
docker exec react sh -lc 'cd /app && \
E2E_API_URL=http://django:8000/api \
E2E_PATIENT_LOGIN=<patient-login> \
E2E_PATIENT_PASSWORD=<patient-password> \
E2E_ADMIN_LOGIN=<admin-login> \
E2E_ADMIN_PASSWORD=<admin-password> \
npm run test:e2e -- e2e/home-login-success-redirects.spec.ts'
```

Run seeded therapist login 2FA flow:

```bash
docker exec react sh -lc 'cd /app && \
E2E_API_URL=http://django:8000/api \
E2E_THERAPIST_LOGIN=<therapist-login> \
E2E_THERAPIST_PASSWORD=<therapist-password> \
npm run test:e2e -- e2e/home-login-therapist.spec.ts'
```

### Direct host run (without Docker)

From `frontend/`:

```bash
npm ci
npx playwright install --with-deps chromium
E2E_API_URL=http://127.0.0.1:8001/api npm run test:e2e
```

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `E2E_API_URL` | Yes | Backend API base URL for frontend runtime in E2E |
| `E2E_PORT` | No | Port for Playwright webServer (default `4173`) |
| `E2E_BASE_URL` | No | Browser base URL override |
| `E2E_PATIENT_LOGIN` | Redirect tests only | Seeded patient login identifier |
| `E2E_PATIENT_PASSWORD` | Redirect tests only | Seeded patient password |
| `E2E_ADMIN_LOGIN` | Redirect tests only | Seeded admin login identifier |
| `E2E_ADMIN_PASSWORD` | Redirect tests only | Seeded admin password |
| `E2E_THERAPIST_LOGIN` | Therapist login + templates tests | Seeded therapist login identifier |
| `E2E_THERAPIST_PASSWORD` | Therapist login + templates tests | Seeded therapist password |

## CI Integration

GitHub Actions workflow: `.github/workflows/tests.yml`

The `frontend-e2e` job:
- Starts backend services
- Runs base E2E login test always
- Runs seeded redirect E2E tests only when all four E2E secrets are configured
- Runs patient page/library E2E tests when `E2E_PATIENT_LOGIN` and `E2E_PATIENT_PASSWORD` are configured:
  - `e2e/patient-page.spec.ts`
  - `e2e/patient-interventions-page.spec.ts`
- Runs therapist 2FA E2E test when `E2E_THERAPIST_LOGIN` and `E2E_THERAPIST_PASSWORD` are configured
- Runs named-template E2E tests (`e2e/therapist-interventions-templates.spec.ts`) when `E2E_THERAPIST_LOGIN` and `E2E_THERAPIST_PASSWORD` are configured

Required GitHub secrets for seeded redirect tests:
- `E2E_PATIENT_LOGIN`
- `E2E_PATIENT_PASSWORD`
- `E2E_ADMIN_LOGIN`
- `E2E_ADMIN_PASSWORD`

Optional GitHub secrets for therapist 2FA login test:
- `E2E_THERAPIST_LOGIN`
- `E2E_THERAPIST_PASSWORD`

## Troubleshooting

### `requestfailed` or no response from `/auth/login/`
- Verify `E2E_API_URL` points to reachable backend URL from test runtime.
- For Docker, use `http://django:8000/api` from `react` container.

### Browser launch failures in container
- Install browser dependencies:

```bash
npx playwright install --with-deps chromium
```

### Redirect tests skipped
- Confirm seeded env vars (local) or GitHub secrets (CI) are set.

## Extending E2E Tests

When adding a new E2E scenario:
1. Add a new spec under `frontend/e2e/`.
2. Keep selectors stable (`id`, accessible role/name).
3. Validate both network interaction and UI outcome.
4. Update `frontend/e2e/TESTING.md` and this document.
