/** Plain-language data flow. Short on purpose: a parent or a student should finish it. */
export default function Privacy() {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-8 px-5 py-8 md:py-12">
      <header className="flex flex-col gap-2">
        <a href="#/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          ← FocusAI
        </a>
        <h1 className="text-3xl font-semibold tracking-tight">What FocusAI sees, sends and keeps</h1>
        <p className="text-[var(--muted)]">Written for students, parents and teachers. No legal language.</p>
      </header>

      <Section title="What your camera is used for">
        Your webcam is read by a small model that runs inside your browser, on your own device. It looks for where your head
        and eyes are pointing, whether your eyes are open, whether a phone is in view, and how the light falls on you. No
        picture, video frame or face measurement ever leaves your device. There is no recording.
      </Section>

      <Section title="What is sent to your teacher">
        A status word (attentive, taking notes, talking to someone, brief interruption, stepped away, looking elsewhere,
        may be on phone, eyes closing, or no camera data), when it started, a rough 0–100 estimate, your name as you typed it,
        and anything you declared yourself (taking notes, stepping away, I'm fine). That is the entire list.
      </Section>

      <Section title="Who can read it">
        Only your teacher's browser. Each lesson has its own key pair, kept in the teacher's browser. Everything you send is
        encrypted to that key. The server that relays messages, other students with the room code, and the people who run
        FocusAI cannot read it. The room code is a fingerprint of the teacher's key, so your device checks that the "teacher"
        answering really is the one whose code you typed. You cannot be impersonated by a classmate: your messages are tied
        to a key only your device holds.
      </Section>

      <Section title="What is stored">
        Nothing, on any server. Statuses pass through a relay and are gone. Your teacher's browser keeps the lesson's
        timeline in memory until they close the page, and can download a report file to their own computer. Your browser
        remembers your name and a key for the current session only. Teachers' lesson settings and keys live in their own
        browser's storage.
      </Section>

      <Section title="What you see">
        You always see the same word your teacher sees, at the same time. When the camera reads something that could be taken
        the wrong way ("may be on phone", "eyes closing", "looking elsewhere"), you get 10 seconds to tap "I'm fine", "taking
        notes" or "stepping away" before your teacher sees anything. What you declare always overrides the camera.
      </Section>

      <Section title="What a status means, and does not mean">
        A status describes a few seconds of head and eye direction. It does not measure understanding, effort or honesty,
        and it is wrong sometimes. FocusAI shows "signals, not evidence" on every teacher screen and report, and the teacher
        guide says statuses must not be used for grading or discipline. If a status was wrong about you, say so; your word
        wins.
      </Section>

      <Section title="Your choices">
        You decide whether to share at all. You can stop at any time with one tap, turn the camera off, or leave. Nothing
        happens to you inside FocusAI if you do; your teacher simply sees "camera off" or "left". Children should share only
        with a parent's or guardian's agreement, following the school's rules.
      </Section>

      <Section title="The code is open">
        Everything above can be checked. The source is public under the MIT licence at{' '}
        <a href="https://github.com/mdaelali/focusai" target="_blank" rel="noreferrer" className="underline">
          github.com/mdaelali/focusai
        </a>
        . Security concerns: see SECURITY.md in the repository.
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm leading-relaxed text-[var(--muted)]">{children}</p>
    </section>
  )
}
