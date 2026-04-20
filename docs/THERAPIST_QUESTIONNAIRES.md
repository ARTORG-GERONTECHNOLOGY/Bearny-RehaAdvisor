# Therapist Questionnaires (Acceptability / Monthly)

## Where to find it
1. Open therapist view and select a patient.
2. Open the patient rehabilitation page (`RehabTable`).
3. In the top tabs, switch from `Interventions` to `Questionnaires`.

## What you can do there
1. See **Available questionnaires** (left card).
2. See **Assigned questionnaires** (right card).
3. Click `+` to assign a questionnaire.
4. Click edit to modify schedule.
5. Click delete to remove assignment.
6. Click the **eye** button to expand and inspect questionnaire content:
   - question text
   - answer type
   - answer options (for select/multi-select questions)

## Monthly scheduling
When assigning or modifying a questionnaire:
1. Set `Repeat every` to `1`.
2. Set unit to `Month`.
3. Choose start date/time and end behavior.

This creates recurring monthly acceptability questionnaire sessions for the selected patient.

## Patient answers visibility
1. Open therapist `Health` page for the selected patient.
2. Questionnaire answers are shown in:
   - `Total Questionnaire Score Per Day`
   - `Questionnaire Answers Over Time`
3. Therapist patient list (`/therapist`) also shows compact feedback status (score trend + adherence tooltip), but not full answer rows.

## CSV export
On therapist `Health` page:
1. Click `Export…`.
2. Keep `questionnaire` selected and click `Export CSV`.

The questionnaire CSV section includes:
- `Date`
- `Question Key`
- `Question Text`
- `Answer Keys` (all selected values, joined by ` | `)
- `Answer Texts` (all translated labels, joined by ` | `)
- `Comment`
- `Media URLs`

## Backend endpoints used
- `GET /api/questionnaires/dynamic?subject=Healthstatus`
- `GET /api/questionnaires/patient/<patient_id>/`
- `POST /api/questionnaires/assign/`
- `POST /api/questionnaires/remove/`
- `GET /api/patients/health-combined-history/<patient_id>/` (charts + CSV export source)
