import { makeAutoObservable } from 'mobx';
import apiClient from '../api/client';

class AuthStore {
  // ───────────────────────────
  // Auth state
  // ───────────────────────────
  email = '';
  password = '';
  isAuthenticated = false;
  loginErrorMessage = '';
  userType = '';
  id = '';

  // User profile (display + logic)
  firstName = '';
  specialisations: string[] = [];

  // 2FA
  partialLogin = false;

  // Session handling
  sessionTimeout = 5 * 60 * 1000; // 5 minutes
  private _resetTimer?: () => void;
  private _timeoutId?: ReturnType<typeof setTimeout>;

  private readonly LAST_ACTIVITY_KEY = 'lastActivity';
  private readonly EXPIRES_AT_KEY = 'expiresAt';

  onLogoutCallback: (() => void) | null = null;

  constructor() {
    makeAutoObservable(this);
    this.checkAuthentication();

    // Sync logout across tabs
    window.addEventListener('storage', (e) => {
      if (e.key === this.EXPIRES_AT_KEY) {
        this._armTimeoutFromStorage();
      }
    });
  }

  // ───────────────────────────
  // Setters
  // ───────────────────────────
  setEmail = (email: string) => (this.email = email);
  setPassword = (password: string) => (this.password = password);
  setUserType = (userType: string) => (this.userType = userType);
  setId = (id: string) => (this.id = id);
  setAuthenticated = (val: boolean) => (this.isAuthenticated = val);
  setLoginError = (msg: string) => (this.loginErrorMessage = msg);

  setFirstName = (name: string) => {
    this.firstName = name;
    localStorage.setItem('firstName', name);
  };

  setSpecialisations = (specs: string[]) => {
    this.specialisations = specs;
    localStorage.setItem('specialisations', specs.join(','));
  };

  setOnLogoutCallback(callback: () => void) {
    this.onLogoutCallback = callback;
  }

  // ───────────────────────────
  // 🔥 Fetch profile from backend
  // ───────────────────────────
  async fetchAndStoreUserInfo(userId?: string) {
    const id = userId || this.id || localStorage.getItem('id');
    if (!id) return;

    try {
      const res = await apiClient.get(`/auth/get-user-info/${id}/`);
      const data = res.data || {};

      // Name
      if (data.first_name) {
        this.setFirstName(data.first_name);
      }

      // ✅ CORRECT HANDLING of backend payload:
      // "specialisation": ["Cardiology", "Neurology"]
      if (Array.isArray(data.specialisation)) {
        this.setSpecialisations(
          data.specialisation.map((s: string) => s.trim()).filter(Boolean)
        );
        return;
      }

      // "specialisation": "Cardiology,Neurology"
      if (typeof data.specialisation === 'string') {
        this.setSpecialisations(
          data.specialisation.map((s: string) => s.trim()).filter(Boolean)
        );
        return;
      }

      // Optional future-proofing
      if (Array.isArray(data.specialisations)) {
        this.setSpecialisations(
          data.specialisations.map((s: string) => s.trim()).filter(Boolean)
        );
        return;
      }

      if (typeof data.specialisations === 'string') {
        this.setSpecialisations(
          data.specialisationsmap((s: string) => s.trim()).filter(Boolean)
        );
        return;
      }

    } catch (err) {
      console.warn('Failed to fetch user info:', err);
    }
  }

  // ───────────────────────────
  // Login
  // ───────────────────────────
  async loginWithHttp() {
    try {
      const res = await apiClient.post('/auth/login/', {
        email: this.email,
        password: this.password,
      });

      const data = res.data;

      this.userType = data.user_type;
      this.id = data.id;

      // Persist minimal data early
      localStorage.setItem('userType', this.userType);
      localStorage.setItem('id', this.id);

      // 2FA path (therapists)
      if (data.require_2fa) {
        this.partialLogin = true;
        this.isAuthenticated = false;
        return;
      }

      // Normal login
      this.setTokens(data.access_token, data.refresh_token);
      this.isAuthenticated = true;
      this.partialLogin = false;
      this.startInactivityTimer();

      // 🔥 Fetch profile AFTER tokens exist
      await this.fetchAndStoreUserInfo(this.id);

    } catch (err: any) {
      this.setLoginError(err.response?.data?.error || 'Login failed');
    }
  }

  // Called after successful 2FA verification
  async complete2FA(accessToken: string, refreshToken: string) {
    this.partialLogin = false;
    this.setTokens(accessToken, refreshToken);
    this.isAuthenticated = true;
    this.startInactivityTimer();

    // 🔥 Fetch profile here too
    await this.fetchAndStoreUserInfo(this.id);
  }

  // ───────────────────────────
  // Logout
  // ───────────────────────────
  logout = async () => {
    const userId = localStorage.getItem('id') || this.id;

    try {
      if (userId) {
        await apiClient.post('/auth/logout/', { userId });
      }
    } catch {
      this.setLoginError('Logout logging failed.');
    }

    this.reset();

    const lang = localStorage.getItem('i18nextLng');
    localStorage.clear();
    if (lang) localStorage.setItem('i18nextLng', lang);

    this.removeInactivityListeners();

    if (this.onLogoutCallback) this.onLogoutCallback();
  };

  // ───────────────────────────
  // Session restore
  // ───────────────────────────
  checkAuthentication(callback?: () => void) {
    const token = localStorage.getItem('authToken');
    const expiresAtStr = localStorage.getItem(this.EXPIRES_AT_KEY);
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0;

    if (!token || !expiresAt || Date.now() >= expiresAt) {
      this.reset();
      this.clearStorage();
      callback?.();
      return;
    }

    this.isAuthenticated = true;
    this.userType = localStorage.getItem('userType') || '';
    this.id = localStorage.getItem('id') || '';
    this.firstName = localStorage.getItem('firstName') || '';

    const specs = localStorage.getItem('specialisations');
    this.specialisations = specs
      ? specs.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    this.startInactivityTimer();
  }

  // ───────────────────────────
  // Inactivity handling
  // ───────────────────────────
  startInactivityTimer() {
    this.removeInactivityListeners();

    const resetTimer = () => {
      this._markActivity();
      this._armTimeoutFromStorage();
    };

    this._resetTimer = resetTimer;

    [
      'mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart',
      'wheel', 'focus', 'visibilitychange', 'click',
    ].forEach((evt) =>
      window.addEventListener(evt as any, resetTimer, { passive: true })
    );

    resetTimer();
  }

  removeInactivityListeners() {
    if (this._resetTimer) {
      [
        'mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart',
        'wheel', 'focus', 'visibilitychange', 'click',
      ].forEach((evt) =>
        window.removeEventListener(evt as any, this._resetTimer!)
      );
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

  // ───────────────────────────
  // Storage helpers
  // ───────────────────────────
  setTokens(access: string, refresh: string) {
    localStorage.setItem('authToken', access);
    localStorage.setItem('refreshToken', refresh);
    localStorage.setItem('userType', this.userType);
    localStorage.setItem('id', this.id);
    this._markActivity();
  }

  clearStorage() {
    const lang = localStorage.getItem('i18nextLng');
    localStorage.clear();
    if (lang) localStorage.setItem('i18nextLng', lang);
  }

  reset() {
    this.email = '';
    this.password = '';
    this.loginErrorMessage = '';
    this.isAuthenticated = false;
    this.userType = '';
    this.id = '';
    this.firstName = '';
    this.specialisations = [];
    this.partialLogin = false;
  }
}

export default new AuthStore();
