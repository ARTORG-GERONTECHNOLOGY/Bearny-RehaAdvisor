# Template Views — Test Documentation

## Overview

`test_template_views.py` contains **63 tests** covering the three phases of the
named-template system introduced in `backend/core/views/template_views.py`.

Run from inside the Django container:

```bash
docker exec django pytest tests/template_views/ -v
```

---

## Endpoints under test

| Endpoint | View | Phase |
|----------|------|-------|
| `GET  /api/templates/` | `template_list_create` | 1 |
| `POST /api/templates/` | `template_list_create` | 1 |
| `GET  /api/templates/<id>/` | `template_detail` | 1 |
| `DELETE /api/templates/<id>/` | `template_detail` | 1 |
| `PATCH /api/templates/<id>/` | `template_detail` | 1 |
| `POST /api/templates/<id>/copy/` | `copy_template` | 1 |
| `POST /api/templates/<id>/interventions/` | `template_intervention_assign` | 2 |
| `DELETE /api/templates/<id>/interventions/<int_id>/` | `template_intervention_remove` | 2 |
| `POST /api/templates/<id>/apply/` | `apply_named_template` | 2 |
| `GET  /api/templates/<id>/calendar/` | `template_calendar` | 3 |

---

## Test infrastructure

### Database isolation

Each test gets a fresh in-memory MongoDB via the `mongo_mock` autouse fixture
(mongomock). No external database is required.

### Authentication

Template views resolve the requesting therapist via `_get_therapist(request)`,
which looks up the JWT user id. Tests patch this function directly:

```python
with patch("core.views.template_views._get_therapist", return_value=therapist):
    resp = client.get("/api/templates/", HTTP_AUTHORIZATION="Bearer test")
```

This avoids the need for real JWT tokens while fully testing view logic.

### Factory helpers

| Helper | Creates |
|--------|---------|
| `_make_therapist(username)` | `User` + `Therapist` |
| `_make_patient(therapist)` | `User` + `Patient` |
| `_make_intervention()` | `Intervention` |
| `_make_template(therapist, ...)` | `InterventionTemplate` (optionally with one intervention assigned) |

### HTTP helpers

`_get`, `_post_json`, `_patch_json`, `_delete` — thin wrappers that optionally
patch `_get_therapist` and forward all kwargs to Django's test client.

---

## Coverage by section

### Phase 1 — Template CRUD (28 tests)

#### `GET /api/templates/` — list
- Own private template is returned ✓
- Public templates from other therapists are returned ✓
- Other therapists' private templates are excluded ✓
- `?name=` filter narrows results ✓
- Unauthenticated returns 403 ✓
- Wrong method (DELETE) returns 405 ✓

#### `POST /api/templates/` — create
- Valid payload returns 201 with full serialisation ✓
- Only a `name` field is required ✓
- Missing/blank `name` returns 400 ✓
- `name` > 200 chars returns 400 ✓
- Optional `specialization` + `diagnosis` are stored ✓

#### `GET /api/templates/<id>/` — detail
- Owner sees own template with recommendations ✓
- Public template visible to any therapist ✓
- Other's private template returns 404 ✓
- Non-existent id returns 404 ✓
- Invalid ObjectId returns 400 ✓

#### `DELETE /api/templates/<id>/`
- Owner can delete → 200, document gone ✓
- Non-owner gets 403, document preserved ✓
- Non-existent id returns 404 ✓

#### `PATCH /api/templates/<id>/`
- Owner can update `name` ✓
- Owner can flip `is_public` ✓
- Non-owner gets 403, document unchanged ✓
- Blank `name` returns 400 ✓

#### `POST /api/templates/<id>/copy/`
- Creates a new private copy with "Copy of …" name ✓
- Custom `name` in body is respected ✓
- Copying another's private template returns 404 ✓
- Non-existent template returns 404 ✓
- GET returns 405 ✓

### Phase 2 — Intervention assignment & application (24 tests)

#### `POST /api/templates/<id>/interventions/`
- Assigns intervention with explicit diagnosis → block stored under that key ✓
- Omitting `diagnosis` stores under `_all` sentinel ✓
- Assigning same intervention twice replaces block (no duplicates) ✓
- Missing `interventionId` → 400 ✓
- Missing `end_day` → 400 ✓
- Invalid `unit` → 400 ✓
- Non-existent intervention → 404 ✓
- Non-owner gets 403 ✓
- Non-existent template → 404 ✓
- GET returns 405 ✓

#### `DELETE /api/templates/<id>/interventions/<int_id>/`
- Whole-entry removal (no `?diagnosis=`) → 200, `intervention_count` drops ✓
- `?diagnosis=` removes only that block, other blocks remain ✓
- Intervention not in template → 404 ✓
- Non-owner gets 403 ✓
- POST returns 405 ✓

#### `POST /api/templates/<id>/apply/`
- Applies to patient by ObjectId → `applied` and `sessions_created` > 0 ✓
- Applies to patient by `patient_code` string ✓
- Missing `patientId` → 400 ✓
- Missing `effectiveFrom` → 400 ✓
- Invalid date format → 400 ✓
- Unknown patient → 404 ✓
- Other's private template → 404 ✓
- Creates `RehabilitationPlan` when none exists ✓
- GET returns 405 ✓

### Phase 3 — Calendar preview (11 tests)

#### `GET /api/templates/<id>/calendar/`
- Empty template → 200, `items: []` ✓
- Template with intervention → items contain all expected keys ✓
- All occurrences fall within `horizon_days` window ✓
- `?horizon_days=30` is respected ✓
- `?diagnosis=Stroke` excludes non-matching items ✓
- Other's private template → 404 ✓
- Public template visible to any therapist ✓
- Non-existent template → 404 ✓
- Invalid ObjectId → 400 ✓
- POST returns 405 ✓
