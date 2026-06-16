# Bearny OAuth Screenshot Capture

Captures all 11 screenshots needed for the Google OAuth verification video.

## Requirements

- Node.js 18+
- Google Chrome installed on your machine
- You must be able to log in to the Google Cloud Console (account: ger@telerehabilitation.ch)
- A patient account and a therapist account on reha-advisor.ch

## Setup (one time)

```bash
npm run setup
```

## Run

```bash
npm run capture
```

The browser opens visibly. The script pauses at each screen and tells you
exactly what to navigate to. Press **Enter** in the terminal to take each
screenshot.

Screenshots are saved to `./screenshots/` in this folder.

## Output files

| File | Content |
|---|---|
| `01_gcp_oauth_consent_overview.png` | GCP consent screen — app name, domain |
| `02_gcp_credentials_client_id.png` | GCP credentials — client ID visible |
| `03_gcp_client_redirect_uri.png` | GCP client detail — redirect URI |
| `04_gcp_scopes_list.png` | GCP scopes — all fitness.* scopes listed |
| `05_bearny_patient_connect_button.png` | Bearny patient profile — connect button |
| `06_google_consent_popup.png` | Google OAuth consent popup |
| `07_bearny_health_dashboard_overview.png` | Therapist health dashboard overview |
| `08_bearny_chart_steps.png` | Steps chart |
| `09_bearny_chart_heartrate.png` | Heart rate chart |
| `10_bearny_chart_sleep.png` | Sleep chart |
| `11_bearny_chart_active_minutes.png` | Active minutes / HR zones chart |
