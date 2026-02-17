# Testing Documentation Index

Welcome to the RehaAdvisor Testing Documentation. This index helps you find the information you need.

## 🎯 Quick Links

**Just want to run tests?** → [Master Testing Guide - Running Tests](MASTER_TESTING_GUIDE.md#running-tests)

**Need to fix a failing test?** → [CI/CD Testing Guide - Troubleshooting](CICD_TESTING_GUIDE.md#troubleshooting-ci-failures)

**Writing new tests?** → [Master Testing Guide - Writing New Tests](MASTER_TESTING_GUIDE.md#writing-new-tests)

## 📚 Main Documentation Files

### 1. [MASTER_TESTING_GUIDE.md](MASTER_TESTING_GUIDE.md) - START HERE
**13 KB | Central Hub for All Testing Information**

Best for:
- Overview of testing structure
- Quick reference commands
- Understanding test organization
- Getting started with testing

Key sections:
- High-level architecture
- Running tests (all types)
- Test coverage requirements
- Writing new tests with templates
- Common workflows

**Read this first** if you're new to the project.

### 2. [FRONTEND_TEST_DOCUMENTATION.md](FRONTEND_TEST_DOCUMENTATION.md) - FRONTEND DETAILS
**24 KB | Comprehensive React Testing Guide**

Best for:
- Frontend test details
- Jest and React Testing Library patterns
- Component testing examples
- 45+ component test descriptions

Key sections:
- Complete frontend test directory structure
- 24 component tests (Home, PatientPage, RehaTablePage, etc.)
- 10 page/route tests
- 3 hook tests
- 2 store tests (MobX)
- Testing patterns and best practices

**Read this** if you're working on React components or frontend features.

### 3. [BACKEND_TEST_DOCUMENTATION.md](BACKEND_TEST_DOCUMENTATION.md) - BACKEND DETAILS
**24 KB | Comprehensive Pytest Testing Guide**

Best for:
- Backend test details
- Django and Pytest patterns
- Model and view testing examples
- 40+ backend test file descriptions

Key sections:
- Complete backend test directory structure
- Authentication tests (JWT, permissions)
- Model tests (Patient, Therapist, Intervention)
- View/endpoint tests
- Serializer tests
- Utility tests with scenarios

**Read this** if you're working on Django models, views, or APIs.

### 4. [CICD_TESTING_GUIDE.md](CICD_TESTING_GUIDE.md) - CI/CD AUTOMATION
**12 KB | GitHub Actions and Automated Testing**

Best for:
- Understanding CI/CD automation
- Debugging CI failures
- Coverage reporting
- Workflow configuration

Key sections:
- GitHub Actions workflow architecture
- Frontend test job details
- Backend test job details
- Docker build validation
- Security scanning
- Coverage reporting with Codecov

**Read this** if you're debugging CI failures or want to understand automation.

## 🔍 Finding What You Need

### By Task

| Task | Go To | Section |
|------|-------|---------|
| Run tests locally | [MASTER_TESTING_GUIDE](MASTER_TESTING_GUIDE.md#running-tests) | Running Tests |
| Write frontend test | [FRONTEND_TEST_DOCUMENTATION](FRONTEND_TEST_DOCUMENTATION.md#writing-new-tests) | Testing Patterns |
| Write backend test | [BACKEND_TEST_DOCUMENTATION](BACKEND_TEST_DOCUMENTATION.md#common-testing-patterns) | Common Patterns |
| Fix failing test | [MASTER_TESTING_GUIDE](MASTER_TESTING_GUIDE.md#troubleshooting) | Troubleshooting |
| Understand CI/CD | [CICD_TESTING_GUIDE](CICD_TESTING_GUIDE.md) | Workflow Architecture |
| Check coverage | [CICD_TESTING_GUIDE](CICD_TESTING_GUIDE.md#coverage-reporting) | Coverage Reporting |
| Debug CI failure | [CICD_TESTING_GUIDE](CICD_TESTING_GUIDE.md#troubleshooting-ci-failures) | Troubleshooting |
| Set up new test env | [CICD_TESTING_GUIDE](CICD_TESTING_GUIDE.md) | Workflow Configuration |

### By Role

**Frontend Developer**
1. Start: [Master Testing Guide](MASTER_TESTING_GUIDE.md)
2. Reference: [Frontend Testing Guide](FRONTEND_TEST_DOCUMENTATION.md)
3. Components to test: See directory structure in Frontend guide

**Backend Developer**
1. Start: [Master Testing Guide](MASTER_TESTING_GUIDE.md)
2. Reference: [Backend Testing Guide](BACKEND_TEST_DOCUMENTATION.md)
3. Models/Views to test: See directory structure in Backend guide

**DevOps Engineer**
1. Start: [CI/CD Testing Guide](CICD_TESTING_GUIDE.md)
2. Workflow: `.github/workflows/tests.yml`
3. Configuration: See workflow setup section

**QA Engineer**
1. Start: [Master Testing Guide](MASTER_TESTING_GUIDE.md)
2. Test cases: All guides (components, models, views)
3. Coverage tracking: [Coverage Reporting](CICD_TESTING_GUIDE.md#coverage-reporting)

**Tech Lead**
1. Overview: [Testing Summary](TESTING_INFRASTRUCTURE_SUMMARY.md)
2. Strategy: [Master Testing Guide](MASTER_TESTING_GUIDE.md#testing-philosophy)
3. Coverage goals: All guides have coverage targets

## 📊 Test Organization

### Frontend Tests (45+ files)
Located: `frontend/src/__tests__/`
- **Components** (24 files) - UI component testing
- **Pages** (10 files) - Full page rendering
- **Hooks** (3 files) - Custom React hooks
- **Stores** (2 files) - MobX state management
- **Utils** (2 files) - Helper functions
- **Routes** (1 file) - Navigation logic

→ Details: [Frontend Test Documentation](FRONTEND_TEST_DOCUMENTATION.md)

### Backend Tests (40+ files)
Located: `backend/tests/`
- **Authentication** (10 files) - JWT, permissions
- **Models** (15 files) - Database models
- **Views** (10 files) - API endpoints
- **Serializers** (5 files) - Data validation
- **Utils** (3 files) - Helper functions

→ Details: [Backend Test Documentation](BACKEND_TEST_DOCUMENTATION.md)

### CI/CD Pipeline
- **Frontend Tests** → Coverage upload
- **Backend Tests** → Coverage upload
- **Docker Build** → Validation
- **Security Scan** → Vulnerability check
- **Test Summary** → Final reporting

→ Details: [CI/CD Testing Guide](CICD_TESTING_GUIDE.md)

## 🚀 Quick Start Commands

### Frontend
```bash
cd frontend
npm test -- --coverage --watchAll=false    # All tests with coverage
npm test                                    # Watch mode
npm test -- LoginForm.test.tsx              # Specific test
```

### Backend
```bash
cd backend
pytest --cov=. --cov-report=html           # All tests with coverage
pytest tests/models/test_patient.py        # Specific file
pytest -k "test_patient"                   # Pattern matching
```

### Both
```bash
make dev_test                               # All tests
make dev_up                                 # Start services
```

## 📖 Key Concepts

### Coverage Targets
- **Frontend**: 70% line coverage
- **Backend**: 75% line coverage
- **Overall**: 72% average

### Test Types

| Type | Description | Framework | Count |
|------|-------------|-----------|-------|
| Unit | Test single functions | Jest/Pytest | 100+ |
| Component | Test React components | React Testing Library | 24 |
| Integration | Test features/workflows | Jest/Pytest | 50+ |
| E2E | Test full workflows | (future) | - |
| Performance | Test speed/efficiency | (future) | - |

### Key Tools
- **Frontend**: Jest, React Testing Library
- **Backend**: Pytest, Django Test Client
- **CI/CD**: GitHub Actions, Codecov
- **Security**: Trivy

## 🔗 Related Documentation

- **README.md** - Main project documentation
- **.github/workflows/tests.yml** - GitHub Actions workflow
- **jest.config.ts** - Frontend Jest configuration
- **pytest.ini** - Backend Pytest configuration
- **Backend requirements.txt** - Testing dependencies
- **Frontend package.json** - Testing dependencies

## 📞 Getting Help

### Questions About Tests
1. Check relevant documentation guide above
2. Search guide using browser (Ctrl+F / Cmd+F)
3. Look for similar existing tests as examples

### Test Failures
1. Read troubleshooting section in relevant guide
2. Run tests locally with verbose output (-v or -vv)
3. Check test error message for specifics

### Adding New Tests
1. Read "Writing New Tests" in [Master Guide](MASTER_TESTING_GUIDE.md)
2. Find similar existing test as template
3. Follow patterns documented in specific guide

### Workflow Issues
1. Check [CI/CD Testing Guide](CICD_TESTING_GUIDE.md#troubleshooting-ci-failures)
2. View GitHub Actions logs for specific error
3. Reproduce issue locally

## 📋 Documentation Files Summary

| File | Size | Purpose | Audience |
|------|------|---------|----------|
| [MASTER_TESTING_GUIDE.md](MASTER_TESTING_GUIDE.md) | 13 KB | Central hub, quick reference | Everyone |
| [FRONTEND_TEST_DOCUMENTATION.md](FRONTEND_TEST_DOCUMENTATION.md) | 24 KB | React testing details | Frontend devs |
| [BACKEND_TEST_DOCUMENTATION.md](BACKEND_TEST_DOCUMENTATION.md) | 24 KB | Django testing details | Backend devs |
| [CICD_TESTING_GUIDE.md](CICD_TESTING_GUIDE.md) | 12 KB | GitHub Actions setup | DevOps, Leads |
| [TESTING_INFRASTRUCTURE_SUMMARY.md](TESTING_INFRASTRUCTURE_SUMMARY.md) | 15 KB | Project completion summary | Tech leads |
| **Total** | **88 KB** | **Complete testing docs** | **All teams** |

## 🎓 Learning Path

### New to the Project
1. Read [README.md](README.md) - Project overview
2. Read [Master Testing Guide](MASTER_TESTING_GUIDE.md) - Testing overview
3. Read specialized guide for your area (frontend/backend)
4. Look at existing tests as examples
5. Write your first test using templates

### Improving Your Skills
1. Study testing patterns in specialized guides
2. Review coverage reports regularly
3. Learn from code review feedback
4. Experiment with different testing approaches
5. Contribute test improvements

### Troubleshooting
1. Specific guide for your area (frontend/backend)
2. Troubleshooting section
3. Search for error message in documentation
4. Check GitHub issues if problem persists
5. Ask team for help

## ✅ Checklist: Before Pushing Code

- [ ] All tests pass locally (`npm test`, `pytest`)
- [ ] Coverage hasn't decreased
- [ ] No new linting errors
- [ ] Tests follow documented patterns
- [ ] New tests added for new features
- [ ] Docstrings/comments explain complex tests

---

**Last Updated**: 2024  
**Documentation Version**: 1.0  
**Total Pages**: 5 main guides + index  
**Total Content**: 88 KB comprehensive documentation

**Start Here**: [Master Testing Guide](MASTER_TESTING_GUIDE.md)
