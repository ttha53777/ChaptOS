# ChaptOS mobile app — UI & motion plan (v1)

Companion to `docs/mobile-app-plan.md`, which covers the build, API, push and store
work. This file covers only **what the app looks like and how it moves**. Each phase
below says which build phase it ships with.

Scope follows the build plan: member surfaces only. No org creation, no billing, no
officer admin. The iPhone mock contains officer screens (event form, settings,
billing, parties wrap-up). Those are **not** part of this plan.

## Sources of truth

| What | Where |
|---|---|
| Phone layout, sheets, swipe rows, tabs, Timeline, Tasks deck, punch card, Docs | `_design/Dashboard iPhone Paper Mock.html` |
| Ask Chapt on a phone (keyboard, starters, sheet sizing) | `_design/Ask Chapt Mobile Paper Mock.html` + shipped `chat-phone.css` |
| Minutes on a phone (read view, Summary / Who came tabs) | `_design/Minutes Mobile Paper Mock.html` |
| Check-in band, cancel/VOID states | `app/paper-checkin.css`, `_design/Check-In Cancel Mock.html` |
| Tokens (paper day/night, pastel triplets, ink, lines) | `app/globals.css`, `app/paper-aesthetic.css` |
| Fonts | Bricolage Grotesque (display), Inter (UI), IBM Plex Mono (kickers, figures) |
| Icons / doodles | `app/components/paper/PaperIcon.tsx` sprite (`pp-*`), mock `d-*` sprite |
| Web motion to port | `timeline/event-landing.ts`, `timeline/event-delete.ts`, `tasks/task-fly.ts`, `dashboard/ticket-flight.ts` |
| Easings already in use | `cubic-bezier(.16,.9,.3,1.02)` (spring, 40 uses), `(.22,.72,.24,1)` (standard, 17), `(.6,0,.12,1)` (flights) |

Rule carried over from the web: **show only real capabilities.** A screen or motion
only depicts something the API actually does (check the route map in
`lib/api-types/index.ts` before drawing it).

## Motion principles

1. **Motion confirms a real state change.** Something was saved, counted, voted,
   ticked or removed. No idle loops, no decorative parallax inside the app.
2. **Optimistic, and reversible.** The animation starts on tap. If the server says
   no, it plays backwards, like `event-landing.ts`'s fail path: stamp smears off,
   the card blushes, it returns, and a toast explains.
3. **Interruptible and gesture-driven.** Sheets, swipes and pages follow the finger
   and can be caught mid-flight (Reanimated on the UI thread, never JS-thread timers).
4. **Transform and opacity only** on anything that runs per frame. Measure the landing
   spot before moving, as the web flights do.
5. **Fast feedback, few signature moments.** Taps answer in ≤ 120ms; ordinary
   transitions run 200–320ms; only the moments in the table below may run longer
   (≤ 900ms) and carry a stamp, tear or punch.
6. **Reduced motion is designed, not disabled.** Every animation names its reduced
   version, usually a cross-fade plus the end state, with haptics kept.
7. **Haptics are part of the vocabulary**, never a substitute for visible feedback.

### Signature moments (the only "big" animations in v1)

| Moment | Motion | Haptic |
|---|---|---|
| Checking in | Ticket tears at the perforation; stub gets a **HERE** stamp; band count ticks up | success |
| Task done | Index card gets a **DONE** stamp, small confetti, flies off the deck; next card shuffles up | success |
| Voting | The X is drawn as a pen stroke, then the result bars grow | light → success |
| Join approved (first open after approval) | Sealed envelope opens; chapter card slides out | success |
| Service hours logged | New holes punched in the punch card, one by one | light per hole |
| Reimbursement submitted | Receipt print slides into an envelope stamped **SENT** | success |
| Excuse filed | The note folds and is filed under the event | light |

Everything else (sheets, pages, rows, toasts) uses the standard motion tokens.

---

## U0 — Foundations: tokens, type, primitives, motion kit

**Ships with build Phase 2 (Expo shell).** Nothing is designed screen-by-screen until
this exists.

> **Status 2026-11-17: built** in `mobile/` (Expo SDK 58 / RN 0.88, Node ≥ 22.13). It
> passes `tsc`, `expo-doctor` and an iOS + Android Metro export; it has **not been run
> on a device yet**, so the 60fps check below is still open. Departures from the text
> below:
> - **Hard shadows are native `boxShadow`** (blur 0). RN 0.76+ draws it on the new
>   architecture and doesn't clip it under `overflow: hidden`, so the sibling-view trick
>   is only used where the shadow must stay still while the face moves (Button press).
> - **Sheets carry the mock's tone tab** (a tilted pastel lip behind the top edge), not a
>   hard offset shadow: that's what `.sheet::before` draws.
> - **A fourth curve, `sheet` = `(.32,.72,0,1)`**, from the mock's `--ease-sheet`, plus
>   `press` (stamp drop) and `smear` from `event-landing.ts`. The mock's sheets run 500ms;
>   the plan's `sheet` token is 320. U1 picks one, side by side against the mock.
> - **Expo Go, no dev client yet**: everything U0 uses ships in Expo Go, so the Lab runs
>   from `npx expo start` on any phone. Add `expo-dev-client` when a library outside Expo
>   Go arrives.
> - **Dynamic Type is applied by `T`, not the OS** (`allowFontScaling` off): each style's
>   cap holds, and the Lab can simulate XXL / AX3 without touching device settings.
> - **Icons are generated**, not converted by hand: `npm run gen:icons` parses the web
>   sprite in `PaperIcon.tsx` into `src/icons/glyphs.ts` (72 glyphs). Mock-only `d-*`
>   glyphs get added when a screen needs one.
> - **Known gap: Bricolage optical size.** The web loads Bricolage as a variable font
>   (`opsz` 12–96), so big display text gets the display cut. The Expo font packages are
>   static instances, so the hero greeting will look slightly heavier and looser than
>   on the web. The fix is to ship static instances cut at a display `opsz`; check it on
>   a device first.
> - The check-in tear (stub tips from its left corner, settles torn) is new: the mock's
>   member check-in only shows a receipt row and a stamp.

- **Theme:** port the paper day + night palette from `globals.css` /
  `paper-aesthetic.css` into a typed `theme.ts` (ink ramp, `--line*`, pastel
  fill/soft/ink/border triplets, semantic `ok/warn/risk`). Follow the system appearance,
  with an override in Me → On this phone. No literal hex in screens.
- **Type:** load the three fonts with `expo-font`; define a type scale (display,
  title, body, kicker caps, mono figures) that honours Dynamic Type with caps per
  style so ticket layouts don't break.
- **Icons:** convert the `pp-*` and needed `d-*` doodles to `react-native-svg`
  components, using `currentColor`-style `color` props.
- **Paper primitives** (each a component with day/night and reduced-motion states):
  - `Sheet` surface with 1.5px ink border and **hard offset shadow**. RN shadows blur,
    so the hard shadow is a sibling view offset 3px in a pastel.
  - `Ticket`: notched edges + perforation (SVG mask), optional stub.
  - `IndexCard` (ruled), `LegalPad` (yellow ruled + margin rule), `ManilaFolder`,
    `Tape`, `StickyNote` (±2–3° tilt), `Highlighter` (behind one word), `Stamp`
    (rotated rubber stamp with ink texture), `Receipt` (zigzag edge).
  - `Kicker` (22px coloured dash + tracked caps), `Pill`, `Chip`, `Avatar` + stack.
- **Motion kit:** `react-native-reanimated` + `react-native-gesture-handler`,
  `expo-haptics`. `@shopify/react-native-skia` only for ink effects (stamp texture,
  pen stroke, confetti) if SVG can't hold 60fps.
  - `motion.ts`: named springs mapped from the web easings (`spring` ≈ .16,.9,.3,1.02;
    `standard` ≈ .22,.72,.24,1; `flight` ≈ .6,0,.12,1) plus durations (`tap` 120,
    `move` 240, `sheet` 320, `moment` ≤ 900).
  - `useMotion()` returns the reduced-motion flag (Reanimated `useReducedMotion` +
    `AccessibilityInfo`), and every primitive animation reads it.
  - `haptics.ts`: `tap`, `select`, `success`, `warn`, `error`, one place to tune.
- **Motion Lab** (dev builds only): a hidden screen that plays each primitive and
  signature moment at 1× and at 4× slow, with toggles for day/night, reduced motion
  and Dynamic Type XXL. This is the native version of the mocks' `window.__mock`
  scenes, and it's how every later phase is reviewed.

**Done when:** the Motion Lab shows every primitive in both themes, at XXL type and
with reduced motion on, and a stamp + ticket tear run at 60fps on a mid-range Android.

## U1 — Shell & navigation

**Ships with build Phase 2.**

- **Tabs**, following the iPhone mock but member-scoped:
  **Today · Timeline · Tasks · Members · More**. The mock's centre "+" quick-add is
  officer creation, so it's not in v1. Ask Chapt opens from the ask bar on Today.
  (This replaces the "Home · Calendar · Tasks · Members · Me" list in the build plan.)
  Tapping the active tab pops to root and scrolls to top.
- **Stacked sheets** (`openSheet` from the mock): detents, grabber + header drag
  to dismiss, stacking with `.behind`, and the **app canvas scaling back** behind the
  first sheet. Rubber-band past the top detent.
- **Push pages** (`pushPage/popPage`): slide in from the right, edge-swipe back,
  status bar ink follows the page. Switching tabs drops the stack.
- **Headers:** large title that condenses on scroll; org stamp in the header opens
  the **org switcher** sheet (chapter cards from `MeResponse.memberships`; picking one
  flips the stamp and cross-fades the content, no full reload feel).
- **Feedback layer:** ink snackbar above the tab bar with an **Undo ring** (10s, as
  on web); error toast; inline field errors.
- **Loading:** first load = faint ruled-line skeletons in each card's shape (never
  spinners in cards). Pull-to-refresh = a custom pencil mark that draws as you pull,
  then wiggles while fetching.
- **Splash → first frame:** splash is the brand mark on paper; it hands off to the
  first screen by scaling the mark into the header stamp. Hold it until `/api/auth/me`
  answers or the cached copy is shown, so the first frame is never empty.

**Done when:** every navigation pattern works with one finger, can be interrupted
mid-gesture, and the canvas scale-back matches the mock side by side.

## U2 — Entry screens & day-one states

**Ships with build Phase 3.** (The sign-in screen itself is U10, with build Phase 7.)

- **Terms wall:** a single paper sheet, legible at XXL, one ink button. No Not now.
- **No chapter yet:** "Ask an officer for your chapter's invite link." Paste chip
  (like the mock's Docs add sheet): pasting a valid link turns it into a ticket with
  the chapter's name and logo; Request to join stamps it **SENT**.
- **Awaiting approval:** the sealed envelope with a postmark (chapter + date
  requested). Becomes the "Join approved" signature moment when `/me` flips.
- **Update required (426):** a plain, calm sheet with the store button. No motion.
- **Day-one/empty states:** reuse the web's day-one pattern (3 small pictures + 1
  line, no button when a member can't act). One per tab, with copy written for members.
- **No active term:** a quiet note in place of term numbers, never an error.

## U3 — Today

**Ships with build Phase 3.**

- **Up next ticket** (from `_design/Up Next` / iPhone mock): stub with date, facts,
  agenda peek, live countdown that ticks in mono figures (only the changing digit
  animates).
- **Live check-in band** at the top when a window is open: tone by state
  (open/closing soon/closed/VOID). The ticket → band flight from `ticket-flight.ts`
  plays when a window opens while Today is on screen.
- **Check-in** (signature moment): tap **I'm here** → perforation tear → HERE stamp
  → count ticks. Undo in the snackbar reverses it (stub reattaches). Cancelled window
  shows the rose VOID stamp and "not counted".
- **On your plate:** swipe rows (tasks due, open polls, unpaid dues). Swipe reveals
  actions with rubber band; a full swipe is judged on the raw delta, not the
  rubber-banded one (mock gotcha). Rows collapse smoothly when resolved.
- **Announcement:** taped sticky note; new ones land with a small tape-press.
- **Ask bar:** tapping it expands the bar into the Ask Chapt sheet (shared-element feel).

## U4 — Timeline & events

**Ships with build Phase 3.**

- **Spine** (`tlx-*` in the mock): Earlier bar, Today marker, month heads sticky
  under the header, floating **Today** jump pill that appears once Today is off
  screen. Opening Earlier anchors on the first visible row so nothing jumps.
- **Event sheet:** calendar-page hero (tilted page with tape), facts, "who's bringing
  what" (claiming pins your name to the slip, unclaiming unpins), attendance summary
  for past events, your excuse status.
- **Excuse filing** (signature, small): the note folds and files under the event;
  a rejected one shows a "Not accepted" slip.
- **Minutes (read)** if in v1: legal-pad view with Summary / Who came tabs from the
  minutes mobile mock, read-only. Action items assigned to you can be ticked: tick →
  strike-through draws left to right.
- **Calendar subscribe:** a sheet with "Add to Calendar"; no motion beyond the sheet.

## U5 — Tasks & polls

**Ships with build Phase 3.**

- **On you deck:** ruled index cards ordered by due. Done = signature moment.
  Swiping the top card sideways shows the next (shuffle, `S.tq.rot` in the mock).
- **Sealed ballots:** a poll is an envelope; opening it shows options; voting = pen
  stroke X, then bars grow. Already-voted ballots show your X in place.
- **Board:** Overdue / Upcoming, matching the web. Check-tick → strike → collapse.
  No reschedule or delete swipes (assignees can only tick).
- **"Each" tasks:** your tick drops a dot into the crowd strip; the strip fills as
  others tick (from `TaskDetail`).

## U6 — Members & profile

**Ships with build Phase 3.**

- **Register:** searchable roster with sticky letter heads; search field condenses the
  header. Roles as small inked tags.
- **Member card:** calling-card sheet (Member Spotlight v3 on a phone): photo, role,
  standing measures judged on `measured` (never zeros for untracked), contact actions.
- **Your photo:** pick/take → square crop → the print "develops" (fade from sepia
  wash to colour over ~600ms) as it uploads; failure reverses to the old photo.

## U7 — More / Me

**Ships with build Phase 3.**

- **Me card:** taped card at the top of More (mock `.mecard`), tap → profile.
- **Index-card tiles** for Attendance, Service, Dues, Excuses, Docs, Fundraisers
  (mock `.ix` tiles: divider tab, mono live line, count badge; "Not started" on day one).
- **Attendance:** term record as a punch strip, one hole per meeting, missed ones
  outlined, excused ones taped.
- **Service punch card:** manila stock in one brick ink, numbered slots, holes show
  the page through; new hours punch in (signature moment); sign up for a shift =
  ticket with **I'm going**.
- **Docs (read):** search first, pinned shelf of taped index cards (horizontal snap),
  manila folders that open (height spring). Tapping a row opens the link.
- **Fundraisers (read):** jar per campaign that fills to the raised amount on open.
- **On this phone:** Day/Night/System, notification categories, sign out.
- **Leave chapter / Delete account:** deliberately plain. No playful motion, explicit
  typed confirm for deletion, red ink only here.

## U8 — Ask Chapt

**Ships with build Phase 4.**

- **Sheet:** full height, sized to the keyboard with `react-native-keyboard-controller`
  (the native replacement for the web's visualViewport work); header pull-down closes;
  16pt fields (no zoom issues, but keep parity).
- **Landing:** greeting + highlighted ask, lede on a taped butter note, starters as
  ink tickets with pastel stubs that **fold into a pill strip when the keyboard rises**.
- **Thinking:** the reasoning ledger: steps stream pending → active → done in a margin
  rule, each posting its finding as it lands (step ids stable, per the web cadence rules).
- **Answers:** native components for the shared answer system (headline + one body
  block + footing): figure, list/rows, tally, breakdown, week (planner page), card,
  steps, reasons, quote, note, clarify, decline. Unknown shape → plain text answer.
  Answer blocks enter with a short rise + fade, once (no replay on re-render).
- **Row peek:** tapping an answer row opens the record sheet over the chat.
- **Ask-back:** chips stage into one Continue per block.
- **Attachments:** paper-clip chip with an upload progress fill; a rejected file
  shakes and explains.

## U9 — Money screens

**Ships with build Phase 4.**

- **Dues book:** receipt-paper ledger (charges, payments, waivers) with a running
  balance in mono; paid lines get a small PAID stamp; balance figure counts to its
  value on open (only on first view per session).
- **Reimbursements:** new request sheet → camera → taped print preview with ×; submit
  = signature moment. Status stamps: Pending (pencil), Approved (ink), Paid (stamp).
- **Treasury (when permitted):** read-only balance card + recent ledger; charts use
  the same calm, data-only style as web (no decorative sparklines).

## U10 — System surfaces & sign-in

**Ships with build Phases 5 and 7.**

- **Push permission:** a paper pre-prompt sheet shown after the first useful moment
  (e.g. after the first check-in), explaining what you'll get; only then the OS prompt.
- **Foreground notifications:** a paper slip drops from the top and can be swiped
  away; tapping deep-links with the normal page/sheet transition.
- **Notification settings:** per-category switches with ink toggles.
- **App icon:** light, dark and tinted (iOS 18) variants; Android adaptive + monochrome.
- **Sign-in screen (build Phase 7):** brand mark on paper, Continue with Apple
  (Apple's required button style), Continue with Google, terms line. The splash-to-
  header hand-off from U1 continues into it.
- **Account linking prompt** (Phase 7): a calm sheet, "Sign in with Google once to
  link", no motion.

## U11 — Polish & QA

**Ships with build Phase 6, refreshed before Phase 8.**

- **Performance:** every signature moment at 60fps (120 on ProMotion) on a recent
  iPhone and on a mid-range Android (e.g. Pixel 6a / Galaxy A5x). Profile with the
  Reanimated/Perf monitor; no JS-thread animation.
- **Reduced motion pass:** walk every screen with it on; nothing essential lost.
- **Dynamic Type pass:** up to XXL (and AX sizes where possible); tickets reflow,
  never truncate amounts or dates.
- **Night pass:** pastels lifted for night, stamps readable, hard shadows not muddy.
- **Haptics audit:** one per meaningful action, none on scroll or ordinary navigation.
- **Accessibility:** VoiceOver/TalkBack labels on stamps and icon buttons, signature
  moments announce their result ("Checked in"), 44pt targets.
- **Visual regression:** Maestro flows that screenshot each screen in day/night;
  diff against the Motion Lab and mock references.
- **Store art:** screenshots staged from the demo chapter, framed on paper with one
  highlighted word per caption (landing style), for 6.9" iPhone and Play.

## Phase map

| UI phase | Ships with build phase |
|---|---|
| U0 Foundations, U1 Shell | 2 — Expo shell |
| U2 Entry, U3 Today, U4 Timeline, U5 Tasks, U6 Members, U7 More | 3 — Core screens |
| U8 Ask Chapt, U9 Money | 4 — Ask Chapt + money |
| U10 push surfaces | 5 — Push |
| U11 Polish & QA | 6 — Hardening (refresh before 8) |
| U10 sign-in screens | 7 — Sign-in |

## Decisions for you

1. **Tab set:** Today · Timeline · Tasks · Members · More (recommended, above), or keep
   the mock's centre "+" for member quick actions (file excuse, request reimbursement,
   ask)?
2. **Confetti on task done:** keep it (it's in the mock) or stamp-only?
3. **Night by default:** follow the system (recommended), or always start on Day?
