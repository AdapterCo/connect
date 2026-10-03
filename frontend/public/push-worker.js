/* Only notifications: no app, API or conversation cache. */
self.addEventListener('push', event => {
  let payload;
  try { payload = event.data.json(); } catch { payload = {}; }
  event.waitUntil(self.registration.showNotification(payload.title || 'Adapter Connect', {
    body: 'Abra a Gestão Comercial para acompanhar.', tag: payload.tag || 'commercial',
    data: { url: '/commercial' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate('/commercial'); return existing.focus(); }
    return self.clients.openWindow('/commercial');
  }));
});
