# Admin Dashboard — Test Documentation

Tests for the `AdminDashboard` page (`src/pages/AdminDashboard.tsx`) live in
[`AdminDashboard.test.tsx`](AdminDashboard.test.tsx).

---

## Feature description

`AdminDashboard` is the central control panel for users with role `Admin`.
It is rendered at `/admin` and contains three tabs:

| Tab key           | Label                  | Purpose                                                                    |
| ----------------- | ---------------------- | -------------------------------------------------------------------------- |
| `pending`         | Pending registrations  | Review and accept/decline newly registered users                           |
| `access-requests` | Access change requests | Approve or decline therapist requests to change clinic/project assignments |
| `export`          | Export                 | Download patient data as a CSV file, optionally filtered by clinic         |

Non-admin users (or unauthenticated users) are immediately redirected to
`/unauthorized` by the `AdminDashboardStore.init()` method.

---

## Export tab (feature #238)

The Export tab lets an Admin download patient records as a CSV file grouped by
clinic.

### User flow

1. On mount, the page fetches `GET /api/admin/export/clinics/` to retrieve the
   distinct clinic names currently in the database.
2. All clinics are pre-selected. The admin can uncheck individual clinics or
   use the "Select all" / "Deselect all" quick-toggle buttons.
3. **Export all patients** — downloads `patients_export_<today>.csv` containing
   every patient regardless of the checkboxes.
4. **Export selected clinics (N)** — downloads the same CSV scoped to the
   checked clinics. The button is disabled when no clinics are selected.

Both buttons use `apiClient.get` with `responseType: 'blob'` and trigger a
browser download via a temporary `<a>` element.

### Backend endpoints used

| Endpoint                                      | Purpose                                                       |
| --------------------------------------------- | ------------------------------------------------------------- |
| `GET /api/admin/export/clinics/`              | Returns `{ clinics: string[] }` — distinct clinic names in DB |
| `GET /api/admin/export/patients/?clinics=all` | Full export CSV                                               |
| `GET /api/admin/export/patients/?clinics=A,B` | Partial export CSV                                            |

---

## Tests

### Auth / redirect

| Test                                                     | Scenario                                      | Expected                           |
| -------------------------------------------------------- | --------------------------------------------- | ---------------------------------- |
| `redirects to unauthorized if user is not authenticated` | `isAuthenticated=false`, `userType=Therapist` | `navigate('/unauthorized')` called |

### Pending registrations tab (Tab 1)

| Test                                                              | Scenario                                         | Expected                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `renders pending entries correctly`                               | One pending entry in `adminStore.pendingEntries` | Name and email rendered in the table                                                             |
| `calls acceptEntry when Accept button is clicked`                 | Entry present; user clicks Accept                | `adminStore.acceptEntry` called with the entry id                                                |
| `calls declineEntry when Decline button is clicked and confirmed` | Entry present; user clicks Decline then confirms | `showDeclineConfirm` set to `true`; after `declineConfirmed()`, `adminStore.declineEntry` called |

### Access change requests tab (Tab 2)

| Test                                                                      | Scenario                                                           | Expected                                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `fetches access change requests on mount`                                 | Component mounts                                                   | `apiClient.get('/admin/access-change-requests/')` called                              |
| `shows "Access change requests" tab with badge when requests exist`       | One request returned                                               | Tab label visible with badge                                                          |
| `renders therapist name and email in access requests table`               | One request with `therapistName: "Jane Doe"`                       | "Jane Doe" and email rendered after switching to tab                                  |
| `renders current and requested clinics/projects in access requests table` | Request has current=`Inselspital`, requested=`Berner Reha Centrum` | Both clinic names visible                                                             |
| `calls approve endpoint when Approve button is clicked`                   | One pending request; Approve clicked                               | `apiClient.put('/admin/access-change-requests/req-1/', { action: 'approve' })` called |
| `shows no pending message when change requests list is empty`             | Empty requests list                                                | "No pending access change requests" text visible                                      |

---

## Mock strategy

### `apiClient`

`apiClient` is auto-mocked. The default mock returns `{ data: { requests: [] } }` for
GET calls (satisfies both `/admin/access-change-requests/` and
`/admin/export/clinics/`) and `{ data: { ok: true } }` for PUT calls.

### `AdminDashboardStore`

Replaced with a hand-rolled mock that exposes `init`, `setError`,
`accept`, `openDeclineConfirm`, `closeDeclineConfirm`, and `declineConfirmed`
as `jest.fn()` stubs. `init` replicates the real store's guard: it calls
`authStore.checkAuthentication()` and redirects to `/unauthorized` if the user
is not an authenticated Admin.

### `adminStore` / `authStore`

Both replaced with plain objects carrying observable-like properties.
`adminStore.pendingEntries` is set per-test inside `beforeEach`.

---

## Running

```bash
docker exec react npx jest src/__tests__/pages/AdminDashboard.test.tsx --no-coverage
```
