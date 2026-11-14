import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision'

/**
 * Detects a hand-held phone in the webcam frame with MediaPipe's EfficientDet
 * Lite0 object detector (COCO classes, we only keep "cell phone").
 *
 * Runs locally like everything else. It is slower than the face model, so it
 * is sampled a few times per second rather than on every frame. The result is
 * a smoothed "phone visible" flag; a single frame never decides anything.
 */
export class PhoneDetector {
  private detector: ObjectDetector | null = null
  private lastTs = -1
  private lastRun = 0
  private hits: boolean[] = []
  /** Smoothed verdict: a phone was seen in most recent samples. */
  visible = false
  /** Best score from the last run, for diagnostics. */
  lastScore = 0

  private intervalMs: number

  constructor(intervalMs = 400) {
    this.intervalMs = intervalMs
  }

  async init(): Promise<void> {
    if (this.detector) return
    const fileset = await FilesetResolver.forVisionTasks('/wasm')
    this.detector = await ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/models/efficientdet_lite0.tflite', delegate: 'GPU' },
      runningMode: 'VIDEO',
      categoryAllowlist: ['cell phone'],
      scoreThreshold: 0.35,
      maxResults: 2,
    })
  }

  get ready(): boolean {
    return this.detector !== null
  }

  /** Call every frame; it only does work every `intervalMs`. Returns the smoothed flag. */
  sample(video: HTMLVideoElement, now: number): boolean {
    if (!this.detector || now - this.lastRun < this.intervalMs) return this.visible
    this.lastRun = now
    const ts = now <= this.lastTs ? this.lastTs + 1 : now
    this.lastTs = ts
    let seen = false
    try {
      const res = this.detector.detectForVideo(video, ts)
      let best = 0
      for (const d of res.detections) for (const c of d.categories) if (c.score > best) best = c.score
      this.lastScore = best
      seen = best > 0
    } catch {
      seen = false
    }
    this.hits.push(seen)
    if (this.hits.length > 5) this.hits.shift()
    // Visible when at least 3 of the last 5 samples (about 2 s) saw a phone.
    this.visible = this.hits.filter(Boolean).length >= 3
    return this.visible
  }

  close(): void {
    this.detector?.close()
    this.detector = null
    this.hits = []
    this.visible = false
  }
}
