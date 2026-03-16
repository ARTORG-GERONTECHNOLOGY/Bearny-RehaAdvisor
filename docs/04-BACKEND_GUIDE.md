# Backend Development Guide

## Overview

The RehaAdvisor backend is a Django REST API application built with Django Rest Framework (DRF). It handles all business logic, data management, authentication, and integration with MongoDB. This guide covers development practices, API design, authentication, and best practices.

## Project Structure

```
backend/
├── api/                       # REST API endpoints
│   ├── views.py              # API views and viewsets
│   ├── serializers.py        # DRF serializers
│   ├── permissions.py        # Custom permission classes
│   ├── filters.py            # Filter backends
│   ├── pagination.py         # Pagination classes
│   ├── throttling.py         # Rate limiting
│   ├── urls.py               # API URL routing
│   └── __init__.py
│
├── core/                      # Core Django app
│   ├── models.py             # Data models
│   ├── admin.py              # Django admin configuration
│   ├── apps.py
│   └── __init__.py
│
├── config/                    # Django settings
│   ├── settings/
│   │   ├── base.py           # Base settings (shared)
│   │   ├── development.py    # Development settings
│   │   └── production.py     # Production settings
│   ├── urls.py               # Root URL configuration
│   ├── wsgi.py               # WSGI application
│   └── asgi.py               # ASGI application (async)
│
├── utils/                     # Utility modules
│   ├── decorators.py         # Custom decorators
│   ├── exceptions.py         # Custom exceptions
│   ├── helpers.py            # Helper functions
│   └── validators.py         # Custom validators
│
├── tests/                     # Test suite
│   ├── test_api.py
│   ├── test_models.py
│   ├── conftest.py           # Pytest configuration
│   └── fixtures/
│
├── manage.py                  # Django management command
├── requirements.txt           # Python dependencies
├── pytest.ini                 # Pytest configuration
├── wsgi.py                    # Production WSGI entry
├── celery.py                  # Celery configuration
└── environment.yml            # Conda environment file
```

## Setup and Installation

### Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Environment Variables

Create a `.env` file:

```bash
DEBUG=False
SECRET_KEY=your-secret-key-here
ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_NAME=rehaadvisor
DATABASE_USER=admin
DATABASE_PASSWORD=password
MONGODB_URI=mongodb://localhost:27017/
```

### Database Setup

```bash
# Apply migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Load initial data (if needed)
python manage.py loaddata initial_data.json
```

## Django Models

### Model Definition Pattern

```python
# core/models.py
from django.db import models
from django.contrib.auth.models import AbstractUser

class CustomUser(AbstractUser):
    """Extended user model with custom fields."""
    
    ROLE_CHOICES = (
        ('therapist', 'Therapist'),
        ('researcher', 'Researcher'),
        ('admin', 'Administrator'),
    )
    
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='therapist')
    phone = models.CharField(max_length=20, blank=True)
    bio = models.TextField(blank=True)
    
    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"
    
    def __str__(self):
        return f"{self.get_full_name()} ({self.role})"


class Patient(models.Model):
    """Patient model."""
    
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20)
    therapist = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.first_name} {self.last_name}"
```

## REST API Development

### Serializers

Serializers convert model instances to/from JSON:

```python
# api/serializers.py
from rest_framework import serializers
from core.models import Patient, CustomUser

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'role')
        read_only_fields = ('id',)

class PatientSerializer(serializers.ModelSerializer):
    therapist_name = serializers.CharField(source='therapist.get_full_name', read_only=True)
    
    class Meta:
        model = Patient
        fields = ('id', 'first_name', 'last_name', 'email', 'phone', 'therapist', 'therapist_name', 'created_at')
        read_only_fields = ('id', 'created_at', 'therapist_name')
    
    def validate_email(self, value):
        """Validate email uniqueness during creation."""
        if self.instance is None and Patient.objects.filter(email=value).exists():
            raise serializers.ValidationError("A patient with this email already exists.")
        return value
```

### Views and ViewSets

```python
# api/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from core.models import Patient, CustomUser
from .serializers import PatientSerializer, UserSerializer
from .permissions import IsTherapistOrReadOnly

class PatientViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing patients.
    
    - list: Get all patients
    - create: Create new patient
    - retrieve: Get patient details
    - update: Update patient
    - destroy: Delete patient
    - my_patients: Get current user's patients
    """
    
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated, IsTherapistOrReadOnly]
    
    def get_queryset(self):
        """Return patients filtered by therapist."""
        user = self.request.user
        if user.role == 'therapist':
            return Patient.objects.filter(therapist=user)
        return Patient.objects.all()
    
    def perform_create(self, serializer):
        """Automatically set therapist to current user."""
        serializer.save(therapist=self.request.user)
    
    @action(detail=False, methods=['get'])
    def my_patients(self, request):
        """Get current therapist's patients."""
        patients = self.get_queryset()
        serializer = self.get_serializer(patients, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def assign_therapy(self, request, pk=None):
        """Assign therapy program to patient."""
        patient = self.get_object()
        # Implementation here
        return Response({'status': 'therapy assigned'})


class UserViewSet(viewsets.ModelViewSet):
    """API endpoint for managing users."""
    
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
```

### Authentication

```python
# api/views.py - Token endpoints
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

class CustomTokenObtainPairView(TokenObtainPairView):
    """Custom token view with additional user data."""
    
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        user = CustomUser.objects.get(username=request.data.get('username'))
        response.data['user'] = UserSerializer(user).data
        return response
```

### Permission Classes

```python
# api/permissions.py
from rest_framework import permissions

class IsTherapistOrReadOnly(permissions.BasePermission):
    """Permission to only allow therapists to edit."""
    
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.therapist == request.user or request.user.is_staff

class IsOwnerOrReadOnly(permissions.BasePermission):
    """Permission to only allow owners to edit their own data."""
    
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj == request.user or request.user.is_staff
```

### URL Routing

```python
# api/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PatientViewSet, UserViewSet, CustomTokenObtainPairView

router = DefaultRouter()
router.register(r'patients', PatientViewSet, basename='patient')
router.register(r'users', UserViewSet, basename='user')

urlpatterns = [
    path('', include(router.urls)),
    path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
```

## API Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  },
  "message": "Operation successful"
}
```

### Error Response

```json
{
  "success": false,
  "error": "Not found",
  "details": {
    "id": ["Invalid id: this patient does not exist."]
  },
  "code": "NOT_FOUND"
}
```

## Testing

### Test Setup

```python
# tests/conftest.py
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def test_user(db):
    user = User.objects.create_user(
        username='testuser',
        email='test@example.com',
        password='testpass123'
    )
    return user

@pytest.fixture
def authenticated_client(api_client, test_user):
    api_client.force_authenticate(user=test_user)
    return api_client
```

### Model Tests

```python
# tests/test_models.py
import pytest
from core.models import Patient, CustomUser

@pytest.mark.django_db
class TestPatientModel:
    def test_create_patient(self):
        """Test patient creation."""
        user = CustomUser.objects.create_user(username='therapist')
        patient = Patient.objects.create(
            first_name='John',
            last_name='Doe',
            email='john@example.com',
            phone='123456789',
            therapist=user
        )
        assert patient.first_name == 'John'
        assert patient.therapist == user
```

### API Tests

```python
# tests/test_api.py
import pytest
from rest_framework import status

@pytest.mark.django_db
class TestPatientAPI:
    def test_list_patients(self, authenticated_client):
        """Test getting list of patients."""
        response = authenticated_client.get('/api/patients/')
        assert response.status_code == status.HTTP_200_OK
    
    def test_create_patient(self, authenticated_client):
        """Test creating a patient."""
        data = {
            'first_name': 'Jane',
            'last_name': 'Doe',
            'email': 'jane@example.com',
            'phone': '987654321'
        }
        response = authenticated_client.post('/api/patients/', data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['first_name'] == 'Jane'
```

### Running Tests

```bash
# Run all tests
pytest

# Run specific test file
pytest tests/test_models.py

# Run with coverage
pytest --cov=api --cov=core

# Run with verbose output
pytest -v

# Run specific test
pytest tests/test_api.py::TestPatientAPI::test_list_patients
```

## Asynchronous Tasks with Celery

### Celery Configuration

```python
# backend/celery.py
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('rehaadvisor')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
```

### Task Definition

```python
# core/tasks.py
from celery import shared_task
from django.core.mail import send_mail
from .models import Patient

@shared_task
def send_patient_reminder(patient_id):
    """Send reminder email to patient."""
    patient = Patient.objects.get(id=patient_id)
    send_mail(
        'Therapy Reminder',
        f'Dear {patient.first_name}, it\'s time for your therapy session.',
        'noreply@rehaadvisor.com',
        [patient.email],
        fail_silently=False,
    )

@shared_task
def generate_therapy_report(patient_id):
    """Generate therapy report asynchronously."""
    patient = Patient.objects.get(id=patient_id)
    # Generate report logic
    return f"Report generated for {patient.first_name}"
```

### Using Tasks in Views

```python
# api/views.py
from core.tasks import send_patient_reminder

@action(detail=True, methods=['post'])
def send_reminder(self, request, pk=None):
    """Send reminder to patient."""
    patient = self.get_object()
    send_patient_reminder.delay(patient.id)
    return Response({'status': 'reminder scheduled'})
```

## Best Practices

1. **Model Design**:
   - Use meaningful field names
   - Add appropriate validators
   - Use indexes for frequently queried fields
   - Document complex logic

2. **API Design**:
   - Follow RESTful conventions
   - Version your API
   - Provide comprehensive error messages
   - Use appropriate HTTP status codes

3. **Authentication & Authorization**:
   - Use JWT for stateless authentication
   - Implement proper permission classes
   - Never store sensitive data in logs
   - Validate all user inputs

4. **Performance**:
   - Use select_related() for FK queries
   - Use prefetch_related() for reverse queries
   - Implement pagination for large datasets
   - Cache frequently accessed data

5. **Testing**:
   - Write tests for all endpoints
   - Test edge cases and error conditions
   - Maintain >80% code coverage
   - Use fixtures for test data

6. **Error Handling**:
   - Use custom exceptions
   - Provide meaningful error messages
   - Log errors with context
   - Return appropriate HTTP status codes

7. **Code Quality**:
   - Follow PEP 8 conventions
   - Use type hints
   - Write docstrings
   - Keep functions focused and small

## Development Workflow

```bash
# Start development server
python manage.py runserver

# Access API
# http://localhost:8000/api/

# Access admin panel
# http://localhost:8000/admin/

# Start Celery worker (separate terminal)
celery -A backend worker -l info

# Start Celery beat (separate terminal)
celery -A backend beat -l info
```

---

## Named Template System

### Overview

The named template system (`backend/core/views/template_views.py`) lets therapists create, share, and apply reusable rehabilitation schedules called **InterventionTemplates**. It was introduced in three phases:

| Phase | What it adds |
|---|---|
| 1 | Template CRUD + copy |
| 2 | Assign interventions; apply to patient |
| 3 | Calendar/schedule preview |

All template views are registered in `backend/core/urls.py` under the `/api/templates/` prefix.

### Project structure additions

```
backend/
├── core/
│   ├── models.py                    # InterventionTemplate, DefaultInterventions, DiagnosisAssignmentSettings
│   └── views/
│       └── template_views.py        # All 7 template view functions
└── tests/
    └── template_views/
        ├── __init__.py
        ├── test_template_views.py   # 63 tests (pytest + mongomock)
        └── TESTING.md               # Test documentation
```

### Auth helper — `_get_therapist`

Every template view is decorated with `@api_view` (from DRF), which activates the JWT authentication pipeline before the view body runs. The custom `MongoJWTAuthentication` class (see below) handles the JWT → user resolution. The helper then resolves the authenticated user to a `Therapist` document:

```python
def _get_therapist(request) -> Therapist | None:
    try:
        return Therapist.objects.get(userId=str(request.user.id))
    except Exception:
        return None
```

Views return `403` immediately if this returns `None` (therapist profile missing for an otherwise valid JWT user). An invalid or absent JWT causes DRF to return `401` before the view body is even entered.

> **Why `@api_view` matters:** Using only `@permission_classes([IsAuthenticated])` on a plain Django function view does **not** invoke DRF's authentication backend — `request.user` remains `AnonymousUser` for JWT-based requests. All template views use `@api_view` to ensure the JWT is validated and `request.user` is populated correctly.

### `MongoJWTAuthentication` — custom auth backend

**File:** `backend/core/jwt_auth.py`

The default simplejwt `JWTAuthentication.get_user()` calls `auth.User.objects.get(id=<user_id>)` via Django's SQLite ORM. This fails for this app because the `user_id` claim in the JWT is a **MongoDB ObjectId string**, not an integer:

```
ValueError: Field 'id' expected a number but got '69844f954a901999fb72ee7c'
```

`MongoJWTAuthentication` overrides `get_user()` to skip the ORM lookup and instead return a lightweight `SimpleNamespace(is_authenticated=True, id=<mongo_id_string>)`. This:

- Satisfies DRF's `IsAuthenticated` permission check.
- Gives `_get_therapist()` a usable `request.user.id` (the MongoDB ObjectId string) to look up the `Therapist`.
- Makes no database calls during token validation — the Therapist lookup happens once inside each view.

Configured in `backend/api/settings/base.py`:

```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "core.jwt_auth.MongoJWTAuthentication",   # replaces rest_framework_simplejwt.authentication.JWTAuthentication
    ],
    ...
}
```

#### Testing auth in isolation

The tests use DRF's `APIClient` with `force_authenticate` to bypass JWT issuance, then patch `_get_therapist` to control the therapist resolution:

```python
from types import SimpleNamespace
from rest_framework.test import APIClient

_AUTH_USER = SimpleNamespace(is_authenticated=True)  # satisfies IsAuthenticated

client = APIClient()
client.force_authenticate(user=_AUTH_USER)

with patch("core.views.template_views._get_therapist", return_value=therapist):
    resp = client.get("/api/templates/")
    assert resp.status_code == 200
```

Unauthenticated tests use an un-authenticated `APIClient()` (no `force_authenticate`) and expect **401**.

### Visibility rules

| Operation | Who can |
|---|---|
| List / GET | Creator + any therapist for public templates |
| Create | Any authenticated therapist |
| PATCH / DELETE | Creator only (403 for others) |
| Copy | Any therapist who can see the template (copy is always private) |
| Assign interventions | Creator only |
| Apply | Any therapist who can see the template |
| Calendar preview | Any therapist who can see the template |

### `_ALL_DX` sentinel

When an intervention is added to a template without specifying a diagnosis, it is stored under the key `_ALL_DX = "_all"`. This means the entry applies to any patient regardless of their diagnosis. The sentinel is stripped in API responses (serialised as `""` in the calendar endpoint).

### Serializer helpers

`_serialize_template(tmpl, detail=False)` — produces the JSON-safe dict for list and detail responses.

- `detail=False` (list view) — omits `recommendations`; includes `intervention_count` only.
- `detail=True` (detail/create/update view) — includes full `recommendations` array with per-diagnosis schedule blocks.

`_visible_qs(therapist)` — returns the QuerySet of templates the therapist can see:

```python
InterventionTemplate.objects.filter(Q(is_public=True) | Q(created_by=therapist))
```

### URL routing (excerpt)

```python
# core/urls.py
path("templates/", views.template_views.template_list_create),
path("templates/<str:template_id>/", views.template_views.template_detail),
path("templates/<str:template_id>/copy/", views.template_views.copy_template),
path("templates/<str:template_id>/interventions/", views.template_views.template_intervention_assign),
path("templates/<str:template_id>/interventions/<str:intervention_id>/", views.template_views.template_intervention_remove),
path("templates/<str:template_id>/apply/", views.template_views.apply_named_template),
path("templates/<str:template_id>/calendar/", views.template_views.template_calendar),
```

### Running the tests

```bash
# All template view tests (63 tests, ~1s)
docker exec django pytest tests/template_views/ -v

# Single section
docker exec django pytest tests/template_views/ -v -k "apply"

# Test infrastructure notes
# - Uses mongomock (in-memory MongoDB) via autouse fixture
# - Uses rest_framework.test.APIClient + force_authenticate (not Django Client)
# - _get_therapist is patched per-test to decouple JWT from therapist resolution
# - Unauthenticated tests expect 401 (DRF rejects at auth layer), not 403
```

For full API reference see [09-API_DOCUMENTATION.md](./09-API_DOCUMENTATION.md#named-templates).

---

**Related Documentation**:
- [Frontend Development Guide](./03-FRONTEND_GUIDE.md)
- [Database Documentation](./05-DATABASE_GUIDE.md)
- [API Documentation](./09-API_DOCUMENTATION.md)
- [Code Standards](./13-CODE_STANDARDS.md)
