import { DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS, type Thresholds, type Weights } from '../engagement/engagement'

interface Props {
  weights: Weights
  onWeights: (w: Weights) => void
  thresholds: Thresholds
  onThresholds: (t: Thresholds) => void
}

const WEIGHT_ROWS: { key: keyof Weights; label: string; symbol: string }[] = [
  { key: 'gaze', label: 'Screen-directed gaze', symbol: 'G' },
  { key: 'head', label: 'Head orientation', symbol: 'H' },
  { key: 'presence', label: 'Presence', symbol: 'P' },
  { key: 'stability', label: 'Gaze stability', symbol: 'S' },
  { key: 'movement', label: 'Head movement', symbol: 'M' },
]

const THRESHOLD_ROWS: { key: keyof Thresholds; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'windowMs', label: 'Analysis window', min: 3000, max: 30000, step: 1000, unit: 'ms' },
  { key: 'gazeDeg', label: 'On-screen gaze cone', min: 5, max: 45, step: 1, unit: '°' },
  { key: 'headYawDeg', label: 'Head yaw limit', min: 5, max: 60, step: 1, unit: '°' },
  { key: 'headPitchDeg', label: 'Head pitch limit', min: 5, max: 60, step: 1, unit: '°' },
  { key: 'eyeGainDeg', label: 'Eye gain', min: 0, max: 60, step: 1, unit: '°' },
]

export function WeightsPanel({ weights, onWeights, thresholds, onThresholds }: Props) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0)
  return (
    <div className="panel flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium">Formula weights</div>
        <button
          className="text-xs text-[var(--info)] hover:underline"
          onClick={() => {
            onWeights(DEFAULT_WEIGHTS)
            onThresholds(DEFAULT_THRESHOLDS)
          }}
        >
          Reset defaults
        </button>
      </div>
      <code className="rounded-md bg-[var(--panel-2)] px-2 py-1 text-[11px] text-[var(--muted)]">
        E = {weights.gaze.toFixed(2)}·G + {weights.head.toFixed(2)}·H + {weights.presence.toFixed(2)}·P +{' '}
        {weights.stability.toFixed(2)}·S + {weights.movement.toFixed(2)}·M
        {Math.abs(sum - 1) > 0.001 && <span style={{ color: 'var(--warn)' }}> (normalised by {sum.toFixed(2)})</span>}
      </code>
      <div className="flex flex-col gap-2">
        {WEIGHT_ROWS.map((r) => (
          <label key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
            <span>
              <span className="mr-1 font-mono text-[var(--muted)]">{r.symbol}</span>
              {r.label}
            </span>
            <span className="w-10 text-right tabular-nums">{weights[r.key].toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={weights[r.key]}
              onChange={(e) => onWeights({ ...weights, [r.key]: Number(e.target.value) })}
              className="col-span-2 w-full accent-[var(--accent)]"
            />
          </label>
        ))}
      </div>
      <div className="mt-1 text-sm font-medium">Thresholds</div>
      <div className="flex flex-col gap-2">
        {THRESHOLD_ROWS.map((r) => (
          <label key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
            <span>{r.label}</span>
            <span className="w-16 text-right tabular-nums">
              {thresholds[r.key]}
              {r.unit}
            </span>
            <input
              type="range"
              min={r.min}
              max={r.max}
              step={r.step}
              value={thresholds[r.key]}
              onChange={(e) => onThresholds({ ...thresholds, [r.key]: Number(e.target.value) })}
              className="col-span-2 w-full accent-[var(--info)]"
            />
          </label>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--muted)]">
        Starting values are illustrative, not validated. Adjust them during testing with real students and
        lighting conditions, then fix them in code.
      </p>
    </div>
  )
}
