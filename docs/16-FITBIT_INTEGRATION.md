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
   ┌────┴────────────────────────────────┐
   │  Two fetch paths                    │
   │                                     │
   │  1. On-demand (view layer)          │
   │     fitbit_summary view             │
   │     → fetch_fitbit_today_for_user() │
   │       (15-min cooldown guard)       │
   │                                     │
   │  2. Scheduled (Celery)              │
   │     run_fetch_fitbit_data task      │
   │     → fetch_fitbit_data command     │
   │       (30-day backfill, no cooldown)│
   └────────────────┬────────────────────┘
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
| `active_minutes` | int | AZM if available, else `minutesVeryActive + minutesFairlyActive` |
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

## Data Fetch: Two Paths

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

### 2. Scheduled backfill (Celery)

**Entry points:**

| Task name | What it does |
|---|---|
| `core.tasks.run_fetch_fitbit_data` | Runs the `fetch_fitbit_data` management command for all connected users; scheduled via Celery Beat |
| `core.tasks.fetch_fitbit_data_async` | Fetches today for a single user; called ad-hoc (e.g. from auth flow) |

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

Main dashboard endpoint. Triggers an on-demand today-fetch (subject to the 15-minute cooldown), then returns a summary of the requested period.

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
`sleep_minutes` reflects time **in bed** (from `sleep_duration`); `minutes_asleep` reflects actual sleep time (matches the Fitbit app).

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

Each call to `fetch_fitbit_today_for_user` makes ~13–15 API calls. The 15-minute cooldown limits on-demand fetches to at most **4 per hour (~60 calls)**, well within the quota. The scheduled backfill command runs outside the cooldown and is invoked at most once per hour by Celery Beat.

If a user's quota is exhausted (HTTP 429), all subsequent fetches within the cooldown window are blocked automatically. The next permitted fetch attempt is ~15 minutes after the 429-triggering run.

---

## Adding a New Fitbit Data Field

1. **Add the field** to `FitbitData` in [core/models.py](../backend/core/models.py).
2. **Fetch the data** in `fetch_fitbit_today_for_user` ([fitbit_sync.py](../backend/core/views/fitbit_sync.py)) and in the management command ([fetch_fitbit_data.py](../backend/core/management/commands/fetch_fitbit_data.py)).
3. **Expose it** in whichever endpoints need it (`fitbit_summary`, `get_fitbit_health_data`, `health_combined_history`).
4. **Add tests** in [tests/fitbit_sync/test_fitbit_sync.py](../backend/tests/fitbit_sync/test_fitbit_sync.py) and [tests/fitbit_views/test_fitbit_views.py](../backend/tests/fitbit_views/test_fitbit_views.py).

MongoDB is schema-less, so no migration is needed — new fields are `None` in existing documents until the next sync.

---

## Related Files

| File | Purpose |
|---|---|
| [core/views/fitbit_sync.py](../backend/core/views/fitbit_sync.py) | `fetch_fitbit_today_for_user`, token refresh, cooldown guard |
| [core/views/fitbit_view.py](../backend/core/views/fitbit_view.py) | All Fitbit REST endpoints |
| [core/management/commands/fetch_fitbit_data.py](../backend/core/management/commands/fetch_fitbit_data.py) | 30-day bulk backfill command |
| [core/tasks.py](../backend/core/tasks.py) | Celery tasks wrapping the above |
| [core/models.py](../backend/core/models.py) | `FitbitUserToken`, `FitbitData`, embedded documents |
| [tests/fitbit_sync/test_fitbit_sync.py](../backend/tests/fitbit_sync/test_fitbit_sync.py) | Unit tests for sync service and cooldown |
| [tests/fitbit_views/test_fitbit_views.py](../backend/tests/fitbit_views/test_fitbit_views.py) | Integration tests for all Fitbit endpoints |
