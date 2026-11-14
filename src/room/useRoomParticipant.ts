import { useEffect, useRef, useState } from 'react'
import type { Alert, BehaviorSnapshot } from '../engagement/behavior'
import { newParticipantId, type ParticipantReport } from './protocol'
import { createTransport, type RoomTransport, type TransportKind } from './transport'

const REPORT_INTERVAL_MS = 2000

/**
 * Publishes the participant's current behaviour state to the room.
 * The caller passes the latest snapshot; this hook throttles and formats it.
 */
export function useRoomParticipant(room: string, name: string) {
  const idRef = useRef<string>(newParticipantId())
  const transportRef = useRef<RoomTransport | null>(null)
  const latestRef = useRef<{ snap: BehaviorSnapshot | null; score: number | null; camera: boolean }>({ snap: null, score: null, camera: false })
  const lastSentRef = useRef(0)
  const [kind, setKind] = useState<TransportKind>('local')
  const [sentCount, setSentCount] = useState(0)

  const buildReport = (): ParticipantReport | null => {
    const { snap, score, camera } = latestRef.current
    const now = Date.now()
    // performance.now() based `since` must be converted to wall-clock time.
    const offset = now - performance.now()
    return {
      kind: 'report',
      id: idRef.current,
      name,
      ts: now,
      state: snap?.state ?? 'no_data',
      since: snap ? Math.round(snap.since + offset) : now,
      score,
      selfStatus: snap?.selfStatus ?? 'none',
      excused: snap?.excused ?? false,
      reason: snap?.reason ?? (camera ? 'Starting' : 'Camera off'),
      camera,
    }
  }

  useEffect(() => {
    const t = createTransport(room)
    transportRef.current = t
    setKind(t.kind)
    const off = t.onMessage((m) => {
      if (m.kind === 'host') {
        const r = buildReport()
        if (r) t.send(r)
      }
    })
    const timer = window.setInterval(() => {
      const r = buildReport()
      if (!r) return
      t.send(r)
      lastSentRef.current = Date.now()
      setSentCount((c) => c + 1)
    }, REPORT_INTERVAL_MS)
    const leave = () => t.send({ kind: 'leave', id: idRef.current, ts: Date.now() })
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      window.clearInterval(timer)
      leave()
      off()
      t.close()
      transportRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, name])

  const publish = (snap: BehaviorSnapshot | null, score: number | null, camera: boolean) => {
    latestRef.current = { snap, score, camera }
    for (const a of snap?.alerts ?? []) sendAlert(a)
  }

  const sendAlert = (alert: Alert) => {
    const offset = Date.now() - performance.now()
    transportRef.current?.send({ kind: 'alert', id: idRef.current, name, ts: Date.now(), alert: { ...alert, t: Math.round(alert.t + offset) } })
  }

  return { id: idRef.current, kind, publish, sentCount }
}
