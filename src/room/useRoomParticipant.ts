import { useCallback, useEffect, useRef, useState } from 'react'
import type { Alert, BehaviorSnapshot } from '../engagement/behavior'
import type { HostHello, ParticipantMessage, ParticipantReport } from './protocol'
import { createTransport, type RoomTransport, type TransportKind } from './transport'
import { deriveRoomKey, generateKeyPair, participantIdFromPublicKey, roomCodeFromPublicKey, seal, sealAad, type KeyPairJwk } from './crypto'

/** Heartbeat when nothing changes. Changes are sent at once. */
const HEARTBEAT_MS = 10_000
/** Never send two reports closer than this, even on rapid changes. */
const MIN_GAP_MS = 750
/** Knock until the host answers with its hello. */
const KNOCK_MS = 4000

export type HostLink = 'connecting' | 'verified' | 'untrusted'

interface Identity extends KeyPairJwk {
  id: string
}

/** One key pair per browser session, so a reload keeps the same participant id. */
async function loadIdentity(): Promise<Identity> {
  const k = 'focusai.participant.keys.v1'
  try {
    const raw = sessionStorage.getItem(k)
    if (raw) {
      const kp = JSON.parse(raw) as KeyPairJwk
      if (kp?.priv && kp?.pub) return { ...kp, id: await participantIdFromPublicKey(kp.pub) }
    }
  } catch {
    /* fall through */
  }
  const kp = await generateKeyPair()
  try {
    sessionStorage.setItem(k, JSON.stringify(kp))
  } catch {
    /* private window: a new identity per load is fine */
  }
  return { ...kp, id: await participantIdFromPublicKey(kp.pub) }
}

/**
 * Publishes the participant's current behaviour state to the room, sealed so
 * only the host can read it. The caller passes the latest snapshot; this hook
 * sends on change and otherwise heartbeats.
 */
export function useRoomParticipant(room: string, name: string, onHello?: (h: HostHello) => void) {
  const transportRef = useRef<RoomTransport | null>(null)
  const identityRef = useRef<Identity | null>(null)
  const keyRef = useRef<CryptoKey | null>(null)
  const hostPubRef = useRef<string | null>(null)
  const latestRef = useRef<{ snap: BehaviorSnapshot | null; score: number | null; camera: boolean; note: string | null }>({ snap: null, score: null, camera: false, note: null })
  const lastSentRef = useRef(0)
  const lastSigRef = useRef('')
  const [kind, setKind] = useState<TransportKind>('local')
  const [sentCount, setSentCount] = useState(0)
  const [lesson, setLesson] = useState<HostHello['lesson'] | null>(null)
  const [link, setLink] = useState<HostLink>('connecting')
  const [id, setId] = useState<string>('')
  const onHelloRef = useRef(onHello)
  onHelloRef.current = onHello

  const buildReport = (): ParticipantReport | null => {
    const me = identityRef.current
    if (!me) return null
    const { snap, score, camera, note } = latestRef.current
    const now = Date.now()
    // performance.now() based `since` must be converted to wall-clock time.
    const offset = now - performance.now()
    return {
      kind: 'report',
      id: me.id,
      name,
      ts: now,
      state: snap?.state ?? 'no_data',
      since: snap ? Math.round(snap.since + offset) : now,
      score,
      selfStatus: snap?.selfStatus ?? 'none',
      excused: snap?.excused ?? false,
      reason: camera ? (snap?.reason ?? 'Starting') : (note ?? 'Camera off'),
      camera,
    }
  }

  /** Seal and send. Silently drops until the host is verified. */
  const sendSealed = async (m: ParticipantMessage) => {
    const t = transportRef.current
    const me = identityRef.current
    const key = keyRef.current
    if (!t || !me || !key) return false
    const payload = await seal(key, m, sealAad(room, me.id))
    t.send({ kind: 'sealed', id: me.id, pub: me.pub, ...payload, ts: Date.now() })
    return true
  }

  const sendReport = async (force: boolean) => {
    const r = buildReport()
    if (!r) return
    const now = Date.now()
    const sig = `${r.state}|${r.selfStatus}|${r.camera}|${r.excused}|${r.reason}`
    const changed = sig !== lastSigRef.current
    const due = now - lastSentRef.current >= HEARTBEAT_MS
    if (!force && !changed && !due) return
    if (!force && changed && now - lastSentRef.current < MIN_GAP_MS) return // the heartbeat tick will pick it up
    if (await sendSealed(r)) {
      lastSentRef.current = now
      lastSigRef.current = sig
      setSentCount((c) => c + 1)
    }
  }

  useEffect(() => {
    let closed = false
    const t = createTransport(room)
    transportRef.current = t
    setKind(t.kind)
    setLink('connecting')
    keyRef.current = null
    hostPubRef.current = null

    void loadIdentity().then((me) => {
      if (closed) return
      identityRef.current = me
      setId(me.id)
      t.send({ kind: 'knock', ts: Date.now() })
    })

    const off = t.onMessage((m) => {
      if (m.kind !== 'host') return
      void (async () => {
        // The room code is the fingerprint of the host's key. A hello whose
        // key does not match is someone else with the code, not the teacher.
        const expected = await roomCodeFromPublicKey(m.pub)
        if (expected !== room) {
          if (!hostPubRef.current) setLink('untrusted')
          return
        }
        const me = identityRef.current
        if (!me || closed) return
        if (hostPubRef.current !== m.pub) {
          keyRef.current = await deriveRoomKey(me.priv, m.pub, room)
          hostPubRef.current = m.pub
          setLink('verified')
        }
        if (m.lesson) setLesson(m.lesson)
        onHelloRef.current?.(m)
        void sendReport(true)
      })()
    })

    const knockTimer = window.setInterval(() => {
      if (!keyRef.current && identityRef.current) t.send({ kind: 'knock', ts: Date.now() })
    }, KNOCK_MS)
    const beat = window.setInterval(() => void sendReport(false), 1000)
    const leave = () => {
      const me = identityRef.current
      if (me) void sendSealed({ kind: 'leave', id: me.id, ts: Date.now() })
    }
    window.addEventListener('pagehide', leave)
    return () => {
      closed = true
      window.removeEventListener('pagehide', leave)
      window.clearInterval(knockTimer)
      window.clearInterval(beat)
      leave()
      off()
      t.close()
      transportRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, name])

  const publish = useCallback((snap: BehaviorSnapshot | null, score: number | null, camera: boolean, note: string | null = null) => {
    latestRef.current = { snap, score, camera, note }
    for (const a of snap?.alerts ?? []) sendAlert(a)
    void sendReport(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Send the current report immediately (used right before a phone suspends the page). */
  const flush = useCallback(() => void sendReport(true), []) // eslint-disable-line react-hooks/exhaustive-deps

  const sendAlert = (alert: Alert) => {
    const me = identityRef.current
    if (!me) return
    const offset = Date.now() - performance.now()
    void sendSealed({ kind: 'alert', id: me.id, name, ts: Date.now(), alert: { ...alert, t: Math.round(alert.t + offset) } })
  }

  return { id, kind, link, publish, flush, sentCount, lesson }
}
