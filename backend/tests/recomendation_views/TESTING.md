# Recommendation Views — Test Documentation

## Files

| File | Focus |
|---|---|
| [`test_recomendation_views_extra.py`](test_recomendation_views_extra.py) | Validation branches for template apply/preview, intervention creation, diagnosis listing |
| [`test_list_all_interventions_ratings.py`](test_list_all_interventions_ratings.py) | `avg_rating` / `rating_count` aggregation on `GET /api/interventions/all/` |
| [`test_list_all_interventions_lang.py`](test_list_all_interventions_lang.py) | `preferred_language` variant selection on `GET /api/interventions/all/<patient_id>/` |

---

## `list_all_interventions` — avg_rating aggregation

`GET /api/interventions/all/` and `GET /api/interventions/all/<patient_id>/`

After all interventions are serialized, the endpoint runs a single MongoDB aggregation pipeline over `PatientInterventionLogs` to compute the average star rating per intervention. Only feedback entries whose `questionId` references a `FeedbackQuestion` with `questionKey` starting with `rating_stars_` are included; difficulty-scale and open-feedback entries are excluded.

The results are merged back into the serialized items as:
- `avg_rating` — `float | null` — rounded to 1 decimal place; `null` when no ratings exist
- `rating_count` — `int` — number of individual star ratings submitted

### Tests (`test_list_all_interventions_ratings.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_list_all_interventions_avg_rating_none_when_no_feedback` | No logs at all | `avg_rating: null`, `rating_count: 0` |
| `test_list_all_interventions_avg_rating_single_rating` | One patient gives 4 stars | `avg_rating: 4.0`, `rating_count: 1` |
| `test_list_all_interventions_avg_rating_multiple_patients` | Patient A: 5 stars, Patient B: 3 stars | `avg_rating: 4.0`, `rating_count: 2` |
| `test_list_all_interventions_non_rating_feedback_excluded_from_average` | Only `difficulty_scale` answer submitted | `avg_rating: null`, `rating_count: 0` |
| `test_list_all_interventions_independent_avg_per_intervention` | Two interventions, only one rated | Rated: `avg_rating: 5.0`; Unrated: `avg_rating: null` |
| `test_list_all_interventions_avg_rating_rounded_to_one_decimal` | Three ratings: 1, 2, 4 (mean = 2.333…) | `avg_rating: 2.3`, `rating_count: 3` |

---

## `list_all_interventions` — patient `preferred_language`

`GET /api/interventions/all/<patient_id>/`

When a `patient_id` is supplied, the endpoint resolves the patient document and uses `Patient.preferred_language` as the primary variant-selection language instead of the `?lang` query param (the therapist's UI language). The `?lang` param remains the fallback when no patient language is set. If no variant exists for the patient language, the standard `en → de → any` chain applies.

### Tests (`test_list_all_interventions_lang.py`)

| Test | Scenario | Expected |
|---|---|---|
| `test_list_all_uses_lang_param_when_no_patient_id` | No patient_id in URL, `?lang=de` | German variant returned |
| `test_list_all_uses_patient_preferred_language_when_patient_id_given` | `patient.preferred_language='de'`, `?lang=en` | German variant returned (patient overrides UI lang) |
| `test_list_all_falls_back_to_lang_param_when_patient_has_no_preferred_language` | `patient.preferred_language='en'`, `?lang=en` | English variant returned |
| `test_list_all_falls_back_when_preferred_language_has_no_variant` | `patient.preferred_language='fr'`, only en/de exist | English or German variant returned (not null) |

---

## `apply_template_to_patient`, `get_intervention_by_external_id`, `add_new_intervention`, `list_intervention_diagnoses`

See [`test_recomendation_views_extra.py`](test_recomendation_views_extra.py) for validation-branch coverage.

## Running
```bash
pytest tests/recomendation_views/ -v
```
