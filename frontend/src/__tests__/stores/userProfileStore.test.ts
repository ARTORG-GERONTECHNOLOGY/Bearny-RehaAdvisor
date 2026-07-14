import userProfileStore from '@/stores/userProfileStore';
import apiClient from '@/api/client';
import authStore from '@/stores/authStore';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: { id: 'user-1', logout: jest.fn() },
}));

describe('userProfileStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userProfileStore.showEditProfile = false;
    userProfileStore.showChangePassword = false;
    userProfileStore.showDeletePopup = false;
    userProfileStore.userData = null;
    userProfileStore.loading = false;
    userProfileStore.saving = false;
    userProfileStore.deleting = false;
    userProfileStore.errorBanner = '';
    userProfileStore.successBanner = '';
    (authStore as any).id = 'user-1';
  });

  // ------------------------------------------------------------------
  // UI toggles
  // ------------------------------------------------------------------
  describe('UI toggles', () => {
    it('opens and closes the edit profile panel', () => {
      userProfileStore.openEditProfile();
      expect(userProfileStore.showEditProfile).toBe(true);
      userProfileStore.closeEditProfile();
      expect(userProfileStore.showEditProfile).toBe(false);
    });

    it('opens and closes the change password panel', () => {
      userProfileStore.openChangePassword();
      expect(userProfileStore.showChangePassword).toBe(true);
      userProfileStore.closeChangePassword();
      expect(userProfileStore.showChangePassword).toBe(false);
    });

    it('opens and closes the delete popup', () => {
      userProfileStore.openDelete();
      expect(userProfileStore.showDeletePopup).toBe(true);
      userProfileStore.closeDelete();
      expect(userProfileStore.showDeletePopup).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // banners
  // ------------------------------------------------------------------
  describe('banners', () => {
    it('clearError resets errorBanner', () => {
      userProfileStore.errorBanner = 'oops';
      userProfileStore.clearError();
      expect(userProfileStore.errorBanner).toBe('');
    });

    it('clearSuccess resets successBanner', () => {
      userProfileStore.successBanner = 'yay';
      userProfileStore.clearSuccess();
      expect(userProfileStore.successBanner).toBe('');
    });

    it('setError sets errorBanner', () => {
      userProfileStore.setError('bad thing');
      expect(userProfileStore.errorBanner).toBe('bad thing');
    });

    it('setSuccess sets successBanner and auto-clears after the given delay', () => {
      jest.useFakeTimers();
      userProfileStore.setSuccess('great', 1000);
      expect(userProfileStore.successBanner).toBe('great');

      jest.advanceTimersByTime(1000);
      expect(userProfileStore.successBanner).toBe('');
      jest.useRealTimers();
    });

    it('setSuccess does not schedule a clear when autoClearMs is 0', () => {
      jest.useFakeTimers();
      userProfileStore.setSuccess('great', 0);
      jest.advanceTimersByTime(10000);
      expect(userProfileStore.successBanner).toBe('great');
      jest.useRealTimers();
    });
  });

  // ------------------------------------------------------------------
  // userId
  // ------------------------------------------------------------------
  describe('userId', () => {
    it('reflects authStore.id', () => {
      expect(userProfileStore.userId).toBe('user-1');
    });
  });

  // ------------------------------------------------------------------
  // fetchProfile
  // ------------------------------------------------------------------
  describe('fetchProfile', () => {
    it('does nothing when there is no userId', async () => {
      (authStore as any).id = '';
      await userProfileStore.fetchProfile();
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('loads the profile and stores it on success', async () => {
      const profile = { id: 'user-1', email: 'a@b.com' };
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: profile });

      await userProfileStore.fetchProfile();

      expect(apiClient.get).toHaveBeenCalledWith('/users/user-1/profile');
      expect(userProfileStore.userData).toEqual(profile);
      expect(userProfileStore.loading).toBe(false);
      expect(userProfileStore.errorBanner).toBe('');
    });

    it('sets an error banner on failure', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('network down'));

      await userProfileStore.fetchProfile();

      expect(userProfileStore.errorBanner).toBe('Failed to load user profile');
      expect(userProfileStore.loading).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // updateProfile
  // ------------------------------------------------------------------
  describe('updateProfile', () => {
    const patch = { id: 'user-1', email: 'new@b.com' } as any;

    it('does nothing when there is no userId', async () => {
      (authStore as any).id = '';
      await userProfileStore.updateProfile(patch);
      expect(apiClient.put).not.toHaveBeenCalled();
    });

    it('is a no-op re-entrancy guard while already saving', async () => {
      userProfileStore.saving = true;
      await userProfileStore.updateProfile(patch);
      expect(apiClient.put).not.toHaveBeenCalled();
    });

    it('updates, refetches and shows a success banner, closing the edit panel', async () => {
      userProfileStore.showEditProfile = true;
      (apiClient.put as jest.Mock).mockResolvedValueOnce({});
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: patch });

      await userProfileStore.updateProfile(patch);

      expect(apiClient.put).toHaveBeenCalledWith('/users/user-1/profile/', patch);
      expect(apiClient.get).toHaveBeenCalledWith('/users/user-1/profile');
      expect(userProfileStore.userData).toEqual(patch);
      expect(userProfileStore.successBanner).toBe('Profile updated successfully');
      expect(userProfileStore.showEditProfile).toBe(false);
      expect(userProfileStore.saving).toBe(false);
    });

    it('sets an error banner when the update fails', async () => {
      (apiClient.put as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      await userProfileStore.updateProfile(patch);

      expect(userProfileStore.errorBanner).toBe('Failed to update profile');
      expect(userProfileStore.saving).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // changePassword
  // ------------------------------------------------------------------
  describe('changePassword', () => {
    it('does nothing when there is no userId', async () => {
      (authStore as any).id = '';
      await userProfileStore.changePassword('old', 'new');
      expect(apiClient.put).not.toHaveBeenCalled();
    });

    it('is a no-op re-entrancy guard while already saving', async () => {
      userProfileStore.saving = true;
      await userProfileStore.changePassword('old', 'new');
      expect(apiClient.put).not.toHaveBeenCalled();
    });

    it('changes the password and shows a success banner, closing the panel', async () => {
      userProfileStore.showChangePassword = true;
      (apiClient.put as jest.Mock).mockResolvedValueOnce({});

      await userProfileStore.changePassword('old-pw', 'new-pw');

      expect(apiClient.put).toHaveBeenCalledWith('/users/user-1/change-password/', {
        old_password: 'old-pw',
        new_password: 'new-pw',
      });
      expect(userProfileStore.successBanner).toBe('Password updated successfully');
      expect(userProfileStore.showChangePassword).toBe(false);
      expect(userProfileStore.saving).toBe(false);
    });

    it('surfaces the backend error message on failure', async () => {
      (apiClient.put as jest.Mock).mockRejectedValueOnce({
        response: { data: { error: 'Old password incorrect' } },
      });

      await userProfileStore.changePassword('bad', 'new-pw');

      expect(userProfileStore.errorBanner).toBe('Old password incorrect');
      expect(userProfileStore.saving).toBe(false);
    });

    it('falls back to a generic message when the backend gives none', async () => {
      (apiClient.put as jest.Mock).mockRejectedValueOnce(new Error(''));

      await userProfileStore.changePassword('bad', 'new-pw');

      expect(userProfileStore.errorBanner).toBe('Update failed');
    });
  });

  // ------------------------------------------------------------------
  // deleteAccount
  // ------------------------------------------------------------------
  describe('deleteAccount', () => {
    it('does nothing when there is no userId', async () => {
      (authStore as any).id = '';
      await userProfileStore.deleteAccount();
      expect(apiClient.delete).not.toHaveBeenCalled();
    });

    it('is a no-op re-entrancy guard while already deleting', async () => {
      userProfileStore.deleting = true;
      await userProfileStore.deleteAccount();
      expect(apiClient.delete).not.toHaveBeenCalled();
    });

    it('deletes the account, logs out and shows a success banner', async () => {
      userProfileStore.showDeletePopup = true;
      (apiClient.delete as jest.Mock).mockResolvedValueOnce({});

      await userProfileStore.deleteAccount();

      expect(apiClient.delete).toHaveBeenCalledWith('/users/user-1/profile/');
      expect(userProfileStore.successBanner).toBe('Account deleted successfully');
      expect(userProfileStore.showDeletePopup).toBe(false);
      expect(authStore.logout).toHaveBeenCalled();
      expect(userProfileStore.deleting).toBe(false);
    });

    it('sets an error banner when deletion fails', async () => {
      (apiClient.delete as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      await userProfileStore.deleteAccount();

      expect(userProfileStore.errorBanner).toBe('Failed to delete account');
      expect(userProfileStore.deleting).toBe(false);
      expect(authStore.logout).not.toHaveBeenCalled();
    });
  });
});
