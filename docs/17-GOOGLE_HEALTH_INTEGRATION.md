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
   │  Two fetch paths                               │
   │                                               │
   │  1. On-demand today (view layer)              │
   │     google_health_summary view                │
   │     → fetch_google_health_today_for_user()    │
   │                                               │
   │  2. Scheduled / initial backfill (Celery)     │
   │     fetch_google_health_data_async task        │
   │     → fetch_google_health_data command        │
   │       (30-day backfill per token)             │
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
| `steps` | IntField | |
| `resting_heart_rate` | IntField | |
| `heart_rate_zones` | List[HeartRateZone] | Same embedded doc as FitbitData |
| `max_heart_rate` | IntField | Always `None` (no v4 data type) |
| `floors` | IntField | |
| `distance` | FloatField | km |
| `calories` | FloatField | |
| `active_minutes` | IntField | Active Zone Minutes × 2 + moderate × 1 |
| `active_zone_minutes` | EmbeddedDoc | fat_burn / cardio / peak breakdown |
| `sleep` | EmbeddedDoc(SleepData) | Longest session between 18:00 prev–18:00 target |
| `hrv` | DictField | Daily RMSSD from `daily-heart-rate-variability` |
| `inactivity_minutes` | IntField | 1440 − active_minutes − sleep_minutes |
| `wear_time_minutes` | IntField | Sum of all HR zone minutes |
| `weight_kg` | FloatField | |
| `bp_sys` / `bp_dia` | IntField | Always `None` (not available via v4 API) |

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

- **`dailyRollUp`** (POST body): steps, active-energy-burned, distance, floors, active-minutes, daily-resting-heart-rate, daily-heart-rate-variability, time-in-heart-rate-zone, weight
- **`dataPoints`** (GET, paginated): sleep (longest session in 18 h window), exercise sessions (civil day)

Skips writing if no meaningful data is present for a day.

### On-demand today sync

Called automatically by `google_health_summary` on each summary request. Uses the same `_sync_day` logic for today's date only.

### Celery task (post-OAuth backfill)

`fetch_google_health_data_async` is queued after the OAuth callback completes, running the 30-day backfill asynchronously so the callback redirects immediately.

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

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Patient sees "Connect Google Health" but OAuth fails | `GOOGLE_HEALTH_CLIENT_ID` not set or empty | Set env var and restart Django |
| Token revoked immediately after connect | `invalid_grant` from Google | Check `GOOGLE_HEALTH_REDIRECT_URI` matches registered URI exactly |
| Summary returns empty data | Backfill hasn't run yet | Run `fetch_google_health_data` or wait for Celery task |
| ReconnectBanner appears after 7 days | App in testing mode (unverified) | Complete Google API verification review |
| `wearable_device` field missing from patient API response | Old patient record | Update via therapist profile form or admin shell |
