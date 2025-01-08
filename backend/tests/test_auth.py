from app.models import Therapist, Patient
from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from mongoengine import connect, disconnect
from rest_framework.test import APIClient


class AuthViewsTestCase(TestCase):

    @classmethod
    def setUpClass(cls):
        """Set up test database connection and sample data."""
        super().setUpClass()
        connect('testdb', host='mongomock://localhost')

    @classmethod
    def tearDownClass(cls):
        """Disconnect test database after all tests are done."""
        disconnect()

    def setUp(self):
        """Set up the test client and sample users."""
        self.client = APIClient()
        self.therapist = Therapist(
            username='therapist1',
            email='therapist1@example.com',
            phone='1234567890',
            pwdhash=make_password('password123'),
            first_name='John',
            name='Doe',
            specializations=['specialization1'],
            clinics=['clinic1'],
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

    def tearDown(self):
        """Clean up any objects created during the tests."""
        Therapist.objects.delete()
        Patient.objects.delete()

    def test_login_success(self):
        """Test successful login for a therapist."""
        response = self.client.post(reverse('login'), data={
            'email': self.therapist.email,
            'password': 'password123'
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertIn('access_token', response.json())
        self.assertIn('refresh_token', response.json())

    def test_login_invalid_credentials(self):
        """Test login with invalid credentials."""
        response = self.client.post(reverse('login'), data={
            'email': self.therapist.email,
            'password': 'wrongpassword'
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'error': 'Invalid credentials'})

    def test_forgot_password(self):
        """Test forgot password functionality."""
        response = self.client.post(reverse('forgot_password'), data={
            'email': self.therapist.email
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'email': self.therapist.email})

    def test_reset_password(self):
        """Test password reset functionality."""
        new_password = 'newpassword123'
        response = self.client.post(reverse('reset_password'), data={
            'email': self.therapist.email,
            'password': new_password
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'message': 'Password reset successfully'})

        # Verify that the password has been updated
        therapist = Therapist.objects.get(email=self.therapist.email)
        self.assertTrue(therapist.check_password(new_password))

    def test_verify_code_success(self):
        """Test verification code success."""
        response = self.client.post(reverse('verify_code'), data={
            'userId': str(self.therapist.id),
            'verificationCode': '0000'  # Assuming static code in view logic
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'message': 'Verification successful'})

    def test_verify_code_failure(self):
        """Test verification code failure."""
        response = self.client.post(reverse('verify_code'), data={
            'userId': str(self.therapist.id),
            'verificationCode': '1234'
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'error': 'Invalid verification code'})
