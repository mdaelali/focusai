/*
 * FocusAI service worker.
 *
 * It exists for one reason: on Android and iOS the `new Notification()`
 * constructor is not allowed, notifications must be shown through a service
 * worker registration. There is deliberately no fetch handler and no cache,
 * so every load gets the newest deploy and nothing is stored on the device.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// Tapping a notification brings the host tab to the front (or opens the app).
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => 'focus' in c)
      if (win) return win.focus()
      return self.clients.openWindow('/')
    }),
  )
})
