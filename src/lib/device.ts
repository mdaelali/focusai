/**
 * Small device helpers shared by the student and host pages.
 * Phones and tablets need three things laptops do not: the screen must stay
 * awake during a lesson, notifications must go through a service worker, and
 * the copy should tell people to prop the device up instead of "keep the tab open".
 */

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches ?? false
}

export function isPhoneOrTablet(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || iPadOS
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Installed to the home screen (standalone display mode). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (t: 'release', cb: () => void) => void }

/**
 * Keeps the screen on while `active` is true. Browsers drop the lock whenever
 * the page is hidden, so it is re-acquired when the page becomes visible again.
 * Returns a function that releases it. Silently does nothing where unsupported.
 */
export function holdWakeLock(): () => void {
  const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }
  if (!nav.wakeLock) return () => {}
  let lock: WakeLockSentinelLike | null = null
  let stopped = false
  const acquire = async () => {
    if (stopped || document.visibilityState !== 'visible') return
    try {
      lock = await nav.wakeLock!.request('screen')
      lock.addEventListener('release', () => {
        lock = null
      })
    } catch {
      /* low battery, or not allowed: the OS decides */
    }
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !lock) void acquire()
  }
  document.addEventListener('visibilitychange', onVisible)
  void acquire()
  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', onVisible)
    void lock?.release()
    lock = null
  }
}

/**
 * Show a system notification the way the platform allows. Desktop browsers
 * accept `new Notification()`; Android and iOS only allow notifications via a
 * service worker registration. Returns false if nothing could be shown.
 */
export type NotifyResult = 'shown' | 'blocked' | 'unsupported'

export async function showSystemNotification(title: string, options: NotificationOptions): Promise<NotifyResult> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'granted') return 'blocked'
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg?.showNotification) {
      await reg.showNotification(title, options)
      // The browser accepted it. Whether the OS puts it on screen is up to
      // Do not disturb / Focus settings, which a page cannot see.
      const live = options.tag ? await reg.getNotifications({ tag: options.tag }).catch(() => []) : []
      return live.length > 0 || !options.tag ? 'shown' : 'blocked'
    }
  } catch {
    /* fall through to the constructor */
  }
  try {
    const note = new Notification(title, options)
    note.onclick = () => {
      window.focus()
      note.close()
    }
    if (typeof note.addEventListener !== 'function') return 'shown'
    return await new Promise<NotifyResult>((resolve) => {
      const done = (r: NotifyResult) => {
        window.clearTimeout(timer)
        resolve(r)
      }
      const timer = window.setTimeout(() => done('shown'), 1500)
      note.addEventListener('show', () => done('shown'), { once: true })
      note.addEventListener('error', () => done('blocked'), { once: true })
    })
  } catch {
    return 'blocked'
  }
}

/** True when `Notification.requestPermission` can succeed at all on this device. */
export function notificationsPossible(): 'yes' | 'install-first' | 'no' {
  if (typeof Notification === 'undefined') {
    // iOS Safari exposes Notification only inside an installed web app.
    return isIOS() && !isStandalone() ? 'install-first' : 'no'
  }
  return 'yes'
}
