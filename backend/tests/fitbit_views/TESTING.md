# Fitbit Views — Test Documentation

This document describes tests in
[`test_fitbit_views.py`](test_fitbit_views.py) for `core/views/fitbit_view.py`.

---

## Endpoints and coverage

| Endpoint | HTTP verb | Tests |
|---|---|---|
| `/api/fitbit/status/<patient_id>/` | GET | 2 |
| `/api/fitbit/callback/` | GET | 5 |
| `/api/fitbit/health-data/<patient_id>/` | GET | 2 |
| `/api/fitbit/manual_steps/<patient_id>/` | POST/GET | 5 |
| `/api/fitbit/summary/(<patient_id>/)` | GET | 3 |
| `health_combined_history(<patient_id>)` | GET (direct view test) | 3 |
| Helper functions | N/A | 5 |

**Total: 27 tests**

---

## Scenarios covered

- Fitbit connection state with/without persisted token.
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
- Helpers: threshold defaults/merge, averaging utility, patient resolver, sleep-minute conversion, and `_date`.

---

## Running

```bash
pytest tests/fitbit_views/ -v
```
