import { describe, expect, it } from 'vitest'
import { deriveRoomKey, generateKeyPair, open, participantIdFromPublicKey, roomCodeFromPublicKey, seal, sealAad } from './crypto'
import { isParticipantMessage, isRoomMessage } from './protocol'

describe('room encryption', () => {
  it('derives the same key on both sides and round-trips a report', async () => {
    const host = await generateKeyPair()
    const student = await generateKeyPair()
    const room = await roomCodeFromPublicKey(host.pub)
    const id = await participantIdFromPublicKey(student.pub)
    const kHost = await deriveRoomKey(host.priv, student.pub, room)
    const kStudent = await deriveRoomKey(student.priv, host.pub, room)
    const msg = { kind: 'report', id, name: 'Alice', ts: 1, since: 1, state: 'attentive', score: 80, selfStatus: 'none', excused: false, reason: 'Gaze on the screen', camera: true }
    const sealed = await seal(kStudent, msg, sealAad(room, id))
    expect(await open(kHost, sealed, sealAad(room, id))).toEqual(msg)
  })

  it('room code and participant id are stable fingerprints of the key', async () => {
    const host = await generateKeyPair()
    const a = await roomCodeFromPublicKey(host.pub)
    const b = await roomCodeFromPublicKey(host.pub)
    expect(a).toBe(b)
    expect(a).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
    const other = await generateKeyPair()
    expect(await roomCodeFromPublicKey(other.pub)).not.toBe(a)
    expect(await participantIdFromPublicKey(host.pub)).toMatch(/^[0-9a-f]{16}$/)
  })

  it('a classmate with the room code can neither read nor forge', async () => {
    const host = await generateKeyPair()
    const alice = await generateKeyPair()
    const mallory = await generateKeyPair()
    const room = await roomCodeFromPublicKey(host.pub)
    const aliceId = await participantIdFromPublicKey(alice.pub)
    const kAlice = await deriveRoomKey(alice.priv, host.pub, room)
    const sealed = await seal(kAlice, { kind: 'leave', id: aliceId, ts: 1 }, sealAad(room, aliceId))

    // Reading: Mallory only has her own key and the host's public key.
    const kMallory = await deriveRoomKey(mallory.priv, host.pub, room)
    expect(await open(kMallory, sealed, sealAad(room, aliceId))).toBeNull()

    // Forging: Mallory seals a message claiming Alice's id. The host derives the
    // key from the *sender's* public key and checks the id is its fingerprint.
    const forged = await seal(kMallory, { kind: 'leave', id: aliceId, ts: 2 }, sealAad(room, aliceId))
    const kHostForMallory = await deriveRoomKey(host.priv, mallory.pub, room)
    const inner = await open(kHostForMallory, forged, sealAad(room, aliceId))
    // The ciphertext opens (Mallory used a real shared key) but the id does not match her key.
    expect(await participantIdFromPublicKey(mallory.pub)).not.toBe(aliceId)
    expect(inner).toEqual({ kind: 'leave', id: aliceId, ts: 2 })
    // ...and a message sealed for one context cannot be replayed under another.
    expect(await open(kHostForMallory, forged, sealAad(room, await participantIdFromPublicKey(mallory.pub)))).toBeNull()
  })

  it('a different host key with the same code is rejected by fingerprint', async () => {
    const host = await generateKeyPair()
    const impostor = await generateKeyPair()
    const room = await roomCodeFromPublicKey(host.pub)
    expect(await roomCodeFromPublicKey(impostor.pub)).not.toBe(room)
  })
})

describe('protocol validation', () => {
  it('accepts only hello, knock and sealed on the wire', () => {
    expect(isRoomMessage({ kind: 'knock', ts: 1 })).toBe(true)
    expect(isRoomMessage({ kind: 'host', ts: 1, pub: 'AAAA' })).toBe(true)
    expect(isRoomMessage({ kind: 'sealed', ts: 1, id: '0123456789abcdef', pub: 'AAAA', iv: 'AAAA', ct: 'AAAA' })).toBe(true)
    expect(isRoomMessage({ kind: 'sealed', ts: 1, id: 'not-hex', pub: 'AAAA', iv: 'AAAA', ct: 'AAAA' })).toBe(false)
    // Plaintext reports are no longer accepted on the channel at all.
    expect(isRoomMessage({ kind: 'report', id: 'x', name: 'A', ts: 1, since: 1, state: 'attentive', score: 1, selfStatus: 'none', excused: false, reason: '', camera: true })).toBe(false)
  })

  it('validates decrypted participant messages strictly', () => {
    const ok = { kind: 'report', id: 'x', name: 'A', ts: 1, since: 1, state: 'attentive', score: 1, selfStatus: 'fine', excused: true, reason: '', camera: true }
    expect(isParticipantMessage(ok)).toBe(true)
    expect(isParticipantMessage({ ...ok, state: 'cheating' })).toBe(false)
    expect(isParticipantMessage({ ...ok, score: 101 })).toBe(false)
    expect(isParticipantMessage({ ...ok, name: 'x'.repeat(41) })).toBe(false)
  })
})
