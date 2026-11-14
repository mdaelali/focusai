import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 * Lighting probe: "is the face lit the way it usually is?"
 *
 * A phone or tablet held below the camera lights the chin and lower face
 * from underneath, often with a bluish cast, which is not how a room or a
 * monitor lights a face. We compare the brightness and blue share of a small
 * patch on the chin against a patch on the forehead, and against a slowly
 * learned baseline of the same ratio taken while the head is up.
 *
 * This is supporting evidence only. Daylight or a bright desk lamp washes it
 * out, and it says nothing on its own; the behaviour layer only uses it
 * together with "head down".
 */
export class LightingProbe {
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
  private lastRun = 0
  private baseRatio: number | null = null
  private baseBlue: number | null = null
  /** 0..1 how strongly the lower face is lit from below compared with usual. */
  glowBelow = 0
  /** Diagnostics */
  ratio = 0
  blue = 0

  private readonly W = 96
  private readonly H = 72
  private intervalMs: number

  constructor(intervalMs = 500) {
    this.intervalMs = intervalMs
  }

  private ensure(): boolean {
    if (this.ctx) return true
    try {
      if (typeof OffscreenCanvas !== 'undefined') {
        const c = new OffscreenCanvas(this.W, this.H)
        this.ctx = c.getContext('2d', { willReadFrequently: true })
      } else {
        const c = document.createElement('canvas')
        c.width = this.W
        c.height = this.H
        this.ctx = c.getContext('2d', { willReadFrequently: true })
      }
    } catch {
      this.ctx = null
    }
    return this.ctx !== null
  }

  /**
   * @param headUp true when the head is facing the screen; used to learn the baseline.
   */
  sample(video: HTMLVideoElement, landmarks: NormalizedLandmark[] | null, headUp: boolean, now: number): number {
    if (!landmarks || now - this.lastRun < this.intervalMs || !this.ensure()) return this.glowBelow
    this.lastRun = now
    const ctx = this.ctx!
    try {
      ctx.drawImage(video, 0, 0, this.W, this.H)
      const img = ctx.getImageData(0, 0, this.W, this.H).data
      // Forehead between landmarks 10 (hairline) and 151; chin around 152 / 199.
      const top = this.patch(img, landmarks[151] ?? landmarks[10])
      const bot = this.patch(img, landmarks[199] ?? landmarks[152])
      if (!top || !bot) return this.glowBelow
      const lum = (p: number[]) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
      const ratio = (lum(bot) + 2) / (lum(top) + 2)
      const sum = bot[0] + bot[1] + bot[2] + 1
      const blue = bot[2] / sum
      this.ratio = ratio
      this.blue = blue

      if (headUp) {
        // Learn slowly what "usual" looks like, only while looking at the screen.
        this.baseRatio = this.baseRatio === null ? ratio : this.baseRatio * 0.97 + ratio * 0.03
        this.baseBlue = this.baseBlue === null ? blue : this.baseBlue * 0.97 + blue * 0.03
      }
      if (this.baseRatio === null || this.baseBlue === null) {
        this.glowBelow = 0
        return 0
      }
      // Lower face at least 25% brighter relative to the forehead than usual.
      let g = Math.max(0, Math.min(1, (ratio / this.baseRatio - 1.25) / 0.5))
      // A bluer-than-usual chin is a strong hint of a screen.
      if (blue - this.baseBlue > 0.03) g = Math.min(1, g + 0.35)
      this.glowBelow = g
      return g
    } catch {
      return this.glowBelow
    }
  }

  private patch(img: Uint8ClampedArray, lm: NormalizedLandmark | undefined): number[] | null {
    if (!lm) return null
    const cx = Math.round(lm.x * this.W)
    const cy = Math.round(lm.y * this.H)
    const r = 3
    let n = 0
    const acc = [0, 0, 0]
    for (let y = cy - r; y <= cy + r; y++) {
      if (y < 0 || y >= this.H) continue
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || x >= this.W) continue
        const i = (y * this.W + x) * 4
        acc[0] += img[i]
        acc[1] += img[i + 1]
        acc[2] += img[i + 2]
        n++
      }
    }
    if (n === 0) return null
    return [acc[0] / n, acc[1] / n, acc[2] / n]
  }

  reset(): void {
    this.baseRatio = null
    this.baseBlue = null
    this.glowBelow = 0
  }
}
