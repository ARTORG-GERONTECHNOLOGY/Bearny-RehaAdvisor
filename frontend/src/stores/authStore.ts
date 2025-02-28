import { action, makeAutoObservable } from 'mobx';
import apiClient from '../api/client';

class AuthStore {
  email: string = '';
  password: string = '';
  isAuthenticated: boolean = false;
  loginError: string = '';
  userType: string = ''; // Add userType to store
  id: string = '';
  sessionTimeout: number = 5 * 60 * 1000; // Set session timeout to 5 minutes
  full_name: string = '';
  specialisation: string = '';

  constructor() {
    makeAutoObservable(this, {
      setEmail: action,
      setPassword: action,
      setAuthenticated: action,
      setLoginError: action,
      loginWithHttp: action,
      reset: action,
      logout: action,
      deleteUser: action,
      checkAuthentication: action,
      setId: action,
      setUserType: action,
      setFullName: action,
      setSpecialisation: action,
    });

    this.checkAuthentication(); // Check authentication on app load
  }

  setSpecialisation(specialisation: string): void {
    this.specialisation = specialisation;
  }

  setFullName(fullName: string): void {
    this.full_name = fullName;
  }

  // Set the email in the store
  setEmail(email: string) {
    this.email = email;
  }
  setId(id: string) {
    this.id = id;
  }
  setUserType(userType: string) {
    this.userType = userType;
  }

  setPassword(password: string) {
    this.password = password;
  }

  setAuthenticated(isAuthenticated: boolean) {
    this.isAuthenticated = isAuthenticated;
  }

  setLoginError(loginError: string) {
    this.loginError = loginError;
  }

  async loginWithHttp() {
    try {
      const response = await apiClient.post('auth/login/', {
        email: this.email,
        password: this.password,
      });

      if (response.data && response.status === 200) {
        localStorage.setItem('authToken', response.data.access_token);
        localStorage.setItem('refreshToken', response.data.refresh_token);
        this.setAuthenticated(true);
        this.setLoginError('');
        this.userType = response.data['user_type'];
        this.id = response.data['id'];
        this.setSpecialisation(response.data['specialisation']);
        this.setFullName(response.data['id'])

        // Store data in localStorage instead of sessionStorage
        localStorage.setItem('userType', response.data['user_type']);
        localStorage.setItem('id', response.data['id']);
        localStorage.setItem('fullName', response.data['full_name']);
        localStorage.setItem('specialisation', response.data['specialisation']);
        // Store session start time
        const currentTime = new Date().getTime();
        localStorage.setItem('sessionStart', currentTime.toString());

        // Start the inactivity timer
        this.startInactivityTimer();
      } else {
        this.setLoginError('Invalid credentials, please try again.');
      }
    } catch (error) {
      this.setLoginError('Login failed. Please check your credentials or try again later.');
    }
  }

  reset() {
    this.email = '';
    this.password = '';
    this.setLoginError('');
    this.isAuthenticated = false;
    this.userType = '';
    this.id = '';
    this.setFullName('');
    this.specialisation = '';
  }

  logout() {
    this.reset();
    localStorage.removeItem('userType');
    localStorage.removeItem('token');
    localStorage.removeItem('sessionStart');
    localStorage.removeItem('id');
    localStorage.removeItem('fullName');
    localStorage.removeItem('specialisation');
    this.isAuthenticated = false;
  }

  deleteUser() {
    console.log(`Deleting user: ${this.email}`);
    this.email = '';
    this.password = '';
    this.setLoginError('');
    this.isAuthenticated = false;
    this.userType = '';
    localStorage.removeItem('token');
    this.setFullName('')
    localStorage.removeItem('fullName');
    localStorage.removeItem('specialisation');
    console.log('User account deleted successfully.');
  }

  checkAuthentication() {
    const storedUserType = localStorage.getItem('userType');
    const sessionStart = localStorage.getItem('sessionStart');
    const id = localStorage.getItem('id')
    this.setSpecialisation(localStorage.getItem('specialisation') as string);

    if (sessionStart) {
      const currentTime = new Date().getTime();
      const elapsedTime = currentTime - parseInt(sessionStart);
      console.log(elapsedTime)
      console.log(this.sessionTimeout)
      if (elapsedTime < this.sessionTimeout) {
        console.log(storedUserType)
        this.setAuthenticated(true);
        this.userType = storedUserType as string;
        // @ts-ignore
        this.id =  id as string;

        // Reset the inactivity timer
        this.startInactivityTimer();
      } else {
        this.logout(); // Expire session if time limit exceeded
      }
    }
  }

  startInactivityTimer() {
    let timeoutId: ReturnType<typeof setTimeout>;


    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        this.logout(); // Log out after inactivity
        window.location.reload(); // Reload page to go back to login screen
      }, this.sessionTimeout); // Inactivity period
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);

    // Start the timer immediately
    resetTimer();
  }
}

const authStore = new AuthStore();
export default authStore;
