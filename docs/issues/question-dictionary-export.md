# feat: add question_dictionary.csv to admin export ZIP

## Problem

The `questionnaire_answers.csv` and `intervention_feedback.csv` sheets in the admin export ZIP
contain a `question_key` column, but no corresponding question text. Researchers cannot easily
interpret the keys without help from a developer.

**How question_key is structured:**

| Pattern | Example | Meaning |
|---|---|---|
| Human-readable slug | `rating_stars_education` | Built-in seed question |
| `custom_<title_slug>_<8hex>_<idx>_<6hex>` | `custom_evaluation_des_digitalen_wochenprogramms_fim_aim_iam_46942b67_12_942b7e` | Admin-created question |

For custom questions, the questionnaire title is embedded as a slug, but the full question text
is only in MongoDB (`FeedbackQuestion.translations[]`). Researchers currently have no way to
look it up from the export alone.

## Fix

Add `question_dictionary.csv` to the export ZIP, placed immediately after
`questionnaire_answers.csv`. One row per question in the `FeedbackQuestions` collection:

| question_key | question_subject | answer_type | icf_code | text_en | text_de | text_fr | text_it | text_nl | text_pt |
|---|---|---|---|---|---|---|---|---|---|

Researchers can VLOOKUP / merge this with either feedback CSV on `question_key`.

The `FeedbackQuestion` documents are already being dereferenced by the existing export builders
(to read `questionKey`). The translation text is on the same in-memory object and simply was
not being emitted.

## Changes

- `backend/core/views/admin_export_views.py`
  - Import `FeedbackQuestion`
  - New `_csv_question_dictionary()` builder function
  - Added to ZIP assembly after `questionnaire_answers.csv`
  - Module docstring updated

## Acceptance criteria

- [ ] `question_dictionary.csv` is present in the export ZIP
- [ ] Every `question_key` that appears in `questionnaire_answers.csv` and
      `intervention_feedback.csv` has a matching row in the dictionary
- [ ] Built-in questions have text in all 6 languages; admin-created questions have at least `text_en`
- [ ] Existing CSV schemas are unchanged
