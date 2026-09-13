# Invite flow review and optimization plan

Reviewed September 14, 2026 against the current working tree. This is a code-based review and proposed implementation plan, not a production incident report. No app behavior was changed, browser walkthrough performed, or database tests run. Existing unrelated work was left intact.

## Recommendation

Keep reviewed joining, shared account identities, and org-local Memberships. Fix state consistency and atomicity first; then connect link management, review, and waiting screens. Performance work should target repeated status reads and unbounded lists, with measurements before larger infrastructure changes.

## How it works today

1. An officer with `MANAGE_SETTINGS` generates a link in Settings → Invitations. The service creates a 256-bit random token, optional label and use cap, and expiry (20 minutes, 1 day, 7 days, 14 days, or never). The UI defaults to seven days with no cap.
2. `/join/[token]` resolves the link and renders org branding. The client calls `/api/auth/invite-status` to resolve guest, ready, pending, rejected, or already-member state. Google OAuth returns to that same link.
3. The signed-in person confirms their name and submits `/api/auth/request-join`. Opening a link alone does not submit. A pending request creates no identity, roster membership, or redemption. One request row exists per org/account; a new link can revive a rejected request.
4. Officers with `MANAGE_BROTHERS` review the oldest-first queue on the roster page. They can decline or approve with an optional role strictly below their own rank.
5. Approval checks billing capacity, then creates/reuses Brother identity and transactionally writes Membership, optional BrotherRole, InviteRedemption, and the approved request decision. A post-commit event triggers seat synchronization.
6. The invite waiting screen polls every ten seconds and redirects on approval. The org-URL waiting screen is static and asks the person to reload. Link management shows admitted people, inactive history, copy, and revoke.

Good foundations already present: strong tokens, Zod validation, controller/service separation for officer routes, scoped roster writes, role-rank checks, explicit account display/switching, distinct dead-link explanations, batched redemption counts, and lazy redemption details. Preserve these.

## Findings and proposed fixes

### P1 — A replacement link cannot reliably recover a rejected person

**Evidence:** [status resolution](/Users/thalhat/figurints/app/api/auth/invite-status/route.ts) selects only request status and returns rejected for any rejected request in the org. [submission](/Users/thalhat/figurints/lib/auth/join-request-submit.ts) correctly compares the stored invite ID to the current invite. [JoinClient](/Users/thalhat/figurints/app/join/[token]/JoinClient.tsx) renders the declined screen with no form on rejected status.

**Consequence:** An officer sends a fresh link as instructed, but the UI still blocks the person from asking again. Service tests cover revival; they do not exercise this status/UI mismatch.

**Plan:** Create one typed bootstrap state resolver shared by status and submission, with current invite ID as input. Membership takes precedence; pending stays pending; rejection blocks the same link; a different valid link allows a new request. A different dead link must not revive the request. Return the stored submitted name separately from Google account name, so a returning pending user sees the name actually under review.

**Acceptance:** A rejected person opens link B after rejection on A, sees the form, submits once, and enters the queue. A still shows rejection until an authorized state change; expired B cannot revive them.

### P1 — Approval and rejection are not atomic decisions

**Evidence:** [join-request service](/Users/thalhat/figurints/lib/services/join-request-service.ts) checks pending status, seats, and global identity before the transaction. Rejection reads pending then performs an unconditional update. [scoped JoinRequest update](/Users/thalhat/figurints/lib/db/tenant.ts) verifies the supplied predicate but ultimately writes by ID, so passing status in the existing update wrapper would not provide compare-and-set semantics.

**Consequence:** Concurrent approve/reject can leave a rejected request attached to an admitted member. Two approvals of different people can both pass the last-seat check. Concurrent approvals of the same new account in different orgs can race the globally unique identity insert. Duplicate same-request approvals can surface database uniqueness failures instead of a useful decision result. These are code-derived race scenarios, not reproduced failures.

**Plan:** Add transaction-bound scoped operations for conditional decisions and seat checks. Serialize admission against a stable org row or use serializable transactions with bounded retries, reading the seat predicate inside the same transaction. Ensure all competing membership-creation paths obey that boundary. Lock/re-read or conditionally claim the pending request inside the admission transaction; roll the claim back if any write fails. Rejection must use the same decision protocol. Handle global identity uniqueness with a narrowly scoped bootstrap identity operation plus retry/re-read, without querying other orgs' roster data or making the entire admission privileged. Define deterministic responses for same-action retries and conflicting decisions.

**Acceptance:** Concurrent approve/reject yields one final decision consistent with membership; two people competing for one seat admit at most one; the same account admitted to two orgs gets one Brother and two isolated Memberships. Failed admission leaves no partial rows.

### P1 — Pending requests consume capacity that the UI does not show

**Evidence:** [submission](/Users/thalhat/figurints/lib/auth/join-request-submit.ts) counts redemptions plus pending requests against maxUses with a documented soft check. [invite service](/Users/thalhat/figurints/lib/services/invite-service.ts) and [token lookup](/Users/thalhat/figurints/lib/auth/invite-lookup.ts) derive active/full using redemptions alone. Approval never rechecks the invite cap.

**Consequence:** A 25-person link can show Active / 0 of 25 used while 25 pending requests prevent every new submission. Concurrent submissions can exceed the cap and later all be approved.

**Recommended policy:** Preserve pending reservations, but make them explicit and atomic: admitted + pending cannot exceed the link limit. Show “12 admitted · 8 waiting · 5 places available.” Rejection releases a reservation. Distinguish “All places reserved” from “Admission limit reached.” Move token validity, cap check, and request write into a coordinated transaction, including concurrent revoke behavior. Reuse already-fetched cap/count data where safe; correctness takes precedence over eliminating reads.

Existing pending requests should remain reviewable after expiry/revocation, consistent with current behavior. State that clearly in the revoke dialog: it stops new requests; it does not cancel existing ones. Recheck the cap when admitting legacy over-cap queues and give officers an explicit resolution rather than silently dropping requests. Keep billing seats distinct from link capacity.

### P1 verification — Bootstrap reads may disagree with enforcing RLS

**Evidence:** [token lookup](/Users/thalhat/figurints/lib/auth/invite-lookup.ts), [invite status](/Users/thalhat/figurints/app/api/auth/invite-status/route.ts), and [landing page](/Users/thalhat/figurints/app/join/[token]/page.tsx) use ordinary unscoped Prisma for OrgInvite, Brother, or Membership. [Prisma initialization](/Users/thalhat/figurints/lib/prisma.ts) initializes app.org_id to empty; the declared architecture requires enforcing org policies. JoinRequest submission already uses the privileged bootstrap client. Migration history also contains a permissive-policy revert, so deployed role/policy state cannot be inferred solely from file names or comments.

**Plan:** First verify using a disposable database with actual policies and a non-BYPASSRLS app role. If enforcing as documented, move token resolution to a minimal privileged bootstrap helper and scope subsequent org reads explicitly. Resolve only the caller's identity/membership; return a minimal public org DTO. Do not loosen RLS or scope identity by Brother.organizationId. Decide whether public headcount is needed; waiting responses currently compute and return it despite comments promising no headcount.

**Acceptance:** A real app-role guest resolves a valid token; a multi-org member is recognized; unrelated roster data remains inaccessible. The tests must apply policies: the default [test setup](/Users/thalhat/figurints/tests/setup/global.ts) uses schema push, which does not exercise migration-defined RLS.

### P2 — Transient errors erase the waiting state

**Evidence:** [JoinClient refresh](/Users/thalhat/figurints/app/join/[token]/JoinClient.tsx) falls back to ready/guest on a failed status response, including 429. Changing pending to ready stops the polling effect. The ten-second interval also runs without visibility checks or an in-flight guard.

**Plan:** Preserve the last confirmed state. Show “Connection interrupted — retrying” and a Check status button; use a separate explicit state for an expired session. Poll only while visible, schedule after completion, prevent stale responses, back off with jitter, and honor Retry-After. Share an authenticated own-request status endpoint with the org-URL waiting page so polling does not require repeated public token resolution or headcount queries. Make account switching available on declined/dead outcomes too.

At six requests per minute per waiting tab, twenty tabs behind one IP consume the full 120/minute status budget before mounts and OAuth retries. This is arithmetic from configuration, not observed traffic. Separate authenticated per-user status limits from coarse public abuse protection; introduce distributed limits if deployed across instances, since the current limiter is process-local.

### P2 — The officer queue hides failures and gets stale

**Evidence:** [JoinRequestsPanel](/Users/thalhat/figurints/app/components/dashboard/JoinRequestsPanel.tsx) loads once, silently catches errors, and renders nothing for either an empty queue or failed initial load. Role loading failures also look like no available roles. Decline has no shared busy guard. [Roster wiring](/Users/thalhat/figurints/app/[slug]/brothers/page.tsx) refreshes roster on approval; the panel does not explicitly invalidate the sidebar pending count after either decision.

**Plan:** Add compact loading/error/retry states without blanking the roster. Refresh queue/count on focus and after decisions; reconcile 409 conflicts as “Already reviewed by another officer.” Disable duplicate decision submissions and show errors inside the review dialog. Distinguish role-loading failure from no grantable roles. Fetch a small paginated queue with stable createdAt/id ordering, total count, source-link filter, and optional search. Show seat availability to authorized reviewers before submission while retaining the authoritative transaction check.

### P2/P3 — Complete the invitation workflow and reliable delivery

**UI plan:** Add a permission-aware Invite action near the roster review queue, reusing link management rather than granting MANAGE_SETTINGS to reviewers. Start with cross-links between Settings links and roster requests. After creating a link, show a dedicated share result with selectable URL, Copy, and optional device Share/QR actions. Use “Create invite link,” “Request to join,” and “Approve member” consistently. Link cards should expose waiting/admitted counts and a Review requests shortcut, with request details still gated on MANAGE_BROTHERS. Add cursor pagination to link history and redemptions only when needed by scale. Offer “Create replacement link” on inactive links; never reactivate a revoked token silently.

**Notifications:** Current submission records OperationalEvent directly and does not dispatch handlers. Approval uses [emit](/Users/thalhat/figurints/lib/events/emit.ts) after commit; [seat sync](/Users/thalhat/figurints/lib/events/handlers/sync-seats.ts) is an in-process reaction. A crash after commit can lose required follow-up work. Extend the event mechanism with a transactionally persisted outbox and idempotent retry delivery. Provide a narrow bootstrap event writer for submissions instead of manufacturing member context. Register officer request alerts and applicant decision notices through handlers. Coalesce officer alerts during recruitment; avoid sending one notification per poll or duplicate submit. Applicant notices need an account-recipient path because a rejected applicant has no Brother. Email delivery is a later implementation capability, not assumed to exist.

## Delivery sequence

1. **State correctness and RLS verification:** shared state rules, replacement-link regression, real-policy integration harness, minimal bootstrap reads, pending error recovery. No schema expansion unless the verification exposes a necessity.
2. **Atomic admission and capacity:** decision protocol, scoped transaction helpers, seat and identity races, reservation enforcement, explicit pending/revoke semantics, and capacity DTO/UI. Ship backend compatibility before dependent UI changes.
3. **Review and sharing UX:** visible queue errors, invalidation, conflict handling, share result, cross-links, accurate counts, unified waiting experience. Verify keyboard focus, screen-reader status announcements, narrow mobile layouts, OAuth return, clipboard failure, and wrong-account recovery in a browser.
4. **Scale and delivery:** measure status query volume/p95, then reduce redundant reads, paginate growing lists, and add durable events and notification handlers. Preserve tenant scoping in cache keys and never share-cache account-specific responses. Do not begin with realtime infrastructure; robust polling is a smaller first improvement.

Each step is a reviewable change set; the concurrency work may need separate database/helper and service PRs. Effort depends chiefly on the existing billing/event interfaces and real-policy test harness, so exact day estimates would be premature.

## Verification and success criteria

Existing [invite tests](/Users/thalhat/figurints/tests/invites/invite-service.test.ts) and [join tests](/Users/thalhat/figurints/tests/invites/join-request.test.ts) cover many sequential service invariants. Extend them with API/UI state parity and deterministic concurrent transactions, rather than duplicating happy-path tests.

- No identity or membership exists before approval; all approval writes succeed or roll back together.
- Rejection/new-link recovery, pending on dead links, already-member on dead links, and name preservation agree across GET, POST, and browser.
- Race tests cover double submission, resubmission overlapping officer decision, approve/approve, approve/reject, last seat, last invite place, and cross-org identity reuse.
- RLS tests run with migration-equivalent policies and distinct application/bootstrap roles; org A cannot review org B requests.
- A failed poll retains pending and resumes after recovery. A failed queue load is visibly different from no requests.
- Track request-to-decision median/p95, oldest pending age, completed admissions, failed/blocked decisions by reason, status 429/5xx, query count/p95 per status call, and outbox retries. Instrument real submission transitions once, keyed by request/attempt, without raw invite tokens or unnecessary personal data. Establish a baseline before promising percentage improvements.

Product choices recommended here: retain officer approval; reserve link capacity for pending requests; preserve pending requests after revoke/expiry; keep sharing permission distinct from roster review. Public links are transferable, so “different link” does not prove an officer personally sent it to that applicant. If personal re-invitation is desired, add explicit officer reopen or account-bound invitations as a separate policy change.
