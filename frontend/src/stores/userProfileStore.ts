// src/stores/userProfileStore.ts
import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '../api/client';
import authStore from './authStore';
import { UserType } from '../types';

// ---- typed error helpers (no `any`) ----
type ApiErrorResponse = {
  data?: {
    error?: string;
    message?: string;
    detail?: string;
  };
};

type ApiErrorLike = {
  response?: ApiErrorResponse;
  message?: string;
};

class UserProfileStore {
  showEditProfile = false;
  showChangePassword = false;
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

  openEditProfile = () => {
    this.showEditProfile = true;
  };

  closeEditProfile = () => {
    this.showEditProfile = false;
  };

  openChangePassword = () => {
    this.showChangePassword = true;
  };

  closeChangePassword = () => {
    this.showChangePassword = false;
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
        this.userData = res.data as UserType;
      });
    } catch (err: unknown) {
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
        this.userData = refreshed.data as UserType;
        this.setSuccess('Profile updated successfully');
        this.showEditProfile = false;
      });
    } catch (err: unknown) {
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
        this.showChangePassword = false;
      });
    } catch (err: unknown) {
      const e = err as ApiErrorLike;

      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.response?.data?.detail ||
        e?.message ||
        'Update failed';

      runInAction(() => {
        this.setError(msg);
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
    } catch (err: unknown) {
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
