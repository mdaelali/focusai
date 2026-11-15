import type { Alert, BehaviorPolicy, BehaviorState, SelfStatus } from '../engagement/behavior'

/**
 * What crosses the network between a participant and the host.
 * Deliberately tiny: a state label, a timestamp, a score. Never a frame,
 * never landmarks, never raw angles.
 *
 * Everything a participant says is sealed (see crypto.ts) so only the host
 * can read it and nobody can forge a classmate. The only plaintext messages
 * are the host's hello (lesson name, thresholds, host public key) and a
 * participant's knock asking the host to say hello.
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
 * `pub` is the host's public key; the room code is its fingerprint.
 */
export interface HostHello {
  kind: 'host'
  ts: number
  pub: string
  lesson?: LessonInfo
  policy?: Partial<BehaviorPolicy>
}

/** A participant asking the host to (re)send its hello. */
export interface KnockMessage {
  kind: 'knock'
  ts: number
}

/** A participant message encrypted to the host. `id` is the fingerprint of `pub`. */
export interface SealedMessage {
  kind: 'sealed'
  id: string
  pub: string
  iv: string
  ct: string
  ts: number
}

/** Messages a participant sends, before sealing. */
export type ParticipantMessage = ParticipantReport | AlertMessage | LeaveMessage
/** Everything that can appear on the channel. */
export type RoomMessage = HostHello | KnockMessage | SealedMessage

const STATES = new Set(['attentive', 'taking_notes', 'talking_to_someone', 'brief_interruption', 'stepped_away', 'drowsy', 'distracted', 'using_phone', 'no_data'])
const SELF = new Set(['none', 'notes', 'away', 'busy', 'fine'])
const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const B64 = /^[A-Za-z0-9+/]+=*$/
const HEX16 = /^[0-9a-f]{16}$/

/** Validate what arrives on the channel (plaintext layer). */
export function isRoomMessage(v: unknown): v is RoomMessage {
  if (!v || typeof v !== 'object') return false
  const m = v as Record<string, unknown>
  switch (m.kind) {
    case 'host': {
      if (!num(m.ts) || !str(m.pub, 120) || !B64.test(m.pub as string)) return false
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
    case 'knock':
      return num(m.ts)
    case 'sealed':
      return num(m.ts) && typeof m.id === 'string' && HEX16.test(m.id) && str(m.pub, 120) && B64.test(m.pub as string) &&
        str(m.iv, 24) && B64.test(m.iv as string) && str(m.ct, 4096) && B64.test(m.ct as string)
    default:
      return false
  }
}

/** Validate a decrypted participant message. Every field is checked before it reaches state or the screen. */
export function isParticipantMessage(v: unknown): v is ParticipantMessage {
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
    default:
      return false
  }
}

export function normaliseRoomCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}
