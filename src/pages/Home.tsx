import { useState } from 'react'
import { normaliseRoomCode } from '../room/protocol'
import { transportAvailable } from '../room/transport'
import { StateBadge } from '../components/StateBadge'
import {
  loadPresets,
  newPreset,
  removePreset,
  SENSITIVITY_HINT,
  SENSITIVITY_LABEL,
  SUBJECT_SUGGESTIONS,
  upsertPreset,
  type LessonPreset,
  type Sensitivity,
} from '../lessons/presets'

export default function Home() {
  const transport = transportAvailable()
  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-12 px-5 py-6 md:py-10">
      <nav className="flex items-center justify-between gap-3">
        <a href="#/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">
            Focus<span style={{ color: 'var(--accent)' }}>AI</span>
          </span>
        </a>
        <div className="flex items-center gap-1 text-sm text-[var(--muted)]">
          <a href="#how" className="rounded-lg px-3 py-2 hover:text-[var(--text)]">
            How it works
          </a>
          <a href="#/lab" className="hidden rounded-lg px-3 py-2 hover:text-[var(--text)] sm:block">
            Solo lab
          </a>
          <a href="https://github.com/mdaelali/focusai" target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 hover:text-[var(--text)]">
            GitHub
          </a>
        </div>
      </nav>

      <header className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col gap-6">
          <span className="eyebrow">For online lessons on Zoom, Meet and Teams</span>
          <h1 className="hero-title">
            Know your class is with you.
            <br />
            <span className="gradient-text">Without watching anyone.</span>
          </h1>
          <p className="lead max-w-xl">
            Students open FocusAI beside the meeting, on a laptop or a phone. Their camera is read on their own device
            and you only ever see a word: <em className="text-[var(--text)]">attentive</em>, <em className="text-[var(--text)]">taking notes</em>,{' '}
            <em className="text-[var(--text)]">stepped away</em>.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="chip">
              <Check /> Video never leaves the device
            </span>
            <span className="chip">
              <Check /> Works on laptops, tablets and phones
            </span>
            <span className="chip">
              <Check /> Free and open source
            </span>
          </div>
        </div>
        <LivePreview />
      </header>

      <main className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="order-2 lg:order-1">
          <TeacherPanel />
        </div>
        <div className="order-1 lg:order-2">
          <StudentPanel />
        </div>
      </main>

      <section id="how" className="flex flex-col gap-5 scroll-mt-6">
        <div>
          <span className="eyebrow">How it works</span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Built to be ignored until it matters</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Fact n="01" title="Normal life never flags" text="Writing notes, picking something up, or turning to someone who walked in show in blue and never alert you." />
          <Fact n="02" title="You hear about it live" text="A card turns amber, a toast and a tone fire, and a system notification reaches you over Zoom or Meet, even on a phone." />
          <Fact n="03" title="Nothing to grade" text="Labels describe where a head and eyes pointed. They say nothing about understanding, and the report says so." />
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-6 text-xs text-[var(--muted)]">
        <span>
          Made by{' '}
          <a href="https://alihasanli.com" target="_blank" rel="noreferrer" className="text-[var(--text)] hover:underline">
            Ali Hasanli
          </a>{' '}
          · MIT licence
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="live-dot" style={{ background: transport === 'supabase' ? 'var(--accent)' : 'var(--warn)' }} />
          {transport === 'supabase' ? 'Rooms work across devices' : 'Demo mode: rooms only reach tabs in this browser'}
        </span>
      </footer>
    </div>
  )
}

function Logo() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-xl text-black" style={{ background: 'linear-gradient(135deg, var(--accent-2), var(--accent))' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      </svg>
    </span>
  )
}

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/** A still of the host view, so a visitor sees the product before reading about it. */
function LivePreview() {
  const rows = [
    { name: 'Aylin', state: 'attentive', score: 88, since: '14m' },
    { name: 'Murad', state: 'taking_notes', score: 74, since: '40s' },
    { name: 'Chloe', state: 'stepped_away', score: null, since: '2m 10s' },
    { name: 'Daniel', state: 'talking_to_someone', score: 61, since: '12s' },
  ] as const
  return (
    <div className="panel panel-glow flex flex-col gap-4 p-5" aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-[var(--muted)]">Calculus · 12 students</div>
          <div className="text-base font-semibold">Live class view</div>
        </div>
        <span className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="live-dot" /> live
        </span>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-[11px] text-[var(--muted)]">
          <span>Attention right now</span>
          <span className="tabular-nums">9 attentive · 2 normal · 1 away</span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--panel-2)]">
          <div style={{ width: '75%', background: 'var(--accent)' }} />
          <div style={{ width: '17%', background: 'var(--info)' }} />
          <div style={{ width: '8%', background: 'var(--warn)' }} />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5" style={r.state === 'stepped_away' ? { borderColor: 'var(--warn)' } : undefined}>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{r.name}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <StateBadge state={r.state} size="sm" />
                <span className="text-[11px] tabular-nums text-[var(--muted)]">{r.since}</span>
              </div>
            </div>
            <span className="text-lg font-semibold tabular-nums" style={{ color: r.score === null ? 'var(--muted)' : 'var(--accent)' }}>
              {r.score ?? '—'}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--warn)' }} />
        <span className="font-medium">Chloe</span>
        <span className="text-[var(--muted)]">stepped away 2 min ago · consider checking in</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ teacher */

function TeacherPanel() {
  const [presets, setPresets] = useState<LessonPreset[]>(() => loadPresets().sort((a, b) => b.lastUsedAt - a.lastUsedAt))
  const [editing, setEditing] = useState<LessonPreset | null>(() => (loadPresets().length === 0 ? newPreset() : null))

  const start = async (p: LessonPreset) => {
    // Ask for desktop notifications on this click: browsers only allow the
    // prompt from a user gesture, and the teacher will be in a meeting later.
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission()
    } catch {
      /* ignore */
    }
    location.hash = `#/host/${p.roomCode}?preset=${p.id}`
  }
  const save = (p: LessonPreset) => {
    setPresets(upsertPreset(p).sort((a, b) => b.lastUsedAt - a.lastUsedAt))
    setEditing(null)
  }
  const remove = (id: string) => {
    setPresets(removePreset(id))
    if (editing?.id === id) setEditing(null)
  }

  return (
    <section className="panel flex h-full flex-col gap-5 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="eyebrow">I teach</span>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Your lessons</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Set a lesson up once. Its join link stays the same every time, and its alert rules reach every student automatically.
          </p>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(newPreset())} className="btn-ghost">
            + New lesson
          </button>
        )}
      </div>

      {presets.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {presets.map((p) => (
            <li key={p.id} className="lesson-card flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{p.name || 'Untitled lesson'}</div>
                  <div className="mt-0.5 text-xs text-[var(--muted)]">
                    {[p.subject, `${p.durationMin} min`, `${SENSITIVITY_LABEL[p.sensitivity].toLowerCase()} alerts`, p.breakEveryMin ? `break every ${p.breakEveryMin} min` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <span className="shrink-0 rounded-md border border-[var(--border)] px-1.5 py-0.5 font-mono text-[11px] tracking-widest text-[var(--muted)]" title="Permanent room code">
                  {p.roomCode}
                </span>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <button type="button" onClick={() => void start(p)} className="btn-primary">
                  Start lesson
                </button>
                <button type="button" onClick={() => setEditing({ ...p })} className="btn-ghost">
                  Edit
                </button>
                <button type="button" onClick={() => remove(p.id)} className="ml-auto cursor-pointer px-2 py-2 text-xs text-[var(--muted)] hover:text-[var(--bad)]">
                  Delete
                </button>
              </div>
              {p.uses > 0 && <div className="text-[11px] text-[var(--muted)]">Used {p.uses} time{p.uses === 1 ? '' : 's'}</div>}
            </li>
          ))}
        </ul>
      )}

      {editing && <LessonForm preset={editing} onSave={save} onCancel={presets.length ? () => setEditing(null) : undefined} />}
    </section>
  )
}

function LessonForm({ preset, onSave, onCancel }: { preset: LessonPreset; onSave: (p: LessonPreset) => void; onCancel?: () => void }) {
  const [p, setP] = useState<LessonPreset>(preset)
  const set = <K extends keyof LessonPreset>(k: K, v: LessonPreset[K]) => setP((x) => ({ ...x, [k]: v }))
  const valid = p.name.trim().length > 0 && p.durationMin >= 5 && p.durationMin <= 480

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSave({ ...p, name: p.name.trim(), subject: p.subject.trim() })
      }}
      className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] p-4"
    >
      <div className="text-sm font-medium">{preset.name ? 'Edit lesson' : 'Set up a lesson'}</div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lesson name" hint="What students will see">
          <input value={p.name} onChange={(e) => set('name', e.target.value)} placeholder="TMUA Tuesday group" className="input" autoFocus />
        </Field>
        <Field label="Subject">
          <input value={p.subject} onChange={(e) => set('subject', e.target.value)} list="focusai-subjects" placeholder="TMUA, Calculus…" className="input" />
          <datalist id="focusai-subjects">
            {SUBJECT_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Duration (minutes)">
          <input type="number" inputMode="numeric" min={5} max={480} step={5} value={p.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))} className="input" />
        </Field>
        <Field label="Break reminder" hint="0 = off" group>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted)]">every</span>
            <input type="number" inputMode="numeric" min={0} max={240} step={5} value={p.breakEveryMin} onChange={(e) => set('breakEveryMin', Number(e.target.value))} className="input w-24" />
            <span className="text-xs text-[var(--muted)]">min</span>
          </div>
        </Field>
      </div>

      <Field label="Alert sensitivity" group>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(SENSITIVITY_LABEL) as Sensitivity[]).map((s) => {
            const active = p.sensitivity === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => set('sensitivity', s)}
                aria-pressed={active}
                className="flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-left transition"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  background: active ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                }}
              >
                <span className="text-sm font-medium">{SENSITIVITY_LABEL[s]}</span>
                <span className="text-[11px] leading-snug text-[var(--muted)]">{SENSITIVITY_HINT[s]}</span>
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Notes for yourself" hint="Shown on your host screen">
        <textarea value={p.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Start with last week's homework. Poll at 20 min." className="input resize-y" />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!valid} className="btn-primary">
          Save lesson
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
        )}
        <span className="ml-auto font-mono text-[11px] tracking-widest text-[var(--muted)]" title="Permanent room code for this lesson">
          Room {p.roomCode}
        </span>
      </div>
    </form>
  )
}

function Field({ label, hint, group, children }: { label: string; hint?: string; group?: boolean; children: React.ReactNode }) {
  const Tag = group ? 'div' : 'label'
  return (
    <Tag className="flex flex-col gap-1.5" role={group ? 'group' : undefined} aria-label={group ? label : undefined}>
      <span className="text-xs font-medium text-[var(--muted)]">
        {label}
        {hint && <span className="ml-1.5 font-normal opacity-70">· {hint}</span>}
      </span>
      {children}
    </Tag>
  )
}

/* ------------------------------------------------------------------ student */

function StudentPanel() {
  const [code, setCode] = useState('')
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('focusai.name') ?? ''
    } catch {
      return ''
    }
  })
  const join = (e: React.FormEvent) => {
    e.preventDefault()
    const c = normaliseRoomCode(code)
    if (c.length < 4 || !name.trim()) return
    try {
      localStorage.setItem('focusai.name', name.trim())
    } catch {
      /* ignore */
    }
    location.hash = `#/join/${c}?name=${encodeURIComponent(name.trim())}`
  }

  return (
    <section className="panel flex h-full flex-col gap-5 p-5 md:p-6">
      <div>
        <span className="eyebrow">I'm a student</span>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">Join a lesson</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Enter the code your teacher shared, or scan the QR code on their screen. You will see exactly what is sent.
        </p>
      </div>
      <form onSubmit={join} className="flex flex-col gap-3">
        <Field label="Your name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alice" autoComplete="given-name" className="input" />
        </Field>
        <Field label="Room code">
          <input
            value={code}
            onChange={(e) => setCode(normaliseRoomCode(e.target.value))}
            placeholder="ABC123"
            className="input font-mono uppercase tracking-[0.3em]"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        <button type="submit" disabled={normaliseRoomCode(code).length < 4 || !name.trim()} className="btn-primary w-full sm:w-auto sm:self-start">
          Join
        </button>
      </form>
      <ul className="mt-auto flex flex-col gap-2 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
        <li className="flex gap-2">
          <Check /> Your video stays on this device. The teacher never sees it.
        </li>
        <li className="flex gap-2">
          <Check /> Only a status word and a number are shared, every couple of seconds.
        </li>
        <li className="flex gap-2">
          <Check /> Works on a phone too: prop it up facing you and keep the screen on.
        </li>
      </ul>
    </section>
  )
}

function Fact({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="panel flex flex-col gap-2 p-5">
      <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
        {n}
      </span>
      <div className="text-base font-semibold">{title}</div>
      <div className="text-sm leading-relaxed text-[var(--muted)]">{text}</div>
    </div>
  )
}
