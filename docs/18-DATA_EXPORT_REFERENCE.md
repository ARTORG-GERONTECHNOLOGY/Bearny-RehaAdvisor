# Data Export Reference

This document describes every export available from the TeleRehabApp user interface: what triggers the download, who can use it, what files it produces, and what each column means.

---

## 1. Admin Patient Data Export

**Where:** Admin Dashboard → Data tab → "Export Data" button  
**Who:** Admin role only  
**Format:** ZIP archive containing one CSV per data type, named `export_YYYY-MM-DD.zip`  
**Scope:** All patients, or filtered to one or more clinics via the clinic selector

Every download is recorded in the platform audit log (`ADMIN_EXPORT` action) with the exporting user, selected clinics, and patient count.

The ZIP contains the following files.

---

### `patients.csv` — Demographics

One row per patient.

| Column | Description |
|---|---|
| `clinic` | Clinic the patient belongs to (e.g. "Inselspital") |
| `project` | Study project within that clinic (e.g. "COMPASS") |
| `patient_code` | Internal patient identifier (e.g. "934-51") |
| `first_name` | Patient's first name |
| `last_name` | Patient's last name |
| `age` | Age in years at time of registration |
| `sex` | Biological sex as recorded |
| `diagnosis` | Semicolon-separated list of diagnoses |
| `function` | Semicolon-separated list of functional categories |
| `therapist` | Full name of the assigned therapist |
| `reha_end_date` | End of the rehabilitation period (YYYY-MM-DD) |
| `study_end_date` | End of the study participation period (YYYY-MM-DD) |
| `duration_days` | Total plan duration in days |
| `preferred_language` | Language code the patient uses in the app (e.g. "de", "fr") |
| `created_at` | Date the patient record was created in the platform |

---

### `rehab_calendar.csv` — Scheduled Sessions

One row per scheduled session date per intervention per rehabilitation plan. A patient with 3 interventions each scheduled on 30 dates produces 90 rows.

| Column | Description |
|---|---|
| `clinic` | Clinic |
| `patient_code` | Patient identifier |
| `plan_status` | Status of the rehabilitation plan (e.g. "active", "completed") |
| `plan_start` | Plan start date (YYYY-MM-DD) |
| `plan_end` | Plan end date (YYYY-MM-DD) |
| `intervention_external_id` | Stable identifier for the intervention (from the intervention library) |
| `intervention_title` | Human-readable title in the platform's default language |
| `scheduled_date` | The specific date this session was planned (YYYY-MM-DD). Empty if the assignment has no generated dates yet. |
| `frequency` | Repeat rule description (e.g. "Every day", "3× per week") |
| `notes` | Therapist notes attached to this intervention assignment |

---

### `intervention_logs.csv` — Session Execution Records

One row per completed or skipped session. Only sessions that were acted on by the patient appear here; future scheduled sessions do not.

| Column | Description |
|---|---|
| `clinic` | Clinic |
| `patient_code` | Patient identifier |
| `intervention_external_id` | Intervention identifier |
| `intervention_title` | Intervention title |
| `date` | The session date this log was recorded for. For sessions completed on schedule this matches the planned date in `rehab_calendar.csv`. For late or retroactive completions it is the scheduled slot's date, not the wall-clock time of completion. |
| `status` | Semicolon-separated list of statuses: `completed`, `skipped`, `postponed`, `upcoming` |
| `comments` | Free-text comment the patient entered when marking the session |
| `created_at` | Timestamp (ISO 8601) when the log record was first created |

---

### `intervention_feedback.csv` — In-Session Questionnaire Answers

One row per feedback question answered per session. A session with 3 feedback questions produces 3 rows. Sessions with no feedback are not represented.

| Column | Description |
|---|---|
| `clinic` | Clinic |
| `patient_code` | Patient identifier |
| `intervention_external_id` | Intervention identifier |
| `log_date` | Date of the session this feedback belongs to (the scheduled session date, same as `intervention_logs.date`) |
| `feedback_date` | Timestamp when the patient actually submitted this feedback answer. Often equals `log_date` but can differ if the patient filled in the feedback later (e.g. the next day). |
| `question_key` | Stable identifier for the feedback question (e.g. `pain_level`, `effort`) |
| `answer_keys` | Semicolon-separated list of selected answer option keys |
| `comment` | Free-text comment entered alongside the answer |

> **`log_date` vs `feedback_date`**: `log_date` is the session's scheduled slot; `feedback_date` is when the patient tapped "submit". They differ when the patient marks a session complete but fills in the questionnaire at a later time.

---

### `health_vitals.csv` — Manually Entered Vitals

One row per manual entry. Includes weight and blood pressure values entered by the patient or therapist in the Health tab.

| Column | Description |
|---|---|
| `clinic` | Clinic |
| `patient_code` | Patient identifier |
| `date` | Date the measurement was recorded (YYYY-MM-DD) |
| `weight_kg` | Body weight in kilograms |
| `bp_sys` | Systolic blood pressure (mmHg) |
| `bp_dia` | Diastolic blood pressure (mmHg) |
| `source` | Who entered the record: `manual` (patient self-entry), `device` (wearable sync), or `provider` (therapist entry) |
| `note` | Free-text note attached to the entry |

---

### `health_fitbit.csv` — Wearable Health Data

One row per calendar day per patient. Combines Fitbit and Google Health data depending on which device the patient uses. All numeric columns are blank when the value was not available for that day.

| Column | Description |
|---|---|
| `clinic` | Clinic |
| `patient_code` | Patient identifier |
| `date` | Calendar date (YYYY-MM-DD) |
| `steps` | Total step count for the day. **Includes steps from all connected sources** — both the wearable tracker and the phone's built-in pedometer (for Google Health patients). On days when the tracker was not worn, steps may come entirely from the phone. Cross-reference `wear_time_minutes`: if that is blank or 0, the steps are likely phone-only. |
| `active_minutes` | Minutes spent at moderate or vigorous intensity (heart rate in Fat Burn, Cardio, or Peak zones for Fitbit; equivalent activity level for Google Health) |
| `wear_time_minutes` | Minutes during which the tracker was worn, derived from heart-rate zone data. Blank or 0 when the tracker was not worn that day. |
| `sleep_minutes_asleep` | Actual time asleep in minutes (excludes time lying awake in bed). This is the value shown in the Fitbit app. |
| `sleep_duration_min` | Total sleep session duration in minutes, including light sleep and awake periods in bed. Always ≥ `sleep_minutes_asleep`. |
| `resting_heart_rate` | Resting heart rate in bpm. Only available when the tracker was worn for a sufficient period. |
| `max_heart_rate` | Maximum heart rate recorded during the day (bpm). |
| `calories` | Total calories burned (active + basal metabolic rate). |
| `distance_km` | Distance covered in kilometres. |
| `weight_kg` | Weight in kilograms from the wearable, if the device or connected scale reported it. |
| `bp_sys` | Systolic blood pressure from the wearable (where supported). |
| `bp_dia` | Diastolic blood pressure from the wearable (where supported). |

---

### `questionnaire_answers.csv` — Health-Status Questionnaire Responses

One row per question per submission. Covers the ICF-based health-status questionnaires the patient completes periodically (not the per-session intervention feedback above).

| Column | Description |
|---|---|
| `clinic` | Clinic |
| `patient_code` | Patient identifier |
| `date` | Date the questionnaire was submitted (YYYY-MM-DD) |
| `icf_code` | ICF classification code for the question (e.g. `b280`) |
| `question_key` | Stable identifier for the specific question |
| `rating` | Numeric rating the patient selected |
| `comment` | Free-text comment entered alongside the rating (multiple comments joined by "; ") |

---

### `question_dictionary.csv` — Question Lookup Table

One row per question in the question library. Use this as a lookup table to resolve `question_key` values in `questionnaire_answers.csv` and `intervention_feedback.csv` — VLOOKUP or merge on `question_key`.

| Column | Description |
|---|---|
| `question_key` | Stable identifier, matches the `question_key` column in the feedback sheets |
| `question_subject` | Short subject label (e.g. "Exercise", "Pain") |
| `answer_type` | Response format: `stars`, `select`, `scale`, `text` |
| `icf_code` | ICF classification code, if applicable (e.g. `b455`) |
| `text_en` | Question text in English |
| `text_de` | Question text in German |
| `text_fr` | Question text in French |
| `text_it` | Question text in Italian |
| `text_nl` | Question text in Dutch |
| `text_pt` | Question text in Portuguese |

**Key format:**
- Built-in questions use human-readable slugs: `rating_stars_education`, `difficulty_scale`
- Admin-created questions encode the questionnaire title: `custom_<title_slug>_<8hex>_<index>_<6hex>` — e.g. `custom_evaluation_des_digitalen_wochenprogramms_fim_aim_iam_46942b67_12_942b7e` → questionnaire "Evaluation des digitalen Wochenprogramms (FIM/AIM/IAM)", question 12

---

### `thresholds.csv` — Current Alert Thresholds

One row per patient showing the thresholds currently configured for their health metrics. These thresholds drive the green/yellow/red traffic-light indicators in the therapist view.

| Column | Description |
|---|---|
| `clinic` | Clinic |
| `patient_code` | Patient identifier |
| `steps_goal` | Daily step goal (used for the step score percentage) |
| `active_minutes_green` | Minimum active minutes for a green status |
| `active_minutes_yellow` | Minimum active minutes for a yellow status (below this = red) |
| `sleep_green_min` | Minimum minutes of sleep for a green status |
| `sleep_yellow_min` | Minimum minutes of sleep for a yellow status |
| `bp_sys_green_max` | Maximum systolic BP for a green status |
| `bp_sys_yellow_max` | Maximum systolic BP for a yellow status |
| `bp_dia_green_max` | Maximum diastolic BP for a green status |
| `bp_dia_yellow_max` | Maximum diastolic BP for a yellow status |

---

### `threshold_history.csv` — Threshold Change Log

One row per threshold change event. Records every time a therapist adjusted the thresholds for a patient, preserving the full history.

| Column | Description |
|---|---|
| `clinic` | Clinic |
| `patient_code` | Patient identifier |
| `effective_from` | Timestamp (ISO 8601) when this threshold set became active |
| `changed_by` | Name or identifier of the therapist who made the change |
| `reason` | Free-text reason entered when changing the thresholds |
| `steps_goal` | Step goal at the time of this snapshot |
| `active_minutes_green` | Active minutes green threshold at this snapshot |
| `active_minutes_yellow` | Active minutes yellow threshold at this snapshot |
| `sleep_green_min` | Sleep green threshold at this snapshot |
| `sleep_yellow_min` | Sleep yellow threshold at this snapshot |
| `bp_sys_green_max` | Systolic BP green threshold at this snapshot |
| `bp_sys_yellow_max` | Systolic BP yellow threshold at this snapshot |
| `bp_dia_green_max` | Diastolic BP green threshold at this snapshot |
| `bp_dia_yellow_max` | Diastolic BP yellow threshold at this snapshot |

---

### `activity_logs.csv` — Platform Activity Events

One row per logged platform event for patients in the export scope. Records key actions taken by patients and therapists.

| Column | Description |
|---|---|
| `clinic` | Clinic of the associated patient |
| `patient_code` | Patient identifier the event relates to |
| `action` | Event type (see table below) |
| `timestamp` | When the event occurred (ISO 8601 UTC) |
| `actor_role` | Role of the person who triggered the event (e.g. "Patient", "Therapist", "Admin") |
| `details` | Free-text context specific to the action (e.g. intervention title, date) |

**Action types:**

| Action | Meaning |
|---|---|
| `LOGIN` | Successful login |
| `LOGOUT` | Explicit logout |
| `PATIENT_REGISTER` | New patient account created |
| `OPEN_PATIENT` | Therapist opened a patient's profile |
| `UPDATE_PROFILE` | Profile or account details updated |
| `DELETE_ACCOUNT` | Account deleted |
| `FORCE_LOGOUT` | All sessions for a user were invalidated (e.g. after password reset) |
| `INTERVENTION_COMPLETE` | Patient marked a session as completed |
| `INTERVENTION_UNCOMPLETE` | Patient reversed a completion |
| `INTERVENTION_RESCHEDULE` | A session was moved to a different date |
| `INTERVENTION_VIEW` | Patient opened an intervention's detail page |
| `ASSIGN_INTERVENTION` | Therapist added an intervention to a patient's plan |
| `TEMPLATE_APPLY` | A plan template was applied to a patient |
| `QUESTIONNAIRE_SUBMIT` | Patient submitted a health-status questionnaire |
| `VITALS_SUBMIT` | A weight or blood pressure measurement was recorded |
| `REDCAP_IMPORT` | Patient data imported from REDCap |
| `ADMIN_EXPORT` | Admin downloaded patient data (recorded in the separate audit log) |

---

## 2. Admin Audit Export

**Where:** Admin Dashboard → Data tab → "Export Audit Log" button  
**Who:** Admin role only  
**Format:** CSV download, up to the 200 most recent entries

Records all previous Patient Data Export downloads (action `ADMIN_EXPORT`): who downloaded, when, which clinics, and how many patients were included. Use this to maintain an audit trail of who has accessed patient data.

| Column | Description |
|---|---|
| `timestamp` | When the download occurred (ISO 8601 UTC) |
| `user_email` | Email of the Admin who triggered the download |
| `details` | Clinics selected and number of patients exported |
| `user_agent` | Browser/client identifier string |

---

## 3. HealthSlider Research Export

**Where:** `/healthslider-downloads` (standalone page, separate from the main app)  
**Who:** Researchers — requires the shared download password and a 2FA code emailed on each login  
**Format:** ZIP archive containing audio files plus a CSV summary

This export is for the ICF Monitor study and is not part of the main admin interface.

**ZIP contents:**

- One `.webm` audio file per recorded response
- `summary.csv` — one row per answer, with:

| Column | Description |
|---|---|
| `participant_id` | Participant code (format `Pxx`) |
| `question_id` | Identifier of the question |
| `rating` | Numeric rating selected |
| `audio_filename` | Filename of the corresponding audio recording in the ZIP, or blank if no audio was recorded |
| `submitted_at` | Submission timestamp (ISO 8601 UTC) |

The page also supports browsing and in-browser playback per participant before downloading.

---

## Notes

- All dates are formatted as `YYYY-MM-DD`. Timestamps are ISO 8601.
- Empty cells mean the value was not recorded or not applicable — they are not zeros.
- Wearable data (`health_fitbit.csv`) covers the full history of each patient, not just the current plan period.
- The export respects the clinic filter: selecting "Inselspital" exports only patients whose `clinic` field is "Inselspital". Patients without a clinic assignment are excluded from filtered exports.
