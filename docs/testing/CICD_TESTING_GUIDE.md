# CI/CD Testing Guide for RehaAdvisor

## Overview

This document describes the Continuous Integration/Continuous Deployment (CI/CD) testing infrastructure for the RehaAdvisor project. The system automatically runs comprehensive tests on every push and pull request to ensure code quality and reliability.

## GitHub Actions Workflow

### Workflow File Location
- **Path**: `.github/workflows/tests.yml`
- **Triggers**: Push to `main`/`develop`, Pull Requests, Docker Compose changes
- **Parallel Jobs**: 5 concurrent jobs for efficiency

### Workflow Architecture

```
Trigger (push/PR)
    ↓
├─→ Frontend Tests (Jest) ─→ Upload Coverage
├─→ Backend Tests (Pytest) ─→ Upload Coverage
    ↓
    Both Complete (needs: [frontend-tests, backend-tests])
    ↓
├─→ Docker Build Check
├─→ Security Scanning
    ↓
    Test Summary (Report Results)
```

## Job Descriptions

### 1. Frontend Tests (Jest)

**Name**: `frontend-tests`  
**Runtime**: ~5-10 minutes  
**Node Version**: 18 LTS

#### Steps:
1. **Checkout Code**: Clone repository at current commit
2. **Setup Node.js**: Install Node 18 with npm caching
3. **Install Dependencies**: `npm ci` for reproducible installations
4. **Lint Code**: ESLint with TypeScript support
5. **Run Tests**: Jest with coverage reporting
6. **Upload Coverage**: Send results to Codecov

#### Configuration Details:

```yaml
Working Directory: frontend/
Test Command: npm test -- --coverage --watchAll=false --testTimeout=10000
Coverage Format: coverage-final.json
Coverage Flags: frontend
Node Caching: npm cache via package-lock.json
Timeout: 30 minutes (job level)
```

#### Test Coverage Requirements:
- **Minimum Coverage**: 70% line coverage (soft threshold)
- **Coverage Report**: Uploaded to Codecov for tracking trends
- **Test Timeout**: 10 seconds per test

#### Common Patterns:
- React component testing with `@testing-library/react`
- MobX store testing with mock observers
- Mock API responses using Jest mocks
- Form validation testing with user interactions

### 2. Backend Tests (Pytest)

**Name**: `backend-tests`  
**Runtime**: ~10-15 minutes  
**Python Version**: 3.10

#### Services:
- **MongoDB**: 8.0 (localhost:27017)
  - Health check: mongosh ping
  - Credentials: admin/password
  - Database: reha_advisor_test
  
- **Redis**: 7-alpine (localhost:6379)
  - Health check: redis-cli ping
  - Default database: 0

#### Steps:
1. **Checkout Code**: Clone repository
2. **Setup Python**: Install Python 3.10 with pip caching
3. **Install Dependencies**: All packages from requirements.txt
4. **Lint with Flake8**: Code style checking
5. **Run Tests**: Pytest with coverage reporting
6. **Upload Coverage**: Send to Codecov

#### Configuration Details:

```yaml
Working Directory: backend/
Test Command: pytest --cov=. --cov-report=xml --cov-report=term-summary -v
Coverage Format: coverage.xml (Cobertura format)
Coverage Flags: backend
Python Caching: pip cache via requirements.txt
Timeout: 30 minutes (job level)
```

#### Environment Variables (CI Only):
```
MONGODB_URI: mongodb://admin:password@localhost:27017/reha_advisor_test?authSource=admin
REDIS_URL: redis://localhost:6379/0
SECRET_KEY: test-secret-key-for-ci-cd
DEBUG: False
```

#### Test Coverage Requirements:
- **Minimum Coverage**: 75% line coverage (soft threshold)
- **Coverage Report**: Uploaded to Codecov for tracking
- **Verbose Output**: Full test names and results printed

#### Test Categories:
- **Models**: Database schema validation
- **Views/Endpoints**: API endpoint testing
- **Serializers**: Data serialization/deserialization
- **Utils**: Utility function testing
- **Authentication**: JWT and session testing

### 3. Docker Build Check

**Name**: `docker-build`  
**Depends On**: Frontend Tests + Backend Tests complete  
**Runtime**: ~15-20 minutes

#### Purpose:
Validates that Docker images can be built successfully without breaking existing deployments.

#### Builds:
1. **Frontend Production Image**
   - Dockerfile: `frontend/Dockerfile.prod`
   - Tag: `reha-advisor:frontend-latest`
   - Caching: GitHub Actions cache for faster builds

2. **Backend Production Image**
   - Dockerfile: `backend/Dockerfile.prod`
   - Tag: `reha-advisor:backend-latest`
   - Caching: GitHub Actions cache for faster builds

#### Configuration:
```yaml
Build Context: frontend/ and backend/ directories
Push to Registry: No (validation only)
Caching Strategy: GitHub Actions cache (mode=max)
Buildx: Multi-platform build support
```

#### Common Failures:
- Missing dependencies in requirements.txt or package.json
- Broken import paths or module resolution
- Environment configuration issues in Dockerfile

### 4. Security Scanning

**Name**: `security-scan`  
**Tool**: Trivy by AquaSecurity  
**Depends On**: Frontend Tests + Backend Tests complete  
**Runtime**: ~5 minutes

#### Purpose:
Scans the entire filesystem for known vulnerabilities in dependencies and code.

#### Configuration:
```yaml
Scan Type: Filesystem (fs)
Output Format: SARIF (GitHub-native format)
Upload: GitHub Security tab
Fail on Error: No (informational)
```

#### What It Checks:
- Vulnerable package versions in Python and Node.js
- Known CVEs in dependencies
- Configuration issues that could lead to vulnerabilities

#### Reviewing Results:
1. Navigate to **Security** tab in GitHub repository
2. Click **Code scanning alerts**
3. Review and remediate high-severity findings

### 5. Test Summary

**Name**: `test-summary`  
**Depends On**: All jobs complete  
**Runtime**: <1 minute

#### Purpose:
Consolidates test results and reports final status. Fails the workflow if any critical job failed.

#### Success Criteria:
- ✅ Frontend tests: Passed
- ✅ Backend tests: Passed
- ✅ Docker builds: Completed
- ✅ Security scan: Completed

#### Job Exits with Code 1 if:
- Frontend tests failed
- Backend tests failed
- Docker build failed
- (Security scan doesn't fail the job - informational only)

## Coverage Reporting

### Codecov Integration

Both frontend and backend jobs upload coverage reports to Codecov. This provides:

1. **Coverage Trends**: Track coverage changes over time
2. **Commit-level Coverage**: See coverage for each commit
3. **Pull Request Comments**: Automated PR comments with coverage impact
4. **Coverage Badges**: Embed coverage status in README

#### Accessing Coverage Reports:
1. Navigate to [codecov.io](https://codecov.io)
2. Log in with GitHub account
3. Select `telerehabapp` repository
4. View coverage dashboards, trends, and PR impacts

#### Minimum Thresholds (Soft):
- **Frontend**: 70% line coverage
- **Backend**: 75% line coverage

**Note**: These are monitored but not enforced as hard blocks. Aim to maintain or improve coverage with each PR.

## Local Testing (Before Pushing)

### Frontend Tests

```bash
cd frontend

# Install dependencies
npm ci

# Run tests with coverage
npm test -- --coverage --watchAll=false

# Run tests in watch mode (during development)
npm test

# Run specific test file
npm test -- PatientPage.test.tsx

# Run tests matching pattern
npm test -- --testNamePattern="feedback"
```

### Backend Tests

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test file
pytest tests/models/test_patient.py

# Run specific test function
pytest tests/models/test_patient.py::test_patient_creation

# Run tests matching pattern
pytest -k "test_patient"

# Verbose output
pytest -vv

# Show print statements
pytest -s
```

## Troubleshooting CI Failures

### Frontend Test Failures

**Problem**: Tests fail with "Cannot find module" error  
**Solution**:
- Check that all imports use correct relative paths
- Ensure `tsconfig.json` path mappings are correct
- Run `npm ci` locally to validate dependencies

**Problem**: Coverage below threshold  
**Solution**:
- Add missing test cases for uncovered lines
- Review coverage report at `frontend/coverage/lcov-report/index.html`
- Use `npm test -- --coverage` locally to identify gaps

**Problem**: Linting fails with eslint errors  
**Solution**:
- Run `npm run lint` locally to see errors
- Use `npm run lint -- --fix` to auto-fix formatting issues

### Backend Test Failures

**Problem**: MongoDB connection errors  
**Solution**:
- Verify pytest.ini has correct connection string
- Check `MONGODB_URI` environment variable is set
- Ensure MongoDB service is healthy in workflow

**Problem**: Flake8 linting failures  
**Solution**:
- Run `flake8 .` locally to see errors
- Most common: Line too long, unused imports, trailing whitespace
- Use formatters like `black` and `isort` to auto-fix

**Problem**: Import errors or module not found  
**Solution**:
- Verify Python path configuration
- Check that all imports use correct module names
- Ensure all dependencies are in requirements.txt

**Problem**: Coverage below threshold  
**Solution**:
- Run `pytest --cov=. --cov-report=html` locally
- Review coverage report at `htmlcov/index.html`
- Add missing test cases for uncovered functions

## Best Practices

### Writing Testable Code

1. **Dependency Injection**: Inject dependencies rather than hardcoding them
2. **Small Functions**: Keep functions small and focused for easier testing
3. **Pure Functions**: Avoid side effects when possible
4. **Clear Naming**: Use descriptive names for functions and test cases

### Test Organization

1. **One Test File per Module**: Each file being tested gets its own test file
2. **Grouping**: Use describe blocks or test classes to group related tests
3. **Setup/Teardown**: Use fixtures or beforeEach to reduce duplication
4. **Naming Convention**:
   - Pattern: `test_<function>_<scenario>.py` (backend)
   - Pattern: `<Component>.test.tsx` (frontend)

### Coverage Guidelines

1. **Aim for High Coverage**: Target 80%+ for critical modules
2. **Test Edge Cases**: Don't just test the happy path
3. **Mock External Services**: Use mocks for API calls, database, etc.
4. **Avoid Coverage Gaming**: Don't write tests just to increase percentage

### PR Review Checklist

Before pushing, ensure:
- ✅ All tests pass locally
- ✅ No new linting errors
- ✅ Coverage hasn't decreased
- ✅ Docker images build successfully
- ✅ No security vulnerabilities introduced

## Monitoring and Dashboards

### GitHub Actions Dashboard
- **Location**: Actions tab in GitHub repository
- **Shows**: All workflow runs, job status, timing information
- **Filtering**: By branch, event type, or status

### Codecov Dashboard
- **Location**: codecov.io (linked from PR comments)
- **Shows**: Coverage trends, commit-level coverage, file coverage
- **Alerts**: Notifies when coverage drops significantly

## Resources

- **GitHub Actions Documentation**: https://docs.github.com/en/actions
- **Pytest Documentation**: https://docs.pytest.org/
- **Jest Documentation**: https://jestjs.io/
- **Codecov Documentation**: https://docs.codecov.io/
- **Trivy Documentation**: https://github.com/aquasecurity/trivy

## Questions or Issues?

If the CI/CD workflow fails or you have questions:

1. **Check the logs**: Click on the failed job to see detailed output
2. **Reproduce locally**: Run the same commands locally to debug
3. **Review recent changes**: Look for breaking changes in dependencies
4. **Consult documentation**: Check the resources above for more information
5. **Ask the team**: Post in the project chat or create an issue

---

**Last Updated**: 2024  
**Maintainers**: Development Team  
**Related Documents**: [TESTING_GUIDE.md](TESTING_GUIDE.md), [TEST_CONSOLIDATION.md](TEST_CONSOLIDATION.md)
