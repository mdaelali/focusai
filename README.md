# FocusAI

A privacy-first companion for online lessons and meetings. Each participant runs it beside
Zoom, Google Meet or Teams. Their webcam is analysed **on their own device** and the host
receives only a short status such as *attentive*, *taking notes* or *stepped away*, with a
suggestion to check in when a pattern is long and unexplained. Video never leaves the
participant's computer.

## Why it works this way

Meeting platforms do not let apps read participant video (Zoom permanently removed its own
attention tracker in 2020). The only alternatives record everyone's video on a server. FocusAI
instead runs in the participant's browser and shares a label. See
[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for the Zoom / Meet / Teams specifics.

## Normal life is not disengagement

The behaviour layer (`src/engagement/behavior.ts`) separates ordinary situations from real
disengagement and gives every state a generous benefit of the doubt:

| Situation | State | Alerts the host? |
| --- | --- | --- |
| Head down writing notes, glancing back now and then | Taking notes | No. One gentle info only after 4 min with no glance at all |
| Leaned out of view for a few seconds (dropped a pen) | Brief interruption | No |
| Turned to talk to someone who walked in, or a second face in view | Talking to someone | No. One info after 5 min |
| Participant pressed "Taking notes", "Interrupted" or "Stepping away" | Their choice | No. Always trusted over the camera |
| Away from camera for minutes, not declared | Stepped away | Suggest a check-in after 3 min |
| Looking elsewhere continuously, head up, not talking | Looking elsewhere | Suggest a check-in after 2 min |
| Eyes closed continuously | Eyes closed | Suggest a check-in after 45 s |

A new state must hold 3 s before it replaces the old one. Each alert fires once per episode
with a 5 minute cooldown. `src/engagement/behavior.test.ts` simulates each scenario.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # scenario tests
npm run build      # static site in dist/
```

Routes:

| Route | Who | What |
| --- | --- | --- |
| `#/` | everyone | Create a room or join one |
| `#/host/CODE` | teacher / host | Live roster, durations, suggested check-ins, alerts |
| `#/join/CODE?name=Alice` | participant | Consent screen, local camera analysis, self-status buttons |
| `#/lab` | developers | Raw measurements, score components, tuning |

Rooms use Supabase Realtime when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
(see `.env.example`). Without them the app runs in demo mode where only tabs in the same
browser see each other.

## What is measured

- MediaPipe Face Landmarker (478 landmarks, blendshapes, head transform) in WebAssembly.
- Head pose (yaw / pitch / roll), eye direction, presence, jaw movement, head stability.
- A rolling 10 s window gives a 0–100 visual engagement estimate
  `E = 0.30·G + 0.25·H + 0.20·P + 0.15·S + 0.10·M` and shows **Insufficient data** when the
  face cannot be measured reliably.
- The behaviour layer reasons over minutes on top of that window.

The number describes where the head and eyes were pointed. It says nothing about
understanding and must not be used for grading.

## Layout

| Path | Purpose |
| --- | --- |
| `src/vision/` | MediaPipe wrapper, head pose, eye and mouth estimates |
| `src/engagement/engagement.ts` | Rolling-window components and score |
| `src/engagement/behavior.ts` | States, benefit-of-the-doubt timing, self-status, alerts |
| `src/room/` | Room protocol and transports (Supabase Realtime, BroadcastChannel) |
| `src/hooks/useSession.ts` | Camera lifecycle and analysis loop |
| `src/pages/` | Home, Host, Join, Lab |
| `docs/INTEGRATIONS.md` | Zoom / Meet / Teams integration, deployment, consent checklist |
