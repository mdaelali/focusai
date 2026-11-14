import type { Calibration, FrameMeasurement } from '../vision/types'
import { clamp } from '../vision/gaze'

/**
 * Weights for the engagement formula  E = wG*G + wH*H + wP*P + wS*S + wM*M.
 * These are illustrative starting values, not validated constants. They are
 * user-adjustable in the UI and should be calibrated with real testing.
 */
export interface Weights {
  gaze: number
  head: number
  presence: number
  stability: number
  movement: number
}

export const DEFAULT_WEIGHTS: Weights = {
  gaze: 0.3,
  head: 0.25,
  presence: 0.2,
  stability: 0.15,
  movement: 0.1,
}

export interface Thresholds {
  /** Rolling window length in ms. */
  windowMs: number
  /** Minimum usable frames in the window before a score is produced. */
  minSamples: number
  /** Combined head+eye angle (degrees) inside which gaze counts as on-screen. */
  gazeDeg: number
  /** Head yaw / pitch (degrees) inside which the head counts as towards the screen. */
  headYawDeg: number
  headPitchDeg: number
  /** Degrees of eye rotation represented by an eye blendshape value of 1.0. */
  eyeGainDeg: number
  /** Frame quality below this is treated as unreliable. */
  minQuality: number
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  windowMs: 10_000,
  minSamples: 15,
  gazeDeg: 18,
  headYawDeg: 25,
  headPitchDeg: 20,
  eyeGainDeg: 30,
  minQuality: 0.4,
}

export interface Components {
  /** Share of reliable frames with gaze directed at the screen, 0..1 */
  G: number
  /** Share of reliable frames with head oriented towards the screen, 0..1 */
  H: number
  /** Share of frames with a face present, 0..1 */
  P: number
  /** Gaze stability: 1 = steady, 0 = constantly shifting */
  S: number
  /** Head movement calmness: 1 = still, 0 = constantly moving */
  M: number
}

export interface WindowStats {
  /** Frames in the window. */
  samples: number
  /** Frames with a face that passed the quality threshold. */
  reliableSamples: number
  /** True when the window cannot support a score. */
  insufficient: boolean
  reason: string | null
  /** 0..100 or null when insufficient. */
  score: number | null
  components: Components
  presentRatio: number
  lookingAwayRatio: number
  eyesClosedRatio: number
  multipleFacesRatio: number
  lowQualityRatio: number
  /** Mean head angles over reliable frames, calibrated, degrees. */
  meanYaw: number
  meanPitch: number
  /** Mean combined gaze angle (degrees from screen centre). */
  meanGazeAngle: number
}

export interface GazeSample {
  t: number
  /** Combined head+eye angle from the calibrated centre, degrees. */
  gazeAngle: number
  yaw: number
  pitch: number
  onScreen: boolean
  headToward: boolean
}

/** Convert one frame into calibrated gaze geometry. */
export function deriveGaze(m: FrameMeasurement, cal: Calibration, th: Thresholds): GazeSample {
  const yaw = m.yaw - cal.yaw
  const pitch = m.pitch - cal.pitch
  const eyeH = (m.eyeH - cal.eyeH) * th.eyeGainDeg
  const eyeV = (m.eyeV - cal.eyeV) * th.eyeGainDeg
  // Eye rotation adds to head rotation. Sign conventions differ between the
  // matrix and blendshapes, so we combine magnitudes conservatively: a head
  // turned right with eyes turned left (compensating) still reads as on-screen.
  const gH = yaw + eyeH
  const gV = pitch - eyeV
  const gazeAngle = Math.hypot(gH, gV)
  const onScreen = !m.eyesClosed && gazeAngle < th.gazeDeg
  const headToward = Math.abs(yaw) < th.headYawDeg && Math.abs(pitch) < th.headPitchDeg
  return { t: m.t, gazeAngle, yaw, pitch, onScreen, headToward }
}

/**
 * Reduce a rolling window of frames into component indicators and a score.
 * The window is analysed as a whole so one quick glance away never flips the
 * result; only sustained patterns move the indicator.
 */
export function analyseWindow(
  frames: FrameMeasurement[],
  cal: Calibration,
  weights: Weights,
  th: Thresholds,
): WindowStats {
  const n = frames.length
  const empty: Components = { G: 0, H: 0, P: 0, S: 0, M: 0 }
  if (n === 0) {
    return {
      samples: 0, reliableSamples: 0, insufficient: true, reason: 'No frames yet',
      score: null, components: empty, presentRatio: 0, lookingAwayRatio: 0,
      eyesClosedRatio: 0, multipleFacesRatio: 0, lowQualityRatio: 0,
      meanYaw: 0, meanPitch: 0, meanGazeAngle: 0,
    }
  }

  let present = 0
  let multi = 0
  let lowQ = 0
  let closed = 0
  const reliable: GazeSample[] = []

  for (const f of frames) {
    if (!f.facePresent) continue
    present++
    if (f.faceCount > 1) multi++
    if (f.quality < th.minQuality) {
      lowQ++
      continue
    }
    if (f.eyesClosed) closed++
    reliable.push(deriveGaze(f, cal, th))
  }

  const presentRatio = present / n
  const r = reliable.length

  let onScreen = 0
  let headToward = 0
  let sumYaw = 0
  let sumPitch = 0
  let sumGaze = 0
  for (const s of reliable) {
    if (s.onScreen) onScreen++
    if (s.headToward) headToward++
    sumYaw += s.yaw
    sumPitch += s.pitch
    sumGaze += s.gazeAngle
  }

  // Stability: standard deviation of the gaze angle. 0 deg = perfectly steady,
  // 15 deg or more = constantly scanning.
  let S = 0
  if (r > 1) {
    const mean = sumGaze / r
    let v = 0
    for (const s of reliable) v += (s.gazeAngle - mean) ** 2
    const sd = Math.sqrt(v / (r - 1))
    S = clamp(1 - sd / 15, 0, 1)
  }

  // Movement: mean head angular speed between consecutive reliable frames.
  // 0 deg/s = still, 60 deg/s or more = constantly turning.
  let M = 0
  if (r > 1) {
    let total = 0
    let dt = 0
    for (let i = 1; i < r; i++) {
      const a = reliable[i - 1]
      const b = reliable[i]
      const d = (b.t - a.t) / 1000
      if (d <= 0 || d > 1) continue // skip gaps
      total += Math.hypot(b.yaw - a.yaw, b.pitch - a.pitch)
      dt += d
    }
    const speed = dt > 0 ? total / dt : 0
    M = clamp(1 - speed / 60, 0, 1)
  }

  const components: Components = {
    G: r > 0 ? onScreen / r : 0,
    H: r > 0 ? headToward / r : 0,
    P: presentRatio,
    S,
    M,
  }

  // Decide whether we can honestly produce a number.
  let insufficient = false
  let reason: string | null = null
  if (n < th.minSamples) {
    insufficient = true
    reason = 'Collecting frames'
  } else if (present > 0 && r < th.minSamples && presentRatio > 0.5) {
    // Face is there but we cannot measure it well: too small, cut off, or multiple faces.
    insufficient = true
    reason = multi / present > 0.5 ? 'Multiple faces in view' : 'Face too small or partly out of frame'
  }

  let score: number | null = null
  if (!insufficient) {
    const wSum = weights.gaze + weights.head + weights.presence + weights.stability + weights.movement
    if (presentRatio === 0) {
      // Nobody in front of the camera. This is measurable, and it is zero.
      score = 0
    } else if (wSum > 0) {
      // Gaze/head/stability/movement are only known for present frames, so
      // they are scaled by presence to avoid rewarding a brief appearance.
      const p = presentRatio
      const e =
        weights.gaze * components.G * p +
        weights.head * components.H * p +
        weights.presence * components.P +
        weights.stability * components.S * p +
        weights.movement * components.M * p
      score = Math.round(clamp((e / wSum) * 100, 0, 100))
    }
  }

  return {
    samples: n,
    reliableSamples: r,
    insufficient,
    reason,
    score,
    components,
    presentRatio,
    lookingAwayRatio: r > 0 ? 1 - onScreen / r : 0,
    eyesClosedRatio: r > 0 ? closed / r : 0,
    multipleFacesRatio: present > 0 ? multi / present : 0,
    lowQualityRatio: present > 0 ? lowQ / present : 0,
    meanYaw: r > 0 ? sumYaw / r : 0,
    meanPitch: r > 0 ? sumPitch / r : 0,
    meanGazeAngle: r > 0 ? sumGaze / r : 0,
  }
}

/** Build a calibration baseline from frames captured while the user looks at the lesson. */
export function calibrateFrom(frames: FrameMeasurement[]): Calibration | null {
  const good = frames.filter((f) => f.facePresent && f.quality >= 0.4 && !f.eyesClosed)
  if (good.length < 5) return null
  const avg = (k: 'yaw' | 'pitch' | 'eyeH' | 'eyeV') => good.reduce((a, f) => a + f[k], 0) / good.length
  return { yaw: avg('yaw'), pitch: avg('pitch'), eyeH: avg('eyeH'), eyeV: avg('eyeV') }
}
