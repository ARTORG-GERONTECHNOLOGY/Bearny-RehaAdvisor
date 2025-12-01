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

  // For therapists requiring 2FA:
  partialLogin = false;   // <--- NEW FLAG

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
      const res = await apiClient.post('/auth/login/', {
        email: this.email,
        password: this.password,
      });

      const data = res.data;

      this.userType  = data.user_type;
      this.id        = data.id;

      // ----------------------------
      // THERAPIST = REQUIRE 2FA
      // ----------------------------
      if (data.require_2fa) {
        this.partialLogin = true;           // <--- Activate 2FA UI
        this.setAuthenticated(false);       // ensure NOT authenticated yet
        return;
      }

      // ----------------------------
      // PATIENT / ADMIN = FULL LOGIN
      // ----------------------------
      this.setTokens(data.access_token, data.refresh_token);
      this.setAuthenticated(true);
      this.partialLogin = false;
      this.startInactivityTimer();
      
    } catch (err: any) {
      this.setLoginError(err.response?.data?.error || 'Login failed');
    }
  }

  // Called from LoginForm after 2FA success
  complete2FA(accessToken: string, refreshToken: string) {
    this.partialLogin = false;
    this.setTokens(accessToken, refreshToken);
    this.setAuthenticated(true);
    this.startInactivityTimer();
  }

  logout = async () => {
    const userIdToSend = this.id;

    try {
      await apiClient.post('/auth/logout/', { userId: userIdToSend });
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
    this.partialLogin = false;
  }

  // ----------------------------
  // Session / inactivity
  // ----------------------------
  checkAuthentication(callback?: () => void) {
    const accessToken = localStorage.getItem('authToken');
    const expiresAtStr = localStorage.getItem(this.EXPIRES_AT_KEY);
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0;

    // Not authenticated
    if (!accessToken || !expiresAt) {
      this.reset();
      this.clearStorage();
      callback?.();
      return;
    }

    // Session expired
    if (Date.now() >= expiresAt) {
      this.reset();
      this.clearStorage();
      this.removeInactivityListeners();
      callback?.();
      return;
    }

    // Valid session -> restore user data
    this.restoreSession();
    this.setAuthenticated(true);
    this.startInactivityTimer();
  }


  startInactivityTimer() {
    this.removeInactivityListeners();

    const resetTimer = () => {
      this._markActivity();
      this._armTimeoutFromStorage();
    };

    this._resetTimer = resetTimer;

    const events: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart',
      'wheel', 'focus', 'visibilitychange', 'click',
    ];
    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    resetTimer(); // initial setup
  }

  removeInactivityListeners() {
    if (this._resetTimer) {
      const events: (keyof WindowEventMap)[] = [
        'mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart',
        'wheel', 'focus', 'visibilitychange', 'click',
      ];
      events.forEach((evt) => window.removeEventListener(evt, this._resetTimer!));
    }
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = undefined;
    }
  }

  private _markActivity() {
    const now = Date.now();
    const expiresAt = now + this.sessionTimeout;

    localStorage.setItem(this.LAST_ACTIVITY_KEY, String(now));
    localStorage.setItem(this.EXPIRES_AT_KEY, String(expiresAt));
  }

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
  setTokens(access: string, refresh: string) {
    localStorage.setItem('authToken', access);
    localStorage.setItem('refreshToken', refresh);
    localStorage.setItem('userType', this.userType);
    localStorage.setItem('id', this.id);
    localStorage.setItem('fullName', this.fullName);
    localStorage.setItem('specialisation', this.specialisation);

    this._markActivity();
  }

  restoreSession() {
    this.userType       = localStorage.getItem('userType') || '';
    this.id             = localStorage.getItem('id') || '';
    this.fullName       = localStorage.getItem('fullName') || '';
    this.specialisation = localStorage.getItem('specialisation') || '';
  }

  clearStorage() {
    const keys = [
      'authToken',
      'refreshToken',
      'userType',
      'id',
      'fullName',
      'specialisation',
      this.LAST_ACTIVITY_KEY,
      this.EXPIRES_AT_KEY,
      'sessionStart',
    ];
    keys.forEach((k) => localStorage.removeItem(k));
  }
}

export default new AuthStore();
