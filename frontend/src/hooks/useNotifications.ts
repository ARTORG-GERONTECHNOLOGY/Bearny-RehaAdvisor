import { useState, useEffect } from 'react';

export function useNotifications() {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supportsPeriodicSync, setSupportsPeriodicSync] = useState<boolean>(false);

  useEffect(() => {
    // Check current permission
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    // Check if Periodic Background Sync is supported
    if ('serviceWorker' in navigator && 'periodicSync' in ServiceWorkerRegistration.prototype) {
      setSupportsPeriodicSync(true);
    }

    // Load saved setting
    const saved = localStorage.getItem('notifications-enabled');
    if (saved === 'true' && Notification.permission === 'granted') {
      setEnabled(true);
    }
  }, []);

  const requestPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      console.error('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  };

  const registerPeriodicSync = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      if ('periodicSync' in registration) {
        // @ts-expect-error - periodicSync API
        await registration.periodicSync.register('daily-reminder', {
          minInterval: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
        });
        console.log('[Notifications] Periodic sync registered for daily reminders');
      }
    } catch (error) {
      console.error('[Notifications] Failed to register periodic sync:', error);
    }
  };

  const unregisterPeriodicSync = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      if ('periodicSync' in registration) {
        // @ts-expect-error - periodicSync API
        await registration.periodicSync.unregister('daily-reminder');
        console.log('[Notifications] Periodic sync unregistered');
      }
    } catch (error) {
      console.error('[Notifications] Failed to unregister periodic sync:', error);
    }
  };

  const testNotification = () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'TEST_NOTIFICATION',
      });
    }
  };

  const toggleNotifications = async (value: boolean) => {
    if (value) {
      // Enable notifications
      const hasPermission = await requestPermission();
      if (hasPermission) {
        setEnabled(true);
        localStorage.setItem('notifications-enabled', 'true');
        await registerPeriodicSync();
        // Show a test notification
        testNotification();
      } else {
        setEnabled(false);
        localStorage.setItem('notifications-enabled', 'false');
      }
    } else {
      // Disable notifications
      setEnabled(false);
      localStorage.setItem('notifications-enabled', 'false');
      await unregisterPeriodicSync();
    }
  };

  return {
    enabled,
    permission,
    supportsPeriodicSync,
    toggleNotifications,
  };
}
