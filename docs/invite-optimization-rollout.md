# Invite optimization rollout

Status: September 15, 2026. Implementation is committed through `7457b5d`.
The browser/server dev-bypass import split remains uncommitted. Unrelated
in-progress auth and welcome changes are preserved. This is a rollout runbook;
**no production migrations, deployment, or recovery schedule have been performed.**
See [the original review and plan](invite-optimization-plan.md) for rationale;
its descriptions of pre-implementation behavior are historical.

## Implemented behavior

- Applicants explicitly submit a request after signing in. A pending request
  creates no identity, membership, or invite redemption. Officers review admission.
- Submission, approval/rejection, invite reservations, and billing seat checks
  use atomic database boundaries. Repeated/concurrent decisions cannot partially
  admit someone. Pending requests reserve link capacity; rejection releases it.
  Link capacity and paid-plan seat availability are separate limits.
- Approval reuses the account's shared Brother identity and creates an org-local
  Membership. Cross-org roster access remains subject to enforcing RLS.
- A rejection blocks reuse of the same link; a different valid link permits
  resubmission. Dead replacement links cannot revive requests. Existing pending
  requests remain reviewable after link revocation or expiry; revocation stops
  new requests rather than cancelling the queue.
- Join and org waiting screens share consistent states, preserve confirmed state
  during transient failures, and recover polling. Officers get queue pagination,
  search, retry/error states, decision conflict handling, and refreshed counts.
  Invite sharing and capacity counts distinguish waiting from admitted people.
- Admission decisions persist durable events in the committing transaction.
  Immediate delivery is attempted; retry delivery recovers interrupted reactions.
  Delivery is at least once: handlers must remain idempotent. A worker lease lasts
  60 seconds; failures back off from 30 seconds up to one hour.

## Validation record

Earlier session results (reported in the handoff, not rerun as separate groups):
111 targeted tests, 184 billing/tenancy tests including enforcing RLS, nine browser
scenarios, TypeScript, and architecture checks passed. The earlier full suite
reported 1,139 passing tests but had database-hook/worker-start timeouts; that run
was **not a passing full suite**. Its temporary logs and isolated build workspace
were no longer present when this continuation began.

Fresh checks in this continuation:

- Docker restored; `npm run test:db:up` reports a healthy disposable Postgres on
  localhost:54330. Tests reset only the configured disposable test database.
- `npm test -- tests/calendar/notes-authorization.test.ts tests/billing/checkout.test.ts tests/billing/webhook-events.test.ts`:
  **3 files / 26 tests passed**, closing the three previously blocked retries.
- `npm run test:invites:browser`: **all nine scenarios passed** (poll recovery and
  Retry-After, approval redirect, replacement submission, OAuth return URL, queue
  retry, role retry and keyboard focus, approval/badge refresh, share/clipboard
  fallback, mobile overflow). These exercise real components with mocked API/auth
  boundaries. **Real Google OAuth was not exercised.**
- `npx next typegen` and `npx tsc --noEmit`: passed. These do not establish that
  production-build-generated route export checks or prerendering pass.
- `lint:prisma`, `lint:services`, and `lint:home-org`: passed.
  `lint:modules` exited successfully in warning mode, with an existing direct
  `lib/db` import in `app/api/announcement/route.ts:9`. It is not a clean strict
  module-boundary result.
- `npm test`: **85 files / 1,164 tests passed** in 76.44 seconds on the
  current working tree, including the unrelated auth work already present.
  The run emitted `pg` client-query deprecation warnings but no test failures.
- `git diff --check`: passed; final review preserved all unrelated changes.

Local logs: `/tmp/figurints-invite-retry-tests.txt`,
`/tmp/figurints-invite-full-tests.txt`, `/tmp/figurints-invite-browser.txt`,
`/tmp/figurints-invite-typegen.txt`, `/tmp/figurints-invite-types.txt`, and
`/tmp/figurints-invite-architecture.txt`. These are temporary local evidence,
not durable CI artifacts.

### Production build remains a release gate

The earlier isolated production build compiled JavaScript after separating
browser cookie detection into `lib/auth/dev-bypass-client.ts`, but then rejected
extra route-module value exports:

- `app/api/ai/interview/event/route.ts`: `FALLBACK_REASONS`
- `app/api/ai/interview/route.ts`: `REQUIRED_FIELDS`
- `app/api/ai/recommend-setup/route.ts`: `validateRecommendation`

Those exports still exist. They are outside invite scope and are documented,
not changed here. Move them into ordinary modules, update consumers/tests, and
rerun `npm run build` before release. No successful production build is claimed.
The build was not rerun in this continuation. The earlier build used only a
local disposable database (`figurints_invite_build_8149`, port 54330) and dummy
Supabase credentials; no production environment files were copied.

Disk availability recovered from the previously reported 117 MB to about 3.7 GB
at the start of this continuation. No unrelated user files were deleted. Check
space before another build; the previous task-owned `.next` used about 685 MB.

## Deployment sequence

1. Complete the production build gate above and run CI on the exact release
   revision, including the browser/server import split. Review unrelated local
   changes separately when assembling that revision.
2. Confirm a database backup/restore point and verify migration status against
   the existing deployed database. The test harness uses `prisma db push`, not
   the full historical migration chain; it does not prove a fresh installation
   can replay that chain. See `tests/setup/global.ts` for the historical gap.
3. Apply the pending migrations using deployment credentials and the standard
   migration job (`npx prisma migrate deploy`), reviewing all pending migrations
   first. The invite release requires these in order:
   - `20260914000000_shared_identity_roster_read`: SELECT-only Brother policy
     allowing identity reads through an org's own Membership.
   - `20260914000001_admission_event_delivery`: OperationalEvent delivery fields,
     retry index, and nonnegative-attempt constraint. Existing events default
     to not pending; this does not backfill previously lost reactions.
4. Regenerate Prisma (`npx prisma generate`) as part of the release build and
   deploy the application after the schema is ready. Retain `RLS_SET_ORG_ID=1`.
   `DATABASE_URL` must use the scoped app role; `DIRECT_URL` supplies the trusted
   bootstrap/maintenance connection with the required elevated access. Do not
   weaken RLS to work around a rollout failure.
5. **Configure a production schedule** for `npm run events:flush-admissions`
   from the deployed app directory with the deployment's database and reaction
   credentials. No schedule is configured by this change. Start with a one-minute
   interval and tune to backlog/processing time. Inject secrets through the
   deployment secret store. The script loads `.env.local` if present and sets
   `RLS_SET_ORG_ID=1`; do not run it locally against production unintentionally.
   Each invocation processes up to 50 orgs and 20 events per org. Capture its JSON
   `organizations`, `delivered`, and `failed` counts; nonzero failure counts yield
   exit code 1. A successful invocation does not prove the backlog is empty.
6. Exercise the smoke checks below in staging, then with controlled production
   accounts after deployment. Confirm the scheduled worker actually runs and
   drains a retryable event before calling rollout complete.

## Smoke checks and monitoring

- Submit through a valid link, confirm one waiting request and no roster entry,
  then approve and verify admission, refreshed counts, and seat synchronization.
- Reject on link A; verify A remains rejected and valid link B permits a request.
  Verify revoking a link blocks new submissions but preserves pending review.
- Admit a controlled account already in another org; verify the shared identity
  is visible in the new roster and org-local member data remains isolated.
- Test a nearly full link and a nearly full billing plan; reservations and final
  approval must enforce their separate limits and show actionable failures.
- Complete real Google OAuth return and wrong-account recovery. Simulate a
  temporary status failure and verify the waiting screen resumes polling.
- In staging, interrupt/fail a reaction, wait for lease/backoff eligibility, run
  the recovery command, and verify delivery without duplicate business changes.

Monitor oldest pending request age, decision conflicts/capacity failures,
status-endpoint 429/5xx responses, and event backlog age/attempts. Alert on worker
failures and a growing eligible backlog; retain useful event/org identifiers
without logging raw invite tokens or unnecessary applicant data.

## Rollback and deferred work

If application rollout fails, stop traffic to the affected admission paths or
roll back to a reviewed compatible application revision. Retain the additive
schema and queued events during investigation; do not drop the delivery columns
or broaden RLS as an emergency shortcut. Earlier code may lack the shared-identity
and atomic-admission guarantees, so validate any rollback revision explicitly.
Coordinate the worker version with the application/event format and preserve
pending events for later delivery. Restore a database backup only through the
normal incident process, accounting for admissions made after that backup.

Email notifications, distributed rate limiting, QR sharing, and scale-dependent
link-history pagination remain future work. Local status-query benchmarking
reduced database queries from **5 to 3**, with measured p95 **5.5 ms → 2.42 ms**
over 30 local samples. This excludes HTTP/OAuth and is **not a production latency
claim**.
