# Questionaires Views — Test Documentation

Tests in [`test_questionaires_view.py`](test_questionaires_view.py) cover
`core/views/questionaires_view.py` routes.

## Coverage
- `list_health_questionnaires`: method + success (+ serialized `questions` payload)
- `list_dynamic_questionnaires`: grouping behavior
- `list_patient_questionnaires`: not-found + no-plan (+ includes questionnaire content fields when assigned)
- `list_patient_questionnaires`: includes `answered_entries` for past/current answered assigned questionnaires
- `assign_questionnaire`: validation + patient-not-found + success path
- `remove_questionnaire`: validation + removal success
- helper coverage:
- `_render_frequency` day/week/month/fallback cases
- `_infer_frequency_from_dates` daily/weekly/monthly/error fallback
- `_expand_dates` day/week/month/unknown-unit fallback branches
- `_is_oid`, `_get_user_by_any`, `_get_patient_by_any_id`, `_get_therapist_by_any`

## Running
```bash
pytest tests/questionaires_views/ -v
```
