# Mobile ↔ web phone parity audit

Phase 0 output for `docs/mobile-web-parity-plan.md`. Updated 2026-11-19.

## Reference captures

- `scripts/_parity-capture.ts` → `_design/parity/web/<page>/<org>-<viewer>-<theme>-<scene>.png` (PNGs gitignored; `index.json` lists the viewers).
- 32 pages × 2 orgs (busy `ok-today`, day-one `dl-today`) × 2 viewers (admin, member) × 2 themes (day/ivory, night/dusk). Settings captures are admin only (15 sections).
- Dashboard scenes: `full` (390×3200), `fold`, `create`, `more`, and `sheet-treasury|members|activity|docs`.
- Every miss is expected:
  - The day-one org has Treasury off, so it has no Treasury tabs.
  - Docs is off in both orgs (and hidden by default on the dashboard), so there is no docs glance.
- The runner refuses anything but :3100 on the throwaway DB, and aborts any non-GET `/api` call.
- Re-run with `ONLY= VIEWER= THEME= ORG=` filters, e.g. `ONLY=dashboard VIEWER=admin THEME=day ORG=busy npx tsx --env-file=.env.local scripts/_parity-capture.ts`.

## Token audit

`mobile/src/theme/palette.ts` vs `app/paper-aesthetic.css`:
- Every token matches except the day scrim, which was `rgba(38,33,27,0.36)` and is now `0.28` (fixed).
- Type faces map one to one: the display face ↔ Bricolage, Inter, IBM Plex Mono.

## App screenshots: the web preview (works)

- The spike's boot crash was our own `mobile/src/auth/crypto-shim.ts`: it assigned the getter-only `window.crypto`. It's now guarded.
- `cd mobile && npm run web:preview` exports the app for the web with `EXPO_PUBLIC_DEV_WEB=1` and serves it on :8799, with `/api` proxied to :3100.
- `scripts/_app-shot.ts /route --as <id>` screenshots it at 390 wide, signed in through the dev impersonation cookie, into `_design/parity/app/`.
- This is not iOS rendering, and it shows no haptics. Device screenshots stay the final check for feel.

## Per screen

Legend: ✅ matches the web phone · 🟡 built, but from the paper mocks rather than the web phone · ⬜ not in the app · ⭐ app-only keep.

| Web page | App route | Status | Gaps against the web phone |
|---|---|---|---|
| Dashboard | `(tabs)/today` (Home) | ✅ Phase 2 | See "Dashboard" below. |
| Timeline | `(tabs)/timeline` | 🟡 | Uses the spine, not the web's month ledger. Event sheet and day-one copy need diffing in Phase 3. |
| Members | `(tabs)/members` | 🟡 | Uses the register list and Member Spotlight card. Web has the join-request band, filters, and By role. |
| Chapter (meetings) | `more/meetings`, `more/meeting/[id]` | 🟡 | Web has the ledger with date stubs, On deck, and the minutes editor (phone sheet). |
| Tasks | `more/tasks` | ✅ | Phase 6: the web's Overdue/Upcoming list, spotlight, ballot, task/poll sheets with the who-picker. |
| Docs | `more/docs` | ✅ | Phase 8a: brief and meta line, toolbar, pinned shelf, manila sections, every doc/folder write, day one. See "Docs (Phase 8a)" below. |
| Media | `more/media` | ✅ | Phase 8b: brief, Add post / Ask, measures that jump, lanes, month, detail with in-place dates, form, delete, day one. See "Media (Phase 8b)" below. |
| Programming | `more/programming` | ✅ | Phase 8c: brief with tappable clauses, measures, Board/Calendar, the four gated lanes, timeline strip, the event sheet in panel order, fix step, wrap-up, day one. See "Programming (Phase 8c)" below. |
| Service | `more/service` | ✅ | Phase 8d: brief and digest, measures, Events/Members, event cards opening onto the sign-in sheet, punch cards, the wide forms, Log hours, Log my hours with the punch, day one. See "Service (Phase 8d)" below. |
| Parties | `more/parties` | ✅ | Phase 8e: the house ledger at phone width, the one task, takings and the strip, drawers in place, the web's forms and two-step wrap-up with the roll, the door moment. See "Parties (Phase 8e)" below. |
| Fundraisers | `more/fundraisers` | 🟡 | Web has jars over the ledger and the wrap-up total. |
| Treasury (Overview, Transactions, Dues, Reports, Reimbursements) | `more/treasury` | ✅ | Phase 7: the five tabs, the open-books gate and member lock, every sheet, Dues with its drawer, Hand out and charge editor. See "Treasury (Phase 7)" below. |
| Settings (15 sections) | — | ⬜ | Phase 9. |
| Sidebar profile menu | More → You block, toolbar stamp | ✅ Phase 1 | — |
| Billing | — | ⬜ by decision | Not in the app. |
| Check-in | `app/checkin.tsx` | ⭐ | Opened from the Home live band. |
| Yours: Attendance, Excuses, Dues, Reimbursements | `more/attendance`, `excuses`, `dues`, `reimbursements` | ⭐ | A second grid in More. |

The 🟡 rows get a line-by-line diff (sections, copy, writes) when their phase starts, against the captures above. None has been changed yet.

## Dashboard (Phase 2), what landed

Shared rules live in `lib/dashboard/`. The web page and the app both run them:

| Module | What it holds | Used by the web page | Used by the app |
|---|---|---|---|
| `standing.ts` | Standing, health, `rosterData`, `standingCounts` / `reasonFor` / `ruleLine` | yes (re-exported from `app/data.ts` and `MembersCard`) | yes |
| `week.ts` | Week digest, agenda, digest key, `/api/ai/digest` body | yes | yes |
| `plate.ts` | `derivePlate`, `taskAssigneeLabel` | yes | yes |
| `numbers.ts` | Headline-number facts and where a tap goes | yes (the page maps facts to `Measure`) | yes |
| `up-next.ts` | Up next countdown, facts, agenda, `whenLabel` | yes (via `lib/up-next`) | yes |
| `phone.ts` | Phone order (`phoneDash`) | yes (DashGrid's `--po` and lone tile) | yes |

`GET /api/dashboard` (`dashboard-service.ts`) returns the dashboard's inputs in one round trip. It has a wire type, a route-map line, a contract entry and a smoke probe.

App Home, in the web's phone order:

1. Toolbar: Dashboard, the org (its stamp switches orgs), and your avatar (My standing).
2. Briefing: date pill, week of, greeting with the highlighter and wave, digest line. No action chips: the web hides `.brief-actions` on phones (`phone-dash.css`). No health dial: hidden on phones too.
3. Billing alert (admin only, self-gating on `/me`). The web's words, no button: billing stays on chaptos.com (store payment rules).
4. Live check-in band (opens the full-screen check-in), with the officer row under it for MANAGE_ATTENDANCE: Fix a mark / Take attendance, End check-in… (did-it-happen sheet), Reopen, and after a cancel Undo (10 s) and Open the right event. A member never sees a cancelled window.
5. Calendar invite, while the feed is on (`?summary=1`, `CalendarFeedLive`) and this phone hasn't added it or said Not now.
6. Pinned note (top spot): `mobile/src/dash/PinnedNote.tsx`.
7. Numbers row. A tap opens the page, or the web's KPI drawer as a sheet (`mobile/src/dash/KpiSheet.tsx`: attendance, dues, GPA, service, deadlines, custom metric). Deadlines tick in the sheet; Log attendance, Pay, +1h, add/edit/delete go to the owning page.
8. Cards: Up next, On your plate, This week, then the opt-in cards in the org's order (`mobile/src/dash/TrackCards.tsx`: Money, Dues, Service hours, Grades, Media, custom metrics).
9. Members / Activity / Treasury / Docs glance tiles and their sheets.
10. Footer.

Verified 2026-11-19 on :3100:
- Web: the page now renders its numbers from `numberFacts` and DashGrid orders phones with `phoneDash`. Dashboard captures before/after (both orgs, both viewers, day) are pixel-identical, except one frame of the day-one Treasury pencil animation.
- App (web preview, busy admin, with a layout carrying every opt-in card and three numbers): every card and the numbers row render and read as the web capture of the same layout. Fixed from that comparison: "Open →" on card headers, the Grades at-risk label, the Money ledger's rose rule.
- Not exercised by the seed: the billing alert, the officer row, the calendar invite (feed off). Device check still to do.

## Timeline (Phase 3), what landed

The web's rules moved to a shared module, `lib/timeline/rows.ts`: rows (events + tasks + IG posts), layers and counts, month groups, past/upcoming sections, overdue, relative dates and the digest. The web Timeline renders from it, and its captures before/after are pixel-identical (busy, admin + member, fold + full). Time-zone-dependent comparisons are passed in, because `lib/event-time` uses Temporal.

App Timeline (`mobile/src/app/(tabs)/timeline/index.tsx`, `mobile/src/timeline/*`), in the web's phone order: brief (date pill, week of, "The weeks ahead.", digest), Add to my calendar / Add Deadline / Add Event, the layer filter, Legend + the Timeline/Calendar switch, the excuse review band, Earlier (with overdue), the Today marker, month groups with folding, and "Nothing scheduled past …". Also: the calendar view (month grid + day sheet), day one (three pictures, gated buttons, the member line), event detail (source links, media posts, take/log attendance, Edit/Delete), the event form, the deadline form, and the delete slip. Delete tears the row off and holds Undo for 6 s; DELETE goes out only when the toast expires.

Deviations (deliberate):
- Add Deadline / Add Event are hidden from members who lack MANAGE_TASKS / MANAGE_EVENTS. The web shows them; "only real capabilities" wins.
- Add Deadline opens the task form in place instead of routing to Tasks.
- "Managed from its source list" shows only on folded rows (tasks, posts).
- The web's inline "Add details" editor isn't ported. Excuse review is a sheet (with Approve all), not the inline panel.
- IG posts are read only when the Instagram workflow is on.

Verified 2026-11-19 on :3100 (busy admin, day): fold and full against `web/timeline/busy-admin-day-*`. Fixed from that comparison: the control fonts were about 11% large, so the add buttons and Legend/switch rows wrapped where the web's don't, and the filter bar bled off the gutter.

## Members (Phase 4), what landed

The web's roster rules moved to a shared module, `lib/dashboard/roster.ts`: `roleTitle`, `statusCounts`, `rosterKpis`, `rosterSummary`, `standingHint`, `filterRoster`, `rosterCsv`. `app/data.ts` re-exports `roleTitle` from it. The web Members page renders from it, and its captures before/after are pixel-identical (busy, admin + member, fold + full).

Wire (additive): `JoinRequestRow` / `JoinSeatCheck` / `JoinRequestPage` / `JoinRequestApproved` in `lib/api-types/roster.ts`. Route-map lines for `GET /api/join-requests`, `POST …/[id]/approve` and `POST …/[id]/reject`, plus contract entries and smoke probes (nonexistent ids, so they only ever 404). The `PATCH /api/brothers/[id]` note now covers officer edits. The bearer static check passes on all 101 routes.

App Members (`mobile/src/app/(tabs)/members/index.tsx`, `mobile/src/members/{Roster,JoinRequests,PayDues}.tsx`):
- Brief: "<org> · <Member> Roster", "The Members.", the summary sentence.
- Export (the CSV through the share sheet) and Ask who's slipping.
- The join-requests band (MANAGE_BROTHERS) with Review & approve (role picker, roles ranked below yours) and Decline, in the web's copy, including the 409 and 402 outcomes. Every decision refreshes `/me`.
- The Members tab badge, from `org.pendingJoinRequestCount`.
- Measure tiles (a tap filters or sorts the roster and scrolls to it), the Standing card (band bar, legend chips, faces), and the Roster card. Rows show the excuse clip (MANAGE_ATTENDANCE), dues with "Nd late" from `GET /api/dues`, Pay (MANAGE_TREASURY) and the status tag (NOT YET until something is measured); the foot repeats the counts.
- Day one (≤ 1 member): "It's just you so far…" and How joining works.

Member card: officers with MANAGE_BROTHERS edit GPA and service hours one value at a time, with Undo. On your own card the Attendance tile opens Yours > Attendance. Peers see "Standing, GPA and dues are only visible to officers and to X."

Deviations (deliberate):
- Pay records the payment in one sheet (amount, method). The web opens a pre-filled transaction form as a second step; the line posted is the same (income · Dues · today · "Dues payment — X" · brotherId).
- The band shows the first page of requests and says how many more wait on the web. There is no search or invite filter.
- Roles, dues charges/waivers and excuses on the card stay on the web.

Verified 2026-11-19 on :3100 (day):
- Busy admin full, busy member, day-one org: compared with `web/members/*`. Fixed from that comparison: the dues/status columns were too wide (names wrapped), and the lateness only showed once dues had loaded (`_app-shot` gained `--settle`).
- Card edit end to end: PATCH `{gpa:3.6}`, then Undo PATCH `{gpa:3.55}`; the card updated live.
- Not exercised by the seed: the join band (no pending requests). It typechecks against the contract types; approve/reject still need a device check with a real request.

## Chapter / Meetings (Phase 5), what landed

Built 2026-11-19, uncommitted.

- **Shared rules:** `lib/meetings/book.ts` (on SHARED, together with `lib/agenda-template`, `lib/meeting-summary` and `lib/collaboration/notes-protocol`).
  - Covers on deck/past split, book tabs, ledger row, digest runs, On deck roll and head, excuse line, attLabel, meetingProgress, Summary badge.
  - Time-zone inputs are injected: the web passes Temporal (`compareEvents`/`isEventOver`/`startTimeOf`), the app passes `~/meetings/time` (ports in `~/dash/UpNextCard`).
  - The web Chapter page renders from it: all 16 chapter captures are pixel-IDENTICAL before vs after.
  - The app's `meetings/model.ts` lost its own split (it used start + 90 min, which disagreed with the web), its preview and its digest.
- **Wire (additive):**
  - `MinutesSaved` is the response of `PATCH /api/calendar/[id]`, with a route-map line and contract entry `minutesSaved`. The existing smoke probe covers the path.
  - Round trip verified on :3100: 200 with `{id, description, notesUpdatedAt, notesContentRevision, notesInitialized}`.
- **Meetings list:**
  - Briefing ("The *minutes*." + digest / day one "Every meeting, *written down*."), Add meeting, Ask about past meetings.
  - On deck card: the four roll states, the excuses-waiting line that opens the review, check-in / Take or Edit attendance, Start / Open minutes, Edit.
  - Past meetings ledger with All / No minutes / Under 70% tabs; day one with the web's three pictures and captions.
- **Meeting view = the phone minutes sheet:**
  - Ticket with clock bar, then tabs Minutes / Summary (badge, `!` when stale) / Who came (present count).
  - Minutes: legal pad with sections numbered 01, 02, …
  - Summary: card with tickable action items and "was due" dates.
  - Who came: name-chip groups. App keeps: the member's own excuse line (`AttendanceBlock mineOnly`) and the officer check-in desk.
  - Dock as on the web; ⋯ sheet with Share as text / Edit / Delete.
- **Deviations:**
  - Templates is web-only.
  - Summarize shows for everyone, as on the web (the server has no permission check on it).
  - Shared (Yjs) minutes are written only on the web. The app writes unshared minutes: a textarea autosaved 600ms after typing stops, and on leaving; a 409 drops back to read.
  - Download .md and Print are folded into Share as text.
- **Not exercised in the UI:** the app Write path. ok-today has collaborative notes on, so every meeting reads as shared there.

## Tasks (Phase 6), what landed

Built 2026-11-19.

- **Shared rules:** `lib/tasks/list.ts` (SHARED now whitelists `@/lib/tasks/`, replacing `@/lib/tasks/urgency`).
  - Dates and words, who may tick or vote (`isMine` / `canVote` / `canComplete`), the piles (`taskPiles`, `DONE_SHOWN`), the poll shelf, the brief line.
  - Vote cards and ballot words (`voteCardOf`, `ballotWho`, `ballotSub`, `pendingLine`).
  - Spotlight (`spotHead`, `deskCal`, `partsOf`, `historyLines`) and sheet checks (`taskQuickDays`, `pollQuickDays`, `inTermOf`, `validateTask`, `validatePoll`, `whoSub`, `reachOf`).
  - "Today" is injected (a `Date` at local midnight), so nothing in it reads the clock.
  - The web Tasks page, spotlight and sheets render from it. Pixdiff was IDENTICAL on every capture except three frames whose differences are not from code: busy-member-fold and dayone-admin-full (the splash still fading in the "before" frame) and busy-member-spot-each (scrollbar strip only).
- **Wire (additive):** route-map lines for `POST /api/polls` (201), `PATCH /api/polls/[id]`, `DELETE /api/polls/[id]` (204). Contract entries `pollCreated` / `pollUpdate`, and smoke probes. The bearer static test passes on all 105 routes.
- **List:**
  - Head (TASKS + term, count headline, brief line, New poll / New task by permission), then Everyone’s / Just mine.
  - Overdue pile or "Nothing overdue.", then Upcoming ("Nothing coming up{ for you}."), then N done this term folding open.
  - Then Votes with the vote cards, and day one with the two pictured piles and one button.
  - A row ticks from its circle or a left swipe; the DONE stamp + flight plays from the row, then `~/tasks/tick` writes. The deck and board are gone.
- **Spotlight:** chip + edit/delete + close, calendar page, title, the when sentence, Mark done / Mark my part done / Reopen or the lock line. Then Start/Due bookends, the desk calendar and the count, the note or Add a note, Everyone’s part (ring + faces), For / From, and History folded.
- **Ballot:** Ballot / Final results kicker, sealed ballot with Peek for poll managers, result bars with your vote / leading / won, Decided stamp. Then Not voted yet, Close poll with the web's confirm, Reopen, edit and delete.
- **Sheets:**
  - Task: title; Day chips (outside-term days off) + Pick a date + No date; Time; who-picker with People (faces, search past 8, tray) / Roles (holders, reach) / Everyone (each/any switch, crowd strip).
  - Also on the task sheet: the note, the list-row preview, and Delete / Cancel / Add task·Save.
  - Poll: question, 2–10 choices (locked once votes are in), Who votes (everyone; an older targeted poll keeps its audience), closes chips, card preview, Open the vote.
  - The delete confirms use the web's words.
- **Verified on :3100** (after `/api/auth/me` returned ok-today):
  - Spotlight Mark done → Reopen on task 7; the row was restored byte-identical.
  - Create (Everyone · any) → edit (note, No date) → delete a task.
  - Create a poll → member 12 votes → close → reopen → delete.
  - Test ActivityLog / OperationalEvent rows were removed and the sequences reset.
- **Deviations:**
  - Time: the web uses a native `<input type="time">`; the app shows the same two chips (Any time / the time) and opens the meetings Clock (15-minute steps) under them.
  - The spotlight's tint starts under the sheet's grab bar instead of at the very top.
  - Ticking from the spotlight stamps for ~820ms before writing, longer than the web's 700ms.
  - A refused row tick has no return motion.
- **Not exercised:** the swipe gesture itself (the preview has no touch pan; the circle and spotlight share its write path) and the live bearer smoke (it needs a Supabase token, as in earlier phases).
- **Kept for the Lab:** `tasks/Deck.tsx` and `tasks/Ballot.tsx` stay only because `lab/tasks.tsx` demos them. `Board.tsx` and `TaskSheet.tsx` are deleted.

## Treasury (Phase 7), what landed

Built 2026-11-19.

- **Shared rules** (SHARED now whitelists `@/lib/treasury/`, `@/lib/treasury-term`, `@/lib/treasury-balance`, `@/lib/dues-ledger`, `@/lib/dues-targets`):
  - `lib/treasury/ledger.ts`: money and date words, the category catalog (`catalogOf`, which replaced the logic in `useTransactionCategories`), terms (`termsOf` / `termOnScreen`), the term's books (`booksOf` / `booksState`), the log (`tabRows` / `withRunning` / `tabTotal` / `categoryOptions`), breakdown and chart inputs, the statement, Coming up, the digest, the reimbursement queue, and the opening-balance field.
  - `lib/treasury/chart.ts`: the balance model and its marks (step line, projection, flags, scrub), the breakdown lede, and `liftHex`.
  - `lib/treasury/dues.ts`: standing words and order, people and rows (term or one charge), the hero, the lanes and list order, the Overview card (`quickCardOf`), the Hand out sheet's dates/hint/split, the drawer's pay methods and status, and `chargeChanges`.
  - The web treasury page, `TreasuryOpenBooks`, `PaperTreasury` and the Dues tab render from these. Pixdiff before/after was IDENTICAL on every treasury and treasury-dues capture, including the new log/reimb/approve/decline/drawer/handout/edit-charge scenes. One frame (the reimbursement modal) differed on the first run from its open animation and was IDENTICAL on rerun.
  - `lib/dues-targets.ts` gained two non-null assertions (`shares[i]!`, `spec.rates[0]!`) so it compiles under the app's `noUncheckedIndexedAccess`. No runtime change.
- **Wire (additive):** `SemesterRow` and `TreasurySettings` in `lib/api-types/treasury.ts`. Route-map lines for `PATCH /api/treasury/settings`, `GET /api/transactions/export` (text/csv) and `GET /api/semesters`, plus contract entries `treasurySettings` / `semesters` and smoke probes. The dues writes were already mapped. The bearer static test passes on all 108 routes.
- **Page** (`more/treasury.tsx`, in the web phone's order):
  - Brief: date pill, TREASURY · term, "The ledger.", the digest (or the No entries chip). Then Log money (MANAGE_TREASURY), Request reimbursement, and Ask about the books (opens Ask Chapt with "How are the books looking this term?").
  - Gates: a member on unopened books gets "The books aren't open yet." plus their own requests. A treasurer gets "Let’s open the books." (`PATCH /api/treasury/settings`).
  - Tabs: Overview · Transactions · Dues (only when dues are tracked; NEW / owing badge) · Reimbursements (pending badge) · Reports (last, as the web's `order: 1`). Then the term pills, Export CSV (treasury) and Add Party Event.
  - Overview: first-entry banner, balance card (2W/1M/Term, scrubbable step line, money in vs out), breakdown ring (In/Out, rows jump to the filtered log; "Categories are yours to name · Edit" opens the web's Money categories settings), the Dues card, Coming up, "{term} so far", Recent entries, At the door tickets.
  - Transaction Log: All/Income/Expense, category filter, search, total, and the ruled table (scrolls sideways). Row actions: Mark Paid / Edit / Delete (treasury) and "see in Dues".
  - Reports: the statement and the five-cell grid.
  - Reimbursements: the queue with receipt view/attach, inline approve (category + balance after, Approve & post) and decline (note, Confirm decline), and Show resolved.
- **Sheets:** Add/Edit Transaction (Type, Category, Amount ($), Date, the Scheduled switch, Description, Payment Method, Period with "(current)", Linked Events). Add/Edit Party Event (Event Name, Date, Door Revenue ($), Attendance, Notes). Delete Transaction / Delete Party Event confirms with the web's words.
- **Dues tab:**
  - Day one, the three ways. Your tab for members. Hero (money bar, legend filter, 13-a-row punch strip, Hand out / Record a payment). Charges stubs (scope, ⋯ edit). The wall (search, Standing/Role, Tags/List, filter chips, lanes with Bill <role>).
  - Member drawer (Record payment, Waive some with Undo, Bill <name>, line by line, Take off).
  - Hand out sheet: Everyone + leave out / By role rates / Pick people; name suggestions, duplicate warning, each/split; due choices; note. The footer total comes from `resolveTargets`.
  - Charge editor: name, due, note, take back. Carry-over is refused.
- **Verified on :3100** (after `/api/auth/me` returned ok-today; a full data-only dump of figurints_dev was taken first and restored afterwards, then checked row by row):
  - Add → edit → delete a transaction.
  - Add → edit → delete a party.
  - Approve a reimbursement with a category (minted transaction 7) and decline one with a note.
  - Record a cash payment for Cyrus Pak; waive $10 → Undo.
  - Hand out "Chapter shirt" to everyone → Undo.
  - Edit a charge's note. Take back on a charge with payments shows the server's 409 copy verbatim.
  - Read-only text matches the web word for word for admin 2, member 12, day-one admin 14 (open-books gate) and day-one member 16 (lock + requests).
  - The four reimbursements I seeded for the queue were deleted and `Reimbursement_id_seq` reset (next id 1).
- **Seed note (not app code):** the seed's charge ledger bills all 13 members, but `Membership.duesOwed` is set for only 3. So the server refuses a payment for anyone else ("more than … owes ($0.00)"), on the web as well. This is also why the digest says "3 members still owe $420".
- **Deviations:**
  - Dates use the app's day stepper (as on Tasks and Meetings), not a native date input.
  - Each `<select>` is a row of chips (Type, Category, Payment Method, Period, Linked Events, the log's category filter).
  - Export CSV hands the CSV text to the share sheet instead of downloading a file.
  - "Record a payment" sets the filter and shows the toast, but doesn't scroll to the wall.
  - The money bar's diagonal stripes are drawn with skewed bars.
  - Sheet subtitles sit above the title (the app's Sheet kicker).
- **Not exercised:** the open-books write itself (only the gate was rendered), Mark Paid, receipt attach, Take off a line, the export share sheet, and the live bearer smoke (it needs a Supabase token, as in earlier phases).
- **Kept:** the app-only Dues and Reimbursements pages in Yours, sharing `data/money.ts` and `money/RequestSheet.tsx`. `money/TxForm.tsx` stays for the Create sheet's Log expense / Log revenue.

## Docs (Phase 8a), what landed

Built 2026-11-20.

- **Shared rules:** `lib/docs/library.ts` (SHARED now whitelists `@/lib/docs/`).
  - Kinds and words: `kindOf`, `hostOf`, `KIND_LABEL`, `bucketOf`, `fmtDate`, the folder hues.
  - The library: `FILTERS` / `SORTS`, `newestFirstOf`, `sortDocs`, `pinnedShelf`, `kindCounts`, `filterDocs`, `groupByFolder`, `sortFolders`, `folderCounts` / `folderTotals` / `unfiledCount`, `moveTargets`, `pageState`, `shownUnder`.
  - The brief: `relDays`, `glanceOf`, `digestLine`. Menus and copy: `docMenu`, `folderMenu`, `folderDeleteMessage`, `docDeleteMessage`, `landsIn`, `sectionNone`, `docCountLabel`, and every toast in `SAY`.
  - "Now" is injected (`now: Date`); nothing reads the clock.
  - The web Docs page, DocMenu, FolderSection, FolderPicker and MoveDocDialog render from it. `lib.tsx` re-exports the kind helpers.
  - Pixdiff before/after was IDENTICAL on all 74 docs frames, including the new scenes (fold, add, folder, menu, pin-menu, edit, move, delete, folder-menu, folder-delete, rename, filter, filter-none, nomatch, collapsed).
  - The first "before" run caught 6 frames while :3100 was still compiling ("Couldn't load the library"). Those were re-taken with the old code and are IDENTICAL. One modal frame (day-one night add) differed from its open animation and was IDENTICAL on rerun.
- **Wire (additive):**
  - `DocSaved` (`Omit<Doc, "createdByName">`, what the writes return).
  - Route-map lines for POST `/api/docs` (201), PATCH/DELETE `/api/docs/[id]`, PATCH `/api/docs/[id]/move`, PATCH `/api/docs/[id]/pin`, POST `/api/docs/refresh-metadata`, POST `/api/docs/folders` (201), PATCH/DELETE `/api/docs/folders/[id]` and PATCH `/api/docs/folders/[id]/pin`.
  - Contract entries `docCreated` / `docUpdated` / `docPinned` / `docRefreshed` / `docMoved` / `docFolderCreated` / `docFolderRenamed` / `docFolderPinned`, plus smoke probes.
  - The bearer static test passes on all 118 routes (figurints_t6).
- **Page** (`more/docs.tsx`, in the web phone's order):
  - Brief: REFERENCE LIBRARY, "The chapter’s reading room.", ✦ DIGEST line, then the meta line (references · kinds · contributors · newest).
  - Actions: Add doc and New folder (MANAGE_DOCS), then Ask where a doc lives (opens Ask Chapt with "Where do we keep ").
  - Toolbar: search, All/Docs/Sheets/Forms/Links with counts, Sort (Manual/Newest/Name/Kind, remembered), "N of M".
  - Pinned shelf: the taped index cards, with "stays put while you filter".
  - Sections: manila tabs in section order with the hue shadow, then dashed Unfiled. Each folds onto the striped lip (remembered); a search or filter holds them open. The none-match lines, and "Add to {folder}…" for officers.
  - Nothing matches (Clear filters), Couldn't load the library, and day one (three pictures, Add your first doc / the member line).
- **Sheets:**
  - The ⋯ menus as sheets with the web's items: Copy link for everyone; Pin to top/Unpin, Edit, Move to folder…, Refresh preview, Delete for officers. Folder: Pin to top/Unpin, Rename, Delete.
  - Add doc / Edit doc: Title *, URL *, Description. Add also has File in (Unfiled, the folders in their hues with counts, inline New folder) and the "Lands in …" line.
  - New folder / Rename folder. Move "…": Library (root), folders by name, Here, New folder → Create & move, Done.
  - The two delete confirms, with the web's words.
- **Verified on :3100** (after `/api/auth/me` returned ok-today; a data-only dump of figurints_dev was taken first and restored in one transaction afterwards; a fresh dump differed only in the `\restrict` tokens):
  - Add a doc filed in Formal, then edit it.
  - Pin it, then Unpin from the shelf card. Copy link. Refresh preview.
  - Move it to Rush, then New folder → Create & move.
  - New folder → rename → pin → unpin → delete (empty).
  - Delete a folder holding a doc (confirm: "Its 1 doc returns to Unfiled…"), then delete the doc.
  - Add a doc via the picker's inline New folder ("Lands in Inline F, its first doc.").
  - Search with no match, the Forms filter (none-match lines), and folding.
  - Gated off: with `docs` removed from ok-today's `enabledWorkflows`, More shows no Docs tile. The restore put it back.
  - Read-only text matches the web word for word for admin 2, member 12, day-one admin 14 and day-one member 16, and for the filtered state.
- **Seed drift:** Docs is ON in both ok-today and dl-today now. This file's Phase 0 note said off. The gated-off state was tested by switching it off inside the restore window.
- **Deviations:**
  - The web's drag to file and reorder is an HTML5 desktop drag that doesn't run on a phone. Filing is Move to folder…, which is what the web phone offers.
  - The ⋯ popovers are sheets. Sort is a pill that opens a sheet of the four sorts, with ✓ on the current one, instead of a `<select>`.
  - Sort and fold state persist in AsyncStorage under the web's localStorage keys.
  - A deep link to Docs with the workflow off goes back to More. On the web, the sidebar hides the page but its URL still renders.
  - Sheet field labels are the app's caps labels. The primary button is the app's lilac Button.
- **Not exercised:** the deep-link redirect (the preview serves Home for deep URLs), a load error, favicons (the seed has none), and the live bearer smoke (it needs a Supabase token, as in earlier phases).
- **Removed:** the old mock-styled Docs screen (search-first, horizontal shelf, butter folders). Nothing in `lab/` used it.

## Media (Phase 8b), what landed

Built 2026-11-20.

- **Shared rules:** `lib/media/calendar.ts` (SHARED now whitelists `@/lib/media/`).
  - The planner arithmetic moved here, safe under noUncheckedIndexedAccess. `todayIn(tz, now)` takes the clock as an argument.
    - `lib/instagram-planner.ts` is now a re-export, and its `instagramToday` keeps the `now = new Date()` default for the server and the web.
    - `INSTAGRAM_TYPES` lives here; `lib/validation/instagram` re-exports it.
  - Page rules and words:
    - Formats: `formatKey`, `FORMAT_HINTS`.
    - Lanes: `LANES`, `IDEAS`, `ASK_NEXT`, `filterPosts`, `lanePosts`, `postCount`, `duePill`, `rowDate`, `timingLine`.
    - The brief: `digestParts` (as the web's own text runs, so its DOM didn't change), `kickerChip`, `metrics`, `metricTarget` (jump to a lane, open the month, or the empty line).
    - The month: `DOW`, `moveMonth`, `monthGrid`, `dayKey`, `quietNote`, `markerLabel`.
    - The form: `promotable`, `newDraft`, `eventOption`.
    - Words: every toast in `SAY`, and `deleteMessage`.
  - The web page, card, detail, form and month render from it.
  - Pixdiff before/after was IDENTICAL on all 42 media frames: full, fold, add, detail, detail-posted, edit, delete, month, nomatch and idea, for busy and day one, admin and member, day and night.
  - Two passes needed fixes:
    - Joining the digest into one string shifted WebKit's shaping by a few pixels on 17 frames. Returning the original text runs made them identical.
    - Three frames differed only by animation timing (a modal opening, two scroll frames) and were IDENTICAL on rerun.
  - The edit and delete scenes go through the detail rail, because the phone CSS hides the row actions (`.igp-row .igp-acts{display:none}`).
- **Wire:** nothing new. GET/POST `/api/instagram` and PATCH/DELETE `/api/instagram/[id]` already had route-map lines, contract entries and smoke probes. The bearer static test passes (118 routes) and the planner tests pass (9).
- **Page** (`more/media.tsx`, in the web phone's order):
  - Brief: the "FRI · NOV 20" chip, CONTENT CALENDAR (· @handle), "What’s going out." on the rose mark. Then ✦ DIGEST with the bold overdue clause, or the plain line on day one.
  - Actions: Add post (MANAGE_INSTAGRAM), and the full-width Ask what to post next ⌘K (Ask Chapt with the web's question).
  - Measures: Queued / Overdue / This week / Cadence. A tap clears the search and scrolls to its lane, or toasts the web's "Nothing is overdue" / "The queue is clear" / "Nothing due this week". Cadence opens this month.
  - Tools: Search posts…, and Lanes | Month with their icons.
  - Lanes: Overdue / This week / Upcoming / Posted, as the web sorts them. Rows show the mono caps format chip, the date, the dashed event chip and the due pill.
  - Month: the web phone's grid, with one pill per post (dashed once posted, tap opens it), today inked, quiet stretches of 5+ days hatched, and "Longest quiet stretch this month". Linked events and the legend stay off the phone, as on the web.
  - No posts match “…” (Clear search), and the linked-events error line.
  - Day one: the three snapshots, "No posts on the calendar.", the web's paragraph. Officers get Plan the first post and "A first week of posts" with the four ideas; members get "Ask an officer to plan the first post."
  - A new post flashes and is scrolled to (or its month opens).
- **Sheets:**
  - Post detail:
    - The taped stage (POSTED is stamped only once the post is up), the format chip, title, due pill, then Timing, Posted on, Scheduled for / Due date, Format · hint, and Promoting (opens the Timeline's event sheet).
    - Officers tap a date to change it: the day strip opens and the pick saves at once, as the web's date input does ("Moved to Tue, Nov 24" / "Posting date changed").
    - Footer: Mark posted, Edit, and the trash button. Members see the detail without a footer.
  - Add post / Edit post (kicker INSTAGRAM):
    - Fields: Post title (placeholder "Meet the brothers reel"), the three format cards ("Keep X" for a retired format), Due date, Posting date once posted, and Linked event — optional (— None —, Current linked event, the feed's events as "Title · Nov 21").
    - Footer: "Lands in its lane by date — and on the month view.", Cancel, Add post / Save changes (Saving…).
  - Delete post: "Delete “…” (due Nov 24)? This can’t be undone." with Cancel and Delete (Deleting…).
  - Toasts are the web's (`SAY`). A refusal shows the server's words inline and in a toast, with an error haptic. Success haptics fire after the server confirms.
- **Signature moment:** Mark posted keeps `~/moments/Posted`: the print develops and the stamp thuds after the PATCH returns, with confetti and a success haptic on impact. The stamp is now mounted only once it lands, so a planned post no longer carries a hidden "POSTED".
- **Verified on :3100** (after `/api/auth/me` returned ok-today; a data-only dump was taken first and restored in one transaction afterwards; a fresh dump differed only in the `\restrict` tokens):
  - Add a Reel linked to Winter Formal ("Added — lands this week"), then edit it ("Post saved").
  - Move its date from the detail ("Moved to Tue, Nov 24"). Mark posted (the stamp lands). Change the posting date ("Posting date changed"). Delete it.
  - In day-one dl-today: add from the "Rush week is coming" idea, then delete it; the page returns to day one.
  - Measures: This week scrolls to its lane, and Cadence opens November.
  - Member: Post detail has no actions.
  - Gated off: with `communications` removed from ok-today's workflows, More shows no Media tile (restored after).
  - Read-only text matches the web word for word for admin 2, member 12, day-one admin 14 and day-one member 16, and for the detail, posted detail and Add post sheets.
- **Deviations:**
  - Edit opens its own sheet over the detail; on the web the rail swaps to the form in place.
  - The date inputs are the app's day strip. Linked event is an expanding list instead of a `<select>`.
  - Sheet field labels are the app's caps labels.
  - The web's confetti burst from the button is the app's Posted moment on the stage.
  - Adding scrolls to the new post's row from measured layout. The web uses `scrollIntoView`.
- **Not exercised:** a server refusal (the routes validate what the form already enforces), the events-load error, and a retired-format post ("Keep X"; the seed's "Story + Feed" post was not edited). Also the live bearer smoke (it needs a Supabase token).
- **Removed:** the mock-styled briefing, the large title with the + button, the "Showing X" narrowing, the month legend's "event promoted" caption (not on the web), DayPosts (a day now has one pill per post), and the app-only words ("No event / A post of its own", "(retired format)", "Promoting (optional)"). `lab/media.tsx` still imports Snap, MeasureTile, LaneHead, PostRow, Month and the older model names, so those stay.

## Programming (Phase 8c), what landed

Built 2026-11-20.

- **Shared rules:** `lib/programme/board.ts`. It is named `programme` because `@/lib/events` is the server's event bus. SHARED now also whitelists `@/lib/state/programming-stage`, `@/lib/event-owner`, `@/lib/event-fields` and `@/lib/calendar-feed/legacy-time`.
  - The gates moved here from `lib/programming.ts`, which re-exports them for the server: `REQUIRED_FIELDS`, `fieldsFor`, `missingFor`, `canEnter`, `needsConfirmFirst`, `needsWrapUp`, and the term stats and attention list.
  - Page rules and words, with "today" passed in:
    - Brief: `PAGE`, `termLabel`, `statusBits`, `leadTail`, `measures`.
    - Filters: `filterEvents`, `noMatchBits`, `NO_MATCH`.
    - Board and cards: `BOARD`, `byStage`, `DONE_LIMIT`, `cardWhen`, `cardBlocker`, `cardPlace`, `ideaTilt`.
    - Calendar and timeline: `CALENDAR`, `undatedOf`, `undatedFoot`, `TIMELINE`, `publishedOf`, `stubLine`.
    - Day one and help: `DAY_ONE`, `starterIdeas`, `HELP`, `helpRows`.
    - Panel: `PANEL`, `whenLine`, `panelRequired`, `hasOptionalAnswer`, `lockedFieldToast`, `stageSay`, `stepLocked`, `gateBar`.
    - Steps: `WRAP`, `RATING_LABELS`, `fixCopy`, `FIX`, `DEMOTE`, `IDEA`, `ideaRemain`.
    - Every toast in `SAY`.
  - Two more pure splits for the event form:
    - `lib/timeline/schedule-length.ts`: `durationLabel` and `suspectLength`, out of ScheduleFields.
    - `lib/calendar-feed/legacy-time.ts`: `parseLegacyTime`, `timeIsClear` and `UNCLEAR_TIME`, out of the Temporal-backed schedule module, which re-exports them.
  - The web page, board, card, calendar, undated rail, timeline strip, day one, help, idea composer, wrap-up, fix and demote steps, stage control and detail panel all render from these modules.
  - Pixel checks:
    - The first pass over all 62 programming frames was IDENTICAL on 50.
    - The other 12, and every scene touched by later edits (add, edit, idea, calendar, full, help, filter, nomatch, the four panels), went through a same-session A/B: HEAD's web files against the refactor. All were IDENTICAL.
    - The only pixels that still move are the pulsing wrap-up dot on the full frames, which differs between runs on HEAD too.
    - Several frames needed a rerun for dialog-entrance, caret or scroll-offset timing.
  - `tests/calendar-feed` (90) and `tests/programming` pass on figurints_t6.
- **Wire (additive):**
  - `EventFieldRow` in `lib/api-types/programming.ts`.
  - Route-map lines for `GET /api/events/fields` (every member, disabled rows too) and `POST /api/events/fields` (201, MANAGE_EVENTS).
  - Contract entries `eventFields` / `eventFieldCreated`, and smoke probes.
  - The bearer static test passes on all 120 routes.
- **Page** (`more/programming.tsx`, in the web phone's order):
  - Brief: the date pill and the term, "The programme." on the mark, then the status line. It leads with "<b>Speaker night</b> is next — Sunday.", then the clauses:
    - The wrap-up clause opens the oldest wrap-due event and its wrap-up. It is plain text for members.
    - "N ready to confirm" opens the first one.
    - "N ideas with no one on it" scrolls to the Idea lane.
    - Loading reads "Reading the slate…", and an empty status reads "Nothing scheduled."
  - Actions: New idea and New event for MANAGE_EVENTS (New event is hidden on day one), and "?" (How this board works) for everyone after day one.
  - Measures: On the slate · Next 14 days · Unowned ideas · Average stars, with the web's notes and warn/good tints.
  - Toolbar: Board | Calendar, the type chips (multi-select, creatable and not hidden), Search events…
  - Board: the four lanes stacked as on the phone web, each with dot, name, padlock or eye, and count; "Nothing here" when empty; Done shows 6, then "+N more wrapped" / "Show less". The visibility bracket is hidden under 900px on the web, so it is left out here.
  - Cards follow the web's DuskCard:
    - An idea is a type-coloured sticky tilted by its id; a plan is a dashed card; a confirmed event is inked on a hard shadow; a wrapped one is filed.
    - Each card shows when, place or "w/ collab", REQUIRED and stars, the owner's face ("?" when nobody has it), the blocker or owner, and the eye on confirmed.
    - A rose dot marks a wrap-up that's due.
  - Calendar: the undated rail first (count, the drop hint for officers only, rows with STAGE and owner, the foot line), then ‹ month › Today, the legend, SUN…SAT and a dot per event.
  - "No events match." with the web's sentence and Clear filters.
  - Timeline strip: "On the chapter timeline · what everyone sees · N published", with the tickets in a swipe row.
  - Day one: the four figures follow the first starter idea in an org type (fallback "Chapter retreat"). The owner is the viewer, or "An officer" for members. Officers get "Write your first idea"; members get "Nothing planned yet. Your officers will add the first one." Measures, toolbar, timeline and "?" are hidden, as on the web.
  - Type colours are each type's own hex, mixed as the web's `--tf` / `--ts`, not the Home card's pastel families.
- **Event sheet** (the web panel's order):
  - Head: the STAGE and TYPE pills, Edit · Delete (officers) and the close. Then the title, the when line, "UNOWNED · Give it an owner", and the visibility pill.
  - Ladder: officers tap a step to move. The stage line names the missing fields as links to their rows, with "move it back to Planning" when published.
  - The wrap-up record on a done event.
  - Required ("GATES THE BOARD", n/n):
    - The owner picks inline (Person | Role, Unassign, the roster with titles, roles with "N now" / "nobody holds it now").
    - Date and location edit inline until the event is published. After that, a tap toasts the lock with "Move to Planning", or "part of the record" once it's done.
  - Optional ("NEVER BLOCKS"):
    - The org's fields via `fieldsForEvent`. Text, number, money, yes/no, Description, Co-host, and Attachment (a URL, or "/" to pick a doc: "No docs match — add one in Resources first.").
    - Officers flip pills for this event. Detaching an answered field asks "Take “X” off this event?" first.
    - New field (kind cards with the web's examples, the clash line, a 24-field ceiling).
  - Spending: an input for officers, "$0" for members.
  - Linked Transactions once the event is published, with "+ Log transaction". It opens the treasury form with the type locked to expense and this event linked, and says "Log Expense".
  - The gate bar and its button, which either moves the event or jumps to the first field in the way.
- **Moves** follow the web's `moveStage`:
  - Backward is free.
  - Moving an unconfirmed event to Done toasts with "Confirm it", which routes to the confirm step.
  - A blocked forward move opens the fix step ("One step to start planning" / "One step to confirm", only the missing fields with their hints, "N left" / "All clear").
  - Done goes through Wrap it up (stars, notes 0/500, Spent).
  - Success and error haptics follow the server; a refusal toasts `SAY.moveFail` with the server's words.
- **Forms:**
  - New idea is the web composer with its preview sticky and "Needs a title + a category".
  - New event / Edit event follow the web's CalendarEventForm:
    - Icon rows with sr-only labels, and "Event name".
    - Date, start → end, and the meta line: "Pick a start time", "Starts 7:00 PM · no end time", "2 hr", " · ends next day", the zone; or "All day · Several days" with a last day.
    - The same-time and AM/PM-slip warnings, and the schedule errors.
    - An existing free-text time keeps "As written", with "Calendars show this at…" and "Set a time".
    - Type chips, where picking a required-by-default type only ever turns Required on.
    - Required attendance, collab, location, notes.
    - Create keeps the sheet open and toasts on failure. Edit closes and toasts, as the web does.
  - Help and Delete use the web's words.
- **Verified on :3100.** `/api/auth/me` returned ok-today first; a data-only dump was taken before the first write and restored in one transaction after each window. Fresh dumps differed only in the `\restrict` tokens.
  - New idea (toast) → Give it an owner → Head count, Budget, Attachment URL and Spending (all persisted) → Co-host off → New field "Parity field".
  - Moves: Idea → Planning. Inline date and location → Confirmed → back to Planning.
  - Fix step on Food bank shift (date and place), then Confirm & publish.
  - Wrap-up on Pumpkin carving (4 stars, notes, $30).
  - The confirm-first toast and its Confirm it.
  - Edit (Room 202), and Log transaction on Formal (linked, total shown).
  - New event, then Delete (204).
  - Detaching an answered Head count (confirm sheet; the server cleared the answer).
  - The server refused an Edit on a published event, and the app toasted it.
  - Member 12: no actions anywhere, and the panel is read-only.
  - Gated off: with `events` removed from ok-today's workflows, More has no Programming tile and the web sidebar has no entry (restored).
  - Text matches the web word for word: page (admin 2, member 12, day-one 14 and 16), calendar, no-match, the panel at all four stages (officer and member), help, new idea, new event, the fix steps, wrap-up and delete.
- **Deviations:**
  - No dragging (lane moves, drag-to-date, the Demote step). The web's touch board can't drag either. The Demote words are shared but unreachable in the app.
  - Fix, Wrap-up and Delete sheets open on top of the event. On the phone web they render under `.ev-panel` (a web bug, reported, not fixed).
  - The per-event docs list the app had is replaced by the web's Attachment field.
  - Date and time use the app's day strip and clock. The web's "change time zone" picker and the DST repeat/gap choosers are not offered; the org's zone is shown as text.
  - "Add, rename or reorder fields in Settings" is plain text, because the app has no event-fields settings page.
  - New field, the detach confirm and Log transaction open sheets; the web shows them inline. Log transaction shows the server's refusal under the button, where the web swallows it.
  - The "ideas with no one on them" clause scrolls to the Idea lane without the web's lane flash.
  - Type tints mix the hex in sRGB; the web's light theme uses oklch.
- **Observed on the web (not changed):** a new event's Description is sent on create, and the create schema drops it. The app sends the same wire.
- **Not exercised:**
  - A refused create.
  - Legacy free-text times (no seed rows).
  - The 24-field ceiling.
  - "Several days".
  - The live bearer smoke (it needs a Supabase token).
- **Removed:**
  - The lane tabs and their app-only empty lines.
  - The "Next up:" status line, and the app's own stats, status and ready-to-confirm helpers.
  - The OffTimeline confirm on backward moves.
  - The docs attach/detach data calls.
  - The EmptyState day one.
  - `lab/programming.tsx` still imports EventCard, Ladder and StarPicker, so those stay.

## Service (Phase 8d), what landed

Built 2026-11-20.

- **Shared rules:** `lib/service/ledger.ts` (SHARED now whitelists `@/lib/service/`). "Today" is passed in; `todayOf(now)` replaces the web's clock read.
  - Dates and times: `r1`, `dayLabel`, `daysFrom`, `relWhen`, `timeLabel`, `standing`.
  - The numbers: `ledgerStats`, `avgHours`.
  - The digest: `digestRest` and `nextWhen`, as the web's own text runs; `digestEmpty`.
  - Lists: `splitEvents` (Coming up / Logged), `rankMembers`, `eventTag`, `sheetSum`, `rowsByEvent`, `sheetRows`, `sheetEmpty`.
  - Cards: `holesFor`, `cardTail`.
  - Logging: `logTally`, `logEntries`, `logSeed`, `loggable`, `mineHours`.
  - The member sheet: `memberLedger`, `memberGoalLine`.
  - Day one: `dayOneHoles`.
  - Words: `PAGE`, `MEASURES`, `DAY_ONE`, `FORM`, `LOG`, `MINE`, `MEMBER`, and every toast in `SAY`.
  - `PaperService.tsx` and `page.tsx` render from it.
  - Pixdiff before/after: all 52 service frames are IDENTICAL. That covers full, fold, both open cards, members, member sheet, add, edit, log, mine, and both no-match scenes, for busy and day one, admin and member, day and night. One modal-entrance frame needed a rerun.
- **Wire (additive):**
  - Route-map lines for POST `/api/service-events`, PATCH/DELETE `/api/service-events/[id]`, POST `/api/service-events/[id]/participation` and DELETE `/api/service-participation/[id]`, all MANAGE_SERVICE.
  - Contract entries `serviceEventCreated`, `serviceEventUpdated`, `serviceLogged`, and smoke probes.
  - `createServiceEvent` and `updateServiceEvent` now type their `schedule` as `Schedule | null`, the same cast `listServiceEvents` already used. The JSON is unchanged.
  - The bearer static test passes on 125 routes; `tests/service` passes on figurints_t6.
- **Page** (`more/service.tsx`, in the web phone's order):
  - Brief: "FRI · NOV 20", "The service log · FA26", "Hours, by the event.", then ✦ DIGEST: "**132 hours** logged across 5 events. 4 members are still short of the 10h goal. Next up: **Food Bank Shift**, in 4 days."
  - Actions:
    - New service event (MANAGE_SERVICE).
    - Log my hours, disabled until an event has happened.
    - Ask who’s behind ⌘K, which opens Ask Chapt with the web's question.
  - Measures: Hours logged · Service events · On track (butter when someone is short) · Avg / member, with the dashed "unset" versions.
  - Tools: Search events… / Search members…, Events | Members (switching clears the search), and "n of m".
  - Events: Coming up and Logged ("3 · newest first").
    - A card shows the desk date (dashed for upcoming), the tag (In 4 days / Coming up / Past), the date and time, the place, and "4 here · 11 hours" ("—" until anyone is logged).
    - A tap opens it onto the notes and the sign-in sheet (#, Signed in, Hours, "· you", the total), with Log hours · Edit · Delete for officers and ✕ to remove a line.
  - Members: the legend, then one punch card per member, most hours first. Each shows role (· you), hours/goal, one hole per hour of the goal, and "+5" / "2 to go" / "done". A tap opens the member's hours by event, plus "Recorded before per-event tracking".
  - "Nothing matches." with Clear search, and "No members found."
  - Day one: "SERVICE [FA26]", "Service hours, the easy way", the three steps with their objects, and New service event plus "Plan your first service event" for officers. Members get "Nothing planned yet. An officer can add the first one."
- **Sheets:**
  - Log service event / Edit service event: Title, When, Location (opt), Notes (opt), and the foot "Dates stay inside FA26. It lands on the Timeline as a service event."
    - When follows the web's stacked ScheduleFields with `legacyReadOnly`: Set a time | All day, plus As written for a free-text time.
    - Date, Starts, then Ends (opt) once there's a start; Last day (opt) when all day.
    - "Calendars show this at 9:30 AM." with Set a time; the duration; the same-time and next-day warnings; "Times in New York (EST) · this device's zone."; and "Choose a date." when no date is picked.
    - Add is optimistic (inert until saved). Edit is optimistic and rolls back on refusal.
  - Log hours · <event>: the hint, Find a member…, a row per member ("6h total", hours input), the running "2 members · 5h on this sheet", and Save hours (Saving…).
  - Log my hours: Which event? (desk date, "Mon, Nov 9 · North Beach", your hours as a chip), How many hours?, 1h–6h, and "You’re at 14h of 10. Logging again for the same event replaces your hours there."
  - Refusals use the web's resolveMutationError words: no active semester, no connection, the server's sentence, else the fallback.
- **Signature moment:** after Log my hours returns, the app refetches the roster. When the server's new total adds whole holes, my service card comes up over the page with the old hours, then the new holes punch in (`~/moments/Punch`: press, chad, soft haptics). A tap or a timeout dismisses it. The success haptic follows the server's answer.
- **Verified on :3100.** `/api/auth/me` returned ok-today first; a data-only dump was taken first and restored in one transaction after; a fresh dump differed only in the `\restrict` tokens.
  - Create "Parity cleanup" (Nov 24, 7:00 PM, Pier 4; "Choose a date." shown first), then edit it to Pier 5.
  - Log hours on Beach cleanup (Dev 2, Leo 3), then remove Dev.
  - Log my hours (3h, then 6h): the punch played from 10 to 13, the server's figure.
  - Delete Parity cleanup (toast "Deleted "Parity cleanup".").
  - Member 12: no officer actions or ✕ on the sheet.
  - Gated off: with `service` removed from ok-today's workflows, More has no Service tile and the web sidebar has no entry (restored).
  - Text matches the web word for word for admin 2, member 12, day-one 14 and 16. It also matches for the open card (officer and member), the members view, the member sheet, the add, edit (timed and legacy), Log hours and Log my hours sheets.
- **Deviations:**
  - The zone's "Change" link and the DST repeat/gap choosers are not offered, as in Programming. The form shows the zone as text.
  - Date and time use the app's day strip and clock. Starts and Ends stack, because the clock needs the full width.
  - The web's delete has no confirm and slides the card off; the app removes it with a slide-out the same way.
  - The web's card re-ink flash and scroll-into-view on edit are replaced by a fade-in on a new card.
  - The punch moment is app-only, by design.
- **Seed drift observed (server behaviour, the same on the web):** logging or removing hours recomputes those members' totals from their sign-in rows, and deleting an event recomputes the whole org. The seed's totals include hours with no rows, so they fall (132 → 117 → 37 during the run). The restore put them back.
- **Not exercised:**
  - A refused create or edit (an out-of-term date can't be picked from the day strip).
  - Log hours and remove-attendee failures.
  - All day / Several days saves.
  - The live bearer smoke (it needs a Supabase token).
- **Removed:**
  - The app's own "my punch card leads" layout, the next-shift ticket, "Shifts so far" and the stepper sheet with "Punch it" / "Change it".
  - The undo on Log my hours, which the web doesn't have.
  - `setMyHours` and `unlogMyHours` in `data/more.ts`, which nothing uses now. `lab/` doesn't import the old screen.

## Parties (Phase 8e), what landed

Built 2026-11-20.

- **Shared rules:** `lib/parties/ledger.ts` (SHARED now whitelists `@/lib/parties/`). "Today" is passed in.
  - Dates: `todayOf`, `daysFrom`, `dow`, `monDay`, `mon`, `dayNum`, `partyTime`, `upcomingLabel`.
  - States and money: `profit`, `needsWrapUp`, `isUpcoming`, `subLine`, `signed$`, `receiptNet`, `money`, with `fmt$`/`fmtDate` from `lib/treasury/ledger`.
  - Lists and numbers: `newestFirst`, `waiting`, `takings`, `barPct`, `rollPct`, `canTakeRoll`.
  - Words: `briefing`, `heroTag`, `noteFor`, and `PAGE`, `RECEIPT`, `FORM`, `WRAP`, `DELETE`, plus the five refusal sentences in `SAY`.
  - `parties/page.tsx` renders from it. Pixdiff before/after: all 44 frames are IDENTICAL.
    - Frames: full, fold, the three drawers, the strip jump, add, edit, wrap, wrap-roll and delete, for busy and day one, admin and member, day and night.
    - The roll heading keeps the web's text-node split ("Who came? (" then the counts), because merging them moved antialiasing.
    - busy-admin-night-full differs only at the floating Ask button's sparkle. The unchanged original page gives the same 1,635 px against the before frame.
- **Wire:** none needed. The routes, contract entry and smoke probes were already there. The bearer static test passes on 125 routes.
- **Page** (`more/parties.tsx`, the web phone's order):
  - Brief: "FRI · NOV 20", "Parties · Oozma Kappa", "The house ledger.", then "4 parties closed out and the books are **net positive**. 2 parties are still waiting on numbers — close them out and you're square."
  - Actions: Add party (MANAGE_PARTIES) and Ask what the door cleared ⌘K.
  - The one task (officers): the sealed envelope with "Needs wrap-up · 12 days ago", "Open · **Sun, Nov 8** — add the door & expenses so the semester totals are right.", "+1 more waiting below" and Close it out.
  - Takings: Net this semester, Door taken, Spent (kept %), Avg attendance, Best night, and Night by night. A bar opens its party in the book and scrolls to it.
  - Every party ("8 total · newest first"):
    - As at the web's ≤480px, the rows drop the column heads, the collab and the day/time.
    - States: net / "Wrap up →" (officers) / "Needs wrap-up" (members) / Today, Tomorrow, In N days, Upcoming.
    - A row opens its drawer in place: the till receipt (Door, Spent, Net, or NO FIGURES / TAB OPEN; Members n/m · %; Thru door; *** CLOSED OUT *** / *** OPEN TAB ***), the note or its fallback, the facts (wristband, theme, with, Mandatory), "Who came n of m" with dots, then Wrap up / Open in Timeline / Edit / Delete.
  - Empty: "No parties yet." with the officer or member line, Add party, and the blank Date / Party / Net.
- **Sheets:**
  - Add Party / Edit Party: Party name, When (the shared stacked schedule; a new party starts today), Party type as two wristband cards with their blurbs, Theme opt, Collab org opt, the foot line, Cancel, then Add Party / Save Changes.
  - Mark Completed, step 1: the party and "Nov 8 · Open", the step dots, Door Revenue ($) *, Expenses ($) *, Net preview, Post-event notes, the foot line, then "Next: Who came? →" (or Mark Completed when there's no one to roll or the roll is already in).
  - Mark Completed, step 2: "Who came? (12/13)" with All / None, Find a member… past 8, tick rows (box and name, as on the web), Nobody by that name., "**Mandatory** — count this toward each brother’s attendance %", the foot line, ← Back and Mark Completed.
  - Delete Party: the web's confirm sentence, Cancel, Delete.
- **Writes** are optimistic as on the web: add opens the new row, edit merges, wrap-up marks the row completed, delete removes it.
  - A refusal rolls back and shows the web's sentence as an error toast (in place of its banner).
  - A wrap-up on a still-saving party gets "Party is still saving. Wait a moment, then try again."
  - The success haptic follows the server; the error haptic follows a refusal.
  - Writes refresh the Timeline, home and Treasury.
- **Signature moment:** once the server has the wrap-up, the night's receipt feeds out of the till and CLOSED OUT stamps across it (`~/moments/Till`, its own success haptic on the stamp), over the page. It clears itself, or on a tap. It is app-only.
- **Shared form fields:** Service's schedule fields moved to `mobile/src/ui/WhenFields.tsx` (with `FormLabel`, `FormField`, `Chip`, `initialWhen`, `scheduleOf`, `timingOf`) and both forms use them. Service's add and legacy-edit sheets re-read word for word afterwards.
- **Verified on :3100.** `/api/auth/me` returned ok-today first; a data-only dump was taken first and restored in one transaction after; the diff showed only the `\restrict` tokens.
  - Add "Parity Night" (Tue Nov 24, 7:00 PM, Closed, Neon). It made its Timeline entry (category party) and opened in place.
  - Edit it to Neon Glow / KDF.
  - Wrap up Game Day Tailgate: door 300, spent 90, Cyrus Pak unticked. Result: completed, 12 present and 1 absent; the door moment played; net went from +$1,170 to +$1,380, 4 rolled.
  - Delete Parity Night; its Timeline entry went too.
  - Member 12: no Add party, no envelope, "Needs wrap-up" in place of "Wrap up →", and no Wrap up / Edit / Delete in the drawers.
  - Gated off: with `parties` removed from ok-today's workflows, More has no Parties tile and the web sidebar has no entry (restored).
  - Text matches the web word for word for:
    - admin 2, member 12, day-one 14 and 16;
    - the closed, rolled, due and upcoming drawers (officer and member);
    - Add, Edit, both wrap-up steps and Delete.
- **Deviations:**
  - The zone's "Change" link and the DST choosers are not offered. Date and time use the day strip and clock.
  - The web's dismissible error banner is an error toast.
  - The door moment is app-only.
  - The header "+" button the old app screen had is gone, because the web has none. Add party sits in the actions.
- **Observed (server behaviour, same on the web):** during the run, Treasury's "in the account" rose by the door ($300), not the party's net ($210): $2,288 → $2,588, and back after the restore.
- **Not exercised:**
  - A money-only wrap-up (it needs a past, open party whose roll is already in; the seed has none).
  - Refused writes and the still-saving guard.
  - All day / several-day party saves.
  - The live bearer smoke (it needs a Supabase token).
- **Removed:**
  - The app's party sheet (now the in-place drawer).
  - The old wrap-up's in-sheet till and its invented captions ("Wrap it up", "Ringing it up…", "The money" / "Who came" step names, the success toasts).
  - The term-gated roll (the web only asks whether anyone is on the roster and no roll is in).
  - `lab/parties` still imports `Till`, `Book`, `Strip` and `Wristband`, so they stay.

