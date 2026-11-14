import type { Matrix, NormalizedLandmark } from '@mediapipe/tasks-vision'

export interface HeadPose {
  yaw: number
  pitch: number
  roll: number
}

const RAD = 180 / Math.PI

/**
 * Decompose MediaPipe's 4x4 facial transformation matrix into Euler angles.
 * MediaPipe does not document the memory layout, so we detect it from where
 * the translation vector sits (it has a large negative Z, the face is some
 * tens of centimetres in front of the camera).
 */
export function poseFromMatrix(m: Matrix): HeadPose | null {
  const d = m.data
  if (!d || d.length !== 16) return null

  // Column-major puts translation at 12,13,14. Row-major puts it at 3,7,11.
  const colMajor = Math.abs(d[14]) > Math.abs(d[11])
  const at = (r: number, c: number) => (colMajor ? d[c * 4 + r] : d[r * 4 + c])

  const r00 = at(0, 0), r10 = at(1, 0), r20 = at(2, 0)
  const r21 = at(2, 1), r22 = at(2, 2)

  const sy = Math.hypot(r00, r10)
  const singular = sy < 1e-6
  const pitch = singular ? Math.atan2(-at(1, 2), at(1, 1)) : Math.atan2(r21, r22)
  const yaw = Math.atan2(-r20, sy)
  const roll = singular ? 0 : Math.atan2(r10, r00)

  return { yaw: yaw * RAD, pitch: pitch * RAD, roll: roll * RAD }
}

/**
 * Geometric fallback when the transformation matrix is unavailable.
 * Uses nose tip position relative to the face outline. Less accurate but
 * sign-consistent, and good enough for "is the head turned a lot".
 */
export function poseFromLandmarks(lm: NormalizedLandmark[]): HeadPose | null {
  if (lm.length < 468) return null
  const nose = lm[1]
  const leftCheek = lm[234]
  const rightCheek = lm[454]
  const forehead = lm[10]
  const chin = lm[152]
  const leftEye = lm[33]
  const rightEye = lm[263]

  const faceW = Math.hypot(rightCheek.x - leftCheek.x, rightCheek.y - leftCheek.y) || 1e-6
  const faceH = Math.hypot(chin.x - forehead.x, chin.y - forehead.y) || 1e-6

  const midX = (leftCheek.x + rightCheek.x) / 2
  const midY = (forehead.y + chin.y) / 2

  // Nose displacement of half the face width is roughly a 60 degree turn.
  const yaw = ((nose.x - midX) / faceW) * 120
  const pitch = ((nose.y - midY) / faceH) * 120
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * RAD

  return { yaw, pitch, roll }
}
