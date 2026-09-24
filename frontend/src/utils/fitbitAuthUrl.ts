import apiClient from '@/api/client';

const CLIENT_ID = import.meta.env.VITE_FITBIT_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_FITBIT_REDIRECT_URI as string;
const SCOPES =
  'activity heartrate respiratory_rate oxygen_saturation temperature electrocardiogram profile sleep';

/**
 * Requests a one-time CSRF nonce from the backend and returns the full
 * Fitbit OAuth authorization URL with state=<nonce>:<patientId>.
 */
export async function buildFitbitAuthUrl(patientId: string): Promise<string> {
  const res = await apiClient.get<{ nonce: string }>('/fitbit/auth-init/', {
    params: { patientId },
  });
  const nonce = res.data.nonce;

  return (
    `https://www.fitbit.com/oauth2/authorize?response_type=code` +
    `&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&state=${encodeURIComponent(`${nonce}:${patientId}`)}` +
    `&prompt=login` +
    `&expires_in=604800`
  );
}
