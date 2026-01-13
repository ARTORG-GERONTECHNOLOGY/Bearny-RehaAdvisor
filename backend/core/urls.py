from django.conf import settings
from django.conf.urls.static import static
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

import core.views.auth_views as auth_views
import core.views.patient_views as patient_views
import core.views.recomendation_views as recomendation_views
import core.views.therapist_views as therapist_views
import core.views.user_views as user_views
import core.views.views as core_views
import core.views.fitbit_view as fitbit_views
from core.views.questionaires_view import (
    list_health_questionnaires,
    list_patient_questionnaires,
    assign_questionnaire,
    remove_questionnaire,
    list_dynamic_questionnaires
)
from core.views.eva_view import (
    list_healthslider_items,
    download_healthslider_audio,
    submit_healthslider_item,
)

urlpatterns = [
    path("api/", core_views.index, name="index"),
    path("api/admin/pending-users/", user_views.get_pending_users),
    path("api/admin/accept-user/", user_views.accept_user),
    path("api/admin/decline-user/", user_views.decline_user),
    # Authentication
    path("api/auth/login/", auth_views.login_view, name="login"),
    path("api/auth/logout/", auth_views.logout_view, name="logout"),
    path(
        "api/auth/forgot-password/",
        auth_views.reset_password_view,
        name="reset_password_view",
    ),
    path("api/auth/register/", auth_views.register_view, name="register"),
    path(
        "api/auth/send-verification-code/",
        auth_views.send_verification_code,
        name="send_verification_code",
    ),
    path("api/auth/verify-code/", auth_views.verify_code_view, name="verify_code"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    # User Profile
    path(
        "api/users/<str:user_id>/profile/",
        user_views.user_profile_view,
        name="user_profile_detail",
    ),
    # Therapist Management
    path(
        "api/therapists/<str:therapist_id>/patients/",
        therapist_views.list_therapist_patients,
        name="get_patients_by_therapist",
    ),
    # Patient Management
    # Rehabilitation plan
    path(
        "api/patients/rehabilitation-plan/patient/<str:patient_id>/",
        patient_views.get_patient_plan,
        name="get_patient_reha_plan",
    ),
    path(
        "api/patients/rehabilitation-plan/therapist/<str:patient_id>/",
        patient_views.get_patient_plan_for_therapist,
        name="get_rehabilitation_plan",
    ),
    # Intervention assignment
    path(
        "api/interventions/add-to-patient/",
        patient_views.add_intervention_to_patient,
        name="create_rehabilitation_plan",
    ),
    path(
        "api/interventions/modify-patient/",
        patient_views.modify_intervention_from_date,
        name="modify_rehabilitation_plan",
    ),
    path(
        "api/interventions/remove-from-patient/",
        patient_views.remove_intervention_from_patient,
        name="del_rehabilitation_plan_intervention",
    ),
    path("api/therapists/<str:therapist_id>/template-plan", recomendation_views.template_plan_preview),
    path("api/therapists/<str:therapist_id>/templates/apply", recomendation_views.apply_template_to_patient),
    # Questionnaires
    path('api/questionnaires/health/', list_health_questionnaires),
    path('api/questionnaires/patient/<str:patient_id>/', list_patient_questionnaires),
    path('api/questionnaires/assign/', assign_questionnaire),
    path('api/questionnaires/remove/', remove_questionnaire),
    path('api/questionnaires/dynamic/',list_dynamic_questionnaires, name='get_dynamic_questionnaires'),
    # Feedback
    path("api/interventions/complete/", patient_views.mark_intervention_completed, name="mark_intervention_done_by_patient"),
    path("api/interventions/uncomplete/", patient_views.unmark_intervention_completed, name="unmark_intervention_done_by_patient"),

    path(
        "api/patients/feedback/questionaire/",
        patient_views.submit_patient_feedback,
        name="patient_post_feedback",
    ),
    path('api/patients/get-questions/<str:questionaire_type>/<str:patient_id>/', patient_views.get_feedback_questions, name='get_feedback_questions_no_intervention'),
    path('api/patients/get-questions/<str:questionaire_type>/<str:patient_id>/<str:intervention_id>/', patient_views.get_feedback_questions, name='get_feedback_questions'),

    path("api/users/<str:patient_id>/initial-questionaire/", patient_views.initial_patient_questionaire, name="initial_questionaire"),

    #  Intervention Management
    path("api/interventions/all/", recomendation_views.list_all_interventions),
    path("api/interventions/all/<str:patient_id>/", recomendation_views.list_all_interventions),
    path(
        "api/interventions/add/",
        recomendation_views.add_new_intervention,
        name="create_intervention",
    ),
    # For assigning interventions to multiple types
    path(
        "api/therapists/<str:therapist_id>/interventions/assign-to-patient-types/",
        recomendation_views.assign_intervention_to_types,
        name="assign_intervention_to_patient_types",
    ),
    path(
        "api/therapists/<str:therapist_id>/interventions/remove-from-patient-types/",
        recomendation_views.remove_intervention_from_types,
        name="delete_intervention_from_patient_types",
    ),
    # View details and special diagnosis assignment
    path(
        "api/interventions/<str:intervention_id>/",
        recomendation_views.get_intervention_detail,
        name="get_recommendation_info",
    ),
    path(
        "api/interventions/<str:intervention>/assigned-diagnoses/<str:specialisation>/therapist/<str:therapist_id>/",
        recomendation_views.list_intervention_diagnoses,
        name="get_recommended_diagnoses_for_intervention",
    ),
    # Group assignment
    path(
        "api/recomendation/add/patientgroup/",
        recomendation_views.create_patient_group,
        name="post_add_new_patient_group",
    ),
    path('api/fitbit/callback/', fitbit_views.fitbit_callback, name='fitbit_callback'),
    path('api/fitbit/status/<str:patient_id>/', fitbit_views.fitbit_status, name='fitbit_status'),  # API endpoint to check connection
    path("api/fitbit/health-data/<str:patient_id>/", fitbit_views.get_fitbit_health_data, name="fitbit_health_data"),
    path("api/therapists/<str:therapist_id>/patients/", therapist_views.get_patients_by_therapist, name="get_patients_by_therapist"),
    path("api/patients/healthstatus-history/<str:patient_id>/", patient_views.get_patient_healthstatus_history, name="get_patient_healthstatus_history"),
    path("api/patients/health-combined-history/<str:patient_id>/", patient_views.get_combined_health_data, name="get_combined_health_data"),
    path("api/analytics/log", therapist_views.create_log, name="create_log"),
    path("api/fitbit/summary/", fitbit_views.fitbit_summary, name="fitbit-summary-me"),
    path("api/fitbit/summary/<str:patient_id>/", fitbit_views.fitbit_summary, name="fitbit-summary"),
    path("api/patients/vitals/manual/<str:patient_id>/", patient_views.add_manual_vitals, name="add_manual_vitals"),
    path("api/patients/vitals/exists/<str:patient_id>/", patient_views.vitals_exists_for_day, name="vitals_exists_for_day"),
    path("api/fitbit/manual_steps/<str:patient_id>/", fitbit_views.manual_steps, name="manual-steps"),
    path("api/users/<str:therapist_id>/change-password/", user_views.change_password, name="change_password"),
    path("api/patients/health-combined-history/<str:patient_id>/",fitbit_views.health_combined_history,name="health_combined_history"),
    path("api/auth/get-user-info/<str:user_id>/", auth_views.get_user_info),

    path("api/healthslider/items/", list_healthslider_items),
    path("api/healthslider/audio/<str:item_id>/", download_healthslider_audio),
    path("api/healthslider/submit-item/", submit_healthslider_item),

]

# Only add this if DEBUG=True, which is typical in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
