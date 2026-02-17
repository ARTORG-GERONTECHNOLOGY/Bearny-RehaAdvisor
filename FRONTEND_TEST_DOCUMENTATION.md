# Frontend Test Documentation Guide

## Overview

This document provides comprehensive documentation of the frontend test suite for RehaAdvisor. The frontend uses **Jest** as the test framework with **React Testing Library** for component testing and **TypeScript** for type safety.

## Test Architecture

### Directory Structure

```
frontend/src/__tests__/
├── components/
│   ├── Home/
│   │   ├── LoginForm.test.tsx
│   │   └── RegisterForm.test.tsx
│   ├── PatientPage/
│   │   ├── FeedbackPopup.test.tsx
│   │   ├── FeedbackPopup2.test.tsx
│   │   ├── InterventionList.test.tsx
│   │   ├── PatientInterventionPopUp.test.tsx
│   │   └── PatientQuestionaire.test.tsx
│   ├── RehaTablePage/
│   │   ├── InterventionFeedbackModal.test.tsx
│   │   └── InterventionStatsModal.test.tsx
│   ├── TherapistIntervention/
│   │   ├── AddInterventionModal.test.tsx
│   │   ├── FilterBar.test.tsx
│   │   ├── InterventionFormFileInputs.test.tsx
│   │   ├── InterventionList.test.tsx
│   │   ├── PatientTypeSection.test.tsx
│   │   └── ProductPopup.test.tsx
│   ├── TherapistPatient/
│   │   ├── AddPatientPopup.test.tsx
│   │   ├── PatientPopup.test.tsx
│   │   └── RegisterPatientForm.test.tsx
│   ├── UserProfile/
│   │   ├── DeleteConfirmation.test.tsx
│   │   └── EditUserInfo.test.tsx
│   └── common/
│       ├── Error.test.tsx
│       ├── ErrorAlert.test.tsx
│       ├── Footer.test.tsx
│       ├── ForgotPasswordLink.test.tsx
│       ├── Header.test.tsx
│       ├── HeaderMobile.test.tsx
│       ├── InfoBubble.test.tsx
│       ├── WelcomeArea.test.tsx
│       └── forms/
│           ├── InputField.test.tsx
│           └── PasswordField.test.tsx
├── pages/
│   ├── AddPatient.test.tsx
│   ├── AdminDashboard.test.tsx
│   ├── Home.test.tsx
│   ├── PatientHome.test.tsx
│   ├── PatientView.test.tsx
│   ├── Therapist.test.tsx
│   ├── TherapistInterventions.test.tsx
│   ├── UnauthorizedAccess.test.tsx
│   ├── eva.test.tsx
│   └── herapistRecomendations.test.tsx
├── hooks/
│   ├── useAuthGuard.test.tsx
│   ├── usePatientInterventions.test.tsx
│   └── usePatients.test.tsx
├── stores/
│   ├── adminStore.test.tsx
│   └── authStore.test.ts
├── utils/
│   ├── interventions.test.ts
│   └── validation.test.ts
├── routes/
│   └── index.test.tsx
├── api/
│   └── authStore.test.ts
├── LogoutListener.test.tsx
├── RootLayout.test.tsx
├── main.test.tsx
└── interventions.test.ts
```

### Testing Frameworks and Libraries

| Framework | Purpose | Version |
|-----------|---------|---------|
| **Jest** | Test runner, assertion library, mocking | ~29.x |
| **React Testing Library** | Component testing utilities | ~13.x |
| **@testing-library/jest-dom** | Custom Jest matchers for DOM | ~5.x |
| **@testing-library/user-event** | User interaction simulation | ~14.x |
| **TypeScript** | Type checking and compilation | ~5.x |

## Test Categories

### 1. Component Tests (24 files)

Component tests verify that React components render correctly and respond to user interactions.

#### Home Components (2 tests)
- **[LoginForm.test.tsx](../../../frontend/src/__tests__/components/Home/LoginForm.test.tsx)**
  - Purpose: Test login form rendering and submission
  - Scenarios:
    - Form renders with email and password fields
    - Validation errors display correctly
    - Form submits with correct data on success
    - Remember me checkbox functionality
  - Key Testing Patterns:
    - Mock authentication store
    - Simulate form input and submission
    - Verify navigation after successful login

- **[RegisterForm.test.tsx](../../../frontend/src/__tests__/components/Home/RegisterForm.test.tsx)**
  - Purpose: Test user registration form
  - Scenarios:
    - All form fields render correctly
    - Password confirmation validation
    - Email format validation
    - Form submission with API call
  - Key Testing Patterns:
    - Mock API calls with jest.mock
    - Test async form submission
    - Verify error messages display

#### Patient Page Components (5 tests)

- **[FeedbackPopup.test.tsx](../../../frontend/src/__tests__/components/PatientPage/FeedbackPopup.test.tsx)**
  - Purpose: Test feedback submission modal
  - Tested Features:
    - Modal opens and closes
    - Feedback form submission
    - Rating selection (1-5 stars)
    - Error handling for API failures

- **[FeedbackPopup2.test.tsx](../../../frontend/src/__tests__/components/PatientPage/FeedbackPopup2.test.tsx)**
  - Purpose: Test alternative feedback popup variant
  - Tested Features:
    - Duplicate popup variant testing
    - Alternative UI layout
    - Different feedback submission flow

- **[InterventionList.test.tsx](../../../frontend/src/__tests__/components/PatientPage/InterventionList.test.tsx)**
  - Purpose: Test intervention list rendering
  - Tested Features:
    - List renders all interventions
    - Sorting functionality
    - Filtering by status
    - Click handlers for intervention details

- **[PatientInterventionPopUp.test.tsx](../../../frontend/src/__tests__/components/PatientPage/PatientInterventionPopUp.test.tsx)**
  - Purpose: Test intervention details popup
  - Tested Features:
    - Intervention details display
    - Modal open/close functionality
    - Action buttons (start, pause, complete)

- **[PatientQuestionaire.test.tsx](../../../frontend/src/__tests__/components/PatientPage/PatientQuestionaire.test.tsx)**
  - Purpose: Test questionnaire/survey component
  - Tested Features:
    - Question rendering
    - Answer selection (radio, checkbox, text)
    - Form submission
    - Progress tracking

#### Reha Table Page Components (2 tests)

- **[InterventionFeedbackModal.test.tsx](../../../frontend/src/__tests__/components/RehaTablePage/InterventionFeedbackModal.test.tsx)**
  - Purpose: Test feedback review modal
  - Tested Features:
    - Display patient feedback on interventions
    - Filter and sort feedback
    - Export feedback data

- **[InterventionStatsModal.test.tsx](../../../frontend/src/__tests__/components/RehaTablePage/InterventionStatsModal.test.tsx)**
  - Purpose: Test intervention statistics display
  - Tested Features:
    - Display completion statistics
    - Chart rendering
    - Data filtering and aggregation

#### Therapist Intervention Components (6 tests)

- **[AddInterventionModal.test.tsx](../../../frontend/src/__tests__/components/TherapistIntervention/AddInterventionModal.test.tsx)**
  - Purpose: Test intervention creation modal
  - Tested Features:
    - Modal opens and closes
    - Form field population
    - Intervention creation submission
    - Error handling

- **[FilterBar.test.tsx](../../../frontend/src/__tests__/components/TherapistIntervention/FilterBar.test.tsx)**
  - Purpose: Test intervention filtering UI
  - Tested Features:
    - Filter options render correctly
    - Filter selection updates results
    - Clear all filters button

- **[InterventionFormFileInputs.test.tsx](../../../frontend/src/__tests__/components/TherapistIntervention/InterventionFormFileInputs.test.tsx)**
  - Purpose: Test file upload inputs in intervention form
  - Tested Features:
    - File selection and preview
    - File validation (type, size)
    - Multiple file uploads
    - File removal

- **[InterventionList.test.tsx](../../../frontend/src/__tests__/components/TherapistIntervention/InterventionList.test.tsx)**
  - Purpose: Test therapist's intervention list
  - Tested Features:
    - List displays all interventions
    - Click to edit intervention
    - Click to delete intervention
    - Bulk actions (select multiple, mass delete)

- **[PatientTypeSection.test.tsx](../../../frontend/src/__tests__/components/TherapistIntervention/PatientTypeSection.test.tsx)**
  - Purpose: Test patient type filtering in intervention creation
  - Tested Features:
    - Patient type selection
    - Dynamic field visibility based on type
    - Validation per patient type

- **[ProductPopup.test.tsx](../../../frontend/src/__tests__/components/TherapistIntervention/ProductPopup.test.tsx)**
  - Purpose: Test product selection popup
  - Tested Features:
    - Product search functionality
    - Product selection and addition
    - Product removal from selection

#### Therapist Patient Components (3 tests)

- **[AddPatientPopup.test.tsx](../../../frontend/src/__tests__/components/TherapistPatient/AddPatientPopup.test.tsx)**
  - Purpose: Test patient addition dialog
  - Tested Features:
    - Modal opens and closes
    - Patient search
    - Patient selection and addition
    - Multiple patient selection

- **[PatientPopup.test.tsx](../../../frontend/src/__tests__/components/TherapistPatient/PatientPopup.test.tsx)**
  - Purpose: Test patient detail popup
  - Tested Features:
    - Patient details display
    - Edit patient information
    - Remove patient button
    - Patient intervention history

- **[RegisterPatientForm.test.tsx](../../../frontend/src/__tests__/components/TherapistPatient/RegisterPatientForm.test.tsx)**
  - Purpose: Test new patient registration
  - Tested Features:
    - Form field rendering
    - Form validation
    - Form submission
    - Success notification

#### User Profile Components (2 tests)

- **[DeleteConfirmation.test.tsx](../../../frontend/src/__tests__/components/UserProfile/DeleteConfirmation.test.tsx)**
  - Purpose: Test account deletion confirmation
  - Tested Features:
    - Confirmation dialog rendering
    - Password verification
    - Cancellation and deletion actions

- **[EditUserInfo.test.tsx](../../../frontend/src/__tests__/components/UserProfile/EditUserInfo.test.tsx)**
  - Purpose: Test user profile editing
  - Tested Features:
    - Form population with current user data
    - Field editing and validation
    - Form submission
    - Success/error messaging

#### Common Components (10 tests)

- **[Error.test.tsx](../../../frontend/src/__tests__/components/common/Error.test.tsx)**
  - Purpose: Test error component display
  - Tested Features:
    - Error message rendering
    - Error icon display
    - Styling and layout

- **[ErrorAlert.test.tsx](../../../frontend/src/__tests__/components/common/ErrorAlert.test.tsx)**
  - Purpose: Test error alert notification
  - Tested Features:
    - Alert visibility toggle
    - Alert dismissal
    - Animation transitions

- **[Footer.test.tsx](../../../frontend/src/__tests__/components/common/Footer.test.tsx)**
  - Purpose: Test footer component
  - Tested Features:
    - Navigation links render
    - Social media links
    - Copyright information

- **[ForgotPasswordLink.test.tsx](../../../frontend/src/__tests__/components/common/ForgotPasswordLink.test.tsx)**
  - Purpose: Test forgot password link component
  - Tested Features:
    - Link renders correctly
    - Click navigation to forgot password page
    - Accessibility compliance

- **[Header.test.tsx](../../../frontend/src/__tests__/components/common/Header.test.tsx)**
  - Purpose: Test desktop header
  - Tested Features:
    - Navigation links display
    - User menu functionality
    - Logo/branding display
    - Logout functionality

- **[HeaderMobile.test.tsx](../../../frontend/src/__tests__/components/common/HeaderMobile.test.tsx)**
  - Purpose: Test mobile-responsive header
  - Tested Features:
    - Hamburger menu toggle
    - Mobile navigation drawer
    - Touch-friendly interactions

- **[InfoBubble.test.tsx](../../../frontend/src/__tests__/components/common/InfoBubble.test.tsx)**
  - Purpose: Test info tooltip/bubble component
  - Tested Features:
    - Tooltip visibility on hover
    - Tooltip content display
    - Positioning and animation

- **[WelcomeArea.test.tsx](../../../frontend/src/__tests__/components/common/WelcomeArea.test.tsx)**
  - Purpose: Test welcome section component
  - Tested Features:
    - Greeting message display
    - User name personalization
    - Quick action buttons

- **[InputField.test.tsx](../../../frontend/src/__tests__/components/common/forms/InputField.test.tsx)**
  - Purpose: Test reusable input field component
  - Tested Features:
    - Input rendering
    - Value binding and change handling
    - Validation error display
    - Placeholder and label

- **[PasswordField.test.tsx](../../../frontend/src/__tests__/components/common/forms/PasswordField.test.tsx)**
  - Purpose: Test password input component
  - Tested Features:
    - Password visibility toggle
    - Input type switching (password ↔ text)
    - Validation rules (strength, confirmation)

### 2. Page/Route Tests (10 files)

Page tests verify full page rendering and user workflows.

- **[Home.test.tsx](../../../frontend/src/__tests__/pages/Home.test.tsx)**
  - Purpose: Test home page with login/register
  - Tested Workflows:
    - Page loads with login form visible
    - Tab switching between login and register
    - Successful login navigation

- **[AddPatient.test.tsx](../../../frontend/src/__tests__/pages/AddPatient.test.tsx)**
  - Purpose: Test patient addition page
  - Tested Workflows:
    - Add patient form displays
    - Form submission creates patient
    - Navigation after creation

- **[AdminDashboard.test.tsx](../../../frontend/src/__tests__/pages/AdminDashboard.test.tsx)**
  - Purpose: Test admin dashboard page
  - Tested Features:
    - Dashboard statistics display
    - User management interface
    - System monitoring

- **[PatientHome.test.tsx](../../../frontend/src/__tests__/pages/PatientHome.test.tsx)**
  - Purpose: Test patient home page
  - Tested Workflows:
    - Patient interventions display
    - Navigation to interventions
    - Quick start functionality

- **[PatientView.test.tsx](../../../frontend/src/__tests__/pages/PatientView.test.tsx)**
  - Purpose: Test patient profile/view page
  - Tested Features:
    - Patient information display
    - Intervention history
    - Action buttons (edit, remove, etc.)

- **[Therapist.test.tsx](../../../frontend/src/__tests__/pages/Therapist.test.tsx)**
  - Purpose: Test therapist home page
  - Tested Workflows:
    - Patient list display
    - Add patient button
    - View patient details

- **[TherapistInterventions.test.tsx](../../../frontend/src/__tests__/pages/TherapistInterventions.test.tsx)**
  - Purpose: Test intervention management page
  - Tested Workflows:
    - List all interventions
    - Add new intervention
    - Edit/delete interventions
    - Filter and search

- **[UnauthorizedAccess.test.tsx](../../../frontend/src/__tests__/pages/UnauthorizedAccess.test.tsx)**
  - Purpose: Test unauthorized access page
  - Tested Features:
    - 403 error message display
    - Navigation back to home
    - Permission explanation

- **[eva.test.tsx](../../../frontend/src/__tests__/pages/eva.test.tsx)**
  - Purpose: Test EVA assessment page
  - Tested Workflows:
    - Assessment questions display
    - Answer submission
    - Results calculation

- **[herapistRecomendations.test.tsx](../../../frontend/src/__tests__/pages/herapistRecomendations.test.tsx)**
  - Purpose: Test therapist recommendations page
  - Tested Features:
    - Display patient recommendations
    - Filter by intervention type
    - Recommendation actions

### 3. Hook Tests (3 files)

Custom hook tests verify reactive behavior and state management.

- **[useAuthGuard.test.tsx](../../../frontend/src/__tests__/hooks/useAuthGuard.test.tsx)**
  - Purpose: Test authentication guard hook
  - Tested Behavior:
    - Redirects unauthenticated users
    - Allows authenticated users
    - Role-based access control

- **[usePatientInterventions.test.tsx](../../../frontend/src/__tests__/hooks/usePatientInterventions.test.tsx)**
  - Purpose: Test patient interventions hook
  - Tested Behavior:
    - Fetches patient interventions
    - Caches results
    - Refetch on dependency changes

- **[usePatients.test.tsx](../../../frontend/src/__tests__/hooks/usePatients.test.tsx)**
  - Purpose: Test patients list hook
  - Tested Behavior:
    - Fetches therapist's patients
    - Pagination support
    - Search functionality

### 4. Store/State Tests (2 files)

Store tests verify MobX store behavior and state mutations.

- **[authStore.test.ts](../../../frontend/src/__tests__/stores/authStore.test.ts)**
  - Purpose: Test authentication state management
  - Tested Actions:
    - Login/logout actions
    - Token management
    - User data persistence
    - Permission checks

- **[adminStore.test.tsx](../../../frontend/src/__tests__/stores/adminStore.test.tsx)**
  - Purpose: Test admin dashboard store
  - Tested Actions:
    - Dashboard data loading
    - Statistics calculation
    - Filter state management
    - Export functionality

### 5. Utility Tests (2 files)

Utility tests verify helper and utility functions.

- **[interventions.test.ts](../../../frontend/src/__tests__/utils/interventions.test.ts)**
  - Purpose: Test intervention utility functions
  - Tested Functions:
    - Intervention status calculation
    - Progress tracking
    - Data transformation

- **[validation.test.ts](../../../frontend/src/__tests__/utils/validation.test.ts)**
  - Purpose: Test validation helper functions
  - Tested Functions:
    - Email validation
    - Password strength checking
    - Form field validation

### 6. Setup and Configuration Tests (6 files)

- **[RootLayout.test.tsx](../../../frontend/src/__tests__/RootLayout.test.tsx)**
  - Purpose: Test root layout component and app setup

- **[LogoutListener.test.tsx](../../../frontend/src/__tests__/LogoutListener.test.tsx)**
  - Purpose: Test logout event listener functionality

- **[main.test.tsx](../../../frontend/src/__tests__/main.test.tsx)**
  - Purpose: Test app entry point

- **[routes/index.test.tsx](../../../frontend/src/__tests__/routes/index.test.tsx)**
  - Purpose: Test route definitions and navigation

- **[api/authStore.test.ts](../../../frontend/src/__tests__/api/authStore.test.ts)**
  - Purpose: Test authentication API interactions

- **[interventions.test.ts](../../../frontend/src/__tests__/interventions.test.ts)**
  - Purpose: Test intervention data initialization

## Testing Patterns and Best Practices

### Component Testing Pattern

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  beforeEach(() => {
    // Setup before each test
    jest.clearAllMocks();
  });

  it('should render component with expected content', () => {
    // Arrange
    render(<MyComponent />);
    
    // Act
    const element = screen.getByText('Expected Text');
    
    // Assert
    expect(element).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    // Arrange
    const handleClick = jest.fn();
    render(<MyComponent onClick={handleClick} />);
    
    // Act
    await userEvent.click(screen.getByRole('button'));
    
    // Assert
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should display error message on validation failure', async () => {
    // Arrange
    render(<MyComponent />);
    
    // Act
    await userEvent.type(screen.getByPlaceholderText('Email'), 'invalid');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    
    // Assert
    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    });
  });
});
```

### Store Testing Pattern (MobX)

```typescript
import { authStore } from '../../stores/authStore';

describe('authStore', () => {
  beforeEach(() => {
    authStore.reset();
  });

  it('should set user data on login', () => {
    // Arrange
    const userData = { id: '1', email: 'test@example.com', role: 'therapist' };
    
    // Act
    authStore.setUser(userData);
    
    // Assert
    expect(authStore.user).toEqual(userData);
    expect(authStore.isAuthenticated).toBe(true);
  });

  it('should clear user data on logout', () => {
    // Arrange
    authStore.setUser({ id: '1', email: 'test@example.com', role: 'therapist' });
    
    // Act
    authStore.logout();
    
    // Assert
    expect(authStore.user).toBeNull();
    expect(authStore.isAuthenticated).toBe(false);
  });
});
```

### Hook Testing Pattern

```typescript
import { renderHook, act } from '@testing-library/react';
import { useMyHook } from './useMyHook';

describe('useMyHook', () => {
  it('should return initial state', () => {
    // Arrange & Act
    const { result } = renderHook(() => useMyHook());
    
    // Assert
    expect(result.current.value).toBe(initialValue);
  });

  it('should update state when action is called', () => {
    // Arrange
    const { result } = renderHook(() => useMyHook());
    
    // Act
    act(() => {
      result.current.setValue(newValue);
    });
    
    // Assert
    expect(result.current.value).toBe(newValue);
  });
});
```

### API Mocking Pattern

```typescript
import axios from 'axios';
jest.mock('axios');

describe('API calls', () => {
  it('should fetch users successfully', async () => {
    // Arrange
    const mockUsers = [{ id: 1, name: 'John' }];
    (axios.get as jest.Mock).mockResolvedValue({ data: mockUsers });
    
    // Act
    const result = await fetchUsers();
    
    // Assert
    expect(result).toEqual(mockUsers);
    expect(axios.get).toHaveBeenCalledWith('/api/users');
  });

  it('should handle API errors gracefully', async () => {
    // Arrange
    (axios.get as jest.Mock).mockRejectedValue(new Error('API Error'));
    
    // Act & Assert
    await expect(fetchUsers()).rejects.toThrow('API Error');
  });
});
```

## Running Tests

### All Tests
```bash
cd frontend
npm test
```

### Specific File
```bash
npm test -- LoginForm.test.tsx
```

### Specific Test Case
```bash
npm test -- --testNamePattern="should render component"
```

### Watch Mode (During Development)
```bash
npm test -- --watch
```

### Coverage Report
```bash
npm test -- --coverage
```

### Coverage Report (HTML)
```bash
npm test -- --coverage
# Open coverage/lcov-report/index.html in browser
```

## Coverage Goals

- **Overall**: 70% line coverage
- **Components**: 80% coverage
- **Stores**: 85% coverage (state management critical)
- **Hooks**: 80% coverage
- **Utils**: 90% coverage (pure functions, easier to test)

## Debugging Tests

### Print Debug Information
```bash
npm test -- --verbose
```

### Show Console Output
```bash
npm test -- --silent=false
```

### Use `screen.debug()` in Tests
```typescript
import { render, screen } from '@testing-library/react';

it('should render', () => {
  render(<Component />);
  screen.debug(); // Prints DOM structure
});
```

### Browser-Based Debugging
```typescript
import { render, screen } from '@testing-library/react';

it('should render', async () => {
  render(<Component />);
  screen.logTestingPlaygroundURL(); // Outputs URL for Testing Playground
});
```

## Common Issues and Solutions

### Issue: "Element not found"
**Solution**: Use `waitFor` for async operations:
```typescript
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});
```

### Issue: "Act warnings"
**Solution**: Wrap state updates in `act`:
```typescript
act(() => {
  fireEvent.click(button);
});
```

### Issue: "Mock not being called"
**Solution**: Ensure mock is set up before component renders:
```typescript
jest.mock('../api');
import { fetchUsers } from '../api';
// fetchUsers is already mocked
```

## Resources

- **Jest Documentation**: https://jestjs.io/
- **React Testing Library**: https://testing-library.com/react
- **Testing React**: https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
- **MobX Testing**: https://mobx.js.org/reactions.html

---

**Last Updated**: 2024  
**Test Count**: 45+ files  
**Maintainers**: Development Team  
**Related**: [CICD_TESTING_GUIDE.md](../CICD_TESTING_GUIDE.md), [TESTING_GUIDE.md](../TESTING_GUIDE.md)
