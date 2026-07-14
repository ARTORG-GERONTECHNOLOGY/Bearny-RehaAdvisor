import axios from 'axios';
import authStore from '@/stores/authStore';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));
jest.mock('axios');

describe('authStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    jest.clearAllMocks();
    authStore.reset();
    authStore.removeInactivityListeners();
  });

  it('sets email and password', () => {
    authStore.setEmail('test@example.com');
    authStore.setPassword('pass123');

    expect(authStore.email).toBe('test@example.com');
    expect(authStore.password).toBe('pass123');
  });

  describe('getStoredUserId', () => {
    it('prefers the in-memory id over a stale localStorage-persisted id', () => {
      authStore.setId('memory-id');
      localStorage.setItem('id', 'storage-id');

      expect(authStore.getStoredUserId()).toBe('memory-id');
    });

    it('falls back to localStorage when there is no in-memory id', () => {
      localStorage.setItem('id', 'storage-id');

      expect(authStore.getStoredUserId()).toBe('storage-id');
    });

    it('returns an empty string when neither source has an id', () => {
      expect(authStore.getStoredUserId()).toBe('');
    });
  });

  it('handles failed login', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({});
    authStore.setEmail('x@example.com');
    authStore.setPassword('wrong');

    await authStore.loginWithHttp();

    expect(authStore.loginErrorMessage).toMatch(/Login failed/i);
  });

  it('logs out and resets state', async () => {
    localStorage.setItem('authToken', 'tok');
    localStorage.setItem('i18nextLng', 'de');
    localStorage.setItem('notifications-enabled', 'true');
    sessionStorage.setItem('healthPageStore', '{"key":"value"}');

    authStore.setId('1');
    authStore.setFirstName('Name');
    const callback = jest.fn();
    authStore.setOnLogoutCallback(callback);

    await authStore.logout();

    expect(authStore.firstName).toBe('');
    expect(callback).toHaveBeenCalled();

    // sessionStorage must be fully cleared
    expect(sessionStorage.length).toBe(0);
    // auth keys must be gone from localStorage
    expect(localStorage.getItem('authToken')).toBeNull();
    // language and notification prefs must be preserved
    expect(localStorage.getItem('i18nextLng')).toBe('de');
    expect(localStorage.getItem('notifications-enabled')).toBe('true');
  });

  it('restores session if session is still valid', async () => {
    const futureTime = Date.now() + 3600000; // 1 hour from now
    localStorage.setItem('expiresAt', futureTime.toString());
    localStorage.setItem('userType', 'Therapist');
    localStorage.setItem('id', '123');
    localStorage.setItem('firstName', 'Jane');
    localStorage.setItem('specialisations', 'Neuro');

    const startTimerSpy = jest.spyOn(authStore, 'startInactivityTimer');

    authStore.checkAuthentication();
    // checkAuthentication always calls _trySilentRefresh (async) — flush microtasks
    await Promise.resolve();
    await Promise.resolve();

    expect(authStore.isAuthenticated).toBe(true);
    expect(authStore.userType).toBe('Therapist');
    expect(startTimerSpy).toHaveBeenCalled();
  });

  it('resets state if session is expired and silent refresh fails', async () => {
    const oldTime = Date.now() - 1000;
    localStorage.setItem('id', '123');
    localStorage.setItem('expiresAt', oldTime.toString());
    // Simulate expired/missing refresh cookie by making the refresh call fail
    (axios.post as jest.Mock).mockRejectedValueOnce(new Error('401'));

    const resetSpy = jest.spyOn(authStore, 'reset');

    authStore.checkAuthentication();
    await Promise.resolve();
    await Promise.resolve();

    expect(resetSpy).toHaveBeenCalled();
    expect(authStore.isAuthenticated).toBe(false);
  });

  it('stays authenticated if session is expired but silent refresh succeeds', async () => {
    const oldTime = Date.now() - 1000;
    localStorage.setItem('expiresAt', oldTime.toString());
    localStorage.setItem('userType', 'Therapist');
    localStorage.setItem('id', '42');

    (axios.post as jest.Mock).mockResolvedValueOnce({ data: {} });

    authStore.checkAuthentication();
    await Promise.resolve();
    await Promise.resolve();

    expect(authStore.isAuthenticated).toBe(true);
  });

  it('logs out if session is expired and silent refresh fails', async () => {
    const oldTime = Date.now() - 1000;
    localStorage.setItem('id', '42');
    localStorage.setItem('expiresAt', oldTime.toString());

    (axios.post as jest.Mock).mockRejectedValueOnce(new Error('401'));

    const resetSpy = jest.spyOn(authStore, 'reset');
    const callback = jest.fn();

    authStore.checkAuthentication(callback);
    await Promise.resolve();
    await Promise.resolve();

    expect(resetSpy).toHaveBeenCalled();
    expect(callback).toHaveBeenCalled();
    expect(authStore.isAuthenticated).toBe(false);
  });

  it('starts inactivity timer and sets up event listeners', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const clearSpy = jest.spyOn(window, 'removeEventListener');

    authStore.startInactivityTimer();

    // The implementation adds multiple events including mousemove, mousedown, keydown, etc.
    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function), { passive: true });
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), { passive: true });
    expect(addSpy).toHaveBeenCalledWith('mousedown', expect.any(Function), { passive: true });

    authStore.removeInactivityListeners();

    expect(clearSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(clearSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  describe('remaining setters', () => {
    it('setUserType persists to localStorage', () => {
      authStore.setUserType('Therapist');
      expect(authStore.userType).toBe('Therapist');
      expect(localStorage.getItem('userType')).toBe('Therapist');
    });

    it('setAuthenticated toggles isAuthenticated', () => {
      authStore.setAuthenticated(true);
      expect(authStore.isAuthenticated).toBe(true);
    });

    it('setSpecialisations trims, filters empties, and persists as CSV', () => {
      authStore.setSpecialisations([' Neuro ', '', 'Cardio']);
      expect(authStore.specialisations).toEqual(['Neuro', 'Cardio']);
      expect(localStorage.getItem('specialisations')).toBe('Neuro,Cardio');
    });

    it('setPreferredLanguage persists to localStorage', () => {
      authStore.setPreferredLanguage('de');
      expect(authStore.preferredLanguage).toBe('de');
      expect(localStorage.getItem('preferredLanguage')).toBe('de');
    });

    it('setTokens persists identity and marks activity', () => {
      authStore.setUserType('Admin');
      authStore.setId('u1');
      authStore.setTokens('access', 'refresh');

      expect(localStorage.getItem('userType')).toBe('Admin');
      expect(localStorage.getItem('id')).toBe('u1');
      expect(localStorage.getItem('expiresAt')).not.toBeNull();
      expect(localStorage.getItem('accessTokenExpiresAt')).not.toBeNull();
    });
  });

  describe('fetchAndStoreUserInfo', () => {
    it('does nothing when there is no user id available', async () => {
      await authStore.fetchAndStoreUserInfo();
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('parses an array-shaped specialisation payload and stores profile fields', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: {
          first_name: 'Jane',
          specialisation: ['Neuro', 'Cardio'],
          preferred_language: 'en',
          clinic: 'Inselspital',
          project: 'COPAIN',
        },
      });

      await authStore.fetchAndStoreUserInfo('u1');

      expect(apiClient.get).toHaveBeenCalledWith('/auth/get-user-info/u1/');
      expect(authStore.firstName).toBe('Jane');
      expect(authStore.specialisations).toEqual(['Neuro', 'Cardio']);
      expect(authStore.preferredLanguage).toBe('en');
      expect(authStore.clinic).toBe('Inselspital');
      expect(authStore.project).toBe('COPAIN');
    });

    it('parses a comma-separated string specialisation payload', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { specializations: 'Neuro, Cardio' },
      });

      await authStore.fetchAndStoreUserInfo('u1');

      expect(authStore.specialisations).toEqual(['Neuro', 'Cardio']);
    });

    it('warns and does not throw when the profile fetch fails', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('network down'));

      await expect(authStore.fetchAndStoreUserInfo('u1')).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('loginWithHttp', () => {
    it('enters the 2FA path without setting tokens', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { user_type: 'Therapist', id: 'u1', require_2fa: true },
      });

      authStore.setEmail('a@b.com');
      authStore.setPassword('pw');
      await authStore.loginWithHttp();

      expect(authStore.partialLogin).toBe(true);
      expect(authStore.isAuthenticated).toBe(false);
    });

    it('logs in normally, starts the timer, and fetches the profile', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { user_type: 'Therapist', id: 'u1', access_token: 'a', refresh_token: 'r' },
      });
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: { first_name: 'Jane' } });
      const startTimerSpy = jest.spyOn(authStore, 'startInactivityTimer');

      authStore.setEmail('a@b.com');
      authStore.setPassword('pw');
      await authStore.loginWithHttp();

      expect(authStore.isAuthenticated).toBe(true);
      expect(authStore.partialLogin).toBe(false);
      expect(startTimerSpy).toHaveBeenCalled();
      expect(apiClient.get).toHaveBeenCalledWith('/auth/get-user-info/u1/');

      authStore.removeInactivityListeners();
    });
  });

  describe('complete2FA', () => {
    it('finalizes login after 2FA verification', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: {} });
      authStore.setId('u1');
      authStore.partialLogin = true;

      const startTimerSpy = jest.spyOn(authStore, 'startInactivityTimer');
      await authStore.complete2FA('access', 'refresh');

      expect(authStore.partialLogin).toBe(false);
      expect(authStore.isAuthenticated).toBe(true);
      expect(startTimerSpy).toHaveBeenCalled();

      authStore.removeInactivityListeners();
    });
  });

  describe('checkAuthentication — fresh access token fast path', () => {
    it('restores session synchronously without a network call', async () => {
      localStorage.setItem('expiresAt', String(Date.now() + 3600000));
      localStorage.setItem('accessTokenExpiresAt', String(Date.now() + 200000));
      localStorage.setItem('userType', 'Therapist');
      localStorage.setItem('id', '123');

      await authStore.checkAuthentication();

      expect(authStore.isAuthenticated).toBe(true);
      expect(axios.post).not.toHaveBeenCalled();

      authStore.removeInactivityListeners();
    });
  });

  describe('cross-tab sync via the storage event', () => {
    it('re-arms the timeout when another tab updates expiresAt', () => {
      const armSpy = jest.spyOn(authStore as any, '_armTimeoutFromStorage');
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'expiresAt', newValue: String(Date.now() + 60000) })
      );
      expect(armSpy).toHaveBeenCalled();
      armSpy.mockRestore();
    });

    it('resets local state when another tab logs out', () => {
      authStore.setId('u1');
      window.dispatchEvent(new StorageEvent('storage', { key: 'id', newValue: null }));
      expect(authStore.id).toBe('');
    });
  });
});
