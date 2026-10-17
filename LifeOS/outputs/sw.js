'use strict';

self.addEventListener('push', event => {
  let message = {};
  try { message = event.data?.json() || {}; } catch { message = {}; }
  const title = String(message.title || 'LifeOS 일정 알림').slice(0, 100);
  const body = String(message.body || '').slice(0, 200);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/outputs/lifeos-leaf-icon.png',
    badge: '/outputs/lifeos-leaf-icon.png',
    data: { url: '/' },
    tag: String(message.tag || `lifeos-calendar-${title}-${body}`).slice(0, 200)
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL('/', self.location.origin).href;
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.focus(); return; }
    await clients.openWindow(url);
  })());
});
