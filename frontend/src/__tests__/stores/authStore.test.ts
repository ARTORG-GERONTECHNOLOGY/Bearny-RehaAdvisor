import authStore from '../../stores/authStore';
import apiClient from '../../api/client';

jest.mock('../../api/client', () => require('../../__mocks__/api/client'));

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('sets email and password', () => {
    authStore.setEmail('test@example.com');
    authStore.setPassword('pass123');

    expect(authStore.email).toBe('test@example.com');
    expect(authStore.password).toBe('pass123');
  });

  it('persists auth data to localStorage', () => {
    const payload = {
      access_token: 'access',
      refresh_token: 'refresh',
      user_type: 'Therapist',
      id: '1',
      full_name: 'John Doe',
      specialisation: 'Neuro',
    };

    authStore.persistAuthData(payload);
    expect(localStorage.getItem('authToken')).toBe('access');
    expect(localStorage.getItem('sessionStart')).not.toBeNull();
  });

  it('restores session', () => {
    localStorage.setItem('userType', 'Therapist');
    localStorage.setItem('id', '123');
    localStorage.setItem('fullName', 'Jane');
    localStorage.setItem('specialisation', 'Stroke');

    authStore.restoreSession();

    expect(authStore.userType).toBe('Therapist');
    expect(authStore.fullName).toBe('Jane');
  });

  it('handles failed login', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({});
    authStore.setEmail('x@example.com');
    authStore.setPassword('wrong');

    await authStore.loginWithHttp();

    expect(authStore.loginErrorMessage).toMatch(/Login failed/i);
  });

  it('logs out and resets state', async () => {
    authStore.setId('1');
    authStore.setFullName('Name');
    const callback = jest.fn();
    authStore.setOnLogoutCallback(callback);

    await authStore.logout();

    expect(authStore.fullName).toBe('');
    expect(callback).toHaveBeenCalled();
  });

  it('deletes user', () => {
    authStore.setEmail('del@example.com');
    authStore.deleteUser();

    expect(authStore.email).toBe('');
    expect(localStorage.length).toBe(0);
  });
  it('restores session if session is still valid', () => {
    const now = Date.now();
    localStorage.setItem('authToken', 'token');
    localStorage.setItem('sessionStart', now.toString());
    localStorage.setItem('userType', 'Therapist');
    localStorage.setItem('id', '123');
    localStorage.setItem('fullName', 'Jane Doe');
    localStorage.setItem('specialisation', 'Neuro');

    // Spy on startInactivityTimer to confirm it's triggered
    const startTimerSpy = jest.spyOn(authStore, 'startInactivityTimer');

    authStore.checkAuthentication();

    expect(authStore.isAuthenticated).toBe(true);
    expect(authStore.userType).toBe('Therapist');
    expect(startTimerSpy).toHaveBeenCalled();
  });
  it('resets state if session is expired', () => {
    const oldTime = Date.now() - (authStore.sessionTimeout + 1000); // Expired
    localStorage.setItem('authToken', 'token');
    localStorage.setItem('sessionStart', oldTime.toString());

    const resetSpy = jest.spyOn(authStore, 'reset');

    authStore.checkAuthentication();

    expect(resetSpy).toHaveBeenCalled();
    expect(authStore.isAuthenticated).toBe(false);
  });
  it('resets state if session is expired', () => {
    const oldTime = Date.now() - (authStore.sessionTimeout + 1000); // Expired
    localStorage.setItem('authToken', 'token');
    localStorage.setItem('sessionStart', oldTime.toString());

    const resetSpy = jest.spyOn(authStore, 'reset');

    authStore.checkAuthentication();

    expect(resetSpy).toHaveBeenCalled();
    expect(authStore.isAuthenticated).toBe(false);
  });
  it('starts inactivity timer and sets up event listeners', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const clearSpy = jest.spyOn(window, 'removeEventListener');

    authStore.startInactivityTimer();

    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

    authStore.removeInactivityListeners();

    expect(clearSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(clearSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
