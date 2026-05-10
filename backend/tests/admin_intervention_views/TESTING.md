# Admin Intervention Views — Test Documentation

This document describes every test in
[`test_admin_intervention_views.py`](test_admin_intervention_views.py) for
the two endpoints under `/api/admin/interventions/`.

---

## Endpoints and their test coverage

| Endpoint | HTTP verb | View function | Tests |
|---|---|---|---|
| `/api/admin/interventions/` | GET | `admin_interventions → _list_interventions` | 6 |
| `/api/admin/interventions/<id>/` | DELETE | `admin_interventions → _delete_intervention` | 8 |

**Total: 14 tests**

---

## Feature overview

These endpoints give an Admin a way to browse the full intervention catalogue
(including private interventions that are hidden from therapists and patients)
and to permanently delete individual interventions with automatic cascade
cleanup.

```
Admin GET /api/admin/interventions/
  → JSON list of all Intervention documents (public + private)
  → Optional filters: ?q=<search>, ?lang=<code>, ?content_type=<type>

Admin DELETE /api/admin/interventions/<id>/
  → Deletes the Intervention document
  → Cascades to: media files, InterventionTemplate.recommendations,
                 Therapist.default_recommendations,
                 RehabilitationPlan.interventions,
                 PatientInterventionLogs
```

---

## `_list_interventions` — `GET /api/admin/interventions/`

Returns all interventions regardless of `is_private`.  Supports optional
filtering by language and title/external_id search.

### Query parameters

| Parameter | Description |
|---|---|
| `q` | Case-insensitive substring match against `title` or `external_id` |
| `lang` | Exact match against `language` (e.g. `en`, `de`) |
| `content_type` | Exact match against `content_type` (e.g. `Video`) |

### Response shape

```json
{
  "interventions": [
    {
      "_id": "…",
      "external_id": "stretch_001",
      "language": "en",
      "title": "Stretching",
      "content_type": "Video",
      "is_private": false,
      "provider": null,
      "preview_img": ""
    }
  ]
}
```

### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_list_returns_all_interventions` | One public + one private intervention | Both appear in the response |
| `test_list_empty_when_no_interventions` | Empty DB | `{ "interventions": [] }` |
| `test_list_response_shape` | One intervention | Each item has `_id`, `external_id`, `language`, `title`, `content_type`, `is_private` |
| `test_list_filter_by_lang` | Two interventions with different languages, `?lang=de` | Only the `de` intervention returned |
| `test_list_search_by_title` | Two interventions, `?q=stretch` | Only the intervention with "stretch" in the title returned |
| `test_list_search_by_external_id` | Three interventions, `?q=cardiac` | Only the two with "cardiac" in `external_id` returned |

---

## `_delete_intervention` — `DELETE /api/admin/interventions/<id>/`

Permanently removes an `Intervention` document and all data that references
it, in a safe order that avoids orphaned references.

### Cascade order

1. **Media files** — `default_storage.delete()` for each `Intervention.media[].file_path` and `Intervention.preview_img` (errors are logged and skipped, not fatal)
2. **`InterventionTemplate.recommendations`** — the matching `DefaultInterventions` entry is removed from every template
3. **`Therapist.default_recommendations`** — the matching entry is removed from every therapist
4. **`RehabilitationPlan.interventions`** — the matching `InterventionAssignment` is removed from every plan
5. **`PatientInterventionLogs`** — all log documents referencing the intervention are deleted
6. **`Intervention`** — the document itself is deleted

### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_delete_removes_intervention` | Valid existing intervention id | 200, `Intervention.objects.count() == 0` |
| `test_delete_returns_404_for_unknown_id` | Well-formed ObjectId not in DB | 404 |
| `test_delete_returns_400_for_malformed_id` | Non-ObjectId string | 400 |
| `test_delete_cascades_intervention_template_recommendations` | Intervention is in one template's `recommendations` | Template's `recommendations` list is empty after delete |
| `test_delete_cascades_therapist_default_recommendations` | Intervention is in one therapist's `default_recommendations` | Therapist's list is empty after delete |
| `test_delete_cascades_rehabilitation_plan_assignments` | Intervention is assigned in one rehab plan | Plan's `interventions` list is empty after delete |
| `test_delete_cascades_patient_intervention_logs` | One `PatientInterventionLogs` document references the intervention | Log document is deleted |
| `test_delete_get_method_not_allowed_on_single_route` | GET on `/api/admin/interventions/<id>/` | 405 (only DELETE is supported on the id-scoped route) |

---

## Running the tests

```bash
# From the project root (runs inside the django container)
docker exec django pytest tests/admin_intervention_views/ -v
```

---

## Test infrastructure

### `mongo_mock` fixture

Function-scoped `autouse` fixture that connects to an in-memory mongomock
instance for every test and disconnects after.  Tests are fully isolated —
no shared state between test functions.

### Factory helpers

| Helper | Creates |
|---|---|
| `_make_intervention(external_id, language, is_private, title)` | A single `Intervention` document |
| `_make_therapist()` | A `User` + `Therapist` document |
| `_make_patient(therapist)` | A `User` + `Patient` document linked to the given therapist |
