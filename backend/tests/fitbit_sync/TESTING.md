# Fitbit Sync Service — Test Documentation

Tests in [`test_fitbit_sync.py`](test_fitbit_sync.py) cover service logic in
`core/views/fitbit_sync.py`.

---

## Coverage Summary

| Function | Tests |
|---|---|
| `get_valid_access_token` | 3 |
| `fetch_fitbit_today_for_user` | 7 |

**Total: 10 tests**

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
  - AZM active-minutes fallback path

---

## Running

```bash
pytest tests/fitbit_sync/ -v
```
