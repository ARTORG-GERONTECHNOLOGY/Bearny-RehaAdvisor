/**
 * Bearny OAuth Consent Screen Capture Script
 *
 * Prerequisites (run once):
 *   npm install playwright
 *   npx playwright install chrome
 *
 * Usage:
 *   node capture.js
 *
 * The browser opens visibly. Log in when prompted, then press Enter in the
 * terminal to advance to each screenshot. All images are saved to ./screenshots/
 */

const { chromium } = require("playwright");
const readline = require("readline");
const path = require("path");
const fs = require("fs");

// ── CONFIG ────────────────────────────────────────────────────────────────────
const GCP_PROJECT_NUMBER = "905942928064";
const OAUTH_CLIENT_ID =
  "905942928064-gfkukphfc4c5lt43nfjgnc01fo8l3seh.apps.googleusercontent.com";
const BEARNY_URL = "https://reha-advisor.ch"; // change to https://dev.reha-advisor.ch for dev
const OUT_DIR = path.join(__dirname, "screenshots");

// Google Cloud Console deep-links
const GCP_CONSENT_URL = `https://console.cloud.google.com/apis/credentials/consent?project=${GCP_PROJECT_NUMBER}`;
const GCP_CREDENTIALS_URL = `https://console.cloud.google.com/apis/credentials?project=${GCP_PROJECT_NUMBER}`;
const GCP_SCOPES_URL = `https://console.cloud.google.com/apis/credentials/consent/edit?project=${GCP_PROJECT_NUMBER}`;

// Bearny pages
const BEARNY_LOGIN_URL = `${BEARNY_URL}/login`;
const BEARNY_PATIENT_URL = `${BEARNY_URL}/patient`; // patient profile after login
// ─────────────────────────────────────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pause = (msg) =>
  new Promise((resolve) => {
    console.log(`\n⏸  ${msg}`);
    console.log("   Press ENTER when ready...");
    rl.once("line", resolve);
  });

const shot = async (page, filename, description) => {
  const file = path.join(OUT_DIR, filename);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`✅ Saved: ${filename}  (${description})`);
};

(async () => {
  console.log("=".repeat(60));
  console.log("  Bearny OAuth Consent Screen Capture");
  console.log("=".repeat(60));
  console.log(`Screenshots will be saved to: ${OUT_DIR}\n`);

  const browser = await chromium.launch({
    channel: "chrome", // uses your installed Google Chrome
    headless: false,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  // ── SCREEN 1: GCP OAuth Consent Screen overview ───────────────────────────
  await page.goto(GCP_CONSENT_URL);
  await pause(
    "SCREEN 1 — GCP OAuth Consent Screen\n" +
    "   Make sure you are logged in to the correct Google account.\n" +
    "   The page should show app name 'Bearny', support email, and authorized domain.\n" +
    "   Scroll to show the app name section clearly, then press ENTER."
  );
  await shot(page, "01_gcp_oauth_consent_overview.png", "GCP consent screen overview");

  // ── SCREEN 2: GCP Credentials page ───────────────────────────────────────
  await page.goto(GCP_CREDENTIALS_URL);
  await pause(
    "SCREEN 2 — GCP Credentials page\n" +
    `   Find the OAuth 2.0 Client ID entry for client:\n   ${OAUTH_CLIENT_ID}\n` +
    "   Make sure the client name and ID are readable, then press ENTER."
  );
  await shot(page, "02_gcp_credentials_client_id.png", "GCP credentials with client ID");

  // ── SCREEN 2b: Click into the client to show redirect URI ─────────────────
  await pause(
    "SCREEN 2b — Click on the OAuth client to open its detail panel.\n" +
    "   It should show the authorized redirect URI:\n" +
    "   https://reha-advisor.ch/api/google-health/callback/\n" +
    "   Then press ENTER."
  );
  await shot(page, "03_gcp_client_redirect_uri.png", "GCP client redirect URI detail");

  // ── SCREEN 3: Scopes section ──────────────────────────────────────────────
  await page.goto(GCP_SCOPES_URL);
  await pause(
    "SCREEN 3 — GCP Scopes\n" +
    "   Navigate to the 'Scopes' step in the consent screen editor.\n" +
    "   The list should show all fitness.* scopes. Scroll so all are visible,\n" +
    "   then press ENTER."
  );
  await shot(page, "04_gcp_scopes_list.png", "GCP requested scopes list");

  // ── SCREEN 4: Bearny — patient profile with connect button ────────────────
  await page.goto(BEARNY_LOGIN_URL);
  await pause(
    "SCREEN 4 — Bearny patient profile\n" +
    "   Log in as a patient account.\n" +
    "   Navigate to the patient profile page that shows the\n" +
    "   'Connect Google Health' (or Fitbit) button.\n" +
    "   Scroll so the button is visible, then press ENTER."
  );
  await shot(page, "05_bearny_patient_connect_button.png", "Bearny patient connect button");

  // ── SCREEN 5: Google consent popup ───────────────────────────────────────
  await pause(
    "SCREEN 5 — Google OAuth consent popup\n" +
    "   Click the 'Connect Google Health' button to trigger the OAuth flow.\n" +
    "   A Google consent screen should appear (in a new tab or popup).\n" +
    "   Switch to that tab/popup window, scroll so the scope list is visible,\n" +
    "   then press ENTER.\n" +
    "   (Do NOT click Allow/Deny yet — just take the screenshot.)"
  );

  // Try to capture the popup page if it opened in a new context
  const pages = context.pages();
  const targetPage = pages.length > 1 ? pages[pages.length - 1] : page;
  await shot(targetPage, "06_google_consent_popup.png", "Google OAuth consent screen");

  // ── SCREEN 6: Bearny health dashboard (therapist view) ───────────────────
  await pause(
    "SCREEN 6 — Bearny health dashboard (therapist)\n" +
    "   Log in as a therapist account (or open a new tab and log in).\n" +
    "   Navigate to a patient's Health page that shows the HealthChartsAccordion\n" +
    "   (steps, sleep, heart rate, wear time charts).\n" +
    "   Collapse or expand so multiple chart headers are visible, then press ENTER."
  );
  await shot(page, "07_bearny_health_dashboard_overview.png", "Bearny health dashboard overview");

  // ── SCREEN 7a: Steps chart ────────────────────────────────────────────────
  await pause(
    "SCREEN 7a — Steps chart\n" +
    "   Expand the Steps accordion panel so the bar chart fills the viewport.\n" +
    "   Then press ENTER."
  );
  await shot(page, "08_bearny_chart_steps.png", "Bearny steps chart");

  // ── SCREEN 7b: Heart Rate chart ───────────────────────────────────────────
  await pause(
    "SCREEN 7b — Heart Rate chart\n" +
    "   Expand the Resting Heart Rate / HR Zones panel.\n" +
    "   Then press ENTER."
  );
  await shot(page, "09_bearny_chart_heartrate.png", "Bearny heart rate chart");

  // ── SCREEN 7c: Sleep chart ────────────────────────────────────────────────
  await pause(
    "SCREEN 7c — Sleep chart\n" +
    "   Expand the Sleep panel.\n" +
    "   Then press ENTER."
  );
  await shot(page, "10_bearny_chart_sleep.png", "Bearny sleep chart");

  // ── SCREEN 7d: Active Minutes / HR Zones chart ────────────────────────────
  await pause(
    "SCREEN 7d — Active Minutes / HR Zones chart\n" +
    "   Expand the Active Zone Minutes or HR Zones panel.\n" +
    "   Then press ENTER."
  );
  await shot(page, "11_bearny_chart_active_minutes.png", "Bearny active minutes chart");

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log(`  All screenshots saved to: ${OUT_DIR}`);
  console.log("=".repeat(60));

  await browser.close();
  rl.close();
})();
