// src/stores/authStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';

type UserType = 'Admin' | 'Therapist' | 'Researcher' | 'Patient' | '';

class AuthStore {
  // ───────────────────────────
  // Auth state
  // ───────────────────────────
  email = '';
  password = '';
  isAuthenticated = false;
  loginErrorMessage = '';
  userType: UserType = '';
  id = '';

  // User profile (display + logic)
  firstName = '';
  specialisations: string[] = [];

  // 2FA
  partialLogin = false;

  // Session handling
  sessionTimeout = 15 * 60 * 1000; // 15 minutes
  private _resetTimer?: () => void;
  private _timeoutId?: ReturnType<typeof setTimeout>;

  private readonly LAST_ACTIVITY_KEY = 'lastActivity';
  private readonly EXPIRES_AT_KEY = 'expiresAt';

  onLogoutCallback: (() => void) | null = null;

  constructor() {
    makeAutoObservable(this);

    // Restore session state on init
    this.checkAuthentication();

    // Sync timeout/logout across tabs
    window.addEventListener('storage', (e) => {
      if (e.key === this.EXPIRES_AT_KEY) {
        this._armTimeoutFromStorage();
      }
      // If another tab cleared tokens, reflect here quickly
      if (e.key === 'authToken' && !e.newValue) {
        this.reset();
        this.removeInactivityListeners();
      }
    });
  }

  // ───────────────────────────
  // Setters
  // ───────────────────────────
  setEmail = (email: string) => {
    this.email = email;
  };

  setPassword = (password: string) => {
    this.password = password;
  };

  setUserType = (userType: UserType) => {
    this.userType = userType;
    localStorage.setItem('userType', userType);
  };

  setId = (id: string) => {
    this.id = id;
    localStorage.setItem('id', id);
  };

  setAuthenticated = (val: boolean) => {
    this.isAuthenticated = val;
  };

  setLoginError = (msg: string) => {
    this.loginErrorMessage = msg;
  };

  setFirstName = (name: string) => {
    this.firstName = name;
    localStorage.setItem('firstName', name);
  };

  setSpecialisations = (specs: string[]) => {
    const cleaned = (specs || []).map((s) => s.trim()).filter(Boolean);
    this.specialisations = cleaned;
    localStorage.setItem('specialisations', cleaned.join(','));
  };

  setOnLogoutCallback(callback: () => void) {
    this.onLogoutCallback = callback;
  }

  // ───────────────────────────
  // Helpers
  // ───────────────────────────
  private _getStoredUserId() {
    return this.id || localStorage.getItem('id') || '';
  }

  private _parseSpecialisationsFromPayload(data: any): string[] {
    // Backend might send: specialisation OR specialisations; as array or comma string
    const val =
      data?.specialisation ??
      data?.specialisations ??
      data?.specialization ??
      data?.specializations;

    if (Array.isArray(val)) {
      return val.map((s: any) => String(s).trim()).filter(Boolean);
    }

    if (typeof val === 'string') {
      // ✅ FIX: split string, do NOT call .map() on string
      return val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    return [];
  }

  // ───────────────────────────
  // 🔥 Fetch profile from backend (and store in authStore)
  // ───────────────────────────
  async fetchAndStoreUserInfo(userId?: string) {
    const id = userId || this._getStoredUserId();
    if (!id) return;

    try {
      const res = await apiClient.get(`/auth/get-user-info/${id}/`);
      const data = res.data || {};

      runInAction(() => {
        if (data.first_name) this.setFirstName(String(data.first_name));
        const specs = this._parseSpecialisationsFromPayload(data);
        if (specs.length) this.setSpecialisations(specs);
      });
    } catch (err) {
      console.warn('Failed to fetch user info:', err);
    }
  }

  // ───────────────────────────
  // Login
  // ───────────────────────────
  async loginWithHttp() {
    this.loginErrorMessage = '';

    try {
      const res = await apiClient.post('/auth/login/', {
        email: this.email,
        password: this.password,
      });

      const data = res.data || {};

      runInAction(() => {
        this.userType = (data.user_type || '') as UserType;
        this.id = String(data.id || '');

        // Persist minimal identity early
        localStorage.setItem('userType', this.userType);
        localStorage.setItem('id', this.id);
      });

      // 2FA path (therapists)
      if (data.require_2fa) {
        runInAction(() => {
          this.partialLogin = true;
          this.isAuthenticated = false;
        });
        return;
      }

      // Normal login
      this.setTokens(data.access_token, data.refresh_token);

      runInAction(() => {
        this.isAuthenticated = true;
        this.partialLogin = false;
      });

      this.startInactivityTimer();

      // Fetch profile after tokens exist
      await this.fetchAndStoreUserInfo(this.id);
    } catch (err: any) {
      runInAction(() => {
        this.setLoginError(err?.response?.data?.error || 'Login failed');
        this.isAuthenticated = false;
        this.partialLogin = false;
      });
    }
  }

  // Called after successful 2FA verification
  async complete2FA(accessToken: string, refreshToken: string) {
    this.partialLogin = false;
    this.setTokens(accessToken, refreshToken);

    runInAction(() => {
      this.isAuthenticated = true;
    });

    this.startInactivityTimer();

    await this.fetchAndStoreUserInfo(this.id);
  }

  // ───────────────────────────
  // Logout
  // ───────────────────────────
  logout = async () => {
    const userId = this._getStoredUserId();

    try {
      if (userId) {
        // Best-effort audit log, don't block logout if it fails
        await apiClient.post('/auth/logout/', { userId });
      }
    } catch {
      // do not keep stale error visible; logout should proceed
    }

    this.reset();

    // preserve language
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

    if (!token || !expiresAt || Number.isNaN(expiresAt) || Date.now() >= expiresAt) {
      this.reset();
      this.clearStorage();
      callback?.();
      return;
    }

    // Restore session state
    runInAction(() => {
      this.isAuthenticated = true;
      this.userType = (localStorage.getItem('userType') || '') as UserType;
      this.id = localStorage.getItem('id') || '';
      this.firstName = localStorage.getItem('firstName') || '';

      const specs = localStorage.getItem('specialisations');
      this.specialisations = specs
        ? specs.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      this.partialLogin = false;
      this.loginErrorMessage = '';
    });

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

    const events = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'wheel',
      'focus',
      'visibilitychange',
      'click',
    ] as const;

    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    resetTimer();
  }

  removeInactivityListeners() {
    if (this._resetTimer) {
      const events = [
        'mousemove',
        'mousedown',
        'keydown',
        'scroll',
        'touchstart',
        'wheel',
        'focus',
        'visibilitychange',
        'click',
      ] as const;

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

    if (!expiresAt || Number.isNaN(expiresAt)) {
      // If storage is corrupted, logout safely
      this.logout();
      return;
    }

    const msRemaining = Math.max(0, expiresAt - Date.now());
    this._timeoutId = setTimeout(() => this.logout(), msRemaining);
  }

  // ───────────────────────────
  // Storage helpers
  // ───────────────────────────
  setTokens(access: string, refresh: string) {
    localStorage.setItem('authToken', access);
    localStorage.setItem('refreshToken', refresh);

    // Keep identity in sync
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
    runInAction(() => {
      this.email = '';
      this.password = '';
      this.loginErrorMessage = '';
      this.isAuthenticated = false;
      this.userType = '';
      this.id = '';
      this.firstName = '';
      this.specialisations = [];
      this.partialLogin = false;
    });
  }
}

export default new AuthStore();
