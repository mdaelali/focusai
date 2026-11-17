import { useEffect, useState } from 'react'
import Home from './pages/Home'
import Lab from './pages/Lab'
import Join from './pages/Join'
import Host from './pages/Host'
import Privacy from './pages/Privacy'
import ZoomApp from './pages/ZoomApp'
import { normaliseRoomCode } from './room/protocol'

/*
 * Hash router. Routes:
 *   #/              landing: host or join
 *   #/lab           solo lab with raw measurements (the Phase 1 prototype)
 *   #/host/CODE     host dashboard for a room
 *   #/join/CODE?name=Alice   participant companion for a room
 *   #/zoom          entry point when the site runs as a Zoom App
 */
type Route =
  | { page: 'home' }
  | { page: 'lab' }
  | { page: 'privacy' }
  | { page: 'zoom' }
  | { page: 'host'; room: string; preset: string | null }
  | { page: 'join'; room: string; name: string }

function parse(hash: string): Route {
  const h = hash.replace(/^#/, '')
  const [path, query = ''] = h.split('?')
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'lab') return { page: 'lab' }
  if (parts[0] === 'privacy') return { page: 'privacy' }
  if (parts[0] === 'zoom') return { page: 'zoom' }
  if (parts[0] === 'host' && parts[1]) return { page: 'host', room: normaliseRoomCode(parts[1]), preset: new URLSearchParams(query).get('preset') }
  if (parts[0] === 'join' && parts[1]) {
    const name = new URLSearchParams(query).get('name')?.trim() ?? ''
    return { page: 'join', room: normaliseRoomCode(parts[1]), name }
  }
  return { page: 'home' }
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash))
  useEffect(() => {
    const on = () => setRoute(parse(location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  switch (route.page) {
    case 'lab':
      return <Lab />
    case 'privacy':
      return <Privacy />
    case 'zoom':
      return <ZoomApp />
    case 'host':
      return <Host room={route.room} presetId={route.preset} />
    case 'join':
      return route.name ? <Join room={route.room} name={route.name} /> : <NamePrompt room={route.room} />
    default:
      return <Home />
  }
}

/** A join link without a name: ask for one, then continue. */
function NamePrompt({ room }: { room: string }) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('focusai.name') ?? ''
    } catch {
      return ''
    }
  })
  const go = (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    try {
      localStorage.setItem('focusai.name', n)
    } catch {
      /* ignore */
    }
    location.hash = `#/join/${room}?name=${encodeURIComponent(n)}`
  }
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-xl font-semibold">
        Join room <span className="font-mono tracking-widest">{room.length === 8 ? `${room.slice(0, 4)}-${room.slice(4)}` : room}</span>
      </h1>
      <form onSubmit={go} className="panel flex flex-col gap-3 p-5">
        <label className="text-sm text-[var(--muted)]" htmlFor="join-name">
          The name your host should see
        </label>
        <input
          id="join-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-[var(--info)]"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="cursor-pointer self-start rounded-lg px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          Continue
        </button>
      </form>
    </div>
  )
}
