import { getSetting, setSetting, initDB } from './db'
import { getTotalDueCount, getAllDueContacts } from './nudge'

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications')
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission === 'denied') {
    return false
  }

  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

export function isNotificationEnabled(): boolean {
  return 'Notification' in window && Notification.permission === 'granted'
}

export async function showDueContactsNotification(): Promise<void> {
  if (!isNotificationEnabled()) return

  await initDB()
  const dueCount = getTotalDueCount()

  if (dueCount === 0) return

  const dueContacts = getAllDueContacts()
  const names = dueContacts
    .flatMap(d => d.contacts.slice(0, 2))
    .map(c => c.name.split(' ')[0])
    .slice(0, 3)

  const body = names.length > 0
    ? `Time to reach out to ${names.join(', ')}${dueCount > names.length ? ` and ${dueCount - names.length} more` : ''}`
    : `You have ${dueCount} contact${dueCount > 1 ? 's' : ''} to check in with`

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    // Use service worker for notification (will work when app is closed)
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      payload: {
        title: 'Friends Check-in',
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'due-contacts',
        data: { url: '/' },
      },
    })
  } else {
    // Fallback to regular notification
    new Notification('Friends Check-in', {
      body,
      icon: '/pwa-192x192.png',
      tag: 'due-contacts',
    })
  }
}

export async function scheduleNotification(): Promise<void> {
  await initDB()
  const enabled = getSetting('notification_enabled')
  if (enabled === 'false') return

  const timeStr = getSetting('notification_time') || '16:00'
  const [hours, minutes] = timeStr.split(':').map(Number)

  const now = new Date()
  const scheduledTime = new Date()
  scheduledTime.setHours(hours, minutes, 0, 0)

  // If the time has already passed today, schedule for tomorrow
  if (scheduledTime <= now) {
    scheduledTime.setDate(scheduledTime.getDate() + 1)
  }

  const delay = scheduledTime.getTime() - now.getTime()

  // Store the scheduled time
  setSetting('next_notification_at', String(scheduledTime.getTime()))

  // Set a timeout for the notification
  setTimeout(async () => {
    await showDueContactsNotification()
    // Schedule the next one
    scheduleNotification()
  }, delay)
}

export async function initNotifications(): Promise<void> {
  if (!isNotificationEnabled()) return

  // Check if we have a scheduled notification
  await initDB()
  const nextNotification = getSetting('next_notification_at')

  if (nextNotification) {
    const scheduledTime = parseInt(nextNotification)
    const now = Date.now()

    // If the scheduled time has passed, show notification and reschedule
    if (scheduledTime <= now) {
      await showDueContactsNotification()
    }
  }

  // Schedule the next notification
  await scheduleNotification()
}

// Register for periodic background sync (if supported)
export async function registerPeriodicSync(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false

  try {
    const registration = await navigator.serviceWorker.ready

    if ('periodicSync' in registration) {
      // @ts-expect-error - periodicSync is experimental
      await registration.periodicSync.register('check-due-contacts', {
        minInterval: 24 * 60 * 60 * 1000, // 24 hours
      })
      return true
    }
  } catch (error) {
    console.log('Periodic sync registration failed:', error)
  }

  return false
}
