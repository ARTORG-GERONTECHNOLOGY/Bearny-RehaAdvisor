import { useEffect, useState } from 'react';
import {
  notificationPreferencesStore,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from '@/stores/notificationPreferencesStore';
import { urlBase64ToUint8Array } from '@/utils/pushSubscription';

// Module-level (not per-render) in-flight locks: there is only ever one real
// browser push subscription, so concurrent toggleCategory/toggleAll calls
// (e.g. rapid double-clicks before the UI has re-rendered) must share the
// same subscribe/unsubscribe attempt instead of each independently calling
// pushManager.subscribe(), which creates a distinct new subscription per call.
let subscribeInFlight: Promise<boolean> | null = null;
let unsubscribeInFlight: Promise<boolean> | null = null;

async function createFreshSubscription(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription> {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });
}

async function getCurrentSubscription(
  registration: ServiceWorkerRegistration | null | undefined
): Promise<PushSubscription | null> {
  return (await registration?.pushManager.getSubscription()) ?? null;
}

// The backend returns this when `endpoint` already belongs to a different
// patient (see patient_notification_prefs.py) — a browser PushSubscription
// is scoped to origin, not to our app's login state, so this happens on
// shared devices where a previous patient logged out without disabling
// notifications first.
function isEndpointConflict(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: string } } })
    ?.response;
  return response?.status === 409 && response?.data?.code === 'endpoint_conflict';
}

// Returns whether a real PushSubscription actually got created — callers
// must not persist a category as "on" unless this is true, otherwise the UI
// shows enabled while no subscription exists to ever deliver anything.
async function doSubscribeToPush(patientId: string): Promise<boolean> {
  notificationPreferencesStore.clearError();
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await getCurrentSubscription(registration);
    if (!subscription) {
      subscription = await createFreshSubscription(registration);
    }

    try {
      await notificationPreferencesStore.registerPushSubscription(patientId, subscription.toJSON());
    } catch (error) {
      if (!isEndpointConflict(error)) throw error;
      // Drop the stale subscription (it belongs to someone else) and mint a
      // genuinely new one, rather than silently taking over their device.
      await subscription.unsubscribe();
      subscription = await createFreshSubscription(registration);
      await notificationPreferencesStore.registerPushSubscription(patientId, subscription.toJSON());
    }

    return true;
  } catch (error) {
    console.error('[Notifications] Failed to subscribe to push:', error);
    notificationPreferencesStore.setError('Failed to enable push notifications');
    return false;
  }
}

function subscribeToPush(patientId: string): Promise<boolean> {
  if (!subscribeInFlight) {
    subscribeInFlight = doSubscribeToPush(patientId).finally(() => {
      subscribeInFlight = null;
    });
  }
  return subscribeInFlight;
}

// Returns whether the subscription was actually removed — callers must not
// mark the device unsubscribed unless this is true, or the UI can claim
// "not on this device" while the real subscription is still live.
async function doUnsubscribeFromPush(patientId: string): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await getCurrentSubscription(registration);
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await notificationPreferencesStore.removePushSubscription(patientId, endpoint);
    }
    return true;
  } catch (error) {
    console.error('[Notifications] Failed to unsubscribe from push:', error);
    return false;
  }
}

function unsubscribeFromPush(patientId: string): Promise<boolean> {
  if (!unsubscribeInFlight) {
    unsubscribeInFlight = doUnsubscribeFromPush(patientId).finally(() => {
      unsubscribeInFlight = null;
    });
  }
  return unsubscribeInFlight;
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supportsPush, setSupportsPush] = useState<boolean>(false);
  // Distinct from preferences, which are shared across the patient's devices.
  const [isSubscribedOnThisDevice, setIsSubscribedOnThisDevice] = useState(false);
  // True once the mount-time subscription check resolves. Gate the "not on
  // this device" hint on this so it doesn't flash before the check settles.
  const [deviceCheckComplete, setDeviceCheckComplete] = useState(false);
  const [pendingDeviceEnable, setPendingDeviceEnable] = useState(false);
  // Categories (and/or "all") currently mid-toggle — used to disable their
  // switches in the UI so a slow permission/subscribe round-trip can't be
  // mistaken for "nothing happened" and clicked again.
  const [pendingCategories, setPendingCategories] = useState<Set<NotificationCategory>>(new Set());
  const [pendingAll, setPendingAll] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setSupportsPush(true);
    }
  }, []);

  useEffect(() => {
    if (!supportsPush) return;
    let cancelled = false;
    // getRegistration(), not .ready — .ready can hang until first load finishes.
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => getCurrentSubscription(registration))
      .then((subscription) => {
        if (!cancelled) {
          setIsSubscribedOnThisDevice(!!subscription);
          setDeviceCheckComplete(true);
        }
      })
      .catch((error) => {
        // deviceCheckComplete stays false so we don't show a possibly-wrong hint.
        console.error("[Notifications] Failed to check this device's push subscription:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [supportsPush]);

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

  const subscribeThisDevice = async (patientId: string): Promise<boolean> => {
    const hasPermission = await requestPermission();
    if (!hasPermission) return false;
    const subscribed = await subscribeToPush(patientId);
    if (!subscribed) return false; // doSubscribeToPush already set the error
    setIsSubscribedOnThisDevice(true);
    return true;
  };

  const toggleCategory = async (
    patientId: string,
    category: NotificationCategory,
    value: boolean
  ) => {
    setPendingCategories((prev) => new Set(prev).add(category));
    try {
      if (value) {
        if (!(await subscribeThisDevice(patientId))) return;
        await notificationPreferencesStore.savePreferences(patientId, { [category]: true });
      } else {
        const saved = await notificationPreferencesStore.savePreferences(patientId, {
          [category]: false,
        });
        if (!saved) return; // preferences were rolled back — subscription must stay as-is
        const stillEnabled = NOTIFICATION_CATEGORIES.some(
          (c) => c !== category && notificationPreferencesStore.preferences[c]
        );
        if (!stillEnabled) {
          const unsubscribed = await unsubscribeFromPush(patientId);
          if (unsubscribed) setIsSubscribedOnThisDevice(false);
        }
      }
    } finally {
      setPendingCategories((prev) => {
        const next = new Set(prev);
        next.delete(category);
        return next;
      });
    }
  };

  const toggleAll = async (patientId: string, value: boolean) => {
    setPendingAll(true);
    try {
      if (value) {
        if (!(await subscribeThisDevice(patientId))) return;
      }
      const partial = Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, value])) as Record<
        NotificationCategory,
        boolean
      >;
      const saved = await notificationPreferencesStore.savePreferences(patientId, partial);
      if (!saved) return; // preferences were rolled back — subscription must stay as-is
      if (!value) {
        const unsubscribed = await unsubscribeFromPush(patientId);
        if (unsubscribed) setIsSubscribedOnThisDevice(false);
      }
    } finally {
      setPendingAll(false);
    }
  };

  // Unlike toggleCategory/toggleAll, this never saves preferences — they're already correct.
  const enableOnThisDevice = async (patientId: string) => {
    setPendingDeviceEnable(true);
    try {
      await subscribeThisDevice(patientId);
    } finally {
      setPendingDeviceEnable(false);
    }
  };

  return {
    permission,
    supportsPush,
    isSubscribedOnThisDevice,
    deviceCheckComplete,
    enableOnThisDevice,
    pendingDeviceEnable,
    toggleCategory,
    toggleAll,
    pendingCategories,
    pendingAll,
  };
}
