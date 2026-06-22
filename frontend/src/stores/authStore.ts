// src/stores/authStore.ts
import axios from 'axios';
import * as Sentry from '@sentry/react';
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';

const API_BASE_URL = import.meta.env.VITE_API_URL as string;

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
  preferredLanguage = '';
  clinic = '';
  project = '';

  // 2FA
  partialLogin = false;

  // Session handling
  sessionTimeout = 15 * 60 * 1000; // 15 minutes
  private _resetTimer?: () => void;
  private _timeoutId?: ReturnType<typeof setTimeout>;
  private _refreshPromise: Promise<boolean> | null = null;

  private readonly LAST_ACTIVITY_KEY = 'lastActivity';
  private readonly EXPIRES_AT_KEY = 'expiresAt';
  // Tracks when the access-token cookie was last issued (login or refresh).
  // Stored in localStorage so it survives page reloads. Used to skip redundant
  // refresh calls on rapid sequential loads (e.g. E2E: login → reload → goto).
  private readonly ACCESS_TOKEN_EXP_KEY = 'accessTokenExpiresAt';
  // 4.5 min — 30 s buffer before the 5-min access-token TTL.
  private readonly ACCESS_TOKEN_LIFETIME_MS = 270_000;

  onLogoutCallback: (() => void) | null = null;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    makeAutoObservable(this, { _refreshPromise: false } as any);

    // Restore session state on init
    this.checkAuthentication();

    // Sync timeout/logout across tabs via expiresAt key.
    // Tokens are now httpOnly cookies so we no longer watch 'authToken'.
    window.addEventListener('storage', (e) => {
      if (e.key === this.EXPIRES_AT_KEY) {
        this._armTimeoutFromStorage();
      }
      // If another tab logged out it clears 'id' from localStorage — mirror here
      if (e.key === 'id' && !e.newValue) {
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

  setPreferredLanguage = (lang: string) => {
    this.preferredLanguage = lang;
    localStorage.setItem('preferredLanguage', lang);
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
        if (data.preferred_language) this.setPreferredLanguage(String(data.preferred_language));
        if (data.clinic !== undefined) {
          this.clinic = String(data.clinic || '');
          localStorage.setItem('clinic', this.clinic);
        }
        if (data.project !== undefined) {
          this.project = String(data.project || '');
          localStorage.setItem('project', this.project);
        }
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

      Sentry.logger.info('User logged in', { userId: this.id, userType: this.userType });
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

    Sentry.logger.info('User logged in via 2FA', { userId: this.id, userType: this.userType });
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

    this.clearStorage();

    this.removeInactivityListeners();

    if (this.onLogoutCallback) this.onLogoutCallback();
  };

  // ───────────────────────────
  // Silent token refresh
  //
  // Attempts to exchange the stored refresh token for a new access token
  // WITHOUT going through the apiClient interceptor (which would itself
  // trigger another 401 cycle). Returns true on success, false on failure.
  // ───────────────────────────
  private _trySilentRefresh(): Promise<boolean> {
    // Deduplicate: if a refresh is already in-flight, reuse that Promise.
    // Without this, the constructor call and a page-level useEffect call can
    // both race to the token endpoint simultaneously. With ROTATE_REFRESH_TOKENS
    // enabled, the first response blacklists the old cookie, causing the second
    // concurrent request to fail with 401 → reset() → unexpected redirect.
    if (this._refreshPromise) return this._refreshPromise;

    const p = (async (): Promise<boolean> => {
      try {
        // No body needed — refresh_token httpOnly cookie is sent automatically.
        await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {}, { withCredentials: true });
        this._markActivity();
        return true;
      } catch {
        return false;
      } finally {
        this._refreshPromise = null;
      }
    })();

    this._refreshPromise = p;
    return p;
  }

  // ───────────────────────────
  // Session restore
  // ───────────────────────────
  checkAuthentication(callback?: () => void): Promise<void> {
    // Tokens are now stored as httpOnly cookies — we can't read them in JS.
    // Use 'id' in localStorage as the "was previously logged in" signal, then
    // verify the session is still live via the refresh endpoint when needed.
    const hasId = !!localStorage.getItem('id');
    if (!hasId) {
      callback?.();
      return Promise.resolve();
    }

    const expiresAtStr = localStorage.getItem(this.EXPIRES_AT_KEY);
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0;
    const sessionExpired = !expiresAt || Number.isNaN(expiresAt) || Date.now() >= expiresAt;

    const handleResult = (ok: boolean) => {
      if (ok) {
        this._restoreSessionState();
        this.startInactivityTimer();
      } else {
        this.reset();
        this.clearStorage();
        callback?.();
      }
    };

    // Session itself is expired — must verify via network.
    if (sessionExpired) {
      return this._trySilentRefresh().then(handleResult);
    }

    // Session is valid. Check if the access-token cookie is still fresh.
    // _markActivity() writes ACCESS_TOKEN_EXP_KEY whenever a refresh succeeds
    // or the user logs in, so rapid page loads (reload → goto, SPA navigation)
    // can skip the network round-trip and restore state synchronously.
    // If the key is absent or stale the access token may be expired — refresh.
    const accessExpStr = localStorage.getItem(this.ACCESS_TOKEN_EXP_KEY);
    const accessExp = accessExpStr ? parseInt(accessExpStr, 10) : 0;
    const accessExpired = !accessExp || Number.isNaN(accessExp) || Date.now() >= accessExp;

    if (!accessExpired) {
      // Access token is still within its freshness window — restore immediately.
      this._restoreSessionState();
      this.startInactivityTimer();
      return Promise.resolve();
    }

    // Access token may be expired — do a proactive refresh so the next API
    // call doesn't immediately hit a 401.
    return this._trySilentRefresh().then(handleResult);
  }

  private _restoreSessionState() {
    runInAction(() => {
      this.isAuthenticated = true;
      this.userType = (localStorage.getItem('userType') || '') as UserType;
      this.id = localStorage.getItem('id') || '';
      this.firstName = localStorage.getItem('firstName') || '';

      const specs = localStorage.getItem('specialisations');
      this.specialisations = specs
        ? specs
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      this.preferredLanguage = localStorage.getItem('preferredLanguage') || '';
      this.clinic = localStorage.getItem('clinic') || '';
      this.project = localStorage.getItem('project') || '';
      this.partialLogin = false;
      this.loginErrorMessage = '';
    });
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
    localStorage.setItem(this.ACCESS_TOKEN_EXP_KEY, String(now + this.ACCESS_TOKEN_LIFETIME_MS));
  }

  private _armTimeoutFromStorage() {
    if (this._timeoutId) clearTimeout(this._timeoutId);

    const expiresAtStr = localStorage.getItem(this.EXPIRES_AT_KEY);
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0;

    if (!expiresAt || Number.isNaN(expiresAt)) {
      // expiresAt is corrupted/missing — attempt a silent refresh before
      // giving up, so a localStorage corruption doesn't cause a spurious logout.
      this._trySilentRefresh().then((ok) => {
        if (!ok) this.logout();
        // If ok, _markActivity() inside _trySilentRefresh already wrote a
        // fresh expiresAt — let the next activity event rearm the timer.
      });
      return;
    }

    const msRemaining = Math.max(0, expiresAt - Date.now());
    this._timeoutId = setTimeout(() => this.logout(), msRemaining);
  }

  // ───────────────────────────
  // Storage helpers
  // ───────────────────────────
  setTokens(_access: string, _refresh: string) {
    // Tokens are now stored as httpOnly cookies by the backend — nothing to
    // write here. We only persist non-sensitive identity so the UI can restore
    // state on page reload without an extra profile fetch.
    localStorage.setItem('userType', this.userType);
    localStorage.setItem('id', this.id);

    this._markActivity();
  }

  clearStorage() {
    // preserve language and notification settings
    const lang = localStorage.getItem('i18nextLng');
    const notificationsEnabled = localStorage.getItem('notifications-enabled');
    // preserve ICF assessment progress — the /icf page is public (no auth required)
    // so clearStorage() must not wipe an in-progress patient session
    const surveyIndex = localStorage.getItem('survey_index');
    const surveySessionId = localStorage.getItem('survey_sessionId');

    sessionStorage.clear();
    localStorage.clear();

    if (lang) localStorage.setItem('i18nextLng', lang);
    if (notificationsEnabled) localStorage.setItem('notifications-enabled', notificationsEnabled);
    if (surveyIndex !== null) localStorage.setItem('survey_index', surveyIndex);
    if (surveySessionId !== null) localStorage.setItem('survey_sessionId', surveySessionId);
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
      this.preferredLanguage = '';
      this.clinic = '';
      this.project = '';
      this.partialLogin = false;
    });
  }
}

export default new AuthStore();
