# Study Integration Guide

How to connect the platform to a clinical study managed in REDCap, enrol participants, and keep wearables data flowing back.

---

## Overview

The platform integrates with REDCap for two purposes:

1. **Patient import** — a therapist looks up consented participants from REDCap and creates their platform account in one step.
2. **Wearables sync** — Fitbit data (steps, activity, sleep) collected by the platform is written back into REDCap automatically via a scheduled Celery task.

Both flows use the same REDCap API URL and project tokens. Neither flow exposes raw API tokens to the browser; all calls are made server-side.

---

## Prerequisites

- A REDCap project with the standard instruments (Eligibility, Wearables).
- A REDCap API token with **Export** rights for the project (read-only is enough for patient import; **Import** rights are additionally required for wearables sync).
- The REDCap project must have the `ic` field (informed consent) on the **Eligibility** instrument. Only participants where `ic = 1` can be imported.

---

## Environment Variables

Set these in the `.env` file that is loaded by your Docker Compose stack (`.env.dev` for development, `.env.prod` for production).

### Core REDCap connection

| Variable | Required | Example | Description |
|---|---|---|---|
| `REDCAP_API_URL` | Yes | `https://redcap.unibe.ch/api/` | Full URL to the REDCap API endpoint, including the trailing slash. All projects share this URL. |
| `REDCAP_TOKEN_<PROJECT>` | Yes, per project | `REDCAP_TOKEN_COPAIN=abc123` | API token for the named project. Replace `<PROJECT>` with the uppercase project name exactly as it appears in `config.json` (e.g. `COPAIN`, `COMPASS`). Add one variable per project. |

### Optional compliance mode

| Variable | Default | Example | Description |
|---|---|---|---|
| `ENFORCE_REDCAP_ONLY_PATIENT_CREATION` | *(unset / off)* | `1` | When set to `1`, `true`, or `yes`, the patient registration endpoint rejects any account creation request that does not come through the REDCap import flow. Useful for study deployments where no manual patient creation should be allowed. |

### Wearables sync event names

These only need to be set if the REDCap event names in your project differ from the built-in defaults. The defaults are hard-coded per project in `wearables_redcap_service.py`:

| Project | Default baseline event | Default follow-up event |
|---|---|---|
| COMPASS | `visit_baseline_arm_1` | `visit_6m_arm_1` |
| COPAIN | `t0_at_disch_arm_1` | `t2_six_months_afte_arm_1` |

| Variable | Description |
|---|---|
| `REDCAP_WEARABLES_EVENT_BASELINE` | Override the baseline REDCap event name for all projects in this deployment. |
| `REDCAP_WEARABLES_EVENT_FOLLOWUP` | Override the follow-up REDCap event name for all projects in this deployment. |

---

## Connecting a New Project

### 1. Add the project to `config.json`

`backend/config.json` controls which projects exist, which clinics participate in each, and what REDCap Data Access Group (DAG) each clinic maps to.

```jsonc
"therapistInfo": {
  // Full list of project names the platform knows about.
  "projects": ["COPAIN", "COMPASS"],

  // Maps each clinic name to the projects it participates in.
  // A therapist assigned to a clinic can only see that clinic's projects.
  "clinic_projects": {
    "Inselspital": ["COPAIN", "COMPASS"],
    "Bern":        ["COMPASS"]
  },

  // Maps each clinic name to its REDCap Data Access Group identifier.
  // Must match the DAG slug in REDCap exactly (lowercase, underscores).
  "clinic_dag": {
    "Inselspital": "inselspital",
    "Bern":        "bern"
  }
}
```

If your new project is hosted in the same REDCap instance, only `config.json` and the token variable need updating — no code changes required.

### 2. Set the API token

```bash
# .env.dev (or .env.prod)
REDCAP_TOKEN_MYPROJECT=your_redcap_api_token_here
```

The token is looked up by uppercasing the project name and prefixing with `REDCAP_TOKEN_`. So project `"MYPROJECT"` in `config.json` requires `REDCAP_TOKEN_MYPROJECT`.

### 3. Restart the backend

```bash
docker compose -f docker-compose.dev.yml restart django celery
```

### 4. Verify the connection

```bash
docker exec django python3 -c "
import os, requests
r = requests.post(
    os.environ['REDCAP_API_URL'],
    data={
        'token': os.environ['REDCAP_TOKEN_MYPROJECT'],
        'content': 'record',
        'format': 'json',
        'returnFormat': 'json',
        'fields[0]': 'record_id',
        'fields[1]': 'ic',
        'events[0]': 'your_baseline_event_arm_1',
        'rawOrLabel': 'raw',
        'exportDataAccessGroups': 'true',
    },
    timeout=15,
)
print(r.status_code, r.json()[:3])
"
```

A `200` response with a list of records confirms the token and event name are correct.

---

## How Patient Import Works

### Consent gate

Only participants with `ic = 1` in the REDCap Eligibility instrument are importable. The platform checks this at two points:

1. When listing available candidates (`GET /api/redcap/available-patients/`) — non-consented rows are silently excluded before the list is returned to the UI.
2. When importing a specific participant (`POST /api/redcap/import-patient/`) — consent is re-verified server-side before any account is created. A `403` is returned if `ic != 1`.

This means a therapist will never see or be able to import a participant who has not signed the informed consent form.

### DAG access control

REDCap Data Access Groups restrict which records a therapist can import. A therapist can only import participants whose REDCap DAG matches one of the DAGs derived from their assigned clinics. The mapping is defined in `config.json → clinic_dag`.

Example: a therapist assigned to `"Inselspital"` has DAG `"inselspital"`. They can only import records where `redcap_data_access_group = "inselspital"`.

### Import flow (step by step)

1. Therapist opens the import panel in the UI and selects a project.
2. UI calls `GET /api/redcap/available-patients/?project=COPAIN`.
3. Backend fetches `record_id`, `pat_id`, and `ic` from REDCap for the baseline event.
4. Rows are filtered: non-consented removed, DAG-restricted to the therapist's clinics, already-imported participants removed.
5. The filtered list is returned to the UI as import candidates.
6. Therapist selects a participant, sets a password, and clicks import.
7. UI calls `POST /api/redcap/import-patient/` with `project`, `patient_code` (the identifier), and `password`.
8. Backend re-fetches the participant's record from REDCap, re-checks consent and DAG, then creates a `User` and `Patient` document. The patient's `clinic` field is derived from the DAG value via `clinic_dag`.
9. An import log entry (`action = "REDCAP_IMPORT"`) is written for audit purposes.

---

## How Wearables Sync Works

A Celery beat task runs periodically and writes Fitbit data back into REDCap for every patient who has a `project` field set and a completed `reha_end_date`.

The task selects the best monitoring week in each period (highest wear time), averages the Fitbit metrics, and writes them to the REDCap Wearables instrument. After writing, the form status is set to `wearables_complete = 1` (Unverified) so that a researcher can review and mark it complete.

For the full field mapping, period definitions, and per-project sleep format differences, see [`wearables_redcap_sync.md`](./wearables_redcap_sync.md).

---

## Troubleshooting

### No candidates appear in the import list

- Check that `REDCAP_TOKEN_<PROJECT>` is set and not empty: `docker exec django printenv | grep REDCAP_TOKEN`.
- Verify that the clinic has the project listed under `clinic_projects` in `config.json`, and that the therapist is assigned to that clinic.
- Confirm that participants have `ic = 1` in REDCap. Records with `ic = 0` or blank are intentionally hidden.
- Check that the participant's DAG in REDCap matches the `clinic_dag` value for the therapist's clinic.

### `403 Forbidden` on import

The most common causes:

| Cause | Fix |
|---|---|
| `ic` is not `1` in REDCap | Wait until the participant has signed the consent form |
| Participant's DAG is not in the therapist's allowed set | Assign the therapist to the correct clinic, or correct the DAG in REDCap |
| Project is not in `therapist.projects` | Add the project to the therapist's profile |

### `502` on import

The second REDCap lookup (fallback by `pat_id`) failed. Check that the REDCap API is reachable from the server and that the token has Export rights.

### Token accepted but wrong records returned

Check the event name. The platform requests records for the baseline event only. If your project uses a non-standard event name, set `REDCAP_WEARABLES_EVENT_BASELINE` / `REDCAP_WEARABLES_EVENT_FOLLOWUP` to match.

### Wearables not appearing in REDCap

- The Celery beat task must be running: `docker compose ps celery-beat`.
- The patient must have `reha_end_date` set on their profile.
- The API token must have **Import** rights (not just Export).
- Check Celery logs: `docker compose logs celery | grep -i redcap`.

---

## Security Notes

- API tokens are read from environment variables at runtime and are never stored in the database or logged.
- The platform never exposes a raw token to the browser; all REDCap calls are server-side only.
- The `ENFORCE_REDCAP_ONLY_PATIENT_CREATION` flag prevents therapists from bypassing the REDCap import flow by calling the registration endpoint directly. Enable it for study deployments.
- Import actions are audit-logged in the `Logs` collection with `action = "REDCAP_IMPORT"` and the therapist's ID.
