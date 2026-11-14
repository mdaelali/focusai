import { useState } from 'react'
import { normaliseRoomCode } from '../room/protocol'
import { transportAvailable } from '../room/transport'
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
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl text-black" style={{ background: 'var(--accent)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
            </svg>
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            Focus<span style={{ color: 'var(--accent)' }}>AI</span>
          </h1>
        </div>
        <p className="max-w-2xl text-base leading-relaxed text-[var(--muted)]">
          Know how your class is doing in an online lesson, without watching anyone. Each student's camera is read on
          their own laptop and you only see a word: <em>attentive</em>, <em>taking notes</em>, <em>stepped away</em>.
        </p>
      </header>

      <main className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TeacherPanel />
        <StudentPanel />
      </main>

      <section className="grid gap-4 sm:grid-cols-3">
        <Fact title="Normal life never flags" text="Writing notes, picking something up, or turning to someone who walked in show in blue and never alert you." />
        <Fact title="You hear about it live" text="A card turns amber, a toast and a tone fire, and a desktop notification reaches you behind the meeting window." />
        <Fact title="Nothing to grade" text="Labels describe where a head and eyes pointed. They say nothing about understanding, and the report says so." />
      </section>

      <footer className="flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
        <a href="#/lab" className="hover:underline">
          Solo lab: see the raw measurements
        </a>
        <span>{transport === 'supabase' ? 'Rooms work across devices' : 'Demo mode: rooms only reach tabs in this browser'}</span>
      </footer>
    </div>
  )
}

/* ------------------------------------------------------------------ teacher */

function TeacherPanel() {
  const [presets, setPresets] = useState<LessonPreset[]>(() => loadPresets().sort((a, b) => b.lastUsedAt - a.lastUsedAt))
  const [editing, setEditing] = useState<LessonPreset | null>(() => (loadPresets().length === 0 ? newPreset() : null))

  const start = (p: LessonPreset) => {
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
    <section className="panel flex flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Your lessons</h2>
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
            <li key={p.id} className="lesson-card flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{p.name || 'Untitled lesson'}</div>
                  <div className="text-xs text-[var(--muted)]">
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
                <button type="button" onClick={() => start(p)} className="btn-primary">
                  Start lesson
                </button>
                <button type="button" onClick={() => setEditing({ ...p })} className="btn-ghost text-xs">
                  Edit
                </button>
                <button type="button" onClick={() => remove(p.id)} className="ml-auto cursor-pointer text-xs text-[var(--muted)] hover:text-[var(--bad)]">
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
      className="flex flex-col gap-4 rounded-xl border border-[var(--border)] p-4"
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
          <input type="number" min={5} max={480} step={5} value={p.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))} className="input" />
        </Field>
        <Field label="Break reminder" hint="0 = off" group>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted)]">every</span>
            <input type="number" min={0} max={240} step={5} value={p.breakEveryMin} onChange={(e) => set('breakEveryMin', Number(e.target.value))} className="input w-24" />
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
                className="flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition"
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

      <div className="flex items-center gap-2">
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
    <section className="panel flex flex-col gap-5 p-6">
      <div>
        <h2 className="text-lg font-semibold">Join a lesson</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Enter the code your teacher shared. You will see exactly what is sent, and you can mark yourself as taking notes
          or stepping away at any time.
        </p>
      </div>
      <form onSubmit={join} className="flex flex-col gap-3">
        <Field label="Your name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alice" className="input" />
        </Field>
        <Field label="Room code">
          <input
            value={code}
            onChange={(e) => setCode(normaliseRoomCode(e.target.value))}
            placeholder="ABC123"
            className="input font-mono uppercase tracking-[0.3em]"
            autoCapitalize="characters"
          />
        </Field>
        <button type="submit" disabled={normaliseRoomCode(code).length < 4 || !name.trim()} className="btn-primary self-start">
          Join
        </button>
      </form>
      <ul className="mt-auto flex flex-col gap-1.5 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
        <li>Your video stays on this device. The teacher never sees it.</li>
        <li>Only a status word and a number are shared, every couple of seconds.</li>
        <li>Stop sharing whenever you like.</li>
      </ul>
    </section>
  )
}

function Fact({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{text}</div>
    </div>
  )
}
