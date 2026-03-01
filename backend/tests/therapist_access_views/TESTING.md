# Therapist Access Views — Test Documentation

This document describes tests in
[`test_therapist_access_views.py`](test_therapist_access_views.py) for
`core/views/therapist_access_views.py`.

---

## Endpoints and coverage

| Endpoint | HTTP verb | View function | Tests |
|---|---|---|---|
| `/api/admin/therapist/access/<therapistId>/` | GET | `therapist_access` | 3 |
| `/api/admin/therapist/access/` | PUT | `therapist_access` | 6 |

**Total: 9 tests**

---

## Scenarios covered

### GET access metadata

| Test | Scenario | Expected |
|---|---|---|
| `test_access_get_requires_therapist_id` | Missing therapist id | 400, `therapistId is required.` |
| `test_access_get_not_found` | Unknown therapist id | 404, `Therapist not found.` |
| `test_access_get_success` | Valid therapist id | 200, current clinics/projects and available values |

### PUT access update

| Test | Scenario | Expected |
|---|---|---|
| `test_access_put_invalid_json` | Malformed JSON body | 400, `Invalid JSON.` |
| `test_access_put_requires_therapist_id` | Missing therapist id in path/body | 400 |
| `test_access_put_requires_list_fields` | `clinics` not list | 400 |
| `test_access_put_invalid_clinic_value` | Clinic not in configured list | 400 with `invalid` key |
| `test_access_put_rejects_project_not_allowed_for_selected_clinic` | Project not compatible with selected clinic | 400 with `allowedProjects` |
| `test_access_put_success_updates_and_logs` | Valid deduplicated payload | 200, DB updated, one `UPDATE_PROFILE` log |

---

## Running

```bash
# From backend/ (or inside docker container /app)
pytest tests/therapist_access_views/ -v
```

---

## Test infrastructure

- `mongo_mock` autouse fixture gives each test a fresh in-memory mongomock DB.
- Tests use Django `Client` and real URL routes (not direct function calls).
