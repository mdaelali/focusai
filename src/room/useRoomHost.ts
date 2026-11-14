import { useEffect, useMemo, useRef, useState } from 'react'
import type { AlertMessage, ParticipantReport } from './protocol'
import { createTransport, type RoomTransport, type TransportKind } from './transport'

export interface RosterEntry extends ParticipantReport {
  /** Wall-clock ms of the last message from this participant. */
  lastSeen: number
  /** No report for a while: tab closed, network gone, or laptop asleep. */
  stale: boolean
}

export interface HostAlert extends AlertMessage {
  seen: boolean
}

const STALE_MS = 15_000
const DROP_MS = 10 * 60_000

export function useRoomHost(room: string) {
  const transportRef = useRef<RoomTransport | null>(null)
  const [kind, setKind] = useState<TransportKind>('local')
  const [roster, setRoster] = useState<Map<string, RosterEntry>>(() => new Map())
  const [alerts, setAlerts] = useState<HostAlert[]>([])

  useEffect(() => {
    const t = createTransport(room)
    transportRef.current = t
    setKind(t.kind)
    const off = t.onMessage((m) => {
      const now = Date.now()
      if (m.kind === 'report') {
        setRoster((prev) => {
          const next = new Map(prev)
          next.set(m.id, { ...m, lastSeen: now, stale: false })
          return next
        })
      } else if (m.kind === 'alert') {
        setAlerts((prev) => (prev.some((a) => a.alert.id === m.alert.id && a.id === m.id) ? prev : [{ ...m, seen: false }, ...prev].slice(0, 200)))
      } else if (m.kind === 'leave') {
        setRoster((prev) => {
          const next = new Map(prev)
          next.delete(m.id)
          return next
        })
      }
    })
    t.send({ kind: 'host', ts: Date.now() })

    const timer = window.setInterval(() => {
      const now = Date.now()
      setRoster((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const [id, e] of next) {
          if (now - e.lastSeen > DROP_MS) {
            next.delete(id)
            changed = true
          } else {
            const stale = now - e.lastSeen > STALE_MS
            if (stale !== e.stale) {
              next.set(id, { ...e, stale })
              changed = true
            }
          }
        }
        return changed ? next : prev
      })
    }, 2000)

    return () => {
      window.clearInterval(timer)
      off()
      t.close()
      transportRef.current = null
    }
  }, [room])

  const participants = useMemo(
    () => [...roster.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [roster],
  )

  const markSeen = (id?: string) => setAlerts((prev) => prev.map((a) => (id === undefined || a.alert.id === id ? { ...a, seen: true } : a)))
  const clearAlerts = () => setAlerts([])

  return { kind, participants, alerts, markSeen, clearAlerts }
}
