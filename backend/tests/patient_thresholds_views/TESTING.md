# Patient Thresholds Views — Test Documentation

This document describes tests in
[`test_patient_thresholds_views.py`](test_patient_thresholds_views.py) and
[`test_patient_threshold_helpers.py`](test_patient_threshold_helpers.py)
for `core/views/patient_thresholds.py`.

---

## Endpoints and coverage

| Endpoint | HTTP verb | View function | Tests |
|---|---|---|---|
| `/api/patients/<patient_id>/thresholds/` | GET | `patient_thresholds_view` | 2 |
| `/api/patients/<patient_id>/thresholds/` | PATCH | `patient_thresholds_view` | 4 |
| `/api/patients/<patient_id>/thresholds/` | POST | `patient_thresholds_view` | 1 |
| `/api/patients/<patient_id>/thresholds/` | DELETE | `patient_thresholds_view` | 1 |

**Total: 11 tests**

---

## Scenarios covered

| Test | Scenario | Expected |
|---|---|---|
| `test_thresholds_get_patient_not_found` | Unknown patient id | 404 |
| `test_thresholds_get_success_with_defaults` | Existing patient with default thresholds | 200 with thresholds + empty history |
| `test_thresholds_method_not_allowed` | DELETE on endpoint | 405 |
| `test_thresholds_patch_invalid_json` | Invalid JSON body | 400 |
| `test_thresholds_patch_validation_error_unknown_field` | Unknown threshold field | 400 with `field_errors` |
| `test_thresholds_patch_validation_error_cross_field` | Green active-minutes less than yellow | 400 with cross-field error |
| `test_thresholds_patch_success_updates_values_and_creates_history_snapshot` | Valid update with reason/effective date | 200, thresholds updated, history appended |
| `test_thresholds_post_uses_same_update_logic` | POST with thresholds payload | 200 update success |
| `test_thresholds_helpers_parse_user_role_and_dict_fallback` | helper parsing/role/dict-conversion branches | helper outputs validated |
| `test_thresholds_serializer_and_merge_logic` | serializer ranges + merge/equality helpers | expected validation and merge behavior |
| `test_update_thresholds_noop_and_history_and_view_error_branches` | no-op update, history append, and exception path | no unnecessary writes + error response branch |

---

## Running

```bash
pytest tests/patient_thresholds_views/ -v
```

---

## Test infrastructure

- Fresh in-memory mongomock DB per test via `mongo_mock` autouse fixture.
- Integration-style calls through Django `Client` for routed endpoint tests.
- Helper-branch tests call view/service helpers directly with targeted patching.
