import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ClassSample, RosterEntry } from '../room/useRoomHost'
import { bucketOf } from '../room/useRoomHost'

interface Props {
  participants: RosterEntry[]
  timeline: ClassSample[]
}

/**
 * The teacher's first glance: how is the class doing right now, how has it
 * gone over the lesson, and is this a moment to change pace.
 */
export function ClassOverview({ participants, timeline }: Props) {
  const counts = { attentive: 0, excused: 0, warn: 0, noData: 0 }
  const present = participants.filter((p) => !p.left)
  const leftCount = participants.length - present.length
  for (const p of present) counts[bucketOf(p)]++
  const total = present.length
  const withData = total - counts.noData
  const okPct = withData > 0 ? Math.round(((counts.attentive + counts.excused) / withData) * 100) : null

  // Pace suggestion: the share of the class in an amber state has been high for
  // the last 2 minutes (12 samples at 10 s). Normal activities never count.
  const recent = timeline.slice(-12)
  const sag = recent.length >= 6 && recent.every((s) => s.total - s.noData >= 2 && s.okPct !== null && s.okPct < 60)

  const seg = (n: number, color: string, label: string) =>
    n > 0 ? (
      <div
        key={label}
        className="flex h-full items-center justify-center overflow-hidden text-[11px] font-medium text-black/80"
        style={{ width: `${(n / total) * 100}%`, background: color, transition: 'width 400ms ease' }}
        title={`${n} ${label}`}
      >
        {n}
      </div>
    ) : null

  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Class right now</div>
        <div className="text-sm">
          {okPct === null ? (
            <span className="text-[var(--muted)]">No camera data yet</span>
          ) : (
            <>
              <span className="text-2xl font-semibold tabular-nums" style={{ color: okPct >= 80 ? 'var(--accent)' : okPct >= 60 ? 'var(--warn)' : 'var(--bad)' }}>
                {okPct}%
              </span>
              <span className="ml-1.5 text-xs text-[var(--muted)]">with you or busy with a normal activity</span>
            </>
          )}
        </div>
      </div>

      {total > 0 && (
        <div className="flex h-6 w-full overflow-hidden rounded-md bg-[var(--panel-2)]">
          {seg(counts.attentive, 'var(--accent)', 'attentive')}
          {seg(counts.excused, 'var(--info)', 'normal activity')}
          {seg(counts.warn, 'var(--warn)', 'need attention')}
          {seg(counts.noData, 'var(--border)', 'no data')}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
        <Legend color="var(--accent)" text={`${counts.attentive} attentive`} />
        <Legend color="var(--info)" text={`${counts.excused} notes / talking / brief`} />
        <Legend color="var(--warn)" text={`${counts.warn} away / elsewhere / phone`} />
        <Legend color="var(--border)" text={`${counts.noData} no data`} />
        {leftCount > 0 && <span>· {leftCount} left</span>}
      </div>

      {sag && (
        <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>
          <div className="font-medium">Attention has sagged for a couple of minutes</div>
          <div className="text-xs text-[var(--muted)]">
            Good moments for: a quick question to the group, a one-minute poll, asking someone to summarise, a short break,
            or switching from slides to an example.
          </div>
        </div>
      )}

      {timeline.length >= 2 && (
        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="min" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} unit="m" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`${v ?? '—'}%`, 'with you or busy']}
                labelFormatter={(l) => `${l} min`}
              />
              <Area type="monotone" dataKey="okPct" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      {text}
    </span>
  )
}
