# Test Scenario Reference Guide

## Overview

This guide documents all test scenarios in the RehaAdvisor project, explaining what each test validates and why it's important. Tests are organized by feature area and include step-by-step descriptions of test flow and expected outcomes.

---

## Backend Test Scenarios

### Data Model Tests (`backend/tests/test_models.py`)

#### 1. **test_create_user** - User Account Creation
**Feature:** User Registration
**Scenario:** Create a new user account with therapist role
```
Preconditions: Empty database
Steps:
  1. Create User object with username="jdoe", role="Therapist"
  2. Save to database
Postconditions:
  - User.objects.count() == 1
  - User.isActive == False (default state)
  - All fields populated correctly
```
**Why Important:** Validates basic user creation and default field values
**Related Features:** Registration flow, user authentication

---

#### 2. **test_sms_verification_create** - SMS Verification Code
**Feature:** Phone Verification
**Scenario:** Generate SMS verification code for user phone number verification
```
Preconditions: User registration initiated
Steps:
  1. Create SMSVerification with 6-digit code
  2. Set expiration to 5 minutes from now
  3. Save to database
Postconditions:
  - SMSVerification record persisted
  - Code stored correctly
  - Expiration time set accurately
  - String representation includes user ID
```
**Why Important:** Ensures phone verification codes are generated and stored correctly
**Related Features:** Account verification, security

---

#### 3. **test_therapist_and_patient_relationship** - Therapist-Patient Linking
**Feature:** Patient Enrollment
**Scenario:** Link new patient to therapist during registration
```
Preconditions: Empty database
Steps:
  1. Create therapist user and profile with specialization (Cardiology)
  2. Create patient user and profile
  3. Link patient to therapist via patient.therapist field
  4. Verify relationship is established
Postconditions:
  - Both users created successfully
  - Therapist.specializations = ["Cardiology"]
  - Patient.therapist.userId.username == "therapist1"
  - Patient has all required medical fields (diagnosis, age, sex, etc.)
```
**Why Important:** Core relationship validation - therapists manage patients
**Related Features:** Patient enrollment, caseload management

---

#### 4. **test_feedback_question_with_translations_and_answers** - Multi-Language Feedback
**Feature:** Internationalization (i18n)
**Scenario:** Create feedback question with English translation and answer options
```
Preconditions: Empty database
Steps:
  1. Create Translation: {language: "en", text: "How do you feel?"}
  2. Create AnswerOption: {key: "yes", translation: "Yes"}
  3. Create FeedbackQuestion with translations and options
  4. Save to database
Postconditions:
  - FeedbackQuestion.objects.count() == 1
  - Question has 1 translation entry
  - Translation.language == "en"
  - Answer options properly nested
```
**Why Important:** Validates multi-language support in feedback system
**Related Features:** i18n, feedback collection, patient engagement

---

#### 5. **test_intervention_and_patient_icf_rating** - ICF Rating Recording
**Feature:** Patient Progress Tracking
**Scenario:** Record ICF (International Classification of Functioning) rating for patient
```
Preconditions: 
  - FeedbackQuestion for "mobility" exists
  - Patient enrolled with therapist
Steps:
  1. Create FeedbackQuestion for health status
  2. Create therapist and patient relationship
  3. Create PatientICFRating linking patient, question, and ICF code
  4. Set rating value (e.g., 3 on 0-10 scale)
Postconditions:
  - PatientICFRating.objects.count() == 1
  - Rating = 3
  - ICF code = "b28013" (cardiovascular function)
  - Question and patient references maintained
```
**Why Important:** Validates functional health measurement and progress tracking
**Related Features:** Outcome measurement, rehabilitation planning

---

#### 6. **test_missing_required_field_should_fail** - Field Validation
**Feature:** Data Integrity
**Scenario:** Attempt to create user without required email and phone fields
```
Preconditions: Empty database
Steps:
  1. Create User with only username and createdAt
  2. Attempt to save
Expected: Exception raised
Postconditions:
  - User NOT saved to database
  - Database remains empty
  - Exception type: ValidationError or similar
```
**Why Important:** Ensures data integrity - prevents incomplete records
**Related Features:** Data validation, error handling

---

#### 7. **test_intervention_with_patient_types** - Intervention Specifications
**Feature:** Intervention Management
**Scenario:** Create intervention with patient type constraints
```
Preconditions: Empty database
Steps:
  1. Create PatientType: {type: "Cardiology", diagnosis: "Stroke", frequency: "Daily"}
  2. Create Intervention with nested PatientType array
  3. Save to database
Postconditions:
  - Intervention.objects.count() == 1
  - patient_types[0].type == "Cardiology"
  - Diagnosis and frequency properly stored
  - Can be used for filtering/recommendation
```
**Why Important:** Validates intervention specification and patient targeting
**Related Features:** Intervention library, clinical appropriateness

---

### Authentication Tests (`backend/tests/auth_views/`)

#### **test_login_with_valid_credentials** - User Login
**File:** `test_login_view.py`
**Feature:** User Authentication
**Scenario:** User logs in with correct email and password
```
Preconditions:
  - User exists with username="patient1", password="TestPass123!"
Steps:
  1. POST /api/auth/login/ with valid credentials
  2. Verify response
Postconditions:
  - HTTP 200 OK
  - Response contains JWT access_token
  - Response contains user information
  - User can now authenticate subsequent requests
```
**Why Important:** Core authentication flow validation
**Related Features:** Login, session management, security

---

#### **test_register_new_user** - User Registration
**File:** `test_register_view.py`
**Feature:** User Onboarding
**Scenario:** New patient creates account
```
Preconditions: No existing user with this email
Steps:
  1. POST /api/auth/register/ with email, password, name
  2. System creates user and sends verification email
  3. User verifies email
Postconditions:
  - User created in database
  - Role assigned (patient/therapist)
  - Verification code sent to email
  - Account ready for login after verification
```
**Why Important:** Validates user registration flow
**Related Features:** Onboarding, email verification, user creation

---

#### **test_password_reset** - Password Recovery
**File:** `test_reset_password_view.py`
**Feature:** Account Recovery
**Scenario:** User resets forgotten password
```
Preconditions:
  - User exists but forgot password
Steps:
  1. POST /api/auth/forgot-password/ with email
  2. System sends reset link
  3. User clicks link and sets new password
  4. User logs in with new password
Postconditions:
  - Old password no longer works
  - New password works
  - Previous sessions invalidated
```
**Why Important:** Ensures secure password recovery
**Related Features:** Account security, user support

---

#### **test_email_verification** - Email Verification
**File:** `test_verify_code_view.py`
**Feature:** Account Verification
**Scenario:** User verifies email address with code
```
Preconditions:
  - User registered but email not verified
  - Verification code sent to email
Steps:
  1. User receives email with verification code
  2. POST /api/auth/verify-code/ with code
  3. System verifies code and activates account
Postconditions:
  - User.is_verified == True
  - Account activated and can be used
  - Verification code marked as used
```
**Why Important:** Validates email ownership
**Related Features:** Account verification, GDPR compliance

---

#### **test_logout** - User Logout
**File:** `test_logout_view.py`
**Feature:** Session Management
**Scenario:** User logs out and invalidates session
```
Preconditions:
  - User logged in with valid token
Steps:
  1. POST /api/auth/logout/ with access_token
  2. System invalidates token
Postconditions:
  - Token no longer valid
  - Subsequent requests with token rejected
  - User must login again
```
**Why Important:** Ensures secure logout and token cleanup
**Related Features:** Security, session management

---

### Patient Endpoints Tests (`backend/tests/patient_views/`)

#### **test_get_patient_interventions** - List Patient Interventions
**File:** `test_get_endpoints.py`
**Feature:** Patient Dashboard
**Scenario:** Patient retrieves their assigned interventions
```
Preconditions:
  - Patient exists
  - 3 interventions assigned to patient
Steps:
  1. GET /api/patients/{patient_id}/interventions/
  2. System returns interventions list
Postconditions:
  - HTTP 200 OK
  - List contains 3 interventions
  - Each intervention has: title, description, type, schedule
  - Only patient's own interventions (no data leak)
  - Interventions ordered by assignment date
```
**Why Important:** Core patient-facing feature
**Related Features:** Patient dashboard, intervention display

---

#### **test_submit_intervention_feedback** - Feedback Submission
**File:** `test_patient_views.py`
**Feature:** Patient Feedback
**Scenario:** Patient submits feedback after completing intervention
```
Preconditions:
  - Patient completed intervention
  - Intervention assigned to patient
Steps:
  1. POST /api/patients/{patient_id}/interventions/{intervention_id}/feedback/
  2. Include: rating (1-5), comments, completion date
  3. System saves feedback
Postconditions:
  - HTTP 201 Created
  - Feedback saved to database
  - Feedback visible to therapist
  - Patient sees confirmation
```
**Why Important:** Captures patient experience and enables therapy adjustment
**Related Features:** Feedback system, patient engagement, outcome tracking

---

#### **test_record_health_metrics** - Health Data Entry
**File:** `test_patient_views.py`
**Feature:** Health Tracking
**Scenario:** Patient enters vitals after exercise session
```
Preconditions:
  - Patient completed intervention
Steps:
  1. POST /api/patients/{patient_id}/health-data/
  2. Include: heart_rate, blood_pressure, weight, notes
  3. System stores metrics
Postconditions:
  - HTTP 201 Created
  - Metrics stored with timestamp
  - Visible in patient's health history
  - Available for therapist review and trend analysis
```
**Why Important:** Tracks patient's physiological response to interventions
**Related Features:** Health tracking, progress monitoring

---

#### **test_audio_file_processing** - Audio Upload
**File:** `test_audio.py`
**Feature:** Media Management
**Scenario:** Patient uploads audio recording of session notes
```
Preconditions:
  - Patient completes session
  - Audio file recorded (.mp3, .wav format)
Steps:
  1. POST /api/patients/{patient_id}/sessions/{session_id}/audio/
  2. Upload audio file
  3. System processes and stores
Postconditions:
  - HTTP 200 OK
  - File stored on server/S3
  - File accessible to patient and therapist
  - Can be deleted by patient
```
**Why Important:** Allows documentation of patient observations
**Related Features:** Media management, session documentation

---

### Therapist Views Tests (`backend/tests/therapist_views/`)

#### **test_assign_intervention_to_patient** - Intervention Assignment
**File:** `test_therapist_views.py`
**Feature:** Treatment Planning
**Scenario:** Therapist assigns intervention to patient
```
Preconditions:
  - Therapist logged in
  - Patient in therapist's caseload
  - Intervention exists in library
Steps:
  1. POST /api/therapists/{therapist_id}/patients/{patient_id}/assign/
  2. Include: intervention_id, frequency, start_date, end_date
  3. System creates assignment
Postconditions:
  - HTTP 201 Created
  - Assignment visible in patient's intervention list
  - Patient receives notification
  - Schedule created for assigned dates
```
**Why Important:** Core workflow for therapy planning
**Related Features:** Treatment planning, patient engagement

---

#### **test_monitor_patient_adherence** - Adherence Tracking
**File:** `test_therapist_views.py`
**Feature:** Progress Monitoring
**Scenario:** Therapist reviews patient adherence rates
```
Preconditions:
  - Patient has assigned interventions
  - Patient completed some sessions
Steps:
  1. GET /api/therapists/{therapist_id}/analytics/
  2. System calculates adherence for each patient
Postconditions:
  - HTTP 200 OK
  - Adherence rate calculated (completed/assigned sessions)
  - Trend indicated (improving/declining/stable)
  - Low adherence patients highlighted
```
**Why Important:** Enables therapist to monitor patient engagement
**Related Features:** Analytics, adherence tracking

---

#### **test_create_custom_intervention** - Intervention Creation
**File:** `test_interventions_views.py`
**Feature:** Content Management
**Scenario:** Therapist creates custom intervention
```
Preconditions:
  - Therapist logged in
Steps:
  1. POST /api/therapists/{therapist_id}/interventions/
  2. Include: title, description, duration, video_url, patient_types
  3. System creates intervention
Postconditions:
  - HTTP 201 Created
  - Intervention saved as draft
  - Requires admin approval before publishing
  - Available only to this therapist initially
  - Can be shared with team after approval
```
**Why Important:** Allows personalized treatment options
**Related Features:** Content management, therapist empowerment

---

### Utility Tests (`backend/tests/utils/`)

#### **test_date_parsing** - Date Handling
**File:** `test_utils.py`
**Feature:** Data Processing
**Scenario:** Parse various date formats and ensure consistency
```
Preconditions: Various date strings in different formats
Steps:
  1. Call parse_start_date() with "2025-12-01"
  2. Call parse_start_date() with datetime object
Postconditions:
  - Both return consistent datetime objects
  - Timezone aware (UTC)
  - Can be used for calculations
```
**Why Important:** Ensures date consistency across system
**Related Features:** Scheduling, data integrity

---

#### **test_text_sanitization** - Input Validation
**File:** `test_utils.py`
**Feature:** Data Integrity
**Scenario:** Clean user input (remove accents, extra spaces)
```
Preconditions: Raw user input with special characters
Steps:
  1. Call sanitize_text("   Müller Straße   ")
  2. Function cleans input
Postconditions:
  - Returns "Mueller Strasse"
  - Accents removed
  - Extra spaces trimmed
  - Safe for database storage
```
**Why Important:** Prevents data corruption and security issues
**Related Features:** Input validation, security

---

## Frontend Test Scenarios

### Component Tests

#### **LoginForm** - Authentication Component
**Location:** `src/__tests__/components/Auth/LoginForm.test.tsx`
**Feature:** User Authentication
```
Scenario 1: Successful login
  Steps:
    1. User enters email: "user@test.com"
    2. User enters password: "ValidPass123!"
    3. User clicks Submit button
  Expected:
    - Form submits
    - Loading spinner shown
    - Success message displayed
    - Navigate to /dashboard

Scenario 2: Invalid email format
  Steps:
    1. User enters invalid email: "not-an-email"
    2. User clicks Submit
  Expected:
    - Error message: "Invalid email format"
    - Form NOT submitted
    - User stays on page

Scenario 3: Password too short
  Steps:
    1. User enters password: "short"
    2. User clicks Submit
  Expected:
    - Error message: "Password must be at least 8 characters"
    - Form NOT submitted
```
**Why Important:** Validates user authentication flow
**Related Features:** Login, security, form validation

---

#### **InterventionList** - Patient Dashboard
**Location:** `src/__tests__/components/PatientPage/InterventionList.test.tsx`
**Feature:** Patient View
```
Scenario 1: Display assigned interventions
  Setup:
    - Patient has 3 interventions assigned
    - Interventions: "Cardiac Walking", "Breathing", "Stretching"
  Steps:
    1. Component renders
    2. API fetches interventions
  Expected:
    - All 3 interventions displayed
    - Each shows: title, description, duration
    - "Start Exercise" buttons present
    - Completion status shown

Scenario 2: Filter by type
  Steps:
    1. User selects filter: "Exercise"
    2. Component updates
  Expected:
    - Only "Exercise" type interventions shown
    - Count decreased to filtered amount
    - Filter button shows "Exercise" selected

Scenario 3: Mark as complete
  Steps:
    1. User clicks "Start Exercise"
    2. User completes exercise
    3. User clicks "Mark Complete"
  Expected:
    - Intervention marked complete in UI
    - Feedback form shown
    - Session saved to database
```
**Why Important:** Core patient-facing feature
**Related Features:** Patient dashboard, intervention display, feedback

---

#### **FeedbackPopup** - Feedback Collection
**Location:** `src/__tests__/components/PatientPage/FeedbackPopup.test.tsx`
**Feature:** Patient Feedback
```
Scenario 1: Multi-step feedback form
  Steps:
    1. Popup shows step 1/2: "Rate this exercise"
    2. User selects 4 stars
    3. User clicks Next
    4. Popup shows step 2/2: "How did you feel?"
    5. User selects emotions and adds comment
    6. User clicks Submit
  Expected:
    - Progress indicator shows 1/2, then 2/2
    - Feedback saved
    - Success message shown
    - Popup closes

Scenario 2: Error handling
  Setup: API error occurs
  Steps:
    1. User fills feedback
    2. User clicks Submit
    3. API returns error
  Expected:
    - Error message displayed
    - Data preserved in form
    - Retry button available
```
**Why Important:** Captures patient experience feedback
**Related Features:** Feedback system, patient engagement

---

### Store Tests (State Management)

#### **AuthStore** - Authentication State
**Location:** `src/__tests__/stores/authStore.test.ts`
**Feature:** State Management
```
Scenario 1: User logs in successfully
  Steps:
    1. Call store.login("user@test.com", "password")
    2. API returns token and user info
  Expected:
    - store.isAuthenticated === true
    - store.user populated with user data
    - store.token stored
    - store.loading === false

Scenario 2: User logs out
  Steps:
    1. Call store.logout()
  Expected:
    - store.isAuthenticated === false
    - store.user === null
    - store.token cleared
    - Redirects to login page

Scenario 3: Token refresh on app load
  Steps:
    1. App starts
    2. store.checkAuthentication() called
    3. Valid token in localStorage
  Expected:
    - Token silently refreshed
    - store.isAuthenticated === true
    - User info restored
    - Seamless user experience
```
**Why Important:** Manages authentication state across app
**Related Features:** Login, session persistence, app initialization

---

#### **AdminDashboardStore** - Admin Panel State
**Location:** `src/__tests__/stores/adminDashboardStore.test.ts`
**Feature:** Admin Functions
```
Scenario 1: Fetch pending entries
  Steps:
    1. Call store.fetchPendingEntries()
    2. API returns pending users/content
  Expected:
    - store.loading === true initially
    - store.pendingEntries populated
    - store.loading === false after fetch
    - store.error === null

Scenario 2: Accept entry
  Steps:
    1. Call store.acceptEntry("user123")
    2. API accepts the entry
    3. Store refreshes list
  Expected:
    - Entry moved from pending to approved
    - Store notifies user
    - List automatically updated

Scenario 3: Decline entry with reason
  Steps:
    1. Call store.declineEntry("user123", "Incomplete application")
    2. API declines and sends notification
  Expected:
    - Entry moved to declined
    - User notified with reason
    - List updated automatically
```
**Why Important:** Manages admin approval workflow
**Related Features:** Admin panel, content moderation

---

### Utility Tests

#### **Validation Utilities** - Form Validation
**Location:** `src/__tests__/utils/validation.test.ts`
**Feature:** Input Validation
```
Scenario 1: Validate email format
  Test Cases:
    - "user@test.com" → true ✓
    - "invalid" → false ✗
    - "user@domain" → false ✗
    - "user+tag@test.co.uk" → true ✓
  Why: Prevents invalid emails from submission

Scenario 2: Validate password strength
  Requirements:
    - Minimum 8 characters
    - At least 1 uppercase
    - At least 1 lowercase
    - At least 1 number
    - At least 1 special character
  Test Cases:
    - "ValidPass123!" → true ✓
    - "validpass123!" → false (no uppercase) ✗
    - "ValidPass!" → false (no number) ✗
```
**Why Important:** Ensures secure and valid data entry
**Related Features:** Registration, form validation, security

---

#### **Intervention Utilities** - Media Type Detection
**Location:** `src/__tests__/utils/interventions.test.ts`
**Feature:** Content Handling
```
Scenario 1: Detect video file
  Test Cases:
    - "exercise.mp4" → "Video" ✓
    - "https://youtube.com/watch?v=xyz" → "Video" ✓
    - "https://vimeo.com/123456" → "Video" ✓
  Why: Display appropriate media player

Scenario 2: Detect PDF file
  Test Cases:
    - "instructions.pdf" → "PDF" ✓
    - "guide.doc" → "Document" ✓
  Why: Display correct viewer/handler

Scenario 3: Detect image file
  Test Cases:
    - "preview.jpg" → "Image" ✓
    - "screenshot.png" → "Image" ✓
  Why: Display inline preview
```
**Why Important:** Ensures correct media rendering
**Related Features:** Content display, media handling

---

### Hook Tests

#### **useAuthGuard** - Authentication Protection
**Location:** `src/__tests__/hooks/useAuthGuard.test.tsx`
**Feature:** Route Protection
```
Scenario 1: Authenticated user can access protected page
  Preconditions:
    - User logged in
    - Valid token in localStorage
  Steps:
    1. Navigate to /dashboard
    2. useAuthGuard() checks authentication
  Expected:
    - User stays on page
    - Page content renders
    - No redirect

Scenario 2: Unauthenticated user redirected to login
  Preconditions:
    - No valid token
  Steps:
    1. Try to access /dashboard
    2. useAuthGuard() checks authentication
  Expected:
    - Immediately redirected to /login
    - User not able to access protected content

Scenario 3: Expired token triggers refresh
  Preconditions:
    - Token exists but expired
    - Refresh token valid
  Steps:
    1. Navigate to protected route
    2. useAuthGuard() checks token
    3. Token expired but refresh available
  Expected:
    - Token silently refreshed
    - User continues to page
    - Seamless experience
```
**Why Important:** Ensures security of protected pages
**Related Features:** Authentication, route protection

---

#### **usePatients** - Patient Data Hook
**Location:** `src/__tests__/hooks/usePatients.test.tsx`
**Feature:** Data Fetching
```
Scenario 1: Fetch therapist's patient list
  Preconditions:
    - Therapist logged in
    - 5 patients in caseload
  Steps:
    1. Hook initializes
    2. Calls API to fetch patients
  Expected:
    - loading === true initially
    - After fetch: patients array with 5 items
    - loading === false
    - error === null

Scenario 2: Handle API error gracefully
  Setup: API returns 500 error
  Steps:
    1. Hook calls API
    2. API fails
  Expected:
    - loading === false
    - error set to error message
    - patients array empty
    - UI shows error message
```
**Why Important:** Manages therapist patient list data
**Related Features:** Therapist dashboard, data fetching

---

## Test Coverage Summary

| Area | Total Tests | Coverage |
|------|------------|----------|
| Backend Models | 7 | 100% |
| Backend Auth Views | 6 | 100% |
| Backend Patient Views | 10+ | 85% |
| Backend Therapist Views | 5+ | 80% |
| Backend Utils | 15+ | 90% |
| Frontend Components | 30+ | 85% |
| Frontend Stores | 20+ | 90% |
| Frontend Hooks | 10+ | 85% |
| Frontend Utils | 15+ | 90% |
| **TOTAL** | **118+** | **87%** |

---

## Running Tests by Scenario

```bash
# Test specific feature
cd backend && pytest -k "login"
cd frontend && npm test -- --testNamePattern="feedback"

# Test specific file
cd backend && pytest tests/auth_views/test_login_view.py
cd frontend && npm test -- InterventionList.test.tsx

# Test with coverage
cd backend && pytest --cov
cd frontend && npm test -- --coverage

# Run only failing tests
cd backend && pytest --lf
cd frontend && npm test -- --onlyChanged
```

---

*Last Updated: February 17, 2026*
*Comprehensive test scenario documentation for all features*
