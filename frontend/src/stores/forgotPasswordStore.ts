import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';

export class ForgotPasswordStore {
  email = '';
  error: string | null = null;
  success = false;
  loading = false;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setEmail(v: string) {
    this.email = v;
  }

  clearMessages() {
    this.error = null;
    this.success = false;
  }

  private isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  async submit(t: (key: string) => string) {
    runInAction(() => {
      this.clearMessages();
      this.loading = true;
    });

    const email = this.email.trim();

    if (!this.isValidEmail(email)) {
      runInAction(() => {
        this.error = t('Invalid email format.');
        this.loading = false;
      });
      return;
    }

    try {
      await apiClient.post('auth/forgot-password/', { email });
      runInAction(() => {
        this.success = true;
      });
    } catch (err) {
      runInAction(() => {
        this.error = t('Failed to send password reset link. Please try again.');
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
