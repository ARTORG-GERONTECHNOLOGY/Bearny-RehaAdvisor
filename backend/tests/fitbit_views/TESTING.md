# Fitbit Views — Test Documentation

This document describes tests in
[`test_fitbit_views.py`](test_fitbit_views.py) for `core/views/fitbit_view.py`.

---

## Endpoints and coverage

| Endpoint | HTTP verb | Tests |
|---|---|---|
| `/api/fitbit/status/<patient_id>/` | GET | 4 |
| `/api/fitbit/callback/` | GET | 5 |
| `/api/fitbit/health-data/<patient_id>/` | GET | 3 |
| `/api/fitbit/manual_steps/<patient_id>/` | POST/GET | 5 |
| `/api/fitbit/summary/(<patient_id>/)` | GET | 3 |
| `health_combined_history(<patient_id>)` | GET (direct view test) | 6 |
| Helper functions | N/A | 5 |

**Total: 33 tests**

---

## Scenarios covered

- Fitbit connection state with/without persisted token.
- Fitbit status resolution for both `User.id` and `Patient.id`.
- Fitbit status returns safe false values for unresolved identifiers.
- OAuth callback redirect branches:
  - missing code
  - missing state
  - invalid user
  - token exchange non-200
  - successful token exchange and persistence
- Health-data endpoint not-found and empty-data success.
- Health-data endpoint non-empty success path including exercise/sleep/heart-zone normalization.
- Manual steps endpoint validation errors and patient resolution failure.
- Manual steps success path (`update_one` called with upsert).
- Fitbit summary endpoint:
  - patient resolution failure
  - minimal success response
  - populated daily data + vitals merge path
  - internal error handling
- Combined-history endpoint:
  - patient-not-found branch
  - merged response success path across fitbit/questionnaire/adherence
  - invalid `from/to` input error branch
  - **`wear_time_minutes` and `minutes_asleep` present in FitbitEntry when recorded**
  - **`wear_time_minutes` and `minutes_asleep` are `null` in FitbitEntry when not recorded**
  - **questionnaire rows expose export-ready fields: `comment`, `audio_url`, `media_urls`, and normalized answer arrays**
- Health-data endpoint:
  - **`minutes_asleep` returned in `sleep` object (actual sleep vs time-in-bed)**
- Helpers: threshold defaults/merge, averaging utility, patient resolver, sleep-minute conversion, and `_date`.

---

## Running

```bash
pytest tests/fitbit_views/ -v
```
