# FocusAI for teachers

A short guide to running an online lesson with FocusAI open beside Zoom, Meet or Teams.

## What it tells you, and what it does not

FocusAI tells you where each student's head and eyes are pointed, summarised into a few
plain states. It does **not** tell you whether a student understands, agrees, or is thinking.
A student staring at the screen can be lost; a student looking at the ceiling can be working
through your question. Use it the way you use a glance across a physical classroom: as a cue
to check in, never as evidence.

Green means with you. Blue means busy with something normal (notes, a quick interruption,
someone talking to them). Amber means a pattern that might deserve a quick word.

## Before the lesson

1. Open the FocusAI site, click **Create a room**, and copy the join link.
2. Paste the link into the meeting chat, or into the lesson's calendar invite.
3. Tell students, the first time, what they are agreeing to. The script below works:

   > "This tab watches your camera on your own laptop and only tells me a one-word status
   > such as attentive, taking notes or stepped away. I never see your video through it.
   > If you need to write, take a call, or step away, press the button in the tab and nothing
   > will flag. It is not part of your grade."

4. When you start the lesson the browser asks to allow notifications. Say yes. From then on a
   system notification with a sound appears over Zoom or Meet whenever a student steps away,
   turns the camera off or leaves, and check-in notifications stay on screen until you dismiss
   them. Use **Send a test** on the host page, switch to your meeting, and confirm you see it.
   On Windows, make sure Focus Assist / Do not disturb is off during lessons.
5. Ask students to click **Calibrate** once while looking at your slides. It takes a second.

## During the lesson

Everything in this section happens **live**, within seconds, while you teach. The report at the
end is a bonus, not the way you find out.

**Glance at "Class right now."** The bar and the percentage tell you, in one look, how many
students are with you or busy with a normal activity. The small chart underneath shows how
the lesson has gone minute by minute.

**When the "attention has sagged" box appears** the class has been drifting for a couple of
minutes. Change pace rather than call anyone out:

- ask a direct question to the group, or to a named student who is green;
- run a one-minute poll or a quick "type one word in chat";
- ask someone to summarise the last point;
- switch from slides to a worked example, or take a two-minute break.

**When a card turns amber** you get a toast and a tone. Look at the reason on the card:

| Card says | What usually happened | A good response |
| --- | --- | --- |
| Stepped away | Left the desk, camera still on | Nothing for the first minutes. After the check-in alert, a private chat message: "Everything okay?" |
| Looking elsewhere | Second screen, window, another device | Direct a question their way, or a private "are you still with us?" |
| Using phone | Phone in hand and eyes on it | A private nudge; or a group reminder without names |
| Eyes closed | Tired, or very long blink patterns | A private message; consider a break if several appear |
| No camera data | Poor light, face too small | Not a behaviour issue. Ask them to adjust the camera at a natural pause |
| Camera off | Pressed Stop sharing, or the camera was unplugged or taken by another app | You get an immediate alert. A private message asking them to turn it back on |
| Left | Pressed Leave, closed the tab, or went silent for 10 minutes | You get an immediate alert and the card stays on the roster marked "Left" with the time |

Blue cards (taking notes, talking to someone, brief interruption) and anything a student
marked themself need no action. They are shown so you know what is going on, not so you act.

**Keep responses private.** A chat message to one student is always better than a public
remark. The tool's job is to make you aware, not to make the student feel watched.

**Students can be wrong about themselves, and so can the camera.** A student who pressed
"Taking notes" and vanished for twenty minutes will show a single gentle info after ten. Use
your judgement.

## After the lesson

Click **Download lesson report** before closing the host tab. You get:

- a CSV with one row per student: minutes tracked, share of time in each state, how long they
  self-declared a status, how many alerts;
- a JSON with the same plus the class timeline and the alert log.

Useful ways to read it:

- The class timeline shows **when** attention dropped. Match it to what you were doing at that
  minute. That is the single most useful number in the file for improving the next lesson.
- A student with high "elsewhere" or "phone" across several lessons is worth a conversation,
  not a consequence. A student with high "no data" needs a better camera setup, not a talk.
- Do not rank students by attentive percentage, and do not put the numbers in a grade book.
  The percentages are posture statistics.

## Things students may ask

- **"Can you see my camera?"** No. Only the status word and a number; the video stays on your
  laptop. They can see exactly what is shared on their own screen.
- **"What if my mum calls me?"** Turn and talk. That shows as "talking to someone" in blue and
  nothing flags for several minutes. Or press "Interrupted".
- **"I write on paper."** Fine. Look up every so often. If they prefer, press "Taking notes".
- **"Does this affect my grade?"** It must not. Say so plainly.

## Using FocusAI on phones and tablets

**Students.** The join page works on iPhone, iPad and Android in Safari or Chrome. Students
can scan the QR code on your host page (the **QR code** button, or the waiting panel) instead of
typing the code. On a phone they should prop the device up so the front camera sees their face,
roughly where they look at the lesson. The screen stays awake automatically. If they switch to
another app the camera pauses and you see *Switched to another app on their phone* until they
return. If the meeting itself is on the same phone, split screen works on Android and iPadOS;
otherwise the phone is best used as a dedicated camera next to the laptop running the meeting.

**Teachers.** The host page works on a phone too, for example propped next to the laptop that
runs Zoom: cards, toasts and the tone all work, and the screen stays awake. System notifications
on Android work after you allow them. On iPhone and iPad, notifications only work when FocusAI is
on the home screen: tap Share, then **Add to Home Screen**, open it from there, then allow
notifications. A phone browser that is put in the background stops receiving updates, so keep
the FocusAI screen open while teaching.
