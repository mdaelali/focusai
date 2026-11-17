import zoomSdk from '@zoom/appssdk'

/**
 * Zoom Apps SDK glue. Outside the Zoom client the SDK never answers, so every call is
 * time-limited, and any failure means "not inside Zoom". The site still works in a browser.
 */
const TIMEOUT_MS = 3000

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('zoom sdk timeout')), TIMEOUT_MS)
    p.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      },
    )
  })
}

export interface ZoomContext {
  inZoom: boolean
  /** The student's name as shown in the Zoom meeting, if Zoom provides it. */
  displayName: string
}

export async function initZoom(): Promise<ZoomContext> {
  try {
    await withTimeout(zoomSdk.config({ version: '0.16', capabilities: ['getUserContext', 'openUrl'] }))
  } catch {
    return { inZoom: false, displayName: '' }
  }
  try {
    const user = await withTimeout(zoomSdk.getUserContext())
    return { inZoom: true, displayName: (user.screenName ?? '').trim() }
  } catch {
    return { inZoom: true, displayName: '' }
  }
}

/** Open a link in the student's own browser, where the camera works. */
export async function openInBrowser(url: string, inZoom: boolean): Promise<void> {
  if (!inZoom) {
    window.open(url, '_blank', 'noopener')
    return
  }
  await withTimeout(zoomSdk.openUrl({ url }))
}
