import { describe, expect, it } from 'vitest'
import { BehaviorTracker, DEFAULT_POLICY, type Alert, type BehaviorSnapshot } from './behavior'
import { analyseWindow, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS } from './engagement'
import { DEFAULT_CALIBRATION, type FrameMeasurement } from '../vision/types'

/*
 * Scenario simulations. Frames are synthesised at 10 fps and fed through the
 * real window analysis and the behaviour tracker, so these tests cover the
 * actual decision path, not a mock of it.
 */

type Pose = Partial<Omit<FrameMeasurement, 't'>> | null

function frame(t: number, p: Pose): FrameMeasurement {
  if (p === null) {
    return { t, facePresent: false, faceCount: 0, quality: 0, yaw: 0, pitch: 0, roll: 0, eyeH: 0, eyeV: 0, eyesClosed: false, mouthOpen: 0, landmarks: null }
  }
  return { t, facePresent: true, faceCount: 1, quality: 1, yaw: 0, pitch: 0, roll: 0, eyeH: 0, eyeV: 0, eyesClosed: false, mouthOpen: 0, landmarks: null, ...p }
}

const SEC = 1000
const MIN = 60 * SEC

interface RunResult {
  last: BehaviorSnapshot
  alerts: Alert[]
  states: { t: number; state: BehaviorSnapshot['state'] }[]
}

/** Drive the tracker from t=0 to `until` with a per-time pose function. */
function run(poseAt: (t: number) => Pose, until: number, tracker = new BehaviorTracker(), onTick?: (t: number, tr: BehaviorTracker) => void): RunResult {
  const frames: FrameMeasurement[] = []
  const alerts: Alert[] = []
  const states: RunResult['states'] = []
  let last!: BehaviorSnapshot
  tracker.reset(0)
  for (let t = 0; t <= until; t += 100) {
    frames.push(frame(t, poseAt(t)))
    while (frames.length && frames[0].t < t - DEFAULT_THRESHOLDS.windowMs) frames.shift()
    if (t % SEC !== 0) continue
    onTick?.(t, tracker)
    const stats = analyseWindow(frames, DEFAULT_CALIBRATION, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS)
    last = tracker.update(t, frames, stats, DEFAULT_CALIBRATION, DEFAULT_THRESHOLDS)
    alerts.push(...last.alerts)
    if (!states.length || states[states.length - 1].state !== last.state) states.push({ t, state: last.state })
  }
  return { last, alerts, states }
}

const attentive: Pose = {}
const headDown: Pose = { pitch: 26, eyeV: -0.4 }
const turnedAndTalking = (t: number): Pose => ({ yaw: 48, mouthOpen: Math.round(t / 150) % 2 ? 0.35 : 0.05 })
const lookingSideways: Pose = { yaw: 22, eyeH: 0.5 }

describe('attentive student', () => {
  it('is attentive and never alerted over a 10 minute lesson', () => {
    const r = run(() => attentive, 10 * MIN)
    expect(r.last.state).toBe('attentive')
    expect(r.alerts).toHaveLength(0)
  })
})

describe('dropped something and leaned down', () => {
  it('is a brief interruption, excused, and returns to attentive without an alert', () => {
    const r = run((t) => (t > 60 * SEC && t < 72 * SEC ? null : attentive), 3 * MIN)
    const seen = r.states.map((s) => s.state)
    expect(seen).toContain('brief_interruption')
    expect(seen).not.toContain('stepped_away')
    expect(r.last.state).toBe('attentive')
    expect(r.alerts).toHaveLength(0)
  })
})

describe('taking notes', () => {
  it('is recognised as notes and excused while the student glances back now and then', () => {
    // Head down, but one two-second glance at the screen every 60 s.
    const r = run((t) => (t % MIN < 2 * SEC ? attentive : headDown), 8 * MIN)
    expect(r.last.state).toBe('taking_notes')
    expect(r.last.excused).toBe(true)
    expect(r.alerts).toHaveLength(0)
  })

  it('raises one gentle info only after minutes with no glance at the screen', () => {
    const r = run((t) => (t < 30 * SEC ? attentive : headDown), 9 * MIN)
    expect(r.last.state).toBe('taking_notes')
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0].severity).toBe('info')
    expect(r.alerts[0].t).toBeGreaterThanOrEqual(30 * SEC + DEFAULT_POLICY.notesNoGlanceAlertMs)
  })
})

describe('someone called them (parent, partner, colleague)', () => {
  it('turned away and talking is "talking to someone", excused, no alert within 4 minutes', () => {
    const r = run((t) => (t < 20 * SEC ? attentive : turnedAndTalking(t)), 4 * MIN)
    expect(r.last.state).toBe('talking_to_someone')
    expect(r.last.excused).toBe(true)
    expect(r.alerts).toHaveLength(0)
  })

  it('a second person in view while talking is also "talking to someone"', () => {
    const r = run((t) => (t < 20 * SEC ? attentive : { faceCount: 2, mouthOpen: Math.round(t / 150) % 2 ? 0.35 : 0.05 }), 2 * MIN)
    expect(r.last.state).toBe('talking_to_someone')
  })
})

describe('stepped away', () => {
  it('becomes "stepped away" after the brief window and alerts once after the away threshold', () => {
    const r = run((t) => (t < 30 * SEC ? attentive : null), 10 * MIN)
    expect(r.states.map((s) => s.state)).toEqual(['no_data', 'attentive', 'brief_interruption', 'stepped_away'])
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0].severity).toBe('check_in')
    const awayStart = 30 * SEC
    expect(r.alerts[0].t).toBeGreaterThanOrEqual(awayStart + DEFAULT_POLICY.awayAlertMs)
    expect(r.alerts[0].t).toBeLessThan(awayStart + DEFAULT_POLICY.awayAlertMs + 15 * SEC)
  })

  it('a self-declared "away" silences the alert and sends one reminder after the grace period', () => {
    const r = run(
      (t) => (t < 30 * SEC ? attentive : null),
      14 * MIN,
      new BehaviorTracker(),
      (t, tr) => { if (t === 25 * SEC) tr.setSelfStatus('away', t) },
    )
    expect(r.last.state).toBe('stepped_away')
    expect(r.last.excused).toBe(true)
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0].severity).toBe('info')
    expect(r.alerts[0].message).toMatch(/Stepped away/)
    expect(r.alerts[0].t).toBeGreaterThanOrEqual(25 * SEC + DEFAULT_POLICY.selfStatusGraceMs)
  })
})

describe('genuinely looking elsewhere', () => {
  it('is "looking elsewhere" and asks for a check-in after the distracted threshold', () => {
    const r = run((t) => (t < 20 * SEC ? attentive : lookingSideways), 5 * MIN)
    expect(r.last.state).toBe('distracted')
    expect(r.last.excused).toBe(false)
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0].severity).toBe('check_in')
    expect(r.alerts[0].t).toBeGreaterThanOrEqual(20 * SEC + DEFAULT_POLICY.distractedAlertMs)
  })

  it('a few seconds of glancing sideways does not change the state (hysteresis)', () => {
    const r = run((t) => (t > 60 * SEC && t < 62 * SEC ? lookingSideways : attentive), 2 * MIN)
    expect(r.states.map((s) => s.state)).toEqual(['no_data', 'attentive'])
  })
})

describe('eyes closed', () => {
  it('asks for a check-in after sustained closed eyes', () => {
    const r = run((t) => (t < 20 * SEC ? attentive : { eyesClosed: true }), 2 * MIN)
    expect(r.last.state).toBe('drowsy')
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0].severity).toBe('check_in')
  })
})
