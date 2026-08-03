import apiClient from '@/api/client';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_HEALTH_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_GOOGLE_HEALTH_REDIRECT_URI as string;
const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
].join(' ');

/**
 * Requests a one-time CSRF nonce from the backend and returns the full
 * Google OAuth authorization URL with state=<nonce>:<patientId>.
 */
export async function buildGoogleHealthAuthUrl(patientId: string): Promise<string> {
  const res = await apiClient.get<{ nonce: string }>('/google-health/auth-init/', {
    params: { patientId },
  });
  const nonce = res.data.nonce;

  return (
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?response_type=code` +
    `&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&state=${encodeURIComponent(`${nonce}:${patientId}`)}` +
    `&access_type=offline` +
    `&prompt=consent`
  );
}
