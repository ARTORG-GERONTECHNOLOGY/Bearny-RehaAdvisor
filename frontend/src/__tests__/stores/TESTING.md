# Frontend Store Tests — Test Documentation

Unit tests for MobX stores in `frontend/src/stores/`.

Run from the `frontend/` directory (or inside the `react` container):

```bash
# all store tests
npx jest src/__tests__/stores/ --no-coverage

# single file
npx jest src/__tests__/stores/authStore.test.ts --no-coverage
```

---

## `authStore.test.ts` + `src/__tests__/api/authStore.test.ts`

These two files together cover the full lifecycle of `AuthStore`
(`frontend/src/stores/authStore.ts`) and the Axios response interceptor
(`frontend/src/api/client.js`).

### Session model

| Concept            | Storage key                         | Role                                                                         |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------------- |
| Access token       | `localStorage.authToken`            | Sent as `Authorization: Bearer …` on every request                           |
| Refresh token      | `localStorage.refreshToken`         | Exchanged at `/auth/token/refresh/` when access token expires                |
| Session expiry     | `localStorage.expiresAt`            | Unix ms timestamp; set to `Date.now() + 15 min` on every user activity event |
| Inactivity timeout | `authStore.sessionTimeout` (15 min) | Client-side `setTimeout` that calls `logout()`                               |

### `checkAuthentication()` — startup / page-reload logic

Called in the `AuthStore` constructor and on every hard page reload.

| Condition                                        | Behaviour                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| `expiresAt` in the future + `authToken` present  | Restore session, start inactivity timer                           |
| `expiresAt` in the past + `refreshToken` present | `_trySilentRefresh()` → if OK, restore session; if failed, logout |
| `expiresAt` in the past + no `refreshToken`      | Immediate logout (clear storage, call callback)                   |
| No `authToken` and no `refreshToken`             | Immediate logout                                                  |
| `authToken` present + no `expiresAt` / corrupted | Treated as expired → silent-refresh path                          |

### Tests

#### `src/__tests__/stores/authStore.test.ts`

| Test                                                                      | Scenario                                                                                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sets email and password                                                   | `setEmail` / `setPassword` setters update store state                                                                                                         |
| handles failed login                                                      | `loginWithHttp` sets `loginErrorMessage` on 401                                                                                                               |
| logs out and resets state                                                 | `logout()` clears store, clears localStorage (preserving `i18nextLng` + `notifications-enabled`), clears sessionStorage, calls callback                       |
| restores session if session is still valid                                | `checkAuthentication()` with future `expiresAt` sets `isAuthenticated=true` and starts timer                                                                  |
| resets state immediately if session is expired and no refresh token       | `checkAuthentication()` with past `expiresAt` + no refresh token → `reset()` called synchronously                                                             |
| **stays authenticated if session is expired but silent refresh succeeds** | `checkAuthentication()` with past `expiresAt` + valid refresh token → `axios.post` mocked to return new token → `isAuthenticated=true` after async resolution |
| **logs out if session is expired and silent refresh fails**               | Same as above but `axios.post` rejects → `reset()` + `callback` called                                                                                        |
| starts inactivity timer and sets up event listeners                       | `startInactivityTimer()` registers all activity events                                                                                                        |

#### `src/__tests__/api/authStore.test.ts`

| Test                                                                    | Scenario                                                                      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| should clear storage and reset state on logout                          | `logout()` POSTs to `/auth/logout/`, clears token, calls callback             |
| should handle logout even if logout API fails                           | `logout()` still resets even when the audit-log POST throws                   |
| should correctly restore session if session is valid                    | `checkAuthentication()` happy path restores `userType` and `id`               |
| **should logout if session is expired and no refresh token exists**     | Past `expiresAt` + no refresh token → `isAuthenticated=false`, callback fired |
| **stays logged in when session is expired but silent refresh succeeds** | Past `expiresAt` + refresh token + `axios.post` mocked → stays authenticated  |
| should logout after session timeout due to inactivity                   | `sessionTimeout` timer fires → `logout()` → callback + `/auth/logout/` POST   |
| should reset the inactivity timer on user activity                      | `mousemove` event resets the countdown; no logout before full timeout         |

> Tests in **bold** were added as part of the spurious-logout bug fix.

### Mocking strategy

- `@/api/client` → `src/__mocks__/api/client.ts` (jest module mock)
- `axios` → `jest.mock('axios')` — used directly by `_trySilentRefresh()` which bypasses the Axios interceptor to avoid circular refresh loops

---

## `templateStore.test.ts`

Covers `TemplateStore` — fetching, selecting, creating, and deleting named
intervention templates.

---

## Other store tests

| File                                 | Store                                                        |
| ------------------------------------ | ------------------------------------------------------------ |
| `adminStore.test.tsx`                | `AdminStore` — admin user management                         |
| `patientQuestionnairesStore.test.ts` | `PatientQuestionnairesStore` — questionnaire fetch and state |
| `patientVitalsStore.test.ts`         | `PatientVitalsStore` — vitals fetch and threshold checks     |
