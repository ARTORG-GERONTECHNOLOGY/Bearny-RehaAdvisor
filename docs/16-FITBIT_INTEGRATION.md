# Fitbit Integration — Technical Documentation

## Overview

The Fitbit integration allows patients to connect their Fitbit device to the platform. Once connected, activity, sleep, heart rate, and physiological data are fetched from the Fitbit Web API and stored in MongoDB. Therapists and the patient dashboard consume this data via REST endpoints.

---

## Architecture

```
Patient device (Fitbit)
        │
        ▼
Fitbit Web API (api.fitbit.com)
        │
   ┌────┴─────────────────────────────────────────┐
   │  Three fetch paths                            │
   │                                               │
   │  1. On-demand today (view layer)              │
   │     fitbit_summary view                       │
   │     → fetch_fitbit_today_for_user()           │
   │       (15-min cooldown guard)                 │
   │                                               │
   │  2. On-demand gap backfill (view layer)       │
   │     fitbit_summary view — gap detection       │
   │     → fetch_fitbit_date_range_for_user()      │
   │       (triggered when historical days missing)│
   │                                               │
   │  3. Scheduled (Celery)                        │
   │     run_fetch_fitbit_data task                │
   │     → fetch_fitbit_data command               │
   │       (30-day backfill, no cooldown)          │
   └────────────────┬─────────────────────────────┘
                    ▼
              MongoDB (FitbitData)
                    │
        ┌───────────┴────────────┐
        │ REST endpoints          │
        │  /api/fitbit/summary/   │
        │  /api/fitbit/health-data│
        │  /api/patients/health-  │
        │    combined-history/    │
        └────────────────────────┘
```

---

## OAuth 2.0 Connection Flow

Fitbit uses the **Authorization Code** OAuth 2.0 flow.

### Required environment variables

| Variable | Description |
|---|---|
| `FITBIT_CLIENT_ID` | OAuth app client ID from dev.fitbit.com |
| `FITBIT_CLIENT_SECRET` | OAuth app client secret |
| `FITBIT_REDIRECT_URI` | Must match exactly what is registered in the Fitbit app (e.g. `https://reha-advisor.ch/api/fitbit/callback/`) |

### Step-by-step

1. **Authorisation request** — The frontend redirects the patient to Fitbit's authorisation page. The `state` parameter carries the MongoDB `User._id` so the callback can identify the patient.

2. **Callback** — Fitbit redirects to `GET /api/fitbit/callback/?code=<auth_code>&state=<user_id>`.

3. **Token exchange** — The backend POSTs the `code` to `https://api.fitbit.com/oauth2/token` using HTTP Basic Auth (`client_id:client_secret`). On success, the access token, refresh token, expiry, and Fitbit user ID are upserted into `FitbitUserToken`.

4. **Redirect to frontend** — The callback always redirects to `{FRONTEND_URL}/patient?fitbit_status=<status>` where `status` is one of:

   | Value | Meaning |
   |---|---|
   | `connected` | Token saved successfully |
   | `error` | Token exchange failed |
   | `missing_code` | Fitbit did not return an authorisation code |
   | `unauthorized` | `state` parameter missing |
   | `invalid_user` | `state` did not resolve to a known user |

**Source:** [core/views/fitbit_view.py — `fitbit_callback`](../backend/core/views/fitbit_view.py)

---

## Data Models

### `FitbitUserToken` (one per user)

```
user            ReferenceField(User)  — unique
access_token    str (max 2048)
refresh_token   str (max 2048)
expires_at      datetime (UTC)
fitbit_user_id  str
last_fetched_at datetime (UTC)        — cooldown stamp; None = never fetched
```

**Source:** [core/models.py:57](../backend/core/models.py#L57)

### `FitbitData` (one document per user per day)

Unique on `(user, date)`. All numeric fields are `None` when not yet received.

| Field | Type | Source |
|---|---|---|
| `steps` | int | `activities/steps` |
| `floors` | int | `activities/floors` |
| `distance` | float (km) | `activities/distance` |
| `calories` | float | `activities/calories` |
| `active_minutes` | int | `activities-active-zone-minutes` → `value.activeZoneMinutes`; falls back to `minutesVeryActive + minutesFairlyActive` when the endpoint returns no data |
| `inactivity_minutes` | int | `1440 − (active_minutes + sleep_minutes)` |
| `resting_heart_rate` | int | `activities/heart` summary |
| `max_heart_rate` | int | Derived from intraday 1-sec HR dataset |
| `heart_rate_zones` | list[HeartRateZone] | `activities/heart` summary |
| `wear_time_minutes` | int \| None | Distinct minutes with HR > 0 in intraday dataset |
| `sleep` | SleepData | `sleep/date` endpoint |
| `breathing_rate` | dict | `br/date` endpoint |
| `hrv` | dict | `hrv/date` endpoint |
| `exercise` | dynamic | `activities/list.json` |
| `weight_kg` | float | Merged from `PatientVitals` |
| `bp_sys` / `bp_dia` | int | Merged from `PatientVitals` |

#### Embedded: `SleepData`

| Field | Notes |
|---|---|
| `sleep_duration` | Total time in bed in **milliseconds** (includes awake periods) |
| `minutes_asleep` | Actual sleep in minutes — matches Fitbit app display |
| `sleep_start` / `sleep_end` | ISO datetime strings |
| `awakenings` | Count of wake-ups |

**Source:** [core/models.py:114](../backend/core/models.py#L114)

---

## Token Refresh

`get_valid_access_token(user)` in [fitbit_sync.py](../backend/core/views/fitbit_sync.py) is called before every API request:

1. Load `FitbitUserToken` for the user.
2. If `expires_at ≤ now`, POST to `https://api.fitbit.com/oauth2/token` with `grant_type=refresh_token`.
3. On success, update `access_token`, `refresh_token`, `expires_at` in MongoDB.
4. On failure, raise — the caller logs the error and skips the user.

---

## Data Fetch: Three Paths

### 1. On-demand fetch (per page load)

**Entry point:** `fetch_fitbit_today_for_user(user, bypass_cooldown=False)`
**Source:** [core/views/fitbit_sync.py](../backend/core/views/fitbit_sync.py)

Called from `fitbit_summary` on every request. Fetches **today only** (single-day range). Makes ~13 Fitbit API calls per invocation:

| Endpoint | Data |
|---|---|
| `activities/steps/date` | Steps |
| `activities/floors/date` | Floors |
| `activities/distance/date` | Distance |
| `activities/calories/date` | Calories |
| `activities/minutesVeryActive/date` | Very active minutes |
| `activities/minutesFairlyActive/date` | Fairly active minutes |
| `activities/minutesLightlyActive/date` | Lightly active minutes |
| `activities/minutesSedentary/date` | Sedentary minutes |
| `activities/heart/date` | Resting HR + HR zones |
| `activities/active-zone-minutes/date` | Active Zone Minutes |
| `br/date` | Breathing rate |
| `hrv/date` | HRV |
| `activities/heart/date/1d/1sec` | Intraday HR (wear time + max HR) |
| `sleep/date` | Sleep |
| `activities/list.json` | Exercise sessions |

Results are upserted into `FitbitData` for today. Returns `1` if a row was written, `0` if no data was returned by Fitbit.

#### Rate-limit cooldown guard

The Fitbit API enforces ~150 requests per user per hour. With ~13 calls per fetch, a page refresh every few minutes quickly exhausts the quota (HTTP 429 `RESOURCE_EXHAUSTED`).

**Guard behaviour:**

- Before any API call, `FitbitUserToken.last_fetched_at` is checked.
- If `last_fetched_at` is within **15 minutes** of now, the function returns immediately with `0` — no API calls are made.
- `last_fetched_at` is stamped (and saved to MongoDB) **before** the first API call, so even a run that hits 429 errors resets the window.
- The cooldown constant is `FETCH_COOLDOWN_MINUTES = 15` at the top of `fitbit_sync.py`.

**Bypassing the cooldown:**

Pass `bypass_cooldown=True` to skip the check entirely. The Celery task `fetch_fitbit_data_async` always does this because it is scheduled and should not be blocked by the on-demand stamp.

```python
# View (applies cooldown)
fetch_fitbit_today_for_user(user)

# Celery task (bypasses cooldown)
fetch_fitbit_today_for_user(user, bypass_cooldown=True)
```

> **Timezone note:** MongoDB stores datetimes in UTC. When retrieved, MongoEngine may return a naive datetime. The guard converts naive timestamps with `.replace(tzinfo=datetime.timezone.utc)` — not `make_aware()` — to avoid local-timezone offsets silently disabling the cooldown in non-UTC deployments.

---

### 2. On-demand gap backfill (per page load)

**Entry point:** `fetch_fitbit_date_range_for_user(user, start_date, end_date)`
**Source:** [core/views/fitbit_sync.py](../backend/core/views/fitbit_sync.py)

Called from `fitbit_summary` whenever the requested view window has days missing from the DB. The gap detection runs **before** the main query response is built:

1. Determine the window: `start_date` to `yesterday` (today's data is handled by path 1).
2. Compare the set of dates already in `FitbitData` against the full expected set.
3. If any dates are missing, call `fetch_fitbit_date_range_for_user(user, min_missing, max_missing)`.
4. Re-query `FitbitData` so the response includes the freshly backfilled rows.

The entire block is wrapped in `try/except` — a failure here never breaks the view response.

**What this function fetches:**

Same series-level endpoints as `fetch_fitbit_today_for_user` (steps, floors, distance, calories, active minutes, resting HR, HR zones, AZM, breathing rate, HRV, sleep, exercise), fetched as date-range requests in **one call per metric** (not per day). In addition it makes **one intraday-HR request per day** to derive `max_heart_rate` and `wear_time_minutes`:

| Intraday endpoint | Fields derived |
|---|---|
| `activities/heart/date/{date}/1d/1sec` | `max_heart_rate` (peak HR value), `wear_time_minutes` (distinct minutes with HR > 0) |

The intraday fetch is **optional**. If the Fitbit app has not been granted "Read Fitbit Intraday Data" access at the developer console level, the endpoint returns 403. If the device was not worn that day, the dataset is empty. In either case, `max_heart_rate` and `wear_time_minutes` are simply omitted from the upsert for that day — the rest of the fields are still saved.

> **No cooldown guard.** Unlike `fetch_fitbit_today_for_user`, this function has no cooldown — it is only called when the DB actually has gaps, so it would block legitimate backfill unnecessarily if guarded.

---

### 3. Scheduled sync (Celery)

**Entry points:**

| Task name | Schedule | What it does |
|---|---|---|
| `core.tasks.run_fetch_fitbit_data_today_all` | Every 4 hours | Calls `fetch_fitbit_today_for_user` for every connected user; keeps data current even when patients do not open the app |
| `core.tasks.run_fetch_fitbit_data` | Nightly at 01:00 | Runs the `fetch_fitbit_data` management command — full 30-day backfill for all users |
| `core.tasks.fetch_fitbit_data_async` | Ad-hoc (after login) | Fetches today for a single user; always bypasses the 15-minute cooldown |

> **Why two scheduled tasks?** The 4-hour task keeps same-day data current without the expense of a 30-day backfill on every run. The nightly task self-corrects any gaps (e.g. a day where the device had not yet synced to Fitbit's servers when the 4-hour job ran).

Register both schedules with:
```bash
docker exec django python manage.py seed_periodic_tasks
```

**Management command:** `python manage.py fetch_fitbit_data`
**Source:** [core/management/commands/fetch_fitbit_data.py](../backend/core/management/commands/fetch_fitbit_data.py)

Iterates all `FitbitUserToken` documents and fetches the **last 30 days** for each user. Per-day intraday HR is fetched individually (30 separate requests per user) to derive `max_heart_rate` and `wear_time_minutes`. The command does **not** apply the 15-minute cooldown — it is designed for bulk backfill runs.

---

## REST Endpoints

All endpoints are prefixed with `/api/` and require an `Authorization: Bearer <jwt>` header.

### `GET /api/fitbit/status/<patient_id>/`

Returns whether the patient has a connected Fitbit and the date of the last stored data point.

**Response:**
```json
{
  "connected": true,
  "has_data": true,
  "last_data": "2026-05-04T08:00:00"
}
```

`patient_id` may be either a `Patient._id` or a `User._id`.

---

### `GET /api/fitbit/callback/`

OAuth callback. Not called by clients directly — Fitbit redirects here after user authorisation. Always responds with a 302 redirect to the frontend.

---

### `GET /api/fitbit/summary/<patient_id>/`

Main dashboard endpoint. On every request it:

1. Triggers an on-demand today-fetch via `fetch_fitbit_today_for_user` (subject to the 15-minute cooldown).
2. Checks for missing days in the requested window (`start` to yesterday). If any are absent from the DB, calls `fetch_fitbit_date_range_for_user` synchronously to backfill them before building the response.

This two-step approach ensures both same-day currency and correct historical data the first time a patient opens the dashboard after a gap (e.g. the nightly sync ran before the Fitbit device synced its data to Fitbit's servers).

**Query parameters:**

| Parameter | Default | Range | Description |
|---|---|---|---|
| `days` | `7` | 1–31 | Number of days to include in the period |

**Response shape:**
```json
{
  "connected": true,
  "thresholds": { "steps_goal": 10000, "active_minutes_green": 30, ... },
  "last_sync": "2026-05-04T08:00:00",
  "today": {
    "steps": 4200,
    "active_minutes": 22,
    "sleep_minutes": 420,
    "resting_heart_rate": 62,
    "bp_sys": null,
    "bp_dia": null,
    "weight_kg": null
  },
  "period": {
    "days": 7,
    "totals": { "steps": 29000, "active_minutes": 140, ... },
    "averages": { "steps": 4143, "active_minutes": 20, ... },
    "daily": [
      { "date": "2026-04-28T...", "steps": 3100, "active_minutes": 18, "sleep_minutes": 410, ... }
    ]
  }
}
```

Blood pressure and weight in `today` and `daily` are merged from `PatientVitals` when not present in `FitbitData`.

**Thresholds** are read from `patient.thresholds` (if set) and merged with backend defaults:

| Key | Default |
|---|---|
| `steps_goal` | 10 000 |
| `active_minutes_green` | 30 min |
| `active_minutes_yellow` | 20 min |
| `sleep_green_min` | 420 min (7 h) |
| `sleep_yellow_min` | 360 min (6 h) |
| `bp_sys_green_max` | 129 mmHg |
| `bp_sys_yellow_max` | 139 mmHg |
| `bp_dia_green_max` | 84 mmHg |
| `bp_dia_yellow_max` | 89 mmHg |

---

### `GET /api/fitbit/health-data/<patient_id>/`

Detailed day-by-day export including sleep, HR zones, and exercise sessions. No live Fitbit fetch — reads from MongoDB only.

**Query parameters:**

| Parameter | Default | Description |
|---|---|---|
| `from` | 30 days ago | Start date `YYYY-MM-DD` |
| `to` | today | End date `YYYY-MM-DD` |

**Response shape:**
```json
{
  "data": [
    {
      "date": "04.05.2026",
      "steps": 6200,
      "resting_heart_rate": 60,
      "floors": 8,
      "distance": 4.8,
      "calories": 2100,
      "active_minutes": 35,
      "breathing_rate": { "breathingRate": 14.2 },
      "hrv": { "dailyRmssd": 38.5 },
      "sleep": {
        "sleep_minutes": 480,
        "sleep_hours": 8.0,
        "minutes_asleep": 435,
        "sleep_start": "2026-05-03T23:00:00",
        "sleep_end": "2026-05-04T07:00:00",
        "awakenings": 2
      },
      "heart_rate_zones": [
        { "name": "Fat Burn", "minutes": 22, "min": 97, "max": 135, "range_str": "97-135 bpm", "caloriesOut": 180 }
      ],
      "exercise": {
        "sessions": [
          { "name": "Walk", "duration_min": 35, "duration_hr": 0.58, "calories": 210, "averageHeartRate": 112, "maxHeartRate": 140 }
        ]
      },
      "weight_kg": 72.5,
      "bp_sys": 122,
      "bp_dia": 78
    }
  ]
}
```

Dates are returned in European format (`DD.MM.YYYY`).  
`minutes_asleep` is the actual sleep time (matches the Fitbit app display). `sleep_minutes` in this endpoint is derived from `sleep_duration` (total time in bed, ms ÷ 60 000) for historical compatibility; prefer `minutes_asleep` for patient-facing display.

---

### `POST /api/fitbit/manual_steps/<patient_id>/`

Allows a therapist to manually record a step count for a given date (for patients without a device).

**Request body:**
```json
{ "date": "2026-05-04", "steps": 3500 }
```

**Response:**
```json
{ "success": true, "steps": 3500, "date": "2026-05-04" }
```

Upserts into `FitbitData(user, date)`. Does not touch any other field.

---

### `GET /api/patients/health-combined-history/<patient_id>/`

Returns Fitbit data, questionnaire responses, and intervention adherence in a single payload. Used by the researcher view and export tools.

**Query parameters:** `from`, `to` (both `YYYY-MM-DD`, default: last 30 days)

`PatientVitals` entries are merged into `FitbitData` documents (and saved back to MongoDB) so the combined response has a unified per-day object.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| No `FitbitUserToken` for user | `fetch_fitbit_today_for_user` returns `0`; view still renders with `connected: false` |
| Token refresh fails | Exception raised; logged at ERROR; fetch is aborted for that user |
| Individual Fitbit endpoint returns non-200 | Warning logged; that field is left `None`; other fields still fetched |
| Fitbit returns 429 | Warning logged per field; `last_fetched_at` already stamped → cooldown applies for the next 15 min |
| `fitbit_summary` raises an unhandled exception | Returns `{"error": "Internal Server Error"}` with HTTP 500 |

---

## Fitbit API Rate Limits

Fitbit enforces **150 API calls per user per hour** (as of the Personal tier).

Each call to `fetch_fitbit_today_for_user` makes ~13–15 API calls. The 15-minute cooldown limits on-demand fetches to at most **4 per hour (~60 calls)**. The every-4-hour scheduled task also respects the cooldown guard, so the two paths combined remain well within the quota. The nightly 30-day backfill command runs outside the cooldown.

If a user's quota is exhausted (HTTP 429), all subsequent fetches within the cooldown window are blocked automatically. The next permitted fetch attempt is ~15 minutes after the 429-triggering run.

---

## Bug History

### 2026-05-19 — Active Zone Minutes always wrong; sleep displayed as time-in-bed

**Symptoms reported (from clinical team):**

- `active_minutes` in Bearny did not match "Active Zone Minutes" in the Fitbit app for most days.
- `sleep_minutes` was consistently higher than what the Fitbit app showed (included wake phases).
- Patients who did not open the Bearny app had no wearable data in Bearny even though the Fitbit recorded data.

**Root causes:**

1. **Wrong AZM JSON keys** (`fetch_fitbit_data.py` and `fitbit_sync.py`): The Fitbit API returns the Active Zone Minutes envelope as `activities-active-zone-minutes` and the total field as `value.activeZoneMinutes`. Both files used the wrong key names (`activities-activeZoneMinutes` / `totalMinutes`), so the AZM dict was always empty and the code silently fell back to `minutesVeryActive + minutesFairlyActive` — unweighted raw minutes, systematically different from AZM.

2. **`_sleep_minutes` used time-in-bed** (`fitbit_view.py`): The helper computed `sleep_duration (ms) ÷ 60 000` (total time in bed). The Fitbit app displays `minutesAsleep` (actual sleep, wake phases removed). Fixed to prefer `minutes_asleep`; falls back to `sleep_duration` for legacy records without `minutes_asleep`.

3. **No intra-day sync** (`seed_periodic_tasks.py`, `tasks.py`): Wearable data was only synced at 01:00 (nightly backfill) or when a therapist or patient opened a Bearny page. Patients who did not log in had no data until the next midnight. Fixed by adding a `run_fetch_fitbit_data_today_all` task that runs every 4 hours.

**Fix branch:** `fix/fitbit-data-sync-issues`

---

### 2026-05-27 — Historical Fitbit data missing in patient view (#311 / #312)

**Symptoms reported:**

- Therapist view (`health-combined-history`) showed Fitbit data for the past week correctly.
- Patient view (`fitbit_summary`) showed data only for today — all historical days appeared empty.

**Root cause:**

`fitbit_summary` only called `fetch_fitbit_today_for_user`, which syncs today's data. The nightly 30-day backfill Celery task (`run_fetch_fitbit_data`, 01:00 UTC) populated historical data. However, if a patient had their Fitbit device sync to Fitbit's cloud *after* the nightly job ran (e.g. by opening the Fitbit app in the morning), those historical days were absent from the DB. The therapist view read the DB directly and saw the correct data after the *following* night; the patient saw the gap immediately on the same day.

**Fixes:**

1. **On-demand gap backfill in `fitbit_summary`** (#311): Added gap-detection logic that compares existing `FitbitData` dates against the full requested window. Any missing historical days trigger a synchronous call to the new `fetch_fitbit_date_range_for_user` function before the response is built. The fix is transparent to the caller — the patient sees correct historical data on the first page load after the gap.

2. **`wear_time_minutes` and `max_heart_rate` in range backfill** (#312): The original `fetch_fitbit_date_range_for_user` (added in #311) did not attempt the intraday HR endpoint. Extended in #312 to fetch `activities/heart/date/{date}/1d/1sec` per day and derive `wear_time_minutes` (distinct minutes with HR > 0) and `max_heart_rate`. Both fields are skipped silently when the endpoint returns 403 (app not approved for intraday access) or an empty dataset, so the fix is safe regardless of Fitbit developer console settings.

> **Note on intraday access:** The Fitbit intraday HR endpoint requires app-level "Read Fitbit Intraday Data" approval from the Fitbit developer console — beyond the `heartrate` user OAuth scope. Existing user tokens do not need to be re-authorised; access is controlled at the app level. Until approved, these fields remain `None` in the range backfill (they are populated in `fetch_fitbit_today_for_user` via a separate code path that was already present).

**Fix branches:** `311-fix-fitbit-patient-view` (merged to main), `312-backfill-wear-time`

---

## Adding a New Fitbit Data Field

1. **Add the field** to `FitbitData` in [core/models.py](../backend/core/models.py).
2. **Fetch the data** in all three fetch paths:
   - `fetch_fitbit_today_for_user` ([fitbit_sync.py](../backend/core/views/fitbit_sync.py)) — today-only, on-demand
   - `fetch_fitbit_date_range_for_user` ([fitbit_sync.py](../backend/core/views/fitbit_sync.py)) — range backfill, on-demand when gaps detected
   - Management command ([fetch_fitbit_data.py](../backend/core/management/commands/fetch_fitbit_data.py)) — nightly 30-day bulk backfill
3. **Expose it** in whichever endpoints need it (`fitbit_summary`, `get_fitbit_health_data`, `health_combined_history`).
4. **Add tests** in [tests/fitbit_sync/test_fitbit_sync.py](../backend/tests/fitbit_sync/test_fitbit_sync.py) and [tests/fitbit_views/test_fitbit_views.py](../backend/tests/fitbit_views/test_fitbit_views.py).

MongoDB is schema-less, so no migration is needed — new fields are `None` in existing documents until the next sync.

---

## Related Files

| File | Purpose |
|---|---|
| [core/views/fitbit_sync.py](../backend/core/views/fitbit_sync.py) | `fetch_fitbit_today_for_user`, `fetch_fitbit_date_range_for_user`, token refresh, cooldown guard |
| [core/views/fitbit_view.py](../backend/core/views/fitbit_view.py) | All Fitbit REST endpoints |
| [core/management/commands/fetch_fitbit_data.py](../backend/core/management/commands/fetch_fitbit_data.py) | 30-day bulk backfill command |
| [core/tasks.py](../backend/core/tasks.py) | Celery tasks wrapping the above |
| [core/models.py](../backend/core/models.py) | `FitbitUserToken`, `FitbitData`, embedded documents |
| [tests/fitbit_sync/test_fitbit_sync.py](../backend/tests/fitbit_sync/test_fitbit_sync.py) | Unit tests for sync service and cooldown |
| [tests/fitbit_views/test_fitbit_views.py](../backend/tests/fitbit_views/test_fitbit_views.py) | Integration tests for all Fitbit endpoints |
