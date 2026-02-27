# Therapist Projects Views — Test Documentation

This document describes tests in
[`test_therapist_projects_views.py`](test_therapist_projects_views.py)
for `core/views/therapist_projects.py`.

---

## Why direct-view tests

`therapist_projects` is currently not mapped in `core/urls.py`, so these tests
use `RequestFactory` and call the view function directly.

---

## Coverage summary

| Component | Tests |
|---|---|
| `_bad` helper | 1 |
| `therapist_projects` GET | 3 |
| `therapist_projects` PUT validation | 3 |
| `therapist_projects` PUT success | 1 |

**Total: 8 tests**

---

## Scenarios covered

| Test | Scenario | Expected |
|---|---|---|
| `test_bad_helper_shape` | `_bad` helper with extra payload | Custom status + merged payload |
| `test_projects_get_requires_therapist_id` | Missing `therapistId` query param | 400 |
| `test_projects_get_not_found` | Unknown therapist id | 404 |
| `test_projects_get_success` | Valid therapist id | 200 with therapist ids, projects, availableProjects |
| `test_projects_put_invalid_json` | Invalid JSON body | 400 |
| `test_projects_put_requires_therapist_id` | Missing therapist id in body | 400 |
| `test_projects_put_requires_projects_field` | Missing `projects` | 400 |
| `test_projects_put_success_updates_projects_and_logs` | Valid PUT payload with duplicates/empty items | 200, normalized projects saved, `UPDATE_PROFILE` log created |

---

## Running

```bash
pytest tests/therapist_projects_views/ -v
```
