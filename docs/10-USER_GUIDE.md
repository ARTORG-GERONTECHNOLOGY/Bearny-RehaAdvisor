# User Guide

## Welcome to RehaAdvisor

RehaAdvisor is a comprehensive web application designed to assist therapists, researchers, and administrators in managing rehabilitation programs and patient care.

## Getting Started

### First Steps

1. **Access the Application**:
   - Navigate to: http://localhost:3001 (development) or https://yourdomain.com (production)
   - You'll see the login page

2. **Log In**:
   - Enter your username or email
   - Enter your password
   - Click "Login" button

3. **Understand Your Role**:
   - **Therapist**: Manage patients, create sessions, track progress
   - **Researcher**: View aggregated data, generate reports
   - **Administrator**: Manage users, system settings, access logs

## Main Features

### Dashboard

The dashboard provides a quick overview of your activity:

- **Quick Stats**: Number of active patients, scheduled sessions, pending tasks
- **Recent Activity**: Latest sessions, patient updates, feedback
- **Calendar**: View your scheduled sessions and appointments
- **Tasks**: Upcoming tasks and reminders

### Patient Management

#### Viewing Patients

1. Navigate to **Patients** section
2. View all patients assigned to you (if therapist) or all patients (if admin)
3. Use filters to find specific patients:
   - Search by name or email
   - Filter by status (active, inactive, completed)
   - Sort by creation date or last updated

#### Creating a Patient

1. Click **+ New Patient** button
2. Fill in patient information:
   - Name (required)
   - Date of birth (required)
   - Email (required, must be unique)
   - Phone number
   - Gender
   - Medical history
3. Click **Create Patient**

#### Viewing Patient Details

1. Click on a patient name or ID
2. View complete patient profile:
   - Personal information
   - Medical history
   - Assigned therapist
   - Active therapy programs
   - Session history
   - Progress reports

#### Editing Patient Information

1. Open patient profile
2. Click **Edit** button
3. Modify relevant fields
4. Click **Save Changes**

#### Assigning Therapy

1. Open patient profile
2. Click **+ Assign Therapy**
3. Select therapy program from available options
4. Set start date and goals
5. Click **Assign**

### Session Management

#### Scheduling a Session

1. Navigate to **Sessions** or open a patient profile
2. Click **+ Schedule Session**
3. Fill in session details:
   - Date and time (required)
   - Duration (default: 60 minutes)
   - Session type (assessment, treatment, follow-up)
   - Notes (optional)
4. Click **Schedule Session**

#### Starting a Session

1. Open a scheduled session
2. Review patient information
3. Click **Start Session**
4. The session timer will start

#### Recording Session Data

During or after a session:

1. **Add Exercises**:
   - Click **+ Add Exercise**
   - Select exercise from library
   - Record repetitions and sets
   - Add performance notes

2. **Record Measurements**:
   - Pain level (1-10 scale)
   - Range of motion (degrees)
   - Strength score (1-10 scale)
   - Other relevant measurements

3. **Add Notes**:
   - Patient observations
   - Progress comments
   - Instructions for next session

#### Completing a Session

1. Review all recorded data
2. Add completion notes
3. Click **Complete Session**
4. System generates progress update

### Progress Tracking

#### Viewing Progress Reports

1. Navigate to **Reports** section
2. Select report type:
   - Patient progress
   - Therapy effectiveness
   - Attendance summary
   - Outcome metrics

3. Choose filters:
   - Date range
   - Patient or therapy type
   - Specific metrics

#### Generating Reports

1. Click **Generate Report**
2. Select report parameters
3. Choose format (PDF, CSV, Excel)
4. Click **Generate**

### Feedback and Communication

#### Submitting Feedback

1. Click **Feedback** in main menu
2. Click **+ Submit Feedback**
3. Fill in feedback form:
   - Subject/Title
   - Detailed message
   - Rating (1-5 stars)
   - Category (bug, feature request, general)
4. Click **Submit**

#### Viewing Feedback History

1. Go to **Settings** → **My Feedback**
2. View all your submitted feedback
3. See status and responses from administrators

### Settings and Profile

#### Update Profile

1. Click your **Profile** icon (top right)
2. Click **Edit Profile**
3. Update information:
   - Name
   - Email
   - Phone
   - Bio/specialization
4. Click **Save Changes**

#### Change Password

1. Click **Profile** → **Settings**
2. Click **Change Password**
3. Enter current password
4. Enter new password (twice to confirm)
5. Click **Update Password**

#### Preferences

1. Go to **Settings** → **Preferences**
2. Configure:
   - Notification settings
   - Language/Locale
   - Time zone
   - Email alerts
3. Click **Save Preferences**

## Common Tasks

### Task: Add a New Patient and Schedule First Session

**Time Required**: 5-10 minutes

**Steps**:

1. Click **Patients** → **+ New Patient**
2. Enter patient information:
   - Name: John Doe
   - Email: john.doe@example.com
   - Date of Birth: 1985-05-15
   - Phone: +1234567890
3. Click **Create Patient**
4. System shows patient created successfully
5. Click **+ Assign Therapy**
6. Select therapy program
7. Click **Assign**
8. Click **+ Schedule Session**
9. Enter session details:
   - Date/Time: Tomorrow at 2:00 PM
   - Duration: 60 minutes
   - Type: Initial assessment
10. Click **Schedule Session**
11. Session appears on calendar

### Task: Complete a Therapy Session

**Time Required**: 60 minutes (session) + 5 minutes (documentation)

**Steps**:

1. Navigate to scheduled session
2. Click **Start Session**
3. Perform therapy exercises with patient
4. Record performance:
   - Add exercises completed
   - Record measurements
   - Add notes on patient progress
5. Click **Complete Session**
6. Review summary
7. Click **Confirm**

### Task: Generate Progress Report

**Time Required**: 5 minutes

**Steps**:

1. Click **Reports**
2. Select **Patient Progress Report**
3. Choose patient and date range
4. Click **Generate**
5. Review report
6. Click **Download as PDF** or **Export as CSV**

## Tips and Tricks

### Keyboard Shortcuts

- `Ctrl/Cmd + S`: Save
- `Ctrl/Cmd + K`: Quick search
- `Ctrl/Cmd + Enter`: Submit form
- `Esc`: Close dialog/modal

### Filtering and Search

- **Quick Search**: Click search icon (top) and type patient name or ID
- **Advanced Filters**: Click filter icon to access advanced filtering options
- **Saved Filters**: Create and save filter combinations for frequent searches

### Bulk Actions

- **Multiple Selection**: Hold `Shift` to select multiple items
- **Bulk Export**: Select items and click "Export" to download data
- **Batch Operations**: Some actions can be performed on multiple items at once

### Notifications

- **Real-time Alerts**: You'll receive notifications for important events
- **Notification Settings**: Customize in Settings → Notifications
- **Email Alerts**: Opt-in to email alerts for critical updates

## Accessibility Features

### Keyboard Navigation

- Use `Tab` to navigate between elements
- Use `Enter` or `Space` to activate buttons
- Use arrow keys to navigate lists and menus

### Screen Reader Support

- All interactive elements are properly labeled
- Forms include descriptive labels and error messages
- Tables include column headers for context

### Text Size and Colors

- You can increase text size in browser settings
- High contrast mode is available in Settings → Accessibility

## Support and Help

### Getting Help

1. **In-App Help**: Click **?** icon for contextual help
2. **Knowledge Base**: Visit help section for FAQs and guides
3. **Contact Support**: Use **Help** → **Contact Support** to reach support team
4. **Documentation**: Read full documentation at [docs/README.md](./README.md)

### Reporting Issues

If you encounter a bug or issue:

1. Click **Help** → **Report Issue**
2. Describe the problem
3. Provide steps to reproduce
4. Include screenshots if applicable
5. Submit report

Support team will respond within 24 hours.

## Best Practices

### Patient Data Management

- **Regular Updates**: Keep patient information current
- **Accurate Records**: Ensure all session notes are detailed and accurate
- **Privacy**: Never share patient information externally
- **Backup**: Data is automatically backed up

### Session Planning

- **Schedule Ahead**: Plan sessions 1-2 weeks in advance
- **Consistent Timing**: Try to maintain regular session schedules
- **Preparation**: Review patient history before sessions
- **Follow-ups**: Schedule follow-up sessions after initial assessments

### Data Quality

- **Complete Information**: Always fill in required fields
- **Measurements**: Record measurements at consistent times
- **Notes**: Provide detailed session notes for continuity of care
- **Progress Tracking**: Regularly review patient progress

## Troubleshooting

### I forgot my password

1. Click **Forgot Password** on login page
2. Enter your email address
3. Check your email for reset link
4. Click link and enter new password
5. You'll be redirected to login page

### I'm unable to see a patient's information

**Possible reasons**:
- Patient is not assigned to you
- You don't have necessary permissions
- Patient record was archived
- **Solution**: Contact administrator to verify permissions

### Sessions are not appearing on my calendar

**Possible reasons**:
- Browser cache not updated
- Timezone settings incorrect
- Sessions are in past (not displayed by default)
- **Solution**: 
  - Clear browser cache (Ctrl+Shift+Delete)
  - Check timezone settings
  - Use date filters to view past sessions

### I can't download reports

**Possible reasons**:
- Browser blocking downloads
- PDF plugin missing
- Insufficient permissions
- **Solution**:
  - Check browser download settings
  - Enable pop-ups for RehaAdvisor
  - Contact administrator if permission issue

## FAQ

**Q: How often should I record session data?**
A: Record data during or immediately after each session for accuracy.

**Q: Can I modify past session notes?**
A: Yes, you can edit session notes for up to 30 days after the session.

**Q: How is patient data protected?**
A: Data is encrypted in transit and at rest. Access is controlled by role-based permissions.

**Q: Can I export patient data?**
A: Yes, you can export data in CSV or PDF format with appropriate permissions.

**Q: How long is data retained?**
A: Active patient data is retained indefinitely. Archived data is retained for 7 years.

---

**Need More Help?**
- Check [Troubleshooting Guide](./08-TROUBLESHOOTING.md)
- Read [FAQ](./11-FAQ.md)
- Contact support: support@yourdomain.com
