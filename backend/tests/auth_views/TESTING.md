# Auth Views — Test Documentation

This directory contains unit tests for every endpoint exposed under
`/api/auth/`.  Each test file mirrors one view and is self-contained
(in-memory mongomock, no external services).

---

## Endpoints and their test files

| Endpoint | View function | Test file |
|---|---|---|
| `POST /api/auth/login/` | `login_view` | `test_login_view.py` |
| `POST /api/auth/logout/` | `logout_view` | `test_logout_view.py` |
| `POST /api/auth/register/` | `register_view` | `test_register_view.py` |
| `POST /api/auth/forgot-password/` | `reset_password_view` | `test_reset_password_view.py` |
| `POST /api/auth/send-verification-code/` | `send_verification_code` | `test_send_verification_code.py` |
| `POST /api/auth/verify-code/` | `verify_code_view` | `test_verify_code_view.py` |
| `GET  /api/auth/get-user-info/<user_id>/` | `get_user_info` | `test_get_user_info_view.py` |
| helper utilities in `auth_views.py` | internal helper funcs | `test_auth_helpers.py` |

---

## Authentication and authorisation model

### Roles

The application defines three roles stored in `User.role`:

| Role | Login path | 2FA required |
|---|---|---|
| `Patient` | Password → JWT issued immediately | No |
| `Admin` | Password → JWT issued immediately | No |
| `Therapist` | Password → 2FA prompt | **Yes** |

### Login flow

```
POST /api/auth/login/
│
├── 400  Missing e-mail/username or password
├── 401  User not found (generic message to prevent enumeration)
├── 401  Wrong password
├── 401  pwdhash is empty / missing
├── 403  User exists, password correct, but isActive = False
│
├── 200  role = Therapist ──► require_2fa: true (no tokens yet)
│                                │
│             POST /api/auth/send-verification-code/
│             (stores time-limited 6-digit code, e-mails it)
│                                │
│             POST /api/auth/verify-code/
│             ├── 400  Wrong code
│             ├── 400  Expired code (record also deleted)
│             └── 200  Tokens issued + verification record deleted
│
└── 200  role = Patient/Admin ──► access_token + refresh_token
```

### `isActive` flag

- New **Therapists** are created with `isActive = False`.
  An administrator must accept them via `/api/admin/accept-user/` before
  they can log in.
- New **Patients** are created with `isActive = True` (no admin approval step).
- Any user with `isActive = False` receives HTTP 403 at login, regardless of
  role.

### Permission decorators

Several views carry `@permission_classes([IsAuthenticated])`:

- `logout_view`
- `reset_password_view`
- `get_user_info`

**Important:** these decorators have no runtime effect because the views are
plain Django functions, not DRF `@api_view`-wrapped views.  The tests
document the *actual* behaviour (unauthenticated requests are accepted).
If these endpoints are hardened in the future, the corresponding test files
must be updated.

---

## Running the tests

```bash
# From the backend/ directory
pytest tests/auth_views/ -v
```

To run a single file:

```bash
pytest tests/auth_views/test_login_view.py -v
```

---

## Test infrastructure

### `mongo_mock` fixture

Every test file declares its own `autouse` `mongo_mock` fixture that:

1. Disconnects any existing mongoengine connection.
2. Creates a fresh in-memory `mongomock.MongoClient` connection aliased
   `"default"`.
3. Yields the connection to the test.
4. Disconnects and tears down after the test.

This means each test runs against a clean, empty database with no state
leaking between tests.

### E-mail mocking

- `reset_password_view` → mock `core.views.auth_views.send_mail`
- `send_verification_code` → mock `core.views.auth_views.EmailMultiAlternatives`

Always mock at the *import site* (where the symbol is used), not at the
original definition.

---

## Coverage summary

| Category | Tests | Key scenarios |
|---|---|---|
| Happy path | All files | Correct credentials, correct codes |
| 400 Input validation | login, register, reset-pw, verify-code, send-code | Missing/invalid fields |
| 401 Authentication | login | Wrong password, empty pwdhash, unknown user |
| 403 Authorisation | login | `isActive=False` for any role |
| 404 Not found | logout, reset-pw, send-code, get-user-info | Non-existent resource |
| 405 Method | login, logout, reset-pw, register | Wrong HTTP verb |
| Role-based response | login, get-user-info | Therapist 2FA gate, per-role profile fields |
| Token issuance | login (Patient), verify-code | access_token + refresh_token present |
| Token withheld | login (Therapist) | No tokens before 2FA completion |
| Side effects | send-code, verify-code | Record created / deleted, e-mail sent |

---

## Session and token lifetime

The following settings control how long a user stays logged in
(`backend/api/settings/base.py` `SIMPLE_JWT`):

| Setting | Value | Effect |
|---|---|---|
| `ACCESS_TOKEN_LIFETIME` | 5 minutes | Access token expires; frontend refreshes silently on 401 |
| `REFRESH_TOKEN_LIFETIME` | 1 day | Hard logout after 24 h of no refresh |
| `ROTATE_REFRESH_TOKENS` | `True` | Each refresh call issues a **new** refresh token |
| `BLACKLIST_AFTER_ROTATION` | `True` | Old refresh token is immediately blacklisted |
| Frontend inactivity timeout | 15 minutes | `authStore.sessionTimeout` — client-side timer |

### Spurious-logout root causes and fixes

Three bugs caused users to be logged out without explicit user action or the
inactivity timer expiring. All three are fixed in `frontend/src/api/client.js`
and `frontend/src/stores/authStore.ts`:

#### 1. Refresh-token rotation race condition

**Symptom:** Logout after making multiple simultaneous API calls (e.g. loading
a page that fires several requests concurrently).

**Cause:** `ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION` means only the
first refresh attempt wins. Without a client-side lock, two concurrent 401s
both tried to exchange the same refresh token. The second one hit a blacklisted
token, got a 401 on the refresh itself, and `client.js` cleared localStorage.

**Fix:** A `_isRefreshing` flag + `_refreshQueue` array in `client.js`. Only
one refresh call runs at a time; all other 401s are queued and resolved once
the single refresh completes.

#### 2. Stale `expiresAt` on page reload / mobile backgrounding

**Symptom:** Logout immediately after navigating back to the app, especially on
mobile, or after a page hard-reload.

**Cause:** `checkAuthentication()` called `reset()` immediately when
`Date.now() >= expiresAt`, even when a valid refresh token still existed. The
JS timer is suspended when a mobile OS backgrounds the tab, so `expiresAt` can
appear expired even though the refresh token is still within its 24 h window.

**Fix:** When `expiresAt` is in the past but a `refreshToken` exists in
localStorage, `checkAuthentication()` attempts `_trySilentRefresh()` first.
Only if the refresh also fails is the user actually logged out.

#### 3. Corrupted or missing `expiresAt`

**Symptom:** Sporadic logout after browser crash, storage quota exceeded, or
a bug writing a non-numeric value to `expiresAt`.

**Cause:** `_armTimeoutFromStorage()` called `this.logout()` immediately when
`parseInt(expiresAt)` was `NaN` or `0`.

**Fix:** Same `_trySilentRefresh()` pattern — attempt recovery before giving up.
