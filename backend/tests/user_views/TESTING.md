# User Views — Test Documentation

This document describes every test in
[`test_user_views.py`](test_user_views.py) for the five endpoints exposed
under `/api/users/` and `/api/admin/`.

---

## Endpoints and their test coverage

| Endpoint | HTTP verbs | View function | Tests |
|---|---|---|---|
| `/api/users/<user_id>/profile/` | GET, PUT, DELETE | `user_profile_view` | 16 |
| `/api/admin/pending-users/` | GET | `get_pending_users` | 4 |
| `/api/admin/accept-user/` | POST | `accept_user` | 5 |
| `/api/admin/decline-user/` | POST | `decline_user` | 5 |
| `/api/users/<user_id>/change-password/` | PUT | `change_password` | 5 |

**Total: 35 tests**

---

## Data model and roles

```
User  ──(role=Therapist)──► Therapist document
      ──(role=Patient)────► Patient document
                               └── therapist  ──► Therapist document
```

`User.isActive` controls login access:
- `False` → new registrations pending admin approval (Therapist) or
  soft-deleted accounts.
- `True`  → normal active account.

---

## `user_profile_view`  —  `GET/PUT/DELETE /api/users/<user_id>/profile/`

### GET — read profile

The `user_id` path parameter may be either the **User ObjectId** or the
**Patient ObjectId**; the view resolves both.  The response shape differs by
role.

#### Response fields

**Therapist**

| Field | Source |
|---|---|
| `username` | `User.username` |
| `email` | `User.email` |
| `phone` | `User.phone` |
| `name` | `Therapist.name` |
| `first_name` | `Therapist.first_name` |
| `specializations` | `Therapist.specializations` |
| `clinics` | `Therapist.clinics` |

**Patient** — all non-excluded `User` + `Patient` fields (see excluded sets
in the view).  Excluded from the response: `pwdhash`, `access_word`,
`therapist`, `userId`, `createdAt`, `updatedAt`.

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_user_profile_view_therapist_get_success` | Existing Therapist | 200, `email` and `name` match |
| `test_user_profile_view_therapist_response_contains_expected_fields` | Existing Therapist | All 7 required keys present; `pwdhash` absent |
| `test_user_profile_view_patient_get_success` | Existing Patient (by Patient ID) | 200, `email` and `first_name` match |
| `test_user_profile_view_patient_response_excludes_sensitive_fields` | Existing Patient | `pwdhash` and `access_word` absent |
| `test_user_profile_view_therapist_profile_not_found` | Therapist User but Therapist doc deleted | 404, 'profile not found' |
| `test_user_profile_view_user_not_found` | Unknown ObjectId | 500, `error` key present |

> **Why 500 and not 404 for unknown user?** The view catches both
> `User.DoesNotExist` and `Patient.DoesNotExist` inside a broad `except`
> block and returns 500. This is the current documented runtime behaviour.

---

### PUT — update profile

Whitelisted fields only (defined per role in `PATIENT_ALLOWED_*` /
`TH_ALLOWED_*` dicts in the view).  Any field not in the whitelist is
silently ignored.

#### Overposting protection

Fields `pwdhash`, `role`, `createdAt`, `updatedAt`, `id`, `_id`, `userId`,
`therapist`, `last_online` are explicitly stripped before processing.
Sending them in the body must never modify those database values.

#### Password change via PUT

The profile PUT endpoint also handles password changes when
`oldPassword` / `newPassword` are supplied.  Verification order:

```
oldPassword present? ──No──► 400 "Old password required"
newPassword present? ──No──► 400 "New password required"
check_password(old) ──Fail──► 403 "Old password incorrect"
                    ──Pass──► hash new password, save, 200
```

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_user_profile_view_update_password_success` | Correct old + new password (mocked) | 200, 'Profile updated' |
| `test_user_profile_view_update_password_wrong_old` | Wrong old password | 403, 'Old password incorrect' |
| `test_user_profile_view_update_password_missing_old` | Only `newPassword` sent | 400, 'Old password required' |
| `test_user_profile_view_update_password_missing_new` | Only `oldPassword` sent | 400, 'New password required' |
| `test_user_profile_view_update_therapist_fields` | Valid `first_name`, `name` | 200, updated keys in response |
| `test_user_profile_view_update_patient_reha_end_date` | Valid `reha_end_date` string | 200, `reha_end_date` in updated |
| `test_user_profile_view_update_invalid_date_format` | `reha_end_date = "not-a-date"` | 400, 'Invalid date format' |
| `test_user_profile_view_update_invalid_email` | `email = "not-valid"` | 400, 'Invalid email' |
| `test_user_profile_view_update_invalid_phone` | `phone = "not-a-phone"` | 400, 'Invalid phone' |
| `test_user_profile_view_overposting_forbidden_fields_are_ignored` | `role="Admin"`, `pwdhash="hacked"` in body | 200; DB values unchanged |

---

### DELETE — deactivate account

DELETE performs a **soft-delete**: `User.isActive` is set to `False` and a
`DELETE_ACCOUNT` log entry is created.  The document is **not** removed from
the database, preserving audit history and referential integrity with
rehabilitation plans and intervention logs.

Contrast with `decline_user` (admin endpoint) which performs a **hard-delete**.

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_user_profile_view_delete_success` | Existing user | 200, 'User deleted' |
| `test_user_profile_view_delete_is_soft_delete` | Existing user | Document still in DB; `isActive = False` |

---

### HTTP method enforcement

| Test | Method | Expected |
|---|---|---|
| `test_user_profile_view_method_not_allowed` | POST | 405, 'Method not allowed' |

---

## `get_pending_users`  —  `GET /api/admin/pending-users/`

Returns all Users with `isActive=False`.  For Therapist users, the response
also embeds fields from the linked Therapist document so the admin UI has
enough context to make an approval decision.

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_get_pending_users_success` | One inactive user | 200, user appears in `pending_users` |
| `test_get_pending_users_empty_when_all_active` | All users active | 200, user absent from list |
| `test_get_pending_users_therapist_includes_therapist_details` | Inactive Therapist | Entry has `therapistId`, `name`, `specializations`, `clinics`, `projects` |
| `test_get_pending_users_method_not_allowed` | POST | 405 |

---

## `accept_user`  —  `POST /api/admin/accept-user/`

Sets `User.isActive = True` and sends an activation e-mail to the user.

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_accept_user_success` | Inactive user, valid `userId` | 200, 'User accepted successfully', one e-mail sent |
| `test_accept_user_sets_active_flag` | Inactive user | `User.isActive` is `True` after call |
| `test_accept_user_not_found` | Unknown ObjectId | 404, 'User not found' |
| `test_accept_user_missing_user_id` | Empty body | 400 |
| `test_accept_user_invalid_objectid` | Malformed ObjectId string | 400 |
| `test_accept_user_get_method_not_allowed` | GET | 405 |

---

## `decline_user`  —  `POST /api/admin/decline-user/`

**Hard-deletes** the User document and sends a rejection e-mail.  This is
the only user-related operation that permanently removes data.

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_decline_user_success` | Existing user, valid `userId` | 200, 'User declined and deleted successfully', one e-mail sent |
| `test_decline_user_removes_user_from_db` | Existing user | `User.objects.filter(pk=…).first()` returns `None` after call |
| `test_decline_user_not_found` | Unknown ObjectId | 404, 'User not found' |
| `test_decline_user_missing_user_id` | Empty body | 400 |
| `test_decline_user_invalid_objectid` | Malformed ObjectId string | 400 |
| `test_decline_user_get_method_not_allowed` | GET | 405 |

---

## `change_password`  —  `PUT /api/users/<user_id>/change-password/`

> **Important runtime behaviour:** this endpoint currently returns HTTP 400
> for every password-change attempt and redirects callers to use the profile
> endpoint's password-change path (`PUT /api/users/<id>/profile/` with
> `oldPassword` / `newPassword`).  The password-changing code exists in the
> view but is unreachable because the early-return guard catches all cases
> where `old_password` or `new_password` appear in the body.

The tests below document the *actual* responses rather than an idealised API
contract.  If the view is fixed in the future, the assertions should be
updated accordingly.

#### Decision tree (current)

```
old_password or new_password present?
│
├── old_password missing ──► 400 "Old password required"
└── both present ──────────► 400 "Password updates must use the change-password endpoint."

neither present ────────────► 400 "Missing password fields"
```

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_change_password_with_both_fields_returns_400` | `old_password` + `new_password` sent | 400, message references password / change-password |
| `test_change_password_missing_old_returns_400` | Only `new_password` sent | 400, 'Old password required' |
| `test_change_password_missing_both_returns_400` | Empty body | 400, 'Missing password fields' |
| `test_change_password_user_not_found` | Unknown ObjectId, empty body | 404 |
| `test_change_password_get_method_not_allowed` | GET | 405 |

---

## Delete semantics comparison

| Operation | Endpoint | Type | DB document after | `isActive` |
|---|---|---|---|---|
| User self-deactivates | `DELETE /api/users/<id>/profile/` | Soft | Still present | `False` |
| Admin declines | `POST /api/admin/decline-user/` | Hard | **Removed** | N/A |

---

## Running the tests

```bash
# From the backend/ directory
pytest tests/user_views/ -v
```

---

## Test infrastructure

### `mongo_mock` fixture

The `autouse` `mongo_mock` fixture (function scope) provides a fresh
in-memory mongomock connection for every test.  No state leaks between tests.

### Factory helpers

| Helper | Creates |
|---|---|
| `create_user_and_therapist()` | `User` (Therapist role) + linked `Therapist` document |
| `create_patient()` | `User` (Patient) + `User` + `Therapist` + `Patient` chain |

### Mocking

- `core.views.user_views.send_mail` — mocked in accept/decline tests to
  prevent real SMTP connections.
- `core.views.user_views.check_password` / `make_password` — mocked in
  password-change tests to make them deterministic and independent of
  Django's hashing implementation.
