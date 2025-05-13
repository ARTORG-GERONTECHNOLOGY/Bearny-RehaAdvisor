import { makeAutoObservable } from 'mobx';
import apiClient from '../api/client';
import { AuthPayload } from '../types/index'; // or wherever you define it

class AuthStore {
  email = '';
  password = '';
  isAuthenticated = false;
  loginErrorMessage = '';
  userType = '';
  id = '';
  fullName = '';
  specialisation = '';
  sessionTimeout = 5 * 60 * 1000; // 5 minutes

  private _resetTimer?: () => void;
  private _timeoutId?: ReturnType<typeof setTimeout>;

  constructor() {
    makeAutoObservable(this);
    this.checkAuthentication();
  }

  // --- SETTERS ---
  setEmail = (email: string) => (this.email = email);
  setPassword = (password: string) => (this.password = password);
  setUserType = (userType: string) => (this.userType = userType);
  setId = (id: string) => (this.id = id);
  setFullName = (name: string) => (this.fullName = name);
  setSpecialisation = (spec: string) => (this.specialisation = spec);
  setAuthenticated = (val: boolean) => (this.isAuthenticated = val);
  setLoginError = (msg: string) => (this.loginErrorMessage = msg);

  onLogoutCallback: (() => void) | null = null;

  setOnLogoutCallback(callback: () => void) {
    this.onLogoutCallback = callback;
  }

  // --- AUTH METHODS ---
  async loginWithHttp() {
    try {
      console.log('Full URL:', apiClient.defaults.baseURL + '/auth/login/');

      const response = await apiClient.post('/auth/login/', {
        email: this.email,
        password: this.password,
      });

      if (response.status === 200 && response.data) {
        const { access_token, refresh_token, user_type, id, full_name, specialisation } =
          response.data;

        // Save to state
        this.setLoginError('');
        this.setUserType(user_type);
        this.setId(id);
        this.setFullName(full_name);
        this.setSpecialisation(specialisation);

        // Save to storage
        this.persistAuthData({
          access_token,
          refresh_token,
          user_type,
          id,
          full_name,
          specialisation,
        });

        // Start inactivity timer
        this.startInactivityTimer();
      } else {
        this.setLoginError('Invalid credentials, please try again.');
      }
    } catch {
      this.setLoginError('Login failed. Please check your credentials or try again later.');
    }
  }

  logout = async () => {
    const userIdToSend = this.id; // ✅ Capture the ID before resetting!

    try {
      await apiClient.post('auth/logout/', { userId: userIdToSend });
    } catch {
      this.setLoginError('Logout logging failed.');
    }

    this.reset();
    this.clearStorage();
    this.removeInactivityListeners();

    // ✅ Trigger the redirect via callback:
    if (this.onLogoutCallback) {
      this.onLogoutCallback();
    }
  };

  deleteUser() {
    console.log(`Deleting user: ${this.email}`);
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

  // --- SESSION MANAGEMENT ---
  checkAuthentication(callback?: () => void) {
    const accessToken = localStorage.getItem('authToken');
    const sessionStart = localStorage.getItem('sessionStart');

    if (!accessToken || !sessionStart) {
      this.reset();
      this.clearStorage();
      if (callback) callback(); // ✅ Call the callback if provided
      return;
    }

    const elapsed = Date.now() - parseInt(sessionStart, 10);
    if (elapsed < this.sessionTimeout) {
      this.restoreSession();
      this.setAuthenticated(true);
      this.startInactivityTimer();
    } else {
      this.reset();
      this.clearStorage();
      this.removeInactivityListeners();
      if (callback) callback(); // ✅ Call the callback here too
    }
  }

  startInactivityTimer() {
    this.removeInactivityListeners();

    const resetTimer = () => {
      if (this._timeoutId) {
        clearTimeout(this._timeoutId);
      }
      this._timeoutId = setTimeout(() => {
        this.logout();
      }, this.sessionTimeout);
    };

    this._resetTimer = resetTimer;

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);

    resetTimer(); // Start the timer initially
  }

  removeInactivityListeners() {
    if (this._resetTimer) {
      window.removeEventListener('mousemove', this._resetTimer);
      window.removeEventListener('keydown', this._resetTimer);
    }
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = undefined;
    }
  }

  // --- STORAGE HELPERS ---
  persistAuthData(data: AuthPayload) {
    localStorage.setItem('authToken', data.access_token);
    localStorage.setItem('refreshToken', data.refresh_token);
    localStorage.setItem('userType', data.user_type);
    localStorage.setItem('id', data.id);
    localStorage.setItem('fullName', data.full_name);
    localStorage.setItem('specialisation', data.specialisation);
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
    localStorage.clear();
  }
}

export default new AuthStore();
