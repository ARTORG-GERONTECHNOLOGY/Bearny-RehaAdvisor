from django.urls import URLPattern, get_resolver, resolve, reverse

import core.views.auth_views as auth_views
import core.views.patient_views as patient_views
import core.views.recomendation_views as recomendation_views
import core.views.therapist_views as therapist_views
import core.views.user_views as user_views
import core.views.views as core_views


def test_index_url_resolves():
    resolver = resolve("/api/")
    assert resolver.func == core_views.index


def test_login_url_resolves():
    resolver = resolve("/api/auth/login/")
    assert resolver.func == auth_views.login_view


def test_logout_url_resolves():
    resolver = resolve("/api/auth/logout/")
    assert resolver.func == auth_views.logout_view


def test_register_url_resolves():
    resolver = resolve("/api/auth/register/")
    assert resolver.func == auth_views.register_view


def test_user_profile_url_resolves():
    path = reverse("user_profile_detail", kwargs={"user_id": "123"})
    resolver = resolve(path)
    assert resolver.func == user_views.user_profile_view


def test_list_therapist_patients_url_resolves():
    path = reverse("get_patients_by_therapist", kwargs={"therapist_id": "therapist123"})
    resolver = resolve(path)
    assert resolver.func == therapist_views.list_therapist_patients


def test_get_patient_plan_url_resolves():
    path = reverse("get_patient_reha_plan", kwargs={"patient_id": "patient123"})
    resolver = resolve(path)
    assert resolver.func == patient_views.get_patient_plan


def test_get_patient_plan_for_therapist_url_resolves():
    path = reverse("get_rehabilitation_plan", kwargs={"patient_id": "patient123"})
    resolver = resolve(path)
    assert resolver.func == patient_views.get_patient_plan_for_therapist


def test_add_intervention_to_patient_url_resolves():
    resolver = resolve("/api/interventions/add-to-patient/")
    assert resolver.func == patient_views.add_intervention_to_patient


def test_submit_feedback_url_resolves():
    resolver = resolve("/api/patients/feedback/questionaire/")
    assert resolver.func == patient_views.submit_patient_feedback


def test_list_all_interventions_url_resolves():
    resolver = resolve("/api/interventions/all/")
    assert resolver.func == recomendation_views.list_all_interventions


def test_get_intervention_detail_url_resolves():
    path = reverse("get_recommendation_info", kwargs={"intervention_id": "abc123"})
    resolver = resolve(path)
    assert resolver.func == recomendation_views.get_intervention_detail


def test_fetch_feedback_questions_url_resolves():
    path = reverse(
        "get_feedback_questions_no_intervention",
        kwargs={"questionaire_type": "health", "patient_id": "p123"},
    )
    resolver = resolve(path)
    assert resolver.func == patient_views.get_feedback_questions
