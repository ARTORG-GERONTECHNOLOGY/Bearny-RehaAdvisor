# Fitbit Sync Service — Test Documentation

Tests in [`test_fitbit_sync.py`](test_fitbit_sync.py) cover service logic in
`core/views/fitbit_sync.py`.

---

## Coverage Summary

| Function | Tests |
|---|---|
| `get_valid_access_token` | 3 |
| `fetch_fitbit_today_for_user` | 11 |

**Total: 14 tests**

---

## Covered scenarios

- Access token passthrough when token is still valid.
- Expired-token refresh success (token persistence updated).
- Expired-token refresh non-200 failure.
- Sync short-circuit when no token exists.
- Full today-sync upsert path with mocked Fitbit API responses.
- No-row behavior when Fitbit returns no usable payload for the day.
- Additional today-sync branch coverage:
  - non-200 intraday response path
  - fallback parsing on malformed values
  - heart/sleep/exercise zone parsing branches
- Wear time derived from intraday 1-sec HR dataset (distinct worn-minute slots).
- `wear_time_minutes = None` when intraday endpoint returns no data.
- `minutes_asleep` stored separately from `sleep_duration`; both fields preserved.
- **Regression — AZM used as `active_minutes` when available** (`activities-active-zone-minutes` / `value.activeZoneMinutes`): `active_minutes` is set to the AZM value, not the `minutesVeryActive + minutesFairlyActive` fallback.
- **Regression — AZM fallback** when AZM endpoint returns empty list: `active_minutes` falls back to `minutesVeryActive + minutesFairlyActive`.

---

## Key implementation notes

### Active Zone Minutes response format

The Fitbit API endpoint is `GET /1/user/-/activities/active-zone-minutes/date/{start}/{end}.json`.  
The correct JSON keys are:

```json
{
  "activities-active-zone-minutes": [
    { "dateTime": "2026-05-01", "value": { "activeZoneMinutes": 42 } }
  ]
}
```

The envelope key is **`activities-active-zone-minutes`** (hyphenated) and the total field is **`value.activeZoneMinutes`**.  
Using `activities-activeZoneMinutes` or `value.totalMinutes` silently drops all AZM data and triggers the fallback.

### Sleep minutes

`fetch_fitbit_today_for_user` stores both `sleep_duration` (total time in bed, ms) and `minutes_asleep` (actual sleep, matches Fitbit app).  
The inactivity calculation helper `sleep_minutes_for()` prefers `minutes_asleep`; falls back to `sleep_duration ÷ 60 000` for legacy records.

---

## Running

```bash
pytest tests/fitbit_sync/ -v
```
