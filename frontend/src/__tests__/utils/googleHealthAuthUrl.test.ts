import apiClient from '@/api/client';
import { buildGoogleHealthAuthUrl } from '@/utils/googleHealthAuthUrl';

jest.mock('@/api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));

describe('buildGoogleHealthAuthUrl', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { nonce: 'n1' } });
  });

  it('puts the nonce and patient id in the state', async () => {
    const url = new URL(await buildGoogleHealthAuthUrl('p1'));
    expect(apiClient.get).toHaveBeenCalledWith('/google-health/auth-init/', {
      params: { patientId: 'p1' },
    });
    expect(url.searchParams.get('state')).toBe('n1:p1');
    expect(url.searchParams.get('access_type')).toBe('offline');
  });

  it('shows the account picker so patients can switch Google accounts', async () => {
    const url = new URL(await buildGoogleHealthAuthUrl('p1'));
    expect(url.searchParams.get('prompt')).toBe('select_account consent');
  });
});
