import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TimelinePoint } from '../hooks/useSession'

interface Props {
  data: TimelinePoint[]
  title?: string
  height?: number
}

export function Timeline({ data, title = 'Engagement timeline', height = 220 }: Props) {
  const rows = data.map((p) => ({
    sec: p.sec,
    score: p.score,
    gaze: Math.round(p.G * 100),
    head: Math.round(p.H * 100),
    presence: Math.round(p.P * 100),
  }))

  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-sm font-medium">{title}</div>
        <div className="flex gap-3 text-[11px] text-[var(--muted)]">
          <Legend color="var(--accent)" label="Score" />
          <Legend color="var(--info)" label="Gaze %" />
          <Legend color="var(--warn)" label="Head %" />
          <Legend color="#a78bfa" label="Presence %" />
        </div>
      </div>
      {rows.length < 2 ? (
        <div className="flex items-center justify-center text-sm text-[var(--muted)]" style={{ height }}>
          Timeline appears after a few seconds.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={rows} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="sec"
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickFormatter={fmtSec}
              stroke="var(--border)"
            />
            <YAxis domain={[0, 100]} tick={{ fill: 'var(--muted)', fontSize: 11 }} stroke="var(--border)" />
            <Tooltip
              contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={(v) => `t = ${fmtSec(Number(v))}`}
              formatter={(v, name) => [v === null ? 'insufficient data' : String(v), String(name)]}
            />
            <ReferenceLine y={70} stroke="var(--accent)" strokeOpacity={0.25} />
            <ReferenceLine y={40} stroke="var(--warn)" strokeOpacity={0.25} />
            <Line type="monotone" dataKey="presence" name="Presence %" stroke="#a78bfa" dot={false} strokeWidth={1} strokeOpacity={0.6} isAnimationActive={false} />
            <Line type="monotone" dataKey="head" name="Head %" stroke="var(--warn)" dot={false} strokeWidth={1} strokeOpacity={0.6} isAnimationActive={false} />
            <Line type="monotone" dataKey="gaze" name="Gaze %" stroke="var(--info)" dot={false} strokeWidth={1} strokeOpacity={0.6} isAnimationActive={false} />
            <Line type="monotone" dataKey="score" name="Score" stroke="var(--accent)" dot={false} strokeWidth={2.5} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

export function fmtSec(s: number): string {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}
