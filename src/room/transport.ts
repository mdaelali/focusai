import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { isRoomMessage, type RoomMessage } from './protocol'

/**
 * A room is a named pub/sub channel. Two transports:
 *
 * - `supabase`: Supabase Realtime broadcast. Works across devices and
 *   networks. Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Broadcast
 *   messages pass through the Realtime server and are not stored.
 * - `local`: the browser's BroadcastChannel. Only reaches tabs of the same
 *   browser profile. Used for demos and tests without any backend.
 */

export type TransportKind = 'supabase' | 'local'

export interface RoomTransport {
  readonly kind: TransportKind
  send(m: RoomMessage): void
  onMessage(cb: (m: RoomMessage) => void): () => void
  close(): void
}

export function transportAvailable(): TransportKind {
  return supabaseConfig() ? 'supabase' : 'local'
}

function supabaseConfig(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return url && key ? { url, key } : null
}

export function createTransport(room: string, preferred?: TransportKind): RoomTransport {
  const cfg = supabaseConfig()
  if (cfg && preferred !== 'local') return new SupabaseTransport(room, cfg.url, cfg.key)
  return new LocalTransport(room)
}

class LocalTransport implements RoomTransport {
  readonly kind = 'local' as const
  private ch: BroadcastChannel
  private listeners = new Set<(m: RoomMessage) => void>()

  constructor(room: string) {
    this.ch = new BroadcastChannel(`focusai:${room}`)
    this.ch.onmessage = (e) => {
      if (isRoomMessage(e.data)) for (const l of this.listeners) l(e.data)
    }
  }

  send(m: RoomMessage): void {
    this.ch.postMessage(m)
  }

  onMessage(cb: (m: RoomMessage) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  close(): void {
    this.listeners.clear()
    this.ch.close()
  }
}

let sharedClient: SupabaseClient | null = null

class SupabaseTransport implements RoomTransport {
  readonly kind = 'supabase' as const
  private channel: RealtimeChannel
  private listeners = new Set<(m: RoomMessage) => void>()
  private queue: RoomMessage[] = []
  private ready = false

  constructor(room: string, url: string, key: string) {
    sharedClient ??= createClient(url, key, { auth: { persistSession: false } })
    this.channel = sharedClient.channel(`focusai:${room}`, { config: { broadcast: { self: false, ack: false } } })
    this.channel
      .on('broadcast', { event: 'msg' }, ({ payload }) => {
        if (isRoomMessage(payload)) for (const l of this.listeners) l(payload)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.ready = true
          const q = this.queue.splice(0)
          for (const m of q) this.send(m)
        }
      })
  }

  send(m: RoomMessage): void {
    if (!this.ready) {
      // Keep only the newest report per sender while connecting.
      this.queue = this.queue.filter((x) => !(x.kind === 'sealed' && m.kind === 'sealed' && x.id === m.id))
      this.queue.push(m)
      return
    }
    void this.channel.send({ type: 'broadcast', event: 'msg', payload: m })
  }

  onMessage(cb: (m: RoomMessage) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  close(): void {
    this.listeners.clear()
    void sharedClient?.removeChannel(this.channel)
  }
}
