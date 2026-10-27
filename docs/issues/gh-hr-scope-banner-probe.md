# fix: clear HR-scope banner immediately after reconnect, not after next Celery sync

## Problem

After a patient reconnects Google Health, the "Heart rate data unavailable — please reconnect"
banner continues showing for up to 4 hours (until the next Celery sync runs).

`google_health_status` determines `hr_scope_ok` entirely from **stored** `GoogleHealthData`
records. All historical records still have `wear_time_minutes = 0` (from before the scope was
granted), so the heuristic returns `false` even though the new token has the correct scope.
The patient sees the reconnect button, presses it, is told to reconnect again — a frustrating
loop.

Root cause confirmed on patient 901-62 (2026-10-27):
- Connection made without `health_metrics_and_measurements` scope → 14 days of `wear_time = 0`
  despite resting HR being present (`resting_heart_rate` comes from `daily-resting-heart-rate`,
  covered by the `activity_and_fitness` scope — which was granted)
- Reconnect at 09:56 UTC granted all scopes → next sync wrote `wear_time = 45 min` for today
- Banner would have cleared only after that day's sync + next status poll (up to 4 hours)

## Fix

Add a **live probe** to `google_health_status` (`backend/core/views/google_health_view.py`).
When the stored-data heuristic evaluates to `hr_scope_ok = false`, make one lightweight
`time-in-heart-rate-zone` dailyRollUp request for yesterday:

| Probe result | Meaning | Action |
|---|---|---|
| HTTP 200 | Scope granted (data may still be absent) | `hr_scope_ok = true` — banner clears immediately |
| HTTP 403 / 401 | Scope truly missing | `hr_scope_ok = false` — banner stays, reconnect needed |
| Network error | Indeterminate | `hr_scope_ok = null` — no banner change |

This replaces the up-to-4-hour delay with an immediate signal after reconnect.

### Secondary improvement: `hr_data_missing` field

When the probe returns 200 but stored data still shows `wear_time = 0`, the scope is fine but
Fitbit is not syncing HR data to Health Connect (a device-side issue). A new `hr_data_missing`
field in the status response triggers a different banner message that does NOT show a reconnect
button and instead guides the patient to check Health Connect permissions in Android Settings.

## Changes

- **`backend/core/views/google_health_view.py`**
  - New `_probe_hr_scope(access_token) → bool | None` helper
  - `google_health_status()`: calls probe when stored heuristic is `false`; adds `hr_data_missing` to response

- **`frontend/src/stores/patientFitbitStore.ts`**
  - New `hrDataMissing: boolean | null` observable, set from `ghData.hr_data_missing`

- **`frontend/src/components/PatientPage/ReconnectBanner.tsx`**
  - `hrDataMissing` banner variant: shows sync-guidance text, no reconnect button

- **`frontend/src/assets/lang/{en,de,fr,it,nl,pt}.json`**
  - New keys `hrSyncBannerTitle`, `hrSyncBannerReason`

## Acceptance criteria

- [ ] After a patient reconnects GH with all scopes, the banner disappears on the next status
      check (no waiting for Celery sync)
- [ ] A token that genuinely lacks `health_metrics_and_measurements` scope still shows the
      reconnect banner
- [ ] When scope is granted but Fitbit is not syncing HR, the banner shows sync guidance
      (no reconnect button)
- [ ] Patients with `wear_time > 0` in recent history: probe not called, both fields null,
      no banner shown
