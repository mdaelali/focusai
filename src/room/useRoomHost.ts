import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EXCUSED_STATES, STATE_LABEL, type BehaviorState, type SelfStatus } from '../engagement/behavior'
import type { AlertMessage, HostHello, ParticipantReport } from './protocol'
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

/** One sample of the whole class, taken every CLASS_SAMPLE_MS. */
export interface ClassSample {
  t: number
  /** Minutes since the room opened, for charts. */
  min: number
  total: number
  attentive: number
  excused: number
  warn: number
  noData: number
  /** Share of participants with data who are attentive or excused, 0..100. */
  okPct: number | null
}

/** One continuous stretch of a student in one state. */
export interface Episode {
  state: BehaviorState
  selfStatus: SelfStatus
  reason: string
  /** Wall-clock ms */
  start: number
  end: number
  /** True while the episode is still running. */
  open: boolean
}

export interface ParticipantTotals {
  id: string
  name: string
  /** ms spent in each state while reporting. */
  byState: Partial<Record<BehaviorState, number>>
  /** ms with a self-declared status. */
  selfDeclaredMs: number
  alerts: number
  firstSeen: number
  lastSeen: number
  episodes: Episode[]
  alertLog: { ts: number; state: BehaviorState; severity: string; message: string }[]
}

const STALE_MS = 15_000
const DROP_MS = 10 * 60_000
const CLASS_SAMPLE_MS = 10_000
/** Two reports are normally 2 s apart; a gap longer than this is not attributed to the old state. */
const MAX_ATTRIBUTE_MS = 10_000

const WARN_STATES: ReadonlySet<BehaviorState> = new Set<BehaviorState>(['stepped_away', 'distracted', 'using_phone', 'drowsy'])

export function bucketOf(p: Pick<RosterEntry, 'state' | 'excused' | 'camera' | 'stale'>): 'attentive' | 'excused' | 'warn' | 'noData' {
  if (p.stale || !p.camera || p.state === 'no_data') return 'noData'
  if (p.state === 'attentive') return 'attentive'
  if (p.excused || EXCUSED_STATES.has(p.state)) return 'excused'
  if (WARN_STATES.has(p.state)) return 'warn'
  return 'excused'
}

export interface HostOptions {
  lesson?: HostHello['lesson']
  policy?: HostHello['policy']
}

export function useRoomHost(room: string, options: HostOptions = {}) {
  const transportRef = useRef<RoomTransport | null>(null)
  const [kind, setKind] = useState<TransportKind>('local')
  const [roster, setRoster] = useState<Map<string, RosterEntry>>(() => new Map())
  const [alerts, setAlerts] = useState<HostAlert[]>([])
  const [timeline, setTimeline] = useState<ClassSample[]>([])
  const [episodeVersion, setEpisodeVersion] = useState(0)
  const openedAtRef = useRef(Date.now())
  const totalsRef = useRef<Map<string, ParticipantTotals>>(new Map())
  const rosterRef = useRef(roster)
  rosterRef.current = roster
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const t = createTransport(room)
    transportRef.current = t
    setKind(t.kind)
    const off = t.onMessage((m) => {
      const now = Date.now()
      if (m.kind === 'report') {
        // Attribute time since the previous report to the previous state.
        const prev = rosterRef.current.get(m.id)
        if (!prev) t.send(hello())
        const tot = totalsRef.current.get(m.id) ?? {
          id: m.id, name: m.name, byState: {}, selfDeclaredMs: 0, alerts: 0, firstSeen: m.ts, lastSeen: m.ts, episodes: [], alertLog: [],
        }
        // Episode log: close the running episode when state or self-status changes.
        const st: BehaviorState = m.camera ? m.state : 'no_data'
        const last = tot.episodes[tot.episodes.length - 1]
        if (!last || last.state !== st || last.selfStatus !== m.selfStatus) {
          if (last && last.open) {
            last.end = m.ts
            last.open = false
          }
          tot.episodes.push({ state: st, selfStatus: m.selfStatus, reason: m.reason, start: last ? m.ts : Math.min(m.ts, m.since), end: m.ts, open: true })
        } else {
          last.end = m.ts
        }
        if (tot.episodes.length > 2000) tot.episodes.splice(0, tot.episodes.length - 2000)
        setEpisodeVersion((v) => v + 1)
        if (prev) {
          const dt = Math.min(Math.max(0, m.ts - prev.ts), MAX_ATTRIBUTE_MS)
          const st: BehaviorState = prev.camera ? prev.state : 'no_data'
          tot.byState[st] = (tot.byState[st] ?? 0) + dt
          if (prev.selfStatus !== 'none') tot.selfDeclaredMs += dt
        }
        tot.name = m.name
        tot.lastSeen = m.ts
        totalsRef.current.set(m.id, tot)
        setRoster((prevMap) => {
          const next = new Map(prevMap)
          next.set(m.id, { ...m, lastSeen: now, stale: false })
          return next
        })
      } else if (m.kind === 'alert') {
        const tot = totalsRef.current.get(m.id)
        if (tot) {
          tot.alerts++
          tot.alertLog.push({ ts: m.ts, state: m.alert.state, severity: m.alert.severity, message: m.alert.message })
        }
        setAlerts((prev) => (prev.some((a) => a.alert.id === m.alert.id && a.id === m.id) ? prev : [{ ...m, seen: false }, ...prev].slice(0, 200)))
      } else if (m.kind === 'leave') {
        setRoster((prev) => {
          const next = new Map(prev)
          next.delete(m.id)
          return next
        })
      }
    })
    const hello = (): HostHello => ({ kind: 'host', ts: Date.now(), lesson: optionsRef.current.lesson, policy: optionsRef.current.policy })
    t.send(hello())
    const helloTimer = window.setInterval(() => t.send(hello()), 30_000)

    const staleTimer = window.setInterval(() => {
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

    const sampleTimer = window.setInterval(() => {
      const now = Date.now()
      const people = [...rosterRef.current.values()]
      const s: ClassSample = { t: now, min: Math.round(((now - openedAtRef.current) / 60_000) * 10) / 10, total: people.length, attentive: 0, excused: 0, warn: 0, noData: 0, okPct: null }
      for (const p of people) s[bucketOf(p)]++
      const withData = s.total - s.noData
      s.okPct = withData > 0 ? Math.round(((s.attentive + s.excused) / withData) * 100) : null
      setTimeline((prev) => [...prev, s].slice(-720)) // 2 hours at 10 s
    }, CLASS_SAMPLE_MS)

    return () => {
      window.clearInterval(staleTimer)
      window.clearInterval(helloTimer)
      window.clearInterval(sampleTimer)
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

  /** Per-student records, refreshed whenever an episode changes. */
  const students = useMemo(() => {
    void episodeVersion
    return [...totalsRef.current.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [episodeVersion])

  /** Everything a teacher might want to keep from the lesson, as plain data. */
  const buildReport = useCallback(() => {
    const now = Date.now()
    const people = [...totalsRef.current.values()].map((t) => {
      const total = Object.values(t.byState).reduce((a, b) => a + (b ?? 0), 0)
      const pct = (st: BehaviorState) => (total > 0 ? Math.round(((t.byState[st] ?? 0) / total) * 100) : 0)
      return {
        name: t.name,
        joinedAt: new Date(t.firstSeen).toISOString(),
        leftAt: new Date(t.lastSeen).toISOString(),
        minutesTracked: Math.round(total / 6000) / 10,
        attentivePct: pct('attentive'),
        notesPct: pct('taking_notes'),
        talkingPct: pct('talking_to_someone'),
        awayPct: pct('stepped_away') + pct('brief_interruption'),
        elsewherePct: pct('distracted'),
        phonePct: pct('using_phone'),
        eyesClosedPct: pct('drowsy'),
        noDataPct: pct('no_data'),
        selfDeclaredMinutes: Math.round(t.selfDeclaredMs / 6000) / 10,
        alerts: t.alerts,
        alertLog: t.alertLog.map((a) => ({ time: new Date(a.ts).toISOString(), state: STATE_LABEL[a.state], severity: a.severity, message: a.message })),
        episodes: t.episodes
          .filter((e) => e.end - e.start >= 1000)
          .map((e) => ({
            state: STATE_LABEL[e.state],
            selfDeclared: e.selfStatus === 'none' ? '' : e.selfStatus,
            start: new Date(e.start).toISOString(),
            end: new Date(e.end).toISOString(),
            seconds: Math.round((e.end - e.start) / 1000),
            reason: e.reason,
          })),
      }
    })
    return {
      room,
      openedAt: new Date(openedAtRef.current).toISOString(),
      closedAt: new Date(now).toISOString(),
      durationMinutes: Math.round((now - openedAtRef.current) / 6000) / 10,
      participants: people,
      classTimeline: timeline.map((s) => ({ minute: s.min, participants: s.total, attentive: s.attentive, normalActivity: s.excused, needsAttention: s.warn, noData: s.noData, okPct: s.okPct })),
      alerts: alerts.map((a) => ({ time: new Date(a.ts).toISOString(), name: a.name, state: STATE_LABEL[a.alert.state], severity: a.alert.severity, message: a.alert.message })).reverse(),
      note: 'States describe where the head and eyes were pointed. They say nothing about understanding and must not be used for grading.',
    }
  }, [room, timeline, alerts])

  return { kind, participants, alerts, timeline, students, markSeen, clearAlerts, buildReport }
}
