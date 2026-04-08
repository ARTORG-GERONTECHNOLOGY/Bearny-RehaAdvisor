const NOTIFICATION_TRANSLATIONS = {
  en: { title: 'Bearny Reminder', body: 'Time to check your rehabilitation progress!' },
  de: { title: 'Bearny Erinnerung', body: 'Zeit, Ihren Rehabilitationsfortschritt zu überprüfen!' },
  fr: { title: 'Rappel Bearny', body: 'Il est temps de vérifier vos progrès de rééducation!' },
  it: { title: 'Promemoria Bearny', body: 'Controlla i progressi di riabilitazione!' },
  pt: { title: 'Lembrete Bearny', body: 'Hora de verificar o seu progresso de reabilitação!' },
  nl: { title: 'Bearny Herinnering', body: 'Tijd om uw revalidatievoortgang te controleren!' },
};

let currentLanguage = 'en';

async function saveLanguage(lang) {
  try {
    const cache = await caches.open('sw-settings');
    await cache.put('/sw-language', new Response(lang));
  } catch (e) {
    console.error('[SW] Error saving language:', e);
  }
}

async function loadLanguage() {
  try {
    const cache = await caches.open('sw-settings');
    const response = await cache.match('/sw-language');
    if (response) {
      const lang = await response.text();
      if (lang && NOTIFICATION_TRANSLATIONS[lang]) {
        currentLanguage = lang;
      }
    }
  } catch (e) {
    console.error('[SW] Error loading language:', e);
  }
}

// Install event
self.addEventListener('install', () => {
  console.log('[SW] Installing service worker...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(Promise.all([self.clients.claim(), loadLanguage()]));
});

// Periodic background sync for reminders
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync triggered:', event.tag);
  if (event.tag === 'twice-weekly-reminder') {
    event.waitUntil(
      (async () => {
        const day = new Date().getDay();
        if (day !== 1 && day !== 4) {
          console.log('[SW] Not Monday or Thursday, skipping notification');
          return;
        }
        await showNotification();
      })()
    );
  }
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SET_LANGUAGE') {
    const lang = event.data.language;
    if (lang && NOTIFICATION_TRANSLATIONS[lang]) {
      currentLanguage = lang;
      saveLanguage(lang);
      console.log('[SW] Language set to', lang);
    }
  }

  if (event.data.type === 'TEST_NOTIFICATION') {
    console.log('[SW] Testing notification');
    showNotification();
  }
});

async function showNotification() {
  try {
    await loadLanguage();
    const content = NOTIFICATION_TRANSLATIONS[currentLanguage] || NOTIFICATION_TRANSLATIONS.en;
    const options = {
      body: content.body,
      icon: '/icons/pwa-192x192.png',
      badge: '/icons/pwa-96x96.png',
      tag: 'bearny-reminder',
      vibrate: [200, 100, 200],
      requireInteraction: false,
      lang: currentLanguage,
    };

    await self.registration.showNotification(content.title, options);
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
