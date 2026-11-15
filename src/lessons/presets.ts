import type { BehaviorPolicy } from '../engagement/behavior'
import { generateKeyPair, roomCodeFromPublicKey, type KeyPairJwk } from '../room/crypto'

/**
 * A lesson preset is everything a teacher would otherwise type before every
 * lesson: a name, the subject, how long it runs, how strict the alerts should
 * be, and when to remind them to take a break. Each preset owns a key pair;
 * its permanent room code is the fingerprint of the public key, so the join
 * link for "TMUA Tuesday" is the same every week and only this browser can
 * open the dashboard for it.
 *
 * Presets live in the teacher's browser (localStorage). Nothing about students
 * is stored here.
 */

export type Sensitivity = 'relaxed' | 'standard' | 'strict'

export interface LessonPreset {
  id: string
  name: string
  subject: string
  durationMin: number
  sensitivity: Sensitivity
  /** Remind the teacher to take a break every N minutes; 0 = off. */
  breakEveryMin: number
  /** Permanent room code for this lesson: the fingerprint of `hostKeys.pub`. */
  roomCode: string
  /** The lesson's key pair. The private half never leaves this browser. */
  hostKeys: KeyPairJwk | null
  /** Free text shown on the host page: today's plan, reminders. */
  notes: string
  createdAt: number
  lastUsedAt: number
  uses: number
}

export const SENSITIVITY_LABEL: Record<Sensitivity, string> = {
  relaxed: 'Relaxed',
  standard: 'Standard',
  strict: 'Strict',
}

export const SENSITIVITY_HINT: Record<Sensitivity, string> = {
  relaxed: 'Seminars, older students, long tasks. Check-ins after 5 min away, 4 min elsewhere.',
  standard: 'Most lessons. Check-ins after 3 min away, 2 min elsewhere, 1 min on a phone.',
  strict: 'Exams practice, younger students. Check-ins after 90 s away, 60 s elsewhere, 30 s on a phone.',
}

/** Alert thresholds each sensitivity applies on every student's device. */
export const SENSITIVITY_POLICY: Record<Sensitivity, Partial<BehaviorPolicy>> = {
  relaxed: { awayAlertMs: 5 * 60_000, distractedAlertMs: 4 * 60_000, phoneAlertMs: 2 * 60_000, notesNoGlanceAlertMs: 8 * 60_000, drowsyAlertMs: 90_000, talkingAlertMs: 8 * 60_000 },
  standard: { awayAlertMs: 3 * 60_000, distractedAlertMs: 2 * 60_000, phoneAlertMs: 60_000, notesNoGlanceAlertMs: 4 * 60_000, drowsyAlertMs: 45_000, talkingAlertMs: 5 * 60_000 },
  strict: { awayAlertMs: 90_000, distractedAlertMs: 60_000, phoneAlertMs: 30_000, notesNoGlanceAlertMs: 3 * 60_000, drowsyAlertMs: 30_000, talkingAlertMs: 3 * 60_000 },
}

const KEY = 'focusai.presets.v1'

export function loadPresets(): LessonPreset[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(isPreset).map((p) => ({ ...p, hostKeys: p.hostKeys ?? null })) : []
  } catch {
    return []
  }
}

export function savePresets(list: LessonPreset[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable */
  }
}

export function upsertPreset(p: LessonPreset): LessonPreset[] {
  const list = loadPresets()
  const i = list.findIndex((x) => x.id === p.id)
  if (i >= 0) list[i] = p
  else list.push(p)
  savePresets(list)
  return list
}

export function removePreset(id: string): LessonPreset[] {
  const list = loadPresets().filter((x) => x.id !== id)
  savePresets(list)
  return list
}

export function markUsed(id: string): void {
  const list = loadPresets()
  const p = list.find((x) => x.id === id)
  if (!p) return
  p.lastUsedAt = Date.now()
  p.uses += 1
  savePresets(list)
}

export function findPreset(id: string): LessonPreset | null {
  return loadPresets().find((x) => x.id === id) ?? null
}

export function findPresetByRoom(code: string): LessonPreset | null {
  return loadPresets().find((x) => x.roomCode === code) ?? null
}

/** A preset starts without keys; `ensureKeys` gives it a key pair and its real room code. */
export function newPreset(partial: Partial<LessonPreset> = {}): LessonPreset {
  return {
    id: crypto.randomUUID(),
    name: '',
    subject: '',
    durationMin: 60,
    sensitivity: 'standard',
    breakEveryMin: 0,
    roomCode: '',
    hostKeys: null,
    notes: '',
    createdAt: Date.now(),
    lastUsedAt: 0,
    uses: 0,
    ...partial,
  }
}

/**
 * Give a preset its key pair and derived room code if it has none yet.
 * Presets saved before encryption existed get a new code here, once.
 */
export async function ensureKeys(p: LessonPreset): Promise<LessonPreset> {
  if (p.hostKeys && p.roomCode) return p
  const hostKeys = await generateKeyPair()
  return { ...p, hostKeys, roomCode: await roomCodeFromPublicKey(hostKeys.pub) }
}

/** Upgrade every stored preset to have keys. Returns the (possibly rewritten) list. */
export async function migratePresets(): Promise<LessonPreset[]> {
  const list = loadPresets()
  let changed = false
  const out: LessonPreset[] = []
  for (const p of list) {
    const q = await ensureKeys(p)
    if (q !== p) changed = true
    out.push(q)
  }
  if (changed) savePresets(out)
  return out
}

function isPreset(v: unknown): v is LessonPreset {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return typeof p.id === 'string' && typeof p.name === 'string' && typeof p.roomCode === 'string' && typeof p.durationMin === 'number'
}

export const SUBJECT_SUGGESTIONS = ['TMUA', 'Calculus', 'AP Computer Science A', 'IELTS', 'Physics', 'Chemistry', 'History', 'Languages', 'Other']
