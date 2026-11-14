import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import type { FrameMeasurement } from './types'
import { poseFromLandmarks, poseFromMatrix } from './headPose'
import { eyesFromBlendshapes } from './gaze'

/**
 * Thin wrapper around MediaPipe Face Landmarker.
 * Everything runs locally in the browser. The WASM runtime and model are
 * served from this app's own /public folder, so no frame ever leaves the device.
 */
export class FaceTracker {
  private landmarker: FaceLandmarker | null = null
  private lastTs = -1

  async init(): Promise<void> {
    if (this.landmarker) return
    const fileset = await FilesetResolver.forVisionTasks('/wasm')
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: '/models/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 2, // detect a second face so we can flag "multiple faces"
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
  }

  get ready(): boolean {
    return this.landmarker !== null
  }

  /** Run detection on the current video frame and reduce it to a measurement. */
  measure(video: HTMLVideoElement, now: number): FrameMeasurement {
    if (!this.landmarker) throw new Error('FaceTracker not initialised')

    // MediaPipe requires strictly increasing timestamps.
    const ts = now <= this.lastTs ? this.lastTs + 1 : now
    this.lastTs = ts

    const result: FaceLandmarkerResult = this.landmarker.detectForVideo(video, ts)
    const faceCount = result.faceLandmarks.length

    if (faceCount === 0) {
      return {
        t: now,
        facePresent: false,
        faceCount: 0,
        quality: 0,
        yaw: 0,
        pitch: 0,
        roll: 0,
        eyeH: 0,
        eyeV: 0,
        eyesClosed: false,
        mouthOpen: 0,
        phoneVisible: false,
        glowBelow: 0,
        landmarks: null,
      }
    }

    // Use the largest face as the primary subject.
    let primary = 0
    let bestArea = -1
    for (let i = 0; i < faceCount; i++) {
      const area = bounds(result.faceLandmarks[i]).area
      if (area > bestArea) {
        bestArea = area
        primary = i
      }
    }

    const landmarks = result.faceLandmarks[primary]
    const matrix = result.facialTransformationMatrixes?.[primary]
    const pose =
      (matrix && poseFromMatrix(matrix)) || poseFromLandmarks(landmarks) || { yaw: 0, pitch: 0, roll: 0 }
    const eyes = eyesFromBlendshapes(result.faceBlendshapes?.[primary]?.categories ?? [])

    return {
      t: now,
      facePresent: true,
      faceCount,
      quality: frameQuality(landmarks, faceCount),
      yaw: pose.yaw,
      pitch: pose.pitch,
      roll: pose.roll,
      eyeH: eyes.eyeH,
      eyeV: eyes.eyeV,
      eyesClosed: eyes.eyesClosed,
      mouthOpen: eyes.mouthOpen,
      phoneVisible: false,
      glowBelow: 0,
      landmarks,
    }
  }

  close(): void {
    this.landmarker?.close()
    this.landmarker = null
    this.lastTs = -1
  }
}

function bounds(lm: { x: number; y: number }[]) {
  let minX = 1
  let maxX = 0
  let minY = 1
  let maxY = 0
  for (const p of lm) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, maxX, minY, maxY, area: Math.max(0, maxX - minX) * Math.max(0, maxY - minY) }
}

/**
 * Heuristic reliability score for one frame.
 * - Tiny faces (far from camera) give noisy landmarks.
 * - Faces touching the frame edge are partially cut off.
 * - More than one face means we may be measuring the wrong person.
 */
function frameQuality(lm: { x: number; y: number }[], faceCount: number): number {
  const b = bounds(lm)
  let q = 1
  // Area of ~0.04 (20% x 20% of the frame) is a comfortable laptop distance.
  if (b.area < 0.01) q *= 0.3
  else if (b.area < 0.025) q *= 0.7

  const margin = 0.02
  if (b.minX < margin || b.minY < margin || b.maxX > 1 - margin || b.maxY > 1 - margin) q *= 0.6

  if (faceCount > 1) q *= 0.5
  return q
}
