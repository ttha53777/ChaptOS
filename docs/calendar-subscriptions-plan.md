# Calendar subscriptions

Status: proposed implementation plan · September 29, 2026. Planning only; no application behavior changed.

## Product contract

Every organization gets one private, stable HTTPS `.ics` subscription URL. Members subscribe once in Google Calendar, Apple Calendar, or Outlook; ChaptOS remains the editing source in v1. Put **Subscribe** on the timeline and feed management in organization settings.

The dialog provides Copy URL and provider-specific subscription instructions. Apple can also use a `webcal://` link. Explain that updates depend on the calendar provider's refresh schedule; do not promise immediate delivery. File import is a snapshot, not a subscription.

Members can retrieve the shared URL. Org admins can enable, disable, and regenerate it. Provision the feed for existing and new organizations, with rollout gated until backfill and validation pass. Regeneration requires subscribers to replace their old URL.

“Private” means anyone holding the URL can read the published schedule. It is not tied to the subscriber's login. Removing a member cannot revoke their copy individually; admins must rotate the shared URL. Revocation prevents future fetches but cannot erase previously downloaded data. Per-member revocable URLs are a separate extension if membership-bound access becomes necessary.

## What gets published

- **Events:** scheduled CalendarEvent rows, including chapter and custom categories. Programming-backed rows publish only at confirmed/done stages; ideas and planning stay private.
- **Service projects:** their linked CalendarEvent, once. Audit and backfill valid unlinked ServiceEvent records before enabling feeds.
- **Parties:** their linked CalendarEvent, once. Preserve the existing attendanceEventId relationship. Audit legacy unlinked parties rather than synthesizing duplicate entries.
- **Deadlines:** Tasks with dueDate, as all-day VEVENTs. Prefix titles with “Deadline:”. Include all org-visible dated tasks, not a personalized “assigned to me” view. Completed tasks remain as “[Done]” entries; undated tasks do not publish.

Use CalendarEvent as the canonical scheduling identity for linked records, and Task as the deadline identity. Never independently export both sides of a link. Audit legacy deadline-category calendar rows for duplicates before launch.

Export only title, schedule, location, category, and an authenticated ChaptOS deep link. Omit descriptions initially: CalendarEvent.description participates in meeting notes, and service notes can contain internal detail. Do not export meeting documents/summaries, attendee identities, assignments, finances, custom fields, or party notes. Add a separate explicitly publishable description later if needed.

Default horizon: previous 90 days plus all future dated entries. Do not scope to the active semester, so switching semesters does not wipe the subscription. Order deterministically; monitor size and never silently truncate. Undating or unpublishing an entry must produce a cancellation for its previous published identity.

## Prerequisite: reliable schedule data

Current CalendarEvent.date and time are strings; time is explicitly free text and there is no structured end time. Do not pass these through JavaScript Date parsing or silently invent a start time.

Add an organization IANA time zone and validated structured scheduling fields: all-day dates with exclusive end date, or timed start/end instants with the source time zone. Extend the relevant calendar/programming editors and schemas, preserving existing date/time consumers during migration. New timed events require an end after their start. Check DST gaps and ambiguous times explicitly.

Backfill only unambiguous legacy values using a confirmed org time zone. For a valid date with unknown/ambiguous time, publish an all-day entry with “Time to be confirmed in ChaptOS” and show an officer cleanup list. Invalid dates are excluded and reported. Date-only deadlines remain dates, never UTC-midnight timestamps.

## Feed authentication and tenancy

Proposed route: `GET /api/calendar/feeds/<public-feed-id>/<secret>.ics`, with HEAD support. No browser session, OAuth, or cookies are required for polling.

Add an org-owned CalendarSubscription record with a unique public ID, token digest, encrypted token for authorized URL retrieval, enabled flag, generation, and timestamps. Generate a cryptographically random 256-bit secret; protect ciphertext with server-managed encryption keys. Rotation atomically replaces the credential and invalidates caches. Never store the full URL in activity logs, analytics, exception traces, or access logs; verify hosting-level path redaction too.

Keep controllers thin: Zod parsing, context construction, service call, toResponse error mapping. Extend `buildContext()` with an explicit typed feed-auth mode yielding a read-only feed context, rather than fabricating a member or granting org-admin permissions. Session-backed management routes retain the ordinary context and admin checks.

The feed ID resolves only through a narrowly scoped credential lookup in the auth/data layer. This is the sole bootstrap exception before org context exists; no generic privileged event queries. Verify the token, then build the normal RLS-scoped database access with `RLS_SET_ORG_ID=1`. Derive orgId from the verified credential, never an active-org cookie or unchecked query parameter. Add org isolation policies and scoped delegates for every new org-owned table.

Invalid, revoked, disabled, and unknown credentials return the same 404 without login redirects. Validate credentials before considering If-None-Match, including cache hits. Rate-limit abuse without imposing the interactive member write limit on legitimate provider polling.

## Projection and iCalendar contract

Create a provider-neutral CalendarFeedItem projection with orgId, source type/id, permanent UID, safe published fields, content hash, revision, changedAt, and cancellation state. Uniqueness is org + source type + source ID. Allocate UIDs independently of slug, feed token, title, and date so edits and credential rotation never duplicate events.

Services emit existing domain events; handlers under `lib/events/handlers/` refresh projections. Cover calendar, task, programming stage, party, and service mutations, including deletions and indirect schedule writes. Handlers use scoped data access; services must not call other services.

The current in-process dispatcher can fail after the business write commits. Therefore correctness cannot depend solely on its best-effort handlers: persist durable projection work atomically with source mutations, retry idempotently, and reconcile periodically. Reuse existing durable event delivery only after verifying its guarantees apply to these actions. Delete work must retain the source identity and prior published schedule. Concurrent delivery must never overwrite a newer revision with an older snapshot.

Feed rendering is read-only. Use a maintained RFC 5545 serializer selected during implementation, with:

- VCALENDAR VERSION 2.0, PRODID, calendar display name, and VEVENTs.
- Stable UID, persisted DTSTAMP/LAST-MODIFIED, and monotonic SEQUENCE on published changes. Fetching alone changes none of these.
- UTC timestamps for timed events; DATE values and exclusive DTEND for all-day events.
- Correct CRLF, UTF-8 octet-aware folding, escaping, and protection against property injection through user text.
- No attendees, invitations, email delivery, or RSVP semantics. Deadlines use transparent availability so they do not block an entire day.

Retain canceled entries under the same UID with incremented revision and STATUS:CANCELLED for at least 90 days after cancellation and through 90 days after the original scheduled end, whichever is later. Keep the minimal identity record thereafter to prevent accidental reuse. Verify actual deletion behavior in each client; client refresh controls when cancellations appear.

Return `text/calendar; charset=utf-8`, private revalidation headers, and an ETag derived from deterministic published content. Disable shared CDN caching. A transient database/projection failure returns 503 rather than an empty successful feed that could erase subscribers' calendars. Expose projection lag and failed work to operators.

## Delivery sequence and acceptance criteria

1. **Schedule foundation:** zone and structured time fields, editor/validation updates, legacy audit and backfill. Validate date-only, overnight, DST, and ambiguous legacy cases. Read installed Next.js guides before route/UI implementation.
2. **Feed backend:** credential lifecycle, RLS, read-only context, durable projection, serializer, conditional GET, cancellation retention, reconciliation, and provisioning for existing/new orgs.
3. **Subscription UX:** member dialog, provider instructions, admin disable/regenerate controls, privacy and refresh copy, cleanup list for legacy schedule issues.
4. **Pilot and rollout:** gate to test organizations, subscribe from real provider accounts, then gradually enable for all organizations.

Required tests: two-org isolation with forged IDs and multi-org users; anonymous polling without session; membership-gated URL retrieval; token rotation/disable including conditional requests; output field allowlist; one item per linked source; stable UID on edits; done/undated/deleted task behavior; stage rollback; delayed and out-of-order projection work; restart/retry recovery; invalid dates; all-day boundaries; DST and Unicode escaping.

Provider acceptance requires create → reschedule → rename → cancel, without duplicates, in Google Calendar web, Apple Calendar on Mac/iPhone, and Outlook web plus a supported desktop client. Record observed refresh lag without turning it into an SLA. Serializer unit tests alone do not establish compatibility. Track feed latency/size, fetch errors, projection lag, and cancellation retention without logging secrets.

## Later: two-way Google Calendar sync

Keep the `.ics` feed available for Apple/Outlook and users who prefer read-only subscriptions. Treat Google sync as a separate opt-in integration with explicit admin consent and a dedicated organization calendar; do not mirror personal primary calendars by default.

Add CalendarConnection and ExternalEventMapping records with org isolation, encrypted OAuth refresh tokens, Google calendar/event IDs, local source identity, remote ETag, last common revision, sync token, channel expiration, and sync health. Keep ICS UID separate from Google's event ID. Disconnect stops jobs and revokes credentials without deleting either system's events implicitly.

Implement outbound idempotent writes first, then inbound synchronization. Use a durable queue with backoff; pull incremental changes after webhook signals, renew expiring channels, and recover an invalid sync token with a full reconciliation. Webhooks are wake-up signals, not trusted event bodies.

Define ownership explicitly: title, time, location, and a dedicated public description can sync; attendance, dues, member data, workflow stage, internal notes, and task completion remain ChaptOS-owned. Google-created events initially become generic calendar events, never inferred parties or service projects. Restrict recurrence/unsupported fields until there is a defined local representation; surface them for review instead of discarding data.

Use the last common revision to detect simultaneous edits; route conflicting fields and deletion conflicts to officer review. Suppress echo loops using origin and mapping revisions. Inbound orchestration calls the same validated services with a scoped integration context and emits domain events; event handlers enqueue outbound work. No service-to-service calls or fabricated human actor.

Before enabling two-way sync, settle Google account ownership/officer handoff, OAuth scope/verification requirements, inbound dates outside the active semester, remote deletion policy, and how users avoid showing both ICS and synced copies. Pilot on a dedicated calendar with a disconnect/recovery exercise.

## References

- [Google Calendar: subscribe by URL](https://support.google.com/calendar/answer/37100?hl=en-uk)
- [Apple: calendar subscriptions](https://support.apple.com/en-au/102301)
- [Outlook: importing versus subscribing](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web)
- [RFC 5545: iCalendar](https://www.rfc-editor.org/info/rfc5545/)
- [Google: incremental synchronization and token recovery](https://developers.google.com/workspace/calendar/api/guides/sync)
- [Google: push notification channels](https://developers.google.com/workspace/calendar/api/guides/push)
