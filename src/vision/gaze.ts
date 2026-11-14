import type { Category } from '@mediapipe/tasks-vision'

export interface EyeEstimate {
  /** -1..1, positive = user's right */
  eyeH: number
  /** -1..1, positive = up */
  eyeV: number
  eyesClosed: boolean
  /** jawOpen blendshape 0..1 */
  mouthOpen: number
}

/**
 * Approximate eye direction from MediaPipe's 52 face blendshapes.
 * These are relative to the head, so they must be combined with head pose
 * to get an estimate of where the person is looking.
 */
export function eyesFromBlendshapes(categories: Category[]): EyeEstimate {
  const b = new Map<string, number>()
  for (const c of categories) b.set(c.categoryName, c.score)
  const g = (k: string) => b.get(k) ?? 0

  // "In" means towards the nose. For the left eye, "out" is the user's left.
  const leftH = g('eyeLookInLeft') - g('eyeLookOutLeft') // + = user's right
  const rightH = g('eyeLookOutRight') - g('eyeLookInRight') // + = user's right
  const eyeH = clamp((leftH + rightH) / 2, -1, 1)

  const leftV = g('eyeLookUpLeft') - g('eyeLookDownLeft')
  const rightV = g('eyeLookUpRight') - g('eyeLookDownRight')
  const eyeV = clamp((leftV + rightV) / 2, -1, 1)

  const blink = (g('eyeBlinkLeft') + g('eyeBlinkRight')) / 2
  return { eyeH, eyeV, eyesClosed: blink > 0.6, mouthOpen: clamp(g('jawOpen'), 0, 1) }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
