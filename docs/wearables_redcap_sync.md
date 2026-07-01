# Wearables → REDCap Sync

Automatically exports Fitbit wearables data (steps, activity, inactivity, sleep) from the platform into the REDCap **Wearables** instrument for COPAIN and COMPASS patients.

---

## Overview

For each patient the pipeline:

1. Finds the **first Fitbit measurement date** (the earliest day any data was recorded)
2. Computes two **fixed monitoring windows** relative to that date (baseline: Day 8–28; follow-up: Day 150–180)
3. Within each window, identifies **valid** activity days (≥ 10 h wear time) and sleep nights (≥ 3 h sleep) — independently
4. Selects the **earliest** valid days: up to 5 weekdays + 2 weekend days per window
5. Computes **means** over the selected days
6. Writes the record into REDCap via the API and marks the form as **Unverified** (`wearables_complete = 1`) for researcher review

---

## Monitoring windows

Both windows are anchored to the **first Fitbit measurement date** (Day 1 = date of the first stored `FitbitData` record), not to `reha_end_date`.

| Period | REDCap event | Start | End | Rationale |
|---|---|---|---|---|
| **Baseline** | `visit_baseline` | Day 8 | Day 28 | First 7 days excluded — device habituation period |
| **Follow-up** | `visit_6m` | Day 150 | Day 180 | Approx. 6-month mark |

`monitoring_start` and `monitoring_end` in REDCap always reflect these **window boundaries**, not the dates of the earliest and latest data points within the window.

**Example:** First Fitbit measurement = 2025-01-01

| | Start | End |
|---|---|---|
| Baseline | 2025-01-08 (Day 8) | 2025-01-28 (Day 28) |
| Follow-up | 2025-05-30 (Day 150) | 2025-06-29 (Day 180) |

---

## Valid day / night definitions

Activity and sleep are processed **independently**. A day can qualify for one without qualifying for the other.

### Valid activity day

A calendar day is valid for activity aggregation if:

```
wear_time_minutes >= 600   (10 hours of device wear)
```

Days where the device was not worn or worn less than 10 hours are excluded from activity means. This prevents zero-activity days (e.g. before device activation) from diluting the average.

### Valid sleep night

A calendar night is valid for sleep aggregation if:

```
minutes_asleep >= 180   (3 hours of recorded sleep)
```

Falls back to `sleep_duration_ms / 60 000` for older records where `minutes_asleep` is absent.

---

## Day selection

Within each monitoring window, valid days are sorted chronologically and greedily selected:

| Type | Target | Maximum |
|---|---|---|
| Weekdays (Mon–Fri) | 5 | 5 |
| Weekend days (Sat–Sun) | 2 | 2 |
| **Total** | **7** | **7** |

If fewer valid days exist, all available valid days are used. Selected days do not need to be consecutive.

The same selection logic applies independently to sleep nights.

---

## REDCap field mapping

| REDCap field | Source | Notes |
|---|---|---|
| `monitoring_start` | Window start (Day 8 or Day 150) | `YYYY-MM-DD` |
| `monitoring_end` | Window end (Day 28 or Day 180) | `YYYY-MM-DD` |
| `valid_week_days` | Count of selected valid weekday activity days | integer, max 5 |
| `valid_weekend_days` | Count of selected valid weekend activity days | integer, max 2 |
| `valid_week_nights` | Count of selected valid weekday sleep nights | integer, max 5 |
| `valid_weekend_nights` | Count of selected valid weekend sleep nights | integer, max 2 |
| `fitbit_pa` | Mean `active_minutes` over selected activity days | Active Zone Minutes: moderate × 1 + vigorous × 2 |
| `fitbit_inactivity` | Mean `inactivity_minutes` over selected activity days | minutes/day |
| `fitbit_steps` | Mean `steps` over selected activity days | steps/day |
| `sleep_duration` | Mean sleep duration over selected sleep nights | format varies by project (see below) |
| `sleep_score` | Not yet available | Reserved as `None`; Fitbit and Google Health REST APIs do not expose sleep score for standard OAuth apps |
| `wearables_complete` | Always `"1"` | Unverified — researcher marks Complete after review |

### `sleep_duration` format per project

| Project | REDCap type | Format written | Example |
|---|---|---|---|
| COMPASS | `text (integer, Max: 24)` | Integer hours (rounded) | `8` |
| COPAIN | `text (time, Max: 23:59)` | `HH:MM` | `07:30` |

---

## Duplicate protection

By default (`skip_if_populated=True`), if `monitoring_start` is already populated in REDCap for a given event, that period is **skipped**. This prevents the nightly Celery run from overwriting previously reviewed data.

The manual "Sync Wearables" button in the UI respects the same default.

To force a recalculation (e.g. after correcting Fitbit data), use the API with `force=true` (see [Manual trigger (API)](#manual-trigger-api) below) or call `export_wearables_to_redcap(patient, skip_if_populated=False)` directly.

### Interpreting results

| Result | Meaning |
|---|---|
| `ok` | Valid days found in window; record exported to REDCap |
| `skipped` | No valid Fitbit data in window, OR event already populated and `skip_if_populated=True` |
| `error: ...` | REDCap API rejected the write; details in the error string |

---

## REDCap event names

| Project | Baseline event | Follow-up event |
|---|---|---|
| **COMPASS** | `visit_baseline_arm_1` | `visit_6m_arm_1` |
| **COPAIN** | `t0_at_disch_arm_1` | `t2_six_months_afte_arm_1` |

These defaults are set in `_PROJECT_CONFIG` in `backend/core/services/wearables_redcap_service.py`.

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

Priority: **API body argument > env var > per-project default**.

---

## Prerequisites

1. The patient must have at least one `FitbitData` record (the first date anchors both windows)
2. The patient must have a `project` field set (`COPAIN` or `COMPASS`)
3. The REDCap API token must have **Data Import/Update** permission
4. The environment must have the correct token variable set:
   ```
   REDCAP_TOKEN_COMPASS=<token>
   REDCAP_TOKEN_COPAIN=<token>
   ```

> **Note:** `reha_end_date` is no longer required for window calculation. It was previously used as the baseline anchor but the algorithm now uses the first Fitbit measurement date instead.

---

## Manual trigger (therapist UI)

Open the **Information** tab on the patient detail page for any patient that has a REDCap project assigned. The **"Sync Wearables"** button appears in the footer (view mode only, not while editing).

- The button is disabled while a sync is in progress
- On success a green alert shows the per-period result (`ok` / `skipped`) and the payload sent to REDCap
- On failure a red alert shows the error message

---

## Manual trigger (API)

```bash
curl -X POST https://<host>/api/wearables/sync-to-redcap/<patient_id>/ \
     -H "Authorization: Bearer <jwt>" \
     -H "Content-Type: application/json" \
     -d '{}'
```

To force recalculation even if already populated:
```bash
curl -X POST https://<host>/api/wearables/sync-to-redcap/<patient_id>/ \
     -H "Authorization: Bearer <jwt>" \
     -H "Content-Type: application/json" \
     -d '{"force": true}'
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
      "monitoring_start": "2025-01-08",
      "monitoring_end":   "2025-01-28",
      "valid_week_days":    5,
      "valid_weekend_days": 2,
      "valid_week_nights":  4,
      "valid_weekend_nights": 2,
      "fitbit_steps":       8432,
      "fitbit_pa":          38,
      "fitbit_inactivity":  820,
      "sleep_duration":     "07:22"
    },
    "followup": null
  },
  "sent_payloads": {
    "baseline": {
      "status": "sent",
      "record": {
        "record_id":            "934-1",
        "monitoring_start":     "2025-01-08",
        "monitoring_end":       "2025-01-28",
        "valid_week_days":      "5",
        "valid_weekend_days":   "2",
        "valid_week_nights":    "4",
        "valid_weekend_nights": "2",
        "fitbit_steps":         "8432",
        "fitbit_pa":            "38",
        "fitbit_inactivity":    "820",
        "sleep_duration":       "07:22",
        "wearables_complete":   "1",
        "redcap_event_name":    "visit_baseline_arm_1"
      }
    },
    "followup": {
      "status": "skipped",
      "reason": "no_fitbit_data_in_period"
    }
  }
}
```

Possible error responses:

| Status | Cause |
|---|---|
| 400 | Patient has no Fitbit data yet, or no `project` set |
| 404 | `patient_id` not found |
| 502 | REDCap API rejected the write (check `detail` field) |

---

## Automatic nightly sync (Celery)

The task `core.tasks.sync_wearables_to_redcap_all` runs every night at **02:30 UTC**.

It queries all patients where `project != ""`, then calls `export_wearables_to_redcap` for each one. Patients with no Fitbit data, or whose monitoring windows have not yet been reached, produce `"skipped"` results. Patients that raise errors are logged as warnings and do not block the rest of the run.

Because `skip_if_populated=True` by default, patients whose baseline was already exported will not be re-exported on subsequent nights.

To trigger manually:
```python
from core.tasks import sync_wearables_to_redcap_all
sync_wearables_to_redcap_all.delay()

# Single patient
from core.tasks import sync_wearables_to_redcap_patient
sync_wearables_to_redcap_patient.delay("<patient_mongo_id>")
```

---

## Fitbit data availability

- A patient is skipped silently on the nightly run if they have no `FitbitData` records at all.
- If the device was not worn on a given day, that day will have `wear_time_minutes < 600` and is excluded from activity aggregation — it does not pull down the average to zero.
- If the baseline window has not yet elapsed (e.g. the patient is still in Day 1–7), the period returns `None` and is skipped.

---

## Code locations

| File | Purpose |
|---|---|
| [backend/core/services/wearables_redcap_service.py](../backend/core/services/wearables_redcap_service.py) | Core logic: window calculation, day selection, averaging, REDCap write |
| [backend/core/views/wearables_redcap_view.py](../backend/core/views/wearables_redcap_view.py) | Manual trigger API endpoint |
| [backend/core/tasks.py](../backend/core/tasks.py) | `sync_wearables_to_redcap_patient` and `sync_wearables_to_redcap_all` Celery tasks |
| [backend/api/settings/base.py](../backend/api/settings/base.py) | Celery beat schedule (02:30 UTC daily) |
| [frontend/src/stores/patientPopupStore.ts](../frontend/src/stores/patientPopupStore.ts) | `syncWearablesToRedcap()` MobX action |
| [frontend/src/components/TherapistPatientPage/PatientInfoContent.tsx](../frontend/src/components/TherapistPatientPage/PatientInfoContent.tsx) | "Sync Wearables" button and result display (Information tab) |
| [backend/tests/wearables_redcap/](../backend/tests/wearables_redcap/) | Test suite (66 tests) |

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
2. Choose `sleep_duration_format`:
   - `"hours_int"` — REDCap field is `text (integer, Max: 24)`
   - `"hhmm"` — REDCap field is `text (time, Max: 23:59)`
3. Add `REDCAP_TOKEN_NEWPROJECT=<token>` to the environment.
4. Ensure the REDCap Wearables instrument for the new project contains all required fields:
   `monitoring_start`, `monitoring_end`, `valid_week_days`, `valid_weekend_days`,
   `valid_week_nights`, `valid_weekend_nights`, `fitbit_steps`, `fitbit_pa`,
   `fitbit_inactivity`, `sleep_duration`, `wearables_complete`.

---

## Known limitations

- **`sleep_score`** — not available via Fitbit or Google Health REST APIs for standard OAuth apps. The field is reserved in the code (`None`) for future use.
- **Missing REDCap fields** — if a project's REDCap instrument does not contain a field (e.g. `valid_week_days` added later), the API returns a 400 error. The service automatically strips the offending field and retries once, so syncs are not fully blocked. Add the field to the instrument to resolve.
- **Monthly run cadence** — the current Celery schedule is nightly (02:30 UTC). The protocol calls for monthly processing; the nightly run is safe due to duplicate protection but slightly over-scheduled. Adjust `CELERY_BEAT_SCHEDULE` in `base.py` to change frequency.
