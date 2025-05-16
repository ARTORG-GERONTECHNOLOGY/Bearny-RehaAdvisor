import json
from unittest.mock import patch, MagicMock
from bson import ObjectId
from django.test import TestCase, RequestFactory
from django.http import JsonResponse
from core.views.patient_views import initial_patient_questionaire
from core.models import Patient


class InitialPatientQuestionnaireTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.patient_id = str(ObjectId())

    @patch('core.views.patient_views.Patient.objects.get')
    def test_get_requires_questionnaire(self, mock_get):
        mock_patient = MagicMock(
            level_of_education=None,
            professional_status=None,
            marital_status=None,
            lifestyle=None,
            personal_goals=None
        )
        mock_get.return_value = mock_patient
        request = self.factory.get(f'/api/users/{self.patient_id}/initial-questionaire/')
        response = initial_patient_questionaire(request, self.patient_id)
        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(response.content, {"data": True})

    @patch('core.views.patient_views.Patient.objects.get')
    def test_get_filled_out_questionnaire(self, mock_get):
        mock_patient = MagicMock(
            level_of_education="Bachelor",
            professional_status="Employed",
            marital_status="Married",
            lifestyle=["Active"],
            personal_goals=["Mobility"]
        )
        mock_get.return_value = mock_patient
        request = self.factory.get(f'/api/users/{self.patient_id}/initial-questionaire/')
        response = initial_patient_questionaire(request, self.patient_id)
        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(response.content, {"data": False})

    @patch('core.views.patient_views.Patient.objects.get')
    def test_post_missing_fields(self, mock_get):
        mock_patient = MagicMock()
        mock_get.return_value = mock_patient
        request = self.factory.post(
            f'/api/users/{self.patient_id}/initial-questionaire/',
            data=json.dumps({}), content_type="application/json"
        )
        response = initial_patient_questionaire(request, self.patient_id)
        self.assertEqual(response.status_code, 400)
        self.assertJSONEqual(response.content, {"error": "All fields are required."})

    @patch('core.views.patient_views.Patient.objects.get')
    def test_post_valid_submission(self, mock_get):
        mock_patient = MagicMock()
        mock_get.return_value = mock_patient
        payload = {
            "level_of_education": "Bachelor",
            "professional_status": "Employed",
            "marital_status": "Married",
            "lifestyle": ["Active"],
            "personal_goals": ["Mobility"]
        }
        request = self.factory.post(
            f'/api/users/{self.patient_id}/initial-questionaire/',
            data=json.dumps(payload), content_type="application/json"
        )
        response = initial_patient_questionaire(request, self.patient_id)
        self.assertEqual(response.status_code, 201)
        self.assertJSONEqual(response.content, {"message": "Initial questionnaire submitted successfully."})

    @patch('core.views.patient_views.Patient.objects.get')
    def test_method_not_allowed(self, mock_get):
        mock_patient = MagicMock()
        mock_get.return_value = mock_patient
        request = self.factory.put(f'/api/users/{self.patient_id}/initial-questionaire/')
        response = initial_patient_questionaire(request, self.patient_id)
        self.assertEqual(response.status_code, 405)
        self.assertJSONEqual(response.content, {"error": "Method not allowed"})

    @patch('core.views.patient_views.Patient.objects.get')
    def test_patient_not_found(self, mock_get):
        mock_get.side_effect = Patient.DoesNotExist
        request = self.factory.get(f'/api/users/{self.patient_id}/initial-questionaire/')
        response = initial_patient_questionaire(request, self.patient_id)
        self.assertEqual(response.status_code, 404)
        self.assertJSONEqual(response.content, {"error": "Patient not found"})
