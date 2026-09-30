# Calendar subscriptions v2

Proposed September 29, 2026. **1.1 and 1.2 implemented September 30, 2026;
1.3, 1.4 and 1.5 implemented September 29, 2026** (see "Status" at the end);
Release 2 is still a plan.
Builds on `docs/calendar-subscriptions-plan.md` (v1 design) and
`docs/calendar-subscriptions-rollout.md` (v1 deployment). Supersedes the earlier
v2 "ease of use" draft, keeping its setup/troubleshooting ideas.

## The short version

v1 built a careful, safe feed. However, as the code stands, members would find it
disappointing, and admins could not keep it running on their own:

1. **Most things show up as all-day.** Only the timeline's event form can record a
   real start and end time, and even there a new event defaults to *All-day*. Parties,
   service projects and programming events have no way to enter a time. Changing a
   party's date also silently wipes any time that was set on its calendar entry. So a
   7pm chapter meeting appears as an all-day block, often with "Time to be confirmed".
   That makes the subscription useless for its main job: knowing when to show up.
2. **Admins can't turn it on or keep it on.** Enabling requires a validation step
   that exists only as a terminal command (`npm run calendar:feeds -- validate`). If
   an admin later corrects the organization's time zone in Settings, the feed turns
   off and stays off until someone runs that command again.
3. **Setup is a wall of text.** One dialog lists instructions for three providers,
   plus a raw URL. Google's subscription flow only works in a computer browser, and
   the dialog never says so.
4. **Clicking a deadline in your calendar doesn't open it.** The tasks page reads
   `?task=` once, on mount, before the task list has loaded, so a cold visit from a
   calendar app lands on the list with nothing selected. When it does match, it opens
   the *edit* form, including for members who can't manage tasks.
5. **Everyone gets everything, via one shared link.** Every dated task in the org
   (including completed ones) appears for every member. And removing someone from the
   roster can't cut off their feed without breaking it for everyone else.

v2 fixes these in two releases. **Release 1** makes the shared feed worth
subscribing to and lets admins run it without an operator: items 1–4. **Release 2**
adds personal links and filters: item 5. Items 1 and 2 matter most; without them,
polishing the setup dialog just leads more people to an all-day calendar.

Supported providers stay **Google Calendar and Apple Calendar**. Outlook setup and
acceptance are deferred, and the backend stays standard ICS. Two-way sync stays out.

## Prerequisite (unchanged from v1, still not done)

No live-provider acceptance has been performed (rollout doc, "Provider acceptance").
Run it for Google Calendar web (then check the Android/iOS apps) and Apple Calendar
(Mac + iPhone) **during** Release 1, on a pilot org. Beyond the v1 checklist, record
one behavior Release 2 depends on: **when a subscribed feed simply omits an event
that was previously present, does each client remove it?** Also test with
`STATUS:CANCELLED` rows. Release 2's filtering design below branches on this answer.

---

## Release 1: worth subscribing to, and self-serve

### 1.1 Real times on every kind of event (highest impact)

*User impact:* the calendar shows when things actually happen.

- **Timeline form:** default the *Schedule* choice to **Timed** for new events. Use
  the org's confirmed time zone automatically, with no IANA text box: show the zone as
  a read-only label with a "different time zone" disclosure that opens a searchable
  city picker. Keep the explicit-offset control for repeated DST hours, but only show
  it when `wallTimeToInstant` actually rejects the time as ambiguous.
- **Programming, service projects, parties:** add the same start/end control
  (extract it from `CalendarEventForm` into a shared `ScheduleField` component).
  `programming` and `service-event` validators already accept `schedule`; add it to
  the party validator and `updateParty`.
- **Fix the party date bug:** `updateParty` writes only `date` to the linked
  `CalendarEvent`, and the `calendar_schedule_invalidate` trigger then nulls
  `schedule`, so the event falls back to all-day. Make party updates write a full
  `schedule`. When only the date moves on a timed event, move it to the same
  local wall time on the new date (re-validated through `wallTimeToInstant`) rather
  than dropping it.
- **Audit the other legacy writers** that change `date`/`time` without `schedule`
  (grep for `calendarEvent.update` / `updateMany` and programming mirrors). The
  trigger keeps them safe but lossy; each one should either write `schedule` or be
  documented as intentionally clearing it.
- **Turn "Time to be confirmed" into a to-do list.** Admins see *N events are showing
  as all-day in members' calendars*, each with an inline time editor. This replaces
  the textual audit list for this issue class.

Acceptance: a new timed event created from each of the four editors publishes with
correct UTC start/end; a party date change keeps its time; the count of
`timeUnconfirmed` items for a pilot org is visible to admins and trends toward zero.

### 1.2 Admins can enable, pause and recover without an operator

*User impact:* the feed can actually be switched on, and a routine settings change
doesn't break it for everyone.

- **Move validation into the app.** Add a `validate` action to
  `manageCalendarSubscription` that does what `scripts/calendar-feeds.ts validate`
  does: zone present, credential provisioned, no blocking audit items, and a
  successful full projection. Run the projection as durable work (bump
  `CalendarFeedWork.version` with a reconcile flag) and let the Settings UI poll health,
  rather than doing a 60s projection inside a request. Keep the CLI command as a
  thin wrapper around the same code.
- **Provision the credential on demand.** If `tokenCiphertext` is null and
  `CALENDAR_FEED_KEY` is configured, `validate` creates it. Operators keep control of
  the deployment gates only (`CALENDAR_FEED_ORGS`, the redaction flag, the key).
- **Time-zone changes no longer turn the feed off.** Today they set `enabled=false`
  and `validatedAt=null`. Instead, save the zone, re-run validation automatically,
  and keep serving while it runs (the feed already returns 503 while work is pending,
  so no wrong data is shown). Before saving, explain the effect: existing timed events
  keep their absolute times, and new events use the new zone.
- **Readiness checklist** in Settings → Calendar subscription: *Time zone → Fix
  blocking items → Check publication → Turn on for members*. Each step shows its
  state and why a control is disabled. Blocking items (unlinked service projects,
  legacy deadline rows, unlinked parties) link to the record that needs fixing.
  Ambiguous repairs stay manual; nothing is auto-matched.
- Move URL regeneration into an "Advanced" disclosure with plain consequences:
  *everyone who subscribed will need to add the new link*.

Acceptance: on a pilot org with the env gates open, an admin can go from nothing to
enabled, change the time zone, and stay enabled, without a terminal. Members can't
invoke any of it. The browser test covers each disabled-state explanation.

### 1.3 Guided setup for members (Google and Apple)

*User impact:* people finish setup without help.

Carried over from the earlier draft:

- Rename the timeline button to **Add to my calendar**. Choose Google or Apple
  (preselect from the user agent, but switchable), then show only that provider's steps.
- **Apple:** `webcal://` button first. Fallback steps for Mac and iPhone/iPad. Note that
  choosing iCloud as the account syncs the calendar to all devices.
- **Google:** say up front that it needs a computer browser. On a phone, show a
  copyable link to `/[slug]/timeline?subscribe=google` to open on a computer
  (an "email it to me" option only if transactional email already exists). That link opens this dialog after sign-in; it never contains the
  feed secret.
- Preview before setup: org name, what's included (events, deadlines), what isn't
  (notes, people, money), and the next 3 upcoming entries. Read the preview from
  `CalendarFeedItem` so it matches the feed exactly.
- A one-line privacy note next to the copy button: *Anyone with this link can see your
  organization's published schedule. Keep it private.*
- "I've added it" is a self-reported confirmation. Never show "Connected".

Acceptance: the four-of-five unassisted-completion usability target from the earlier
draft, per provider. Also: keyboard access, clipboard failure fallback, focus
restoration, and narrow screens.

### 1.4 Calendar links open the right thing

*User impact:* tapping an entry in your calendar takes you to it. This is a small fix,
but every deadline link hits it.

- `tasks/page.tsx`: handle `?task=` whenever it's present and `taskList` is loaded,
  guarded by a ref like the timeline's `didDeepLink`, instead of once on mount. Members
  without `MANAGE_TASKS` should get a read-only view, not `openEdit`.
- If the item no longer exists or isn't visible, say so ("This deadline was removed"),
  rather than showing the list with nothing highlighted.
- Verify cold load through sign-in, and for multi-org accounts whose active org
  differs from the link's slug. The timeline already waits for its data to load; just
  confirm it behaves the same way.

### 1.5 Status and troubleshooting

- Members see "Calendar updated by ChaptOS · 3 min ago" (from
  `CalendarFeedWork.processedAt`) and a **Calendar not updating?** panel. It separates
  *ChaptOS is still publishing*, *your calendar app hasn't refreshed yet (Google can
  take up to a day)*, *your organization paused or replaced the link*, and *you
  imported a file instead of subscribing*.
- Never render missing health data as healthy. Remove internal words ("projection")
  from UI copy.

---

## Release 2: personal links and filters

*User impact:* your calendar shows what matters to you, and leaving the org actually
ends access.

### 2.1 Per-member credentials

- A new `CalendarMemberFeed` table: `organizationId`, `brotherId` (the Membership
  key, per AGENTS.md), `publicId`, `tokenDigest`, `tokenCiphertext`, `generation`,
  `preferences Json`, and timestamps. Unique on `(organizationId, brotherId)`. RLS
  `org_isolation`, sequence grant for `figurints_app` (see memory: app-role sequence
  grants), and a scoped `ctx.db.calendarMemberFeed` delegate.
- Route: reuse `/api/calendar/feeds/<publicId>/<secret>.ics`, with the credential
  lookup checking both tables. A `FeedContext` gains an optional `brotherId`.
- **Revocation:** an event handler on member removal/archive deletes that member's row,
  and the feed service also checks the Membership is live on every fetch. So a removed
  member gets 404 on their next poll, even if the handler failed.
- Members can rotate their own link. The org-wide enable switch still gates every
  personal link.

### 2.2 Preferences

- Categories (from the org's `CalendarEventType` list), plus deadlines: *none / assigned
  to me / all*, plus *show completed deadlines* (off by default for new personal links).
- Filtering happens **at render time** over the shared org projection, so there is
  still one worker pass per org, not one per member. To support "assigned to me",
  the worker stores task assignee brother IDs and role IDs in a new
  **non-published** `CalendarFeedItem.audience Json` column. It is never serialized
  into ICS. The feed service resolves the member's role IDs at fetch time, so role
  changes take effect on the next poll without a re-projection.
- Hash the member's preferences and resolved audience into the ETag. The ETag must
  change whenever the member's filtered output would.
- **Removing items that a filter now excludes** depends on the pilot finding:
  - If clients drop omitted events (expected for true subscriptions), filtered-out
    items are simply omitted.
  - If not, render them as `STATUS:CANCELLED` under the same UID for the retention
    window. This is stateless: no per-member delivery ledger.

### 2.3 Moving people off the shared link

- New subscribers get personal links. The shared link keeps working for existing
  subscribers, but an admin banner offers **Retire shared link**. That shows members a
  "Switch to your personal calendar" prompt, with steps to remove the old calendar so
  they don't see duplicates.
- Retiring the shared link is a deliberate admin action. It is not automatic, and the
  UI says plainly that people who already downloaded events keep them.

Acceptance: one member's preference change affects no one else's output or ETag; a
removed member gets 404 on the next poll, including with a previously valid
`If-None-Match`; an assignment change adds or removes the right deadlines without
duplicates after a provider refresh; cross-org isolation holds for a member of two orgs.

---

## Delivery order

1. Pilot org + provider acceptance run, in parallel with 1.1.
2. **1.1 Real times** and **1.4 Links**. These are independent and can ship behind the
   existing rollout gate.
3. **1.2 Self-serve admin.** After this, open `CALENDAR_FEED_ORGS` to a handful of
   orgs.
4. **1.3 Guided setup** and **1.5 Status**, then widen the rollout.
5. Release 2, once Release 1 adoption shows people keep their subscriptions.

Conventions: thin controllers, scoped services, event handlers for side effects,
Zod validation in `lib/validation`. Read the installed Next.js guides before touching
routes/UI. Preserve v1's stable UIDs, cancellation history, field allowlist and org
isolation.

Tests: extend `tests/calendar-feed/integration.test.ts` for the party date/time
fix, in-app validation (incl. retry after a failed projection), zone change
without disable, per-member credential lifecycle, preference filtering and ETag
variance. Extend `scripts/test-calendar-subscription-browser.ts` for the provider
chooser, the checklist, and the tasks deep link on a cold load.

Measure (no URLs or secrets, ever): share of published items that are
`timeUnconfirmed`; admin time from first visit to enabled; provider chosen;
self-reported setup completion; 30-day retention via distinct credentials polled.
Polls prove the link is live, not that the calendar is visible.

## Deferred

- Outlook and other providers: setup flows, docs and acceptance.
- Two-way Google sync, recurrence editing, RSVP, reminders. Reconsider direct
  Google integration only if the pilot shows Google's slow refresh is the main
  complaint after guided setup ships.
- Worker sharding: the per-org full rebuild has a 60s transaction budget. Monitor
  worker duration on the largest pilot orgs; act only if it approaches the budget.

## Provider references (checked September 29, 2026)

- [Google: subscribe by URL](https://support.google.com/calendar/answer/37100?hl=en): computer browser only; "From URL".
- [Apple: calendar subscriptions](https://support.apple.com/en-us/102301): per-device setup; iCloud for cross-device.

Promise automatic updates, not instant ones. Refresh timing is up to the provider.

## Status

**1.1 Real times — implemented.** One shared editor
(`app/components/timeline/ScheduleFields.tsx`) now backs the timeline,
programming, dashboard, party and service forms. New events default to a start
and end time in the org's zone (falling back to the device zone, shown as such).
The zone can be changed per event from a searchable list. A repeated DST hour
shows a "first/second time" choice. A skipped hour is refused with an explanation.
Existing untimed events still open as all-day, so unrelated edits aren't blocked.
Date-only changes in every service (calendar, party, service, programming) now
keep local start/end times via `lib/calendar-feed/reschedule.ts`, and refuse a
move onto a skipped hour. Previously the DB trigger silently dropped the time.
Party and service responses carry the linked entry's timing, so their editors
never reopen a timed event as all-day. The admin list of events that show as
all-day has a per-event "Set time" editor, prefilled only from unambiguous text
("7-9pm" → 19:00–21:00).

**1.2 Self-serve admin — implemented.** Settings shows a four-step checklist:
time zone, blocking items (linked to where they're fixed), publication check,
and on/off. The check runs through the worker (`validationRequestedAt`, settled
after a full projection; see the rollout doc, step 6) and creates the credential
if missing. A time-zone change no longer disables the feed. Regeneration moved
under "Advanced".

Not done in 1.1/1.2: a searchable *city-name* index (the picker searches IANA
IDs such as `America/Chicago`); converting legacy free-text times in bulk; and
verification against a real dev database and running worker (checked here with
integration tests, the component browser test, and screenshots only).

**1.3 Guided setup — implemented.** The timeline button is now **Add to my
calendar** and opens one dialog (shared by the mobile and desktop toolbars). It
starts with a preview: the org name, the next three entries read from
`CalendarFeedItem` (`lib/calendar-feed/preview.ts`, same published rows and
cutoffs as the feed; returned only while the link is live), and what is and isn't
included. Then a Google/Apple choice, preselected from the user agent, showing
only that provider's steps:
- *Google:* copy link (with the privacy line), a link to Google's "From URL" page,
  paste. On a phone it says Google needs a computer browser and offers a copyable
  `/[slug]/timeline?subscribe=google` link instead (no secret; sign-in keeps
  `?next=`), plus "I'm on a computer" in case the guess is wrong. No email
  option: the app has no transactional email.
- *Apple:* `webcal://` button first, the iCloud note, and Mac / iPhone fallback
  steps behind a disclosure.
- "I've added it" is stored per browser in `localStorage` and only ever says
  "You marked this as added". The dialog never claims a connection.
The copy button falls back to selecting the link with a manual-copy message when
the clipboard is refused. Focus returns to the trigger on close. The
`?subscribe=` param is dropped on close. Settings no longer repeats member steps;
it points to the timeline. Outlook instructions were removed (deferred above).

Not done in 1.3: the unassisted-completion usability study (needs real people);
"provider chosen" and "self-reported completion" metrics, because the app has no
client analytics pipeline yet. Checked with the integration and preview tests and
the component browser test (chooser, keyboard, clipboard failure, focus, iPhone
handoff, 375px width). The real-app timeline was checked only for the button and
the `?subscribe=` open/close, because the running dev server predates the
calendar migrations and its stale Prisma client returns 500 for the subscription
API.

**1.4 Calendar links — implemented.** `tasks/page.tsx` now handles `?task=` /
`?poll=` / `?new=` / `?newPoll=` once the current user and the relevant list
(`loadedSections` "deadlines" / "polls") have loaded, guarded by a ref keyed on
the query string, instead of once on mount against empty lists. Managers still
get the edit form; everyone else gets a read-only task sheet (due, status,
assignees, notes), where an assignee can mark it done, and the poll's voting
view instead of the poll editor. A link to a task or poll that isn't in the list
shows "This deadline was removed…". The timeline's `?event=` now waits for the
calendar fetch to settle rather than for a non-empty list, and says "This event
was removed…" on a miss (a failed fetch keeps its own error banner). Cold load
through sign-in keeps the query (`proxy.ts` `?next=`), and the `/[slug]` layout
resolves the org from the URL slug, so a multi-org member lands in the link's
org without a cookie-sync reload. Not checked in the running app: the dev server
predates the calendar migrations (see 1.3).

**1.5 Status and troubleshooting — implemented.** Members get
`status: { state, updatedAt }` and the link `generation` from
`getCalendarSubscription` (admin `health` stays admin-only). `state` is
`current`, `publishing`, `retrying`, or `unknown`; no work row or no successful
publish is `unknown`, never current. The dialog shows "Calendar updated by
ChaptOS · 3 min ago" (or publishing / retrying / not published yet) under the
preview, and a **Calendar not updating?** panel covering the four causes. It
opens by itself when publishing is behind or the link changed. "I've added it"
now records the link generation, so a member whose link was later replaced sees
"Your organization replaced this calendar link" and can re-add, and a member who
had added it sees "paused" rather than "off" when the feed is disabled. No
"projection" wording remains in UI copy. Checked with the component browser test
(status line, panel, replaced and paused notices); the new integration test for
the status states and generation bump is written but was not run, because the
Docker test database wasn't responding.
