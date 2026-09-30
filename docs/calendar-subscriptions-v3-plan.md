# Calendar subscriptions v3: found, trusted, personal

Proposed September 29, 2026. Nothing here is implemented yet.
Builds on `docs/calendar-subscriptions-v2-plan.md`. v2's Release 1 (real times,
self-serve admin, guided setup, deep links, status) is built. This plan covers what
comes next. It folds in v2's Release 2 (personal links and filters) and changes its
defaults and scope where noted.

## The short version

Release 1 made the feed accurate and possible to set up. A member still gets less
out of it than they should:

1. **Hardly anyone will find it.** The only way in is **Add to my calendar** on the
   Timeline. Settings points back there. Nothing prompts a newly approved member,
   and the dashboard and event sheets never mention it. The number of subscribers
   now matters more than any feed improvement.
2. **An opened entry says very little.** Each entry has a title, time, location and
   category. It doesn't say whether the event is **required**, which is what a
   member cares about most. The "open in ChaptOS" link lives only in the ICS `URL`
   property. As far as we know, Google Calendar doesn't show that property, so for
   Google users the deep links from v2 1.4 may be invisible. The pilot must confirm
   this.
3. **It's noisy.** Every member gets every dated deadline in the org, including
   completed ones ("Deadline: [Done] …").
4. **Google setup still means copying and pasting**, and it doesn't work on a
   phone at all.
5. **Nobody can tell whether it's working.** "I've added it" is only what the member
   says. Admins can't see how many members are subscribed. The app has no client
   analytics, so we can't measure adoption either.

v3 fixes these in three steps:

- **Step 0** finishes what Release 1 left open.
- **Phase A** improves the shared link for everyone. The changes are small.
- **Phase B** gives each member a personal link and, through that link, the first
  real "connected" signal.

## Step 0: Finish Release 1 (blocks everything below)

- **Commit v2 1.4 and 1.5.** They are in the working tree, uncommitted.
- **Run the unrun test.** The 1.5 integration test (status states and the generation
  bump) was written but never run, because the Docker test database was down.
  Run it against Postgres on :54330.
- **Check the real app.** Restart the dev server on a client generated after the
  calendar migrations. v2 records that the stale Prisma client returned 500 from the
  subscription API, so the Timeline dialog, `?subscribe=` and the deep links have
  only been checked in component tests.
- **Provider pilot** (prerequisite since v1, still not done). Use Google Calendar web
  plus its Android/iOS apps, and Apple Calendar on Mac and iPhone, with one pilot
  org. Beyond the v1 checklist, record:
  - Is the ICS `URL` property visible or clickable anywhere in Google (web or app)?
    In Apple? (Decides where the link goes in A1.)
  - Does each client remove an event that the feed simply omits? What does it do
    with `STATUS:CANCELLED`? (Decides the B2 filtering design, as in v2.)
  - How long does a change take to appear in each client? Measure before and after
    A2's refresh hints.
  - Does the Google `cid=` add link (A2) open the add dialog pre-filled on web, and
    what does it do on a phone?
  - Can members set default alerts on a subscribed calendar in each client? (Decides
    the reminder copy in A3.)

## Admin setup in Settings (built September 29, 2026)

*User impact:* an officer turns the calendar on from Settings in one click. Before,
it took four steps and a minute of waiting, and some blocking items could only be
fixed with advice that didn't work.

What was in the way, from the dev data: 10 of 11 orgs had no time zone, so every
admin had to start by typing one. Every admin then had to run a check, wait about
a minute, and come back to click Enable. The one org with real history (`lpe`) had
7 legacy deadlines and 1 unlinked service project. For the service project, the
screen said "re-save it", but `updateServiceEvent` never creates the missing link.

- **Its own section.** Settings → Operations → *Calendar subscription*
  (`?section=calendar`), moved out of the top of General. When the feed is off, an
  admin who opens the member dialog gets a link straight to it.
- **One button.** *Turn on for members* sends `turnOn` with the zone. The zone is
  prefilled from the device and marked "from this device", and is only saved by
  that click. If a passing check is already on file and nothing is waiting to
  publish, the feed is enabled right away. Otherwise the button provisions the link
  if needed and sets `validationRequestedAt` plus the new `enableOnValidation`.
  The worker's settle step then enables the feed if the check passes and the
  rollout gate is still open. `enabled` and `validatedAt` go in one write because
  `calendar_feed_enabled` requires both. Disabling clears a pending turn-on.
- **Fixes in place.** Legacy deadline: *Delete*, after checking it has a matching
  task. The feed leaves these rows out entirely, so the risk is a missing deadline,
  not a duplicate. Service project: *Add to timeline* (`link`), using the backfill
  rule: all-day, no notes, refused on any possible title/date match. Parties link
  out only.
- **Once live**, the checklist collapses. What's left is the zone, *Tell your
  members*, and Advanced (regenerate, turn off).

Still operator-only: `CALENDAR_FEED_KEY`, `CALENDAR_FEED_ORIGIN`, the worker, and
the `CALENDAR_FEED_ORGS` allowlist. Until the allowlist is `*`, most orgs will see
"ChaptOS hasn't opened calendar subscriptions for your organization yet". That gate
is deliberate, and whether to open it is a rollout decision, not a UI one.

Migration: `20261001000001_calendar_feed_enable_on_validation` (additive column).

## Phase A: More useful on the shared link

Everything in Phase A works on today's shared link, so every current subscriber
benefits without doing anything.

### A1. Entries that answer "do I have to go?"

*User impact:* opening an entry tells you whether it counts, and gets you back to
ChaptOS.

- Publish `mandatory` from `CalendarEvent`. Add it to the worker's `select` in
  `lib/calendar-feed/worker.ts` and to `PublishedItem`, so a change re-hashes
  and bumps the revision.
- Render a **fixed** `DESCRIPTION` built only from app-controlled strings. Source
  notes and descriptions still stay out of the feed, so the published-field
  allowlist holds.
  - `Required · attendance is taken` when mandatory.
  - `Time to be confirmed in ChaptOS` when `timeUnconfirmed` (existing text).
  - `Open in ChaptOS: <deep link>` on every entry. Keep the `URL` property as well.
    This covers Google whichever way the pilot answers; drop it only if the pilot
    shows it's redundant everywhere.
- Consider a short title marker for required events (e.g. `Chapter meeting
  (required)`). Decide from the pilot screenshots whether that reads well in a
  narrow month view. Don't add it by default.
- **Stop publishing completed deadlines.** `taskProjection` returns `null` for
  `status === "done"`. The worker already turns a disappearing item into a
  cancellation with retention, so completed deadlines drop off calendars. Reopening
  a task republishes it under the same UID.
- Deadline titles lose the `[Done]` branch, since it can no longer be reached.

Acceptance:
- A mandatory event's ICS carries the required line; a non-mandatory one doesn't.
- Toggling mandatory bumps `SEQUENCE`.
- Completing a task produces a `CANCELLED` row, and reopening it restores the same
  UID.
- Render tests prove that no notes or description text from the source row reaches
  the output.

### A2. Easier Google, faster Apple

*User impact:* on a computer, Google setup takes one click. Apple users see changes
sooner.

- **One-click Google.** Add a primary button that opens
  `https://calendar.google.com/calendar/r?cid=<encoded webcal URL>`, which lands on
  Google's add-by-URL screen with the link already filled in.
  - Keep "Copy link" with the privacy line as the fallback, and keep the existing
    link to Google's "From URL" page.
  - Trade-off to state in code comments: the secret URL goes into this browser's
    history. Google receives it anyway once the member subscribes. Personal links
    (B1) reduce the damage, because a leaked personal link can be rotated alone.
  - Hide the button on the phone path, which keeps the existing computer handoff.
- **Refresh hints.** Emit `REFRESH-INTERVAL;VALUE=DURATION:PT1H` and
  `X-PUBLISHED-TTL:PT1H` in `renderCalendar`. Apple honours them; Google ignores
  them. The dialog keeps promising "automatic, not instant" updates.

Acceptance: the pilot confirms that the `cid` link pre-fills on Google web, and the
browser test covers the button and the fallback. The rendered ICS contains both
hints and still passes the existing serializer tests (folding, escaping).

### A3. Put the offer where members already are

*User impact:* members learn the calendar exists without being told by an officer.

- **Dashboard card, once.** For members of an org whose feed is live and who haven't
  marked it added (the same `localStorage` record the dialog writes), show a dismissable
  card: *Get chapter events in your own calendar*. It opens the existing dialog.
  Dismissing it is remembered per browser. Hide the card when the feed is off.
- **First visit after approval.** A newly approved member's first `/[slug]` visit
  shows the same card near the top. Don't use a modal: the SemesterGate wall
  already owns the first frame for founders, and new members shouldn't meet a second
  wall.
- **"Tell your members" for admins.** In Settings → Calendar subscription, once the
  feed is on, show a short copyable message with a link to
  `/[slug]/timeline?subscribe=1`. That link never contains the secret. Admins
  paste it into their group chat.
- **"Add this event" on every event sheet.** For people who won't subscribe, or who
  are on a phone with Google:
  - a Google event link (`calendar.google.com/calendar/render?action=TEMPLATE&…`),
    which works on phones;
  - a single-event `.ics` download for Apple and others.

  Both use the same published fields and fixed description as A1, and are one-time
  copies. The UI says *won't update if the event changes* and links to the full
  subscription.
- **Reminder copy.** Based on the pilot, add one line to each provider's steps
  explaining how to turn on default alerts for this calendar. Don't emit `VALARM`
  (see Deliberately not doing).

Acceptance:
- The card appears only while the feed is live and the member hasn't marked it
  added or dismissed it.
- The admin message contains no secret.
- The single-event export matches the feed's fields for that event.
- The browser test covers the card, the admin message and both single-event links
  at 375px.

## Phase B: Personal calendars

Phase B carries over v2's Release 2 with three changes: smaller preferences, a
better default, and a new **last-fetched** signal (B3), which is the main reason to
build it.

### B1. A personal link for each member

The same as v2 2.1:
- **Storage and access.** A `CalendarMemberFeed` table: `organizationId`,
  `brotherId`, `publicId`, `tokenDigest`, `tokenCiphertext`, `generation`,
  `preferences Json`, and timestamps. It's unique on
  `(organizationId, brotherId)`, has the `org_isolation` RLS policy and the
  `_id_seq` grant to `figurints_app`, and is reached through a scoped
  `ctx.db.calendarMemberFeed` delegate.
- **Route.** Reuse `/api/calendar/feeds/<publicId>/<secret>.ics`, looking the
  credential up in both tables.
- **Revocation.** It happens in two places. An event handler deletes the row when
  the member is removed or archived. The feed service also checks on every fetch
  that the Membership is live, so revocation holds even if the handler failed.
- **Rotation.** Members can rotate their own link. The org-wide switch gates every
  personal link.

New in v3: the dialog issues a personal link **by default** as soon as B1 ships. The
shared link stays only for people who already subscribed to it (B4).

### B2. A good default and few settings

- **Default for a new personal link:** all events, plus deadlines **assigned to me**
  (directly or through a role I hold), and **open** deadlines only. This fixes the
  noise complaint without the member touching a setting.
- **Settings**, under one "What's in my calendar" disclosure:
  - Deadlines: *assigned to me* (default), *all*, or *none*.
  - Event categories to hide, from the org's `CalendarEventType` list.
  - v2's "show completed deadlines" toggle is dropped. After A1, completed deadlines
    aren't published at all.
- **Mechanics.** Keep v2's design:
  - Filtering happens when the feed is served, over the shared org projection.
  - A non-published `CalendarFeedItem.audience Json` holds assignee brother IDs and
    role IDs. It's never serialized.
  - Role IDs are resolved when the feed is fetched.
  - The member's preferences and resolved audience are hashed into the ETag.
- **Items a filter excludes:** omit them, or send `CANCELLED`, depending on the
  pilot's answer (Step 0), exactly as v2 describes.

### B3. A real "connected" signal (new)

*User impact:* members and admins can finally see whether a calendar is actually
subscribed.

- **Record fetches.** Store `lastFetchedAt` and `lastFetchedAgent` (a coarse client
  label: *Google*, *Apple*, *other*, derived from the user agent) on
  `CalendarMemberFeed`.
  - Update both on every successful fetch, including a 304.
  - Throttle the write to at most once per 15 minutes per link, so provider polling
    doesn't turn into write load.
  - Never store IPs or the raw user agent.
- **What members see:**
  - *"Your Google calendar last checked for updates 40 min ago."* The "I've added it"
    self-report is replaced once the link has been fetched.
  - If the member marked it added and it has never been fetched after a day: *"We
    haven't seen your calendar app pick this up yet"*, with a link to the
    troubleshooting panel.
  - If it hasn't been fetched in 7 days: *"Your calendar app stopped checking. Did you
    remove it?"*
  - The copy says "checked", never "connected" or "synced". A fetch proves the link is
    live, not that the calendar is visible.
- **What admins see.** Settings shows *"23 of 41 members have a calendar
  subscribed"* (fetched within 7 days). It shows no names by default: who subscribes
  to what is the member's business. It also has a button to copy the A3 message
  again.
- **Metrics.** This is the adoption number v2 couldn't collect: subscribed members /
  active members, per org, over time. It also gives provider mix.

Acceptance:
- A 304 updates `lastFetchedAt`, subject to the throttle.
- A removed member's link returns 404 and no longer counts.
- The admin count excludes links not fetched in 7 days.
- No IP or raw user-agent is persisted.

### B4. Moving people off the shared link

The same as v2 2.3. The admin **Retire shared link** banner prompts subscribers of
the shared link to switch, with steps to remove the old calendar so they don't see
duplicates. B3's count lets the admin see when enough people have moved. The shared
link has no per-member fetch data, so the banner only shows that the shared link is
still being fetched (fetched within 7 days) and makes no per-person claim.

## Later, only if the data asks for it

- **One calendar across chapters** for a member of several orgs: one link, with each
  entry prefixed by the org. Worth it only if B3 shows multi-org members subscribing
  to several feeds.
- **Direct Google integration** (push, instant updates). Reconsider only if slow
  Google refresh is still the top complaint after Phase A.
- **Public or guest calendars** (rush events, alumni) as a separate, explicitly
  public feed. This is a product decision, not a toggle on the member feed.

## Deliberately not doing

- **Built-in reminders (`VALARM`).** Google ignores alarms in subscribed calendars,
  and Apple strips them by default. We'd promise something that mostly won't
  happen. A3 teaches members to set default alerts instead.
- **Two-way sync, RSVP from the calendar, recurrence editing.** Same reasons as v2.
- **Publishing notes or descriptions.** The fixed-description approach in A1 keeps
  v1's field allowlist.

## Delivery order

1. **Step 0**, including the pilot.
2. **A1 and A2.** They're small, touch only the render path and the dialog, and
   every existing subscriber benefits immediately.
3. **A3.** This is the adoption push. Ship it only after A1, so new subscribers get
   the better entries.
4. **B1 + B2 together.** A personal link without a better default isn't worth the
   migration.
5. **B3**, then **B4** once B3 shows how many people are on personal links.

Conventions as in v2: thin controllers, scoped services, event handlers for side
effects, Zod in `lib/validation`, and the installed Next.js guides before touching
routes or UI. Preserve stable UIDs, cancellation history, the published-field
allowlist and org isolation.

Tests:
- Extend `tests/calendar-feed/integration.test.ts` for mandatory publishing, the
  completed-task cancellation, the refresh hints, single-event export parity,
  personal-link revocation, preference filtering and ETag variance, and
  fetch-recording throttling.
- Extend `scripts/test-calendar-subscription-browser.ts` for the one-click Google
  button, the dashboard card, the admin message, the event-sheet links, and the
  "last checked" states.

Measure (never URLs or secrets):
- share of active members with a personal link fetched in the last 7 days (from B3);
- provider mix;
- share of published events that are `timeUnconfirmed` (carried over from v2);
- dashboard card open rate vs. dismiss rate (needs a minimal server-side counter,
  since there's no client analytics).
