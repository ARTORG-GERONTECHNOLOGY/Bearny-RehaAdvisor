# fix: detect missing sleep.readonly scope and surface reconnect banner

## Problem

When a patient connects Google Health without granting the `sleep.readonly` scope, sleep and
breathing rate data are silently absent — no banner, no error, just null records accumulating
indefinitely. The coordinator has no way to know the scope is missing until they notice a data
gap, often weeks later.

Root cause confirmed on patient 905-42 (2026-10-27):
- 79 GoogleHealthData records, Aug 10 – Oct 27
- `steps` and `wear_time_minutes`: consistently present (both `activity_and_fitness` and
  `health_metrics_and_measurements` scopes working)
- `sleep`: **None for every single record** — the `sleep.readonly` scope was not granted
  when the patient originally authorised Google Health

The API returns a silent 403 for calls to `dataTypes/sleep/dataPoints`. The sync code logs
a warning and stores `sleep = None` with no patient-visible feedback.

**Secondary note — broken sleep sync window (Aug 10–20):** A code bug in `_fetch_sleep`
(AIP-160 filter on a data type that does not support filters) caused sleep to always be empty
regardless of scope between the initial GH launch (Jul 31) and the fix in commit `5c3e0d09`
(Aug 20). After that fix, the scope issue was the sole remaining blocker for this patient.

## Fix

Add a `_probe_sleep_scope(access_token) → bool | None` helper that makes a minimal
`GET dataTypes/sleep/dataPoints?pageSize=1` request:
- HTTP 200 → `sleep_scope_ok = True` (scope granted, backfill will happen on next sync)
- HTTP 403 → `sleep_scope_ok = False` (scope missing → show reconnect banner)
- Network error → `sleep_scope_ok = None` (no banner change)

This is called inside `google_health_status` only when stored records show no sleep data
for the last 7 active days — healthy patients (sleep data present) never trigger the probe.

This PR also adds the previously separate `_probe_hr_scope` and `hr_data_missing` logic from
the sibling branch (`fix/gh-hr-scope-banner-probe`), consolidating all scope-detection
improvements into one place on main.

## Changes

- `backend/core/views/google_health_view.py`
  - `_probe_hr_scope()` — live probe for `health_metrics_and_measurements` scope
  - `_probe_sleep_scope()` — live probe for `sleep.readonly` scope
  - `google_health_status()` — uses both probes; returns `hr_scope_ok`, `hr_data_missing`,
    `sleep_scope_ok`

- `frontend/src/stores/patientFitbitStore.ts`
  - `hrDataMissing`, `sleepScopeOk` observables

- `frontend/src/components/PatientPage/ReconnectBanner.tsx`
  - `sleepScopeMissing` banner variant (reconnect button shown)
  - `hrDataMissing` banner variant (no reconnect button — sync-guidance text)

- `frontend/src/assets/lang/{en,de,fr,it,nl,pt}.json`
  - `hrSyncBannerTitle`, `hrSyncBannerReason` — Fitbit → Health Connect sync guidance
  - `sleepScopeBannerTitle`, `sleepScopeBannerReason` — sleep scope reconnect prompt

## Acceptance criteria

- [ ] Patient with no sleep data in last 7 days + token lacking `sleep.readonly`:
      `sleep_scope_ok = false`, reconnect banner shown with sleep-specific message
- [ ] Patient who reconnects (scope now granted) but Celery hasn't synced yet:
      probe returns 200 → `sleep_scope_ok = true`, no banner
- [ ] Patient with sleep data present: probe not called, `sleep_scope_ok = null`, no banner
- [ ] HR scope logic unchanged: `hr_scope_ok` and `hr_data_missing` behave as before
