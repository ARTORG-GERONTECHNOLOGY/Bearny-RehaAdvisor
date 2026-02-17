# RehaAdvisor - Use Cases

## Overview

This document describes all major use cases in the RehaAdvisor platform, organized by actor and priority.

---

## Table of Contents

1. [Patient Use Cases](#patient-use-cases)
2. [Therapist Use Cases](#therapist-use-cases)
3. [Researcher Use Cases](#researcher-use-cases)
4. [Administrator Use Cases](#administrator-use-cases)
5. [System Use Cases](#system-use-cases)

---

## Patient Use Cases

### UC-P1: User Registration & Onboarding

**Actor**: Patient  
**Priority**: Critical  
**Preconditions**: None  
**Postconditions**: Patient account created, initial questionnaire completed

**Flow**:
1. Patient navigates to registration page
2. Enters personal information (name, email, DOB, contact)
3. Creates secure password
4. Receives verification code via email
5. Completes health questionnaire
6. Receives therapist assignment confirmation
7. Views initial intervention recommendations

**Alternative Flows**:
- Patient already has code: Skip registration, use patient ID
- Email verification fails: Resend code or contact support

---

### UC-P2: View Assigned Interventions

**Actor**: Patient  
**Priority**: Critical  
**Preconditions**: Patient account active, therapist assigned interventions

**Flow**:
1. Patient logs into dashboard
2. Views "My Interventions" section
3. Sees calendar of upcoming sessions
4. Sees status of current/past interventions
5. Filters by type (active, completed, missed)
6. Receives notifications of new assignments

**Alternative Flows**:
- No interventions assigned: Show "contact therapist" message
- Network error: Show cached data

---

### UC-P3: Execute Intervention/Exercise

**Actor**: Patient  
**Priority**: Critical  
**Preconditions**: Intervention assigned, scheduled time reached

**Flow**:
1. Patient opens scheduled intervention
2. Reads intervention description & instructions
3. Views media content (video/image/audio)
4. Executes exercise at home
5. Records session completion
6. Optionally records video feedback
7. Submits completion with self-assessment

**Alternative Flows**:
- Cannot complete: Mark as missed with reason
- Video upload fails: Retry or skip video feedback
- Network interruption: Auto-save progress, resume later

---

### UC-P4: Submit Health Vitals

**Actor**: Patient  
**Priority**: High  
**Preconditions**: Patient dashboard accessible

**Flow**:
1. Patient navigates to "Vitals" section
2. Enters today's measurements:
   - Weight (optional)
   - Blood pressure: Systolic & Diastolic
   - Heart rate (from Fitbit if connected)
3. Reviews entered data
4. Submits for storage
5. Views historical trend

**Alternative Flows**:
- Fitbit connected: Auto-populate activity data
- Validation error: Show helpful error message
- Missing data: Accept partial submissions

---

### UC-P5: Connect Wearable Device (Fitbit)

**Actor**: Patient  
**Priority**: High  
**Preconditions**: Patient has Fitbit account

**Flow**:
1. Patient navigates to "Connected Devices"
2. Clicks "Connect Fitbit"
3. Redirected to Fitbit OAuth
4. Authorizes RehaAdvisor access
5. Returns to app with permissions granted
6. System begins syncing Fitbit data:
   - Steps
   - Active minutes
   - Heart rate zones
   - Sleep duration
   - Distance traveled

**Alternative Flows**:
- Authorization fails: Show error and retry option
- Sync error: Queue for retry
- Patient disconnects: Stop syncing, archive historical data

---

### UC-P6: Track Adherence & Progress

**Actor**: Patient  
**Priority**: High  
**Preconditions**: Interventions executed, data recorded

**Flow**:
1. Patient opens "My Progress" dashboard
2. Sees adherence metrics:
   - Completion rate (%)
   - Sessions this week/month
   - Trend vs. previous period
3. Views health metrics:
   - Activity levels
   - Sleep patterns
   - Weight trend
   - Blood pressure trend
4. Shares data with therapist via export

**Alternative Flows**:
- No data yet: Show informational message
- Export fails: Retry or email option

---

### UC-P7: Provide Feedback on Intervention

**Actor**: Patient  
**Priority**: Medium  
**Preconditions**: Intervention completed

**Flow**:
1. After session completion, patient sees feedback form
2. Rates intervention (1-5 stars)
3. Selects descriptor words:
   - Positive: Motivating, Energizing, Refreshing, etc.
   - Negative: Exhausting, Difficult, etc.
4. Optional: Provides text feedback
5. Records audio/video response (optional)
6. Submits feedback
7. Therapist notified of feedback

**Alternative Flows**:
- Skip feedback: Allowed but encouraged
- Audio recording permission denied: Text-only mode
- Server error: Queue feedback locally

---

### UC-P8: View Questionnaire Results

**Actor**: Patient  
**Priority**: Medium  
**Preconditions**: Questionnaires assigned and completed

**Flow**:
1. Patient navigates to "Questionnaires"
2. Views assigned questionnaires
3. Opens completed questionnaire
4. Reviews personal responses
5. Views score/results
6. Compares with previous results (trend)
7. Sees therapist interpretation (if provided)

**Alternative Flows**:
- No questionnaires: Show "no assessments yet"
- First completion: No trend available

---

### UC-P9: Receive and View Recommendations

**Actor**: Patient  
**Priority**: Medium  
**Preconditions**: Initial assessment completed

**Flow**:
1. Patient logs in
2. Views "Personalized Recommendations" section
3. Sees recommended interventions for:
   - Current diagnosis
   - Health status
   - Progress level
   - Preferences
4. Sees rationale for each recommendation
5. Can mark as interested/not interested
6. Therapist notified of preferences

**Alternative Flows**:
- New recommendations generated: Notification sent
- No recommendations: Placeholder shown

---

### UC-P10: Schedule or Reschedule Sessions

**Actor**: Patient  
**Priority**: Low  
**Preconditions**: Intervention assigned, scheduling allowed by therapist

**Flow**:
1. Patient views intervention schedule
2. Clicks "Reschedule Session"
3. Selects new date/time from available slots
4. Submits reschedule request
5. Therapist receives notification
6. Therapist approves/denies
7. Patient notified of outcome

**Alternative Flows**:
- No available slots: Show waiting list option
- Therapist denies: Show reason
- Maximum reschedules reached: Block rescheduling

---

## Therapist Use Cases

### UC-T1: Therapist Registration & Approval

**Actor**: Therapist  
**Priority**: Critical  
**Preconditions**: None

**Flow**:
1. Therapist navigates to registration
2. Enters credentials:
   - Name, email, phone
   - License number
   - Specialization
   - Associated clinics
3. Submits registration
4. Admin reviews and approves
5. Therapist receives approval email
6. Can now log in and manage patients

**Alternative Flows**:
- License verification fails: Request additional info
- Admin rejects: Therapist notified with reason

---

### UC-T2: Create and Manage Patient List

**Actor**: Therapist  
**Priority**: Critical  
**Preconditions**: Therapist account approved

**Flow**:
1. Therapist accesses "Patients" dashboard
2. Views all assigned patients with status:
   - Active, Discharged, On leave
3. Searches/filters by:
   - Name, ID, diagnosis
   - Status, last login
   - Adherence rate
4. Clicks on patient to view detail
5. Can add notes, update status
6. Can discharge patient

**Alternative Flows**:
- Filter returns no results: Show "no patients" message
- Patient blocked contact: Show restricted access

---

### UC-T3: Create Intervention

**Actor**: Therapist  
**Priority**: Critical  
**Preconditions**: Patient assigned

**Flow**:
1. Therapist clicks "Create New Intervention"
2. Fills in intervention details:
   - Title, Description
   - Content type (video, image, exercise, article, etc.)
   - Specialization (Cardiology, PT, OT, etc.)
   - Patient type (Pediatrics, Geriatric, etc.)
   - Duration (minutes)
   - Frequency (daily, weekly, biweekly, etc.)
3. Uploads media content (video, images, PDF)
4. Adds personal instructions for patient
5. Marks as Core (essential) or Supportive (optional)
6. Saves as draft or publishes
7. Can add to therapy templates

**Alternative Flows**:
- File upload fails: Retry or skip media
- Content too large: Compress or reject
- Duplicate found: Offer to use existing

---

### UC-T4: Assign Intervention to Patient

**Actor**: Therapist  
**Priority**: Critical  
**Preconditions**: Intervention created, patient selected

**Flow**:
1. Therapist opens patient profile
2. Clicks "Assign Intervention"
3. Searches available interventions by:
   - Name, diagnosis, benefit
   - Specialization, tags
   - Patient type
4. Selects intervention
5. Sets schedule:
   - Start date
   - Duration (e.g., 4 weeks)
   - Frequency (daily, 3x/week, etc.)
   - Specific days/times
6. Adds personal notes for patient
7. Sets optional video feedback request
8. Submits assignment
9. Patient receives notification

**Alternative Flows**:
- Schedule conflict: Show warning
- Patient unavailable: Defer assignment
- Auto-schedule: Use default times

---

### UC-T5: Monitor Patient Adherence

**Actor**: Therapist  
**Priority**: Critical  
**Preconditions**: Interventions assigned

**Flow**:
1. Therapist opens "Adherence Dashboard"
2. Views metrics:
   - Completion rate (%)
   - Sessions completed vs. missed
   - Trend (improving/declining)
   - Compared to benchmarks
3. Filters by:
   - Patient
   - Intervention type
   - Date range
4. Clicks on patient to see details
5. Views individual session data
6. Can message patient about missed sessions
7. Can adjust plan if needed

**Alternative Flows**:
- No data yet: Show "waiting for data" message
- Low adherence: Show suggested interventions

---

### UC-T6: Review Patient Feedback

**Actor**: Therapist  
**Priority**: High  
**Preconditions**: Patient completed interventions and provided feedback

**Flow**:
1. Therapist opens "Patient Feedback" section
2. Views feedback summary:
   - Average rating (1-5 stars)
   - Common descriptor words
   - Sentiment trend
3. Filters by:
   - Patient, intervention type
   - Rating level, date range
4. Views individual feedback:
   - Patient's text comments
   - Video/audio recordings
   - Timestamp
5. Can reply to feedback
6. Can adjust intervention based on feedback

**Alternative Flows**:
- No feedback yet: Show placeholder
- Video playback fails: Show transcript instead

---

### UC-T7: Apply Treatment Template

**Actor**: Therapist  
**Priority**: High  
**Preconditions**: Template created, patient selected

**Flow**:
1. Therapist selects patient
2. Clicks "Apply Template"
3. Selects from saved templates
   - Cardiology Recovery (4-week)
   - Post-Surgery PT (6-week)
   - etc.
4. Reviews template schedule
5. Can modify:
   - Specific dates
   - Frequencies
   - Interventions
6. Sets start date
7. Applies template
8. Multiple interventions assigned at once
9. Patient receives assignments

**Alternative Flows**:
- Template outdated: Offer to update
- Scheduling conflict: Show conflicts and allow override

---

### UC-T8: Generate Patient Report

**Actor**: Therapist  
**Priority**: High  
**Preconditions**: Patient has completed sessions and data

**Flow**:
1. Therapist selects patient
2. Clicks "Generate Report"
3. Selects report type:
   - Progress Summary
   - Adherence Report
   - Health Metrics Summary
   - Clinical Assessment
4. Selects date range
5. Chooses sections to include
6. Generates PDF/Excel
7. Can email to patient, admin, or download
8. Report includes:
   - Completion rates
   - Health trends
   - Feedback summary
   - Therapist observations

**Alternative Flows**:
- No data available: Show limited report
- Large dataset: Warn about generation time

---

### UC-T9: Manage Treatment Plan

**Actor**: Therapist  
**Priority**: High  
**Preconditions**: Patient assigned

**Flow**:
1. Therapist opens patient profile
2. Views current treatment plan:
   - Active interventions
   - Schedule
   - Duration
   - Progress
3. Can:
   - Add interventions
   - Remove interventions
   - Modify schedules
   - Change frequencies
   - Extend/shorten duration
4. Notes changes with reason
5. Notifies patient of changes
6. Archives old plan

**Alternative Flows**:
- Major changes: Requires approval/confirmation
- Patient objects: Therapist can override with note

---

### UC-T10: Discharge Patient

**Actor**: Therapist  
**Priority**: Medium  
**Preconditions**: Patient reached end of therapy

**Flow**:
1. Therapist opens patient profile
2. Clicks "Discharge Patient"
3. Enters discharge details:
   - Discharge reason (completed, transferred, etc.)
   - Final assessment
   - Recommendations for continued care
4. Archives interventions
5. Generates discharge summary
6. Patient receives notification
7. Patient marked as "Discharged"
8. Historical data retained

**Alternative Flows**:
- Patient objects: Can reactivate
- New therapist: Can transfer patient

---

## Researcher Use Cases

### UC-R1: Access Anonymized Dataset

**Actor**: Researcher  
**Priority**: Critical  
**Preconditions**: Researcher account approved, consent obtained

**Flow**:
1. Researcher logs into research portal
2. Browses available datasets:
   - Anonymized patient cohorts
   - Intervention effectiveness studies
   - Health outcome metrics
3. Selects dataset
4. Views dataset information:
   - Size (patient count)
   - Conditions covered
   - Data completeness
   - Date range
   - Last updated
5. Downloads dataset (CSV/JSON)
6. Accesses via API for live analysis
7. Cites dataset in research

**Alternative Flows**:
- Dataset restricted: Request access approval
- Commercial use: Require licensing

---

### UC-R2: Query Health Metrics

**Actor**: Researcher  
**Priority**: High  
**Preconditions**: Dataset access granted

**Flow**:
1. Researcher uses query builder or API
2. Specifies query:
   - Date range
   - Patient cohort (diagnosis, age, etc.)
   - Metrics (steps, sleep, BP, weight, etc.)
   - Aggregation (daily, weekly, monthly)
3. Executes query
4. Receives results with:
   - Raw data points
   - Statistics (mean, std dev, etc.)
   - Visualizations
5. Can export results
6. Caches frequent queries

**Alternative Flows**:
- Query timeout: Offer as batch job
- Large dataset: Stream results

---

### UC-R3: Analyze Intervention Effectiveness

**Actor**: Researcher  
**Priority**: High  
**Preconditions**: Intervention data available

**Flow**:
1. Researcher selects intervention type
2. Specifies analysis parameters:
   - Patient cohorts
   - Duration (weeks)
   - Outcome measures
3. System generates:
   - Completion rates
   - Adherence metrics
   - Health outcome changes
   - Patient satisfaction scores
   - Correlation analysis
4. Compares with control groups
5. Calculates effect sizes
6. Generates statistical report
7. Visualizes findings

**Alternative Flows**:
- Insufficient data: Show data availability gaps
- Confounding variables: Suggest stratified analysis

---

### UC-R4: Generate Research Report

**Actor**: Researcher  
**Priority**: High  
**Preconditions**: Analysis completed

**Flow**:
1. Researcher builds custom report:
   - Title, abstract
   - Methods (data sources, cohorts)
   - Results (charts, tables)
   - Conclusions
   - Limitations
2. Includes proper citations/attribution
3. Formats according to journal guidelines
4. Exports to PDF/DOCX
5. Includes data appendix
6. Can be shared with collaborators

**Alternative Flows**:
- Pre-built templates: Use for quick reports
- Collaboration: Real-time editing with team

---

### UC-R5: View Real-time Analytics Dashboard

**Actor**: Researcher  
**Priority**: Medium  
**Preconditions**: Researcher role assigned

**Flow**:
1. Researcher opens analytics dashboard
2. Sees platform-wide metrics:
   - Active patients/therapists
   - Interventions deployed
   - Completion rates
   - Health trends
   - Usage patterns
3. Drills down into specific cohorts
4. Compares time periods
5. Exports visualizations
6. Shares with research team

**Alternative Flows**:
- No data yet: Show historical data or projections
- Real-time latency: Show cache timestamp

---

## Administrator Use Cases

### UC-A1: User Management

**Actor**: Administrator  
**Priority**: Critical  
**Preconditions**: Admin account exists

**Flow**:
1. Admin opens "User Management" dashboard
2. Views all users with:
   - Name, email, role
   - Status (active, pending, inactive)
   - Registration date
   - Last login
3. Can:
   - Search/filter users
   - Approve pending registrations
   - Suspend/activate accounts
   - Reset passwords
   - Change user roles
   - View user activity log
4. Actions logged for audit

**Alternative Flows**:
- User objects to suspension: Admin can review
- Bulk operations: Admin can process multiple users

---

### UC-A2: Manage Interventions Library

**Actor**: Administrator  
**Priority**: High  
**Preconditions**: Admin account exists

**Flow**:
1. Admin opens "Interventions Library"
2. Views all created interventions:
   - Name, creator, type
   - Status (draft, published, archived)
   - Usage count
   - Last modified
3. Can:
   - Preview interventions
   - Approve for publication
   - Archive interventions
   - Flag quality issues
   - Bulk actions (tag, archive)
4. Views statistics:
   - Most used interventions
   - Creator performance
   - Flagged for review

**Alternative Flows**:
- Review required: Queue for approval
- Quality issues: Mark for creator update

---

### UC-A3: Configure System Settings

**Actor**: Administrator  
**Priority**: High  
**Preconditions**: Admin account exists

**Flow**:
1. Admin opens "System Configuration"
2. Can configure:
   - Platform settings (name, logo, domain)
   - User registration rules
   - Password policies
   - Email templates
   - API rate limits
   - Data retention policies
   - Notification rules
   - Integrations (Fitbit, email, SMS)
3. Changes take effect immediately
4. Maintains configuration history

**Alternative Flows**:
- Breaking change: Warn admin with impact analysis
- Rollback available: Allow revert to previous config

---

### UC-A4: Monitor System Health

**Actor**: Administrator  
**Priority**: High  
**Preconditions**: Admin account exists

**Flow**:
1. Admin opens "System Dashboard"
2. Monitors:
   - API response times
   - Database performance
   - Error rates
   - User sessions
   - Active therapists/patients
   - Data sync status
3. Views alerts/warnings:
   - Performance degradation
   - Service errors
   - Failed jobs
4. Can restart services
5. Views system logs

**Alternative Flows**:
- Critical issue: Alert triggered to admin via email/SMS
- Planned maintenance: Schedule downtime

---

### UC-A5: Generate Administrative Reports

**Actor**: Administrator  
**Priority**: Medium  
**Preconditions**: System data available

**Flow**:
1. Admin clicks "Generate Report"
2. Selects report type:
   - Platform Usage (DAU, MAU)
   - User Demographics
   - Intervention Statistics
   - Financial/Billing (if applicable)
   - Compliance Audit
3. Selects date range
4. Generates PDF/Excel report
5. Can schedule recurring reports
6. Exports to email/storage

**Alternative Flows**:
- Custom report: Allow query builder
- Large dataset: Generate as background job

---

### UC-A6: Manage Clinics & Sites

**Actor**: Administrator  
**Priority**: Medium  
**Preconditions**: Multi-clinic setup

**Flow**:
1. Admin opens "Clinic Management"
2. Views all clinics with:
   - Name, location, contact
   - Therapist count
   - Patient count
   - Active interventions
3. Can:
   - Add new clinic
   - Edit clinic details
   - Assign therapists to clinics
   - View clinic-specific analytics
4. Restricts data access per clinic (if configured)

**Alternative Flows**:
- Single clinic: Simplified view
- Clinic merge: Admin can consolidate data

---

## System Use Cases

### UC-S1: Health Data Synchronization

**Actor**: System  
**Priority**: Critical  
**Preconditions**: Fitbit connected

**Flow**:
1. System detects Fitbit connection
2. Fetches recent data:
   - Steps, distance, active minutes
   - Heart rate, zones
   - Sleep duration
3. Validates data:
   - Checks for outliers
   - Fills gaps if needed
4. Stores in database with timestamp
5. Triggers dashboard update
6. Notifies therapist if thresholds exceeded

**Alternative Flows**:
- Connection lost: Retry with exponential backoff
- Data gap: Fetch historical data to fill gaps
- Invalid data: Log error and skip

---

### UC-S2: Send Notifications

**Actor**: System  
**Priority**: High  
**Preconditions**: User has opted in

**Flow**:
1. System generates notification trigger:
   - New intervention assigned
   - Session reminder
   - Missed session follow-up
   - Feedback received
   - Data milestone reached
2. Formats notification for channel:
   - In-app notification
   - Email
   - SMS (if available)
3. Respects user preferences:
   - Quiet hours
   - Frequency limits
   - Channel preferences
4. Sends notification
5. Logs delivery status

**Alternative Flows**:
- User unsubscribed: Skip notification
- Contact info invalid: Log error

---

### UC-S3: Generate Recommendations

**Actor**: System  
**Priority**: Medium  
**Preconditions**: Patient data available

**Flow**:
1. System analyzes patient:
   - Diagnosis, health status
   - Previous interventions
   - Adherence patterns
   - Health trends
   - Feedback history
2. Queries intervention library
3. Ranks interventions by relevance:
   - Condition match
   - Evidence base
   - Patient preference
   - Difficulty appropriate
4. Generates recommendations
5. Presents to therapist for approval
6. Notifies patient of recommendations

**Alternative Flows**:
- Insufficient data: Defer recommendations
- Custom criteria: Use therapist preferences

---

### UC-S4: Backup & Recovery

**Actor**: System  
**Priority**: Critical  
**Preconditions**: Scheduled backup time

**Flow**:
1. System initiates backup process
2. Exports all data:
   - Database content
   - User uploads
   - Configuration
3. Encrypts backup
4. Stores in redundant locations
5. Verifies backup integrity
6. Maintains backup history
7. Tests recovery procedure

**Alternative Flows**:
- Backup fails: Alert admin and retry
- Storage full: Archive old backups
- Recovery needed: Restore from latest backup

---

### UC-S5: Generate De-identified Dataset for Research

**Actor**: System  
**Priority**: High  
**Preconditions**: Consent obtained from patients

**Flow**:
1. System extracts data:
   - Patient demographics
   - Health metrics
   - Intervention compliance
   - Outcomes
2. De-identifies:
   - Removes names, IDs
   - Generalizes dates
   - Randomizes cohort order
3. Validates de-identification:
   - Re-identification risk <5%
4. Aggregates to cohort level
5. Packages for research delivery
6. Logs access and usage

**Alternative Flows**:
- Data contains PHI: Reject and log error
- Research protocol changed: Require re-consent

---

## Cross-Functional Use Cases

### UC-X1: Data Export & Integration

**Actor**: Multiple  
**Priority**: Medium  
**Preconditions**: User authorization

**Flow**:
1. User clicks "Export" on data section
2. Selects export format:
   - CSV, Excel, PDF, JSON
3. Selects date range and fields
4. System generates export
5. User downloads or emails
6. Integration ready for EHR/practice management

**Alternative Flows**:
- Large dataset: Batch process with email delivery
- Streaming API: Real-time data pull for integrations

---

## Use Case Summary Matrix

| UC ID | Title | Actor | Priority | Status |
|-------|-------|-------|----------|--------|
| UC-P1 | Registration & Onboarding | Patient | Critical | Implemented |
| UC-P2 | View Assigned Interventions | Patient | Critical | Implemented |
| UC-P3 | Execute Intervention | Patient | Critical | Implemented |
| UC-P4 | Submit Health Vitals | Patient | High | Implemented |
| UC-P5 | Connect Wearable Device | Patient | High | Implemented |
| UC-P6 | Track Adherence & Progress | Patient | High | Implemented |
| UC-P7 | Provide Feedback | Patient | Medium | Implemented |
| UC-P8 | View Questionnaire Results | Patient | Medium | Implemented |
| UC-P9 | Receive Recommendations | Patient | Medium | Implemented |
| UC-P10 | Schedule/Reschedule Sessions | Patient | Low | Planned |
| UC-T1 | Therapist Registration | Therapist | Critical | Implemented |
| UC-T2 | Manage Patient List | Therapist | Critical | Implemented |
| UC-T3 | Create Intervention | Therapist | Critical | Implemented |
| UC-T4 | Assign Intervention | Therapist | Critical | Implemented |
| UC-T5 | Monitor Adherence | Therapist | Critical | Implemented |
| UC-T6 | Review Patient Feedback | Therapist | High | Implemented |
| UC-T7 | Apply Template | Therapist | High | Implemented |
| UC-T8 | Generate Report | Therapist | High | Implemented |
| UC-T9 | Manage Treatment Plan | Therapist | High | Implemented |
| UC-T10 | Discharge Patient | Therapist | Medium | Implemented |
| UC-R1 | Access Dataset | Researcher | Critical | Implemented |
| UC-R2 | Query Health Metrics | Researcher | High | Implemented |
| UC-R3 | Analyze Effectiveness | Researcher | High | Implemented |
| UC-R4 | Generate Report | Researcher | High | Implemented |
| UC-R5 | View Analytics | Researcher | Medium | Implemented |
| UC-A1 | User Management | Admin | Critical | Implemented |
| UC-A2 | Manage Interventions | Admin | High | Implemented |
| UC-A3 | Configure Settings | Admin | High | Implemented |
| UC-A4 | Monitor Health | Admin | High | Implemented |
| UC-A5 | Generate Reports | Admin | Medium | Implemented |
| UC-A6 | Manage Clinics | Admin | Medium | Planned |
| UC-S1 | Data Synchronization | System | Critical | Implemented |
| UC-S2 | Send Notifications | System | High | Implemented |
| UC-S3 | Generate Recommendations | System | Medium | Implemented |
| UC-S4 | Backup & Recovery | System | Critical | Implemented |
| UC-S5 | De-identify Dataset | System | High | Implemented |
| UC-X1 | Data Export & Integration | Multiple | Medium | Implemented |

---

*Last Updated: February 17, 2026*
