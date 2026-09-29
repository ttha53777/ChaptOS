# Calendar subscriptions: deployment and pilot

The implementation is disabled by default. It does not enable production feeds,
run production migrations, or claim calendar-client compatibility. Two-way Google
sync remains the separate later integration described in the original plan.

## Deployment configuration

- `RLS_SET_ORG_ID=1` is mandatory.
- `CALENDAR_FEED_KEY`: a dedicated 32-byte cryptographically random key, encoded as
  64 hex characters, stored in the deployment secret manager. Back it up securely.
  Do not reuse an auth/session key. Ciphertexts use AES-256-GCM with the public
  feed ID as authenticated data. Losing the key requires regenerating URLs.
- `CALENDAR_FEED_ORIGIN`: canonical HTTPS origin, with no path, credentials, query,
  or fragment. Keep it stable; if it changes, force reconciliation for each org.
- `CALENDAR_FEED_WORKER_ENABLED=1`: enables low-latency domain-event wakeups. It is
  optional for correctness; the durable scheduled worker below is required.
- `CALENDAR_FEED_ORGS`: comma-separated pilot org IDs. Empty disables all feeds.
  Use `*` only after the provider pilot is accepted.
- `CALENDAR_FEED_PATH_REDACTION_VERIFIED=1`: set only after verifying the next
  section. Without it, polling returns 404 and URL retrieval stays unavailable.

The migration provisions disabled rows for every existing/new organization.
Credentials are populated for new orgs when the key is configured; the provision
command fills missing credentials for older orgs. It does not rotate existing URLs.

## Secret-path handling: required before any public pilot

The bearer secret is part of `/api/calendar/feeds/<public-id>/<secret>.ics`.
Application metrics use a redacted route and omit URLs, request headers, source
notes, and exception text. Sentry drops events containing this route entirely.
Management responses are `no-store`; feed responses require private revalidation
and explicitly disable CDN storage. There is no credential-bearing analytics event.

Application code cannot redact a hosting provider's access logs. Configure and
verify redaction/exclusion in ingress, CDN, WAF, load balancer, APM, log drains,
request replay and analytics before setting the verification flag. Send a test
request with a disposable synthetic secret, inspect every logging destination,
and record operator/date/evidence outside credential-bearing logs. If the hosting
platform cannot suppress the path, keep feeds disabled and use a suitable ingress.
Never paste a real URL into a ticket, terminal argument/history, or acceptance log.
Forwarded IP headers must be overwritten by trusted ingress; this route uses a
separate 6,000 requests/minute per-IP in-process burst limiter. Configure perimeter
abuse protection as well for distributed traffic. Do not use member write limits.

## Migration, backfill and validation

Apply `20260929000001_calendar_subscriptions` using the normal deployment migration
process. It adds RLS-protected subscription/projection/work tables, structured JSON
schedules, an officer-confirmed org time zone, and transactional queue triggers.
The triggers must ship with the tables: a schema-only `db push` is insufficient.

1. In Settings → General → Calendar subscription, an officer confirms the IANA
   time zone. No server/browser default is silently assigned. Changing it pauses
   the subscription and requires revalidation; existing timed events retain their
   source zone and absolute instants.
2. Run `npm run calendar:feeds -- provision --org=ID`.
3. Run `npm run calendar:feeds -- audit --org=ID` and review the result.
4. Run `npm run calendar:feeds -- backfill --org=ID`. Date-only calendar entries
   receive exclusive all-day ends. No start/end is invented from free-text time.
   Valid unlinked service projects are linked to newly created calendar entries
   only when there is no potential existing title/date match. Ambiguous matches
   remain blocking cleanup items. Notes are not copied.
5. Resolve remaining unlinked service/party records and legacy calendar deadlines.
   Preserve party attendance links. Review duplicate deadlines against Task rows;
   delete or recategorize the legacy row after confirming its data. Do not synthesize
   party entries or blindly link a similarly named event. Invalid dates are reported
   and excluded; uncertain times publish all-day with the fixed confirmation notice.
6. Run `npm run calendar:feeds -- validate --org=ID`. This requires a zone,
   provisioned credential, no blocking audit items, and a successful full projection.
   The command records data validation; it does not enable the feed or assert
   provider compatibility.
7. Start the worker, verify log redaction, configure the pilot allowlist, and use
   Settings to enable the pilot org. Enable/disable/regenerate are admin-only;
   membership-gated retrieval gives all members the same shared URL.

Audit output contains officer-visible titles/IDs, never secrets or source notes.
Keep operator output internal. Commands without `--org` cover every organization.
Backfill is conservative: unresolved matches require a reviewed, org-scoped repair,
then rerunning the audit. Do not run bulk repairs on a production database without
reviewing the concrete records first.

## Worker and recovery

Run `npm run calendar:feeds -- worker --watch` as a supervised process, or schedule
`npm run calendar:feeds -- worker` at least once per minute. The continuous mode
checks every 30 seconds. Configure the supervisor to restart on process exit.
Do not rely on the web process remaining alive or its in-process handler completing.

Every source write queues work in its own database transaction. A worker locks the
org work row, then reads current scoped sources and updates the projection in one
transaction. It never replays stale payload snapshots. Competing workers serialize;
failed transactions leave pending work intact. Failure metadata supports capped
exponential retry backoff (up to five minutes). A daily full reconciliation catches
missed enqueue work and clears expired canceled payloads while retaining identities.

Feeds are read-only and return 503 with Retry-After when work is pending, failed,
uninitialized, or the database is unavailable. They never report an empty calendar
as recovery from an error. A lagging worker therefore delays provider updates rather
than erasing events. Credentials are checked before conditional GET handling.

Alert on persistent `version != appliedVersion`, rising failures, old `enqueuedAt`,
worker silence, and feed 503 rates. Worker JSON reports org ID, pending state,
failure count and lag. Feed metrics report elapsed time, output bytes, status and
org ID using the redacted route. There is no item-count truncation. Monitor growing
feed sizes and worker duration before raising timeouts or changing the horizon.
One work slot serializes projection per org; evaluate batching/sharding if large
organizations exceed the 60-second reconciliation transaction budget.

Cancellations retain the original UID and increment SEQUENCE. They remain until
the later of cancellation + 90 days or scheduled end + 90 days; after that only
the minimal permanent identity remains. Calendar-event IDs stay canonical for
linked service/party entries. Programming demotion still removes its calendar mirror, but reserves that calendar
ID on the owning programming event. Re-confirmation recreates the same canonical
identity under a row lock, so cancellation/reactivation and rescheduling preserve
the feed UID. No unpublished row is left visible to legacy calendar consumers.
Ordinary edits, task undating/redating, and URL regeneration also preserve identities.

## Provider acceptance (not yet performed)

For Google Calendar web, Apple Calendar on Mac and iPhone, Outlook web and one
supported desktop client, record client/version, test date, anonymized org ID,
observed refresh lag, and pass/fail for:

- Subscribe by URL (not file import), then create → reschedule → rename → cancel.
- All-day and overnight events, a DST transition, Unicode and punctuation.
- Completed/undated/deleted tasks; programming demotion and re-confirmation.
- No duplicate linked service/party entries or leaked notes/people/finances.
- Disable and regenerate, including requests with a previously valid ETag.
- Re-subscribe after rotation; confirm no claim of erasing downloaded copies.
- Worker outage/restart: 503 while pending, successful convergence after retry.

Record observed lag without promising an SLA. Keep the global rollout gate closed
until these pass. Expand the org allowlist gradually while monitoring feed errors,
size/latency, projection lag and cancellation behavior. Provider UI instructions were
checked against [Google Calendar Help](https://support.google.com/calendar/answer/37100),
[Apple's subscription guide](https://support.apple.com/102301), and
[Microsoft's subscription guide](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web).

Rollback: disable the rollout allowlist or org feeds immediately. Keep the worker
and identities until deciding whether to resume, so rollback does not reset UIDs.
Revocation stops future reads but cannot remove previously downloaded data.

## Local verification

Validated on September 29, 2026:

- 312 tests passed across calendar feeds, programming, calendar deletion, parties,
  service, request context, tenancy/RLS and semester-boundary suites.
- `npm run test:calendar:browser` passed against the actual React components with
  a mocked API: subscription dialog, privacy text, Apple link, regeneration
  confirmation, disable, DST gap/repeated-time handling and narrow viewport.
- Production `npm run build`, TypeScript, Prisma/service architecture lints,
  home-org read lint and `git diff --check` passed.
- The complete SQL migration applied successfully to an isolated PostgreSQL 16
  database containing the previous Prisma schema. Integration tests exercise its
  durable triggers and the new tables under the NOBYPASSRLS test role.

These checks do not replace the live provider acceptance exercise above. No
production database migration, feed enablement or hosting configuration was made.
