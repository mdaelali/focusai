import type { Alert, BehaviorPolicy, BehaviorState, SelfStatus } from '../engagement/behavior'

/**
 * What crosses the network between a participant and the host.
 * Deliberately tiny: a state label, a timestamp, a score. Never a frame,
 * never landmarks, never raw angles.
 */

export interface ParticipantReport {
  kind: 'report'
  id: string
  name: string
  /** Wall-clock ms (Date.now) when sent. */
  ts: number
  state: BehaviorState
  /** Wall-clock ms when the state began. */
  since: number
  score: number | null
  selfStatus: SelfStatus
  excused: boolean
  reason: string
  /** True while the camera is running on the participant side. */
  camera: boolean
}

export interface AlertMessage {
  kind: 'alert'
  id: string
  name: string
  ts: number
  alert: Alert
}

export interface LeaveMessage {
  kind: 'leave'
  id: string
  ts: number
}

/** What the host tells participants about the lesson. */
export interface LessonInfo {
  name: string
  subject: string
  durationMin: number
  /** Wall-clock ms when the host opened the room. */
  startedAt: number
}

/**
 * The host announces itself so participants resend their latest state, and
 * passes the lesson's alert thresholds so every device applies the same rules.
 */
export interface HostHello {
  kind: 'host'
  ts: number
  lesson?: LessonInfo
  policy?: Partial<BehaviorPolicy>
}

export type RoomMessage = ParticipantReport | AlertMessage | LeaveMessage | HostHello

const STATES = new Set(['attentive', 'taking_notes', 'talking_to_someone', 'brief_interruption', 'stepped_away', 'drowsy', 'distracted', 'using_phone', 'no_data'])
const SELF = new Set(['none', 'notes', 'away', 'busy'])
const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

/**
 * Validate a message from the channel. Anyone who knows the room code can send
 * on it, so every field is checked for type, allowed values and length before
 * it reaches state or the screen.
 */
export function isRoomMessage(v: unknown): v is RoomMessage {
  if (!v || typeof v !== 'object') return false
  const m = v as Record<string, unknown>
  switch (m.kind) {
    case 'report':
      return str(m.id, 64) && str(m.name, 40) && num(m.ts) && num(m.since) &&
        STATES.has(m.state as string) && (m.score === null || (num(m.score) && (m.score as number) >= 0 && (m.score as number) <= 100)) &&
        SELF.has(m.selfStatus as string) && typeof m.excused === 'boolean' && str(m.reason, 120) && typeof m.camera === 'boolean'
    case 'alert': {
      const a = m.alert as Record<string, unknown> | undefined
      return str(m.id, 64) && str(m.name, 40) && num(m.ts) && !!a && str(a.id, 64) && num(a.t) &&
        STATES.has(a.state as string) && (a.severity === 'info' || a.severity === 'check_in') && str(a.message, 200)
    }
    case 'leave':
      return str(m.id, 64) && num(m.ts)
    case 'host': {
      if (!num(m.ts)) return false
      if (m.lesson !== undefined) {
        const l = m.lesson as Record<string, unknown> | null
        if (!l || !str(l.name, 80) || !str(l.subject, 40) || !num(l.durationMin) || !num(l.startedAt)) return false
      }
      if (m.policy !== undefined) {
        const p = m.policy as Record<string, unknown> | null
        if (!p || Object.keys(p).length > 20 || !Object.values(p).every(num)) return false
      }
      return true
    }
    default:
      return false
  }
}

/** Six characters, no ambiguous glyphs. */
export function newRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

export function normaliseRoomCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

export function newParticipantId(): string {
  try {
    const k = 'focusai.participant.id'
    const existing = sessionStorage.getItem(k)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(k, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}
