import { makeAutoObservable, runInAction } from 'mobx';
import apiClient from '@/api/client';

export type NotificationCategory =
  | 'education'
  | 'exercise'
  | 'instructions'
  | 'reminder'
  | 'behavior_change'
  | 'other';

export type NotificationPreferences = Record<NotificationCategory, boolean>;

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'education',
  'exercise',
  'instructions',
  'reminder',
  'behavior_change',
  'other',
];

export const NOTIFICATION_CATEGORY_LABEL_KEYS: Record<NotificationCategory, string> = {
  education: 'Education',
  exercise: 'Exercise',
  instructions: 'Instructions',
  reminder: 'Reminder',
  behavior_change: 'Behavior change',
  other: 'Other',
};

// Opt-in (matches backend PatientNotificationPreferences defaults): "on"
// only ever means "on and subscribed", since turning a category on is the
// same action that creates the PushSubscription.
const DEFAULT_PREFERENCES: NotificationPreferences = {
  education: false,
  exercise: false,
  instructions: false,
  reminder: false,
  behavior_change: false,
  other: false,
};

class NotificationPreferencesStore {
  preferences: NotificationPreferences = { ...DEFAULT_PREFERENCES };
  loading = false;
  saving = false;
  error = '';

  constructor() {
    makeAutoObservable(this);
  }

  setError(message: string) {
    this.error = message;
  }

  clearError() {
    this.error = '';
  }

  async fetchPreferences(patientId: string) {
    if (!patientId) return;
    this.loading = true;
    this.error = '';
    try {
      const { data } = await apiClient.get(`/patients/${patientId}/notification-preferences/`);
      runInAction(() => {
        this.preferences = { ...DEFAULT_PREFERENCES, ...data.preferences };
      });
    } catch {
      runInAction(() => {
        this.error = 'Failed to load notification preferences';
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  // Returns whether the save actually took effect server-side — callers must
  // not treat the toggled category as settled (e.g. tearing down the real
  // PushSubscription on a disable) unless this is true, since a failed save
  // rolls `preferences` back to its pre-toggle value.
  async savePreferences(
    patientId: string,
    partial: Partial<NotificationPreferences>
  ): Promise<boolean> {
    if (!patientId) return false;
    this.saving = true;
    this.error = '';
    const previous = { ...this.preferences };
    runInAction(() => {
      this.preferences = { ...this.preferences, ...partial };
    });
    try {
      const { data } = await apiClient.post(`/patients/${patientId}/notification-preferences/`, {
        preferences: partial,
      });
      runInAction(() => {
        this.preferences = { ...DEFAULT_PREFERENCES, ...data.preferences };
      });
      return true;
    } catch {
      runInAction(() => {
        this.preferences = previous;
        this.error = 'Failed to save notification preferences';
      });
      return false;
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }

  async registerPushSubscription(patientId: string, subscription: PushSubscriptionJSON) {
    if (!patientId || !subscription.endpoint || !subscription.keys) return;
    await apiClient.post(`/patients/${patientId}/push-subscription/`, {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      user_agent: navigator.userAgent,
    });
  }

  async removePushSubscription(patientId: string, endpoint: string) {
    if (!patientId || !endpoint) return;
    await apiClient.delete(`/patients/${patientId}/push-subscription/`, {
      data: { endpoint },
    });
  }
}

export const notificationPreferencesStore = new NotificationPreferencesStore();
