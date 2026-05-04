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
- The REDCap project must have the `ic` field (informed consent) on the Eligibility instrument. Only participants where `ic = 1` can be imported.

---

## Environment Variables

Set these in the `.env` file loaded by your Docker Compose stack (`.env.dev` for development, `.env.prod` for production).

### Core REDCap connection

| Variable | Required | Example | Description |
|---|---|---|---|
| `REDCAP_API_URL` | Yes | `https://redcap.unibe.ch/api/` | Full URL to the REDCap API endpoint, including the trailing slash. All projects share this URL. |
| `REDCAP_TOKEN_<PROJECT>` | Yes, per project | `REDCAP_TOKEN_COPAIN=abc123` | API token for the named project. Replace `<PROJECT>` with the uppercase project name exactly as it appears in `config.json` (e.g. `COPAIN`, `COMPASS`). Add one variable per project. |

### Optional compliance mode

| Variable | Default | Example | Description |
|---|---|---|---|
| `ENFORCE_REDCAP_ONLY_PATIENT_CREATION` | *(unset / off)* | `1` | When set to `1`, `true`, or `yes`, the patient registration endpoint rejects any account creation that does not come through the REDCap import flow. Enable this for study deployments where no manual patient creation should be allowed. |

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
  // Maps each clinic name to the projects it participates in.
  // A therapist assigned to a clinic can only see records for those projects.
  "clinic_projects": {
    "Inselspital":       ["COPAIN", "COMPASS"],
    "Berner Reha Centrum": ["COPAIN"],
    "Bern":              ["COMPASS"],
    "Leuven":            ["COMPASS"]
  },

  // Maps each clinic name to its REDCap Data Access Group (DAG) identifier.
  // The value must match the DAG slug that REDCap returns in the
  // `redcap_data_access_group` field of a flat export.
  // If the REDCap project uses abbreviations (e.g. "brz" instead of
  // "berner_reha_centrum"), use the abbreviation here.
  "clinic_dag": {
    "Inselspital":       "inselspital",
    "Berner Reha Centrum": "brz",
    "Bern":              "bern",
    "Leuven":            "leuven"
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
        'rawOrLabel': 'raw',
        'exportDataAccessGroups': 'true',
    },
    timeout=15,
)
print(r.status_code, r.json()[:3])
"
```

A `200` response with a list of records confirms the token is correct. Each row should include a `redcap_data_access_group` value — compare this against the values in `clinic_dag` to confirm the mapping is right.

---

## How Patient Import Works

### Consent gate

Only participants with `ic = 1` in the REDCap Eligibility instrument are importable. The platform checks this at two points:

1. When listing available candidates (`GET /api/redcap/available-patients/`) — non-consented rows are silently excluded before the list is returned to the UI.
2. When importing a specific participant (`POST /api/redcap/import-patient/`) — consent is re-verified server-side before any account is created. A `403` is returned if `ic != 1`.

This means a therapist will never see or be able to import a participant who has not signed the informed consent form.

### DAG access control

REDCap Data Access Groups restrict which records a therapist can import. The platform compares each record's `redcap_data_access_group` against the DAGs derived from the therapist's assigned clinics via `config.json → clinic_dag`.

**DAG name mismatch handling**: Some REDCap projects use abbreviated DAG names (e.g. COPAIN uses `brz` and `neuro`) that don't match the strings configured in `clinic_dag`. The platform detects this automatically: if none of the records returned by a project's export carry a DAG name that appears anywhere in the `clinic_dag` config, the DAG filter is skipped for that project and all consented, not-yet-imported records are shown. When records do use configured DAG names (e.g. COMPASS with `leuven`, `bern`), the filter is applied normally. The correct fix is always to update `clinic_dag` to match whatever REDCap actually returns.

**No-clinic fallback**: If a therapist has the project in their `projects` list but none of their clinics map to a DAG for that project, the DAG filter is not applied (rather than blocking all records). Project-level access is already gated by the `projects` list.

### REDCap field fallback

The export requests `record_id`, `pat_id`, and `ic`. If a project does not have a `pat_id` field, REDCap returns a `400` error. The platform automatically strips the invalid field and retries — both COPAIN and COMPASS lack `pat_id` in the current REDCap setup, so the retry with just `record_id` and `ic` is the normal path.

### Already-imported detection

To prevent duplicate imports, the platform checks two sources before adding a record to the candidate list:

1. `Patient.redcap_identifier` scoped to the same `redcap_project` — used for patients imported after the `redcap_*` metadata fields were added to the model.
2. `Patient.patient_code` scoped to the same `project` — fallback for older records. The scope prevents cross-project false positives (a COMPASS patient with `patient_code="2"` does not block a COPAIN record with `record_id="2"`).

### REDCap metadata stored on import

When a patient is imported the following fields are written to the `Patient` document in addition to the standard profile fields:

| Patient field | Source |
|---|---|
| `redcap_project` | project name (e.g. `"COPAIN"`) |
| `redcap_identifier` | `pat_id` if present, else `record_id` |
| `redcap_record_id` | raw `record_id` from REDCap |
| `redcap_pat_id` | raw `pat_id` from REDCap (empty string if project has none) |
| `redcap_dag` | `redcap_data_access_group` from REDCap |
| `project` | same as `redcap_project` (used for access control) |
| `clinic` | resolved from `redcap_dag` via the reverse `clinic_dag` mapping |

### Import flow (step by step)

1. Therapist opens the import panel and selects a project.
2. UI calls `GET /api/redcap/available-patients/?project=COPAIN`.
3. Backend fetches `record_id`, `pat_id` (if the project has it), and `ic` from REDCap.
4. Rows are filtered: non-consented removed, DAG-restricted to the therapist's clinics (unless mismatch detected), already-imported participants removed.
5. The filtered list is returned to the UI as import candidates.
6. Therapist selects a participant, sets a temporary password, and clicks import.
7. UI calls `POST /api/redcap/import-patient/` with `project`, `patient_code` (the identifier), and `password`.
8. Backend re-fetches the participant's record from REDCap, re-checks consent and DAG, then creates a `User` and `Patient` document. The patient's `clinic` is derived from the DAG value via `clinic_dag`.
9. An audit log entry (`action = "REDCAP_IMPORT"`) is written.

---

## How Wearables Sync Works

A Celery beat task runs periodically and writes Fitbit data back into REDCap for every patient who has a `project` field set and a completed `reha_end_date`.

The task selects the best monitoring week in each period (highest wear time), averages the Fitbit metrics, and writes them to the REDCap Wearables instrument. After writing, the form status is set to `wearables_complete = 1` (Unverified) so a researcher can review and mark it complete.

For the full field mapping, period definitions, and per-project sleep format differences, see [`wearables_redcap_sync.md`](./wearables_redcap_sync.md).

---

## Troubleshooting

### No candidates appear in the import list

Work through these checks in order:

1. **Token missing or wrong**
   ```bash
   docker exec django printenv | grep REDCAP_TOKEN
   ```
   Each project needs its own variable (e.g. `REDCAP_TOKEN_COPAIN`).

2. **Therapist not assigned to a clinic that participates in the project**
   Check `clinic_projects` in `config.json` and the therapist's `clinics` field in the database.

3. **No consented participants** — records with `ic = 0` or blank `ic` are intentionally hidden. Confirm participants have `ic = 1` in REDCap.

4. **DAG name mismatch** — the platform logs a warning when this is detected:
   ```
   [redcap] project=COPAIN DAG names in export don't match config — skipping DAG filter
   ```
   If you see this, the values in `config.json → clinic_dag` don't match what REDCap returns in `redcap_data_access_group`. Update the config to use the actual REDCap DAG slugs. You can check what REDCap returns by running the verification command above and inspecting the `redcap_data_access_group` field in the output.

5. **Enable debug logging** to trace exactly where records are dropped:
   Set `DJANGO_LOG_LEVEL=DEBUG` and re-trigger the request. The log will show:
   ```
   [redcap] project=X rows_from_redcap=N
   [redcap] project=X allowed_dags=... rows_after_dag_filter=N
   [redcap] project=X existing_ids_count=N
   [redcap] project=X record_id=Y skipped: no consent (ic='')
   [redcap] project=X identifier=Z skipped: already imported
   ```

### `403 Forbidden` on import

| Cause | Fix |
|---|---|
| `ic` is not `1` in REDCap | Wait until the participant has signed the consent form |
| Participant's DAG is not in the therapist's allowed set | Assign the therapist to the correct clinic, or correct the `clinic_dag` mapping |
| Project is not in `therapist.projects` | Add the project to the therapist's profile |

### `502` on import

The second REDCap lookup (fallback by `pat_id`) failed. Check that the REDCap API is reachable from the server and that the token has Export rights.

### Token accepted but wrong records returned

Check the event name. The platform requests records for all events in a flat export. Consent (`ic`) is expected in the baseline event. If your project uses a non-standard event name, set `REDCAP_WEARABLES_EVENT_BASELINE` / `REDCAP_WEARABLES_EVENT_FOLLOWUP` to match.

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
