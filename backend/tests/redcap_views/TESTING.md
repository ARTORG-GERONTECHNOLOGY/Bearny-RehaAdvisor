# REDCap Views — Test Documentation

This document describes tests in
[`test_redcap_views.py`](test_redcap_views.py) for REDCap-related views:

- `core/views/redcap_views.py` (`redcap_projects`)
- `core/views/redcap_patient_views.py` (`redcap_patient`)

---

## Endpoints and coverage

| Endpoint | HTTP verb | View function | Tests |
|---|---|---|---|
| `/api/redcap/projects/` | GET | `redcap_projects` | 3 |
| `/api/redcap/patient/` | GET | `redcap_patient` | 7 |

**Total: 10 tests**

---

## Access-control and error handling model

The REDCap endpoints are therapist-scoped:

- Therapist profile must resolve from request context.
- The requested project must be in therapist-allowed projects.
- Upstream REDCap failures return error payloads (typically 502 paths).

Service-layer dependencies are mocked in tests to isolate view behavior.

---

## Scenarios covered

### `redcap_projects`

| Test | Scenario | Expected |
|---|---|---|
| `test_redcap_projects_therapist_not_found` | Therapist cannot be resolved | 404 |
| `test_redcap_projects_success` | Therapist + allowed projects resolved | 200 with clinics + allowedProjects |
| `test_redcap_projects_method_not_allowed` | POST instead of GET | 405 |

### `redcap_patient`

| Test | Scenario | Expected |
|---|---|---|
| `test_redcap_patient_requires_patient_code` | Missing `patient_code` query param | 400 |
| `test_redcap_patient_therapist_not_found` | No therapist found | 404 |
| `test_redcap_patient_no_allowed_projects` | Therapist has no REDCap projects | 403 |
| `test_redcap_patient_forbidden_project` | Requested project not allowed | 403 with `allowedProjects` |
| `test_redcap_patient_not_found_when_no_rows` | Upstream returns no rows | 404 not found payload |
| `test_redcap_patient_returns_502_when_all_projects_error` | Upstream errors for all searched projects | 502 with errors list; REDCap error text not in response |
| `test_redcap_patient_success_with_partial_errors` | One project succeeds, one errors | 200 with both `matches` and `errors` |

---

## Running

```bash
# From backend/ (or inside docker container /app)
pytest tests/redcap_views/ -v
```

---

## Test infrastructure

- `mongo_mock` autouse fixture: fresh in-memory mongomock DB per test.
- `unittest.mock.patch` is used to stub REDCap service calls and therapist resolution.

