# Security

## Reporting

Open a private security advisory on GitHub (Security tab → Report a vulnerability) or
email the maintainer through the address on the GitHub profile. Please do not open a
public issue for anything that could expose a student.

## What the system holds

- **Video, frames, landmarks, audio:** never leave the participant's browser. All models
  run in WebAssembly from files served by this site. There is no upload path in the code.
- **Room messages:** a state label, a timestamp, a 0–100 number, a self-declared status, a
  short reason string and the participant's display name. Relayed through Supabase Realtime
  broadcast; not stored by Supabase, not stored by this app.
- **Lesson presets:** in the teacher's own browser (localStorage). No student data.
- **Reports:** generated in the host's browser and downloaded by the host. Nothing is
  uploaded.
- **Keys:** the Supabase URL and anon key are public by design (they are shipped to every
  browser). They grant nothing beyond joining a Realtime channel; this project uses no
  database tables with them.

## Threat model and mitigations

| Threat | Mitigation |
| --- | --- |
| Someone guesses a room code and watches the roster | Codes are 6 characters from a 32-symbol alphabet (about 10⁹). Presets keep a permanent code, so rotate it (delete and recreate the lesson) if it leaks. Realtime authorisation (private channels with a signed token) is the next step for institutional use; see docs/INTEGRATIONS.md. |
| Someone joins a room with a fake name or floods it | Messages are validated (shape, known states, length caps) and ignored otherwise. Hosts see names as plain text; nothing is rendered as HTML. Supabase rate limits broadcasts per connection. |
| A malicious host page tries to pull video | There is no message type that carries media, and the participant client never reads the camera into anything but the local models. |
| Cross-site scripting | Strict Content-Security-Policy in `vercel.json`: scripts only from this origin (WASM allowed), connections only to this origin and Supabase, no frames, no inline scripts. React escapes all rendered strings. |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY`. |
| Dependency vulnerabilities | `npm audit` is clean at release; dependencies are pinned by the lockfile. |

## What this is not

FocusAI is not a proctoring tool and must not be used to grade or discipline. Its labels
describe where a head and eyes were pointed. See docs/TEACHER_GUIDE.md for the consent
script and the ethics checklist before any pilot with minors.
