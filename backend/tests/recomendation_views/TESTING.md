# Recommendation Views (Extra) — Test Documentation

Tests in [`test_recomendation_views_extra.py`](test_recomendation_views_extra.py) add
focused branch coverage for `core/views/recomendation_views.py`.

## Coverage focus
- `apply_template_to_patient` validation branches:
  - invalid JSON body
  - invalid `startTime` format
- `template_plan_preview` generic-exception branch (`horizon` parse failure)
- `get_intervention_by_external_id`:
  - method not allowed
  - not found
  - successful language variant selection
- `add_new_intervention` validation branches:
  - invalid taxonomy JSON
  - invalid patientTypes JSON
  - private intervention without/with invalid patient id
  - media validation for invalid kind/type and missing file reference
- `list_intervention_diagnoses`:
  - `all` flag propagation
  - per-diagnosis active mapping

## Running
```bash
pytest tests/recomendation_views/ -v
```
