import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceTracker } from '../vision/faceTracker'
import { PhoneDetector } from '../vision/phoneDetector'
import { LightingProbe } from '../vision/lighting'
import type { Calibration, FrameMeasurement } from '../vision/types'
import { DEFAULT_CALIBRATION } from '../vision/types'
import {
  analyseWindow,
  calibrateFrom,
  deriveGaze,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  type Thresholds,
  type Weights,
  type WindowStats,
} from '../engagement/engagement'
import { BehaviorTracker, DEFAULT_POLICY, type Alert, type BehaviorPolicy, type BehaviorSnapshot, type SelfStatus } from '../engagement/behavior'

export type SessionStatus = 'idle' | 'loading' | 'running' | 'stopped' | 'error'

export interface TimelinePoint {
  /** Seconds since session start. */
  sec: number
  score: number | null
  G: number
  H: number
  P: number
  S: number
  M: number
  insufficient: boolean
}

export interface SessionSummary {
  durationSec: number
  avgScore: number | null
  minScore: number | null
  presentPct: number
  onScreenPct: number
  headTowardPct: number
  lookingAwayPct: number
  insufficientPct: number
  longestAbsenceSec: number
  timeline: TimelinePoint[]
  calibrated: boolean
}

interface LiveState {
  frame: FrameMeasurement | null
  window: WindowStats | null
  behavior: BehaviorSnapshot | null
  fps: number
  elapsedSec: number
}

const UI_INTERVAL_MS = 200
const TIMELINE_INTERVAL_MS = 1000

export function useSession() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const trackerRef = useRef<FaceTracker | null>(null)
  const phoneRef = useRef<PhoneDetector | null>(null)
  const lightRef = useRef<LightingProbe>(new LightingProbe())
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const framesRef = useRef<FrameMeasurement[]>([])
  const timelineRef = useRef<TimelinePoint[]>([])
  const startRef = useRef<number>(0)
  const lastUiRef = useRef<number>(0)
  const lastTimelineRef = useRef<number>(0)
  const lastVideoTimeRef = useRef<number>(-1)
  const fpsRef = useRef<{ count: number; since: number; value: number }>({ count: 0, since: 0, value: 0 })

  // Session-long counters for the summary (not limited to the rolling window).
  const totalsRef = useRef({ frames: 0, present: 0, reliable: 0, onScreen: 0, headToward: 0 })
  const absenceRef = useRef({ currentStart: 0, longestMs: 0 })

  const weightsRef = useRef<Weights>(DEFAULT_WEIGHTS)
  const thresholdsRef = useRef<Thresholds>(DEFAULT_THRESHOLDS)
  const calibrationRef = useRef<Calibration>(DEFAULT_CALIBRATION)
  const behaviorRef = useRef<BehaviorTracker>(new BehaviorTracker(DEFAULT_POLICY))
  const lastBehaviorRef = useRef(0)

  const [status, setStatus] = useState<SessionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [weights, setWeightsState] = useState<Weights>(DEFAULT_WEIGHTS)
  const [thresholds, setThresholdsState] = useState<Thresholds>(DEFAULT_THRESHOLDS)
  const [calibration, setCalibrationState] = useState<Calibration | null>(null)
  const [live, setLive] = useState<LiveState>({ frame: null, window: null, behavior: null, fps: 0, elapsedSec: 0 })
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [policy, setPolicyState] = useState<BehaviorPolicy>(DEFAULT_POLICY)
  const [selfStatus, setSelfStatusState] = useState<SelfStatus>('none')
  const behaviorSnapRef = useRef<BehaviorSnapshot | null>(null)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [liveTimeline, setLiveTimeline] = useState<TimelinePoint[]>([])

  const setWeights = useCallback((w: Weights) => {
    weightsRef.current = w
    setWeightsState(w)
  }, [])
  const setThresholds = useCallback((t: Thresholds) => {
    thresholdsRef.current = t
    setThresholdsState(t)
  }, [])
  const setPolicy = useCallback((p: Partial<BehaviorPolicy>) => {
    behaviorRef.current.setPolicy(p)
    setPolicyState(behaviorRef.current.getPolicy())
  }, [])
  const setSelfStatus = useCallback((st: SelfStatus) => {
    behaviorRef.current.setSelfStatus(st, performance.now())
    setSelfStatusState(st)
  }, [])

  const loop = useCallback(() => {
    const video = videoRef.current
    const tracker = trackerRef.current
    if (!video || !tracker || !tracker.ready) return

    const now = performance.now()
    // Only analyse when a new video frame is available.
    if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime
      let m: FrameMeasurement
      try {
        m = tracker.measure(video, now)
        m.phoneVisible = phoneRef.current?.sample(video, now) ?? false
        if (m.facePresent) {
          const cal = calibrationRef.current
          const headUp = Math.abs(m.pitch - cal.pitch) < 10 && m.eyeV - cal.eyeV > -0.2
          m.glowBelow = lightRef.current.sample(video, m.landmarks, headUp, now)
        }
      } catch (e) {
        console.error(e)
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      // Rolling window buffer.
      const frames = framesRef.current
      frames.push(m)
      const cutoff = now - thresholdsRef.current.windowMs
      while (frames.length && frames[0].t < cutoff) frames.shift()

      // Session totals.
      const totals = totalsRef.current
      totals.frames++
      if (m.facePresent) {
        totals.present++
        if (absenceRef.current.currentStart) {
          absenceRef.current.longestMs = Math.max(
            absenceRef.current.longestMs,
            now - absenceRef.current.currentStart,
          )
          absenceRef.current.currentStart = 0
        }
      } else if (!absenceRef.current.currentStart) {
        absenceRef.current.currentStart = now
      }

      // FPS.
      const f = fpsRef.current
      f.count++
      if (now - f.since >= 1000) {
        f.value = Math.round((f.count * 1000) / (now - f.since))
        f.count = 0
        f.since = now
      }

      const stats = analyseWindow(frames, calibrationRef.current, weightsRef.current, thresholdsRef.current)

      // Behaviour layer runs once a second; it reasons over minutes, not frames.
      if (now - lastBehaviorRef.current >= 1000) {
        lastBehaviorRef.current = now
        const snap = behaviorRef.current.update(now, frames, stats, calibrationRef.current, thresholdsRef.current)
        behaviorSnapRef.current = snap
        if (snap.alerts.length) setAlerts((prev) => [...snap.alerts, ...prev].slice(0, 50))
      }

      if (m.facePresent && m.quality >= thresholdsRef.current.minQuality) {
        totals.reliable++
        // Re-derive the single-frame verdicts for the session totals.
        const g = deriveGaze(m, calibrationRef.current, thresholdsRef.current)
        if (g.onScreen) totals.onScreen++
        if (g.headToward) totals.headToward++
      }

      if (now - lastTimelineRef.current >= TIMELINE_INTERVAL_MS) {
        lastTimelineRef.current = now
        timelineRef.current.push({
          sec: Math.round((now - startRef.current) / 1000),
          score: stats.score,
          G: stats.components.G,
          H: stats.components.H,
          P: stats.components.P,
          S: stats.components.S,
          M: stats.components.M,
          insufficient: stats.insufficient,
        })
      }

      if (now - lastUiRef.current >= UI_INTERVAL_MS) {
        lastUiRef.current = now
        setLive({
          frame: m,
          window: stats,
          behavior: behaviorSnapRef.current,
          fps: f.value,
          elapsedSec: Math.floor((now - startRef.current) / 1000),
        })
        setLiveTimeline(timelineRef.current.slice())
      }
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setSummary(null)
    setStatus('loading')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not support camera access.')
      }
      const tracker = trackerRef.current ?? new FaceTracker()
      trackerRef.current = tracker
      await tracker.init()
      // The phone detector is optional: if its model fails to load we still run.
      try {
        const pd = phoneRef.current ?? new PhoneDetector()
        await pd.init()
        phoneRef.current = pd
      } catch (e) {
        console.warn('Phone detector unavailable:', e)
        phoneRef.current = null
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Video element not mounted.')
      video.srcObject = stream
      await video.play()

      framesRef.current = []
      timelineRef.current = []
      setLiveTimeline([])
      totalsRef.current = { frames: 0, present: 0, reliable: 0, onScreen: 0, headToward: 0 }
      absenceRef.current = { currentStart: 0, longestMs: 0 }
      fpsRef.current = { count: 0, since: performance.now(), value: 0 }
      startRef.current = performance.now()
      behaviorRef.current.reset(startRef.current)
      lightRef.current.reset()
      behaviorSnapRef.current = null
      lastBehaviorRef.current = 0
      setAlerts([])
      lastUiRef.current = 0
      lastTimelineRef.current = 0
      lastVideoTimeRef.current = -1

      setStatus('running')
      rafRef.current = requestAnimationFrame(loop)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(friendlyCameraError(msg))
      setStatus('error')
      stopStream()
    }
  }, [loop])

  const stopStream = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  const stop = useCallback(() => {
    if (status !== 'running') return
    const now = performance.now()
    stopStream()

    if (absenceRef.current.currentStart) {
      absenceRef.current.longestMs = Math.max(absenceRef.current.longestMs, now - absenceRef.current.currentStart)
    }
    const timeline = timelineRef.current
    const scored = timeline.filter((p) => p.score !== null) as (TimelinePoint & { score: number })[]
    const totals = totalsRef.current
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

    setSummary({
      durationSec: Math.round((now - startRef.current) / 1000),
      avgScore: scored.length ? Math.round(scored.reduce((a, p) => a + p.score, 0) / scored.length) : null,
      minScore: scored.length ? Math.min(...scored.map((p) => p.score)) : null,
      presentPct: pct(totals.present, totals.frames),
      onScreenPct: pct(totals.onScreen, totals.reliable),
      headTowardPct: pct(totals.headToward, totals.reliable),
      lookingAwayPct: totals.reliable > 0 ? 100 - pct(totals.onScreen, totals.reliable) : 0,
      insufficientPct: pct(timeline.filter((p) => p.insufficient).length, timeline.length),
      longestAbsenceSec: Math.round(absenceRef.current.longestMs / 1000),
      timeline,
      calibrated: calibration !== null,
    })
    setStatus('stopped')
  }, [status, calibration])

  /** Use the last second of frames as the "looking at the lesson" baseline. */
  const calibrate = useCallback((): boolean => {
    const now = performance.now()
    const recent = framesRef.current.filter((f) => f.t > now - 1500)
    const cal = calibrateFrom(recent)
    if (!cal) return false
    calibrationRef.current = cal
    setCalibrationState(cal)
    return true
  }, [])

  const resetCalibration = useCallback(() => {
    calibrationRef.current = DEFAULT_CALIBRATION
    setCalibrationState(null)
  }, [])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      trackerRef.current?.close()
      phoneRef.current?.close()
    }
  }, [])

  return {
    videoRef,
    status,
    error,
    live,
    liveTimeline,
    summary,
    weights,
    setWeights,
    thresholds,
    setThresholds,
    calibration,
    calibrate,
    resetCalibration,
    start,
    stop,
    alerts,
    policy,
    setPolicy,
    selfStatus,
    setSelfStatus,
  }
}

function friendlyCameraError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('permission') || m.includes('notallowed') || m.includes('denied')) {
    return 'Camera permission was denied. Allow camera access in the browser address bar and try again.'
  }
  if (m.includes('notfound') || m.includes('requested device not found')) {
    return 'No camera was found on this device.'
  }
  if (m.includes('notreadable') || m.includes('could not start video source')) {
    return 'The camera is in use by another application. Close it and try again.'
  }
  if (m.includes('fetch') || m.includes('wasm') || m.includes('model')) {
    return 'Could not load the face model. Reload the page; the model files are served from this site.'
  }
  return msg
}
