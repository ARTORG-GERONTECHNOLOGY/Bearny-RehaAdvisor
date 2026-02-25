import core.views.patient_views as patient_views
from unittest.mock import MagicMock, patch
import json
from django.test import TestCase, RequestFactory
from core.models import Patient

class InitialPatientQuestionnaireTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.patient_id = "699f1098e7e1266a39578548"

    @patch.object(patient_views.Patient, "objects", new_callable=MagicMock)
    def test_get_requires_questionnaire(self, mock_objects):
        mock_objects.get.return_value = MagicMock(
            level_of_education=None,
            professional_status=None,
            marital_status=None,
            lifestyle=None,
            personal_goals=None,
        )

        request = self.factory.get(f"/api/users/{self.patient_id}/initial-questionaire/")
        response = patient_views.initial_patient_questionaire(request, self.patient_id)

        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(response.content, {"success": True, "requires_questionnaire": True})

    @patch.object(patient_views.Patient, "objects", new_callable=MagicMock)
    def test_get_filled_out_questionnaire(self, mock_objects):
        mock_objects.get.return_value = MagicMock(
            level_of_education="Bachelor",
            professional_status="Employed",
            marital_status="Married",
            lifestyle=["Active"],
            personal_goals=["Mobility"],
        )

        request = self.factory.get(f"/api/users/{self.patient_id}/initial-questionaire/")
        response = patient_views.initial_patient_questionaire(request, self.patient_id)

        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(response.content, {"success": True, "requires_questionnaire": False})

    @patch.object(patient_views.Patient, "objects", new_callable=MagicMock)
    def test_post_missing_fields(self, mock_objects):
        mock_objects.get.return_value = MagicMock()

        request = self.factory.post(
            f"/api/users/{self.patient_id}/initial-questionaire/",
            data=json.dumps({}),
            content_type="application/json",
        )
        response = patient_views.initial_patient_questionaire(request, self.patient_id)

        self.assertEqual(response.status_code, 400)

    @patch.object(patient_views.Patient, "objects", new_callable=MagicMock)
    def test_post_valid_submission(self, mock_objects):
        mock_patient = MagicMock()
        mock_objects.get.return_value = mock_patient

        payload = {
            "level_of_education": "Bachelor",
            "professional_status": "Employed",
            "marital_status": "Married",
            "lifestyle": ["Active"],
            "personal_goals": ["Mobility"],
        }
        request = self.factory.post(
            f"/api/users/{self.patient_id}/initial-questionaire/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        response = patient_views.initial_patient_questionaire(request, self.patient_id)

        self.assertEqual(response.status_code, 201)
        mock_patient.save.assert_called_once()

    @patch.object(patient_views.Patient, "objects", new_callable=MagicMock)
    def test_method_not_allowed(self, mock_objects):
        # view tries to load patient BEFORE method check
        mock_objects.get.return_value = MagicMock()

        request = self.factory.put(f"/api/users/{self.patient_id}/initial-questionaire/")
        response = patient_views.initial_patient_questionaire(request, self.patient_id)

        self.assertEqual(response.status_code, 405)

    @patch.object(patient_views.Patient, "objects", new_callable=MagicMock)
    def test_patient_not_found(self, mock_objects):
        mock_objects.get.side_effect = Patient.DoesNotExist

        request = self.factory.get(f"/api/users/{self.patient_id}/initial-questionaire/")
        response = patient_views.initial_patient_questionaire(request, self.patient_id)

        self.assertEqual(response.status_code, 404)
        self.assertJSONEqual(response.content, {"success": False, "message": "Patient not found."})