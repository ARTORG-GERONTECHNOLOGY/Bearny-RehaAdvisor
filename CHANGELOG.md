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

## [0.0.0] - 2026-04-24

### Added
- Initial project changelog at repository root.
