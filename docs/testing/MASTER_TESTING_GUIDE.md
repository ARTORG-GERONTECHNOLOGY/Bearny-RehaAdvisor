# Comprehensive Testing Guide - RehaAdvisor

## Quick Navigation

- **[Frontend Testing](FRONTEND_TEST_DOCUMENTATION.md)** - Jest, React Testing Library, 45+ component tests
- **[Backend Testing](BACKEND_TEST_DOCUMENTATION.md)** - Pytest, Django, 40+ test files
- **[CI/CD Testing](CICD_TESTING_GUIDE.md)** - GitHub Actions, Coverage, Docker builds

## Purpose

This guide consolidates all testing information for the RehaAdvisor project. It serves as a single reference for:
- Running tests locally during development
- Understanding test organization
- Adding new tests
- Troubleshooting test failures
- Monitoring test coverage in CI/CD

## Testing Philosophy

RehaAdvisor follows these testing principles:

1. **Comprehensive Coverage**: Aim for high coverage (70%+) across all modules
2. **Type Safety**: Use TypeScript and Python type hints to catch errors early
3. **Integration Testing**: Test real workflows, not just isolated functions
4. **Accessibility**: Ensure tests verify accessible UI patterns
5. **Performance**: Tests run efficiently without sacrificing thoroughness

## Test Statistics

| Framework | Count | Coverage Target | Status |
|-----------|-------|-----------------|--------|
| **Frontend (Jest)** | 45+ files | 70% | ✅ Active |
| **Backend (Pytest)** | 40+ files | 75% | ✅ Active |
| **Integration Tests** | CI/CD jobs | 80% | ✅ Active |
| **Total Test Functions** | 200+ | - | ✅ Maintained |

## High-Level Architecture

### Frontend Tests
```
Jest Test Suite
├── Components (24 test files)
│   ├── Page Components (10 files) - Full pages and workflows
│   ├── Feature Components (14 files) - Specific features and modals
│   └── Common Components (10 files) - Reusable UI elements
├── Pages (10 test files) - Full page rendering
├── Hooks (3 test files) - Custom React hooks
├── Stores (2 test files) - MobX state management
├── Utils (2 test files) - Helper functions
└── Routes (1 test file) - Navigation
```

### Backend Tests
```
Pytest Test Suite
├── Authentication (10 files)
│   ├── JWT token management
│   ├── User permissions
│   └── Login/register endpoints
├── Models (15 files)
│   ├── Patient, Therapist, Intervention
│   ├── RehabilitationPlan, Feedback
│   └── Relationships and constraints
├── Views/Endpoints (10 files)
│   ├── Patient management
│   ├── Therapist operations
│   └── Intervention endpoints
├── Serializers (5 files)
│   ├── Data validation
│   ├── Deserialization
│   └── Serialization
└── Utils (3 files)
    ├── DateTime handling
    ├── Text sanitization
    └── Data transformation
```

### CI/CD Tests
```
GitHub Actions Workflow (tests.yml)
├── Frontend Tests → Coverage
├── Backend Tests → Coverage
├── Docker Build Check
├── Security Scanning (Trivy)
└── Test Summary
```

## Running Tests

### Frontend

**All Tests**
```bash
cd frontend
npm test -- --coverage --watchAll=false
```

**Watch Mode (Development)**
```bash
npm test
```

**Specific Component**
```bash
npm test -- LoginForm.test.tsx
```

**Coverage Report**
```bash
npm test -- --coverage
open coverage/lcov-report/index.html
```

### Backend

**All Tests**
```bash
cd backend
pytest --cov=. --cov-report=html
```

**Specific Test File**
```bash
pytest tests/models/test_patient.py
```

**Specific Test Function**
```bash
pytest tests/models/test_patient.py::test_patient_creation
```

**Coverage Report**
```bash
open htmlcov/index.html
```

### Docker Integration

**Using Docker Compose**
```bash
make dev_up
make dev_test  # Runs both frontend and backend tests
```

**Manual Docker**
```bash
# Frontend tests in container
docker-compose -f docker-compose.dev.yml run frontend npm test

# Backend tests in container
docker-compose -f docker-compose.dev.yml run backend pytest
```

## Test Coverage Requirements

### Minimum Thresholds (Soft)
- **Frontend**: 70% line coverage
- **Backend**: 75% line coverage
- **Overall**: 72% average

### Coverage Categories
| Category | Frontend | Backend | Notes |
|----------|----------|---------|-------|
| Components/Views | 80% | 85% | UI layer critical |
| State/Models | 85% | 90% | Business logic essential |
| Utilities | 90% | 95% | Pure functions, easy to test |
| API/Integration | 75% | 80% | Mock external calls |

## Writing New Tests

### Frontend Test Template

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with default props', () => {
      // Arrange
      const props = {};
      
      // Act
      render(<MyComponent {...props} />);
      
      // Assert
      expect(screen.getByText('Expected Text')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should handle click event', async () => {
      // Arrange
      const handleClick = jest.fn();
      render(<MyComponent onClick={handleClick} />);
      
      // Act
      await userEvent.click(screen.getByRole('button'));
      
      // Assert
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined props gracefully', () => {
      // Arrange & Act
      const { container } = render(<MyComponent />);
      
      // Assert
      expect(container.firstChild).toBeInTheDocument();
    });
  });
});
```

### Backend Test Template

```python
import pytest
from django.test import Client
from api.models import Patient

class TestPatientModel:
    """Test Patient model creation and operations"""
    
    @pytest.fixture
    def patient_data(self):
        """Standard patient data for tests"""
        return {
            'name': 'John Doe',
            'email': 'john@example.com',
            'phone': '+1-555-0100',
        }
    
    def test_patient_creation(self, db, patient_data):
        """Test creating patient with valid data"""
        # Arrange
        expected_name = patient_data['name']
        
        # Act
        patient = Patient.objects.create(**patient_data)
        retrieved = Patient.objects.get(id=patient.id)
        
        # Assert
        assert retrieved.name == expected_name
        assert retrieved.email == patient_data['email']

class TestPatientAPI:
    """Test Patient API endpoints"""
    
    @pytest.fixture
    def authenticated_client(self, therapist):
        """Client authenticated as therapist"""
        client = Client()
        client.force_login(therapist)
        return client
    
    def test_get_patient_list(self, authenticated_client, therapist):
        """Test retrieving therapist's patients"""
        # Arrange
        Patient.objects.create(
            name='Patient 1',
            email='patient1@example.com',
            therapist=therapist
        )
        
        # Act
        response = authenticated_client.get('/api/patients/')
        
        # Assert
        assert response.status_code == 200
        assert len(response.json()['results']) == 1
```

## Common Workflows

### Adding a New Feature with Tests

1. **Create Test File**
   ```bash
   # Frontend
   frontend/src/__tests__/components/MyFeature.test.tsx
   
   # Backend
   backend/tests/views/test_my_feature_views.py
   ```

2. **Write Tests First** (TDD)
   - Define expected behavior
   - Write failing tests
   - Implement feature to pass tests

3. **Run Tests Locally**
   ```bash
   npm test          # Frontend
   pytest --watch    # Backend (with pytest-watch)
   ```

4. **Verify Coverage**
   - Frontend: Check `coverage/lcov-report/`
   - Backend: Check `htmlcov/index.html`

5. **Push and Verify CI/CD**
   - GitHub Actions runs tests automatically
   - Check workflow status
   - Verify coverage uploaded to Codecov

### Debugging Test Failures

**Frontend**
1. Check error message in test output
2. Run test in watch mode: `npm test`
3. Add `screen.debug()` to print DOM
4. Check mock setup in test
5. Review component implementation

**Backend**
1. Check assertion error message
2. Run test verbosely: `pytest -vv -s`
3. Add print statements (visible with `-s`)
4. Check fixture setup
5. Review model/view implementation

### Updating Failing Tests

When tests fail due to legitimate changes:

1. **Understand the Change**
   - Read the change that caused failure
   - Verify it's intentional improvement

2. **Update Test**
   ```bash
   # Frontend
   npm test -- --updateSnapshot
   
   # Backend
   pytest --update-snapshots
   ```

3. **Review Changes**
   - Check what changed in test expectations
   - Ensure changes are correct

4. **Commit Changes**
   - Include test updates with feature changes

## Test Maintenance

### Regular Tasks

- **Weekly**: Monitor test execution time, optimize slow tests
- **Monthly**: Review coverage reports, identify gaps
- **Quarterly**: Refactor duplicated test code, update documentation
- **Annually**: Evaluate testing framework upgrades, review strategy

### Cleanup

**Remove Obsolete Tests**
```bash
# After removing feature
rm frontend/src/__tests__/components/OldFeature.test.tsx
rm backend/tests/views/test_old_feature.py
```

**Update Snapshots**
```bash
npm test -- --updateSnapshot
pytest --update-snapshots
```

## Troubleshooting

### Common Issues

**Frontend Tests Hanging**
- Clear Jest cache: `npm test -- --clearCache`
- Check for infinite loops in component
- Verify API mocks are working

**Backend Database Errors**
- Ensure MongoDB is running: `docker-compose up mongo`
- Check test database configuration
- Verify fixtures are set up correctly

**Coverage Below Threshold**
- Add missing tests for uncovered lines
- Review coverage report in detail
- Identify and remove redundant tests

**CI/CD Workflow Fails**
- Check workflow logs in GitHub Actions
- Reproduce failure locally: `npm test`, `pytest`
- Look for environment variable issues
- Check Docker build logs

### Getting Help

1. **Check Documentation**
   - [Frontend Testing](FRONTEND_TEST_DOCUMENTATION.md)
   - [Backend Testing](BACKEND_TEST_DOCUMENTATION.md)
   - [CI/CD Testing](CICD_TESTING_GUIDE.md)

2. **Search Test Files**
   - Look for similar tests as examples
   - Check test comments and docstrings

3. **Run Tests Locally**
   - Reproduce the issue locally
   - Add debug output
   - Verify environment setup

4. **Ask Team**
   - Post in project chat
   - Create GitHub discussion
   - Schedule pairing session

## Resources

### Documentation
- [Jest Documentation](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)
- [Pytest Documentation](https://docs.pytest.org/)
- [Django Testing](https://docs.djangoproject.com/en/stable/topics/testing/)

### Articles & Guides
- [Testing React with Hooks](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Django REST Framework Testing](https://www.django-rest-framework.org/api-guide/testing/)
- [Modern Testing Practices](https://martinfowler.com/articles/testing-strategies.html)

### Tools
- [Codecov Coverage Dashboard](https://codecov.io/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Testing Playground](https://testing-playground.com/)

## Integration with Development Workflow

### Before Committing
```bash
# Run full test suite
npm test                    # Frontend
pytest                      # Backend

# Check coverage
npm test -- --coverage
pytest --cov=.
```

### Before Pushing
```bash
# Verify tests pass
make dev_test

# Check no linting errors
npm run lint
flake8 .
```

### CI/CD Pipeline
- GitHub Actions runs all tests
- Coverage uploaded to Codecov
- Docker images built and validated
- Security scans performed
- Results reported in PR

## Monitoring and Analytics

### Codecov Dashboard
- Track coverage trends over time
- View commit-level coverage
- Identify coverage drops
- Set coverage targets

### GitHub Actions
- Monitor test execution time
- Track flaky tests
- Review failed test reasons
- Archive test reports

## Future Improvements

- [ ] Add E2E tests with Cypress/Playwright
- [ ] Implement visual regression testing
- [ ] Add performance benchmarks
- [ ] Expand accessibility testing
- [ ] Set up test data factory system
- [ ] Create test report generation

---

**Last Updated**: 2024  
**Maintained By**: Development Team  
**Related Files**: 
- [FRONTEND_TEST_DOCUMENTATION.md](FRONTEND_TEST_DOCUMENTATION.md)
- [BACKEND_TEST_DOCUMENTATION.md](BACKEND_TEST_DOCUMENTATION.md)
- [CICD_TESTING_GUIDE.md](CICD_TESTING_GUIDE.md)
