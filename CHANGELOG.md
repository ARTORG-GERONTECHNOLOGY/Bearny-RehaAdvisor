# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **COPAIN wearables sync always skipped**: the baseline monitoring window was `[reha_end, reha_end+4w]` for all projects. COPAIN collects Fitbit data during the in-hospital stay (before discharge), so every COPAIN patient got `no_fitbit_data_in_period` and REDCap remained empty. Fixed by introducing a per-project `baseline_anchor` config key: COPAIN now scans `[reha_end−4w, reha_end)`, COMPASS keeps `[reha_end, reha_end+4w)`.
- **Fitbit Active Zone Minutes always wrong**: both the on-demand sync (`fitbit_sync.py`) and the nightly batch command (`fetch_fitbit_data.py`) looked for `activities-activeZoneMinutes` / `value.totalMinutes` in the Fitbit API response. The correct keys are `activities-active-zone-minutes` / `value.activeZoneMinutes`. As a result, AZM was silently dropped on every sync and `active_minutes` was always computed from the fallback (`minutesVeryActive + minutesFairlyActive`), producing values that did not match the Fitbit app.
- **Sleep displayed as time-in-bed instead of actual sleep**: `_sleep_minutes()` in `fitbit_view.py` — and the inactivity calculation helpers in both sync files — used `sleep_duration` (total time in bed, ms) instead of `minutes_asleep` (actual sleep, matches Fitbit app). All three helpers now prefer `minutes_asleep`; fall back to `sleep_duration` for legacy records that lack `minutes_asleep`.

### Added
- **Every-4-hour Fitbit sync task** (`core.tasks.run_fetch_fitbit_data_today_all`): fetches today's data for every connected user every 4 hours so wearable data stays current even when patients do not open the Bearny app. The nightly 30-day backfill still runs to self-correct historical gaps. Run `python manage.py seed_periodic_tasks` after deployment to register the new schedule.

### Changed
- Open source governance baseline files at repository root:
  - `CODE_OF_CONDUCT.md`
  - `SECURITY.md`
  - `CONTRIBUTORS.md`
  - `CODEOWNERS`
- Canonical documentation entry points:
  - `docs/TESTING.md`
  - `docs/DEPLOYMENT.md`
  - `docs/CONTRIBUTING_QUICKSTART.md`
- Updated contribution and documentation indexes to point to canonical testing and deployment entry points.
- Updated pull request template language for RehaAdvisor and current contribution checks.

## [1.6.8] - 2026-09-24

### Added
- **Google Health `active_zone_minutes`**: `GoogleHealthData` model now stores fat-burn / cardio / peak AZM breakdown, matching `FitbitData` schema (#592).
- **Sync cadence parity**: both Fitbit and Google Health now share three fetch paths — every-4-hour today-sync (`run_fetch_fitbit_data_today_all` / `run_fetch_google_health_data_today_all`), nightly 30-day backfill, and on-OAuth-connect 365-day backfill (`backfill_fitbit_on_connect` / `backfill_google_health_on_connect`). Run `seed_periodic_tasks` after deploy to register the new schedules (#589).

### Fixed
- **Stale Fitbit `wear_time_minutes`** when sleep duration is zero: the inactivity/wear calculation no longer subtracts a null sleep from 1440 (#590).
- **CSV export `sleep_duration` units**: values were written as milliseconds; now written as minutes to match all other duration fields (#591).
- **Exercise shape normalisation**: CSV export and combined-history endpoint now handle both the list and `{"sessions": [...]}` exercise shapes (#591).
- **CodeQL stack-trace exposure** and workflow permissions hardened (#581).
- Minor correctness and consistency fixes across wearable views (#593).

---

## [1.6.7.2] - 2026-09-23

### Fixed
- Crash in wearable REDCap sync for patients with no baseline data (#588).

---

## [1.6.7.1] - 2026-09-23

### Fixed
- **Google Health `active_minutes` inflated** (~500 min/day): the active-minutes rollup summed all intensity levels including LIGHT. Fixed to sum MODERATE and VIGOROUS+ levels only, matching Fitbit's Active Zone Minutes definition (#587).
- **REDCap sync skipping all COPAIN patients**: baseline window was `[reha_end, reha_end+4w]` for all projects; COPAIN collects data *before* discharge so the window produced no results. Fixed with a per-project `baseline_anchor` config key — COPAIN now scans `[reha_end−4w, reha_end)` (#587).

---

## [1.6.7] - 2026-09-23

### Fixed
- **Wearable data routed to wrong model**: `fitbit_summary` and `fitbit_health_data` now route reads to `GoogleHealthData` for patients with `wearable_device=google_health` (#583).
- **`wearable_device` not set on Google Health connect**: OAuth callback now sets `patient.wearable_device = "google_health"` immediately (#584).
- **Fitbit Active Zone Minutes field name**: the correct Fitbit API key is `activities-active-zone-minutes` / `value.activeZoneMinutes` (was `activities-activeZoneMinutes` / `value.totalMinutes`). AZM was silently dropped on every sync (#585).
- **Exercise session names empty**: the Fitbit `activityName` field was renamed in the API; now tries `activityName` → `name` → `activityParentName` in order (#585).
- **REDCap wear-time filter too strict**: `_is_valid_activity_day` required `wear_time_minutes >= 600`; patients who connected before the `health_metrics_and_measurements` scope was added had `wear_time_minutes = None` for all historical days despite valid step counts. Added a steps-proxy fallback for `None` wear time (#585).

---

## [1.6.6] - 2026-09-23

### Fixed
- **Sleep displayed as time-in-bed**: `_sleep_minutes()` used `sleep_duration` (total time in bed, ms) instead of `minutes_asleep` (actual sleep). All three relevant helpers corrected (#582).
- **Sleep civil-date attribution**: multi-session nights now attribute the sleep record to the civil date of sleep *end*, not start. Fitbit records the main session end as the wakeup time (#582).
- **Rescheduling modal blocked when translation pending**: delete and reschedule modal could not be confirmed while a LibreTranslate request was in flight (#579).
- **Rating count wrong** in patient feedback summary (#572).

### Security
- Dockerfile base images upgraded to patch CVEs (#578).
- Removed `conda` `djongo` dependency that pulled in a vulnerable Django 3.0.3 (#577).
- Bumped `js-yaml`, `fflate`, `nanoid` to patched versions (#576).

---

## [1.6.5] - 2026-09-17

### Added
- **Google Health on-connect backfill**: after OAuth connect, a Celery task backfills up to 365 days of historical data asynchronously. Previously only a 30-day on-demand sync ran (#575).
- **REDCap wearables sync for Google Health patients**: `wearables_redcap_service` now reads `GoogleHealthData` and falls back to `FitbitData` — Google Health patients' activity data is included in nightly REDCap exports (#575).

---

## [0.0.0] - 2026-04-24

### Added
- Initial project changelog at repository root.
