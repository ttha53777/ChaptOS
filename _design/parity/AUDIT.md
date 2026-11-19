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
| Tasks | `more/tasks` | 🟡 | App has a deck and board. Web has an Overdue/Upcoming list, spotlight, task/poll sheets, and a who-picker. |
| Docs | `more/docs` | 🟡 | Web has the index-card shelf, folders, drag to file, and the day-one pictures. |
| Media | `more/media` | 🟡 | Web Instagram is the paper page (full and day one). |
| Programming | `more/programming` | 🟡 | Lanes and wrap-ups exist. Web has the gated lanes and day-one steps. |
| Service | `more/service` | 🟡 | Web has PaperService, wide modal forms, and day one. |
| Parties | `more/parties` | 🟡 | The ledger and wrap-ups exist. Diff the roll and wrap-up door. |
| Fundraisers | `more/fundraisers` | 🟡 | Web has jars over the ledger and the wrap-up total. |
| Treasury (Overview, Transactions, Dues, Reports, Reimbursements) | `more/treasury` | 🟡 | App has one page. Web has 5 tabs plus sheets and the setup gate. Reimbursement review is now in the app (dashboard plate). |
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
