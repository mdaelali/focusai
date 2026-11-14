# Using FocusAI with Zoom, Google Meet and Microsoft Teams

## The constraint that shapes everything

No meeting platform lets a third-party app read participants' video:

- **Zoom** removed its own "attendee attention tracker" permanently in April 2020 after
  a privacy backlash. A Zoom App (the in-client marketplace apps) gets meeting context and
  participant names, not camera frames, and `getUserMedia` is not available inside the
  Zoom App webview while Zoom holds the camera.
- **Google Meet add-ons** run in an iframe (side panel or main stage) that has no camera
  access.
- **Microsoft Teams** apps (tabs, side panels) have the same restriction.

The only ways to see participant video are a meeting bot that joins as a participant and
records everyone (Zoom Meeting SDK raw data, Recall.ai and similar), or server-side video
processing. Both mean recording students' video on a server. That is exactly what FocusAI
promises not to do, and it is the approach that got Zoom's feature removed.

So FocusAI does not try to get inside the video call. It runs **beside** it, on each
participant's own device, with their consent, and shares only a label.

## Architecture

```
Student laptop                                    Teacher laptop
+------------------------------+                  +--------------------------+
| Zoom / Meet / Teams window   |                  | Zoom / Meet / Teams      |
+------------------------------+                  +--------------------------+
| FocusAI companion tab        |   state label    | FocusAI host dashboard   |
|  camera -> MediaPipe (WASM)  | ---------------> |  roster, durations,      |
|  -> behaviour state          |  via Realtime    |  suggested check-ins     |
|  (video never leaves)        |                  |                          |
+------------------------------+                  +--------------------------+
```

What crosses the network, every 2 seconds, per participant:

| Field | Example |
| --- | --- |
| state | `taking_notes` |
| since | timestamp |
| score | 71 (visual engagement, 0–100) or null |
| selfStatus | `notes` if the student marked themself |
| excused | true |
| reason | "Head down, facing the desk" |

Never: frames, images, landmarks, raw head angles, audio.

## What is treated as normal (never alerts the host)

| Situation | How it is detected | Treated as |
| --- | --- | --- |
| Writing notes | Head pitched down toward the desk, face still present, occasional glance back at the screen | **Taking notes**, excused indefinitely while glances continue; one gentle info after 4 min with no glance |
| Dropped something, bent out of view | Face absent for under 5 s then back | **Brief interruption**, excused, nothing recorded as "away" |
| Parent / partner / colleague walks in | Head turned away and mouth moving, or a second face in view | **Talking to someone**, excused; one info after 5 min |
| Answering in the meeting | Mouth moving while facing the screen | Attentive or talking, excused |
| Any situation the student marks themself | Buttons: Taking notes / Interrupted / Stepping away | Always trusted over the camera; alerts silenced; one reminder after 10 min |

What does reach the host as "consider checking in":

| Situation | After |
| --- | --- |
| Away from the camera for more than 5 s, not self-declared | Immediate notice (card, toast, tone, desktop notification); check-in alert after 3 min |
| Phone in hand with eyes off the screen | Immediate notice; check-in alert after 1 min |
| Looking elsewhere continuously, head not down, not talking | 2 min |
| Eyes closed continuously | 45 s |
| No usable camera data (camera off, face unmeasurable) | 2 min, as info only |

All thresholds live in `DEFAULT_POLICY` in `src/engagement/behavior.ts`. A new state must
hold 3 s before it replaces the old one, so a quick look to the side never flips anything.
Each alert fires once per episode with a 5 minute cooldown per participant.

## How the host is warned

| Moment | What the host gets |
| --- | --- |
| A participant enters an amber state (stepped away, looking elsewhere, using phone, eyes closed) and has not declared a status | Card turns amber with a running timer, name appears under **Suggested check-ins**, a toast slides in, one tone plays, and a desktop notification is sent if the host tab is hidden behind the meeting window |
| The pattern lasts past the threshold | A **Consider checking in** entry in the Alerts list, two tones, desktop notification, and a count in the tab title |
| A blue state or a self-declared status | Nothing. Shown on the card only |

Sound is on by default and can be turned off. Desktop notifications need one click on
**Enable desktop notifications** and the browser's permission.

## Phone use

The face model cannot see a phone. A second, small model (EfficientDet Lite0, COCO classes)
runs on the same frames a few times per second with only the "cell phone" class enabled. The
flag is smoothed over about 2 s, then combined with gaze:

- phone visible **and** eyes off the screen → **Using phone** (not excused)
- phone visible but eyes on the screen → still attentive (a phone lying on the desk is fine)

A second, cheaper signal is lighting: a screen held below the camera lights the chin from
underneath, often bluish, unlike the room or the monitor. `src/vision/lighting.ts` compares a
chin patch with a forehead patch against a baseline learned while the head is up. Head down
**and** unusual glow from below also counts as phone use. Daylight washes this out.

A phone held low, out of the camera frame, in a bright room is not detectable this way. It then looks like
note-taking (head down), and is handled by the note-taking rule: excused while there are
glances back at the screen, one gentle info after 4 min without any. Hand tracking could
tighten this later (thumb-scrolling posture), at the cost of more CPU on the student's device.

## Deployment

### 1. Realtime backend (free tier is enough)

The room channel uses Supabase Realtime broadcast. Messages are relayed between browsers and
are not stored. Create a project at supabase.com, then set two environment variables:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Without them the app still works in demo mode, but only tabs in the same browser see each
other.

Hardening for a real deployment (not needed for a pilot):

- Turn on Realtime authorization (private channels) so only people with a room token can
  subscribe, and issue the token from a tiny edge function when a host creates a room.
- Rate limit broadcasts per connection in the Supabase dashboard.

### 2. Host the static site

The app is a static Vite build. Vercel, Netlify and Cloudflare Pages all work:

```
npm run build        # outputs dist/
```

On Vercel: import the repository, framework "Vite", add the two env vars, deploy.
`vercel.json` already sets long caching for the WASM runtime and the model (about 10 MB
total, downloaded once per device) and a `Permissions-Policy` allowing the camera.

The site must be served over HTTPS; browsers refuse camera access otherwise.

### 3. Give it to a class

1. Host opens `https://your-site/#/` and clicks **Create a room**.
2. Host pastes the join link into the meeting chat.
3. Each student opens the link beside the meeting, reads the consent screen, and clicks
   **I agree, start sharing my status**.
4. Students keep the tab open. It does not need to be visible; Chrome throttles hidden tabs,
   but the analysis loop still runs at a reduced rate, which is enough for minute-scale
   decisions.

## Putting it inside the meeting client

The same web app can be embedded so students do not need a separate tab. In every case the
embedded app still uses the **student's** camera through the browser, so consent and local
processing are unchanged. Cases where the embedded webview cannot access the camera fall
back to the "open in browser" link.

### Zoom App (Zoom Marketplace)

1. In the Zoom App Marketplace, create a **General App**, enable the **Zoom App** feature.
2. Home URL: `https://your-site/#/join`. Add the domain to the allow list.
3. Add the `@zoom/appssdk` package and call `zoomSdk.config({ capabilities: ['getMeetingUUID', 'getUserContext', 'openUrl'] })`
   on load. Use the meeting UUID as the room code and the user's display name as the
   participant name, so joining is automatic.
4. Because the Zoom client holds the camera, `getUserMedia` inside the app webview will
   usually fail. Detect that and show a **Open FocusAI in your browser** button that calls
   `zoomSdk.openUrl({ url: joinLink })`. The host dashboard can run inside the Zoom App
   without camera access.
5. Submit for review. Zoom's review requires a privacy policy and a clear statement of
   what is collected; the "what crosses the network" table above is what to describe.

### Google Meet add-on

1. In Google Cloud, enable the **Meet REST API** and create an add-on deployment
   (`@googleworkspace/meet-addons`) with a **side panel** URL of `https://your-site/#/join`
   and the host's **main stage** at `https://your-site/#/host`.
2. The add-on iframe has no camera access. Use the side panel for the host dashboard and
   for the student's status buttons, and link out to the browser tab for camera analysis.
3. Publish through the Google Workspace Marketplace listing (OAuth verification needed for
   public listing; private listing for one school domain is faster).

### Microsoft Teams

Teams apps are a manifest around a web URL. Add a **meeting side panel** tab pointing at
`#/join` and `#/host`; the same camera caveat applies. Publish to a tenant's app catalog for
a school, or to AppSource for public use.

### Browser extension (most reliable)

A Chrome extension with a side panel can open `#/join` beside `meet.google.com` or
`zoom.us` web client tabs and has normal camera access. It needs no marketplace review
beyond the Chrome Web Store and works for all three platforms. For a school pilot this is
the shortest path.

## Ethics and consent checklist before any pilot

- Students see the consent screen every time and can stop or mark themself at any time.
- The host sees labels and durations, never video, and the labels say "consider checking
  in", never "not paying attention".
- Tell students that blue states (notes, interruption, talking) are never held against them.
- Do not store per-student histories until there is a written policy for who can see them,
  for how long, and how a student can see their own.
- For minors, get guardian consent in writing and let the school's data protection officer
  review the "what crosses the network" table.
- Do not use the score for grading. It measures where a head and eyes were pointed, nothing
  about understanding.
