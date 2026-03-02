import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotifications } from '@/hooks/useNotifications';

describe('useNotifications', () => {
  let mockNotification: any;
  let mockServiceWorker: any;
  let mockLocalStorage: { [key: string]: string };

  beforeEach(() => {
    mockLocalStorage = {};

    // Mock localStorage
    Storage.prototype.getItem = jest.fn((key: string) => mockLocalStorage[key] || null);
    Storage.prototype.setItem = jest.fn((key: string, value: string) => {
      mockLocalStorage[key] = value;
    });

    // Mock Notification API
    mockNotification = {
      permission: 'default' as NotificationPermission,
      requestPermission: jest.fn(),
    };
    (global as any).Notification = mockNotification;

    // Mock ServiceWorker API
    mockServiceWorker = {
      ready: Promise.resolve({
        periodicSync: {
          register: jest.fn(),
          unregister: jest.fn(),
        },
      }),
      controller: {
        postMessage: jest.fn(),
      },
    };
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: mockServiceWorker,
      writable: true,
      configurable: true,
    });

    // Mock ServiceWorkerRegistration
    (global as any).ServiceWorkerRegistration = {
      prototype: {
        periodicSync: {},
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useNotifications());

    expect(result.current.enabled).toBe(false);
    expect(result.current.permission).toBe('default');
    expect(result.current.supportsPeriodicSync).toBe(true);
  });

  it('loads enabled state from localStorage when permission is granted', () => {
    mockLocalStorage['notifications-enabled'] = 'true';
    mockNotification.permission = 'granted';

    const { result } = renderHook(() => useNotifications());

    expect(result.current.enabled).toBe(true);
  });

  it('does not enable notifications from localStorage if permission is denied', () => {
    mockLocalStorage['notifications-enabled'] = 'true';
    mockNotification.permission = 'denied';

    const { result } = renderHook(() => useNotifications());

    expect(result.current.enabled).toBe(false);
  });

  it('detects when periodic sync is not supported', () => {
    delete (global as any).ServiceWorkerRegistration.prototype.periodicSync;

    const { result } = renderHook(() => useNotifications());

    expect(result.current.supportsPeriodicSync).toBe(false);
  });

  it('enables notifications with permission granted', async () => {
    mockNotification.requestPermission = jest.fn().mockResolvedValue('granted');

    const { result } = renderHook(() => useNotifications());

    await act(async () => {
      await result.current.toggleNotifications(true);
    });

    await waitFor(() => {
      expect(result.current.enabled).toBe(true);
      expect(mockLocalStorage['notifications-enabled']).toBe('true');
    });
  });

  it('does not enable notifications when permission is denied', async () => {
    mockNotification.requestPermission = jest.fn().mockResolvedValue('denied');

    const { result } = renderHook(() => useNotifications());

    await act(async () => {
      await result.current.toggleNotifications(true);
    });

    await waitFor(() => {
      expect(result.current.enabled).toBe(false);
      expect(mockLocalStorage['notifications-enabled']).toBe('false');
    });
  });

  it('disables notifications and clears localStorage', async () => {
    mockLocalStorage['notifications-enabled'] = 'true';
    mockNotification.permission = 'granted';

    const { result } = renderHook(() => useNotifications());

    await act(async () => {
      await result.current.toggleNotifications(false);
    });

    await waitFor(() => {
      expect(result.current.enabled).toBe(false);
      expect(mockLocalStorage['notifications-enabled']).toBe('false');
    });
  });

  it('registers periodic sync when enabling notifications', async () => {
    mockNotification.requestPermission = jest.fn().mockResolvedValue('granted');
    const mockRegister = jest.fn();
    mockServiceWorker.ready = Promise.resolve({
      periodicSync: {
        register: mockRegister,
        unregister: jest.fn(),
      },
    });

    const { result } = renderHook(() => useNotifications());

    await act(async () => {
      await result.current.toggleNotifications(true);
    });

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('daily-reminder', {
        minInterval: 24 * 60 * 60 * 1000,
      });
    });
  });

  it('unregisters periodic sync when disabling notifications', async () => {
    mockLocalStorage['notifications-enabled'] = 'true';
    mockNotification.permission = 'granted';
    const mockUnregister = jest.fn();
    mockServiceWorker.ready = Promise.resolve({
      periodicSync: {
        register: jest.fn(),
        unregister: mockUnregister,
      },
    });

    const { result } = renderHook(() => useNotifications());

    await act(async () => {
      await result.current.toggleNotifications(false);
    });

    await waitFor(() => {
      expect(mockUnregister).toHaveBeenCalledWith('daily-reminder');
    });
  });

  it('sends test notification message to service worker when enabling', async () => {
    mockNotification.requestPermission = jest.fn().mockResolvedValue('granted');

    const { result } = renderHook(() => useNotifications());

    await act(async () => {
      await result.current.toggleNotifications(true);
    });

    await waitFor(() => {
      expect(mockServiceWorker.controller.postMessage).toHaveBeenCalledWith({
        type: 'TEST_NOTIFICATION',
      });
    });
  });
});
