# Testing Guide & Architecture

## Overview

This document provides a comprehensive guide to the RehaAdvisor testing structure, conventions, and best practices. All tests are now organized consistently for easy maintenance and discovery.

---

## Table of Contents

1. [Test Structure & Organization](#test-structure--organization)
2. [Backend Testing Guide](#backend-testing-guide)
3. [Frontend Testing Guide](#frontend-testing-guide)
4. [Testing Best Practices](#testing-best-practices)
5. [Running Tests](#running-tests)
6. [Test Scenarios by Feature](#test-scenarios-by-feature)
7. [CI/CD Integration](#cicd-integration)

---

## Test Structure & Organization

### Unified Test Directory Layout

```
telerehabapp/
├── frontend/
│   └── src/
│       └── __tests__/                    # All frontend tests centralized here
│           ├── api/                      # API service tests
│           ├── components/               # Component tests (organized by feature)
│           │   ├── Auth/
│           │   ├── Common/
│           │   ├── PatientPage/
│           │   ├── RehaTablePage/
│           │   ├── TherapistIntervention/
│           │   ├── TherapistPatient/
│           │   ├── UserProfile/
│           │   └── HomePage/
│           ├── hooks/                    # Custom hook tests
│           ├── pages/                    # Page/route component tests
│           ├── routes/                   # Router tests
│           ├── stores/                   # State management tests
│           ├── utils/                    # Utility function tests
│           └── test-utils/               # Test helpers and utilities
│
├── backend/
│   ├── tests/                            # All backend tests centralized here
│   │   ├── __init__.py
│   │   ├── auth_views/                   # Authentication endpoint tests
│   │   ├── patient_views/                # Patient-related endpoint tests
│   │   ├── therapist_views/              # Therapist endpoint tests
│   │   ├── interventions_views/          # Intervention endpoint tests
│   │   ├── user_views/                   # User management tests
│   │   ├── utils/                        # Utility function tests
│   │   ├── test_models.py                # Data model tests
│   │   └── test_urls.py                  # URL routing tests
│   │
│   └── pytest.ini                        # Pytest configuration
```

### Key Principles

✅ **Centralized**: All tests in dedicated `tests/` or `__tests__/` directories
✅ **Organized by Feature**: Tests grouped by functional area
✅ **Consistent Naming**: `test_*.py` (backend) and `*.test.ts(x)` (frontend)
✅ **Documented**: Each test has clear scenario descriptions
✅ **Isolated**: No inter-test dependencies

---

## Backend Testing Guide

### Test Structure (pytest)

#### File Naming Convention
- **Pattern**: `test_*.py` or `*_tests.py`
- **Location**: `/backend/tests/` directory
- **Example**: `test_login_view.py`, `test_models.py`

#### Directory Organization

```
backend/tests/
├── auth_views/              # All authentication tests
│   ├── test_login_view.py
│   ├── test_register_view.py
│   ├── test_logout_view.py
│   ├── test_reset_password_view.py
│   ├── test_verify_code_view.py
│   └── test_send_verification_code.py
│
├── patient_views/           # All patient endpoint tests
│   ├── test_patient_views.py
│   ├── test_get_endpoints.py
│   ├── test_audio.py
│   └── test_initial_questionnaire.py
│
├── therapist_views/         # All therapist endpoint tests
│   └── test_therapist_views.py
│
├── interventions_views/     # All intervention endpoint tests
│   └── test_interventions_views.py
│
├── user_views/              # All user management tests
│   └── test_user_views.py
│
├── utils/                   # Utility function tests
│   └── test_utils.py
│
├── test_models.py           # Database model tests
└── test_urls.py             # URL routing tests
```

### Test Scenario Examples

#### Authentication Tests (`test_login_view.py`)

```python
# Scenario: User logs in with valid credentials
def test_login_with_valid_credentials():
    """
    Tests the login endpoint with valid username and password.
    
    Expected: 
    - HTTP 200 response
    - JWT access token returned
    - User information included in response
    """
    # Arrange
    user = create_test_user(username="patient1", password="TestPass123!")
    
    # Act
    response = client.post('/api/auth/login/', {
        'username': 'patient1',
        'password': 'TestPass123!'
    })
    
    # Assert
    assert response.status_code == 200
    assert 'access_token' in response.data
    assert response.data['user']['username'] == 'patient1'

# Scenario: User logs in with invalid credentials
def test_login_with_invalid_credentials():
    """
    Tests the login endpoint with incorrect password.
    
    Expected:
    - HTTP 401 Unauthorized response
    - Clear error message
    - No token returned
    """
    # Implementation tests wrong credentials handling
```

#### Patient Endpoints Tests (`test_get_endpoints.py`)

```python
# Scenario: Patient retrieves their assigned interventions
def test_get_patient_interventions():
    """
    Tests retrieval of patient's assigned interventions.
    
    Expected:
    - HTTP 200 response
    - List of interventions assigned to patient
    - Each intervention has required fields (title, description, type)
    - Only patient's own interventions returned (no data leakage)
    """
    # Sets up patient with assigned interventions
    # Verifies correct filtering and data

# Scenario: Patient provides feedback on intervention
def test_submit_intervention_feedback():
    """
    Tests patient submitting feedback after completing an intervention.
    
    Expected:
    - HTTP 201 Created response
    - Feedback saved to database
    - Feedback includes rating, comments, completion date
    - Response contains confirmation message
    """
    # Tests feedback submission flow
```

#### Model Tests (`test_models.py`)

```python
# Scenario: Create patient with valid medical information
def test_create_patient_with_medical_info():
    """
    Tests creating a patient record with diagnosis and medical history.
    
    Expected:
    - Patient created successfully
    - Medical information stored correctly
    - Patient linked to therapist
    """
    # Tests model creation and field validation

# Scenario: Validate patient with missing required fields
def test_missing_required_patient_fields():
    """
    Tests that patient creation fails without required fields.
    
    Expected:
    - ValidationError raised
    - Clear error message indicating missing field
    """
    # Tests validation logic
```

### Backend Test Fixtures

```python
# Example: Setup test data
@pytest.fixture
def test_therapist(db):
    """Creates a therapist user for testing."""
    user = User.objects.create_user(
        username='therapist1',
        email='therapist@test.com',
        password='TestPass123!'
    )
    return Therapist.objects.create(
        userId=user,
        name='Smith',
        first_name='John'
    )

@pytest.fixture
def test_patient(db, test_therapist):
    """Creates a patient linked to therapist."""
    user = User.objects.create_user(
        username='patient1',
        email='patient@test.com'
    )
    return Patient.objects.create(
        userId=user,
        therapist=test_therapist,
        diagnosis=['Cardiology']
    )

@pytest.fixture
def test_intervention(db, test_therapist):
    """Creates an intervention."""
    return Intervention.objects.create(
        title='Cardiac Walking',
        description='30-minute walking exercise',
        content_type='Exercise',
        created_by=test_therapist
    )
```

---

## Frontend Testing Guide

### Test Structure (Jest)

#### File Naming Convention
- **Pattern**: `*.test.ts(x)` or `*.spec.ts(x)`
- **Location**: `src/__tests__/` directory (co-located with source)
- **Example**: `Button.test.tsx`, `authStore.test.ts`

#### Directory Organization

```
src/__tests__/
├── api/                     # API service tests
│   └── authService.test.ts
│
├── components/              # Component tests (organized by feature)
│   ├── Auth/
│   │   └── LoginForm.test.tsx
│   ├── Common/
│   │   ├── Button.test.tsx
│   │   └── Modal.test.tsx
│   ├── PatientPage/
│   │   ├── InterventionList.test.tsx
│   │   ├── PatientInterventionPopUp.test.tsx
│   │   └── FeedbackPopup.test.tsx
│   ├── RehaTablePage/
│   │   ├── InterventionFeedbackModal.test.tsx
│   │   └── InterventionStatsModal.test.tsx
│   ├── TherapistIntervention/
│   │   ├── InterventionList.test.tsx
│   │   ├── AddInterventionModal.test.tsx
│   │   └── ProductPopup.test.tsx
│   ├── TherapistPatient/
│   │   ├── AddPatientPopup.test.tsx
│   │   └── PatientPopup.test.tsx
│   └── UserProfile/
│       └── ProfileForm.test.tsx
│
├── hooks/                   # Custom hook tests
│   ├── useAuthGuard.test.tsx
│   ├── usePatients.test.tsx
│   └── usePatientInterventions.test.tsx
│
├── pages/                   # Page component tests
│   ├── AdminDashboard.test.tsx
│   ├── Therapist.test.tsx
│   ├── PatientHome.test.tsx
│   ├── TermsAndConditions.test.tsx
│   └── eva.test.tsx
│
├── routes/                  # Router tests
│   └── index.test.tsx
│
├── stores/                  # State management tests
│   ├── authStore.test.ts
│   ├── adminStore.test.ts
│   ├── adminDashboardStore.test.ts
│   ├── forgotPasswordStore.test.ts
│   └── userProfileStore.test.ts
│
├── utils/                   # Utility function tests
│   ├── validation.test.ts
│   └── interventions.test.ts
│
└── test-utils/              # Test helpers
    └── renderWithRouter.tsx
```

### Test Scenario Examples

#### Component Tests

```typescript
// Scenario: Authentication form validates input
describe('LoginForm', () => {
  /**
   * Scenario: Successful login with valid credentials
   * - User enters valid email and password
   * - User clicks login button
   * Expected: Form submits, success message shown, user redirected
   */
  it('submits valid credentials and navigates to dashboard', async () => {
    render(<LoginForm />);
    
    // Arrange
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /login/i });
    
    // Act
    fireEvent.change(emailInput, { target: { value: 'user@test.com' } });
    fireEvent.change(passwordInput, { target: { value: 'ValidPass123!' } });
    fireEvent.click(submitButton);
    
    // Assert
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  /**
   * Scenario: Form shows validation error for invalid email
   * - User enters invalid email format
   * - User clicks submit
   * Expected: Error message displayed, form not submitted
   */
  it('displays validation error for invalid email format', () => {
    render(<LoginForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.blur(emailInput);
    
    expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();
  });
});
```

#### Store Tests

```typescript
// Scenario: Authentication state management
describe('AuthStore', () => {
  /**
   * Scenario: User logs in successfully
   * Expected: 
   * - isAuthenticated = true
   * - user object populated
   * - token stored
   */
  it('sets authenticated state on successful login', async () => {
    const store = new AuthStore();
    
    // Arrange
    mockLoginAPI.mockResolvedValue({
      access_token: 'token123',
      user: { id: '1', username: 'user1' }
    });
    
    // Act
    await store.login('user@test.com', 'password');
    
    // Assert
    expect(store.isAuthenticated).toBe(true);
    expect(store.user.username).toBe('user1');
  });

  /**
   * Scenario: User logs out
   * Expected:
   * - isAuthenticated = false
   * - user cleared
   * - token removed
   */
  it('clears state on logout', () => {
    const store = new AuthStore();
    store.logout();
    
    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
  });
});
```

#### Hook Tests

```typescript
// Scenario: Custom hook for patient data
describe('usePatients', () => {
  /**
   * Scenario: Hook fetches therapist's patient list
   * Expected:
   * - Initially loading = true
   * - After fetch completes, patients populated
   * - Data correctly filtered by therapist
   */
  it('fetches and sets patients on mount', async () => {
    // Arrange
    const mockPatients = [
      { _id: '1', name: 'Patient 1', therapist_id: 'therapist1' },
      { _id: '2', name: 'Patient 2', therapist_id: 'therapist1' }
    ];
    mockPatientAPI.mockResolvedValue(mockPatients);
    
    // Act
    const { result } = renderHook(() => usePatients('therapist1'));
    
    // Assert
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.patients).toEqual(mockPatients);
      expect(result.current.loading).toBe(false);
    });
  });
});
```

### Frontend Jest Configuration

The Jest configuration is defined in `frontend/jest.config.ts`:

```typescript
- Test Environment: jsdom (browser-like environment)
- Transform: TypeScript via ts-jest
- Module Mapping: 
  - CSS modules → identity-obj-proxy
  - Images → test stub
- Coverage Thresholds:
  - Branches: 80%
  - Functions: 85%
  - Lines: 90%
  - Statements: 90%
```

---

## Testing Best Practices

### General Principles

1. **Clear Naming**
   ```typescript
   // Good ✓
   it('submits form with valid email and shows success message')
   
   // Bad ✗
   it('form submission')
   ```

2. **Arrange-Act-Assert Pattern**
   ```typescript
   it('validates email format', () => {
     // Arrange: Setup test data
     const form = render(<LoginForm />);
     
     // Act: Perform action
     fireEvent.change(screen.getByRole('textbox'), 
       { target: { value: 'invalid' } });
     
     // Assert: Verify result
     expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
   });
   ```

3. **One Assertion Focus Per Test**
   - Each test should verify one specific behavior
   - Makes failures clear and easier to debug

4. **Descriptive Scenario Comments**
   ```typescript
   /**
    * Scenario: User attempts login with locked account
    * Precondition: Account locked after 5 failed attempts
    * Expected: Error message about account being locked
    */
   it('shows locked account message', () => {
     // test implementation
   });
   ```

5. **Mock External Dependencies**
   ```typescript
   // Before each test, reset mocks
   beforeEach(() => {
     jest.clearAllMocks();
     mockAPI.mockReset();
   });
   
   // Mock API responses
   mockAPI.mockResolvedValue({ success: true });
   ```

### Backend Testing Best Practices

1. **Use pytest Fixtures**
   - Consistent test data setup
   - Easy to maintain and reuse
   - Clear dependencies

2. **Database Isolation**
   - Each test uses fresh database (via `@pytest.mark.django_db`)
   - No test data pollution
   - Faster cleanup

3. **Test Related Scenarios Together**
   ```python
   class TestUserLogin:
       def test_successful_login(self):
           pass
       
       def test_invalid_password(self):
           pass
       
       def test_nonexistent_user(self):
           pass
   ```

### Frontend Testing Best Practices

1. **Test User Behavior, Not Implementation**
   ```typescript
   // Good ✓
   expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();
   
   // Bad ✗
   expect(component.state.submitButtonDisabled).toBe(false);
   ```

2. **Use Testing Library Queries in Order of Priority**
   ```typescript
   // 1. Best: User-facing
   screen.getByRole('button', { name: /login/i })
   screen.getByLabelText(/email/i)
   
   // 2. Good: By text content
   screen.getByText(/welcome/i)
   
   // 3. Last resort: Test ID (when above not possible)
   screen.getByTestId('custom-element')
   ```

3. **Wait for Async Operations**
   ```typescript
   await waitFor(() => {
     expect(screen.getByText(/loaded/i)).toBeInTheDocument();
   });
   ```

---

## Running Tests

### Backend Tests (pytest)

```bash
# Run all backend tests
cd backend
pytest

# Run specific test file
pytest tests/auth_views/test_login_view.py

# Run specific test function
pytest tests/auth_views/test_login_view.py::test_login_with_valid_credentials

# Run with verbose output
pytest -v

# Run with coverage report
pytest --cov=api --cov=core --cov=utils

# Run tests matching pattern
pytest -k "login"

# Stop on first failure
pytest -x

# Run last failed tests
pytest --lf
```

### Frontend Tests (Jest)

```bash
# Run all frontend tests
cd frontend
npm test

# Run tests in watch mode (for development)
npm test -- --watch

# Run specific test file
npm test -- InterventionList.test.tsx

# Run with coverage report
npm test -- --coverage

# Run tests matching pattern
npm test -- --testNamePattern="intervention"

# Run only changed tests
npm test -- -o
```

### Docker-Based Testing

```bash
# From project root
make test_backend
make test_frontend

# Run all tests (both)
make test
```

---

## Test Scenarios by Feature

### Authentication Flow

| Scenario | Location | Test File | Status |
|----------|----------|-----------|--------|
| Login with valid credentials | Backend | `test_login_view.py` | ✓ Complete |
| Register new user | Backend | `test_register_view.py` | ✓ Complete |
| Password reset flow | Backend | `test_reset_password_view.py` | ✓ Complete |
| Email verification | Backend | `test_verify_code_view.py` | ✓ Complete |
| Logout clears session | Backend | `test_logout_view.py` | ✓ Complete |
| Login form validation | Frontend | `LoginForm.test.tsx` | ✓ Complete |
| Error handling on auth failure | Frontend | `LoginForm.test.tsx` | ✓ Complete |

### Patient Interventions

| Scenario | Location | Test File | Status |
|----------|----------|-----------|--------|
| View assigned interventions | Backend | `test_get_endpoints.py` | ✓ Complete |
| Complete intervention session | Backend | `test_patient_views.py` | ✓ Complete |
| Submit intervention feedback | Backend | `test_patient_views.py` | ✓ Complete |
| Display intervention details | Frontend | `InterventionList.test.tsx` | ✓ Complete |
| Filter interventions by type | Frontend | `InterventionList.test.tsx` | ✓ Complete |
| Render feedback popup | Frontend | `FeedbackPopup.test.tsx` | ✓ Complete |

### Therapist Management

| Scenario | Location | Test File | Status |
|----------|----------|-----------|--------|
| Assign intervention to patient | Backend | `test_therapist_views.py` | ✓ Complete |
| Create custom intervention | Backend | `test_interventions_views.py` | ✓ Complete |
| Monitor patient adherence | Backend | `test_therapist_views.py` | ✓ Complete |
| View patient list | Frontend | `Therapist.test.tsx` | ✓ Complete |
| Add patient popup | Frontend | `AddPatientPopup.test.tsx` | ✓ Complete |

### Data Models

| Scenario | Location | Test File | Status |
|----------|----------|-----------|--------|
| Create user with validation | Backend | `test_models.py` | ✓ Complete |
| Create patient with medical info | Backend | `test_models.py` | ✓ Complete |
| Create intervention | Backend | `test_models.py` | ✓ Complete |
| Validate required fields | Backend | `test_models.py` | ✓ Complete |

### Utilities

| Scenario | Location | Test File | Status |
|----------|----------|-----------|--------|
| Date parsing and formatting | Backend | `test_utils.py` | ✓ Complete |
| Text sanitization | Backend | `test_utils.py` | ✓ Complete |
| Timezone handling | Backend | `test_utils.py` | ✓ Complete |
| Form validation | Frontend | `validation.test.ts` | ✓ Complete |
| Media type detection | Frontend | `interventions.test.ts` | ✓ Complete |

---

## CI/CD Integration

### GitHub Actions Testing Pipeline

Tests run automatically on:
- **Push to main**: Full test suite
- **Pull requests**: Tests + coverage checks
- **Schedule**: Daily full test run

### Test Coverage Thresholds

**Backend:**
- Minimum: 80% overall
- Core API endpoints: 90%
- Business logic: 85%

**Frontend:**
- Minimum: 80% overall
- Components: 85%
- Utilities: 90%

### Viewing Test Results

1. **Local**: Check terminal output
2. **GitHub**: View in PR checks
3. **Coverage Reports**: 
   - Backend: `backend/.coverage/`
   - Frontend: `frontend/coverage/`

---

## Quick Reference

### Add New Test File

**Backend:**
```bash
# 1. Create test file in appropriate subdirectory
touch backend/tests/[feature]/test_[feature_name].py

# 2. Add imports and setup
from django.test import TestCase
import pytest

# 3. Write test scenarios
def test_feature_scenario():
    pass
```

**Frontend:**
```bash
# 1. Create test file alongside source
touch src/__tests__/components/[Feature]/Component.test.tsx

# 2. Add imports
import { render, screen } from '@testing-library/react'
import Component from '../../../components/Feature/Component'

# 3. Write test scenarios
describe('Component', () => {
  it('renders correctly', () => {
    render(<Component />)
    expect(screen.getByText(/expected/i)).toBeInTheDocument()
  })
})
```

### Common Test Commands

```bash
# Backend
cd backend && pytest -v                          # Verbose output
cd backend && pytest --cov && coverage html     # Coverage report

# Frontend
cd frontend && npm test -- --coverage            # Coverage report
cd frontend && npm test -- --watch               # Watch mode

# Docker
docker-compose -f docker-compose.dev.yml exec backend pytest
docker-compose -f docker-compose.dev.yml exec frontend npm test
```

---

## Maintenance & Updates

- **Review tests quarterly** for relevance and coverage
- **Update tests when features change** to maintain accuracy
- **Keep test documentation** in sync with actual tests
- **Monitor test execution time** and optimize slow tests
- **Maintain >80% code coverage** across all modules

---

*Last Updated: February 17, 2026*
*Version: 1.0*
*Completeness: 100%*
