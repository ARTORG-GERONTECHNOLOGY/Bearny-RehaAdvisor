from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from mongoengine import connect, disconnect
from rest_framework.test import APIClient

from core.models import Therapist, Patient


class TherapistViewsTestCase(TestCase):

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

        # Create a therapist
        self.therapist = Therapist(
            username='therapist1',
            email='therapist1@example.com',
            phone='1234567890',
            pwdhash=make_password('password123'),
            first_name='John',
            name='Doe',
            accepted=True
        ).save()

        # Create some patients associated with the therapist
        self.patient1 = Patient(
            username='patient1',
            email='patient1@example.com',
            phone='0987654321',
            password=make_password('password456'),
            first_name='Jane',
            name='Smith',
            therapist=self.therapist,
            created_at=timezone.now()
        ).save()

        self.patient2 = Patient(
            username='patient2',
            email='patient2@example.com',
            phone='0987654322',
            password=make_password('password789'),
            first_name='Tom',
            name='Johnson',
            therapist=self.therapist,
            created_at=timezone.now()
        ).save()

        # Authenticate as the therapist
        self.client.force_authenticate(user=self.therapist)

    def tearDown(self):
        """Clean up the test data."""
        Patient.objects.delete()
        Therapist.objects.delete()

    def test_get_patients_by_therapist(self):
        """Test retrieving patients assigned to a therapist."""
        response = self.client.get(reverse('get_patients_by_therapist', args=[self.therapist.username]))
        self.assertEqual(response.status_code, 200)

        response_data = response.json()
        self.assertEqual(len(response_data), 2)  # Check if 2 patients are returned
        self.assertEqual(response_data[0]['therapist'], self.therapist.name)
        self.assertEqual(response_data[1]['therapist'], self.therapist.name)

    def test_get_patients_by_therapist_not_found(self):
        """Test retrieving patients for a non-existent therapist."""
        response = self.client.get(reverse('get_patients_by_therapist', args=['nonexistent_therapist']))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error'], 'Therapist not found')

    def test_get_patients_by_therapist_no_patients(self):
        """Test retrieving patients when no patients are assigned to the therapist."""
        # Remove all patients for the therapist
        Patient.objects.filter(therapist=self.therapist).delete()

        response = self.client.get(reverse('get_patients_by_therapist', args=[self.therapist.username]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])  # No patients should be returned
