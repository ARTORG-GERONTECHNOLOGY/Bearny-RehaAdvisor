// Install event
self.addEventListener('install', () => {
  console.log('[SW] Installing service worker...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(self.clients.claim());
});

// Periodic background sync for daily reminders (for installed PWAs)
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync triggered:', event.tag);
  if (event.tag === 'daily-reminder') {
    event.waitUntil(showNotification());
  }
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TEST_NOTIFICATION') {
    console.log('[SW] Testing notification');
    showNotification();
  }
});

async function showNotification() {
  try {
    const title = 'Bearny Reminder';
    const options = {
      body: 'Time to check your rehabilitation progress!',
      icon: '/icons/pwa-192x192.png',
      badge: '/icons/pwa-96x96.png',
      tag: 'bearny-reminder',
      vibrate: [200, 100, 200],
      requireInteraction: false,
    };

    await self.registration.showNotification(title, options);
    console.log('[SW] Notification shown at', new Date().toLocaleTimeString());
  } catch (error) {
    console.error('[SW] Error showing notification:', error);
  }
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();

  // Open or focus the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
