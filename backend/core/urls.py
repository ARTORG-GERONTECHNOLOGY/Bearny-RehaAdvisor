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

urlpatterns = [
    path('', core_views.index, name='index'),

    # Authentication
    path('api/auth/login/', auth_views.login, name='login'),
    path('api/auth/forgot-password/', auth_views.forgot_password, name='forgot_password'),
    path('api/auth/reset-password/', auth_views.reset_password, name='reset_password'),
    path('api/auth/register/', auth_views.register, name='register'),
    path('api/auth/send-verification-code/', auth_views.sendVerificationCode, name='send_verification_code'),
    path('api/auth/verify-code/', auth_views.verify_code, name='verify_code'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # User Profile
    path('api/users/<str:user_id>/profile/', user_views.user_profile, name='user_profile'),
    path('api/users/<str:user_id>/profile/patient', user_views.user_profile_patient, name='user_profile'),

    # Therapist and Patient Management
    path('api/therapists/<str:therapist_id>/patients/', therapist_views.get_patients_by_therapist,
         name='get_patients_by_therapist'),

    path('api/patients/<str:patient_id>/', patient_views.get_patient, name='get_patient'),
    # Old: 'api/patient/<str:patient_id>/'
    path('api/patients/<str:patient_id>/rehab/', patient_views.get_rehab_data, name='get_rehab_data'),
    path('api/patients/<str:patient_id>/today/', patient_views.get_patient_reha_today, name='get_patient_reha_today'),
    path('api/patients/<str:patient_id>/feedback/<str:intervention_id>/', patient_views.patient_post_feedback,
         name='patient_post_feedback'),
     path('api/patients/feedback/questionaire', patient_views.patient_post_questionnaire_feedback,
         name='patient_post_feedback'),
    path('api/patients/', recomendation_views.get_recommendations, name='get_recommendations'),
    path('api/patients/<str:patient_id>/todays/', patient_views.get_patient_recommendations,
         name='get_patient_recommendations'),  # Old: 'api/recommendations/get/<str:patient_id>'
    path('api/recommendations/suggestions/<str:patient_id>/', patient_views.get_recommendation_options_for_patient,
         name='get_recommendation_options_for_patient'),  # Old: 'api/recommendations/suggestions/<str:patient_id>'
     

    # Recommendations
    path('api/recommendations/all/', recomendation_views.get_recommendations, name='get_recommendations'),
    path('api/recommendations/add/', recomendation_views.create_intervention, name='create_intervention'),
    path('api/recommendations/assign-to-patient-types/', recomendation_views.assign_intervention_to_patient_types,
         name='assign_intervention_to_patient_types'),
    path('api/recommendations/remove-from-patient-types/', recomendation_views.delete_intervention_from_patient_types,
         name='delete_intervention_from_patient_types'),
    path('api/recommendations/add-to-patient/', patient_views.add_intervention_to_patient,
         name='add_intervention_to_patient'),
    path('api/recommendations/remove-from-patient/', recomendation_views.delete_intervention_from_patient_types,
         name='rm_rec_intervention_to_patient'),
    path('api/recommendations/mark-done/', patient_views.mark_intervention_done_by_patient,
         name='mark_intervention_done_by_patient'),
    # Intervention Assignments and Diagnoses
    path('api/recommendations/<str:intervention>/assigned-diagnoses/<str:specialisation>/therapist/<str:therapist_id>/',
         recomendation_views.get_recommended_diagnoses_for_intervention,
         name='get_recommended_diagnoses_for_intervention'),
    path('api/recommendations/<str:intervention_id>/', recomendation_views.get_recommendation_info,
         name='get_recommendation_info'),

     path('api/recommendations/daily_recomendations/nooraemiliaangelva', recomendation_views.update_daily_recomendations,
         name='update_daily_recomendations'),
]

# Only add this if DEBUG=True, which is typical in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
