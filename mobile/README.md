# ChaptOS mobile

The member app (Expo SDK 58, React Native 0.88, expo-router). Plans:
`docs/mobile-app-plan.md` (build, API, stores) and `docs/mobile-app-ui-motion-plan.md`
(look and motion).

**Status:** U0 (foundations), the build-plan Phase 2 shell, U1 (shell: Screen, sheets,
toasts, tabs, states), U3 (Today + check-in), U4 (Timeline & events), U5 (Tasks & polls)
U6 (Members & profile), U7 (More / Me), U2 (entry screens), U8 (Ask Chapt) and U9 (money) are built. Today runs on
`GET /api/home`; the full-screen check-in is `src/app/checkin.tsx`. Tasks runs on
`GET /api/tasks` + `GET /api/polls` (sheet: `GET /api/tasks/[id]`, names from
`GET /api/brothers`); a tick from Today or Tasks goes through `src/tasks/tick.ts`, so both
caches agree. Timeline runs on `GET /api/calendar` plus the dated tasks (sheet: per-event
attendance and minutes summary; writes: supply claims, excuses, action items, deadline
ticks through `src/tasks/tick.ts`). Members runs on `GET /api/brothers` (card:
`GET /api/brothers/[id]/profile`; writes: my photo via `/api/auth/avatar`, my name here via
`PATCH /api/brothers/[id]`). The tab bar is the website's phone bar
(`app/components/MobileTabBar.tsx`): Home · Timeline · [Create] · Members (the org's word,
only with the "members" workflow) · More (badge: my overdue tasks). Create
(`src/shell/CreateSheet.tsx`) has the web's tiles in the web's order and gates, each one
added once its form exists on the phone: so far the Open check-in hero (MANAGE_ATTENDANCE),
New event ("events" workflow + MANAGE_EVENTS), Reimbursement and Log excuse ("Which
meeting?", then the excuse pad; officers with MANAGE_ATTENDANCE also pick who it's for, and
theirs is approved as filed). Meetings (stage 2, More → Chapter): the digest line, on deck,
the book (filters All / No minutes / Under 70%), and a pushed meeting page with check-in
window controls, Take attendance (changed rows only), excuse review, Summarize, Edit and
Delete (preview + OFF THE TIMELINE stamp). Minutes read on the phone, written on the web
(the CRDT editor). Programming (stage 3, More → Programming): the status line (each count
jumps to its lane), the glance strip, and the board one lane at a time (Idea sticky notes,
Planning dashed cards, Confirmed inked, Done filed with stars) with type chips; the event sheet
has the stage ladder, and officers (MANAGE_EVENTS) move lanes through the same gates the server
enforces (FixStep collects owner / date / place, WrapUp collects stars / spend / notes, going
off the Timeline asks first), edit details, change the owner (person or role), attach and
remove links, add ideas and delete. More is the web sidebar (`src/more/model.ts` sidebarFor:
NAV_GROUPS order sorted by `navOrder`, NAV_WORKFLOW_MAP gates, NAV_DISPLAY words, minus
what the tab bar carries and what the phone hasn't built yet), then Yours (my own
records), as index cards: Meetings, Tasks, Docs, Programming, Service, Fundraisers, Treasury; Attendance (punch strip), Service
(punch card; write: log my hours, `POST/DELETE /api/service-events/[id]/participation/me`),
Dues (my tab, `GET /api/dues/members/[me]`), Excuses (resubmit), Docs and Fundraisers
(read), plus Leave this chapter (`POST /api/orgs/leave`) and Delete my account
(`/api/auth/account`). Entry (U2): the terms wall, the join screen (paste chip → invite
ticket → SENT), the awaiting letter (remembered on the phone, `src/entry/letter.ts`) that
opens as "Join approved" over the app (`src/entry/JoinApproved.tsx`), and the 426 sheet.
With no active term (`me.org.activeTerm === null`) excuse filing is replaced by a quiet
note (`src/entry/term.ts`). Ask Chapt (U8) is the `/ask` modal, opened from Today's
dashed ask bar: `POST /api/ai/chat` streamed with `expo/fetch` (`src/chat/stream.ts`),
the thread kept on the phone per chapter (`src/chat/thread.ts`), answers drawn natively
for figure / tally / breakdown / week / record / steps / reasons / quote / decline and as
the fallback rows for every other shape (`src/chat/shapes/`). Rows and tagged names open
`GET /api/ai/peek`; files attach through the paper-clip (`src/chat/files.ts`, XHR for
upload progress) and citations open `GET /api/ai/attachments/[id]/units/[ref]`. Only
self-service proposal cards (`perm.name === null`) confirm on the phone; officer cards
point to chaptos.com, where the approval is recorded. Sheets inside the modal are
`src/chat/LocalSheet.tsx`, because the app's SheetHost sits under the native modal. Money
(U9) lives in More: Dues is the receipt with a running balance, PAID till stamps on covered
charges and a once-a-session count-up (`src/money/countUp.ts`); Reimbursements lists my
requests (pencilled Pending, inked Reimbursed, rose Declined) and files new ones
(`POST /api/reimbursements`, then the receipt from the camera, a photo or a PDF,
`src/money/receipt.ts`), sent with the envelope moment; Treasury (everyone on "finance", as on the web;
requests waiting only for keepers: `seesTreasury`) is read-only: balance, the monthly line,
requests waiting, the latest ledger lines. Today's dues row opens the dues book. The
Motion Lab (`/lab`) is dev only.

**Testing Today against :3100:** `scripts/_today-seed.ts` (repo root) seeds two chapters
on the throwaway Postgres (:54331) and flips the check-in window: `open`, `closing`,
`close`, `cancel`, `excuse`, `unexcuse`. For Tasks: `unassign` / `reassign` (take
"Return the chapter keys" off you, so a tick is refused), `closepoll` / `openpoll`
("Pizza or tacos tonight?", so a vote is refused), and `tasks` (re-seed only tasks and
polls; ids change, so pull to refresh on the phone). For Timeline: `takeclaim` /
`freeclaim` (Leo takes "Ice" on Winter Formal, so claiming it is refused), `pendexcuse` /
`clearexcuse` (an excuse already pending on next week's meeting, so filing is refused:
409), `takeitem` / `giveitem` (hand my open action item from last week's minutes to Dev,
so ticking it is refused: 403). For Members: `zeros` / `standing` (a brand-new chapter
with nothing measured, and back), `officer` / `unofficer` (give me MANAGE_BROTHERS, so
every card shows standing). For More: `moredayone` / `more` (clear the service, docs,
fundraiser and dues seed so every index card says "Not started", and back). It refuses
any other database. For entry: `unterms` / `terms` (the terms wall), `stranger` (off both
rosters; prints a live and a revoked invite link to paste), `pending` (the awaiting
letter), `approve` (→ "Join approved"; only Oozma Kappa comes back), `reject`, and
`noterm` / `term`. For money: `treasurer` / `untreasurer` (a Treasurer role, so More →
Treasury shows) and `money` / `unmoney` (Spring dues paid in full for the PAID stamp, three
months of ledger lines, my reimbursed + declined requests and Leo's pending one). Run with
no command to put everything back. Join routes need the
phone's real sign-in (the forged cookie can't reach them).

Delete account can't be tested on :3100 either: `/api/auth/account` needs a real Supabase
session (the forged cookie gets 401), and it deletes the shared auth user. Don't leave
the seed chapter from :3100 unless you reseed after; it really deletes the Membership.

The photo upload can't be tested on :3100: `/api/auth/avatar` writes to the real Supabase
storage bucket and auth metadata (dev and prod share them), and the forged dev cookie has
no Supabase session, so it answers 401. Use the Lab's "Photo develops" for the motion.

## Run it

Needs **Node ≥ 22.13** (Expo 58). The repo's web app still runs on the machine default,
so switch only in this folder:

```bash
cd mobile
nvm use              # reads .nvmrc → 22
npm install
npx expo start       # scan the QR with Expo Go (everything U0 uses ships in Expo Go)
```

Before signing in: `mobile/.env.local` needs `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` (the web's public values), and Supabase's redirect
allowlist needs `chaptos://auth-callback` and `exp://**` (Expo Go's redirect is
`exp://<mac-ip>:8081/--/auth-callback`; the sign-in screen prints it in dev).

**API server.** Development talks to `http://<the Mac running Metro>:3100`, the
isolated dev server (worktree + throwaway Postgres), never `:3000`, which shares
the prod database. Override with `EXPO_PUBLIC_API_URL`. Preview and production
builds use `https://chaptos.com` (app.config.ts).

There's no dev client yet. Add `expo-dev-client` when a library outside Expo Go
arrives (push in Phase 5 at the latest).

Checks: `npx tsc --noEmit`, `npx expo-doctor`, and from the repo root
`npm run lint:modules` (mobile/ may import only `import type` from
`lib/api-types` and Zod schemas from `lib/validation`). The root `tsconfig.json` excludes
`mobile/`, so the web `tsc` never sees RN code.

## Layout

```
src/app/            routes (expo-router). index = entry dispatcher; sign-in, terms, join,
                    awaiting = entry screens; (tabs)/ = the member tabs; lab = Motion Lab
src/auth/           the ONLY sign-in code: supabase client (keychain session, PKCE),
                    dev-google.ts (Phase 2 browser OAuth; Phase 7 swaps it). Import ~/auth only
src/api/            api() client (bearer, x-org-slug, x-app-version, 401 refresh, 426 gate)
src/data/           TanStack Query client + AsyncStorage persister, query hooks
src/entry/          useEntry (signed out → terms → join/awaiting → ready), Update screen
src/state/          active org (remembered), update gate
src/theme/          palette.ts (day/night from app/paper-aesthetic.css), type.ts,
                    shadow.ts (hard offset shadows), PaperProvider (theme + motion + type)
src/motion/         motion.ts (EASE / DUR / SPRING tokens), haptics.ts
src/icons/          glyphs.ts is GENERATED from app/components/paper/PaperIcon.tsx
                    (npm run gen:icons); Icon.tsx renders them with react-native-svg
src/paper/          primitives: Button, Surface/Tile/Pill/Chip/Kicker/Avatar/Tape/StickyNote,
                    Ticket, IndexCard, LegalPad, ManilaFolder, Receipt, SheetSurface,
                    Highlighter, Stamp, TickingNumber
src/moments/        signature moments (CheckInTicket, TaskDone: stamp + confetti + fly-off,
                    Vote: pen-stroke X + result bars, ExcuseFile: fold + file, Pin: supply claim,
                    Develop: the photo print developing, Punch: service holes, Jar: fundraisers,
                    Letter: the sealed join letter + Join approved, Envelope: reimbursement SENT)
src/more/           U7: model (the web sidebar ported: groups, navOrder, gates, words; Yours; live
                    lines; my required-meeting marks; what Log excuse can excuse)
src/money/          U9: receipt (camera / photo / PDF → shrunk upload), countUp (first-view balance roll),
                    RequestSheet (request + add-receipt sheets, shared by Reimbursements and Create)
src/chat/           U8: stream (SSE over expo/fetch), thread (store + staging queue), intent
                    (guessed steps), files (attachments), Ledger, Answer + shapes/, Proposal,
                    Composer, Landing, PeekBody, LocalSheet
src/meetings/       stage 2: model (web Chapter rules: on deck/past, hasMinutes, preview, digest,
                    form defaults, wall time → instant in the org zone), EventForm, TakeAttendance,
                    CheckIn (OpenCheckInSheet + WindowPanel), ExcuseReview, DeleteSheet, MinutesText
src/programming/    stage 3: model (lib/programming gates, status line, stats, starter ideas), Card
                    (lane papers), EventSheet (ladder, facts, wrap-up, links), steps (OwnerSheet,
                    FixStep, WrapUp, OffTimeline, NewIdea, EditDetails, AttachLink)
src/members/        U6: MemberCard (calling card + my photo/name), photo.ts (pick → crop → shrink
                    → upload), model (standing ported from the web card: tracked / measured)
src/lab/            Motion Lab sections
src/shell/          U1 shell: Screen (header, org stamp, pull to refresh), Sheet + SheetHost,
                    toast, TabBar (the web's phone bar) + CreateSheet, TabStack, SwipeRow, and the
                    loading/empty/error/offline states
src/tasks/          U5: Deck (On you), Board (Overdue / Upcoming), Ballot (sealed envelope),
                    TaskSheet, bits (check-tick, strike, crowd strip), model (pure rules),
                    tick.ts / vote.ts (the shared optimistic writes)
src/timeline/       U4: Spine (month heads, rows, Today marker, Earlier), EventSheet (+ the
                    Add to Calendar sheet), Details (supply claims), Attendance (excuses),
                    Minutes (action items), model (pure rules)
src/today/          U3 Today pieces: CheckInBand, UpNext ticket + countdown, Plate, AnnouncementNote,
                    live.ts (window state between polls), time.ts (lenient event times)
src/ui/             T (type-scale text), Segmented, Switch (paper switch)
```

## Rules for screens

- No literal colours: `const { c } = useTheme()`. No raw `<Text>`: use `<T v="body">`.
- Animate with `useMotion()`: `m.timing(ms, ease)`, `m.spring(name)`, `m.t(ms)` for
  timers. It applies Lab slow-mo and pins `reduceMotion: Never`, because every
  animation designs its own reduced version: branch on `m.reduced`.
- Transform and opacity only on anything that runs per frame.
- Haptics through `haptics.*` only, one per meaningful action.
- New signature moments go in `src/moments/` and get a Lab section.
- Server data goes through `api()` + TanStack Query, keyed by the active org slug.
- Every screen is a `<Screen>`; sheets are `<Sheet open onClose>`; feedback is `toast.*`.
  Non-happy states come from `~/shell/states` (`QueryState` picks skeleton / error /
  empty / last-known data with a StaleNote). Never a spinner inside a card.
- Import only `import type` from `@/lib/api-types`; request bodies come from
  `@/lib/validation` (`z.input<typeof schema>`, or `.safeParse` for inline errors).
