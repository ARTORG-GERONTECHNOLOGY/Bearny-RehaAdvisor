import json

from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from mongoengine import connect, disconnect
from rest_framework.test import APIClient

from core.models import Therapist


class UserProfileViewsTestCase(TestCase):

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
            accepted=True,
            created_at=timezone.now()
        ).save()

        # Authenticate as the therapist
        self.client.force_authenticate(user=self.therapist)

    def tearDown(self):
        """Clean up the test data."""
        Therapist.objects.delete()

    def test_get_user_profile(self):
        """Test retrieving user profile."""
        response = self.client.get(reverse('user_profile', args=[self.therapist.username]))
        self.assertEqual(response.status_code, 200)

        response_data = response.json()
        self.assertEqual(response_data['username'], self.therapist.username)
        self.assertEqual(response_data['email'], self.therapist.email)

    def test_get_user_profile_not_found(self):
        """Test retrieving a non-existent user profile."""
        response = self.client.get(reverse('user_profile', args=['nonexistent_user']))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error'], 'User not found')

    def test_update_user_profile(self):
        """Test updating user profile."""
        updated_data = {
            "email": "updated_therapist@example.com",
            "phone": "9876543210",
            "first_name": "UpdatedJohn"
        }

        response = self.client.put(
            reverse('user_profile', args=[self.therapist.username]),
            data=json.dumps(updated_data),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)

        updated_user = Therapist.objects.get(username=self.therapist.username)
        self.assertEqual(updated_user.email, updated_data['email'])
        self.assertEqual(updated_user.phone, updated_data['phone'])
        self.assertEqual(updated_user.first_name, updated_data['first_name'])

    def test_update_user_profile_not_found(self):
        """Test updating a non-existent user profile."""
        response = self.client.put(
            reverse('user_profile', args=['nonexistent_user']),
            data=json.dumps({"email": "new_email@example.com"}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error'], 'User not found')

    def test_delete_user_profile(self):
        """Test deleting user profile."""
        response = self.client.delete(reverse('user_profile', args=[self.therapist.username]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['message'], 'User deleted successfully.')

        # Verify that the user has been deleted
        with self.assertRaises(Therapist.DoesNotExist):
            Therapist.objects.get(username=self.therapist.username)

    def test_delete_user_profile_not_found(self):
        """Test deleting a non-existent user profile."""
        response = self.client.delete(reverse('user_profile', args=['nonexistent_user']))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error'], 'User not found')

    def test_invalid_method(self):
        """Test invalid HTTP method for user_profile."""
        response = self.client.post(reverse('user_profile', args=[self.therapist.username]))
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.json()['error'], 'Method not allowed')
