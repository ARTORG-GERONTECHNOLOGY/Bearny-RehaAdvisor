# RehaAdvisor - User Roles & Workflows

## Overview

This document describes the roles of different users in RehaAdvisor and their key workflows.

---

## Table of Contents

1. [User Roles Overview](#user-roles-overview)
2. [Patient Role](#patient-role)
3. [Therapist Role](#therapist-role)
4. [Researcher Role](#researcher-role)
5. [Administrator Role](#administrator-role)
6. [Cross-Functional Workflows](#cross-functional-workflows)

---

## User Roles Overview

| Role | Purpose | Primary Users | Key Responsibilities |
|------|---------|----------------|----------------------|
| **Patient** | Execute rehab exercises, track health | Individuals in rehabilitation | Follow treatment plan, perform exercises, report health metrics |
| **Therapist** | Design and manage patient care | PT, OT, Speech, Psychology therapists | Create interventions, assign treatments, monitor progress |
| **Researcher** | Analyze outcomes, improve evidence base | Clinical researchers, epidemiologists | Access de-identified data, run analyses, publish findings |
| **Administrator** | Maintain platform operations | IT staff, platform managers | User management, system configuration, compliance |

---

## Patient Role

### Role Definition

**Patient** users are individuals receiving rehabilitation services through the RehaAdvisor platform. They execute exercises/interventions assigned by their therapist and provide health data to track progress.

### Access Level

- **Dashboard**: Personal dashboard only
- **Data Visibility**: Own health data, own interventions
- **Data Modification**: Can record vitals, provide feedback
- **Cannot Access**: Other patients' data, therapist management interface, administrator tools

### Key Workflows

#### Workflow P-1: Daily Exercise Routine

```
Morning → Check Dashboard
  ↓
View Today's Interventions
  ↓
Execute First Exercise
  ├─ Read instructions
  ├─ Watch video if available
  ├─ Perform exercise
  └─ Record completion
  ↓
Enter Vitals (if scheduled)
  ├─ Blood pressure
  ├─ Weight
  └─ Any observations
  ↓
Submit Feedback (optional)
  ├─ Rate intervention (1-5)
  ├─ Select descriptors
  └─ Add comments
  ↓
Repeat for other interventions
  ↓
View Progress Dashboard
```

#### Workflow P-2: Connect Fitbit & Track Activity

```
Initial Setup
  ↓
Patient → Profile → Connected Devices
  ↓
Click "Connect Fitbit"
  ↓
OAuth Authorization (Fitbit)
  ├─ User logs to Fitbit
  ├─ Grants RehaAdvisor access
  └─ Returns with token
  ↓
Daily Auto-Sync
  ├─ Fetch steps, activity, sleep
  ├─ Store in RehaAdvisor
  └─ Update dashboards
  ↓
Patient Views Activity
  ├─ Steps today/week/month
  ├─ Activity zones
  └─ Sleep summary
  ↓
Compare to Goals
  ├─ On-track indicator
  ├─ Recommendations
  └─ Notifications if below goal
```

#### Workflow P-3: Provide Weekly Feedback

```
Therapist Requests Feedback
  ↓
Patient Receives Notification
  ↓
Patient Opens Feedback Form
  ├─ Select intervention
  ├─ Rate (1-5 stars)
  ├─ Select descriptors
  └─ Optional: video feedback
  ↓
Patient Submits
  ↓
Therapist Receives & Reviews
  ↓
Therapist Adjusts Plan if Needed
```

#### Workflow P-4: View Progress Report

```
Patient → My Progress
  ↓
Select Timeframe (Week/Month)
  ↓
View Adherence
  ├─ Sessions completed
  ├─ Compliance rate (%)
  └─ Trend
  ↓
View Health Metrics
  ├─ Weight trend
  ├─ BP trend
  ├─ Activity level
  └─ Comparisons
  ↓
Share Report
  ├─ Email to therapist
  ├─ Download PDF
  └─ Export CSV
```

### Permissions

| Resource | Read | Create | Update | Delete |
|----------|------|--------|--------|--------|
| Own Profile | ✓ | - | ✓ | - |
| Own Interventions | ✓ | - | - | - |
| Own Health Data | ✓ | ✓ | ✓ | - |
| Own Feedback | ✓ | ✓ | - | - |
| Therapist Messages | ✓ | ✓ | - | - |
| Other Patients' Data | ✗ | - | - | - |

---

## Therapist Role

### Role Definition

**Therapist** users design, deliver, and manage rehabilitation treatment plans for patients. They create interventions, assign them to patients, monitor adherence, and adjust treatment based on patient progress.

### Access Level

- **Dashboard**: Own patient list + analytics
- **Data Visibility**: Assigned patients' data only
- **Data Modification**: Create/modify interventions, assign treatments, update patient status
- **Cannot Access**: Other therapists' patients, administrator tools, research data

### Key Workflows

#### Workflow T-1: Onboard New Patient

```
Patient Registration Complete
  ↓
Therapist Receives Notification
  ↓
Therapist → Patients → Add Patient
  ├─ Review patient info
  ├─ Review health history
  ├─ Assess initial status
  └─ Add notes
  ↓
Create Initial Assessment
  ├─ Evaluate functional status
  ├─ Identify goals
  ├─ Document restrictions
  └─ Set milestones
  ↓
Design Treatment Plan
  ├─ Select appropriate interventions
  ├─ Set sequence
  ├─ Define schedule
  └─ Explain plan to patient
  ↓
Assign Initial Interventions
  ├─ Send assignment notification
  ├─ Include instructions
  └─ Set expectations
  ↓
Schedule First Session (if telehealth)
  ↓
Patient Begins Treatment
```

#### Workflow T-2: Create Custom Intervention

```
Therapist → Interventions → Create New
  ↓
Fill in Details
  ├─ Title: "Shoulder Rotations - PT"
  ├─ Description: Detailed instructions
  ├─ Type: Exercise video
  ├─ Specialty: Physical Therapy
  ├─ Patient type: Geriatric
  └─ Duration: 15 minutes
  ↓
Upload Media
  ├─ Video of exercise demonstration
  ├─ Images of proper form
  └─ Safety precautions PDF
  ↓
Add Personal Instructions
  ├─ "Do 2 sets of 10"
  ├─ "Stop if any sharp pain"
  └─ "Do daily in the morning"
  ↓
Configure Tags & Benefits
  ├─ Tags: shoulder, mobility, range-of-motion
  ├─ Benefits: Increased flexibility, Pain reduction
  └─ Difficulty: Easy
  ↓
Preview & Save
  ├─ Save as draft if needed
  └─ Publish when ready
  ↓
Make Available for Future Use
  ├─ Add to library
  ├─ Share with team
  └─ Use as template
```

#### Workflow T-3: Monitor Patient Adherence

```
Therapist → Adherence Dashboard
  ↓
View Summary Metrics
  ├─ Average patient adherence: 85%
  ├─ Trend: Improving
  └─ At-risk patients: 2
  ↓
Filter by At-Risk Patients
  ├─ John D.: 60% adherence (declining)
  └─ Mary S.: 70% adherence (stalled)
  ↓
Click on Patient (John D.)
  ├─ View sessions: 3/5 completed this week
  ├─ Missed sessions: Yesterday, 2 days ago
  ├─ Trend: Was doing better, declining
  └─ Last health data: 2 days ago
  ↓
Therapist Actions
  ├─ Send message: "How are you doing?"
  ├─ Ask about barriers
  ├─ Adjust plan if needed
  └─ Schedule check-in call
  ↓
Follow-up
  ├─ Monitor next week
  ├─ Celebrate if improving
  └─ Consider discharge/change if not improving
```

#### Workflow T-4: Review Patient Feedback & Adjust

```
Therapist → Patient (John)
  ↓
View Feedback
  ├─ Exercise A: 5 stars, "Great! Felt energized"
  ├─ Exercise B: 2 stars, "Too hard, caused pain"
  ├─ Exercise C: 4 stars, "Good, a bit challenging"
  └─ Video feedback: Shows difficulty with form
  ↓
Analyze Patterns
  ├─ Struggling with hip movements
  ├─ Complaining about difficulty
  ├─ Form issues visible in video
  └─ Positive response to simpler exercises
  ↓
Make Adjustments
  ├─ Replace Exercise B with easier version
  ├─ Add video coaching for hip movements
  ├─ Increase Exercise A frequency
  └─ Document changes
  ↓
Communicate with Patient
  ├─ Send message explaining changes
  ├─ Provide encouragement
  └─ New assignments sent
  ↓
Monitor Response
  ├─ Check feedback next week
  ├─ Verify adherence
  └─ Continue adjusting as needed
```

#### Workflow T-5: Generate Monthly Progress Report

```
Therapist → Reports
  ↓
Select Patient (Jane)
  ↓
Choose Report Type
  ├─ Progress Summary
  └─ Date Range: Last 30 days
  ↓
System Generates
  ├─ Completion rate: 92%
  ├─ Health metrics: Weight -2kg, BP improved
  ├─ Feedback sentiment: Positive
  ├─ Achievements: 2 milestones reached
  ├─ Therapist observations: Patient very engaged
  └─ Recommendations: Increase difficulty
  ↓
Therapist Reviews & Adds Notes
  ├─ "Excellent progress this month"
  ├─ "Patient ready for advanced exercises"
  └─ "Plan to reassess and increase challenge"
  ↓
Send to Patient
  ├─ Email copy
  ├─ Patient can view in app
  └─ Patient can download PDF
  ↓
Archive for Records
```

#### Workflow T-6: Discharge Patient

```
Patient Reaches End of Treatment
  ↓
Therapist → Patient Profile → Discharge
  ↓
Complete Discharge Assessment
  ├─ Goals achieved: 8/10 completed
  ├─ Final functional status: 90% improvement
  ├─ Remaining issues: Minor pain in right knee
  └─ Follow-up plan: Recommend home exercise program
  ↓
Create Discharge Summary
  ├─ Treatment summary
  ├─ Key achievements
  ├─ Ongoing recommendations
  ├─ Emergency contact info
  └─ Referrals if needed
  ↓
Notify Patient
  ├─ Discharge letter sent
  ├─ Discharge summary provided
  ├─ Recommendations emailed
  └─ Follow-up contact info given
  ↓
Archive Patient Record
  ├─ Status changed to "Discharged"
  ├─ Historical data preserved
  └─ Still accessible for reference
  ↓
Therapist Can:
  ├─ Reactivate if patient returns
  ├─ Share patient data with other therapists
  └─ Use de-identified data for research
```

### Permissions

| Resource | Read | Create | Update | Delete |
|----------|------|--------|--------|--------|
| Own Patients | ✓ | ✓ | ✓ | - |
| Assigned Patients' Data | ✓ | ✓ | ✓ | - |
| Own Interventions | ✓ | ✓ | ✓ | ✓ |
| Published Interventions | ✓ | - | - | - |
| Other Therapists' Interventions | ✓ | - | - | - |
| Own Reports | ✓ | ✓ | ✓ | - |
| Other Patients' Data | ✗ | - | - | - |
| System Configuration | ✗ | - | - | - |

---

## Researcher Role

### Role Definition

**Researcher** users access de-identified patient data to analyze intervention effectiveness, health outcomes, and population trends. They support evidence-based improvements to the platform.

### Access Level

- **Dashboard**: Analytics dashboards only
- **Data Visibility**: De-identified aggregate data only
- **Data Modification**: Cannot modify any patient or clinical data
- **Cannot Access**: Identifying patient information, therapist interfaces, administrator tools

### Key Workflows

#### Workflow R-1: Analyze Intervention Effectiveness

```
Researcher → Data Browser
  ↓
Select Dataset: "Cardiology Interventions Q4 2025"
  ├─ 156 patients, 2,340 sessions
  ├─ Data complete 99%
  └─ Last updated: 2025-12-31
  ↓
Create Query
  ├─ Intervention: "Cardiac Walking Program"
  ├─ Cohort: Age 65-85
  ├─ Duration: 12 weeks
  ├─ Outcomes: BP, HR, adherence
  └─ Status: Completed
  ↓
Execute Query
  ├─ Returns: 42 patient records (de-identified)
  ├─ 525 sessions total
  └─ Mean adherence: 87%
  ↓
Statistical Analysis
  ├─ Before/after comparison
  ├─ t-test: p < 0.01 (significant)
  ├─ Effect size: 0.65 (medium)
  ├─ Mean BP reduction: 12 mmHg
  └─ Mean HR reduction: 8 bpm
  ↓
Create Visualizations
  ├─ Before/after BP chart
  ├─ Adherence distribution
  ├─ Outcome by age group
  └─ Trend over 12 weeks
  ↓
Generate Report
  ├─ Title: "Effectiveness of Cardiac Walking Program in Older Adults"
  ├─ Methods section
  ├─ Results with charts/tables
  ├─ Discussion
  ├─ Limitations
  └─ Recommendations
  ↓
Export & Publish
  ├─ PDF for journal submission
  ├─ Data appendix (anonymized)
  ├─ Share with research team
  └─ Cite dataset in publication
```

#### Workflow R-2: Track Health Outcome Trends

```
Researcher → Analytics Dashboard
  ↓
Monitor Population Health
  ├─ Total active patients: 1,240
  ├─ Average intervention adherence: 81%
  ├─ Mean weight change: -2.3 kg
  ├─ Mean BP change: -8/-5 mmHg
  └─ Patient satisfaction: 4.2/5 stars
  ↓
Segment Analysis
  ├─ Group by diagnosis:
  ├─ Cardiology (340 patients): Good outcomes
  ├─ PT (420 patients): Excellent outcomes
  ├─ Geriatric (480 patients): Moderate outcomes
  └─ Identify best performers
  ↓
Drill Down (Geriatric patients)
  ├─ Average age: 76 years
  ├─ Adherence: 78% (vs. 81% overall)
  ├─ Outcomes: -1.8 kg, -5/-3 mmHg
  ├─ Compare to other groups: Lower performance
  └─ Hypothesis: May need simpler interventions
  ↓
Generate Insights
  ├─ Identify why geriatric patients have lower outcomes
  ├─ Compare interventions used
  ├─ Compare therapist approaches
  ├─ Make recommendations for improvement
  └─ Share findings with platform team
  ↓
Follow-up Study
  ├─ Design experiment to test hypothesis
  ├─ Randomize geriatric patients to 2 groups
  ├─ Group A: Traditional interventions (control)
  ├─ Group B: Simplified interventions (treatment)
  ├─ Monitor outcomes over 3 months
  └─ Analyze and publish results
```

#### Workflow R-3: Publish Research Finding

```
Researcher → Dashboard → My Reports
  ↓
Open Completed Analysis
  ├─ Title: "Exercise Adherence Predictors in Tele-Rehabilitation"
  ├─ Cohort: 850 patients, 6 months data
  ├─ Key finding: Age, social support predict adherence
  ├─ Implications: Platform design recommendations
  └─ Status: Ready for publication
  ↓
Prepare Manuscript
  ├─ Write introduction
  ├─ Include methods from RehaAdvisor
  ├─ Add results (charts/tables)
  ├─ Discuss implications
  ├─ Acknowledge RehaAdvisor platform
  └─ Add data availability statement
  ↓
Submit to Journal
  ├─ Include disclaimer about de-identification
  ├─ Attach supplementary materials
  ├─ Data appendix (aggregate statistics only)
  └─ No identifying information shared
  ↓
Publication Accepted
  ├─ Cite RehaAdvisor platform
  ├─ Share published article
  ├─ Highlight in platform news
  └─ Research contributes to evidence base
```

### Permissions

| Resource | Read | Create | Update | Delete |
|----------|------|--------|--------|--------|
| De-identified Data | ✓ | - | - | - |
| Own Queries | ✓ | ✓ | ✓ | ✓ |
| Own Reports | ✓ | ✓ | ✓ | - |
| Own Dashboards | ✓ | ✓ | ✓ | ✓ |
| Shared Team Resources | ✓ | - | - | - |
| Patient Identifiers | ✗ | - | - | - |
| Therapist Data | ✗ | - | - | - |
| System Configuration | ✗ | - | - | - |

---

## Administrator Role

### Role Definition

**Administrator** users maintain platform operations, manage users, configure system settings, and ensure compliance with regulations and policies.

### Access Level

- **Dashboard**: Full platform access
- **Data Visibility**: All data for compliance/audit purposes
- **Data Modification**: Can modify any platform data
- **Special Access**: System configuration, user management, audit logs

### Key Workflows

#### Workflow A-1: Onboard New Therapist

```
Therapist Submits Registration
  ↓
Admin Receives Notification
  ↓
Admin → User Management → Pending
  ├─ Name: Dr. Sarah Johnson
  ├─ Email: sjohnson@clinic.com
  ├─ License: PT-12345 (Physical Therapy)
  ├─ Specialization: Orthopedics
  └─ Clinic: Downtown PT Clinic
  ↓
Admin Verifies
  ├─ Check license validity
  ├─ Verify clinic affiliation
  ├─ Review background information
  └─ No issues found
  ↓
Admin Approves Registration
  ├─ Account activated
  ├─ Sends welcome email
  ├─ Provides platform training link
  └─ Assigns default role: "Therapist"
  ↓
Therapist Receives Approval
  ├─ Confirmation email
  ├─ First-time setup
  ├─ Can now add patients
  └─ Can create interventions
```

#### Workflow A-2: Review & Approve New Interventions

```
Therapist Creates Intervention
  ├─ "Advanced Knee Extension Exercises"
  ├─ Video with demonstrations
  ├─ Includes precautions
  └─ Submits for publication
  ↓
Admin Notified of Pending Content
  ↓
Admin → Content Review Queue
  ├─ New intervention: pending
  ├─ Creator: Dr. Johnson
  └─ Date submitted: Today
  ↓
Admin Reviews Intervention
  ├─ Watch video
  ├─ Check quality (good video quality, clear instructions)
  ├─ Verify appropriateness (exercise appropriate for PT)
  ├─ Check for copyright (original content)
  ├─ Check for accuracy (medically sound)
  └─ No issues detected
  ↓
Admin Approves
  ├─ Sets status to "Published"
  ├─ Makes available in library
  ├─ Notifies creator
  ├─ Intervention now available to all therapists
  └─ Usage statistics tracked
```

#### Workflow A-3: Configure System Settings

```
Admin → System Configuration
  ↓
Update Platform Branding
  ├─ Logo: Upload new logo
  ├─ Colors: #0066CC primary, #333333 secondary
  ├─ Name: "RehaAdvisor Pro"
  └─ Domain: rehaadvisor.clinic.com
  ↓
Update Security Settings
  ├─ Session timeout: 30 minutes
  ├─ Password policy: Min 10 chars, must include uppercase
  ├─ MFA: Optional for all roles
  ├─ Maximum failed login: 5 before lockout
  └─ Changes take effect immediately
  ↓
Configure Integrations
  ├─ Fitbit: Connected and configured
  ├─ Email provider: clinic-smtp.example.com
  ├─ Storage: AWS S3 bucket configured
  └─ All connections tested and working
  ↓
Set Data Policies
  ├─ Video retention: 1 year after discharge
  ├─ Health data retention: 3 years
  ├─ Automatic backup: Daily at 2 AM
  ├─ Backup retention: 30 days
  └─ Policies logged and auditable
```

#### Workflow A-4: Monitor System Health

```
Admin → System Dashboard
  ↓
Check Key Metrics
  ├─ API response time: 125ms (normal)
  ├─ Database: 85% capacity (monitoring)
  ├─ Error rate: 0.02% (acceptable)
  ├─ Active users: 342 (normal for time)
  ├─ Uptime: 99.97%
  ├─ Backup status: Success (2 hours ago)
  └─ No alerts
  ↓
View Recent Activity
  ├─ 12 new patient registrations today
  ├─ 3 therapist registrations approved
  ├─ 2,340 interventions completed today
  ├─ 156 health data entries today
  └─ 8 support tickets received
  ↓
Review Alerts & Errors
  ├─ Check error logs
  ├─ Review failed jobs
  ├─ Verify backup integrity
  └─ All systems operational
  ↓
Proactive Monitoring
  ├─ Set alert for DB >90% capacity
  ├─ Schedule backup verification
  ├─ Plan storage expansion
  └─ Monitor Fitbit sync success rate
```

#### Workflow A-5: Generate Compliance Report

```
Admin → Reports
  ↓
Select Report Type: "HIPAA Compliance Audit"
  ├─ Date Range: Q4 2025
  ├─ Include: Access logs, encryption status, incidents
  └─ Format: PDF
  ↓
System Generates Report
  ├─ User access logs: 1,240,000 entries reviewed
  ├─ No unauthorized access detected
  ├─ All data encrypted in transit and at rest
  ├─ No security incidents reported
  ├─ Password policies enforced
  ├─ Audit logging enabled
  ├─ Backup and recovery tested
  └─ Overall: COMPLIANT
  ↓
Review & Sign Off
  ├─ Admin reviews report
  ├─ No issues found
  ├─ Digitally signs report
  ├─ Files for records
  └─ Distributes to auditors if needed
  ↓
Export & Archive
  ├─ Export to PDF
  ├─ Archive for 7 years (per regulation)
  ├─ Store in secure location
  └─ Accessible for audits
```

### Permissions

| Resource | Read | Create | Update | Delete |
|----------|------|--------|--------|--------|
| All Users | ✓ | ✓ | ✓ | ✓ |
| All Patient Data | ✓ | - | ✓ | ✓ |
| All Interventions | ✓ | ✓ | ✓ | ✓ |
| System Settings | ✓ | - | ✓ | - |
| Audit Logs | ✓ | - | - | - |
| Reports | ✓ | ✓ | ✓ | ✓ |
| User Accounts | ✓ | ✓ | ✓ | ✓ |
| Full Platform | ✓ | ✓ | ✓ | ✓ |

---

## Cross-Functional Workflows

### Workflow X-1: Patient-Therapist Engagement Loop

```
Week 1: Initial Setup
├─ Patient registers
├─ Therapist onboards patient
├─ Assessment completed
└─ Initial interventions assigned

Week 2-4: Execution & Feedback
├─ Patient executes interventions
├─ Patient provides feedback
├─ Therapist monitors adherence
├─ Therapist reviews feedback
└─ Minor adjustments made

Week 5: Reassessment
├─ Therapist generates progress report
├─ Patient reviews progress
├─ Therapist and patient discuss results
├─ Treatment plan adjusted if needed
└─ New interventions assigned if appropriate

Week 6+: Continued Cycle
├─ Pattern repeats
├─ Increased complexity as patient improves
├─ Continued monitoring
└─ Discharge planning when goals met
```

### Workflow X-2: Evidence Generation Loop

```
Month 1: Collect Data
├─ Patients execute interventions
├─ Health data continuously recorded
├─ Feedback collected
└─ Sessions tracked

Month 2-3: Analyze Outcomes
├─ Researcher accesses de-identified data
├─ Runs analysis on intervention effectiveness
├─ Identifies trends and patterns
├─ Compares to benchmarks
└─ Generates insights

Month 4: Implement Improvements
├─ Findings shared with platform team
├─ Recommendations made for improvements
├─ Platform updated with better interventions
├─ Therapists trained on improvements
└─ Better outcomes for new patients

Month 5+: Publish & Disseminate
├─ Researcher publishes findings
├─ Contributes to evidence base
├─ Platform reputation enhanced
└─ Cycle continues with next study
```

---

*Last Updated: February 17, 2026*
