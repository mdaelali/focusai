import { useEffect, useState } from 'react'
import { normaliseRoomCode } from '../room/protocol'
import { initZoom, openInBrowser } from '../zoom/zoomApp'

/**
 * Entry point when FocusAI runs as a Zoom App (home URL https://myfocusai.app/#/zoom).
 *
 * The room code is the teacher's key fingerprint, so it is typed in (or taken from the
 * teacher's link). The Zoom meeting ID is deliberately NOT used: students would fail to
 * verify the teacher. The page checks whether the camera works inside Zoom's browser;
 * if not, it hands the lesson to the student's own browser.
 */
export default function ZoomApp() {
  const [inZoom, setInZoom] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    initZoom().then((c) => {
      if (!alive) return
      setInZoom(c.inZoom)
      if (c.displayName) setName((n) => n || c.displayName)
    })
    return () => {
      alive = false
    }
  }, [])

  const room = normaliseRoomCode(code)
  const who = name.trim()
  const ready = room.length > 0 && who.length > 0
  const link = ready ? `${location.origin}/#/join/${room}?name=${encodeURIComponent(who)}` : ''

  const joinHere = async () => {
    setBusy(true)
    setNote(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach((t) => t.stop())
      location.hash = `#/join/${room}?name=${encodeURIComponent(who)}`
    } catch {
      setNote("Zoom's window can't use your camera. Open FocusAI in your browser instead.")
    } finally {
      setBusy(false)
    }
  }

  const openBrowser = async () => {
    if (!link) return
    try {
      await openInBrowser(link, inZoom)
    } catch {
      setNote(`Could not open the browser. Copy this link: ${link}`)
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">FocusAI</h1>
        <p className="text-sm text-[var(--muted)]">
          Your video stays on this device. Only a status word and a number reach your teacher.
        </p>
      </header>

      <label className="flex flex-col gap-1 text-sm">
        Room code from your teacher
        <input
          className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 font-mono tracking-widest"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          maxLength={12}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Your name
        <input
          className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={40}
        />
      </label>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-[var(--bg)] disabled:opacity-50"
          disabled={!ready || busy}
          onClick={joinHere}
        >
          {busy ? 'Checking camera…' : 'Join with camera'}
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--border)] px-4 py-2 disabled:opacity-50"
          disabled={!ready}
          onClick={openBrowser}
        >
          Open FocusAI in my browser
        </button>
        {note && (
          <p role="alert" className="text-sm text-[var(--warn)]">
            {note}
          </p>
        )}
      </div>

      <p className="text-xs text-[var(--muted)]">{inZoom ? 'Running inside Zoom.' : 'Running outside Zoom.'}</p>
    </div>
  )
}
