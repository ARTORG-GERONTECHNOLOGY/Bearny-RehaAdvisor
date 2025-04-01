import json

from app.models import Intervention, PatientInterventions
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from mongoengine import connect, disconnect
from rest_framework.test import APIClient

from core.models import Therapist, Patient


class PatientViewsTestCase(TestCase):

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
            pwdhash=make_password('password123'),
            first_name='John',
            name='Doe',
            accepted=True
        ).save()

        self.patient = Patient(
            username='patient1',
            email='patient1@example.com',
            phone='0987654321',
            password=make_password('password456'),
            first_name='Jane',
            name='Smith',
            therapist=self.therapist,
            age='30',
            sex='female'
        ).save()

        self.recommendation = Intervention(
            title="Exercise 1",
            description="Test Exercise",
            content_type="video"
        ).save()

        self.patient_intervention = PatientInterventions(
            patient_id=self.patient,
            intervention_id=self.recommendation,
            frequency="weekly",
            recomended_t=True
        ).save()

        self.client.force_authenticate(user=self.patient)

    def tearDown(self):
        """Clean up the test data."""
        Patient.objects.delete()
        Therapist.objects.delete()
        Intervention.objects.delete()
        PatientInterventions.objects.delete()

    def test_get_patient(self):
        """Test retrieving a patient by username."""
        response = self.client.get(reverse('get_patient', args=[self.patient.username]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['username'], self.patient.username)

    def test_get_patient_not_found(self):
        """Test retrieving a non-existent patient."""
        response = self.client.get(reverse('get_patient', args=['nonexistent']))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error'], 'Patient not found')

    def test_patient_post_feedback(self):
        """Test posting feedback for a patient intervention."""
        response = self.client.post(
            reverse('patient_post_feedback', args=[self.patient.username, str(self.recommendation.id)]),
            data=json.dumps({'comment': 'Great exercise', 'rating': '5'}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['message'], 'Feedback submitted successfully')

    def test_add_intervention_to_patient(self):
        """Test adding an intervention to a patient."""
        new_recommendation = Intervention(
            title="Exercise 2",
            description="New Exercise",
            content_type="video"
        ).save()

        response = self.client.post(reverse('add_intervention_to_patient'), data={
            'patient_id': self.patient.username,
            'intervention_id': str(new_recommendation.id)
        })

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['message'], 'Intervention added successfully')

    def test_add_existing_intervention_to_patient(self):
        """Test adding an already assigned intervention to a patient."""
        response = self.client.post(reverse('add_intervention_to_patient'), data={
            'patient_id': self.patient.username,
            'intervention_id': str(self.recommendation.id)
        })

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'Intervention already assigned')

    def test_mark_intervention_done_by_patient(self):
        """Test marking an intervention as done by the patient."""
        response = self.client.post(reverse('mark_intervention_done_by_patient'), data={
            'patient_id': self.patient.username,
            'intervention_id': str(self.recommendation.id)
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['message'], 'Marked as done successfully')

    def test_get_rehab_data(self):
        """Test retrieving rehab data for a patient."""
        response = self.client.get(reverse('get_rehab_data', args=[self.patient.username]))
        self.assertEqual(response.status_code, 200)
        self.assertIn('reha_data', response.json())

    def test_get_recommendation_options_for_patient(self):
        """Test retrieving recommendation options for a patient."""
        response = self.client.get(reverse('get_recommendation_options_for_patient', args=[self.patient.username]))
        self.assertEqual(response.status_code, 200)
        self.assertIn('recommendations', response.json())

    def test_get_patient_recommendations(self):
        """Test retrieving today's recommendations for a patient."""
        response = self.client.get(reverse('get_patient_recommendations', args=[self.patient.username]))
        self.assertEqual(response.status_code, 200)
        self.assertIn('recommendations', response.json())
