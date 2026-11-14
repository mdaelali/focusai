import { useCallback, useEffect, useRef, useState } from 'react'
import { STATE_LABEL, type BehaviorState } from '../engagement/behavior'
import type { HostAlert, RosterEntry } from './useRoomHost'

/**
 * Turns roster changes and alerts into things a busy host actually notices:
 *
 * 1. An on-screen toast the moment a participant enters a warning state
 *    (stepped away, looking elsewhere, using phone, eyes closed) that is not
 *    excused by a self-declared status.
 * 2. A short beep (two tones for a check-in alert, one for a state change).
 * 3. A desktop notification when the host tab is not visible, which is the
 *    normal case because the meeting window is in front. Requires permission.
 */

export interface Notice {
  id: string
  ts: number
  name: string
  state: BehaviorState
  text: string
  kind: 'state' | 'check_in' | 'info'
}

const WARN_STATES: ReadonlySet<BehaviorState> = new Set<BehaviorState>(['stepped_away', 'distracted', 'using_phone', 'drowsy'])
const TOAST_MS = 10_000

export function useHostNotices(participants: RosterEntry[], alerts: HostAlert[]) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [sound, setSound] = useState(true)
  const [desktop, setDesktop] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const prevStates = useRef<Map<string, BehaviorState>>(new Map())
  const seenAlerts = useRef<Set<string>>(new Set())
  const audioRef = useRef<AudioContext | null>(null)

  const beep = useCallback((times: number) => {
    if (!sound) return
    try {
      audioRef.current ??= new AudioContext()
      const ctx = audioRef.current
      if (ctx.state === 'suspended') void ctx.resume()
      for (let i = 0; i < times; i++) {
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.frequency.value = i === 0 ? 660 : 880
        g.gain.value = 0.06
        o.connect(g).connect(ctx.destination)
        const at = ctx.currentTime + i * 0.22
        o.start(at)
        o.stop(at + 0.16)
      }
    } catch {
      /* no audio */
    }
  }, [sound])

  const push = useCallback(
    (n: Notice) => {
      setNotices((prev) => [n, ...prev].slice(0, 6))
      window.setTimeout(() => setNotices((prev) => prev.filter((x) => x.id !== n.id)), TOAST_MS)
      beep(n.kind === 'check_in' ? 2 : 1)
      if (desktop === 'granted' && document.visibilityState !== 'visible') {
        try {
          const note = new Notification(`FocusAI: ${n.name}`, { body: n.text, tag: `focusai-${n.name}`, silent: true })
          note.onclick = () => {
            window.focus()
            note.close()
          }
        } catch {
          /* notifications blocked */
        }
      }
    },
    [beep, desktop],
  )

  // State transitions into a warning state.
  useEffect(() => {
    const prev = prevStates.current
    const next = new Map<string, BehaviorState>()
    for (const p of participants) {
      next.set(p.id, p.state)
      const before = prev.get(p.id)
      if (before !== undefined && before !== p.state && WARN_STATES.has(p.state) && !p.excused && !p.stale && !p.left) {
        push({
          id: `${p.id}-${p.state}-${p.ts}`,
          ts: Date.now(),
          name: p.name,
          state: p.state,
          text: `${STATE_LABEL[p.state]} just now`,
          kind: 'state',
        })
      }
    }
    prevStates.current = next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants])

  // Sustained-pattern alerts from participants.
  useEffect(() => {
    for (const a of alerts) {
      const key = `${a.id}-${a.alert.id}`
      if (seenAlerts.current.has(key)) continue
      seenAlerts.current.add(key)
      push({
        id: `alert-${key}`,
        ts: a.ts,
        name: a.name,
        state: a.alert.state,
        text: a.alert.message,
        kind: a.alert.severity === 'check_in' ? 'check_in' : 'info',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts])

  const requestDesktop = useCallback(async () => {
    if (typeof Notification === 'undefined') return
    try {
      setDesktop(await Notification.requestPermission())
    } catch {
      /* ignore */
    }
  }, [])

  const dismiss = useCallback((id: string) => setNotices((prev) => prev.filter((n) => n.id !== id)), [])

  return { notices, dismiss, sound, setSound, desktop, requestDesktop }
}
