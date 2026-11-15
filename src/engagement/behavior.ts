import type { Calibration, FrameMeasurement } from '../vision/types'
import type { Thresholds, WindowStats } from './engagement'
import { deriveGaze } from './engagement'

/**
 * Context-aware behaviour layer.
 *
 * The raw engagement score answers "where were the head and eyes pointed".
 * That is not the same as "is this person ignoring the lesson". A student
 * writing notes looks down. Someone whose parent walks in turns and talks.
 * Someone who drops a pen disappears for ten seconds. None of those are the
 * student's fault and none of them should wake the teacher.
 *
 * This module turns the window statistics into a small set of named states,
 * gives each state a generous "benefit of the doubt" period, and only raises
 * an alert when a pattern is both sustained and not explained by a normal
 * activity. Alerts are phrased as a suggestion to check in, never as a verdict.
 */

export type BehaviorState =
  | 'attentive'
  | 'taking_notes'
  | 'talking_to_someone'
  | 'brief_interruption'
  | 'stepped_away'
  | 'drowsy'
  | 'distracted'
  | 'using_phone'
  | 'no_data'

/** A status the participant declares about themselves. Always trusted over the camera. */
export type SelfStatus = 'none' | 'notes' | 'away' | 'busy' | 'fine'

export const STATE_LABEL: Record<BehaviorState, string> = {
  attentive: 'Attentive',
  taking_notes: 'Taking notes',
  talking_to_someone: 'Talking to someone',
  brief_interruption: 'Brief interruption',
  stepped_away: 'Stepped away',
  drowsy: 'Eyes closing',
  distracted: 'Looking elsewhere',
  using_phone: 'May be on phone',
  no_data: 'No camera data',
}

export const SELF_STATUS_LABEL: Record<SelfStatus, string> = {
  none: '',
  notes: 'Taking notes',
  away: 'Stepped away',
  busy: 'Interrupted',
  fine: 'Says they are fine',
}

/** States that are treated as normal life, not as disengagement. */
export const EXCUSED_STATES: ReadonlySet<BehaviorState> = new Set<BehaviorState>([
  'taking_notes',
  'talking_to_someone',
  'brief_interruption',
])

export interface BehaviorPolicy {
  /** A new state must hold this long before it replaces the current one. */
  enterMs: number
  /** Absence shorter than this is a brief interruption (dropped something, door). */
  briefInterruptionMs: number
  /** Away from the camera for this long before the host is asked to check in. */
  awayAlertMs: number
  /** Head down (notes) without a single glance at the screen for this long. */
  notesNoGlanceAlertMs: number
  /** Talking to someone off-camera for this long. */
  talkingAlertMs: number
  /** Looking elsewhere continuously for this long. */
  distractedAlertMs: number
  /** Phone in hand for this long. */
  phoneAlertMs: number
  /** Eyes closed continuously for this long. */
  drowsyAlertMs: number
  /** No usable camera data for this long (camera off, face unmeasurable). */
  noDataInfoMs: number
  /** Head pitch (degrees, relative to calibration) that counts as "looking down". */
  headDownDeg: number
  /** Head yaw (degrees) that counts as "turned away from the screen". */
  turnedAwayDeg: number
  /** Share of frames with mouth movement that counts as talking. */
  talkRatio: number
  /** Minimum gap between two alerts for the same participant. */
  alertCooldownMs: number
  /** How long a self-declared status silences alerts before a gentle reminder. */
  selfStatusGraceMs: number
}

export const DEFAULT_POLICY: BehaviorPolicy = {
  enterMs: 3_000,
  briefInterruptionMs: 5_000,
  awayAlertMs: 3 * 60_000,
  notesNoGlanceAlertMs: 4 * 60_000,
  talkingAlertMs: 5 * 60_000,
  distractedAlertMs: 2 * 60_000,
  phoneAlertMs: 60_000,
  drowsyAlertMs: 45_000,
  noDataInfoMs: 2 * 60_000,
  headDownDeg: 14,
  turnedAwayDeg: 28,
  talkRatio: 0.25,
  alertCooldownMs: 5 * 60_000,
  selfStatusGraceMs: 10 * 60_000,
}

export type AlertSeverity = 'info' | 'check_in'

export interface Alert {
  id: string
  t: number
  state: BehaviorState
  severity: AlertSeverity
  message: string
}

export interface BehaviorSnapshot {
  state: BehaviorState
  /** Timestamp when the current state began. */
  since: number
  durationMs: number
  /** 0..1 how clear the evidence for this state is. */
  confidence: number
  /** Short human explanation of why this state was chosen. */
  reason: string
  /** True when the state is a normal activity rather than disengagement. */
  excused: boolean
  selfStatus: SelfStatus
  /** Alerts raised on this tick (usually none). */
  alerts: Alert[]
}

/** Per-window evidence extracted from the raw frames. */
export interface Evidence {
  presentRatio: number
  lookingDownRatio: number
  turnedAwayRatio: number
  talkRatio: number
  eyesClosedRatio: number
  multipleFacesRatio: number
  onScreenRatio: number
  phoneRatio: number
  /** Share of present frames with the lower face lit from below (screen glow). */
  glowRatio: number
  /** No face in the most recent second of frames. */
  absentNow: boolean
}

/**
 * MediaPipe's transformation matrix does not document which pitch sign means
 * "down", and the landmark fallback uses the opposite convention. Eyes, from
 * blendshapes, have a known sign (eyeV < 0 = looking down). Head and eyes
 * usually move together, so the correlation between pitch and eyeV tells us
 * which way the head sign goes. Until enough evidence exists we assume
 * positive pitch = down (the landmark convention).
 */
export class PitchSignEstimator {
  private sxy = 0
  private n = 0
  sign = 1

  push(pitch: number, eyeV: number): void {
    if (Math.abs(pitch) < 6 || Math.abs(eyeV) < 0.15) return
    this.sxy += pitch * eyeV
    this.n++
    // Positive correlation means positive pitch = eyes up = head up, so down is negative.
    if (this.n >= 30) this.sign = this.sxy > 0 ? -1 : 1
  }
}

export function extractEvidence(
  frames: FrameMeasurement[],
  cal: Calibration,
  th: Thresholds,
  policy: BehaviorPolicy,
  pitchDownSign: number,
): Evidence {
  const n = frames.length
  const zero: Evidence = {
    presentRatio: 0, lookingDownRatio: 0, turnedAwayRatio: 0, talkRatio: 0,
    eyesClosedRatio: 0, multipleFacesRatio: 0, onScreenRatio: 0, phoneRatio: 0, glowRatio: 0, absentNow: true,
  }
  if (n === 0) return zero

  let present = 0
  let down = 0
  let turned = 0
  let closed = 0
  let multi = 0
  let onScreen = 0
  let reliable = 0
  let phone = 0
  let glow = 0
  // Talking: the jaw opens and closes repeatedly. Count frame-to-frame changes
  // in jaw openness above a small step; chewing or yawning produce few.
  let mouthMoves = 0
  let mouthPairs = 0
  let prevMouth: number | null = null

  for (const f of frames) {
    if (!f.facePresent) {
      prevMouth = null
      continue
    }
    present++
    if (f.faceCount > 1) multi++
    if (f.phoneVisible) phone++
    if (f.glowBelow >= 0.5) glow++
    if (f.quality < th.minQuality) continue
    reliable++
    const g = deriveGaze(f, cal, th)
    if (g.onScreen) onScreen++
    if (f.eyesClosed) closed++
    const pitchDown = (f.pitch - cal.pitch) * pitchDownSign
    const eyesDown = (f.eyeV - cal.eyeV) < -0.25
    if (pitchDown > policy.headDownDeg || (pitchDown > policy.headDownDeg * 0.6 && eyesDown)) down++
    if (Math.abs(f.yaw - cal.yaw) > policy.turnedAwayDeg) turned++
    if (prevMouth !== null) {
      mouthPairs++
      if (Math.abs(f.mouthOpen - prevMouth) > 0.08) mouthMoves++
    }
    prevMouth = f.mouthOpen
  }

  return {
    presentRatio: present / n,
    lookingDownRatio: reliable ? down / reliable : 0,
    turnedAwayRatio: reliable ? turned / reliable : 0,
    talkRatio: mouthPairs ? mouthMoves / mouthPairs : 0,
    eyesClosedRatio: reliable ? closed / reliable : 0,
    multipleFacesRatio: present ? multi / present : 0,
    onScreenRatio: reliable ? onScreen / reliable : 0,
    phoneRatio: present ? phone / present : 0,
    glowRatio: present ? glow / present : 0,
    absentNow: !frames.some((f) => f.facePresent && f.t >= frames[n - 1].t - 1000),
  }
}

interface RawVerdict {
  state: BehaviorState
  confidence: number
  reason: string
}

/** Pure classification of one window. No memory; the tracker adds time. */
export function classify(stats: WindowStats | null, ev: Evidence, policy: BehaviorPolicy): RawVerdict {
  if (!stats || stats.samples === 0) return { state: 'no_data', confidence: 1, reason: 'No frames from the camera' }

  if (ev.absentNow) {
    // Timing (brief vs away) is decided by the tracker.
    return { state: 'stepped_away', confidence: 1, reason: 'No face in view' }
  }
  if (ev.presentRatio < 0.3) {
    // Just came back: the window is still mostly empty. Hold a neutral verdict.
    return { state: 'attentive', confidence: 0.3, reason: 'Back in view' }
  }

  if (stats.insufficient) {
    return { state: 'no_data', confidence: 0.8, reason: stats.reason ?? 'Face cannot be measured' }
  }

  if (ev.eyesClosedRatio > 0.6) {
    return { state: 'drowsy', confidence: ev.eyesClosedRatio, reason: 'Eyes closed most of the window' }
  }

  const talking = ev.talkRatio >= policy.talkRatio
  const facingAway = ev.turnedAwayRatio > 0.4 || ev.multipleFacesRatio > 0.3
  if (talking && facingAway) {
    const why = ev.multipleFacesRatio > 0.3 ? 'Another person in view and mouth moving' : 'Turned away and mouth moving'
    return { state: 'talking_to_someone', confidence: Math.min(1, ev.talkRatio + ev.turnedAwayRatio), reason: why }
  }

  // A phone in hand with the eyes off the lesson is phone use, not note-taking.
  if (ev.phoneRatio > 0.4 && ev.onScreenRatio < 0.45) {
    return { state: 'using_phone', confidence: ev.phoneRatio, reason: 'Phone in hand, eyes off the screen' }
  }
  // Head down and the chin lit from below in an unusual way: a screen below the camera.
  if (ev.glowRatio > 0.6 && ev.lookingDownRatio > 0.5 && ev.onScreenRatio < 0.3) {
    return { state: 'using_phone', confidence: Math.min(1, ev.glowRatio * 0.8), reason: 'Head down, face lit from below like a screen' }
  }

  if (ev.lookingDownRatio > 0.5 && ev.turnedAwayRatio < 0.4) {
    return { state: 'taking_notes', confidence: ev.lookingDownRatio, reason: 'Head down, facing the desk' }
  }

  // Attentive needs real gaze evidence. A still, present head with eyes off to
  // the side can still score well on presence and stability; that is not attention.
  if (ev.onScreenRatio >= 0.45 || ((stats.score ?? 0) >= 55 && ev.onScreenRatio >= 0.2)) {
    return { state: 'attentive', confidence: Math.max(ev.onScreenRatio, (stats.score ?? 0) / 100), reason: 'Gaze on the screen' }
  }

  if (talking) {
    // Talking while facing the screen: answering in the meeting or someone off to the side. Excused.
    return { state: 'talking_to_someone', confidence: ev.talkRatio, reason: 'Mouth moving, gaze off the lesson' }
  }

  if (stats.lookingAwayRatio > 0.6) {
    return { state: 'distracted', confidence: stats.lookingAwayRatio, reason: 'Looking away from the screen' }
  }

  return { state: 'attentive', confidence: 0.5, reason: 'Mostly on the screen' }
}

/**
 * Stateful tracker: applies hysteresis, converts short absences into
 * "brief interruption", remembers the last glance at the screen, honours
 * self-declared status, and decides when an alert is justified.
 */
export class BehaviorTracker {
  private policy: BehaviorPolicy
  private state: BehaviorState = 'no_data'
  private since = 0
  private reason = 'Not started'
  private confidence = 0
  private candidate: BehaviorState | null = null
  private candidateSince = 0
  private lastOnScreenAt = 0
  private lastFaceAt = 0
  private lastAlertAt = -Infinity
  private alertedThisEpisode = false
  private selfStatus: SelfStatus = 'none'
  private selfStatusSince = 0
  private selfReminderSent = false
  private seq = 0
  readonly pitchSign = new PitchSignEstimator()

  constructor(policy: BehaviorPolicy = DEFAULT_POLICY) {
    this.policy = { ...policy }
  }

  setPolicy(p: Partial<BehaviorPolicy>): void {
    this.policy = { ...this.policy, ...p }
  }

  getPolicy(): BehaviorPolicy {
    return this.policy
  }

  reset(t: number): void {
    this.state = 'no_data'
    this.since = t
    this.reason = 'Starting'
    this.confidence = 0
    this.candidate = null
    this.lastOnScreenAt = t
    this.lastFaceAt = t
    this.lastAlertAt = -Infinity
    this.alertedThisEpisode = false
    this.selfReminderSent = false
  }

  setSelfStatus(s: SelfStatus, t: number): void {
    this.selfStatus = s
    this.selfStatusSince = t
    this.selfReminderSent = false
  }

  getSelfStatus(): SelfStatus {
    return this.selfStatus
  }

  update(t: number, frames: FrameMeasurement[], stats: WindowStats | null, cal: Calibration, th: Thresholds): BehaviorSnapshot {
    for (const f of frames.slice(-3)) if (f.facePresent) this.pitchSign.push(f.pitch - cal.pitch, f.eyeV - cal.eyeV)
    const ev = extractEvidence(frames, cal, th, this.policy, this.pitchSign.sign)
    const raw = classify(stats, ev, this.policy)
    if (ev.onScreenRatio > 0.15) this.lastOnScreenAt = t
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i].facePresent) {
        this.lastFaceAt = Math.max(this.lastFaceAt, frames[i].t)
        break
      }
    }

    // Short absences are interruptions, not "away". Promote by elapsed time.
    let target = raw.state
    if (target === 'stepped_away') {
      const absentFor = t - this.lastFaceAt
      target = absentFor >= this.policy.briefInterruptionMs ? 'stepped_away' : 'brief_interruption'
      if (this.state === 'brief_interruption' && target === 'stepped_away') {
        // Same episode, just older: keep `since` so the duration is honest.
        this.state = 'stepped_away'
      }
    }

    if (target !== this.state) {
      if (this.candidate !== target) {
        this.candidate = target
        this.candidateSince = t
      }
      // Absence starts immediately (a missing face is unambiguous); other states wait.
      const needed = target === 'brief_interruption' ? 0 : this.policy.enterMs
      if (t - this.candidateSince >= needed) {
        this.state = target
        // An absence really began when the face was last seen, not when the
        // rolling window finally tipped over.
        this.since = target === 'brief_interruption' ? Math.min(this.candidateSince, this.lastFaceAt) : this.candidateSince
        this.candidate = null
        this.alertedThisEpisode = false
      }
    } else {
      this.candidate = null
    }
    // Only describe the committed state; while a change is pending the old
    // label stays with its old reason, so the card never contradicts itself.
    if (target === this.state) {
      this.reason = raw.reason
      this.confidence = raw.confidence
    }

    const alerts = this.evaluateAlerts(t)
    return {
      state: this.state,
      since: this.since,
      durationMs: t - this.since,
      confidence: this.confidence,
      reason: this.reason,
      excused: EXCUSED_STATES.has(this.state) || this.selfStatus !== 'none',
      selfStatus: this.selfStatus,
      alerts,
    }
  }

  private evaluateAlerts(t: number): Alert[] {
    const p = this.policy
    const dur = t - this.since
    const out: Alert[] = []
    const mins = (ms: number) => `${Math.max(1, Math.round(ms / 60_000))} min`

    // A declared status is trusted. After the grace period send one gentle info.
    if (this.selfStatus !== 'none') {
      if (!this.selfReminderSent && t - this.selfStatusSince >= p.selfStatusGraceMs && this.state !== 'attentive') {
        this.selfReminderSent = true
        out.push(this.alert(t, 'info', `Marked "${SELF_STATUS_LABEL[this.selfStatus]}" ${mins(t - this.selfStatusSince)} ago and still not back`))
      }
      return out
    }

    if (this.alertedThisEpisode || t - this.lastAlertAt < p.alertCooldownMs) return out

    let a: Alert | null = null
    switch (this.state) {
      case 'stepped_away':
        if (dur >= p.awayAlertMs) a = this.alert(t, 'check_in', `Away from the camera for ${mins(dur)}`)
        break
      case 'taking_notes': {
        const noGlance = t - this.lastOnScreenAt
        if (noGlance >= p.notesNoGlanceAlertMs) a = this.alert(t, 'info', `Head down for ${mins(noGlance)} without looking back at the screen`)
        break
      }
      case 'talking_to_someone':
        if (dur >= p.talkingAlertMs) a = this.alert(t, 'info', `Talking to someone off-screen for ${mins(dur)}`)
        break
      case 'distracted':
        if (dur >= p.distractedAlertMs) a = this.alert(t, 'check_in', `Looking away from the lesson for ${mins(dur)}`)
        break
      case 'using_phone':
        if (dur >= p.phoneAlertMs) a = this.alert(t, 'check_in', `Phone in hand for ${mins(dur)}`)
        break
      case 'drowsy':
        if (dur >= p.drowsyAlertMs) a = this.alert(t, 'check_in', `Eyes closed for ${Math.round(dur / 1000)} s`)
        break
      case 'no_data':
        if (dur >= p.noDataInfoMs) a = this.alert(t, 'info', `No usable camera data for ${mins(dur)}`)
        break
      default:
        break
    }
    if (a) {
      this.alertedThisEpisode = true
      this.lastAlertAt = t
      out.push(a)
    }
    return out
  }

  private alert(t: number, severity: AlertSeverity, message: string): Alert {
    return { id: `${Math.round(t)}-${this.seq++}`, t, state: this.state, severity, message }
  }
}
