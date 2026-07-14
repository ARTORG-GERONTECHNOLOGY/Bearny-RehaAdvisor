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
   - **Therapist**: Manage patients, assign interventions, track progress
   - **Researcher**: View aggregated data, generate reports
   - **Administrator**: Manage users, system settings, access logs

## Main Features

### Dashboard

The dashboard provides a quick overview of your activity:

- **Quick Stats**: Number of active patients, upcoming intervention occurrences, pending tasks
- **Recent Activity**: Latest completed interventions, patient updates, feedback
- **Calendar**: View patients' intervention schedules
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
   - **Wearable Device** — select the wearable the patient uses:
     - **Fitbit** (default) — patient connects via OAuth; wear-time badge shown
     - **Omron** — patient enters steps manually; a neutral grey "Omron" badge is shown instead of "Disconnected"
     - **None** — no wearable; "No device" badge shown; Fitbit connect card hidden on the patient page
3. Click **Create Patient**

#### Changing a Patient's Wearable Device

If a patient switches devices after registration:

1. Open the patient's profile
2. Click **Edit**
3. Change the **Wearable Device** dropdown
4. Click **Save**

The WearBadge on the therapist patient list and the Fitbit connect card on the patient page update immediately.

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

### Rehabilitation Plan & Interventions

Therapists build a patient's **Rehabilitation Plan** by assigning **Interventions** — individual exercises or activities — on a calendar. Patients mark each one as done from their own app.

#### Assigning an Intervention

1. Open the patient's detail page and go to the **Rehabilitation Plan** tab
2. Click **Add Intervention** and choose one from the intervention library
3. Set the repeat rule: interval (day/week/month), which days, and a start/end date — or leave it open-ended
4. To assign several interventions at once, apply a **Named Template** instead (a reusable, shareable bundle of interventions with their own schedule — see the therapist's Interventions page, Templates tab)
5. Save — the intervention now appears on the patient's Rehabilitation Plan calendar

#### Rescheduling

On the plan's calendar view, therapists can **drag and drop** a scheduled intervention occurrence to a different day to reschedule it.

#### Recording Completion & Feedback

Patients mark an intervention as done themselves (**Mark as done**) from their own app; therapists don't log this on their behalf. Each completed intervention can carry patient feedback, which therapists review from the patient's Outcomes tab. Therapists can also view per-intervention stats (completion rate over time) from the plan view.

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

#### Exporting Health Data

From the patient's Health tab, click **Export**, pick a date range and which metrics/questionnaires to include, then export as **CSV** or **PDF**.

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
   - Display preferences
3. Click **Save Preferences**

#### Notification Settings

**Note**: Available for patients on supported browsers (Chrome, Edge, Opera, Samsung Internet). Not supported on Safari iOS/mobile.

1. Navigate to **Settings** page (gear icon in navigation)
2. Locate **Notifications** card
3. Enable notifications:
   - Toggle **Enable Notifications** switch
   - Browser will prompt for permission (first time)
   - Click **Allow** in browser prompt
4. Settings persist across sessions

**Daily Reminder Behavior**:
- Notification appears every 24 hours
- Reminds you to check daily interventions
- Click notification to open RehaAdvisor
- Disable anytime in Settings

**Troubleshooting**:
- If permission denied: Re-enable in browser settings
- If not working: Check browser supports Notifications API
- Safari users: Notification feature not available

## Common Tasks

### Task: Add a New Patient and Assign Their First Intervention

**Time Required**: 5-10 minutes

**Steps**:

1. Click **Patients** → **+ New Patient** (manual entry) or import via REDCap, depending on the deployment's `APP_MODE`
2. Enter patient information: name, diagnosis, wearable device (Fitbit / Omron / none), etc.
3. Click **Create Patient**
4. Open the new patient's detail page → **Rehabilitation Plan** tab
5. Click **Add Intervention**, pick one from the library (or apply a Named Template for a whole bundle at once)
6. Set the repeat rule (interval, days, start/end date)
7. Save — the intervention now appears on the patient's plan calendar

### Task: Review Completed Interventions

**Time Required**: 5-10 minutes

**Steps**:

1. Open the patient's detail page → **Outcomes** tab
2. Review which assigned interventions the patient has marked as done, along with any feedback they left
3. Use the plan view's per-intervention stats to see completion rate over time

### Task: Export Health Data

**Time Required**: 2 minutes

**Steps**:

1. Open the patient's **Health** tab
2. Click **Export**, choose a date range and which metrics/questionnaires to include
3. Click **Export CSV** or **Export PDF**

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
- **Accurate Records**: Review patient feedback and completion history regularly
- **Privacy**: Never share patient information externally
- **Backup**: Data is automatically backed up

### Rehabilitation Plan Design

- **Plan Ahead**: Set up recurring intervention schedules rather than assigning one occurrence at a time
- **Consistent Timing**: Use repeat rules (interval/days) to keep a predictable routine
- **Preparation**: Review patient diagnosis/history before assigning interventions
- **Named Templates**: Reuse a shared template for common diagnosis-based plans instead of rebuilding one from scratch each time

### Data Quality

- **Complete Information**: Always fill in required fields
- **Consistency**: Encourage patients to mark interventions as done promptly so completion history stays accurate
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

### Scheduled interventions are not appearing on the plan calendar

**Possible reasons**:
- Browser cache not updated
- Timezone settings incorrect
- Occurrences are in the past (not displayed by default)
- **Solution**: 
  - Clear browser cache (Ctrl+Shift+Delete)
  - Check timezone settings
  - Use date filters to view past occurrences

### I can't export health data

**Possible reasons**:
- Browser blocking downloads
- Insufficient permissions
- **Solution**:
  - Check browser download settings
  - Enable pop-ups for RehaAdvisor
  - Contact administrator if permission issue

## FAQ

**Q: Can I edit an intervention after assigning it?**
A: Yes — open it from the Rehabilitation Plan tab to change its repeat rule, or drag it on the calendar to reschedule an occurrence.

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
