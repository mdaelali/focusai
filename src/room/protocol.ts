import type { Alert, BehaviorState, SelfStatus } from '../engagement/behavior'

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

/** The host announces itself so participants resend their latest state. */
export interface HostHello {
  kind: 'host'
  ts: number
}

export type RoomMessage = ParticipantReport | AlertMessage | LeaveMessage | HostHello

export function isRoomMessage(v: unknown): v is RoomMessage {
  if (!v || typeof v !== 'object') return false
  const k = (v as { kind?: unknown }).kind
  return k === 'report' || k === 'alert' || k === 'leave' || k === 'host'
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
