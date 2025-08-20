// src/stores/authStore.ts
import { makeAutoObservable } from 'mobx';
import apiClient from '../api/client';
import { AuthPayload } from '../types/index'; // keep your existing type

class AuthStore {
  // --- User/Auth state ---
  email = '';
  password = '';
  isAuthenticated = false;
  loginErrorMessage = '';
  userType = '';
  id = '';
  fullName = '';
  specialisation = '';

  // --- Session / inactivity ---
  sessionTimeout = 5 * 60 * 1000; // 5 minutes

  private _resetTimer?: () => void;
  private _timeoutId?: ReturnType<typeof setTimeout>;

  // localStorage keys (scoped constants)
  private readonly LAST_ACTIVITY_KEY = 'lastActivity'; // ms epoch
  private readonly EXPIRES_AT_KEY   = 'expiresAt';     // ms epoch

  onLogoutCallback: (() => void) | null = null;

  constructor() {
    makeAutoObservable(this);
    this.checkAuthentication();

    // Keep multiple tabs in sync: when another tab extends expiration, re-arm here.
    window.addEventListener('storage', (e) => {
      if (e.key === this.EXPIRES_AT_KEY) {
        this._armTimeoutFromStorage();
      }
    });
  }

  // ----------------------------
  // Setters
  // ----------------------------
  setEmail = (email: string) => (this.email = email);
  setPassword = (password: string) => (this.password = password);
  setUserType = (userType: string) => (this.userType = userType);
  setId = (id: string) => (this.id = id);
  setFullName = (name: string) => (this.fullName = name);
  setSpecialisation = (spec: string) => (this.specialisation = spec);
  setAuthenticated = (val: boolean) => (this.isAuthenticated = val);
  setLoginError = (msg: string) => (this.loginErrorMessage = msg);

  setOnLogoutCallback(callback: () => void) {
    this.onLogoutCallback = callback;
  }

  // ----------------------------
  // Auth methods
  // ----------------------------
  async loginWithHttp() {
    try {
      const response = await apiClient.post('/auth/login/', {
        email: this.email,
        password: this.password,
      });

      if (response.status === 200 && response.data) {
        const { access_token, refresh_token, user_type, id, full_name, specialisation } =
          response.data;

        // Set state
        this.setLoginError('');
        this.setUserType(user_type);
        this.setId(id);
        this.setFullName(full_name);
        this.setSpecialisation(specialisation);
        this.setAuthenticated(true); // IMPORTANT

        // Persist tokens & profile
        this.persistAuthData({
          access_token,
          refresh_token,
          user_type,
          id,
          full_name,
          specialisation,
        });

        // Mark activity -> sets lastActivity & expiresAt
        this._markActivity();

        // Start inactivity timer & listeners
        this.startInactivityTimer();
      } else {
        this.setLoginError('Invalid credentials, please try again.');
      }
    } catch {
      this.setLoginError('Login failed. Please check your credentials or try again later.');
    }
  }

  logout = async () => {
    // Capture userId before reset
    const userIdToSend = this.id;

    try {
      await apiClient.post('auth/logout/', { userId: userIdToSend });
    } catch {
      this.setLoginError('Logout logging failed.');
    }

    this.reset();
    this.clearStorage();
    this.removeInactivityListeners();

    if (this.onLogoutCallback) {
      this.onLogoutCallback();
    }
  };

  deleteUser() {
    // Just a helper you already had
    this.reset();
    this.clearStorage();
  }

  reset() {
    this.email = '';
    this.password = '';
    this.loginErrorMessage = '';
    this.isAuthenticated = false;
    this.userType = '';
    this.id = '';
    this.fullName = '';
    this.specialisation = '';
  }

  // ----------------------------
  // Session / inactivity
  // ----------------------------
  checkAuthentication(callback?: () => void) {
    const accessToken = localStorage.getItem('authToken');
    const expiresAtStr = localStorage.getItem(this.EXPIRES_AT_KEY);
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0;

    if (!accessToken || !expiresAt) {
      this.reset();
      this.clearStorage();
      callback?.();
      return;
    }

    if (Date.now() < expiresAt) {
      // Session still valid
      this.restoreSession();
      this.setAuthenticated(true);
      this.startInactivityTimer();
    } else {
      // Expired
      this.reset();
      this.clearStorage();
      this.removeInactivityListeners();
      callback?.();
    }
  }

  startInactivityTimer() {
    this.removeInactivityListeners();

    // One function we can attach to many events and remove later
    const resetTimer = () => {
      this._markActivity();          // persist lastActivity + expiresAt
      this._armTimeoutFromStorage(); // arm timeout using saved expiresAt
    };

    this._resetTimer = resetTimer;

    // Broad set of interactions that count as "activity"
    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'wheel',
      'focus',
      'visibilitychange',
      'click',
    ];
    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    // Kick it off immediately
    resetTimer();
  }

  removeInactivityListeners() {
    if (this._resetTimer) {
      const events: (keyof WindowEventMap)[] = [
        'mousemove',
        'mousedown',
        'keydown',
        'scroll',
        'touchstart',
        'wheel',
        'focus',
        'visibilitychange',
        'click',
      ];
      events.forEach((evt) => window.removeEventListener(evt, this._resetTimer!));
    }
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = undefined;
    }
  }

  /**
   * Persist an activity tick and extend expiry.
   * Stores both lastActivity and expiresAt in localStorage for cross-tab sync.
   */
  private _markActivity() {
    const now = Date.now();
    const expiresAt = now + this.sessionTimeout;
    localStorage.setItem(this.LAST_ACTIVITY_KEY, String(now));
    localStorage.setItem(this.EXPIRES_AT_KEY, String(expiresAt));
  }

  /**
   * Arms a timeout to call logout when expiresAt is reached.
   * Reads expiresAt from localStorage so all tabs share the same clock.
   */
  private _armTimeoutFromStorage() {
    if (this._timeoutId) clearTimeout(this._timeoutId);

    const expiresAtStr = localStorage.getItem(this.EXPIRES_AT_KEY);
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0;
    const msRemaining = Math.max(0, expiresAt - Date.now());

    this._timeoutId = setTimeout(() => this.logout(), msRemaining);
  }

  // ----------------------------
  // Storage helpers
  // ----------------------------
  persistAuthData(data: AuthPayload) {
    localStorage.setItem('authToken', data.access_token);
    localStorage.setItem('refreshToken', data.refresh_token);
    localStorage.setItem('userType', data.user_type);
    localStorage.setItem('id', data.id);
    localStorage.setItem('fullName', data.full_name);
    localStorage.setItem('specialisation', data.specialisation);

    // Legacy key — no longer used, but we remove it in clearStorage
    localStorage.setItem('sessionStart', Date.now().toString());
  }

  restoreSession() {
    this.setAuthenticated(true);
    this.setUserType(localStorage.getItem('userType') || '');
    this.setId(localStorage.getItem('id') || '');
    this.setFullName(localStorage.getItem('fullName') || '');
    this.setSpecialisation(localStorage.getItem('specialisation') || '');
  }

  clearStorage() {
    // Only remove what we own; don't nuke unrelated app data
    const keys = [
      'authToken',
      'refreshToken',
      'userType',
      'id',
      'fullName',
      'specialisation',
      this.LAST_ACTIVITY_KEY,
      this.EXPIRES_AT_KEY,
      'sessionStart', // legacy
    ];
    keys.forEach((k) => localStorage.removeItem(k));
  }
}

export default new AuthStore();
