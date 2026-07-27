# Patient Flag + Comments Views — Test Documentation

This document describes tests in
[`test_patient_flag_views.py`](test_patient_flag_views.py) and
[`test_patient_flag_helpers.py`](test_patient_flag_helpers.py)
for `core/views/patient_flag_views.py`.

---

## Endpoints and coverage

| Endpoint | HTTP verb | View function | Tests |
|---|---|---|---|
| `/api/patients/<patient_id>/flag/` | PATCH | `patient_flag_view` | 7 |
| `/api/patients/<patient_id>/comments/` | GET | `patient_comments_view` | 4 |
| `/api/patients/<patient_id>/comments/` | POST | `patient_comments_view` | 6 |

**Total: 31 tests** (16 HTTP-level + 15 helper/unit-level)

---

## Scenarios covered

### `test_patient_flag_views.py` (HTTP-level, via Django `Client`)

| Test | Scenario | Expected |
|---|---|---|
| `test_flag_patient_not_found` | Unknown but well-formed patient id | 404 |
| `test_flag_patient_malformed_id_returns_404_not_500` | Garbage (non-ObjectId) patient id | 404, not an unhandled crash |
| `test_flag_method_not_allowed` | GET on `/flag/` | 405 |
| `test_flag_invalid_json` | Invalid JSON body | 400 |
| `test_flag_validation_error_missing_field` | PATCH with no `flagged` key | 400 with `field_errors` |
| `test_flag_validation_error_non_bool` | `flagged` is not a boolean | 400 with `field_errors` |
| `test_flag_success_sets_audit_fields_and_unflag_clears_them` | Flag then unflag | 200; `flagged_at`/`flagged_by` set then cleared |
| `test_comments_get_not_found` / `..._malformed_id_...` | Unknown / garbage patient id | 404 |
| `test_comments_method_not_allowed` | DELETE on `/comments/` | 405 |
| `test_comments_get_empty_list_for_fresh_patient` | No comments yet | 200, `comments: []` |
| `test_comments_post_invalid_json` | Invalid JSON body | 400 |
| `test_comments_post_missing_text` / `..._whitespace_only_text` / `..._text_too_long` | Invalid `text` | 400 with `field_errors` |
| `test_comments_post_success_then_get_returns_newest_first` | Add two comments | 201, then GET returns both, newest first |

### `test_patient_flag_helpers.py` (direct calls to internal helpers)

| Test | Scenario | Expected |
|---|---|---|
| `test_get_patient_found_by_pk` | Valid patient id | Patient returned |
| `test_get_patient_malformed_id_returns_none` | Garbage id | `None`, not an `InvalidId` crash |
| `test_get_patient_wellformed_but_nonexistent_id_returns_none` | Valid ObjectId, no such patient | `None` |
| `test_get_patient_found_by_linked_user_id` | Id matches a Patient's linked User id, not its own pk | Patient returned via the userId fallback |
| `test_coerce_aware_none_naive_and_aware` | `None`, naive, and aware datetimes | Always returns an aware datetime |
| `test_comment_to_dict_and_sort_key` | Serializing a comment | Matches expected dict shape |
| `test_comments_sort_tolerates_naive_created_at` | Comment list mixing naive and aware `created_at` | 200, no `TypeError`, correct order |
| `test_display_name_uses_therapist_full_name` | Caller has a linked Therapist | Returns `"First Last"` |
| `test_display_name_falls_back_to_username_when_no_therapist_linked` | Caller has no Therapist (e.g. Admin) | Falls back to the Mongo User's username, not blank |
| `test_display_name_returns_empty_string_when_user_unresolvable` | Caller resolves to neither a Therapist nor a User | `""` |
| `test_authorize_admin_bypasses_clinic_check` | Admin caller | Allowed regardless of clinic |
| `test_authorize_therapist_same_clinic_allowed` | Therapist's clinic matches patient's | Allowed |
| `test_authorize_therapist_different_clinic_forbidden` | Therapist's clinic differs | 403 |
| `test_authorize_no_therapist_for_caller_forbidden` | Caller has no Therapist record and isn't Admin | 403 |
| `test_concurrent_comment_appends_do_not_lose_either_comment` | Two "requests" load the patient before either saves, then both add a comment | Both comments persist — the atomic `$push` used in `patient_comments_view` must not lose either one to a read-modify-write race |

---

## Running

```bash
pytest tests/patient_flag_views/ -v
```

---

## Test infrastructure

- Fresh in-memory mongomock DB per test via `mongo_mock` autouse fixture.
- Integration-style calls through Django `Client` for routed endpoint tests.
- `_authorize()` returns `None` (allowed) unconditionally whenever `settings.TESTING` is true, so its unit tests temporarily flip `TESTING = False` for the duration of the call (restored in a `finally`) — the same approach used in `tests/security/test_security_fixes.py`'s fix6 tests — to actually exercise the admin-bypass / clinic-match logic instead of just hitting the bypass.
