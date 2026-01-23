// src/stores/userProfileStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import authStore from './authStore';
import { UserType } from '../types';

type Mode = 'view' | 'editProfile' | 'changePassword';

class UserProfileStore {
  mode: Mode = 'view';
  showDeletePopup = false;

  userData: UserType | null = null;

  loading = false;
  saving = false;
  deleting = false;

  errorBanner = '';
  successBanner = '';

  constructor() {
    makeAutoObservable(this);
  }

  setMode = (mode: Mode) => {
    this.mode = mode;
  };

  openDelete = () => {
    this.showDeletePopup = true;
  };

  closeDelete = () => {
    this.showDeletePopup = false;
  };

  clearError = () => {
    this.errorBanner = '';
  };

  clearSuccess = () => {
    this.successBanner = '';
  };

  setError = (msg: string) => {
    this.errorBanner = msg;
  };

  setSuccess = (msg: string, autoClearMs = 2500) => {
    this.successBanner = msg;
    if (autoClearMs > 0) {
      window.setTimeout(() => {
        runInAction(() => {
          this.successBanner = '';
        });
      }, autoClearMs);
    }
  };

  get userId() {
    return authStore?.id;
  }

  async fetchProfile() {
    const id = this.userId;
    if (!id) return;

    this.loading = true;
    this.errorBanner = '';

    try {
      const res = await apiClient.get(`/users/${id}/profile`);
      runInAction(() => {
        this.userData = res.data;
      });
    } catch (err) {
      // keep console for dev visibility
      console.error('Profile load failed:', err);
      runInAction(() => {
        this.setError('Failed to load user profile');
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async updateProfile(updatedUserData: UserType) {
    const id = this.userId;
    if (!id) return;

    if (this.saving) return;
    this.saving = true;
    this.errorBanner = '';
    this.successBanner = '';

    try {
      await apiClient.put(`/users/${id}/profile/`, updatedUserData);

      const refreshed = await apiClient.get(`/users/${id}/profile`);
      runInAction(() => {
        this.userData = refreshed.data;
        this.setSuccess('Profile updated successfully');
        this.mode = 'view';
      });
    } catch (err) {
      console.error('Update failed:', err);
      runInAction(() => {
        this.setError('Failed to update profile');
      });
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }

  async changePassword(oldPassword: string, newPassword: string) {
    const id = this.userId;
    if (!id) return;

    if (this.saving) return;
    this.saving = true;
    this.errorBanner = '';
    this.successBanner = '';

    try {
      await apiClient.put(`/users/${id}/change-password/`, {
        old_password: oldPassword,
        new_password: newPassword,
      });

      runInAction(() => {
        this.setSuccess('Password updated successfully');
        this.mode = 'view';
      });
    } catch (err: any) {
      runInAction(() => {
        this.setError(err?.response?.data?.error || err?.message || 'Update failed');
      });
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }

  async deleteAccount() {
    const id = this.userId;
    if (!id) return;

    if (this.deleting) return;
    this.deleting = true;
    this.errorBanner = '';
    this.successBanner = '';

    try {
      await apiClient.delete(`/users/${id}/profile/`);
      runInAction(() => {
        this.setSuccess('Account deleted successfully');
        this.showDeletePopup = false;
      });

      await authStore.logout();
    } catch (err) {
      console.error('Delete failed:', err);
      runInAction(() => {
        this.setError('Failed to delete account');
      });
    } finally {
      runInAction(() => {
        this.deleting = false;
      });
    }
  }
}

const userProfileStore = new UserProfileStore();
export default userProfileStore;
export type { Mode };
