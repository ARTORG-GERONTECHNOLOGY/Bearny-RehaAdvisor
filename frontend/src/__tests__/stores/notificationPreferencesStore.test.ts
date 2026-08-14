import { notificationPreferencesStore } from '@/stores/notificationPreferencesStore';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

const DEFAULTS = {
  education: false,
  exercise: false,
  instructions: false,
  reminder: false,
  behavior_change: false,
  other: false,
};

describe('notificationPreferencesStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationPreferencesStore.preferences = { ...DEFAULTS };
    notificationPreferencesStore.loading = false;
    notificationPreferencesStore.saving = false;
    notificationPreferencesStore.error = '';
  });

  describe('fetchPreferences', () => {
    it('does nothing when there is no patientId', async () => {
      await notificationPreferencesStore.fetchPreferences('');
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('loads preferences and merges them over the defaults', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { preferences: { education: true } },
      });

      await notificationPreferencesStore.fetchPreferences('patient-1');

      expect(apiClient.get).toHaveBeenCalledWith('/patients/patient-1/notification-preferences/');
      expect(notificationPreferencesStore.preferences).toEqual({ ...DEFAULTS, education: true });
      expect(notificationPreferencesStore.loading).toBe(false);
    });

    it('sets an error on failure', async () => {
      (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('network down'));

      await notificationPreferencesStore.fetchPreferences('patient-1');

      expect(notificationPreferencesStore.error).toBe('Failed to load notification preferences');
      expect(notificationPreferencesStore.loading).toBe(false);
    });
  });

  describe('savePreferences', () => {
    it('does nothing when there is no patientId', async () => {
      const result = await notificationPreferencesStore.savePreferences('', { education: false });
      expect(apiClient.post).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('optimistically applies the partial update, then reconciles with the server response', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { preferences: { ...DEFAULTS, education: true } },
      });

      const promise = notificationPreferencesStore.savePreferences('patient-1', {
        education: true,
      });
      // optimistic update happens synchronously before the await
      expect(notificationPreferencesStore.preferences.education).toBe(true);
      const result = await promise;

      expect(apiClient.post).toHaveBeenCalledWith('/patients/patient-1/notification-preferences/', {
        preferences: { education: true },
      });
      expect(notificationPreferencesStore.preferences).toEqual({ ...DEFAULTS, education: true });
      expect(notificationPreferencesStore.saving).toBe(false);
      expect(result).toBe(true);
    });

    it('rolls back the optimistic update, sets an error, and returns false on failure', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      const result = await notificationPreferencesStore.savePreferences('patient-1', {
        education: true,
      });

      expect(notificationPreferencesStore.preferences).toEqual(DEFAULTS);
      expect(notificationPreferencesStore.error).toBe('Failed to save notification preferences');
      expect(notificationPreferencesStore.saving).toBe(false);
      expect(result).toBe(false);
    });
  });

  describe('registerPushSubscription', () => {
    it('does nothing when endpoint or keys are missing', async () => {
      await notificationPreferencesStore.registerPushSubscription(
        'patient-1',
        {} as PushSubscriptionJSON
      );
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('posts the subscription payload', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({});
      const subscription = {
        endpoint: 'https://push.example.com/abc',
        keys: { p256dh: 'p', auth: 'a' },
      } as PushSubscriptionJSON;

      await notificationPreferencesStore.registerPushSubscription('patient-1', subscription);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/patients/patient-1/push-subscription/',
        expect.objectContaining({
          endpoint: 'https://push.example.com/abc',
          keys: { p256dh: 'p', auth: 'a' },
        })
      );
    });
  });

  describe('removePushSubscription', () => {
    it('does nothing when patientId or endpoint are missing', async () => {
      await notificationPreferencesStore.removePushSubscription('patient-1', '');
      expect(apiClient.delete).not.toHaveBeenCalled();
    });

    it('deletes the subscription by endpoint', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValueOnce({});

      await notificationPreferencesStore.removePushSubscription(
        'patient-1',
        'https://push.example.com/abc'
      );

      expect(apiClient.delete).toHaveBeenCalledWith('/patients/patient-1/push-subscription/', {
        data: { endpoint: 'https://push.example.com/abc' },
      });
    });
  });

  describe('setError / clearError', () => {
    it('setError sets the error message', () => {
      notificationPreferencesStore.setError('Failed to enable push notifications');
      expect(notificationPreferencesStore.error).toBe('Failed to enable push notifications');
    });

    it('clearError resets it to an empty string', () => {
      notificationPreferencesStore.setError('boom');
      notificationPreferencesStore.clearError();
      expect(notificationPreferencesStore.error).toBe('');
    });
  });
});
