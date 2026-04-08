import { useState, useEffect } from 'react';
import i18n from 'i18next';

function postLanguageToSW(lang: string) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SET_LANGUAGE',
      language: lang.slice(0, 2),
    });
  }
}

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

    // Sync current language to SW on mount
    postLanguageToSW(i18n.language);

    // Keep SW language in sync whenever user changes language
    const handleLanguageChanged = (lang: string) => postLanguageToSW(lang);
    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
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
        await registration.periodicSync.register('twice-weekly-reminder', {
          minInterval: 24 * 60 * 60 * 1000, // 24 h – fires daily; SW checks Mon/Thu before showing
        });
        console.log('[Notifications] Periodic sync registered for twice-weekly reminders');
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
        await registration.periodicSync.unregister('twice-weekly-reminder');
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
        // Ensure SW knows the current language before test notification fires
        postLanguageToSW(i18n.language);
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
