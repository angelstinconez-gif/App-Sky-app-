// Service Worker para Web Push de SKY PV Monitor
// Registra y maneja notificaciones push entrantes incluso si la app está cerrada.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Cuando llega un push del servidor
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'SKY PV Monitor', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || '🔔 SKY PV Monitor';
  const options = {
    body: payload.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.data?.type || 'general',
    renotify: true,
    data: payload.data || {},
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: 'Ver' },
      { action: 'dismiss', title: 'Descartar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click en la notificación → abrir la app en la sección relevante
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  let url = '/dashboard';
  if (data.type?.startsWith('mantenimiento')) url = '/mantenimiento';
  else if (data.type?.startsWith('incidencia')) url = '/incidencias';
  else if (data.type?.startsWith('ticket')) url = '/tickets';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si la app ya está abierta, enfoca esa ventana
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Si no, abre nueva ventana
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
