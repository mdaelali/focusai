import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/** One measurement extracted from a single webcam frame. */
export interface FrameMeasurement {
  /** performance.now() timestamp in ms */
  t: number
  facePresent: boolean
  faceCount: number
  /**
   * 0..1 confidence that this frame's measurements are usable.
   * Lowered by small face size, face near the edge, or multiple faces.
   */
  quality: number
  /** Head rotation in degrees. 0 means facing the camera. */
  yaw: number
  pitch: number
  roll: number
  /** Eye offset relative to head, -1..1. Positive = towards the user's right / up. */
  eyeH: number
  eyeV: number
  /** Both eyes mostly closed in this frame. */
  eyesClosed: boolean
  /** Jaw openness 0..1 from blendshapes. Varies rapidly while speaking. */
  mouthOpen: number
  /** A hand-held phone was detected in the frame (smoothed over ~2 s). */
  phoneVisible: boolean
  /** 0..1: lower face lit from below more than usual (screen glow), see LightingProbe. */
  glowBelow: number
  landmarks: NormalizedLandmark[] | null
}

/** Baseline captured while the user looks at the lesson. */
export interface Calibration {
  yaw: number
  pitch: number
  eyeH: number
  eyeV: number
}

export const DEFAULT_CALIBRATION: Calibration = { yaw: 0, pitch: 0, eyeH: 0, eyeV: 0 }
