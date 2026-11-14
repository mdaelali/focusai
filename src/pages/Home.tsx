import { useState } from 'react'
import { newRoomCode, normaliseRoomCode } from '../room/protocol'
import { transportAvailable } from '../room/transport'

export default function Home() {
  const [code, setCode] = useState('')
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('focusai.name') ?? ''
    } catch {
      return ''
    }
  })
  const transport = transportAvailable()

  const host = () => {
    location.hash = `#/host/${newRoomCode()}`
  }
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
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Focus<span style={{ color: 'var(--accent)' }}>AI</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          A companion for online lessons and meetings. Each participant runs it next to Zoom, Meet or Teams. Their
          camera is analysed on their own device, and the host only ever receives a short status such as
          <em> attentive</em>, <em>taking notes</em> or <em>stepped away</em>. Video never leaves the participant's
          computer.
        </p>
      </header>

      <main className="grid gap-4 md:grid-cols-2">
        <section className="panel flex flex-col gap-4 p-6">
          <div>
            <h2 className="text-lg font-semibold">Host a session</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              For teachers and meeting hosts. Creates a room code to share with participants and shows a live roster
              with gentle check-in suggestions.
            </p>
          </div>
          <button
            type="button"
            onClick={host}
            className="cursor-pointer self-start rounded-lg px-4 py-2 text-sm font-semibold text-black"
            style={{ background: 'var(--accent)' }}
          >
            Create a room
          </button>
        </section>

        <section className="panel flex flex-col gap-4 p-6">
          <div>
            <h2 className="text-lg font-semibold">Join a session</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              For participants. Enter the code from your host. You see exactly what is shared, and you can mark
              yourself as taking notes or stepping away at any time.
            </p>
          </div>
          <form onSubmit={join} className="flex flex-col gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Your name"
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-[var(--info)]"
            />
            <input
              value={code}
              onChange={(e) => setCode(normaliseRoomCode(e.target.value))}
              placeholder="Room code"
              aria-label="Room code"
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 font-mono text-sm uppercase tracking-widest outline-none focus:border-[var(--info)]"
            />
            <button
              type="submit"
              disabled={normaliseRoomCode(code).length < 4 || !name.trim()}
              className="cursor-pointer self-start rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--panel-2)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Join
            </button>
          </form>
        </section>
      </main>

      <section className="panel p-6 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="mb-2 text-base font-semibold text-[var(--text)]">What counts as normal, and never alerts the host</h2>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          <li>Looking down to write notes, as long as you glance at the screen now and then.</li>
          <li>Leaning out of view for a few seconds, for example to pick something up.</li>
          <li>Turning to talk to someone who walked in, for several minutes.</li>
          <li>Anything you mark yourself: taking notes, interrupted, stepping away.</li>
        </ul>
        <p className="mt-3">
          The host is only asked to check in after a long, unexplained pattern: away from the camera for minutes,
          eyes closed for a long stretch, or looking elsewhere continuously. Even then it is a suggestion, never a
          verdict.
        </p>
      </section>

      <footer className="flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
        <a href="#/lab" className="hover:underline">
          Open the solo lab (see the raw measurements)
        </a>
        <span>
          Room transport: {transport === 'supabase' ? 'Supabase Realtime (cross-device)' : 'this browser only (demo mode)'}
        </span>
      </footer>
    </div>
  )
}
