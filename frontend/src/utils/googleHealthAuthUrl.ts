const CLIENT_ID = import.meta.env.VITE_GOOGLE_HEALTH_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_GOOGLE_HEALTH_REDIRECT_URI as string;
const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
].join(' ');

export function buildGoogleHealthAuthUrl(patientId: string): string {
  return (
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?response_type=code` +
    `&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&state=${patientId}` +
    `&access_type=offline` +
    `&prompt=consent`
  );
}
