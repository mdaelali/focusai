/**
 * End-to-end encryption for rooms, with no server and no accounts.
 *
 * The problem it solves: a room code is shared with a whole class, and
 * anything broadcast on the room channel can be read by anyone who has it.
 * Without this layer, a student with the code could open the teacher's
 * dashboard, read every classmate's status, or forge a classmate's status.
 *
 * The design:
 * - Each lesson owns a long-lived P-256 key pair, kept only in the teacher's
 *   browser. The room code *is* a fingerprint of the public key (40 bits), so
 *   a student who types the code can verify that the "host" announcing itself
 *   really owns that key. Nobody else can produce a matching key quickly.
 * - Each student generates a key pair per session. Their participant id is
 *   the fingerprint of their public key, so a message claiming to be from
 *   Alice must be encrypted with Alice's key: classmates cannot forge it.
 * - Every student message is ECDH(student, host) → HKDF → AES-256-GCM. Only
 *   the host can decrypt. The Realtime server, and anyone else with the code,
 *   sees only ciphertext.
 *
 * A student can still misreport their own state. That is bounded, affects
 * only them, and the self-declare buttons already make it an honest choice.
 */

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_CODE_LEN = 8
const te = new TextEncoder()

export interface KeyPairJwk {
  /** Private key as JWK (contains d). Never leaves the device it was made on. */
  priv: JsonWebKey
  /** Public key, raw uncompressed point, base64. Safe to broadcast. */
  pub: string
}

export const b64 = {
  enc(bytes: ArrayBuffer | Uint8Array): string {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    let s = ''
    for (const b of u) s += String.fromCharCode(b)
    return btoa(s)
  },
  dec(s: string): Uint8Array<ArrayBuffer> {
    const bin = atob(s)
    const u = new Uint8Array(new ArrayBuffer(bin.length))
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
    return u
  },
}

export async function generateKeyPair(): Promise<KeyPairJwk> {
  const kp = await crypto.subtle.generateKey(CURVE, true, ['deriveBits'])
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey)
  const pub = b64.enc(await crypto.subtle.exportKey('raw', kp.publicKey))
  return { priv, pub }
}

async function importPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, CURVE, false, ['deriveBits'])
}

async function importPublic(pub: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', b64.dec(pub), CURVE, false, [])
}

async function sha256(parts: (string | Uint8Array)[]): Promise<Uint8Array> {
  const chunks = parts.map((p) => (typeof p === 'string' ? te.encode(p) : p))
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const buf = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    buf.set(c, o)
    o += c.length
  }
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
}

/** 8 characters, 40 bits of the public key's hash, in a glyph set without 0/O/1/I. */
export async function roomCodeFromPublicKey(pub: string): Promise<string> {
  const h = await sha256(['focusai-room-v1|', b64.dec(pub)])
  let bits = 0
  let acc = 0
  let out = ''
  for (let i = 0; out.length < ROOM_CODE_LEN; i++) {
    acc = (acc << 8) | h[i]
    bits += 8
    while (bits >= 5 && out.length < ROOM_CODE_LEN) {
      bits -= 5
      out += ALPHABET[(acc >> bits) & 31]
    }
  }
  return out
}

/** A participant's id is the fingerprint of their public key: 16 hex chars. */
export async function participantIdFromPublicKey(pub: string): Promise<string> {
  const h = await sha256(['focusai-participant-v1|', b64.dec(pub)])
  return [...h.slice(0, 8)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** Shared AES-GCM key between one student and the host, bound to the room. */
export async function deriveRoomKey(myPriv: JsonWebKey, theirPub: string, room: string): Promise<CryptoKey> {
  const priv = await importPrivate(myPriv)
  const pub = await importPublic(theirPub)
  const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256)
  const hkdf = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: te.encode(`focusai-room|${room}`), info: te.encode('focusai-aes-gcm-v1') },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export interface SealedPayload {
  iv: string
  ct: string
}

/** Encrypt a JSON value. `aad` binds the ciphertext to a context (room + sender). */
export async function seal(key: CryptoKey, value: unknown, aad: string): Promise<SealedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, key, te.encode(JSON.stringify(value)))
  return { iv: b64.enc(iv), ct: b64.enc(ct) }
}

/** Decrypt; returns null on any failure (wrong key, tampered, wrong context). */
export async function open(key: CryptoKey, p: SealedPayload, aad: string): Promise<unknown> {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(p.iv), additionalData: te.encode(aad) }, key, b64.dec(p.ct))
    return JSON.parse(new TextDecoder().decode(pt))
  } catch {
    return null
  }
}

export function sealAad(room: string, participantId: string): string {
  return `focusai|${room}|${participantId}`
}

export function formatRoomCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}
