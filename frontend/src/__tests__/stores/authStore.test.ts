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
});
