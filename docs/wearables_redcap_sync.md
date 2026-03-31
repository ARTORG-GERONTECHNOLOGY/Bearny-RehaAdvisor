# Wearables → REDCap Sync

Automatically exports Fitbit wearables data (steps, activity, inactivity, sleep) from the platform into the REDCap **Wearables** instrument for COPAIN and COMPASS patients.

---

## Overview

For each patient the pipeline:

1. Identifies two monitoring periods (baseline + follow-up) using the patient's rehab dates
2. Within each period selects the ISO week with the **highest total wear time** (`wear_time_minutes`)
3. Averages the Fitbit metrics across that week
4. Writes the record into REDCap via the API, then marks the form as **Unverified** (`wearables_complete = 1`) for researcher review

---

## Period definitions

| Period | Start | End |
|---|---|---|
| **Baseline** | `reha_end_date` | `reha_end_date + 4 weeks` |
| **Follow-up** | `study_end_date − 4 weeks` | `study_end_date` |

If `study_end_date` is not set, the system defaults to `reha_end_date + 26 weeks` (≈ 6 months).

A patient is skipped silently if:
- `reha_end_date` is not set (no baseline anchor)
- No Fitbit data exists in the period (result = `"skipped"`)

---

## REDCap field mapping

| REDCap field | Source | Notes |
|---|---|---|
| `monitoring_start` | Best week's first day | `DD-MM-YYYY` (date_dmy) |
| `monitoring_end` | Best week's last day | `DD-MM-YYYY` (date_dmy) |
| `monitoring_days` | Record count in best week | integer |
| `fitbit_pa` | avg `active_minutes` | Active Zone Minutes (moderate×1 + vigorous×2) |
| `fitbit_inactivity` | avg `inactivity_minutes` | minutes/day |
| `fitbit_steps` | avg `steps` | steps/day |
| `sleep_duration` | avg sleep from `SleepData.sleep_duration` | format varies by project (see below) |
| `wearables_complete` | always `"1"` | Unverified — researcher marks Complete |

### `sleep_duration` format per project

| Project | REDCap type | Format written | Example |
|---|---|---|---|
| COMPASS | `text (integer, Max: 24)` | Integer hours | `8` |
| COPAIN | `text (time, Max: 23:59)` | `HH:MM` | `07:30` |

---

## REDCap event names

The wearables instrument appears in two events per project:

| Project | Baseline event | Follow-up event |
|---|---|---|
| **COMPASS** | `visit_baseline_arm_1` | `visit_6m_arm_1` |
| **COPAIN** | `t0_at_disch_arm_1` | `t2_six_months_afte_arm_1` |

These defaults are hard-coded in `_PROJECT_CONFIG` inside
`backend/core/services/wearables_redcap_service.py`.

### Overriding event names

**Per environment** (applies to all patients in that deployment):
```bash
REDCAP_WEARABLES_EVENT_BASELINE=visit_baseline_arm_1
REDCAP_WEARABLES_EVENT_FOLLOWUP=visit_6m_arm_1
```

**Per API call** (one-off or scripted):
```json
POST /api/wearables/sync-to-redcap/<patient_id>/
{
  "event_baseline": "visit_baseline_arm_1",
  "event_followup":  "visit_6m_arm_1"
}
```

Priority order: **API body argument > env var > per-project default**.

---

## Prerequisites

1. The patient must have `reha_end_date` set in the platform
2. The patient must have a `project` field set (`COPAIN` or `COMPASS`)
3. The REDCap API token must have **Data Import/Update** permission enabled
   (ask the REDCap admin to tick the box on the token page)
4. The environment must have the correct token variable set:
   ```
   REDCAP_TOKEN_COMPASS=<token>
   REDCAP_TOKEN_COPAIN=<token>
   ```

---

## Manual trigger (therapist UI)

Open the **Patient popup** for any patient that has a REDCap project assigned.
The **"Sync Wearables"** button appears in the footer (view mode only, not while editing).

- The button is disabled while a sync is in progress
- On success a green alert shows the per-period result (`ok` / `skipped`)
- On failure a red alert shows the error message

---

## Manual trigger (API)

```bash
curl -X POST https://<host>/api/wearables/sync-to-redcap/<patient_id>/ \
     -H "Authorization: Bearer <jwt>" \
     -H "Content-Type: application/json" \
     -d '{}'
```

Example success response:
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
  }
}
```

Possible error responses:

| Status | Cause |
|---|---|
| 400 | Patient has no `reha_end_date`, or no `project` set |
| 404 | `patient_id` not found |
| 502 | REDCap API rejected the write (check `detail` field for the REDCap error message) |

---

## Automatic nightly sync (Celery)

The task `core.tasks.sync_wearables_to_redcap_all` runs every night at **02:30 UTC**.

It queries all patients where `project != ""` and `reha_end_date != null`, then calls
`export_wearables_to_redcap` for each one. Patients with no data in a period produce
`"skipped"` results; patients that raise errors are logged as warnings and do not block
the rest of the run.

To trigger the nightly task manually (from a Django shell or Celery worker):
```python
from core.tasks import sync_wearables_to_redcap_all
sync_wearables_to_redcap_all.delay()
```

To trigger for a single patient:
```python
from core.tasks import sync_wearables_to_redcap_patient
sync_wearables_to_redcap_patient.delay("<patient_mongo_id>")
```

---

## Code locations

| File | Purpose |
|---|---|
| `backend/core/services/wearables_redcap_service.py` | Core logic: period selection, averaging, REDCap write |
| `backend/core/views/wearables_redcap_view.py` | Manual trigger API endpoint |
| `backend/core/tasks.py` | `sync_wearables_to_redcap_patient` and `sync_wearables_to_redcap_all` Celery tasks |
| `backend/api/settings/base.py` | Celery beat schedule (02:30 UTC daily) |
| `frontend/src/stores/patientPopupStore.ts` | `syncWearablesToRedcap()` MobX action |
| `frontend/src/components/TherapistPatientPage/PatientPopup.tsx` | "Sync Wearables" button and result display |
| `backend/tests/wearables_redcap/` | Test suite (46 tests) |

---

## Adding a new project

1. Add the project to `_PROJECT_CONFIG` in `wearables_redcap_service.py`:
   ```python
   "NEWPROJECT": {
       "baseline": "baseline_event_arm_1",
       "followup":  "followup_event_arm_1",
       "sleep_duration_format": "hours_int",  # or "hhmm"
   },
   ```
2. Verify the `sleep_duration` field type in the REDCap data dictionary:
   - `text (integer, Max: 24)` → use `"hours_int"`
   - `text (time, Max: 23:59)` → use `"hhmm"`
3. Add `REDCAP_TOKEN_NEWPROJECT=<token>` to the environment
