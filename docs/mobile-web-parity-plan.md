# ChaptOS mobile app — web-phone parity plan

2026-11-19. Supersedes the *look* half of `docs/mobile-app-ui-motion-plan.md` (U1–U9
screen designs taken from `_design/Dashboard iPhone Paper Mock.html`). The build plan
(`docs/mobile-app-plan.md`: auth, push, store, contract rules) still applies.

## The goal, in plain words

Someone who uses ChaptOS in Safari on their phone should open the app and find **the same
product**: the same dashboard with the same widgets in the same order their admin chose,
the same pages laid out the same way, the same words, the same buttons. What the app adds
is how it *feels*: things move smoothly under your finger, sheets follow your thumb, and
the phone taps back at the moments that matter.

Today that isn't true. The app was designed from the iPhone paper mock, so it's a sibling
product: Home is a bespoke "Today" (Ask bar, ticket, plate) instead of the dashboard;
Tasks is a swipe deck; Service is a punch card; there are app-only pages (Attendance,
Dues, Excuses, Reimbursements) the web doesn't have; and More is a copy of the web
sidebar. A member who switches between the two has to learn two layouts, and every web
change (a new widget, a renamed tab) silently leaves the app behind.

**Who notices:** every member who uses both (most officers do: they set things up on a
laptop and check them on the phone), and every admin who arranges the dashboard and
expects members to see that arrangement.

## Decisions (2026-11-19)

| Question | Decision |
|---|---|
| Sidebar | **Gone from the app.** More stays as a tab, but opens a full-screen **page grid** in the web Create sheet's tile look (`.mcr-grid` / `.mcr-it`), no drawer, no Overview/Members/Operations headings. Org switcher → Home header. Profile/account → a "You" block at the bottom of More. |
| App-only UI from the iPhone mock | **Web layouts everywhere; keep the signature moments big.** Ticket tear, DONE stamp + card flight, pen-stroke vote, punch holes, jar fill, envelope, letter play as full overlays when those actions happen *on the web-layout screens*. App-only pages fold into where the web keeps that information, **except the two app-only keeps below**. |
| App-only keeps (2026-11-19) | **The full-screen check-in and the "Yours" pages stay, in the app only.** They are not built into the web. Yours = Attendance, Excuses, Dues, Reimbursements (my own records), gated as today (`yoursFor`). These are the only deliberate differences from the web phone. |
| Settings / Billing | **Settings yes** (admin-gated sections, as on the web). **Billing no**: stays on chaptos.com; the app doesn't link it (store payment rules). |
| Tab bar | Unchanged: it already is the web's `.mtb` (Home · Timeline · [+] · Members · More, rose badge on More). |

## Ground rules

1. **The web phone render (390×844, WebKit) is the spec.** Not the iPhone mock, not
   the UX plan. If the web and this document disagree, the web wins and this file is
   fixed. The two exceptions are the app-only keeps (full-screen check-in, Yours); they
   have no web reference and are checked against their current app versions instead.
2. **Same data, same derivation.** A number the web computes in the browser and the app
   re-implements will drift. Where the web derives (health score, headline numbers,
   plate, week, standing counts), move the derivation to a service and have both read it
   (see *Data*). Ports into `mobile/src/**/model.ts` are a last resort and each one names
   its web source in a header comment.
3. **Same gates.** Every widget, tile, tab and button appears for exactly the people it
   appears for on the web: workflows (`enabledWorkflows`, `NAV_WORKFLOW_MAP`), features
   (`disabledFeatures.operations`), permissions (`MANAGE_*`), tracked metrics, dashboard
   layout `hidden`.
4. **Same words.** Vocabulary (`v("Member", true)`), labels, empty-state copy, toasts,
   error lines: copied, not paraphrased.
5. **Show only real capabilities** (standing rule). Nothing the web can't do.
6. **Motion confirms a state change; haptics follow `src/motion/haptics.ts`** strictly: one
   per action on the result, none on navigation or opening a sheet. No idle pulses.
7. **Additive wire changes only** (AGENTS.md). Each new route: wire type in
   `lib/api-types`, route-map line, `satisfies` in the route, smoke probe.

---

## How parity is measured (applies to every phase)

### Reference captures
`scripts/_phone-shot.ts` (ENGINE=webkit) grows into `scripts/_parity-capture.ts`, which
captures **every org page at 390×844** into `_design/parity/web/<page>/<state>.png`:

- themes: paper day, paper night (ivory/default)
- viewers: member, officer with that page's `MANAGE_*`, org admin
- data: day one (empty), quiet, busy (seed on the isolated :3100 server, never the shared DB)
- every sheet the page opens, scrolled captures for long pages

These are the golden references. They're re-captured whenever a web page changes.

### App captures without a simulator
There's no Xcode/Android SDK on this Mac, so:

1. **react-native-web render of each screen** (`npx expo export --platform web` into the
   scratchpad, served locally) captured by the same Playwright script at the same size,
   then a side-by-side sheet (`_design/parity/compare/<page>.html`: web | app | diff
   overlay). Reanimated/Skia-heavy moments are excluded from this check (web fallbacks
   differ); layouts aren't.
2. **On-device check** in Expo Go by the user at the end of each phase: a short checklist
   per screen (layout, both themes, Dynamic Type L and XXL, motion at 60fps, each haptic).
3. Gates every phase: `npx tsc --noEmit` in `mobile/` and root, `npx expo-doctor`, iOS +
   Android `expo export` (delete output + `$TMPDIR/metro-cache` after: disk is tight),
   the contract test, `npm run smoke:mobile` against :3100 for any new route.

### Parity checklist (per screen)
Order of sections · every widget present with the same gates · copy identical · tones
and icons identical · spacing within 2pt of the capture · empty/loading/error states
match (web skeleton shapes) · every tap target leads where the web's does · every write
the web offers on phones exists.

---

## Architecture

### 1. A "web phone kit" in `mobile/src/web/`
The current primitives (`paper/bits`, `stationery`, `Stamp`…) were built for the mock.
Add a kit that ports the **web's phone CSS one class to one component**, named after
the class so a diff against the web is mechanical:

| Web (CSS / component) | App component |
|---|---|
| `BottomSheet` + `.bsheet*` (mobile-shell.css) | `web/BottomSheet.tsx` (on top of the existing `SheetHost`, web header: tile + title + ×, grab bar, `tall`) |
| `PaperTile`, `PaperIcon` | `web/PaperTile.tsx` (icons already generated from the sprite) |
| `.mcr-grid` / `.mcr-it` / `.mcr-hero` | `web/TileGrid.tsx` (shared by Create and the new More) |
| `.dw-glance` (phone-dash.css) | `web/GlanceTile.tsx` |
| Dashboard ledger cards (`dashboard-ledger.css`, `core-cards.css`, `week-card.css`, `plate-card.css`, `treasury-card.css`, `members-card.css`, `track-cards.css`) | `web/Card.tsx` + one component per widget |
| Ledger rows, date stubs (`.led-date`), segmented controls, chips, kickers, standing bar | `web/Ledger*.tsx`, `web/Segmented.tsx`, `web/Chip.tsx`, `web/StandingBar.tsx` |
| Paper forms (`forms.tsx`, `task-sheets.css`, `calendar-event-form.css`) | `web/form/*` (fields at 16px, web labels) |

Tokens: the app theme already mirrors `globals.css` / `paper-aesthetic.css`; Phase 0
re-audits it against the current CSS (the ivory light mode and any tokens added since
2026-11-17) and adds anything missing. No literal hex in screens.

### 2. Data: `GET /api/dashboard` (new, additive)
The web dashboard (`app/org/[slug]/page.tsx`, 3,000 lines) fetches ~20 endpoints and
computes health, numbers, plate, week, standing counts and glances in the browser. The
app's `/api/home` covers only up next + plate. Rather than port that page's math:

- New `lib/services/dashboard-service.ts` (composes read services under
  `lint-modules:ignore`, like home-service) returns **per-widget view models** for the
  viewer: `layout` (org `dashboardLayout`, already normalised), `phoneOrder`, `numbers[]`,
  `health | null` (with the same "hide until meaningful and has data" rule),
  `liveCheckIn`, `announcement`, `next`, `plate`, `week`, `ballot`, `members`
  (counts + pending joins for those who can act), `treasury` (balance, projected,
  trend), `activity`, `docs`, and the optional cards (`money`, `dues`, `service`,
  `gpa`, `social`, `metric:<id>`), each `null` when the viewer's gates hide it.
- Pure derivations move out of `page.tsx` into `lib/dashboard-derive.ts` (client-safe)
  and **the web page switches to them in the same PR**, so web and app can't drift.
  (Pixel-identical web check with `scripts/_deadcode-pixdiff.mjs` before/after.)
- Wire type `lib/api-types/dashboard.ts`, `satisfies`, route map, smoke probe.
- `/api/home` stays (shipped builds read it) until `MOBILE_MIN_VERSION` moves past them.

Other pages already have wire-typed endpoints; each page phase lists any gap it finds.

### 3. Shell without the sidebar
- **Tab bar**: keep `shell/TabBar.tsx` (already `.mtb`).
- **More** (`(tabs)/more/index.tsx`) is rewritten as the page grid:
  - Tiles = the sidebar's pages in the org's `navOrder` across all groups (one flat
    list, Dashboard/Timeline/Members omitted since they're tabs), same
    `NAV_WORKFLOW_MAP` gates and `NAV_DISPLAY` words, the sidebar's icon per page.
  - Badges where the web shows one (Tasks: my overdue count; Members' join count stays
    on its tab). The current mono "live lines" go: the web sidebar has none.
  - Settings tile last, only when the web sidebar shows Settings.
  - **Yours** (app-only keep): a second short grid under the pages, headed "Yours":
    Attendance, Excuses, Dues, Reimbursements, same tile look, gated by `yoursFor`.
    Each tile may carry a badge when something needs me (a rejected excuse, dues late);
    no mono live lines. The pages themselves keep their current layouts and moments
    (punch strip, excuse notes, dues receipt + PAID, reimbursement envelope), restyled
    only where they use mock-era primitives the kit replaces (headers, sheets, tiles),
    so they sit naturally next to the web-parity screens.
  - **You** block: your avatar + name (opens your Member Spotlight), then what the web's
    `SidebarProfile` menu offers (account, theme, sign out), then leave chapter /
    delete account as on the web.
- **Org switcher**: Home header gets the web sidebar's org header (logo/title + term),
  tap → sheet of memberships (the web `OrgSwitcher` content). Only on Home.
- **Page headers**: each screen uses its web page's own phone header (title, kicker,
  actions). The current large condensing `Screen` title stays as the *motion* but takes
  the web's words and buttons.
- Remove `src/more/model.ts`'s `sidebarFor` / `yoursFor` grouping and `live` lines once
  the grid ships.

### 4. Motion layer
Web transitions become Reanimated equivalents with the web's curves
(`spring (.16,.9,.3,1.02)`, `standard (.22,.72,.24,1)`, `flight (.6,0,.12,1)`,
`sheet (.32,.72,0,1)`, 500ms sheets as decided). Web keyframe effects already designed
(`event-landing.ts`, `event-delete.ts`, `task-fly.ts`, `ticket-flight.ts`) are ported as
the canonical versions. Native-only additions, all interruptible:

| Interaction | Motion |
|---|---|
| Sheets (every web BottomSheet) | follow the finger, rubber-band, velocity dismiss, canvas scale-back |
| Tab switch | none beyond the tile ink (web has none); scroll-to-top on re-tap |
| Push to a page from More / a glance | native stack slide; glance tile → sheet morphs from the tile's frame |
| Lists | layout transitions on insert/remove (`LinearTransition`, reduced = fade) |
| Numbers | `TickingNumber` on change, never on first paint unless the web counts up |
| Pull to refresh | existing pencil pull on iOS |
| Swipe rows | where the web phone has swipe (plate rows, tasks) only |

**Signature moments kept big** (user decision), each triggered by the web-layout action:

| Moment | Triggered from (web layout) |
|---|---|
| Check-in ticket tear + HERE | Live check-in band "Check in" (dashboard, `/checkin`) |
| DONE stamp + card flight | ticking a task row (Tasks, plate) |
| Pen-stroke vote + bars | casting in the ballot card / poll sheet |
| Punch holes | Service: logging hours |
| Jar fill | Fundraisers page first open / totals change |
| Envelope SENT | reimbursement submitted (Treasury → Reimbursements) |
| Note fold | excuse filed |
| Sealed letter / Join approved | entry flow (unchanged) |
| Till PAID / Posted / Stamp | parties wrap-up, media post marked, dues covered |

Each moment is an overlay that measures the web-layout element it starts from, so the
screen underneath is exactly the web layout before and after.

### 5. Haptics map (complete list; nothing else buzzes)

| Haptic | When |
|---|---|
| `tap` | toggle, tick, chip filter, segmented tab in a page (web tabs: Treasury, Chapter, Timeline view) |
| `select` | picker detents, date wheel, sheet snapping to a detent, reorder lifting |
| `soft` | a stamp's impact, each punch hole, card settling after a flight |
| `success` | a signature moment's result; a form saved (one, on the server's 2xx) |
| `warn` | check-in closing soon (once), destructive confirm shown |
| `error` | server refusal as the motion plays backwards |

No haptic on: navigation, opening a sheet, scrolling, pull-to-refresh start, tab bar.

---

## Phases

Each phase ends with: parity captures compared, gates green, user device check, and
the user's go-ahead before the next. Commits per phase (no co-author trailer).

### Phase 0 — Reference and audit (no app changes)
- `scripts/_parity-capture.ts` + seed scripts for day-one / quiet / busy on :3100.
- Capture every web page (list below) × themes × viewers × states.
- `_design/parity/AUDIT.md`: per screen, what the app has vs the web (sections, widgets,
  copy, writes), what's missing, what's app-only and where it folds.
- Token re-audit (theme.ts vs current CSS).
- react-native-web export spike: confirm the kit renders under RN-web well enough for
  side-by-side captures; if not, captures fall back to device screenshots the user sends.

### Phase 1 — Kit + shell (no sidebar)
- `mobile/src/web/` kit (BottomSheet, PaperTile, TileGrid, GlanceTile, Card, Ledger
  rows, Segmented, Chip, StandingBar, form fields).
- More → page grid + You block; Home header org switcher; Settings tile placeholder
  hidden until Phase 9.
- Create sheet re-skinned on `TileGrid` (contents already match the web).
- Delete sidebar-only code in `more/model.ts`.

### Phase 2 — Dashboard (Home tab) with the real widgets
Server: `dashboard-service`, `lib/dashboard-derive.ts`, web page migrated onto it,
`GET /api/dashboard` + wire type + probe.

App Home rebuilt in the web's phone order:
1. **Briefing header**: "Hi, <first>" + week range + digest line (`/api/ai/digest`
   narration, quiet state). No briefing actions: the web phone hides `.brief-actions`
   (My standing is the toolbar avatar, Create is the tab bar, Arrange is desktop-only).
2. **Health dial band** (when shown) → health sheet (score ring, breakdown).
3. **Billing alert** (admin only; text as on the web, no link, since billing isn't in
   the app and the app doesn't link it).
4. **Live check-in band** with officer controls (close, reopen, cancel/void, restore,
   open another, take attendance). Tapping the band's check-in opens the **full-screen
   check-in** (`app/checkin.tsx`, app-only keep) with the ticket tear, instead of
   checking in inline as the web does. Officer controls stay on the band.
5. **Calendar invite card** (self-gating as on the web; "Not now" remembered per device).
6. **Top spot**: pinned note when the layout puts it on top.
7. **Headline numbers** (`DashNumbers`, ≤3, the layout's choice, each with its CTA).
8. **Cards in `phoneOrder`**: `PHONE_LEAD` = announcement, next, needs (On your plate),
   week; then the layout's order for full cards (ballot, money, gpa, social, service,
   dues, metrics…); then **glance tiles two to a row** (treasury, members, activity,
   docs), an odd one out spanning the row, each opening its full card in a BottomSheet
   (`tallSheet` where the web sets it).
9. Footer: org name.
Sheets/peeks: WeekItemPeek, task sheet, event peek, member spotlight, activity
spotlight, as the web opens them. Create-from-Home keys (`?create=`) handled natively.
The current Today pieces (AskBar, UpNextTicket, Plate) are replaced by the web widgets;
Ask Chapt opens from wherever the web phone opens it (⌘K / chat widget equivalent).

### Phase 3 — Timeline
Web `timeline/page.tsx` phone layout: Timeline / Calendar view switch, month groups,
Today marker, the rail as a sheet on phones, DayOne, event detail (details, supplies,
attendance, excuses, minutes link), Add event/deadline forms (`CalendarEventForm`
two-page, repeat for meetings), event-landing and event-delete (tear + undo) motions.
Excuses filing lives here and in Chapter, as on the web; the app's Excuses page stays
in Yours (app-only keep) and shares the same filing sheet and write.

### Phase 4 — Members
Web `brothers/page.tsx`: standing segmented bar + chips, search, roster rows, join
requests band (MANAGE_BROTHERS) with approve/reject (this also unblocks the Members tab
join badge), Member Spotlight (v3 card: About, standing, edit for self/officers). My
standing in the Spotlight matches the web; the app's Attendance page stays in Yours
(app-only keep) and links from My standing's attendance line.

### Phase 5 — Chapter (meetings)
Web `chapter/page.tsx`: digest, on deck (`.od-cal`), excuse review band, the book (ledger
with `.led-date` stubs, filters), meeting view with Attendance / Minutes / Summary tabs,
action items, Summarize (MANAGE_EVENTS), DayOne. Minutes: the web phone minutes sheet
(`minutes-phone.css`) read view; editing on phones only if the web phone allows it.

### Phase 6 — Tasks
Web `PaperTasks.tsx` + `TaskSpotlight` + `TaskSheets`: Overdue + Upcoming, phone swipe,
spotlight with each/any ticks and history, polls (everyone, mandatory), task + poll
sheets with the who-picker. The deck goes; the DONE stamp + flight plays from the row.

### Phase 7 — Treasury
Web tabs Overview · Transactions · Dues (only when dues are tracked) · Reports ·
Reimbursements (badge), with each tab's phone layout, setup gate / first entry, charts
(paper charts), TxForm, reimbursement request + receipt upload (envelope moment),
approvals for keepers if the web phone offers them. The app's Dues and Reimbursements
pages stay in Yours (app-only keep) beside these tabs; they share the same queries and
writes (`data/money.ts`, `money/RequestSheet.tsx`) so the two views never disagree.

### Phase 8 — Operations pages
One sub-phase each, in sidebar order: **Docs** (pinned cards, folders, ledger rows,
filters, DocForm/FolderForm/move for those who can), **Media** (Instagram month,
snapshot, post cards, detail, form), **Programming** (`events/page.tsx` lanes, sheets),
**Service** (`PaperService` + WIDE forms; punch moment on log), **Parties** (house
ledger, wrap-ups, roll), **Fundraisers** (`FundraiserShell`, new fundraiser dialog; jar
moment). Each replaces the current mock-styled screen.

### Phase 9 — Settings (admin)
Port the sections the web phone shows, gated identically: Identity (+Vocabulary),
Roles (cards, By person, role sheet), Accounts (By person / By area, PersonSheet),
Workflows (+ nav order), Thresholds, Semesters, Event types, Event fields, Member
fields, Custom metrics, Transaction categories, Opening balance, Invitations, Activity
log, Danger zone. `?section=` deep links. Billing excluded. This is the largest phase;
split into 9a (Identity, Roles, Accounts, Invitations), 9b (Workflows, Thresholds,
Semesters, metrics), 9c (event/member fields, categories, opening balance, activity log,
danger zone). Check each write route accepts bearer auth (several settings routes may
still be cookie-only; add probes).

### Phase 10 — Motion and haptics pass
Walk every screen against the motion and haptics tables above on a device. Remove any
haptic not in the table, add missing result haptics, check reduced-motion versions,
measure 60fps on the dashboard scroll, sheet drags and moments (Perf monitor in Expo Go).
Update the Lab (`/lab`) to show each moment over its web-layout screen.

### Phase 11 — Cleanup
Delete unused mock-era components (Deck, Board, Today pieces, `more/account`/`leave`/
`phone` once merged into You), dead `more/model.ts` helpers, Lab scenes for removed
screens. **Keep** `app/checkin.tsx` + `CheckInTicket` and the four Yours pages with their
moments (punch strip, excuse notes, dues receipt, envelope).
Update `docs/mobile-app-ui-motion-plan.md` with a pointer here, AGENTS.md if a rule
changed, and memory.

---

## Page map (web source → app route → what folds in)

| Web page | Web sources (phone CSS) | App route | Folds in / removed |
|---|---|---|---|
| Dashboard | `org/[slug]/page.tsx`, `dashboard/*`, `customize/DashGrid.tsx` (`phone-dash.css`, `dashboard-ledger.css`) | `(tabs)/today` → rename `home` | Today AskBar/UpNext/Plate replaced |
| Timeline | `timeline/page.tsx`, `components/timeline/*` (`timeline-ledger.css`, `event-landing.css`, `event-delete.css`) | `(tabs)/timeline` | — |
| Members | `brothers/page.tsx`, `components/members/*` (`brotherhood-ledger.css`, `member-spotlight.css`) | `(tabs)/members` | — |
| Chapter | `chapter/page.tsx`, `meeting-notes/*` (`meetings-ledger.css`, `minutes-phone.css`) | `more/meetings`, `more/meeting/[id]` | — |
| Tasks | `tasks/PaperTasks.tsx`, `TaskSpotlight`, `TaskSheets` (`tasks-paper.css`, `task-sheets.css`) | `more/tasks` | Deck/Board |
| Docs | `docs/*` (`docs-ledger.css`) | `more/docs` | — |
| Media | `media/*` (`instagram-paper.css`) | `more/media` | — |
| Programming | `events/page.tsx` (`events-ledger.css`, `paper-programming.css`) | `more/programming` | — |
| Service | `service/PaperService.tsx` (`service-ledger.css`) | `more/service` | — |
| Parties | `parties/page.tsx` (`parties-ledger.css`, `paper-parties.css`) | `more/parties` | — |
| Fundraisers | `fundraisers/*` (`fundraisers-paper.css`) | `more/fundraisers` | — |
| Treasury | `treasury/page.tsx`, `components/treasury/*` (`paper-treasury.css`, `paper-dues.css`) | `more/treasury` | — |
| Settings | `settings/*` (`paper-settings.css`, `settings-ledger.css`) | `more/settings/[section]` (new) | — |
| Sidebar profile menu | `SidebarProfile.tsx`, `OrgSwitcher.tsx` | More "You" block, Home header | `more/account`, `more/leave`, `more/phone` merge into You |
| Billing | — | not in app | — |
| *(none: app-only)* Check-in | — | `app/checkin.tsx` (full screen from the dashboard band) | kept |
| *(none: app-only)* Yours | — | `more/attendance`, `more/excuses`, `more/dues`, `more/reimbursements` (Yours grid in More) | kept |

---

## Risks and open items

- **Scale.** This is effectively a second build of the app's screens (~15k lines of web
  page code to mirror, plus Settings). Phases 2, 7 and 9 are each larger than any stage
  so far. Doing the dashboard first gives the biggest visible win soonest.
- **Losing good mobile-only touches.** Some mock screens are arguably better on a phone
  (the Tasks deck). The decision is web parity; if a phone-specific improvement is worth
  keeping, it should go into the **web phone layout** too, so both stay identical.
- **Derivation drift.** Mitigated by `/api/dashboard` + shared `lib/dashboard-derive.ts`.
  Existing ports (`members/model.ts` standing) should move onto server fields over time.
- **Bearer coverage.** Settings and some officer routes may be cookie-only; each phase
  audits with `tests/mobile/bearer-routes.test.ts` before building screens.
- **Verification gap.** No simulator here: the RN-web capture spike in Phase 0 decides how
  much can be checked automatically; motion and haptics are device-only.
- **Shipped builds.** Removing Today/`/api/home` consumers is app-side only; server routes
  stay until `MOBILE_MIN_VERSION` is raised.
- **Billing alert** in the app links out to the browser; confirm that's acceptable for
  store review (it's an admin notice, not a purchase flow), or hide it in the app.
- **Disk.** Exports + captures add up; captures go in `_design/parity/` (gitignored
  `compare/` output), scratchpad for exports, clear metro cache after.
