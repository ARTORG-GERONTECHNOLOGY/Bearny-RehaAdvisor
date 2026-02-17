# Testing Quick Reference Guide

## For Developers: Fast Lookup for Common Testing Tasks

---

## 🚀 Quick Start

### Run All Tests
```bash
# Backend
cd backend && pytest

# Frontend
cd frontend && npm test

# In Docker
docker-compose -f docker-compose.dev.yml exec backend pytest
docker-compose -f docker-compose.dev.yml exec frontend npm test
```

### Run Tests with Coverage
```bash
# Backend
cd backend && pytest --cov=core --cov=api --cov-report=html

# Frontend
cd frontend && npm test -- --coverage --watchAll=false
```

### Run Specific Test
```bash
# Backend - specific file
cd backend && pytest tests/auth_views/test_login_view.py

# Backend - specific test
cd backend && pytest tests/auth_views/test_login_view.py::test_login_success

# Frontend - specific file
cd frontend && npm test -- LoginForm.test.tsx

# Frontend - specific test by name pattern
cd frontend && npm test -- --testNamePattern="login success"
```

---

## 📁 Test File Locations

### Backend
```
/backend/tests/
├── auth_views/          # Login, register, password reset, verification
├── patient_views/       # Feedback, intervention completion, health data
├── therapist_views/     # Patient assignment, monitoring, custom interventions
├── interventions_views/ # Intervention management endpoints
├── user_views/          # User profile, settings endpoints
├── utils/               # Utility function tests
├── test_models.py       # Data model tests (User, Patient, Therapist, etc.)
└── test_urls.py         # URL routing tests
```

### Frontend
```
/frontend/src/__tests__/
├── components/          # React component tests
├── pages/               # Page component tests
├── stores/              # MobX state management tests
├── hooks/               # Custom React hook tests
├── utils/               # Utility function tests
├── api/                 # API client tests
└── routes/              # Router tests
```

---

## ✍️ Writing a New Test

### Backend (pytest)

```python
"""
Module docstring explaining test file purpose
"""

import mongomock
import pytest
from mongoengine import connect, disconnect

# Fixture for MongoDB mock
@pytest.fixture(autouse=True, scope="function")
def mongo_mock():
    alias = "default"
    from mongoengine.connection import _connections
    if alias in _connections:
        disconnect(alias)
    
    conn = connect(
        "mongoenginetest",
        alias=alias,
        host="mongodb://localhost",
        mongo_client_class=mongomock.MongoClient,
    )
    yield conn
    disconnect(alias)

# Test function
def test_feature_success(mongo_mock):
    """
    Scenario: [Clear description of what's being tested]
    
    Setup:
    - [Preconditions and test data setup]
    
    Steps:
    1. [Step 1]
    2. [Step 2]
    
    Expected Results:
    - [Expected outcome 1]
    - [Expected outcome 2]
    """
    # Arrange
    test_data = create_test_data()
    
    # Act
    result = perform_action(test_data)
    
    # Assert
    assert result.success == True
    assert result.message == "Expected message"
```

### Frontend (Jest)

```typescript
/**
 * Test scenario: [What is being tested]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { LoginForm } from '../LoginForm';

describe('LoginForm Component', () => {
  it('should submit form with valid credentials', () => {
    // Arrange
    render(<LoginForm />);
    
    // Act
    const emailInput = screen.getByLabelText(/email/i);
    fireEvent.change(emailInput, { target: { value: 'user@test.com' } });
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitButton);
    
    // Assert
    expect(screen.getByText(/success/i)).toBeInTheDocument();
  });

  it('should show error for invalid email', () => {
    // Arrange
    render(<LoginForm />);
    
    // Act
    const emailInput = screen.getByLabelText(/email/i);
    fireEvent.change(emailInput, { target: { value: 'invalid' } });
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitButton);
    
    // Assert
    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
  });
});
```

---

## 📊 Test Organization Pattern (AAA)

All tests should follow the **AAA Pattern**:

```python
def test_example(mongo_mock):
    """Scenario: Something happens"""
    
    # ARRANGE - Set up test data and preconditions
    user = User(
        username="testuser",
        email="test@example.com",
        password_hash=make_password("password")
    ).save()
    
    # ACT - Perform the action being tested
    response = client.post(
        "/api/auth/login/",
        data=json.dumps({
            "email": "test@example.com",
            "password": "password"
        }),
        content_type="application/json"
    )
    
    # ASSERT - Verify the expected results
    assert response.status_code == 200
    assert "access_token" in response.json()
```

---

## 🐛 Debugging Tests

### Backend (pytest)

```bash
# Run with verbose output
cd backend && pytest -v

# Run with detailed failures
cd backend && pytest --tb=long

# Run single test with print statements
cd backend && pytest -s tests/test_models.py::test_create_user

# Drop into debugger on failure
cd backend && pytest --pdb tests/test_models.py::test_create_user

# Stop at first failure
cd backend && pytest -x tests/
```

### Frontend (Jest)

```bash
# Run in watch mode (auto-runs on file changes)
cd frontend && npm test -- --watch

# Run with verbose output
cd frontend && npm test -- --verbose

# Update snapshots after intentional changes
cd frontend && npm test -- -u

# Debug in Node inspector
cd frontend && node --inspect-brk node_modules/.bin/jest --runInBand
```

---

## 🔍 Common Test Scenarios

### Testing an API Endpoint (Backend)

```python
def test_create_user_api(mongo_mock):
    """Scenario: Create user via API"""
    
    # Arrange
    payload = {
        "email": "newuser@test.com",
        "password": "SecurePass123!",
        "userType": "Patient"
    }
    
    # Act
    response = client.post(
        "/api/auth/register/",
        data=json.dumps(payload),
        content_type="application/json"
    )
    
    # Assert
    assert response.status_code == 201
    assert User.objects(email="newuser@test.com").count() == 1
```

### Testing a React Component (Frontend)

```typescript
it('should render intervention list', () => {
  const interventions = [
    { id: 1, title: 'Exercise', duration: 30 },
    { id: 2, title: 'Stretching', duration: 20 }
  ];
  
  render(<InterventionList items={interventions} />);
  
  expect(screen.getByText('Exercise')).toBeInTheDocument();
  expect(screen.getByText('Stretching')).toBeInTheDocument();
});
```

### Testing Error Handling (Backend)

```python
def test_login_with_wrong_password(mongo_mock):
    """Scenario: Login fails with wrong password"""
    
    # Arrange
    user = User(
        email="test@example.com",
        pwdhash=make_password("correctpass")
    ).save()
    
    # Act
    response = client.post(
        "/api/auth/login/",
        data=json.dumps({
            "email": "test@example.com",
            "password": "wrongpass"
        }),
        content_type="application/json"
    )
    
    # Assert
    assert response.status_code == 401
    assert "Invalid credentials" in response.json()["error"]
```

### Testing State Management (Frontend - MobX)

```typescript
it('should update auth store on login', () => {
  const store = new AuthStore();
  
  store.login("user@test.com", "password");
  
  expect(store.isAuthenticated).toBe(true);
  expect(store.user.email).toBe("user@test.com");
});
```

---

## 🔗 Mocking External Dependencies

### Backend - Mocking Email

```python
from unittest.mock import patch

@patch("core.views.auth_views.send_mail")
def test_send_verification_email(mock_send_mail, mongo_mock):
    user = User(email="test@example.com").save()
    
    # Act
    send_verification_code(user)
    
    # Assert
    mock_send_mail.assert_called_once()
    args, kwargs = mock_send_mail.call_args
    assert "test@example.com" in args
```

### Frontend - Mocking API Calls

```typescript
import axios from 'axios';
jest.mock('axios');

it('should fetch user data', async () => {
  const mockUser = { id: 1, name: 'John' };
  (axios.get as jest.Mock).mockResolvedValue({ data: mockUser });
  
  const user = await fetchUser(1);
  
  expect(user).toEqual(mockUser);
  expect(axios.get).toHaveBeenCalledWith('/api/users/1');
});
```

---

## 📝 Test Naming Convention

### Backend
- File: `test_<feature>.py` (e.g., `test_login_view.py`)
- Function: `test_<action>_<condition>` (e.g., `test_login_success`)
- Fixture: `<resource>_mock` (e.g., `mongo_mock`)

Examples:
```python
test_login_success()
test_login_wrong_password()
test_register_therapist_success()
test_register_existing_email()
test_submit_feedback_no_responses()
```

### Frontend
- File: `<Component>.test.tsx` (e.g., `LoginForm.test.tsx`)
- Suite: `describe('<Component>', ...)`
- Test: `it('should <expected behavior>', ...)`

Examples:
```typescript
it('should submit form with valid data')
it('should show error for invalid email')
it('should display loading spinner')
it('should redirect after successful login')
```

---

## 🚨 Running Tests Before Commit

### Pre-commit Checklist
```bash
# 1. Run all tests
cd backend && pytest && cd ../frontend && npm test

# 2. Check coverage (should be > 80%)
cd backend && pytest --cov

# 3. Run linter
cd backend && flake8 . && cd ../frontend && npm run lint

# 4. Commit only if all pass
git add . && git commit -m "feature: description"
```

### GitHub Actions Integration
Tests run automatically on:
- Push to main branch
- All pull requests
- Failed tests block merge

---

## 📚 Test Documentation Reference

**Detailed Testing Guides:**
- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Complete infrastructure & best practices
- [TEST_SCENARIOS.md](TEST_SCENARIOS.md) - 60+ documented scenarios
- [TEST_CONSOLIDATION.md](TEST_CONSOLIDATION.md) - Test organization rationale

---

## ⚡ Common Issues & Solutions

### Issue: Tests pass locally but fail in CI
**Solution**: Ensure no hardcoded paths or environment variables. Use `DJANGO_SETTINGS_MODULE` for backend.

### Issue: Database already locked during tests
**Solution**: Ensure `mongo_mock` fixture disconnects after each test. Check for leftover processes.

### Issue: Snapshot tests failing after component change
**Solution**: Review changes and update snapshots: `npm test -- -u` (frontend)

### Issue: Test timeout
**Solution**: Increase timeout or check for infinite loops. Frontend: `jest.setTimeout(10000)`

### Issue: Can't import test module
**Solution**: Ensure `__init__.py` files exist in test directories.

---

## 💡 Tips & Tricks

1. **Use descriptive test names** - Someone should understand what the test does from the name alone
2. **One assertion per test** - Or group related assertions with clear comments
3. **Don't test implementation details** - Test behavior and outcomes
4. **Mock external services** - Don't actually send emails or call external APIs
5. **Use fixtures for setup** - Reduces duplication and improves readability
6. **Test edge cases** - Empty strings, null values, very large numbers, etc.
7. **Document why** - Not just what the test does, but why it's important
8. **Keep tests fast** - Use mocks instead of slow I/O operations
9. **Test both success and failure** - Every feature should have error test cases
10. **Review test coverage** - Aim for 80%+ coverage on critical paths

---

## 🔗 Related Documentation

- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Detailed testing infrastructure guide
- [TEST_SCENARIOS.md](TEST_SCENARIOS.md) - Comprehensive test scenario reference
- [TEST_CONSOLIDATION.md](TEST_CONSOLIDATION.md) - Testing organization and consolidation strategy
- [TESTING_IMPLEMENTATION_SUMMARY.md](TESTING_IMPLEMENTATION_SUMMARY.md) - Overview of testing improvements

---

*Last Updated: February 17, 2026*
*Quick reference guide for RehaAdvisor testing*
