# Backend API Documentation

This document reflects the current backend routes in `backend/core/urls.py`.

OpenAPI spec:

- `docs/09-API_OPENAPI.yaml`

## Base URL

- Development: `http://localhost:8001`
- API prefix: `/api/`

## Auth and Headers

Most endpoints are protected by JWT auth and expect:

- `Authorization: Bearer <access_token>`
- `Content-Type: application/json` for JSON bodies

JWT refresh endpoint:

- `POST /api/auth/token/refresh/`

## Important Notes

- Route matching is order-based (Django `path()` first match wins).
- `GET /api/patients/health-combined-history/<patient_id>/` is defined twice. The first mapping is used at runtime:
  - Runtime route: `patient_views.get_combined_health_data`
  - Later duplicate mapping to `fitbit_views.health_combined_history` is not reached via URL dispatch.
- Some paths intentionally keep legacy spelling in the URL, e.g. `questionaire` and `recomendation`.
- `POST /api/interventions/import/excel` has no trailing slash in URL config.
- `POST /api/analytics/log` has no trailing slash in URL config.

## Endpoint Catalog

### Core

- `GET /api/` -> `core_views.index`

### Authentication

- `POST /api/auth/login/` -> `auth_views.login_view`
- `POST /api/auth/logout/` -> `auth_views.logout_view`
- `POST /api/auth/forgot-password/` -> `auth_views.reset_password_view`
- `POST /api/auth/register/` -> `auth_views.register_view`
- `POST /api/auth/send-verification-code/` -> `auth_views.send_verification_code`
- `POST /api/auth/verify-code/` -> `auth_views.verify_code_view`
- `POST /api/auth/token/refresh/` -> `TokenRefreshView`
- `GET /api/auth/get-user-info/<user_id>/` -> `auth_views.get_user_info`

### User/Admin

- `GET /api/admin/pending-users/` -> `user_views.get_pending_users`
- `POST /api/admin/accept-user/` -> `user_views.accept_user`
- `POST /api/admin/decline-user/` -> `user_views.decline_user`
- `GET|PUT|DELETE /api/users/<user_id>/profile/` -> `user_views.user_profile_view`
- `PUT /api/users/<therapist_id>/change-password/` -> `user_views.change_password`

### Therapist

- `GET /api/therapists/<therapist_id>/patients/` -> `therapist_views.list_therapist_patients`
- `GET /api/therapists/<therapist_id>/patients/` -> `therapist_views.get_patients_by_therapist`
- `POST /api/analytics/log` -> `therapist_views.create_log`

### Patient / Rehab Plan

- `GET /api/patients/rehabilitation-plan/patient/<patient_id>/` -> `patient_views.get_patient_plan`
- `GET /api/patients/rehabilitation-plan/therapist/<patient_id>/` -> `patient_views.get_patient_plan_for_therapist`
- `POST /api/interventions/add-to-patient/` -> `patient_views.add_intervention_to_patient`
- `POST /api/interventions/modify-patient/` -> `patient_views.modify_intervention_from_date`
- `POST /api/interventions/remove-from-patient/` -> `patient_views.remove_intervention_from_patient`
- `POST /api/interventions/complete/` -> `patient_views.mark_intervention_completed`
- `POST /api/interventions/uncomplete/` -> `patient_views.unmark_intervention_completed`
- `POST /api/patients/feedback/questionaire/` -> `patient_views.submit_patient_feedback`
- `GET /api/patients/get-questions/<questionaire_type>/<patient_id>/` -> `patient_views.get_feedback_questions`
- `GET /api/patients/get-questions/<questionaire_type>/<patient_id>/<intervention_id>/` -> `patient_views.get_feedback_questions`
- `POST /api/users/<patient_id>/initial-questionaire/` -> `patient_views.initial_patient_questionaire`
- `GET /api/patients/healthstatus-history/<patient_id>/` -> `patient_views.get_patient_healthstatus_history`
- `GET /api/patients/health-combined-history/<patient_id>/` -> `patient_views.get_combined_health_data` (effective mapping)
- `POST /api/patients/vitals/manual/<patient_id>/` -> `patient_views.add_manual_vitals`
- `GET /api/patients/vitals/exists/<patient_id>/` -> `patient_views.vitals_exists_for_day`
- `GET|POST|PATCH /api/patients/<patient_id>/thresholds/` -> `patient_thresholds_view`

### Interventions / Recommendations

- `GET /api/interventions/all/` -> `recomendation_views.list_all_interventions`
- `GET /api/interventions/all/<patient_id>/` -> `recomendation_views.list_all_interventions`
- `POST /api/interventions/add/` -> `recomendation_views.add_new_intervention`
- `GET /api/interventions/<intervention_id>/` -> `recomendation_views.get_intervention_detail`
- `GET /api/interventions/<intervention>/assigned-diagnoses/<specialisation>/therapist/<therapist_id>/` -> `recomendation_views.list_intervention_diagnoses`
- `POST /api/recomendation/add/patientgroup/` -> `recomendation_views.create_patient_group`
- `POST /api/therapists/<therapist_id>/interventions/assign-to-patient-types/` -> `recomendation_views.assign_intervention_to_types`
- `POST /api/therapists/<therapist_id>/interventions/remove-from-patient-types/` -> `recomendation_views.remove_intervention_from_types`
- `GET /api/therapists/<therapist_id>/template-plan` -> `recomendation_views.template_plan_preview`
- `POST /api/therapists/<therapist_id>/templates/apply` -> `recomendation_views.apply_template_to_patient`
- `POST /api/interventions/import/excel` -> `import_interventions`

### Questionnaires

- `GET /api/questionnaires/health/` -> `list_health_questionnaires`
- `GET /api/questionnaires/patient/<patient_id>/` -> `list_patient_questionnaires`
- `POST /api/questionnaires/assign/` -> `assign_questionnaire`
- `POST /api/questionnaires/remove/` -> `remove_questionnaire`
- `GET /api/questionnaires/dynamic/` -> `list_dynamic_questionnaires`

### Fitbit

- `GET /api/fitbit/callback/` -> `fitbit_views.fitbit_callback`
- `GET /api/fitbit/status/<patient_id>/` -> `fitbit_views.fitbit_status`
- `GET /api/fitbit/health-data/<patient_id>/` -> `fitbit_views.get_fitbit_health_data`
- `GET /api/fitbit/summary/` -> `fitbit_views.fitbit_summary`
- `GET /api/fitbit/summary/<patient_id>/` -> `fitbit_views.fitbit_summary`
- `POST /api/fitbit/manual_steps/<patient_id>/` -> `fitbit_views.manual_steps`
- Duplicate/non-effective URL mapping exists:
  - `GET /api/patients/health-combined-history/<patient_id>/` -> `fitbit_views.health_combined_history` (defined later, shadowed)

### REDCap

- `GET /api/redcap/projects/` -> `redcap_projects`
- `GET /api/redcap/patient/` -> `redcap_patient`
- `GET /api/redcap/available-patients/` -> `available_redcap_patients`
- `POST /api/redcap/import-patient/` -> `import_patient_from_redcap`

### Therapist Admin Access

- `GET|PUT /api/admin/therapist/access/` -> `therapist_access`
- `GET|PUT /api/admin/therapist/access/<therapistId>/` -> `therapist_access`

### Healthslider (EVA)

- `GET /api/healthslider/items/` -> `list_healthslider_items`
- `GET /api/healthslider/audio/<item_id>/` -> `download_healthslider_audio`
- `POST /api/healthslider/submit-item/` -> `submit_healthslider_item`
- `DELETE /api/healthslider/delete-session/` -> `download_healthslider_session_zip`

## Response Shape Guidance

Response bodies are not globally uniform across all views. Common patterns in this backend include:

- `{ "success": true|false, ... }`
- `{ "ok": true|false, ... }`
- `{ "error": "..." }`
- Raw lists for some `GET` endpoints

For exact request/response payloads per endpoint, use:

- endpoint-specific tests under `backend/tests/*`
- corresponding view implementation in `backend/core/views/*.py`
