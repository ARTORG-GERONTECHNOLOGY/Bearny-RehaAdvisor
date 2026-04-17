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

## Monthly scheduling
When assigning or modifying a questionnaire:
1. Set `Repeat every` to `1`.
2. Set unit to `Month`.
3. Choose start date/time and end behavior.

This creates recurring monthly acceptability questionnaire sessions for the selected patient.

## Backend endpoints used
- `GET /api/questionnaires/dynamic?subject=Healthstatus`
- `GET /api/questionnaires/patient/<patient_id>/`
- `POST /api/questionnaires/assign/`
- `POST /api/questionnaires/remove/`
