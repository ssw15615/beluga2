self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Beluga XL Fleet Update';
  const options = {
    body: data.body || 'A new fleet event has occurred.',
    icon: '/plane-logo.png',
    badge: '/plane-logo.png',
    data: data.url || '/',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});
