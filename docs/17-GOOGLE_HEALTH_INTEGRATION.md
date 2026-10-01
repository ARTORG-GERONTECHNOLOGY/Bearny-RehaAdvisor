# Google Health Integration — Technical Documentation

## Overview

The Google Health integration is an alternative wearable backend that replaces Fitbit for patients enrolled on devices that use Google's health platform. Both integrations coexist in production: each patient's `wearable_device` field determines which backend is active. Fitbit remains the default; Google Health is opt-in per patient.

---

## Architecture

```
Patient device (Android / Pixel Watch)
        │
        ▼
Google Health API v4 (health.googleapis.com)
        │
   ┌────┴──────────────────────────────────────────┐
   │  Three fetch paths                             │
   │                                               │
   │  1. On-demand today (view layer)              │
   │     google_health_summary view                │
   │     → fetch_google_health_today_for_user()    │
   │                                               │
   │  2. Scheduled (Celery)                        │
   │     Every 4 h: run_fetch_google_health_       │
   │       data_today_all (today, all users)       │
   │     Nightly: run_fetch_google_health_data     │
   │       (30-day backfill, all users)            │
   │                                               │
   │  3. On OAuth connect (Celery)                 │
   │     backfill_google_health_on_connect         │
   │     → 365-day backfill for new token          │
   └────────────────┬──────────────────────────────┘
                    ▼
           MongoDB (GoogleHealthData)
                    │
        ┌───────────┴────────────────┐
        │ REST endpoints              │
        │  /api/google-health/        │
        │    status/<patient_id>/     │
        │    summary/<patient_id>/    │
        │    data/<patient_id>/       │
        │    history/<patient_id>/    │
        └────────────────────────────┘
```

---

## OAuth 2.0 Connection Flow

Google Health uses the standard **Authorization Code** OAuth 2.0 flow with PKCE.

### Required environment variables

| Variable | Description | Default (dev) |
|---|---|---|
| `GOOGLE_HEALTH_CLIENT_ID` | OAuth client ID from Google Cloud Console | `""` |
| `GOOGLE_HEALTH_CLIENT_SECRET` | OAuth client secret | `""` |
| `GOOGLE_HEALTH_REDIRECT_URI` | Must exactly match the registered redirect URI | `http://localhost:8000/api/google-health/callback/` |

If `GOOGLE_HEALTH_CLIENT_ID` is empty the OAuth flow will fail silently — patients will see a misconfigured error. Set the variable but leave it empty in environments where Google Health should not be usable.

### Scopes

```
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
https://www.googleapis.com/auth/googlehealth.sleep.readonly
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
```

### Connection flow

1. **Frontend** (`GoogleHealthConnectButton`) builds an authorization URL and opens it
2. User authenticates on `accounts.google.com` and grants the three scopes
3. Google redirects to `GOOGLE_HEALTH_REDIRECT_URI`
4. **Backend** (`google_health_callback`) exchanges the code for tokens, stores a `GoogleHealthUserToken`, and triggers a 30-day backfill via Celery
5. Frontend polls `/api/google-health/status/<patient_id>/` to confirm connection

### Token refresh

`get_valid_google_access_token(user)` refreshes using the stored `refresh_token` when `expires_at` is within 5 minutes. If Google returns `invalid_grant`, `GoogleHealthUserToken.is_revoked` is set to `True` and the patient sees the `ReconnectBanner`.

---

## Data model

**`GoogleHealthData`** (MongoDB collection: `google_health_data`)

| Field | Type | Notes |
|---|---|---|
| `user` | ReferenceField(User) | |
| `date` | DateTimeField | Unique per user |
| `steps` | IntField | `steps.countSum` rollup |
| `resting_heart_rate` | IntField | `daily-resting-heart-rate` → `beatsPerMinute` |
| `heart_rate_zones` | List[HeartRateZone] | `time-in-heart-rate-zone` rollup; zone duration in minutes. No bpm boundaries (GH API does not provide them) |
| `max_heart_rate` | IntField\|None | Derived from peak `exercise.metricsSummary.maxHeartRate` across sessions; `None` on days with no exercise data |
| `floors` | IntField | `floors.countSum` rollup |
| `distance` | FloatField | km — `distance.millimetersSum` ÷ 1 000 000 |
| `calories` | FloatField | `total-calories.kilocaloriesSum` (total expenditure, matches Fitbit); falls back to `active-energy-burned.kilocaloriesSum` when unavailable |
| `active_minutes` | IntField | Sum of MODERATE + VIGOROUS + VIGOROUS_PLUS from `active-minutes` rollup (matches Fitbit's AZM-eligible minutes) |
| `lightly_active_minutes` | IntField\|None | LIGHT level from same `active-minutes` rollup |
| `active_zone_minutes` | DictField\|None | `{"fat_burn": N, "cardio": N, "peak": N, "total": N}` — derived from HR zone names |
| `sleep` | EmbeddedDoc(SleepData) | Aggregated from `sleep` dataPoints; civil-date attribution in Europe/Zurich timezone |
| `breathing_rate` | DictField | `{"breathingRate": float}` from `daily-respiratory-rate` → `breathsPerMinute` |
| `hrv` | DictField | `{"dailyRmssd": float}` from `daily-heart-rate-variability`. No `deepRmssd` (not provided by GH API) |
| `inactivity_minutes` | IntField | 1440 − active_minutes − lightly_active_minutes − sleep_minutes |
| `wear_time_minutes` | IntField\|None | Sum of all HR zone minutes (proxy; GH has no intraday HR stream) |
| `weight_kg` | FloatField\|None | `weight.weightGramsAvg` ÷ 1000 |
| `bp_sys` / `bp_dia` | IntField\|None | Always `None` — not available in GH v4 API |
| `spo2` | FloatField\|None | Average daily SpO₂ % from `daily-oxygen-saturation` → `averageSaturationPercent` |
| `vo2_max` | FloatField\|None | VO₂ max in mL/kg/min from `daily-vo2-max` → `vo2MaxMillilitersPerKilogramPerMinute` |

**`GoogleHealthUserToken`** fields: `user`, `access_token`, `refresh_token`, `expires_at`, `google_user_id`, `connected_at`, `is_revoked`, `revoked_at`

---

## API endpoints

All endpoints require `IsAuthenticated` and accept either a Patient ID or a User ID as `<patient_id>`.

| Method | URL | Purpose |
|---|---|---|
| `GET` | `/api/google-health/callback/` | OAuth callback — receives `code` and `state` |
| `GET` | `/api/google-health/status/<patient_id>/` | Connection status, `needs_reconnect`, `days_until_expiry`, `wearable_device` |
| `GET` | `/api/google-health/summary/<patient_id>/` | Today's metrics + 7-day (or `?days=N`) period averages |
| `GET` | `/api/google-health/data/<patient_id>/` | Raw daily rows for a date range (`?from=&to=`) |
| `POST` | `/api/google-health/steps/<patient_id>/` | Manually write steps for a day |
| `GET` | `/api/google-health/history/<patient_id>/` | Combined wearable + questionnaire + adherence history |
| `DELETE` | `/api/google-health/disconnect/` | Revoke token for the current user |

---

## Sync paths

### Daily backfill (management command)

```bash
docker exec django python manage.py fetch_google_health_data
```

Iterates every non-revoked `GoogleHealthUserToken`, refreshes tokens, and calls `_sync_day` for the last 30 days. Uses two Google Health v4 fetch strategies:

- **`dailyRollUp`** (POST body): `steps`, `total-calories` (→ `active-energy-burned` fallback), `distance`, `floors`, `active-minutes`, `time-in-heart-rate-zone`, `weight`
- **`dataPoints`** (GET, paginated, pre-fetched once per user): `sleep`, `daily-resting-heart-rate`, `daily-heart-rate-variability`, `daily-respiratory-rate`, `daily-oxygen-saturation`, `daily-vo2-max`
- **`dataPoints`** (GET, filtered per day): `exercise` sessions (civil day boundary)

Skips writing if no meaningful data is present for a day.

### On-demand today sync

Called automatically by `google_health_summary` on each summary request. Uses the same `_sync_day` logic for today's date only.

### Celery tasks

| Task name | Schedule | What it does |
|---|---|---|
| `core.tasks.run_fetch_google_health_data_today_all` | Every 4 hours | Calls today-sync for every non-revoked token; keeps data current without a full backfill |
| `core.tasks.run_fetch_google_health_data` | Nightly at 01:00 | Runs the `fetch_google_health_data` management command — full 30-day backfill for all users |
| `core.tasks.fetch_google_health_data_async` | Ad-hoc (after login) | Fetches today for a single user; dispatched by the summary view |
| `core.tasks.backfill_google_health_on_connect` | On OAuth connect | Backfills up to 365 days of history after a patient first connects; queued by the OAuth callback |

Register the 4-hour and nightly schedules with:
```bash
docker exec django python manage.py seed_periodic_tasks
```

---

## Coexistence with Fitbit

Both integrations run simultaneously in production. The routing key is `patient.wearable_device`:

| Value | Active backend |
|---|---|
| `"fitbit"` (default) | `/api/fitbit/*` endpoints, `FitbitData` model |
| `"google_health"` | `/api/google-health/*` endpoints, `GoogleHealthData` model |
| `"omron"` | Manual step entry only, no wearable sync |
| `"none"` | No wearable |

### How the frontend routes

`patientFitbitStore` is the single store for all wearable data. On load:

1. Always calls `/api/google-health/status/<patient_id>/` to read `wearable_device`
2. If `wearable_device === 'google_health'` → uses the GH connected/reconnect state from that response
3. Otherwise → calls `/api/fitbit/status/<patient_id>/` for the Fitbit connected state

`fetchSummary`, `submitManualSteps`, and `disconnect` all route to the correct prefix (`fitbit` or `google-health`) based on the computed `useGoogleHealth` property.

### Assigning a patient to Google Health

In the therapist patient profile (or during patient registration), set **Wearable Device** to `Google Health`. This updates `patient.wearable_device = "google_health"` on the backend. The patient then sees the **Connect Google Health** button on their home page.

### REDCap sync

The `wearables_redcap_service` checks `GoogleHealthData` first, then falls back to `FitbitData` for the same user. This means patients who migrate from Fitbit to Google Health will have their first-measurement anchor and period data correctly resolved from whichever model has earlier records.

---

## ReconnectBanner

Shown on the patient home page **only for Google Health patients** (`wearable_device === 'google_health'`). Google refresh tokens expire after 7 days when the app is in testing mode (unverified). Once the app passes Google's verification review, tokens persist until explicitly revoked.

The banner appears when `needs_reconnect = True` from the status endpoint (either `days_until_expiry <= 3` or the token is already revoked). Clicking **Reconnect** starts a new OAuth flow with `prompt=select_account` to force account selection.

---

## Production setup checklist

1. Set `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `GOOGLE_HEALTH_REDIRECT_URI` in `.env.prod`
2. Ensure `GOOGLE_HEALTH_REDIRECT_URI` is registered in Google Cloud Console → APIs & Services → Credentials
3. Verify the three scopes are listed in the OAuth consent screen Data Access tab
4. Verify `https://reha-advisor.ch` in Authorized Domains (requires Search Console ownership verification — see Google Cloud Console)
5. Add `czieanarra@gmail.com` to test users while in testing mode
6. Run the initial backfill after first patient connects:
   ```bash
   docker exec django-prod python manage.py fetch_google_health_data
   ```

---

## Known differences from Fitbit

| Metric | Difference |
|---|---|
| **Calories** | GH uses `total-calories` (total expenditure) which should match Fitbit. Falls back to `active-energy-burned` (active calories only, much lower) when unavailable — watch for this in early deployments. |
| **HR zone boundaries** | GH does not return min/max bpm per zone. Tooltips in HRZonesStacked display zone names only (without "91–127 bpm" ranges). Chart still renders. |
| **HRV** | GH provides `dailyRmssd` only. `deepRmssd` (deep-sleep window RMSSD) is not available from the GH API. |
| **Max HR** | Derived from exercise session peaks. `None` on non-exercise days (Fitbit derives it from intraday 1-second HR). |
| **Wear time** | Sum of HR zone minutes (proxy). Fitbit counts minutes with HR > 0 from intraday data — more accurate on low-activity days. |
| **Sedentary minutes** | Calculated as 1440 − active − lightly_active − sleep. Fitbit provides a direct `minutesSedentary` endpoint. |
| **SpO₂ / VO₂ max** | Available from GH (not from Fitbit). Stored in `spo2` and `vo2_max` fields; `None` for Fitbit patients. |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Patient sees "Connect Google Health" but OAuth fails | `GOOGLE_HEALTH_CLIENT_ID` not set or empty | Set env var and restart Django |
| Token revoked immediately after connect | `invalid_grant` from Google | Check `GOOGLE_HEALTH_REDIRECT_URI` matches registered URI exactly |
| Summary returns empty data | Backfill hasn't run yet | Run `fetch_google_health_data` or wait for Celery task |
| ReconnectBanner appears after 7 days | App in testing mode (unverified) | Complete Google API verification review |
| `wearable_device` field missing from patient API response | Old patient record | Update via therapist profile form or admin shell |
| GH calories much lower than Fitbit | `total-calories` type unavailable; fell back to `active-energy-burned` | Check DEBUG logs for "no calories data"; field name may need updating when confirmed from live API |
| `spo2` / `vo2_max` always `None` | GH API field names not confirmed | Check DEBUG logs; update `averageSaturationPercent` / `vo2MaxMillilitersPerKilogramPerMinute` in `_prefetch_unfiltered` once confirmed from live response |
