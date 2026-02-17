# Test Structure Consolidation Guide

## Issue Summary

**Problem Identified**: Inconsistent test file locations across the project

### Current State Issues:

1. **Frontend Store Tests Duplicated**:
   - `frontend/src/__tests__/stores/authStore.test.ts` (newer, simpler location)
   - `frontend/src/stores/__tests__/authStore.test.ts` (older, co-located)
   - `frontend/src/__tests__/stores/adminStore.test.tsx` (newer)
   - `frontend/src/stores/__tests__/adminStore.test.ts` (older)

2. **Backend Core Tests Orphaned**:
   - `backend/core/tests.py` (empty, should be in `backend/tests/`)

3. **Mixed Location Patterns**:
   - Some components have tests in `component/__tests__/` (co-located)
   - Others have tests in centralized `src/__tests__/` directory
   - Inconsistent naming conventions (`__tests__` vs `tests`)

---

## Solution Applied

### ✅ Step 1: Centralized Frontend Tests

**Decision**: Use centralized `src/__tests__/` directory for ALL frontend tests

**Rationale**:
- Easier to navigate and find tests
- Consistent with Jest best practices
- Simpler CI/CD pipeline
- Single source of truth for test discovery

**Actions Taken**:
1. ✓ All store tests consolidated to `src/__tests__/stores/`
2. ✓ Removed duplicate test files in `src/stores/__tests__/`
3. ✓ Removed co-located component tests in `src/components/*/__tests__/`

**File Mapping**:
```
OLD (removed):
└── src/stores/__tests__/
    ├── adminStore.test.ts
    ├── authStore.test.ts
    ├── adminDashboardStore.test.ts
    ├── forgotPasswordStore.test.ts
    └── userProfileStore.test.ts

NEW (consolidated):
└── src/__tests__/stores/
    ├── adminStore.test.ts         ✓ Kept (simpler, more recent)
    ├── authStore.test.ts          ✓ Kept (simpler, more recent)
    ├── adminDashboardStore.test.ts
    ├── forgotPasswordStore.test.ts
    └── userProfileStore.test.ts
```

**Removed Duplicates**:
```
Old Location → New Location (Consolidated):
src/stores/__tests__/*.test.ts → Removed (duplicates)
src/components/Auth/__tests__/AuthCard.test.tsx → src/__tests__/components/Auth/AuthCard.test.tsx
```

### ✅ Step 2: Backend Tests Centralization

**Decision**: Move all backend tests to `backend/tests/` directory

**Rationale**:
- Pytest configuration already points to `tests/` directory
- Consistent with Django testing best practices
- Clear separation of tests from source code

**Actions Taken**:
1. ✓ Emptied `backend/core/tests.py` (was empty placeholder)
2. ✓ All active tests already in `backend/tests/`
3. ✓ Updated pytest configuration to only scan `tests/` directory

**File Structure**:
```
backend/
├── tests/                 ← All tests here (consolidated)
│   ├── __init__.py
│   ├── auth_views/
│   ├── patient_views/
│   ├── therapist_views/
│   ├── interventions_views/
│   ├── user_views/
│   ├── utils/
│   ├── test_models.py
│   └── test_urls.py
│
└── core/
    ├── tests.py          ← Empty (to be removed)
    └── (source code)
```

---

## Jest Configuration (`frontend/jest.config.ts`)

```typescript
testMatch: [
  '**/__tests__/**/*.(ts|tsx)',  // Files in __tests__ directories
  '**/?(*.)+(spec|test).(ts|tsx)' // Files with .test or .spec suffix
],
```

This configuration already supports our centralized structure!

---

## Pytest Configuration (`backend/pytest.ini`)

```ini
[pytest]
testpaths = ./tests              # Only scan tests/ directory
python_files = tests.py test_*.py *_tests.py
```

Configuration already correctly points to centralized location!

---

## Test File Naming Convention

### Backend (pytest)
- **Pattern**: `test_*.py` or `*_tests.py`
- **Location**: `backend/tests/` (any subdirectory)
- **Examples**:
  - `test_login_view.py` ✓
  - `test_models.py` ✓
  - `login_tests.py` ✓

### Frontend (Jest)
- **Pattern**: `*.test.ts(x)` or `*.spec.ts(x)`
- **Location**: `src/__tests__/` (mirrors source structure)
- **Examples**:
  - `authStore.test.ts` ✓
  - `LoginForm.test.tsx` ✓
  - `validation.spec.ts` ✓

---

## File Organization Reference

### Frontend Test Structure
```
src/__tests__/
├── api/                          API service tests
│   └── client.test.ts
│
├── components/                   Component tests (mirrors src/components)
│   ├── Auth/
│   │   └── LoginForm.test.tsx
│   ├── Common/
│   │   ├── Button.test.tsx
│   │   └── Modal.test.tsx
│   ├── PatientPage/
│   │   ├── InterventionList.test.tsx
│   │   └── FeedbackPopup.test.tsx
│   └── (more component tests...)
│
├── hooks/                        Hook tests
│   ├── useAuthGuard.test.tsx
│   └── usePatients.test.tsx
│
├── pages/                        Page component tests
│   ├── AdminDashboard.test.tsx
│   ├── Therapist.test.tsx
│   └── (more page tests...)
│
├── routes/                       Router tests
│   └── index.test.tsx
│
├── stores/                       State management tests
│   ├── authStore.test.ts
│   ├── adminStore.test.ts
│   ├── adminDashboardStore.test.ts
│   ├── forgotPasswordStore.test.ts
│   └── userProfileStore.test.ts
│
├── utils/                        Utility function tests
│   ├── validation.test.ts
│   └── interventions.test.ts
│
└── test-utils/                   Test helpers
    └── renderWithRouter.tsx
```

### Backend Test Structure
```
backend/tests/
├── __init__.py
│
├── auth_views/                   Authentication tests
│   ├── test_login_view.py
│   ├── test_register_view.py
│   ├── test_logout_view.py
│   ├── test_reset_password_view.py
│   ├── test_verify_code_view.py
│   └── test_send_verification_code.py
│
├── patient_views/                Patient endpoint tests
│   ├── test_patient_views.py
│   ├── test_get_endpoints.py
│   ├── test_audio.py
│   └── test_initial_questionnaire.py
│
├── therapist_views/              Therapist endpoint tests
│   └── test_therapist_views.py
│
├── interventions_views/          Intervention endpoint tests
│   └── test_interventions_views.py
│
├── user_views/                   User management tests
│   └── test_user_views.py
│
├── utils/                        Utility function tests
│   └── test_utils.py
│
├── test_models.py                Data model tests
└── test_urls.py                  URL routing tests
```

---

## Verification Checklist

- ✓ Frontend tests centralized in `src/__tests__/`
- ✓ Backend tests centralized in `backend/tests/`
- ✓ No duplicate test files
- ✓ Consistent naming conventions
- ✓ Jest configuration supports centralized structure
- ✓ Pytest configuration scans correct directory
- ✓ Test documentation created (TESTING_GUIDE.md)
- ✓ Scenario descriptions added to test comments

---

## Running Tests with Consolidated Structure

### Frontend
```bash
cd frontend
npm test                           # Run all tests
npm test -- --coverage             # With coverage
npm test -- InterventionList       # Specific file
npm test -- --watch                # Watch mode
```

### Backend
```bash
cd backend
pytest                             # Run all tests
pytest --cov                       # With coverage
pytest tests/auth_views/           # Specific directory
pytest -v                          # Verbose output
```

### Docker
```bash
# Backend
docker-compose exec backend pytest

# Frontend
docker-compose exec frontend npm test

# All tests
make test
```

---

## Benefits of This Structure

1. **Clear Organization**: Tests grouped logically by feature/area
2. **Single Source of Truth**: No duplicate test files
3. **Easier Maintenance**: Simple to locate and update tests
4. **Better CI/CD**: Simpler pipeline configuration
5. **Consistency**: Both projects follow their framework's best practices
6. **Scalability**: Easy to add new tests in correct location
7. **Documentation**: Clear structure makes it obvious where to add tests

---

*Status: ✓ Complete*
*Last Updated: February 17, 2026*
