# Security

## Reporting

Open a private security advisory on GitHub (Security tab → Report a vulnerability) or
email the maintainer, Ali Hasanli, at alihasanli1905@gmail.com. Please do not open a
public issue for anything that could expose a student.

## What the system holds

- **Video, frames, landmarks, audio:** never leave the participant's browser. All models
  run in WebAssembly from files served by this site. There is no upload path in the code.
- **Room messages:** a state label, a timestamp, a 0–100 number, a self-declared status, a
  short reason string and the participant's display name. Every participant message is
  end-to-end encrypted to the lesson's key (ECDH P-256 → HKDF → AES-256-GCM, see
  `src/room/crypto.ts`), relayed through Supabase Realtime broadcast, not stored by Supabase,
  not stored by this app, and unreadable to the relay or to anyone else holding the room code.
- **Lesson presets and keys:** in the teacher's own browser (localStorage). The lesson's
  private key never leaves it; the room code is the fingerprint of its public key. No student data.
- **Reports:** generated in the host's browser and downloaded by the host. Nothing is
  uploaded.
- **Plain text, by design:** the lesson's name and subject (sent in the host's hello message) and the room code. Lesson names should not contain student names.
- **Third parties:** Google Fonts sees visitors' IP addresses. Vercel Web Analytics counts anonymous visits without cookies.
- **Keys:** the Supabase URL and anon key are public by design (they are shipped to every
  browser). They grant nothing beyond joining a Realtime channel; this project uses no
  database tables with them.

## Threat model and mitigations

| Threat | Mitigation |
| --- | --- |
| Someone with the room code opens the teacher dashboard | Impossible without the lesson's private key, which exists only in the browser that created the lesson. Statuses are ciphertext to everyone else, including the Realtime relay. A dashboard opened elsewhere shows "this room's key is not on this device". |
| Someone with the room code pretends to be the host | The 8-character room code is a 40-bit fingerprint of the host's public key. Students verify every hello against it and refuse to send to a key that does not match (they see "not verified"). Producing a key with a chosen 40-bit fingerprint costs on the order of 10¹² key generations. |
| A classmate forges another student's status | A participant id is the fingerprint of that participant's public key, and each message is sealed with the key derived from that same public key. The host rejects any message whose id is not the fingerprint of the key it was sealed with. A student can only misreport themself, which the self-declare buttons already make a visible, honest action. |
| Someone joins a room with a fake name or floods it | Messages are validated (shape, known states, length caps) and ignored otherwise. Hosts see names as plain text; nothing is rendered as HTML. Reports are sent on change with a 10 s heartbeat, and the host answers knocks at most once per second. Supabase rate limits broadcasts per connection. |
| A student is accused by a wrong label | Accusatory states ("may be on phone", "eyes closing", "looking elsewhere") are shown to the student first with a 10 s grace to answer; the teacher sees "brief interruption" meanwhile. Every teacher screen and report carries "signals, not evidence". |
| A malicious host page tries to pull video | There is no message type that carries media, and the participant client never reads the camera into anything but the local models. |
| Cross-site scripting | Strict Content-Security-Policy in `vercel.json`: scripts only from this origin (WASM allowed), connections only to this origin and Supabase, no frames, no inline scripts. React escapes all rendered strings. |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY`. |
| Dependency vulnerabilities | Production dependencies have no known advisories (`npm audit --omit=dev` is clean). Six high-severity findings remain in build and test tooling (`vite`, `vitest`, `picomatch`, `tinyglobby`, `fdir`). The `picomatch` advisory GHSA-fc5q-39xc-vjpf has no patched release yet; it needs attacker-controlled glob patterns, and this build uses only fixed patterns. None of this code is in the shipped bundle. Re-check `npm audit` before each release. Dependencies are pinned by the lockfile. |

## What this is not

FocusAI is not a proctoring tool and must not be used to grade or discipline. Its labels
describe where a head and eyes were pointed. See docs/TEACHER_GUIDE.md for the consent
script and the ethics checklist before any pilot with minors.
