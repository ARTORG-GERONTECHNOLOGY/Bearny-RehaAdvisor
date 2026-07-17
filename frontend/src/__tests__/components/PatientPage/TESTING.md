# PatientPage Components — Test Documentation

Unit tests for patient-facing components in `src/components/PatientPage/`.

Run from the `frontend/` directory (or inside the `react` container):

```bash
npx jest src/__tests__/components/PatientPage/ --no-coverage
```

---

## `ReconnectBanner.test.tsx`

Tests for `src/components/PatientPage/ReconnectBanner.tsx` — the amber warning
banner shown when a patient's Google Health connection is approaching or past
the 7-day re-authorisation window imposed by Google's unverified-app testing mode.

### Scenarios covered

| Scenario | Expected behaviour |
|---|---|
| `needsReconnect=false` | Nothing rendered |
| Already dismissed this session (sessionStorage key set) | Nothing rendered |
| `needsReconnect=true`, `daysUntilExpiry >= 1` | Shows "expires in N day(s)" warning message |
| `needsReconnect=true`, `daysUntilExpiry=0` | Shows "has expired" message |
| `needsReconnect=true`, `daysUntilExpiry=null` | Shows "has expired" message (safe default) |
| Reconnect link | Points to `accounts.google.com` OAuth URL containing the patient ID |
| Dismiss click | Banner hidden; `reconnect_banner_dismissed_<id>` written to `sessionStorage` |
| Dismiss uses localStorage id when present | `sessionStorage` key uses the correct patient ID |

**7 tests**

---

## Other files

| File | Component |
|---|---|
| `ActivitySection.test.tsx` | `ActivitySection` — step/sleep/activity data layout |
| `FeedbackPopup.test.tsx` | `FeedbackPopup` — intervention feedback sheet |
| `FitbitStatus.test.tsx` | `FitbitStatus` / `GoogleHealthConnectButton` — connect button rendering |
| `HealthCheckInSection.test.tsx` | `HealthCheckInSection` — daily vitals prompt |
| `ManualBloodPressureSheet.test.tsx` | `ManualBloodPressureSheet` — BP manual entry |
| `ManualStepsSheet.test.tsx` | `ManualStepsSheet` — steps manual entry |
| `ManualWeightSheet.test.tsx` | `ManualWeightSheet` — weight manual entry |
| `PatientInterventionPopUp.test.tsx` | `PatientInterventionPopUp` — intervention detail sheet |
| `PatientQuestionaire.test.tsx` | `PatientQuestionaire` — questionnaire popup |
| `ProgressIndicator.test.tsx` | `ProgressIndicator` — circular progress ring |
