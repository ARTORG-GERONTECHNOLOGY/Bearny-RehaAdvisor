import json

from app.models import Intervention, PatientInterventions, PatientType
from django.test import TestCase
from django.urls import reverse
from mongoengine import connect, disconnect
from rest_framework.test import APIClient

from core.models import Therapist, Patient


class InterventionViewsTestCase(TestCase):

    @classmethod
    def setUpClass(cls):
        """Set up test database connection."""
        super().setUpClass()
        connect('testdb', host='mongomock://localhost')

    @classmethod
    def tearDownClass(cls):
        """Disconnect test database after all tests are done."""
        disconnect()

    def setUp(self):
        """Set up the test client and sample data."""
        self.client = APIClient()

        self.therapist = Therapist(
            username='therapist1',
            email='therapist1@example.com',
            phone='1234567890',
            first_name='John',
            name='Doe',
            accepted=True,
            default_recommendations=[]
        ).save()

        self.patient = Patient(
            username='patient1',
            email='patient1@example.com',
            phone='0987654321',
            first_name='Jane',
            name='Smith',
            therapist=self.therapist,
            diagnosis=['diagnosis1']
        ).save()

        self.recommendation = Intervention(
            title="Exercise 1",
            description="Test Exercise",
            content_type="video",
            link="https://example.com/video",
            patient_types=[PatientType(type="specialisation1", diagnosis="diagnosis1", frequency="weekly")]
        ).save()

        self.client.force_authenticate(user=self.therapist)

    def tearDown(self):
        """Clean up the test data."""
        Patient.objects.delete()
        Therapist.objects.delete()
        Intervention.objects.delete()
        PatientInterventions.objects.delete()

    def test_get_recommendations(self):
        """Test fetching all recommendations."""
        response = self.client.get(reverse('get_recommendations'))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(len(response.json()) > 0)
        self.assertEqual(response.json()[0]['title'], self.recommendation.title)

    def test_create_intervention(self):
        """Test creating a new intervention."""
        data = {
            'title': 'Exercise 2',
            'description': 'New Exercise',
            'contentType': 'video',
            'patientTypes': json.dumps([{
                'type': 'specialisation1',
                'diagnosis': 'diagnosis1',
                'frequency': 'weekly',
                'include_option': True
            }])
        }
        response = self.client.post(reverse('create_intervention'), data=data, content_type='application/json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['success'], 'Intervention added successfully!')

    def test_create_intervention_duplicate_title(self):
        """Test creating an intervention with a duplicate title."""
        data = {
            'title': 'Exercise 1',  # Duplicate title
            'description': 'Duplicate Exercise',
            'contentType': 'video',
            'patientTypes': json.dumps([])
        }
        response = self.client.post(reverse('create_intervention'), data=data, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'A recommendation with this title already exists')

    def test_get_recommendation_info(self):
        """Test fetching detailed recommendation info."""
        response = self.client.get(reverse('get_recommendation_info', args=[str(self.recommendation.id)]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['recommendation']['title'], self.recommendation.title)

    def test_get_recommendation_info_not_found(self):
        """Test fetching info for a non-existent recommendation."""
        response = self.client.get(reverse('get_recommendation_info', args=['nonexistent_id']))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error'], 'Intervention not found.')

    def test_assign_intervention_to_patient_types(self):
        """Test assigning an intervention to patient types."""
        data = {
            'diagnosis': 'diagnosis1',
            'intervention_id': str(self.recommendation.id),
            'therapist': self.therapist.username
        }
        response = self.client.post(reverse('assign_intervention_to_patient_types'), data=json.dumps(data),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 201)
        self.assertIn('Intervention assigned', response.json()['success'])

    def test_delete_intervention_from_patient_types(self):
        """Test removing an intervention from patient types."""
        data = {
            'diagnosis': 'diagnosis1',
            'intervention_id': str(self.recommendation.id),
            'therapist': self.therapist.username
        }
        # Assign first
        self.client.post(reverse('assign_intervention_to_patient_types'), data=json.dumps(data),
                         content_type='application/json')

        # Remove
        response = self.client.post(reverse('delete_intervention_from_patient_types'), data=json.dumps(data),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 201)
        self.assertIn('Intervention removed', response.json()['success'])

    def test_get_recommended_diagnoses_for_intervention(self):
        """Test fetching recommended diagnoses for an intervention."""
        response = self.client.get(reverse('get_recommended_diagnoses_for_intervention', args=[
            str(self.recommendation.id), 'specialisation1', self.therapist.username
        ]))
        self.assertEqual(response.status_code, 200)
        self.assertIn('diagnoses', response.json())
