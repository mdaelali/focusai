import { useEffect, useRef, type RefObject } from 'react'
import type { FrameMeasurement } from '../vision/types'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  frame: FrameMeasurement | null
  showLandmarks: boolean
  active: boolean
}

// Iris landmark indices in the 478-point MediaPipe mesh.
const LEFT_IRIS = [468, 469, 470, 471, 472]
const RIGHT_IRIS = [473, 474, 475, 476, 477]
const KEY_POINTS = [1, 10, 152, 234, 454, 33, 263, 61, 291]

export function WebcamView({ videoRef, frame, showLandmarks, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = video.videoWidth || 640
    const h = video.videoHeight || 480
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    ctx.clearRect(0, 0, w, h)

    if (!showLandmarks || !frame?.landmarks) return
    const lm = frame.landmarks

    ctx.fillStyle = 'rgba(74, 222, 128, 0.55)'
    for (let i = 0; i < lm.length; i += 2) {
      const p = lm[i]
      ctx.fillRect(p.x * w - 0.75, p.y * h - 0.75, 1.5, 1.5)
    }

    ctx.strokeStyle = '#60a5fa'
    ctx.lineWidth = 2
    for (const ring of [LEFT_IRIS, RIGHT_IRIS]) {
      if (lm.length <= ring[ring.length - 1]) continue
      const c = lm[ring[0]]
      const edge = lm[ring[1]]
      const r = Math.hypot((edge.x - c.x) * w, (edge.y - c.y) * h)
      ctx.beginPath()
      ctx.arc(c.x * w, c.y * h, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.fillStyle = '#fbbf24'
    for (const i of KEY_POINTS) {
      const p = lm[i]
      if (!p) continue
      ctx.beginPath()
      ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // Head direction arrow from the nose tip, scaled by yaw/pitch.
    const nose = lm[1]
    const len = 80
    const dx = Math.sin((frame.yaw * Math.PI) / 180) * len
    const dy = -Math.sin((frame.pitch * Math.PI) / 180) * len
    ctx.strokeStyle = '#f87171'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(nose.x * w, nose.y * h)
    ctx.lineTo(nose.x * w - dx, nose.y * h + dy)
    ctx.stroke()
  }, [frame, showLandmarks, videoRef])

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black">
      <video ref={videoRef} playsInline muted className="mirror absolute inset-0 h-full w-full object-cover" />
      <canvas ref={canvasRef} className="mirror absolute inset-0 h-full w-full object-cover" />
      {!active && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--muted)]">
          Camera is off. Nothing is being recorded.
        </div>
      )}
      {active && frame && (
        <div className="absolute left-3 top-3 flex gap-2 text-xs">
          <Badge tone={frame.facePresent ? 'ok' : 'bad'}>
            {frame.facePresent ? 'Face detected' : 'No face'}
          </Badge>
          {frame.faceCount > 1 && <Badge tone="warn">{frame.faceCount} faces</Badge>}
          {frame.facePresent && frame.quality < 0.4 && <Badge tone="warn">Low quality</Badge>}
        </div>
      )}
    </div>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? 'var(--accent)' : tone === 'warn' ? 'var(--warn)' : 'var(--bad)'
  return (
    <span
      className="rounded-md px-2 py-1 font-medium"
      style={{ background: 'rgba(0,0,0,0.6)', color, border: `1px solid ${color}` }}
    >
      {children}
    </span>
  )
}
