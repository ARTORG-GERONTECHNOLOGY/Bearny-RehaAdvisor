import axios from 'axios';
import authStore from '@/stores/authStore';
import apiClient from '@/api/client';

// Mock the apiClient
jest.mock('@/api/client', () => require('@/__mocks__/api/client'));
jest.mock('@/stores/adminStore');
jest.mock('axios');

describe('authStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    authStore.reset();
    authStore.removeInactivityListeners();
  });

  it('should clear storage and reset state on logout', async () => {
    authStore.id = '12345'; // simulate a logged-in state

    // Mock logout API call success
    (apiClient.post as jest.Mock).mockResolvedValue({ status: 200 });

    const callback = jest.fn();
    authStore.setOnLogoutCallback(callback);

    await authStore.logout();

    expect(apiClient.post).toHaveBeenCalledWith('/auth/logout/', { userId: '12345' });
    expect(localStorage.getItem('authToken')).toBe(null);
    expect(authStore.isAuthenticated).toBe(false);
    expect(callback).toHaveBeenCalled(); // Check if navigation callback was triggered
  });

  it('should handle logout even if logout API fails', async () => {
    authStore.id = '12345';
    (apiClient.post as jest.Mock).mockRejectedValue(new Error('Logout failed'));

    const callback = jest.fn();
    authStore.setOnLogoutCallback(callback);

    await authStore.logout();

    expect(apiClient.post).toHaveBeenCalled();
    expect(authStore.isAuthenticated).toBe(false); // Still should reset state
    expect(callback).toHaveBeenCalled(); // Callback still triggered
  });

  it('should correctly restore session if session is valid', () => {
    localStorage.setItem('authToken', 'fake-token');
    localStorage.setItem('expiresAt', (Date.now() + 3600000).toString()); // 1 hour from now
    localStorage.setItem('userType', 'Therapist');
    localStorage.setItem('id', '12345');
    localStorage.setItem('firstName', 'John');
    localStorage.setItem('specialisations', 'Physio');

    authStore.checkAuthentication(() => {});

    expect(authStore.isAuthenticated).toBe(true);
    expect(authStore.userType).toBe('Therapist');
    expect(authStore.id).toBe('12345');
  });

  it('should logout if session is expired and no refresh token exists', async () => {
    const expiredTime = Date.now() - 1000; // 1 second ago
    localStorage.setItem('authToken', 'expired-token');
    localStorage.setItem('expiresAt', expiredTime.toString());
    // No refreshToken → no silent-refresh attempt

    const callback = jest.fn();
    authStore.setOnLogoutCallback(callback);

    authStore.checkAuthentication(callback);
    // Allow microtasks to flush
    await Promise.resolve();

    expect(authStore.isAuthenticated).toBe(false);
    expect(callback).toHaveBeenCalled();
  });

  it('stays logged in when session is expired but silent refresh succeeds', async () => {
    const expiredTime = Date.now() - 1000;
    localStorage.setItem('authToken', 'expired-token');
    localStorage.setItem('refreshToken', 'valid-refresh');
    localStorage.setItem('expiresAt', expiredTime.toString());
    localStorage.setItem('userType', 'Therapist');
    localStorage.setItem('id', '99');

    (axios.post as jest.Mock).mockResolvedValueOnce({ data: { access: 'refreshed-token' } });

    const callback = jest.fn();
    authStore.checkAuthentication(callback);
    await Promise.resolve();
    await Promise.resolve();

    expect(authStore.isAuthenticated).toBe(true);
    expect(callback).not.toHaveBeenCalled();
    expect(localStorage.getItem('authToken')).toBe('refreshed-token');
  });

  describe('authStore - Inactivity Timeout Logout', () => {
    beforeEach(() => {
      jest.useFakeTimers(); // Enable fake timers
      jest.clearAllTimers();
      localStorage.clear();
    });

    afterEach(() => {
      jest.useRealTimers(); // Restore real timers
      jest.clearAllMocks();
    });

    it('should logout after session timeout due to inactivity', async () => {
      const mockPost = apiClient.post as jest.Mock;
      mockPost.mockResolvedValueOnce({
        status: 200,
        data: {
          access_token: 'fake-token',
          refresh_token: 'fake-refresh-token',
          user_type: 'Therapist',
          id: '123',
          full_name: 'Test User',
          specialisation: 'Physio',
        },
      });

      const logoutCallback = jest.fn();
      authStore.setOnLogoutCallback(logoutCallback);

      localStorage.setItem('authToken', 'fake-token');
      localStorage.setItem('expiresAt', (Date.now() + authStore.sessionTimeout + 60000).toString());
      localStorage.setItem('userType', 'Therapist');
      localStorage.setItem('id', '123');
      localStorage.setItem('firstName', 'Test');
      localStorage.setItem('specialisations', 'Physio');

      authStore.checkAuthentication(() => {});

      expect(authStore.isAuthenticated).toBe(true);

      // Fast-forward until just before timeout
      jest.advanceTimersByTime(authStore.sessionTimeout - 1000);
      expect(authStore.isAuthenticated).toBe(true); // Still authenticated

      // Now fast-forward the remaining time to trigger the timeout
      jest.advanceTimersByTime(10000);
      await jest.runOnlyPendingTimersAsync();

      expect(authStore.isAuthenticated).toBe(false); // Should be logged out
      expect(logoutCallback).toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalledWith('/auth/logout/', { userId: '123' });
    });

    it('should reset the inactivity timer on user activity', async () => {
      const mockPost = apiClient.post as jest.Mock;
      mockPost.mockResolvedValueOnce({
        status: 200,
        data: {
          access_token: 'fake-token',
          refresh_token: 'fake-refresh-token',
          user_type: 'Therapist',
          id: '123',
          full_name: 'Test User',
          specialisation: 'Physio',
        },
      });

      const logoutCallback = jest.fn();
      authStore.setOnLogoutCallback(logoutCallback);

      localStorage.setItem('authToken', 'fake-token');
      localStorage.setItem('expiresAt', (Date.now() + authStore.sessionTimeout + 60000).toString());
      localStorage.setItem('userType', 'Therapist');
      localStorage.setItem('id', '123');
      localStorage.setItem('firstName', 'Test');
      localStorage.setItem('specialisations', 'Physio');

      authStore.checkAuthentication(() => {});

      const event = new Event('mousemove');
      const halfwayTime = authStore.sessionTimeout / 2;

      // Move halfway through the timeout
      jest.advanceTimersByTime(halfwayTime);

      // Simulate user activity
      window.dispatchEvent(event);

      // Timer should reset, so another full timeout period should be needed
      jest.advanceTimersByTime(halfwayTime);
      expect(authStore.isAuthenticated).toBe(true); // Still authenticated

      // Now advance full timeout period after the reset
      jest.advanceTimersByTime(authStore.sessionTimeout);
      await jest.runOnlyPendingTimersAsync();
      expect(authStore.isAuthenticated).toBe(false); // Should be logged out now
      expect(logoutCallback).toHaveBeenCalled();
    });
  });
});
