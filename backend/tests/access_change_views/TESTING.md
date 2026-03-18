# Access Change Views — Test Documentation

This document describes tests in
[`test_access_change_views.py`](test_access_change_views.py) for
`core/views/access_change_views.py`.

---

## Endpoints and coverage

| Endpoint | HTTP verb | View function | Tests |
|---|---|---|---|
| `/api/therapist/access-change-request/` | GET | `submit_access_change_request` | 3 |
| `/api/therapist/access-change-request/` | POST | `submit_access_change_request` | 5 |
| `/api/admin/access-change-requests/` | GET | `admin_access_change_requests` | 3 |
| `/api/admin/access-change-requests/<id>/` | PUT | `admin_access_change_requests` | 5 |

**Total: 16 tests**

---

## Flow overview

```
Therapist POST  →  pending TherapistAccessChangeRequest
                   + email to all Admin users
Admin GET       →  list pending (or all) requests
Admin PUT       →  approve: update Therapist.clinics/projects + email therapist
                   reject:  email therapist with optional note
```

---

## Scenarios covered

### GET therapist pending status

| Test | Scenario | Expected |
|---|---|---|
| `test_get_has_pending_false_when_no_requests` | No requests in DB | 200, `hasPending: false` |
| `test_get_has_pending_true_when_pending_request_exists` | One pending request | 200, `hasPending: true` |
| `test_get_returns_404_when_no_therapist_profile` | No therapist profile for user | 404 |

### POST therapist submits change request

| Test | Scenario | Expected |
|---|---|---|
| `test_post_creates_pending_request` | Valid clinic and project | 201, request saved with `status=pending` |
| `test_post_rejects_invalid_clinic` | Clinic not in config | 400 |
| `test_post_rejects_invalid_project` | Project not in config | 400 |
| `test_post_supersedes_existing_pending_request` | Already-pending request exists | 201, old request becomes `rejected` with "Superseded" note |
| `test_post_returns_404_when_no_therapist_profile` | No therapist profile | 404 |

### GET admin lists requests

| Test | Scenario | Expected |
|---|---|---|
| `test_admin_get_lists_pending_requests` | One pending request | 200, list length 1, `status=pending` |
| `test_admin_get_filters_by_status_all` | `?status=all` | 200, returns requests of all statuses |
| `test_admin_get_serializes_therapist_name_and_email` | Valid request | Serialized `therapistName`, `therapistEmail`, `currentClinics` |

### PUT admin approves or rejects

| Test | Scenario | Expected |
|---|---|---|
| `test_admin_put_approve_updates_therapist_clinics_and_projects` | Approve pending request | 200, `status=approved`, therapist DB updated |
| `test_admin_put_reject_marks_request_rejected_without_changing_access` | Reject with note | 200, `status=rejected`, therapist access unchanged |
| `test_admin_put_returns_400_for_already_reviewed_request` | Request already approved/rejected | 400 |
| `test_admin_put_returns_404_for_unknown_id` | Non-existent request ID | 404 |
| `test_admin_put_returns_400_for_invalid_action` | `action=delete` (unsupported) | 400 |
| `test_admin_put_requires_request_id_in_url` | PUT to base URL (no `<id>`) | 400 |

---

## Running

```bash
# From backend/ (or inside the django container)
pytest tests/access_change_views/ -v
```

---

## Test infrastructure

- `mongo_mock` autouse fixture gives each test a fresh in-memory mongomock DB.
- `no_mail` fixture patches `send_mail` so no actual e-mails are sent during tests.
- `core.views.access_change_views._get_therapist` is patched per-test to bypass JWT validation.
- DRF `APIClient.force_authenticate` satisfies `IsAuthenticated` without a real JWT token.
