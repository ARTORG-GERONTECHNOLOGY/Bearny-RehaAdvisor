# Backend Test Documentation Guide

## Overview

This document provides comprehensive documentation of the backend test suite for RehaAdvisor. The backend uses **Pytest** as the test framework with **MongoDB** for data persistence and **Django REST Framework** for API endpoints.

## Test Architecture

### Directory Structure

```
backend/tests/
├── auth/
│   ├── test_auth_views.py
│   ├── test_jwt_authentication.py
│   └── test_permissions.py
├── models/
│   ├── test_patient.py
│   ├── test_therapist.py
│   ├── test_intervention.py
│   ├── test_rehabilitation_plan.py
│   └── test_feedback.py
├── views/
│   ├── test_patient_views.py
│   ├── test_therapist_views.py
│   └── test_intervention_views.py
├── serializers/
│   ├── test_patient_serializer.py
│   ├── test_therapist_serializer.py
│   └── test_intervention_serializer.py
├── utils/
│   └── test_utils.py
├── conftest.py
└── pytest.ini
```

### Testing Stack

| Component | Tool/Library | Version | Purpose |
|-----------|-------------|---------|---------|
| **Test Runner** | pytest | ~7.x | Test execution and reporting |
| **Test DB** | mongomock | ~4.x | In-memory MongoDB for tests |
| **Django Integration** | pytest-django | ~4.x | Django-specific fixtures |
| **Coverage** | pytest-cov | ~4.x | Code coverage reporting |
| **Async Support** | pytest-asyncio | ~0.x | Async test support |

## Test Coverage by Module

### 1. Authentication Tests (10+ files)

Authentication is critical for security and must be thoroughly tested.

#### File: `test_jwt_authentication.py`

**Purpose**: Verify JWT token generation, validation, and refresh mechanisms.

**Key Test Scenarios**:

1. **Token Generation**
   - Scenario: Create valid JWT token on user login
   - Setup: User credentials provided
   - Steps:
     1. Call login endpoint with valid credentials
     2. Receive JWT token in response
     3. Verify token structure (header.payload.signature)
   - Expected: Valid token with correct user ID, role, expiration
   - Use Case: User authentication and subsequent API requests

2. **Token Validation**
   - Scenario: System validates JWT before allowing access
   - Setup: Valid and invalid tokens prepared
   - Steps:
     1. Send request with token in Authorization header
     2. Token extraction and validation
     3. Retrieve user information from token
   - Expected: Valid tokens grant access, expired/invalid tokens reject
   - Use Case: Protected endpoint access control

3. **Token Refresh**
   - Scenario: User can refresh expired token without re-authentication
   - Setup: Token nearing expiration
   - Steps:
     1. Send refresh token to refresh endpoint
     2. Generate new access token
     3. Return new token with updated expiration
   - Expected: New valid token with extended expiration
   - Use Case: Keep users authenticated during long sessions

#### File: `test_permissions.py`

**Purpose**: Verify role-based access control (RBAC) and permissions.

**Key Test Scenarios**:

1. **Role-Based Access**
   - Scenario: Users can only access resources allowed by their role
   - Setup: Users with different roles (therapist, patient, admin)
   - Steps:
     1. Authenticate as therapist
     2. Try accessing admin-only endpoint
     3. Should receive 403 Forbidden
   - Expected: Access denied for unauthorized roles
   - Use Case: Security enforcement, preventing privilege escalation

2. **Object-Level Permissions**
   - Scenario: Users can only edit their own objects
   - Setup: Two therapists, two sets of patients
   - Steps:
     1. Therapist A tries to edit Therapist B's patient
     2. System checks object permissions
   - Expected: Request denied, patient unchanged
   - Use Case: Data isolation between users

#### File: `test_auth_views.py`

**Purpose**: Test authentication endpoints (login, register, logout).

**Key Test Scenarios**:

1. **User Login**
   - Scenario: Valid credentials grant access
   - Setup: Registered user account
   - Steps:
     1. POST to /api/auth/login/
     2. Provide email and password
     3. Receive JWT tokens
   - Expected: Response with access_token, refresh_token, user info
   - Use Case: User authentication entry point

2. **User Registration**
   - Scenario: New users can self-register
   - Setup: Registration endpoint available
   - Steps:
     1. POST to /api/auth/register/
     2. Provide email, password, user details
     3. Account created in database
   - Expected: User created, confirmation email sent (if configured)
   - Use Case: New user onboarding

3. **Login Validation**
   - Scenario: System validates credentials properly
   - Setup: Invalid credentials provided
   - Steps:
     1. Attempt login with wrong password
     2. System validates against stored credentials
   - Expected: Rejection with appropriate error message
   - Use Case: Brute force protection, security

### 2. Model Tests (15+ files)

Model tests verify database schema and business logic constraints.

#### File: `test_patient.py`

**Purpose**: Test Patient model creation, validation, and relationships.

**Key Test Scenarios**:

1. **Patient Creation**
   ```python
   def test_patient_creation():
       """
       Scenario: Create valid patient record in database
       
       Setup:
       - Patient data: name, email, phone, DOB
       - Associated therapist exists
       
       Steps:
       1. Create Patient instance with valid data
       2. Save to MongoDB
       3. Retrieve from database
       
       Expected Results:
       - Patient record persisted
       - Unique ID generated
       - Created timestamp set
       - All fields populated correctly
       
       Use Case: Therapist adds new patient to system
       """
   ```

2. **Email Validation**
   ```python
   def test_patient_email_validation():
       """
       Scenario: Patient email must be valid format
       
       Setup:
       - Invalid email formats: "", "test", "@example.com"
       
       Steps:
       1. Attempt to create patient with invalid email
       2. Model validates email format
       
       Expected Results:
       - ValidationError raised
       - Patient not created
       - Error message indicates invalid email
       
       Use Case: Data integrity, prevent invalid contact information
       """
   ```

3. **Therapist Assignment**
   ```python
   def test_patient_therapist_assignment():
       """
       Scenario: Patient is associated with correct therapist
       
       Setup:
       - Patient record
       - Therapist record
       
       Steps:
       1. Assign therapist to patient
       2. Query patient.therapist
       
       Expected Results:
       - Patient correctly linked to therapist
       - Therapist relationship is bidirectional
       - Can retrieve all therapist's patients
       
       Use Case: Patient-therapist association
       """
   ```

#### File: `test_therapist.py`

**Purpose**: Test Therapist model and therapist-specific functionality.

**Key Test Scenarios**:

1. **Therapist Registration**
   - Professional license validation
   - Specialization selection
   - Clinic/organization assignment

2. **Patient Assignment**
   - Therapist can have multiple patients
   - Patient assignments can be revoked
   - Audit trail of assignments

#### File: `test_intervention.py`

**Purpose**: Test Intervention model and intervention management.

**Key Test Scenarios**:

1. **Intervention Creation**
   ```python
   def test_intervention_creation():
       """
       Scenario: Therapist creates new intervention protocol
       
       Setup:
       - Intervention template data
       - Associated patient
       
       Steps:
       1. Create intervention with name, description, exercises
       2. Save to database
       3. Verify all fields persisted
       
       Expected Results:
       - Intervention created with unique ID
       - Status set to "not_started"
       - Start date recorded
       - Associated exercises linked
       
       Use Case: Create personalized intervention plan
       """
   ```

2. **Exercise Linking**
   - Exercises properly associated with intervention
   - Exercise order maintained
   - Sets and reps tracked

3. **Status Transitions**
   - Valid status flow: not_started → in_progress → completed
   - Invalid transitions prevented
   - Status change history maintained

#### File: `test_rehabilitation_plan.py`

**Purpose**: Test RehabilitationPlan model.

**Key Test Scenarios**:

1. **Plan Creation and Scheduling**
   - Plans include multiple interventions
   - Timeline and milestones tracked
   - Duration and frequency specified

2. **Progress Tracking**
   - Plan progress calculated from interventions
   - Completion percentage calculated
   - Estimated completion date tracked

#### File: `test_feedback.py`

**Purpose**: Test Feedback model and feedback collection.

**Key Test Scenarios**:

1. **Feedback Submission**
   ```python
   def test_feedback_submission():
       """
       Scenario: Patient submits feedback on intervention
       
       Setup:
       - Patient completing intervention
       - Feedback form with rating and comments
       
       Steps:
       1. Submit feedback via API
       2. Validate feedback data
       3. Store in database
       
       Expected Results:
       - Feedback linked to intervention
       - Timestamp recorded
       - Rating (1-5) validated
       - Comments stored as text
       
       Use Case: Collect patient outcome data
       """
   ```

2. **Feedback Retrieval**
   - Get feedback by patient
   - Get feedback by intervention
   - Aggregate feedback statistics

### 3. View/Endpoint Tests (10+ files)

View tests verify API endpoints and HTTP responses.

#### File: `test_patient_views.py`

**Purpose**: Test patient-related endpoints.

**Key Test Scenarios**:

1. **Patient List Endpoint**
   ```python
   def test_get_patient_list():
       """
       Scenario: Therapist retrieves their patients
       
       Setup:
       - Authenticated therapist
       - Multiple patients assigned
       
       Steps:
       1. GET /api/patients/
       2. Verify authentication
       3. Filter patients by therapist
       
       Expected Results:
       - 200 OK response
       - List of patient objects
       - Only therapist's patients returned
       - Pagination works correctly
       
       Use Case: Display patient list in therapist dashboard
       """
   ```

2. **Patient Detail Endpoint**
   - GET /api/patients/{id}/
   - Retrieve single patient details
   - Verify permissions (only therapist can view)

3. **Patient Update Endpoint**
   - PATCH /api/patients/{id}/
   - Update patient information
   - Audit changes

#### File: `test_therapist_views.py`

**Module-Level Documentation**:
```
This module tests therapist-specific views and endpoints including:
- Therapist profile management
- Patient assignment and removal
- Intervention creation and management
- Feedback review and analytics
- Dashboard data aggregation

Key Fixtures:
- therapist: Standard therapist user with admin permissions
- patient: Associated patient records
- intervention: Intervention instances for testing
- feedback: Feedback records linked to interventions

Models Being Tested:
- Therapist: User model with therapist role and permissions
- Patient: Patient model linked to therapist via ForeignKey
- Intervention: Intervention model with exercise associations
- RehabilitationPlan: Plan model aggregating interventions

Testing Approach:
- Uses mongomock for in-memory MongoDB simulation
- Fixtures provide isolated test data
- Each test is independent and can run in any order
- Django test client simulates HTTP requests
- JSON responses parsed and validated

Expected Coverage:
- All therapist views covered
- Authentication and permission checking
- Error handling and edge cases
- Integration with related models
```

**Key Test Scenarios**:

1. **Therapist Dashboard**
   ```python
   def test_therapist_dashboard():
       """
       Scenario: Retrieve therapist dashboard with aggregated data
       
       Setup:
       - Therapist with multiple patients
       - Multiple interventions across patients
       - Various intervention statuses
       
       Steps:
       1. GET /api/therapist/dashboard/
       2. Calculate statistics from related data
       
       Expected Results:
       - 200 OK with dashboard data
       - Total patient count
       - Active interventions count
       - Completion statistics
       - Recent activity
       
       Use Case: Display therapist dashboard summary
       """
   ```

2. **Patient Assignment**
   ```python
   def test_assign_patient_to_therapist():
       """
       Scenario: Assign patient to therapist
       
       Setup:
       - Patient record
       - Therapist record
       
       Steps:
       1. POST /api/therapist/assign-patient/
       2. Verify therapist permissions
       3. Update patient.therapist field
       
       Expected Results:
       - 201 Created or 200 OK
       - Patient assigned to therapist
       - Timestamp of assignment recorded
       
       Use Case: Onboard patient to therapist
       """
   ```

#### File: `test_intervention_views.py`

**Purpose**: Test intervention management endpoints.

**Key Test Scenarios**:

1. **Intervention Creation**
   - POST /api/interventions/
   - Required fields validation
   - Exercise association

2. **Intervention Status Update**
   - PATCH /api/interventions/{id}/status/
   - Valid status transitions
   - Progress tracking

3. **Get Patient Interventions**
   - GET /api/patients/{id}/interventions/
   - Filtered by patient
   - Ordered by status

### 4. Serializer Tests (5+ files)

Serializer tests verify data serialization/deserialization.

#### File: `test_patient_serializer.py`

**Purpose**: Test data conversion for Patient model.

**Key Test Scenarios**:

1. **Valid Data Deserialization**
   ```python
   def test_deserialize_patient_data():
       """
       Scenario: Convert JSON to Patient model instance
       
       Setup:
       - JSON patient data from API request
       
       Steps:
       1. Call serializer.is_valid() with data
       2. Call serializer.save()
       
       Expected Results:
       - Model instance created
       - All fields validated
       - Data persisted to database
       
       Use Case: Create patient from API request
       """
   ```

2. **Serialization**
   - Convert Patient model to JSON
   - Include related therapist info
   - Format dates and times

3. **Validation Rules**
   - Email format validation
   - Required fields checking
   - Field value constraints

### 5. Utility Tests (3+ files)

#### File: `test_utils.py`

**Module-Level Documentation**:
```
This module contains test functions for utility functions used throughout
the backend. Utility functions include datetime handling, text sanitization,
and data transformation helpers.

Key Utilities Being Tested:
- Date/time conversion (timezone-aware handling)
- Text sanitization (remove HTML, normalize encodings)
- Data formatting (phone numbers, addresses)
- Validation helpers (email, phone, postal code)

Test Organization:
- Functions grouped by utility category
- Each function has comprehensive scenario coverage
- Setup, steps, and expected results documented
- Real-world use cases explained

Expected Coverage:
- All edge cases (null, empty, extreme values)
- Error conditions and exception handling
- International character handling
- Performance for large datasets
```

**Key Test Functions**:

1. **test_ensure_aware_naive_datetime()**
   ```python
   def test_ensure_aware_naive_datetime():
       """
       Scenario: Convert naive datetime to timezone-aware
       
       Setup:
       - Naive datetime (no timezone info): 2024-01-15 10:30:00
       - System timezone: UTC
       
       Steps:
       1. Call ensure_aware(datetime_obj)
       2. Function adds timezone information
       3. Returns timezone-aware datetime
       
       Expected Results:
       - Returns: 2024-01-15 10:30:00+00:00 (UTC)
       - Type: datetime.datetime with tzinfo
       - Value unchanged (same moment in time)
       
       Use Case: Normalize datetimes from databases
       """
   ```

2. **test_ensure_aware_already_aware_datetime()**
   ```python
   def test_ensure_aware_already_aware_datetime():
       """
       Scenario: Function is idempotent with aware datetimes
       
       Setup:
       - Aware datetime: 2024-01-15 10:30:00+05:00
       
       Steps:
       1. Call ensure_aware(aware_datetime)
       2. Function detects existing timezone
       3. Returns unchanged or converted to default tz
       
       Expected Results:
       - If UTC conversion: 2024-01-15 05:30:00+00:00
       - If unchanged: Same value and timezone
       - Type: datetime.datetime with tzinfo
       
       Use Case: Safe re-normalization of datetimes
       """
   ```

3. **test_sanitize_text_basic()**
   ```python
   def test_sanitize_text_basic():
       """
       Scenario: Remove whitespace and normalize text
       
       Setup:
       - Text with extra spaces: "  John  Smith  "
       
       Steps:
       1. Call sanitize_text(text)
       2. Strip leading/trailing whitespace
       3. Collapse multiple spaces to single space
       
       Expected Results:
       - Returns: "John Smith"
       - No leading/trailing whitespace
       - Single spaces between words
       
       Use Case: Clean form input data
       """
   ```

4. **test_sanitize_text_special_characters()**
   ```python
   def test_sanitize_text_special_characters():
       """
       Scenario: Convert accented characters to ASCII equivalent
       
       Setup:
       - Text: "Müller Straße" (German with umlauts)
       
       Steps:
       1. Call sanitize_text(text)
       2. Function converts special characters
       3. ü → u, ß → ss
       
       Expected Results:
       - Returns: "Mueller Strasse"
       - ASCII-safe for compatibility
       - No special characters
       
       Use Case: International names in form fields, ensure storage compatibility
       """
   ```

5. **test_sanitize_text_accented()**
   ```python
   def test_sanitize_text_accented():
       """
       Scenario: Remove accent marks from characters
       
       Setup:
       - Text: "Café François" (French with accents)
       
       Steps:
       1. Call sanitize_text(text)
       2. Function removes accent marks
       3. é → e, ç → c
       
       Expected Results:
       - Returns: "Cafe Francois"
       - All accents removed
       - ASCII representation only
       
       Use Case: Normalize international text for search and storage
       """
   ```

## Testing Framework and Configuration

### Pytest Configuration

**File**: `backend/pytest.ini`

```ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = 
    --cov=.
    --cov-report=term-summary
    --cov-report=xml
    -v
testpaths = tests
```

### Fixtures and Setup

**File**: `backend/tests/conftest.py`

Key fixtures available to all tests:

```python
@pytest.fixture
def db():
    """MongoDB test database using mongomock"""
    
@pytest.fixture
def client():
    """Django test client for API testing"""
    
@pytest.fixture
def user():
    """Standard test user"""
    
@pytest.fixture
def therapist():
    """Therapist user with appropriate permissions"""
    
@pytest.fixture
def patient():
    """Patient associated with therapist"""
    
@pytest.fixture
def intervention():
    """Intervention for patient"""
    
@pytest.fixture
def authenticated_client(therapist):
    """Client authenticated as therapist"""
```

## Running Tests

### All Tests
```bash
cd backend
pytest
```

### Specific Test File
```bash
pytest tests/models/test_patient.py
```

### Specific Test Class
```bash
pytest tests/models/test_patient.py::TestPatientModel
```

### Specific Test Function
```bash
pytest tests/models/test_patient.py::TestPatientModel::test_patient_creation
```

### Tests Matching Pattern
```bash
pytest -k "test_patient"
```

### With Coverage Report
```bash
pytest --cov=. --cov-report=html
# Open htmlcov/index.html in browser
```

### Verbose Output
```bash
pytest -vv
```

### Stop on First Failure
```bash
pytest -x
```

### Last Failed Tests
```bash
pytest --lf
```

## Coverage Targets

| Component | Target | Current |
|-----------|--------|---------|
| **Models** | 90% | Track in CI/CD |
| **Views** | 85% | Track in CI/CD |
| **Serializers** | 80% | Track in CI/CD |
| **Utils** | 95% | Track in CI/CD |
| **Auth** | 90% | Track in CI/CD |
| **Overall** | 75% | Track in CI/CD |

## Common Testing Patterns

### Testing Model Creation
```python
def test_model_creation(db):
    """Test creating model instance"""
    user = User.objects.create(
        email="test@example.com",
        username="testuser"
    )
    assert user.id is not None
    assert user.email == "test@example.com"
```

### Testing API Endpoints
```python
def test_api_endpoint(authenticated_client):
    """Test API endpoint returns correct data"""
    response = authenticated_client.get('/api/patients/')
    assert response.status_code == 200
    data = response.json()
    assert 'results' in data
    assert isinstance(data['results'], list)
```

### Testing Authentication
```python
def test_authentication_required(client):
    """Test endpoint requires authentication"""
    response = client.get('/api/patients/')
    assert response.status_code == 401
```

### Testing Permissions
```python
def test_permission_denied(client, other_therapist_patient):
    """Test user cannot access other user's data"""
    response = client.get(f'/api/patients/{other_therapist_patient.id}/')
    assert response.status_code == 403
```

## Debugging Failed Tests

### Print Debug Info
```bash
pytest -vv -s
```

### Use pdb Breakpoints
```python
def test_something():
    import pdb; pdb.set_trace()  # Stops here
    # Continue debugging
```

### Check Test Database
```python
def test_debug(db):
    User.objects.create(email="test@example.com")
    # Check what was created
    users = User.objects.all()
    print(users)  # Printed with -s flag
```

## Common Issues and Solutions

### Issue: "MONGODB_URI not configured"
**Solution**: Check environment variables in CI/CD or pytest.ini

### Issue: "Fixture 'db' not found"
**Solution**: Ensure pytest-django is installed and configured

### Issue: "Permission denied on update"
**Solution**: Verify user authentication in fixture setup

### Issue: "Test timeout"
**Solution**: Check for infinite loops or missing mocks

## Best Practices

1. **Test Organization**: Group related tests in classes
2. **Clear Naming**: Use descriptive test names that explain the scenario
3. **Setup/Teardown**: Use fixtures to avoid duplication
4. **Mocking**: Mock external dependencies (APIs, emails, etc.)
5. **Assertions**: Use specific assertions, not generic ones
6. **Coverage**: Aim for high coverage but focus on critical paths
7. **Documentation**: Document complex test scenarios
8. **Isolation**: Each test should be independent

## Resources

- **Pytest Documentation**: https://docs.pytest.org/
- **pytest-django**: https://pytest-django.readthedocs.io/
- **Django Testing**: https://docs.djangoproject.com/en/stable/topics/testing/
- **Coverage.py**: https://coverage.readthedocs.io/

---

**Last Updated**: 2024  
**Test Count**: 40+ files, 200+ test functions  
**Maintainers**: Development Team  
**Related**: [CICD_TESTING_GUIDE.md](./CICD_TESTING_GUIDE.md), [TESTING_GUIDE.md](../TESTING_GUIDE.md)
