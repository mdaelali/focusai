import { STATE_LABEL, type BehaviorState } from '../engagement/behavior'

export function stateColor(state: BehaviorState): string {
  switch (state) {
    case 'attentive':
      return 'var(--accent)'
    case 'taking_notes':
    case 'talking_to_someone':
    case 'brief_interruption':
      return 'var(--info)'
    case 'stepped_away':
    case 'distracted':
    case 'using_phone':
    case 'drowsy':
      return 'var(--warn)'
    default:
      return 'var(--muted)'
  }
}

export function StateBadge({ state, label, size = 'md' }: { state: BehaviorState; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const color = stateColor(state)
  const cls = size === 'lg' ? 'px-3 py-1.5 text-base' : size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${cls}`}
      style={{ borderColor: color, color, background: 'color-mix(in srgb, ' + color + ' 12%, transparent)' }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label ?? STATE_LABEL[state]}
    </span>
  )
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
