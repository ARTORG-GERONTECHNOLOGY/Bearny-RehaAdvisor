# Google Health Views — Test Documentation

Tests in [`test_google_health_views.py`](test_google_health_views.py) cover
`core/views/google_health_view.py` and `core/views/google_health_sync.py`.

---

## Endpoints and coverage

| Endpoint / Function | Tests |
|---|---|
| `GET /api/google-health/status/<patient_id>/` | 10 |
| `GET /api/google-health/callback/` | 2 |
| `get_valid_google_access_token` (sync helper) | 3 |

**Total: 15 tests**

---

## Scenarios covered

### `google_health_status`

- No token → `connected=False`, `needs_reconnect=False`, `days_until_expiry=null`
- Fresh token (same day) → `connected=True`, `needs_reconnect=False`, `days_until_expiry=7`
- Token 3 days old → `needs_reconnect=False`, `days_until_expiry=4`
- Token 6 days old → `needs_reconnect=True`, `days_until_expiry=1` (banner warn threshold)
- Token 7 days old → `needs_reconnect=True`, `days_until_expiry=0` (expired)
- Token 8+ days old → `days_until_expiry` clamped to 0 (never negative)
- Revoked token → `connected=False`, `needs_reconnect=False`
- Token with `connected_at=None` (pre-migration) → `needs_reconnect=False` (safe default)
- Unresolvable identifier → all safe defaults returned
- Response always includes `wearable_device` field

### `google_health_callback`

- Successful token exchange → `connected_at` is set on the saved token
- Successful reconnect after revocation → `is_revoked=False`, `revoked_at=None`, `connected_at` reset

### `get_valid_google_access_token`

- Refresh fails with `invalid_grant` → `is_revoked=True`, `revoked_at` set, exception raised
- Refresh fails with non-`invalid_grant` error → `is_revoked` unchanged, exception raised
- Token not yet expired → refresh skipped entirely, stored `access_token` returned

---

## Running

```bash
docker exec django pytest tests/google_health_views/ -v
```
