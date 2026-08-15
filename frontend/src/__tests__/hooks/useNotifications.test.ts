import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotifications } from '@/hooks/useNotifications';
import { notificationPreferencesStore } from '@/stores/notificationPreferencesStore';

// import.meta.env.VITE_VAPID_PUBLIC_KEY isn't populated under Jest (it's a
// Vite-only static replacement, see jest-import-meta-transform.js), so the
// VAPID-key conversion is mocked out here rather than exercised for real.
jest.mock('@/utils/pushSubscription', () => ({
  urlBase64ToUint8Array: jest.fn(() => new Uint8Array()),
}));

jest.mock('@/stores/notificationPreferencesStore', () => {
  const actual = jest.requireActual('@/stores/notificationPreferencesStore');
  return {
    ...actual,
    notificationPreferencesStore: {
      preferences: {
        education: true,
        exercise: true,
        instructions: true,
        reminder: true,
        behavior_change: true,
        other: true,
      },
      registerPushSubscription: jest.fn(),
      removePushSubscription: jest.fn(),
      savePreferences: jest.fn(),
      setError: jest.fn(),
      clearError: jest.fn(),
    },
  };
});

describe('useNotifications', () => {
  let mockNotification: any;
  let mockSubscription: any;
  let mockPushManager: any;
  let mockRegistration: any;

  beforeEach(() => {
    // resetAllMocks (not clearAllMocks): tests below override savePreferences
    // with a custom mockImplementation to control timing (pending-state /
    // concurrency tests) — clearAllMocks only clears call history and would
    // leak that implementation into later tests, since notificationPreferencesStore
    // is a module-level mock object shared across the whole file.
    jest.resetAllMocks();
    (notificationPreferencesStore as any).preferences = {
      education: true,
      exercise: true,
      instructions: true,
      reminder: true,
      behavior_change: true,
      other: true,
    };
    (notificationPreferencesStore.savePreferences as jest.Mock).mockResolvedValue(true);

    mockNotification = {
      permission: 'default' as NotificationPermission,
      requestPermission: jest.fn(),
    };
    (global as any).Notification = mockNotification;
    (global as any).PushManager = function () {};

    mockSubscription = {
      endpoint: 'https://push.example.com/abc',
      toJSON: jest.fn(() => ({ endpoint: 'https://push.example.com/abc', keys: {} })),
      unsubscribe: jest.fn().mockResolvedValue(true),
    };
    mockPushManager = {
      getSubscription: jest.fn().mockResolvedValue(null),
      subscribe: jest.fn().mockResolvedValue(mockSubscription),
    };
    mockRegistration = { pushManager: mockPushManager };

    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: { ready: Promise.resolve(mockRegistration) },
      writable: true,
      configurable: true,
    });
  });

  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.permission).toBe('default');
    expect(result.current.supportsPush).toBe(true);
  });

  it('detects when push is not supported', () => {
    delete (global as any).PushManager;
    const { result } = renderHook(() => useNotifications());
    expect(result.current.supportsPush).toBe(false);
  });

  describe('toggleCategory', () => {
    it('requests permission, subscribes to push, and saves the preference when enabling', async () => {
      mockNotification.requestPermission = jest.fn().mockResolvedValue('granted');
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleCategory('patient-1', 'education', true);
      });

      expect(mockPushManager.subscribe).toHaveBeenCalled();
      expect(notificationPreferencesStore.registerPushSubscription).toHaveBeenCalledWith(
        'patient-1',
        { endpoint: 'https://push.example.com/abc', keys: {} }
      );
      expect(notificationPreferencesStore.savePreferences).toHaveBeenCalledWith('patient-1', {
        education: true,
      });
    });

    it('does not save the preference when the actual push subscription fails (regression: was silently saving "on" with no real subscription)', async () => {
      mockNotification.requestPermission = jest.fn().mockResolvedValue('granted');
      mockPushManager.subscribe.mockRejectedValue(new Error('subscribe failed'));
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleCategory('patient-1', 'education', true);
      });

      expect(notificationPreferencesStore.savePreferences).not.toHaveBeenCalled();
      expect(notificationPreferencesStore.setError).toHaveBeenCalledWith(
        'Failed to enable push notifications'
      );
    });

    it('does not subscribe or save when permission is denied', async () => {
      mockNotification.requestPermission = jest.fn().mockResolvedValue('denied');
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleCategory('patient-1', 'education', true);
      });

      expect(mockPushManager.subscribe).not.toHaveBeenCalled();
      expect(notificationPreferencesStore.savePreferences).not.toHaveBeenCalled();
    });

    it('saves the preference and keeps the subscription when other categories remain enabled', async () => {
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleCategory('patient-1', 'education', false);
      });

      expect(notificationPreferencesStore.savePreferences).toHaveBeenCalledWith('patient-1', {
        education: false,
      });
      expect(mockPushManager.getSubscription).not.toHaveBeenCalled();
    });

    it('unsubscribes from push when disabling the last enabled category', async () => {
      (notificationPreferencesStore as any).preferences = {
        education: true,
        exercise: false,
        instructions: false,
        reminder: false,
        behavior_change: false,
        other: false,
      };
      mockPushManager.getSubscription.mockResolvedValue(mockSubscription);

      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleCategory('patient-1', 'education', false);
      });

      await waitFor(() => {
        expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      });
      expect(notificationPreferencesStore.removePushSubscription).toHaveBeenCalledWith(
        'patient-1',
        'https://push.example.com/abc'
      );
    });

    it('does not unsubscribe when the disabling save fails (regression: was tearing down the real subscription while preferences silently rolled back to "on")', async () => {
      (notificationPreferencesStore as any).preferences = {
        education: true,
        exercise: false,
        instructions: false,
        reminder: false,
        behavior_change: false,
        other: false,
      };
      (notificationPreferencesStore.savePreferences as jest.Mock).mockResolvedValue(false);
      mockPushManager.getSubscription.mockResolvedValue(mockSubscription);

      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleCategory('patient-1', 'education', false);
      });

      expect(mockPushManager.getSubscription).not.toHaveBeenCalled();
      expect(mockSubscription.unsubscribe).not.toHaveBeenCalled();
      expect(notificationPreferencesStore.removePushSubscription).not.toHaveBeenCalled();
    });
  });

  describe('toggleAll', () => {
    it('subscribes to push and saves all categories as true when enabling', async () => {
      mockNotification.requestPermission = jest.fn().mockResolvedValue('granted');
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleAll('patient-1', true);
      });

      expect(mockPushManager.subscribe).toHaveBeenCalled();
      expect(notificationPreferencesStore.savePreferences).toHaveBeenCalledWith('patient-1', {
        education: true,
        exercise: true,
        instructions: true,
        reminder: true,
        behavior_change: true,
        other: true,
      });
    });

    it('does not save preferences when the actual push subscription fails', async () => {
      mockNotification.requestPermission = jest.fn().mockResolvedValue('granted');
      mockPushManager.subscribe.mockRejectedValue(new Error('subscribe failed'));
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleAll('patient-1', true);
      });

      expect(notificationPreferencesStore.savePreferences).not.toHaveBeenCalled();
      expect(notificationPreferencesStore.setError).toHaveBeenCalledWith(
        'Failed to enable push notifications'
      );
    });

    it('unsubscribes and saves all categories as false when disabling', async () => {
      mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleAll('patient-1', false);
      });

      expect(notificationPreferencesStore.savePreferences).toHaveBeenCalledWith('patient-1', {
        education: false,
        exercise: false,
        instructions: false,
        reminder: false,
        behavior_change: false,
        other: false,
      });
      await waitFor(() => {
        expect(notificationPreferencesStore.removePushSubscription).toHaveBeenCalledWith(
          'patient-1',
          'https://push.example.com/abc'
        );
      });
    });

    it('does not unsubscribe when the disabling save fails (regression: was tearing down the real subscription while preferences silently rolled back to "on")', async () => {
      (notificationPreferencesStore.savePreferences as jest.Mock).mockResolvedValue(false);
      mockPushManager.getSubscription.mockResolvedValue(mockSubscription);

      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleAll('patient-1', false);
      });

      expect(mockPushManager.getSubscription).not.toHaveBeenCalled();
      expect(mockSubscription.unsubscribe).not.toHaveBeenCalled();
      expect(notificationPreferencesStore.removePushSubscription).not.toHaveBeenCalled();
    });
  });

  describe('pending state', () => {
    it('marks a category pending during toggleCategory and clears it after', async () => {
      mockNotification.requestPermission = jest.fn().mockResolvedValue('granted');
      let resolveSave: (value: boolean) => void = () => {};
      (notificationPreferencesStore.savePreferences as jest.Mock).mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolveSave = resolve;
          })
      );

      const { result } = renderHook(() => useNotifications());

      let togglePromise!: Promise<void>;
      act(() => {
        togglePromise = result.current.toggleCategory('patient-1', 'education', true);
      });

      await waitFor(() => {
        expect(result.current.pendingCategories.has('education')).toBe(true);
      });

      await act(async () => {
        resolveSave(true);
        await togglePromise;
      });

      expect(result.current.pendingCategories.has('education')).toBe(false);
    });

    it('marks pendingAll during toggleAll and clears it after', async () => {
      let resolveSave: (value: boolean) => void = () => {};
      (notificationPreferencesStore.savePreferences as jest.Mock).mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolveSave = resolve;
          })
      );

      const { result } = renderHook(() => useNotifications());

      let togglePromise!: Promise<void>;
      act(() => {
        togglePromise = result.current.toggleAll('patient-1', false);
      });

      await waitFor(() => {
        expect(result.current.pendingAll).toBe(true);
      });

      await act(async () => {
        resolveSave(true);
        await togglePromise;
      });

      expect(result.current.pendingAll).toBe(false);
    });
  });

  describe('concurrent subscribe guard', () => {
    it('only calls pushManager.subscribe once when two toggles race (regression: duplicate subscriptions from rapid clicks)', async () => {
      mockNotification.requestPermission = jest.fn().mockResolvedValue('granted');
      let resolveSubscribe: (v: unknown) => void = () => {};
      mockPushManager.subscribe.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSubscribe = resolve;
          })
      );

      const { result } = renderHook(() => useNotifications());

      let p1!: Promise<void>;
      let p2!: Promise<void>;
      act(() => {
        p1 = result.current.toggleCategory('patient-1', 'education', true);
        p2 = result.current.toggleCategory('patient-1', 'exercise', true);
      });

      await waitFor(() => {
        expect(mockPushManager.subscribe).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        resolveSubscribe(mockSubscription);
        await Promise.all([p1, p2]);
      });

      expect(mockPushManager.subscribe).toHaveBeenCalledTimes(1);
      // Both callers still get their own preference saved.
      expect(notificationPreferencesStore.savePreferences).toHaveBeenCalledWith('patient-1', {
        education: true,
      });
      expect(notificationPreferencesStore.savePreferences).toHaveBeenCalledWith('patient-1', {
        exercise: true,
      });
    });
  });

  describe('shared-device conflict handling', () => {
    it('drops the stale subscription and retries with a fresh one on a 409 endpoint_conflict', async () => {
      mockNotification.requestPermission = jest.fn().mockResolvedValue('granted');
      // Browser already holds a subscription (e.g. from a previous patient on
      // this shared device) — doSubscribeToPush reuses it first.
      mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
      const freshSubscription = {
        endpoint: 'https://push.example.com/fresh',
        toJSON: jest.fn(() => ({ endpoint: 'https://push.example.com/fresh', keys: {} })),
        unsubscribe: jest.fn().mockResolvedValue(true),
      };
      mockPushManager.subscribe.mockResolvedValueOnce(freshSubscription);

      const conflictError = { response: { status: 409, data: { code: 'endpoint_conflict' } } };
      (notificationPreferencesStore.registerPushSubscription as jest.Mock)
        .mockRejectedValueOnce(conflictError)
        .mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleCategory('patient-1', 'education', true);
      });

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(mockPushManager.subscribe).toHaveBeenCalledTimes(1);
      expect(notificationPreferencesStore.registerPushSubscription).toHaveBeenNthCalledWith(
        2,
        'patient-1',
        { endpoint: 'https://push.example.com/fresh', keys: {} }
      );
      expect(notificationPreferencesStore.savePreferences).toHaveBeenCalledWith('patient-1', {
        education: true,
      });
    });

    it('does not retry, and surfaces an error, when the registration failure is not a 409 endpoint_conflict', async () => {
      mockNotification.requestPermission = jest.fn().mockResolvedValue('granted');
      mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
      (notificationPreferencesStore.registerPushSubscription as jest.Mock).mockRejectedValue({
        response: { status: 500, data: {} },
      });

      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleCategory('patient-1', 'education', true);
      });

      expect(mockSubscription.unsubscribe).not.toHaveBeenCalled();
      expect(mockPushManager.subscribe).not.toHaveBeenCalled();
      expect(notificationPreferencesStore.savePreferences).not.toHaveBeenCalled();
      expect(notificationPreferencesStore.setError).toHaveBeenCalledWith(
        'Failed to enable push notifications'
      );
    });
  });
});
