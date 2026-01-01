/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

// Precache and route all assets
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          client.navigate(urlToOpen)
          return
        }
      }
      // Open a new window if none found
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen)
      }
    })
  )
})

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, badge, tag, data } = event.data.payload

    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data,
      requireInteraction: true,
    } as NotificationOptions)
  }

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Handle periodic sync (experimental - only works in Chrome with flag)
self.addEventListener('periodicsync', (event: Event) => {
  const syncEvent = event as unknown as { tag: string; waitUntil: (promise: Promise<void>) => void }

  if (syncEvent.tag === 'check-due-contacts') {
    syncEvent.waitUntil(
      (async () => {
        // Post message to any open clients to check due contacts
        const clients = await self.clients.matchAll({ type: 'window' })
        for (const client of clients) {
          client.postMessage({ type: 'CHECK_DUE_CONTACTS' })
        }
      })()
    )
  }
})
