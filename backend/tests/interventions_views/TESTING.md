# Intervention Views — Test Documentation

This document describes every test in
[`test_interventions_views.py`](test_interventions_views.py) for the ten
endpoints exposed under `/api/interventions/` and `/api/therapists/`.

---

## Endpoints and their test coverage

| Endpoint | HTTP verb | View function | Tests |
|---|---|---|---|
| `/api/interventions/all/` | GET | `list_all_interventions` | 3 |
| `/api/interventions/all/<patient_id>/` | GET | `list_all_interventions` | (shared above) |
| `/api/interventions/add/` | POST | `add_new_intervention` | 7 |
| `/api/interventions/<id>/` | GET | `get_intervention_detail` | 4 |
| `/api/interventions/<id>/assigned-diagnoses/<spec>/therapist/<th_id>/` | GET | `list_intervention_diagnoses` | 3 |
| `/api/therapists/<th_id>/interventions/assign-to-patient-types/` | POST | `assign_intervention_to_types` | 6 |
| `/api/therapists/<th_id>/interventions/remove-from-patient-types/` | POST | `remove_intervention_from_types` | 7 |
| `/api/recomendation/add/patientgroup/` | POST | `create_patient_group` | 6 |
| `/api/therapists/<th_id>/template-plan` | GET | `template_plan_preview` | 3 |
| `/api/therapists/<th_id>/templates/apply` | POST | `apply_template_to_patient` | 5 |

**Total: 44 tests**

---

## Data model overview

```
Intervention
  ├── external_id + language  (unique combination per public intervention)
  ├── content_type             (Video, Audio, PDF, …)
  ├── media []                 (external URL or uploaded file)
  ├── patient_types []         (PatientType: diagnosis + speciality + frequency)
  └── is_private               (True → belongs to a specific Patient)

Therapist
  └── default_recommendations []
        └── DefaultInterventions
              ├── recommendation  →  Intervention
              └── diagnosis_assignments  { diagnosis: [DiagnosisAssignmentSettings, …] }
```

---

## `list_all_interventions`  —  `GET /api/interventions/all/(<patient_id>/)?`

Returns all public interventions grouped by `external_id` (best language
variant picked), plus any private interventions belonging to `patient_id` when
supplied.

#### Response item shape

| Field | Description |
|---|---|
| `_id` | MongoDB ObjectId string |
| `title` | Intervention title |
| `content_type` | Canonical type (Video, Audio, …) |
| `is_private` | `false` for public interventions |
| `available_languages` | Languages available for this `external_id` |
| `tags` | Deduplicated union of topic, lc9, where, setting, keywords |

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_list_all_interventions_success` | One intervention in DB | 200, list contains item with `title` |
| `test_list_all_interventions_empty_db` | Empty DB | 200, `[]` |
| `test_list_all_interventions_response_item_shape` | One intervention | Item has `_id`, `title`, `content_type`, `is_private` |

---

## `add_new_intervention`  —  `POST /api/interventions/add/`

Accepts `multipart/form-data`.  Required fields: `title`, `description`,
`contentType`, `duration > 0`.  Media can be supplied as a JSON `media` array
(external URLs) or as a file upload (`media_file`).

#### Validation rules

| Field | Rule |
|---|---|
| `title` | Required, non-empty |
| `description` | Required, non-empty |
| `contentType` | Required; normalised to TitleCase; must be in `ALLOWED_CONTENT_TYPES` |
| `duration` | Required; must be parseable integer > 0 |
| `external_id` + `language` | If provided, must be unique (no existing document with same pair) |

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_add_new_intervention_success` | All required fields + external URL media | 200, `success: true` |
| `test_add_new_intervention_with_file_upload` | Multipart file (storage mocked) | 200, `success: true` |
| `test_add_new_intervention_missing_title` | No `title` | 400, `field_errors.title` |
| `test_add_new_intervention_missing_description` | No `description` | 400, `field_errors.description` |
| `test_add_new_intervention_missing_content_type` | No `contentType` | 400, `field_errors.contentType` |
| `test_add_new_intervention_duration_zero_or_missing` | `duration=0` | 400, `field_errors.duration` |
| `test_add_new_intervention_duplicate_external_id` | Same `external_id`+`language` as existing | 400, `error` key present (no `success` key) |
| `test_add_new_intervention_get_method_not_allowed` | GET | 405 |

---

## `get_intervention_detail`  —  `GET /api/interventions/<id>/`

Returns full detail of one intervention plus any patient feedback logs.

#### Response shape

```json
{
  "recommendation": { "_id": "…", "title": "…", "media": [], … },
  "feedback": []
}
```

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_get_intervention_detail_success` | Existing intervention | 200, `recommendation` key present |
| `test_get_intervention_detail_response_shape` | Existing intervention | Both `recommendation` and `feedback` present; `feedback` is a list |
| `test_get_intervention_detail_not_found` | Unknown ObjectId | 404 |
| `test_get_intervention_detail_method_not_allowed` | POST | 405 |

---

## `list_intervention_diagnoses`  —  `GET …/assigned-diagnoses/<spec>/therapist/<th_id>/`

Returns a dict of all diagnoses for the given specialisation(s) mapped to
their assigned state (`True`/`False`), plus an `all` flag.

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_list_intervention_diagnoses_success` | Therapist with recommendation | 200, `diagnoses` dict |
| `test_list_intervention_diagnoses_not_found` | Unknown therapist ObjectId | 404 |
| `test_list_intervention_diagnoses_method_not_allowed` | POST | 405 |

---

## `assign_intervention_to_types`  —  `POST …/assign-to-patient-types/`

Stores a `DiagnosisAssignmentSettings` block on the therapist's
`default_recommendations` for the given diagnosis.  If no entry exists for the
intervention, one is created.

#### Payload structure

```json
{
  "diagnosis": "Heart Attack",
  "interventions": [{
    "interventionId": "<ObjectId>",
    "interval": 2,
    "unit": "week",
    "selectedDays": ["Monday"],
    "start_day": 1,
    "end": { "type": "count", "count": 7 },
    "suggested_execution_time": 10
  }]
}
```

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_assign_intervention_to_types_success` | Valid therapist, intervention, and payload | 200/201, `success: true` |
| `test_assign_intervention_to_types_therapist_not_found` | Unknown therapist ObjectId | 404 |
| `test_assign_intervention_to_types_missing_diagnosis` | No `diagnosis` | 400, `field_errors.diagnosis` |
| `test_assign_intervention_to_types_missing_interventions_list` | No `interventions` | 400, `field_errors.interventions` |
| `test_assign_intervention_to_types_malformed_json` | Invalid JSON body | 400 |
| `test_assign_intervention_to_types_get_method_not_allowed` | GET | 405 |

---

## `remove_intervention_from_types`  —  `POST …/remove-from-patient-types/`

Removes a `DiagnosisAssignmentSettings` block (entire diagnosis or a single
`start_day` block) from the therapist's `default_recommendations`.

Returns 404 when:
- Therapist not found.
- Therapist has no recommendation entry for the intervention.
- Therapist has no assignment for the given diagnosis.
- `start_day` provided but no matching block found.

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_remove_intervention_from_types_success` | Existing recommendation block | 200, `success: true` |
| `test_remove_intervention_from_types_no_recommendation` | No recommendation for intervention | 404 |
| `test_remove_intervention_from_types_therapist_not_found` | Unknown therapist | 404 |
| `test_remove_intervention_from_types_missing_intervention_id` | No `intervention_id` | 400, `field_errors.intervention_id` |
| `test_remove_intervention_from_types_missing_diagnosis` | No `diagnosis` | 400, `field_errors.diagnosis` |
| `test_remove_intervention_from_types_malformed_json` | Invalid JSON body | 400 |
| `test_remove_intervention_from_types_get_method_not_allowed` | GET | 405 |

---

## `create_patient_group`  —  `POST /api/recomendation/add/patientgroup/`

Appends a `PatientType` entry (diagnosis + speciality + frequency) to an
existing Intervention.  A duplicate entry (same `diagnosis` + `speciality`) on
the same Intervention returns 400.

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_create_patient_group_success` | Valid payload, existing intervention | 200, `success: true` |
| `test_create_patient_group_missing_fields` | Only `diagnosis` provided | 400, `field_errors` with `interventionId`, `speciality`, `frequency` |
| `test_create_patient_group_not_found` | Valid ObjectId but no matching Intervention | 404 |
| `test_create_patient_group_duplicate_returns_400` | Same diagnosis + speciality twice | 400, `success: false` |
| `test_create_patient_group_invalid_objectid` | Malformed `interventionId` | 400 |
| `test_create_patient_group_get_method_not_allowed` | GET | 405 |

---

## `template_plan_preview`  —  `GET /api/therapists/<th_id>/template-plan`

Returns a preview of the scheduled occurrences (day + time) for each of the
therapist's default recommendation blocks, within a configurable `horizon`
(default 84 days).

#### Response shape

```json
{
  "horizon_days": 84,
  "items": [{
    "diagnosis": "Heart Attack",
    "intervention": { "_id": "…", "title": "…" },
    "schedule": { "unit": "week", "interval": 1, … },
    "occurrences": [{ "day": 1, "time": "08:00" }, …],
    "segments": [ … ]
  }]
}
```

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_template_plan_preview_success` | Therapist with no recommendations | 200, `items: []` |
| `test_template_plan_preview_with_recommendation` | Therapist with one block | 200, `items` non-empty; item has `intervention`, `diagnosis`, `schedule`, `occurrences` |
| `test_template_plan_preview_therapist_not_found` | Unknown therapist ObjectId | 404 |

---

## `apply_template_to_patient`  —  `POST /api/therapists/<th_id>/templates/apply`

Applies the therapist's default recommendation template to a specific patient,
creating or updating their `RehabilitationPlan`.

#### Required payload fields

| Field | Description |
|---|---|
| `patientId` | ObjectId or `patient_code` of the target Patient |
| `diagnosis` | Diagnosis string to match in the therapist's recommendations |
| `effectiveFrom` | Start date (`YYYY-MM-DD`) for scheduling |

#### Tests

| Test | Scenario | Expected |
|---|---|---|
| `test_apply_template_missing_required_fields` | Empty body | 400, `field_errors` with `patientId`, `diagnosis`, `effectiveFrom` |
| `test_apply_template_therapist_not_found` | Unknown therapist ObjectId | 404 |
| `test_apply_template_patient_not_found` | Valid therapist, unknown patient | 404 |
| `test_apply_template_invalid_effective_date` | `effectiveFrom = "not-a-date"` | 400, `field_errors.effectiveFrom` |
| `test_apply_template_get_method_not_allowed` | GET | 405 |

---

## Running the tests

```bash
# From the backend/ directory
pytest tests/interventions_views/ -v
```

---

## Test infrastructure

### `mongo_mock` fixture

Function-scoped `autouse` fixture providing a clean in-memory mongomock
connection for every test.

### Factory helpers

| Helper | Creates |
|---|---|
| `create_intervention(external_id, language)` | A single `Intervention` document |
| `create_therapist_and_intervention()` | A `User` + `Therapist` + one `Intervention` |
| `add_default_recommendation_block(therapist, intervention, diagnosis)` | A `DiagnosisAssignmentSettings` block on the therapist's `default_recommendations` |

### Mocking

- `core.views.recomendation_views.default_storage.save` — mocked in file-upload
  tests to return a fixed path without touching the filesystem.

### File uploads

`SimpleUploadedFile` is used to create in-memory file objects for multipart
POST tests.  The storage backend is mocked so no files are written to disk.
