from django.conf import settings
from django.conf.urls.static import static
from django.urls import path

from . import views

urlpatterns = [path('', views.index, name='index'),
               path('api/login/', views.login, name='login'),
               path('api/forgot_password/', views.forgot_password, name='forgot_password'),
               path('api/reset_password/', views.reset_password, name='reset_password'),
               path('api/therapists/<str:therapist_id>/patients/', views.get_patients_by_therapist, name='get_patients_by_therapist'),
               path('api/recommendations/', views.get_recommendations, name='get_recommendations'),
               path('api/recommendations/get/<str:patient_id>', views.get_patient_recommendations, name='get_patient_recommendations'),
               path('api/users/<str:user_id>/profile/', views.user_profile, name='user_profile'),
               path('api/send-verification-code/', views.sendVerificationCode,
                    name='send_verification_code'),
               path('api/verify-code/', views.verify_code, name='verify_code'),
               path('api/register/', views.register, name='register'),
               path('api/rehab/<str:patient_id>/', views.get_rehab_data, name='get_rehab_data'),
               path('api/recommendations/add', views.add_recommendation, name='add_recommendation'),
               path('api/therapist/<str:therapist>/patientsbyinter/<str:intervention>', views.get_patients_by_therapist_and_inter, name='get_patients_by_therapist_and_inter'),
               path('api/addinterforpatient', views.add_intervention_to_patient, name='add_intervention_to_patient'),
               path('api/rminterforpatient', views.rm_rec_intervention_to_patient, name='rm_rec_intervention_to_patient'),
               path('api/patient/<str:patient_id>/', views.get_patient, name='get_patient'),
               path('api/patient/<str:patient_id>/today', views.get_patient_reha_today, name='get_patient_reha_today'),
               path('api/patient/<str:patient_id>/feedback/<str:intervention>', views.give_feedback, name='give_feedback'),
               path('api/recommendation/<str:intervention>', views.get_recommendation_info, name='get_recommendation_info'),
               path('api/markdone', views.mark_done, name='mark_done'),
               path(
                   'api/intervention/<str:intervention>/assignedDiagnoses/<str:specialisation>/bypatient/<str:therapist_id>',
                   views.assignedDiagnoses, name='assignedDiagnoses'),
               path('api/rminterforptypes', views.get_rminterfor_ptypes, name='get_rminterfor_ptypes'),
               path('api/assignInterventionsptypes', views.assignInterventions_ptypes,
                    name='assignInterventions_ptypes'),
               ]

# Only add this if DEBUG=True, which is typical in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

