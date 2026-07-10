jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

import apiClient from '@/api/client';
import { ForgotPasswordStore } from '@/stores/forgotPasswordStore';

const mockApiClient = apiClient as unknown as { post: jest.Mock };
const t = (key: string) => key;

describe('ForgotPasswordStore', () => {
  let store: ForgotPasswordStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new ForgotPasswordStore();
  });

  it('sets the email', () => {
    store.setEmail('user@example.com');
    expect(store.email).toBe('user@example.com');
  });

  it('rejects an invalid email without calling the api', async () => {
    store.setEmail('not-an-email');
    await store.submit(t);

    expect(mockApiClient.post).not.toHaveBeenCalled();
    expect(store.error).toBe('Invalid email format.');
    expect(store.loading).toBe(false);
    expect(store.success).toBe(false);
  });

  it('submits a valid email and sets success', async () => {
    mockApiClient.post.mockResolvedValueOnce({ data: {} });
    store.setEmail('  user@example.com  ');

    await store.submit(t);

    expect(mockApiClient.post).toHaveBeenCalledWith('auth/forgot-password/', {
      email: 'user@example.com',
    });
    expect(store.success).toBe(true);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('sets an error when the api call fails', async () => {
    mockApiClient.post.mockRejectedValueOnce(new Error('network error'));
    store.setEmail('user@example.com');

    await store.submit(t);

    expect(store.error).toBe('Failed to send password reset link. Please try again.');
    expect(store.success).toBe(false);
    expect(store.loading).toBe(false);
  });

  it('clears previous messages on a new submit', async () => {
    store.error = 'stale error';
    store.success = true;
    mockApiClient.post.mockResolvedValueOnce({ data: {} });
    store.setEmail('user@example.com');

    await store.submit(t);

    expect(store.error).toBeNull();
    expect(store.success).toBe(true);
  });
});
