# Collaborative meeting notes — implementation plan

Status: implementation enabled in the user's local dev server. The selected Supabase project has the notes migration and private Realtime policies installed. See [implementation and rollout status](collaborative-meeting-notes-rollout.md) for verified behavior, remaining live-user checks, and differences from this original design.

Prepared September 13, 2026 against the current figurints checkout. This replaces the earlier proposal's persistence, initialization, authorization, and reconnect designs. It can be handed to an implementer without the earlier conversation.

## 1. Outcome and decisions

Officers open the existing meeting overlay and take minutes together. Changes appear live; each officer has a colored caret and selection; the header shows collaborators; a small line says “Rob is typing…”. Closing and reopening retrieves the merged notes. Network interruptions produce honest status and recoverable pending edits. Summaries and the timeline continue using plain text.

The UI remains the existing warm, dark meeting overlay: same title/actions, metadata strip, summary card, content width, and minutes section. “Google Docs-like” means collaborative editing behavior and unobtrusive presence, not Google's toolbar, white page, menus, or a wholesale redesign.

Selected stack:

- Stable **Yjs v13**, `y-protocols`, and **CodeMirror 6 with stable `y-codemirror.next`**. Pin compatible releases in the lockfile. Do not copy the upstream development branch's Yjs v14 imports.
- Existing **Supabase Realtime private Broadcast** for small live updates. Use Yjs Awareness over Broadcast for presence, typing, and cursors; do not maintain a second Supabase Presence system.
- Existing **Vercel HTTP endpoints and Supabase Postgres** for durable storage and atomic merges.
- **IndexedDB** for recovery of edits pending server acknowledgement, using `y-indexeddb` where appropriate. Keep a small explicit dirty-generation/outbox record alongside document persistence.
- No Liveblocks, Redis, dedicated WebSocket server, new paid service, or leader election in the first release.

The added hosting cost can be zero while the existing platform quotas have room. This is a goal, not a guarantee: current account usage, database compute, HTTP invocations, egress, and realtime limits must be measured during the pilot.

## 2. Scope

### First release includes

- Concurrent plain-text editing of chapter meeting minutes.
- Colored remote carets, remote selection highlights, and name labels.
- Avatar/initial stacks and human-readable typing indicators.
- Local-only undo/redo through the Yjs editor binding.
- Reliable server persistence, explicit reconnect recovery, and local draft recovery.
- Existing MANAGE_EVENTS edit permission; existing read-only access remains available through the saved plain-text view.
- Correct summary freshness based on content revision.
- Automated concurrency, tenant isolation, protocol, and browser tests.

### Explicitly deferred

Rich-text formatting, comments, suggestions, image embeds, document sharing links, live participation for every chapter member, per-paragraph permissions, full revision-history UI, and user-following/scroll-follow modes. Do not add formatting controls that merely insert literal Markdown while implying rich text.

The first release targets 2–5 officers per meeting and must pass a 10-editor stress test. Ten is a test target, not a new subscription/seat restriction. Larger-room behavior is adaptive, with measurable performance limits rather than an invented billing gate.

## 3. Current code and constraints

- `app/[slug]/chapter/page.tsx`: MeetingDetailOverlay contains the textarea. The parent owns per-meeting draft records, a 600 ms autosave, flush-on-close/switch, and summarize-after-flush behavior.
- `app/api/calendar/[id]/route.ts`: PATCH and DELETE only. There is no existing GET endpoint to reuse for document initialization.
- `lib/services/calendar-service.ts`: generic description replacement, notesUpdatedAt bump, linked ServiceEvent mirror, and calendar.updated emission. Calendar list queries currently include all scalar fields.
- `lib/services/service-event-service.ts`: service notes can also write CalendarEvent.description. Other calendar/programming write paths must be inventoried before rollout.
- `app/api/ai/summarize-meeting/route.ts`: reads description, calls AI, and currently timestamps the completed summary; it does not record the input revision.
- `app/[slug]/timeline/page.tsx`: MeetingNotes reads summary/plain description.
- `lib/context/request-context.ts`, `lib/permissions.ts`: authoritative application access semantics. MANAGE_EVENTS is presently bit 4. Org admins/platform admins have explicit overrides.
- `lib/db/tenant.ts`: ctx.db.$transaction sets app.org_id. Its transaction delegates remain raw, so explicitly scope WHERE/data by organizationId.
- `lib/events/emit.ts`: OperationalEvent emission is best effort; failure does not fail the business write. Event handlers also isolate failures. Neither is a durable collaboration transport or guaranteed audit outbox.
- `app/lib/api.ts`: carries x-org-slug; do not replace it with unscoped fetch calls accidentally using another tab's active-org cookie.
- `lib/rate-limit.ts`: limiter is per process, not a distributed security or spending guarantee.

Read AGENTS.md and the installed Next.js guides before implementation. Current route conventions use Promise params. This checkout has unrelated uncommitted work; scope all edits and commits to the feature.

## 4. UI specification

### Existing shell

Keep the current overlay and header hierarchy. Extract the notes editor into its own client component. Preserve Back, title, Summarize, Edit meeting, Delete, date/time/location, and the summary card.

Replace only the textarea surface with CodeMirror, configured for prose: line wrapping, no gutters, line numbers, syntax coloring, active-line treatment, folding, autocomplete, or code indentation shortcuts. Preserve desktop typography initially; use at least 16 px editing text on mobile to avoid cramped input/browser zoom. Keep the existing minimum writing height and content padding. Do not re-render the whole chapter page per keystroke.

### Collaborator header

- Place up to three overlapping avatars/initials beside the existing save status on desktop; overflow becomes “+N”. Show only other people when useful; avoid a permanent one-person “collaboration” banner.
- On smaller screens, place the collaborator group in the metadata area so title and Back remain usable.
- Clicking or keyboard-opening the group lists each person's org-local name and “Typing”, “Editing”, or “Away”. It is a popover, not a new sidebar.
- Aggregate multiple tabs belonging to one account into one person in the avatar group; show a subtle “2 tabs” detail. Preserve separate caret instances, because each tab can have a different selection.
- Use a fixed accessible collaboration palette with stable assignment by org/account identity. Name labels disambiguate color collisions. Never encode identity by color alone.

### Remote editing

- Render a thin colored caret and soft selection highlight through the binding's decoration layer.
- Briefly show a small name label when someone edits or moves their caret; fade the label after about 2 seconds, retaining the caret. Show the label on hover/focus where practical.
- Never move the local caret, steal focus, or scroll the local viewport to a remote edit.
- Names/colors come from a constrained display model. Escape names; never accept raw HTML, arbitrary CSS, or arbitrary avatar URLs from a broadcast.

### Typing line

Reserve one small line beside/below “Meeting Minutes” to avoid layout jumps:

- “Rob is typing…”
- “Rob and Sam are typing…”
- “3 people are typing…”

Only local document changes, including paste/composition, activate typing. Cursor movement alone does not. Clear typing after 2 seconds without an edit, on blur, and when hidden/disconnected. Receivers also expire typing within 4 seconds without a fresh typing signal; never trust a remote wall-clock timestamp. Do not broadcast on every keystroke just to refresh this label.

### Save and connection feedback

Model these separately, even if visually combined:

- Connection: loading, connecting, live, reconnecting, unavailable, access lost.
- Persistence: clean, pending, saving, saved, retrying, local-only, failed.

User copy: “Saving…”, “Saved”, “Offline · saved on this device”, “Reconnecting…”, “Couldn't save · Retry”. Use “saved on this device” only after the IndexedDB transaction completes. If local storage fails, say “Not saved” and offer Copy notes. “Saved” refers to acknowledged changes through a known generation, not simply a connected socket or successful broadcast.

Summarize waits for a successful flush. If it fails, do not summarize stale saved notes as if current. No success toast per autosave. Use a polite, throttled live region for status changes, not for every remote character/cursor.

### Accessibility and mobile

Maintain dialog labeling, focus containment, Escape/Back behavior, and return focus to the launching meeting. Give the editor an accessible name. Keep primary touch targets approximately 44 px; ensure names/popovers work without hover. Respect reduced motion; no pulsing avatar animations. Test keyboard navigation, screen-reader status, long names, selection contrast, mobile keyboards, and composition input. Remote overlays must not intercept editing gestures.

## 5. Data model and source of truth

Add additive fields to CalendarEvent:

- `notesDoc Bytes?`: complete canonical Yjs state, stored as BYTEA.
- `notesDocSeq Int @default(0)`: increments for actual canonical CRDT-state changes.
- `notesContentRevision Int @default(0)`: increments only when derived visible text changes.
- `notesSummaryRevision Int?`: content revision used to generate the stored summary.
- `notesProtocolVersion Int @default(1)`: explicit document protocol version; do not silently reinterpret incompatible document bytes.

Keep description, notesUpdatedAt, notesSummary, and notesSummaryAt. For an initialized document, notesDoc is authoritative; description is a transactional projection. notesUpdatedAt changes only with visible text. No-op retries must not create fresh summary-stale indicators.

Do not put notesDoc in calendar list responses, mutation responses unrelated to notes, or app/data.ts's general CalendarEvent DTO. Explicitly select/shape responses; Prisma Bytes are not automatically the desired base64 representation. Fetch document bytes only through notes endpoints. Keeping these columns on CalendarEvent avoids a new tenant table and migration surface; the main tradeoff is row contention, measured before reconsidering a separate document table.

Do not equate full snapshots with bounded history. Yjs retains metadata even when deleted content is garbage-collected. Track encoded size. Do not compact by replacing the document with a new Y.Doc while offline clients can return; a future reset needs a new epoch, explicit stale-client handling, and recovery/export.

## 6. Authorization design

### HTTP

Every collaboration endpoint uses buildContext({ requirePerm: "MANAGE_EVENTS" }), positive integer ID validation, schemas in lib/validation, services, and toResponse. Resolve and verify the event in ctx.orgId and restrict first-release initialization to category chapter. Allow read-only members to use existing saved-note readers; do not enroll them in the live room.

Use x-org-slug captured with the document session for delayed requests. A save queued in org A must not inherit org B's current URL after navigation. Services verify both org and event regardless of the client hint. Use no-store/private response behavior and the app's same-origin mutation protections.

### Supabase channel

Use the authenticated user's existing Supabase JWT and a private topic `notes:v1:org:<orgId>:event:<eventId>`. Do not mint fictional SDK channel tokens or put a service-role credential in a browser.

Implement receive/select and send/insert policies on realtime.messages, limited to the Broadcast extension and an exact valid topic. Prefer one narrow, audited SQL authorization function taking the topic, deriving auth.uid() internally, and returning only a boolean. It must:

1. Parse the fixed topic format safely; malformed/oversized IDs deny access without cast errors.
2. Confirm the event belongs to that org and is a chapter meeting with collaboration enabled.
3. Resolve Brother by authUserId, then Membership by brotherId + organizationId; never authorize via Brother.organizationId.
4. Match buildContext semantics for Membership, org-admin, PlatformAdmin, and same-org BrotherRole/Role MANAGE_EVENTS grants. Do not silently invent different archived-member semantics: verify parity against requireUser.

Because Realtime does not arrive with the app's SET LOCAL org context, do not assume existing application RLS policies make the required membership joins visible. A SECURITY DEFINER function may be necessary: fixed safe search_path, fully qualified identifiers, constrained owner privileges, no dynamic SQL, no caller-supplied auth UID, revoke default PUBLIC execution, grant only the roles needing the boolean check. Do not grant browsers general roster-table reads to make this work.

This intentionally duplicates a small permission predicate in SQL. Prevent drift with parity tests covering role assignment/removal, bit changes, org-admin/platform-admin, archived semantics, multi-org identity, pending join, removal, and foreign event IDs. Prefer this to an extra grant cache/JWT-signing subsystem for the first release.

Audit other realtime.messages policies: permissive policies combine with OR, so a broad existing policy can defeat this restriction. Audit the project's public-channel setting before disabling public access globally; do not break unrelated channels.

### Revocation boundary — deployment gate

Supabase caches channel authorization until resubscription or a new JWT; it disconnects on token expiry if no new JWT arrives. HTTP saves recheck permission on every request. Therefore permission removal blocks the next HTTP request immediately but does not promise instant eviction from an already-authorized socket.

Record the actual JWT lifetime in staging and production. First-release maximum permitted exposure window: 60 minutes; prefer 10–15 minutes if the project's Auth refresh behavior has been tested at that setting. Changing this is a project-wide Auth setting and requires regression testing, not an incidental feature change. A removed user presenting a freshly refreshed token must be denied by the policy. An honest browser unsubscribes immediately on 401/403, but that is not the enforcement mechanism.

If immediate revocation is required, stop the rollout and add server-enforced eviction or transactional topic-epoch rotation with reliable propagation. Do not claim a client timer, a database lease expiry, or a best-effort event handler solves cached authorization.

Awareness names/carets are cooperative UI data, not forensic attribution. An authorized malicious editor can spoof peer metadata on a shared Broadcast channel; sanitize/map display identity where possible, and never use awareness identity for permissions or audit attribution. Durable save logs use ctx.actorId. Cryptographically authenticated per-message authorship is outside this first release.

## 7. HTTP contract and durable write algorithm

Use a dedicated notes service, with shared low-level document helpers outside services so calendar/service writers do not call another service.

### POST /api/calendar/[id]/notes/session

Authorizes, checks feature/scope, and initializes if necessary. Under an org-filtered row lock, load the current description and create the Yjs baseline exactly once if notesDoc is null. Persist even an empty baseline marker/state. Return explicit base64 state, both revisions, protocol version, server-approved display identity, org/event IDs, topic, and configured limits. Initialization itself does not count as a visible text edit or make old summaries stale.

POST is intentional: initialization can write. Do not implement a mutating GET or seed independently in each browser. Do not enable editing until bootstrap and local recovery reconciliation complete.

### GET /api/calendar/[id]/notes?afterSeq=N

Authorized reconciliation read. Return `{ unchanged: true, notesDocSeq }` when the canonical sequence matches; otherwise return state and revisions. Use explicit JSON instead of introducing special 304 handling into requestJson. Include current summary revision metadata when relevant. No writes or initialization in GET.

### PATCH /api/calendar/[id]/notes

Input: protocolVersion, base64 full-state snapshot, captured local generation/request identifier, and lastSeenSeq for diagnostics. No client-supplied description. Stale seq is not rejected as a competing edit; the server merges it.

For v1, full-state HTTP snapshots are a deliberate simplification for bounded meeting notes. They carry causal dependencies even when peers' updates arrive out of order and simplify durable acknowledgement. Live Broadcast still uses small incremental updates. Optimize HTTP to a tested state-vector/diff exchange only if measured bytes/CPU warrant the extra protocol complexity.

Algorithm:

1. Enforce bounded request-body reading before JSON parsing; validate schema, strict base64, protocol, and decoded bytes. Catch invalid Yjs input as a domain validation failure.
2. Decode/validate the incoming document outside the database lock where possible. Check the allowed root shape is plain Y.Text named notes; reject unsupported embeddings/extra roots. Do not trust client-side size validation.
3. In a short ctx.db.$transaction, SELECT the event FOR UPDATE with explicit event ID AND organizationId. Recheck initialized/scope/version state. Use parameterized Prisma SQL helpers; no string-built SQL.
4. Apply stored and incoming updates to a fresh Y.Doc, encode canonical merged state, and derive text. Validate the merged result too: two individually valid states can exceed the limit when combined.
5. Update bytes/notesDocSeq only if canonical state changed. Increment content revision and notesUpdatedAt only if text changed. Mirror description and any linked ServiceEvent.notes consistently in the same transaction, with explicit org filtering.
6. Commit before any network or AI work. Return canonical merged state, revisions, and acknowledgement of the submitted generation. Destroy temporary Y.Docs in finally blocks.
7. Emit calendar.notes_saved with activity:false only for a meaningful durable state change; include revisions/size/request identity, not document text. This is best-effort operational telemetry, not guaranteed per-character authorship/history.

Acknowledge only a successfully persisted, fully integrable snapshot. Reject malformed/incomplete pathological states rather than claiming their visible content is durable. Duplicate/reordered submissions are safe because updates merge idempotently. Capture every in-flight generation and never clear changes typed after it was captured.

The row lock serializes document saves for one meeting; it does not remain held while people edit and does not block other meetings. Bound lock wait and transaction timeout; use a small bounded retry for retryable database failures. Prefer one lock ordering across calendar/service mirrors to avoid reciprocal-writer deadlocks.

## 8. Live protocol, batching, and recovery

### Provider ownership

Implement a small testable provider adapter separate from React. It owns one Y.Doc, Awareness instance, private channel, retry queue, timers, and persistence adapter for a document session. The hook manages lifecycle and exposes UI state. Use explicit transaction origins for editor input, Broadcast, bootstrap, IndexedDB, and server acknowledgement to avoid echo and save loops.

The stable editor binding handles relative cursor positions and local undo. Never transmit raw numeric offsets as the durable cursor representation. Keep one instance per mounted document session and tear it down safely under React Strict Mode.

### Messages

One versioned Broadcast envelope can contain a merged Yjs incremental update and the latest local awareness update. Include a session ID and bounded request/recipient identifiers for sync requests. Disable self-echo where supported and ignore own envelopes defensively. Validate every incoming envelope before applying it; unknown versions and oversized payloads are dropped with bounded diagnostics.

- Live edits: collect for 150–200 ms, merge updates with Yjs, and send together.
- Cursors: latest state wins within that same window; do not enqueue every intermediate position.
- Typing: starts on local edit and refreshes through outgoing envelopes; send a trailing stopped state when necessary.
- Awareness liveness: preserve y-protocols' clock, removal, and renewal behavior. Do not suppress unchanged-state renewal merely because its visible fields match; test idle peers remaining present and dropped peers expiring around 30 seconds.
- On large-room/high-throughput pressure, lengthen envelopes toward 400–500 ms and reduce cursor-only updates first. Local typing remains instantaneous.

Free Broadcast payloads are limited to 256 KB. Set the application envelope ceiling to 128 KiB including JSON/base64, with a smaller awareness ceiling (for example 4 KiB). If a paste/update exceeds that, send a small “resync-needed” hint after successful HTTP persistence; peers fetch durable state. Never truncate bytes or broadcast a multi-megabyte snapshot. Test the threshold against serialized byte size, not JavaScript string length alone.

### Join and reconnect

1. Authorize/bootstrap and reconcile the server baseline with same-account local recovery.
2. Attach handlers, authenticate Realtime, and subscribe.
3. Fetch canonical state again after subscription to close the bootstrap-to-subscribe gap.
4. Request peer synchronization using Yjs state vectors and bounded correlated responses. Use established y-protocols sync semantics; account for deletion information, not just insertion clocks. Add randomized response delay/deduplication and bound response count to avoid a join storm.
5. Exchange local awareness and resolve pending local saves.
6. Repeat after socket reconnect, browser online, and returning from a hidden tab. Cancel/coalesce duplicate triggers.

Peer synchronization accelerates arrival of unsaved live work. It is not the only recovery source. While a visible collaborative editor is open, perform a small canonical-sequence read approximately every 30 seconds with jitter. A sequence difference fetches/applies persisted state; it catches silent dropped broadcasts even without a disconnect event. Pause reconciliation while hidden and catch up on return. Do not claim Supabase replay can replace this protocol.

### Saving and local recovery

- After local edits: debounce 2 seconds, with a 5-second maximum pending interval during uninterrupted typing.
- Only one HTTP save in flight per document session; pending changes form the next generation. Retry transient failures after approximately 1, 2, 4, 8, then up to 30 seconds with jitter; honor Retry-After. Retry does not depend on more typing.
- Remote edits do not immediately make every observer save. If observed CRDT changes remain unconfirmed by canonical reconciliation, schedule a delayed rescue save (about 10 seconds with jitter), first checking the canonical sequence. It is acceptable for a rare rescue to be duplicated; the server must make no-ops cheap. This improves recovery when the originating browser disappears without requiring an elected leader.
- Any unconfirmed visible changes remain “Saving”/pending rather than being represented as fully durable. A server acknowledgement applies returned state and clears only the captured work; never replace the live document with the response string.
- Keep local document recovery keyed by environment/project + auth user + org + event + protocol version. Retain the unacknowledged generation marker durably. IndexedDB presence alone does not prove server acknowledgement.
- On ordinary overlay close, flush and let a document-session manager finish pending writes while navigation proceeds; never abort a write merely because a read was cancelled. On org switch, retain the original scoped request identity. Return server-updated description/revisions to the page's event list.
- On tab close/background, flush opportunistically and finish local persistence. Browser termination can interrupt asynchronous work; do not promise every final keystroke survives a crash. Do not depend on sendBeacon/keepalive for large documents.
- After reopening, authorize before displaying recovered notes. Retry retained work automatically on valid access. On access loss, stop syncing/editing, clear normal caches and visible notes, and retain only already-unsaved recovery behind same-account reauthorization for a bounded period. Do not let a different signed-in account open that recovery. A browser-local copy cannot be remotely erased from a malicious client.
- On success, remove unnecessary recovery records; keep a short cache only while needed. Never silently evict unsaved work to meet a cache budget. If IndexedDB is unavailable, make the limitation visible and offer Copy notes before leaving with failed saves.

## 9. Limits and failure behavior

Initial application limits (tune after the pilot, not arbitrary increases):

- Visible text: 50,000 UTF-16 code units, matching existing validation.
- Canonical/incoming decoded CRDT state: at most 1.5 MB; request body maximum approximately 2.1 MB, accounting for encoding and metadata.
- Broadcast: 128 KiB application envelope; awareness: 4 KiB.
- All root types, name lengths, IDs, protocol versions, and message counts bounded.

Prevent local edits that exceed the text limit while preserving selection and allowing deletion. If a concurrent merge exceeds a server limit, retain unsaved work locally, stop claiming success, and provide a clear recovery/export path. Do not keep retrying a permanent 400/413 in a tight loop. Correctness failure tests must include this condition.

401/403: stop channel/save loop, request reauthentication where applicable. 404: stop, show deleted/unavailable state; do not recreate the event. 409 incompatible protocol/legacy edit: preserve draft and ask for reload/recovery. 429/transient 5xx/timeouts: backoff, maintain dirty state. Broadcast unavailable but HTTP healthy: continue safe merged saves with a visible “Live updates unavailable” status and periodic reconciliation; do not revert to whole-string PATCH.

Reject malformed binary work before holding a DB connection; byte limits alone do not bound all decode CPU. Include adversarial decoding tests and time/memory measurements. Tighten complexity/size limits or isolate decoding if hostile authenticated input can exhaust the function. Reuse existing HTTP throttling, but describe it honestly as per-instance. Platform quotas and client throttles do not prevent a malicious authorized room member from causing traffic; monitor and disable collaboration for an affected org if necessary.

## 10. Existing writers, summaries, and event conventions

### One authoritative write path

Before activating an org, inventory every CalendarEvent.description write and every edit form that submits it alongside metadata. For initialized notes:

- Generic calendar PATCH accepts omitted description or an identical no-op value, but rejects a different replacement with a specific conflict code directing the UI to the collaborative editor. Check under the same concurrency protection used by initialization; a pre-transaction null check races first open.
- Meeting metadata editing omits description. Old tabs receive a recoverable conflict rather than overwriting shared notes.
- Apply the same protection to linked ServiceEvent and other reverse projections. Non-collaborative service/programming descriptions keep their existing behavior.
- Category conversion of an initialized meeting is blocked initially with a clear message; migration to another category requires a separate explicit document-preservation design.
- On permanent event deletion, let subsequent HTTP/authorization checks fail; stop honest clients and clean local caches. Do not promise instant eviction of an already-authorized malicious socket.

Keep document merge, description, and the linked service mirror atomic because they form the same persistence invariant. Extract low-level helpers if several write guards share code; services must not import/call other services. Put unrelated reactions in typed event handlers. Do not make correctness depend on an isolated best-effort event handler finishing.

### Summary revisions

Move the summarizer's database work into a meeting-summary service and make its route a thin controller. Preserve current read/summary permission semantics unless intentionally changed separately; the new collaboration permission does not automatically redefine every existing summary reader.

Capture description + notesContentRevision before calling AI. On completion, store that captured revision with the summary. Derive stale state by comparing summary revision with current content revision, not completion time. Reject/discard an older summary result if a newer input revision has already produced the stored summary. Never hold a DB lock across the AI call.

Update chapter and timeline DTOs/rendering to use revisions when present and the existing timestamp behavior for legacy summaries. For a legacy nonempty summary with no revision, conservatively mark freshness unknown/stale after collaboration is initialized, or establish equality only with verifiable provenance; do not label it current solely because initialization happened. Repeated no-op saves must not invalidate it.

## 11. Cost controls and sizing

Current published Supabase allowances: Free 2M realtime messages/month and 200 peak connections; Pro 5M and 500 respectively. Free throughput is 100 messages/second; Pro's default is 500. Free Broadcast payload ceiling is 256 KB. These are platform/account constraints, not per-meeting allowances. Additional paid-plan messages are billed in million-message packages. Verify the project's actual settings and usage before launch. [S1–S3]

Count fan-out: a Broadcast is one sent message plus one for each recipient. With self-echo disabled, a room of N connected editors costs approximately N messages per outbound envelope. If each sends R envelopes/second, traffic is approximately N² × R messages/second, before other traffic. [S3]

Illustrative planning example, not a benchmark: 3 editors, each producing 2 envelopes/second during 10 active minutes of a one-hour meeting, produces about 10,800 delivered/sent messages. Awareness renewal, joins, reconciliation hints, and retries add overhead. Four such meetings start around 43,200 messages before overhead. Multiple chapters share the quota.

Peak example: 5 editors each sending 5 envelopes/second produces about 125 messages/second—already above Free's published limit. Thus a nominal 200 ms window is not a free-tier capacity guarantee. For 5 peers, about 2 envelopes/second yields 50 messages/second; for 10 peers, even 1 envelope/second yields 100 before overhead. Slow cursor-only traffic first, then combined updates as needed. Ten actively typing editors on Free may have visibly slower remote updates; measure and communicate this rather than silently disconnecting them.

Do not optimize solely for the monthly quota. Allocate a conservative per-room budget and retain project headroom; a client sees its room, not the exact aggregate of all concurrent rooms. Pilot with 1–2 simultaneous chapters, monitor aggregate throughput, and raise concurrency only when measurements support it. Paid quota upgrades may eventually be cheaper than additional infrastructure engineering.

Other cost controls:

- No full-state realtime heartbeats; full HTTP snapshots are bounded and only sent while dirty/rescuing.
- Lazy-load editor code when notes open; keep Yjs out of general calendar server reads and the initial dashboard bundle.
- Unsubscribe after a short hidden-tab grace period (about 30 seconds), clear typing immediately, and reconcile on return. Do not reconnect ordinary timeline readers.
- No HTTP presence heartbeats, per-cursor database rows, automatic AI summaries, or activity-feed rows per keystroke.
- Keep lock durations short. A 10-connection application pool is not a single global production pool across all Vercel instances; inspect actual database/pooler metrics.
- For a continuously dirty editor, the 5-second maximum interval implies roughly 720 save opportunities/hour; idle debounce can add saves for separate bursts. Estimate HTTP, DB, audit-row, and egress consumption alongside Broadcast before broad rollout.

## 12. File-level implementation map

New files, names indicative but boundaries intentional:

- `lib/collaboration/notes-document.ts`: Yjs validation/merge/encoding helpers, no service imports.
- `lib/collaboration/notes-protocol.ts`: shared schemas, limits, versioning, origins, DTOs.
- `lib/services/meeting-notes-service.ts`: bootstrap, read, atomic merge, permission/scope checks, emit.
- `lib/services/meeting-summary-service.ts`: summary snapshot and revision-aware persistence.
- `lib/validation/meeting-notes.ts`: HTTP schemas and typed input exports.
- `app/api/calendar/[id]/notes/route.ts`: GET/PATCH thin controllers.
- `app/api/calendar/[id]/notes/session/route.ts`: POST bootstrap controller.
- `app/lib/collaboration/supabase-notes-provider.ts`: live protocol and awareness.
- `app/lib/collaboration/notes-session.ts`: save queue, local recovery, lifecycle and captured org context.
- `app/hooks/useCollaborativeNotes.ts`: React adapter.
- `app/components/meeting-notes/CollaborativeNotesEditor.tsx`: CodeMirror binding, theme, accessibility.
- `app/components/meeting-notes/NotesCollaborators.tsx`: avatars/popover/typing line.
- `app/components/meeting-notes/notes-editor.css`: styles scoped to the existing dashboard theme.
- Additive Prisma migration, separately reviewed Realtime authorization SQL migration, and targeted tests.

Modify schema, scoped helpers where necessary, calendar/service writer guards, event action registry, general DTO selection, chapter page, summary route, and timeline freshness rendering. Preserve existing save indicator visual styling while extending its underlying state mapping. Extract the meeting overlay only as needed; avoid a chapter-page redesign/refactor bundled into this work.

## 13. Implementation sequence and release gates

### Phase A — prove the foundations

1. Read current AGENTS and installed Next docs; inventory writes and policies; record actual JWT expiry, Realtime capacity, region/pooler settings, and current baseline usage.
2. Validate compatible stable editor/Yjs packages in a small local harness, including remote carets, selection and local undo. Do not deploy a demo editor into the app.
3. Implement/test Realtime authorization in a staging Supabase project with real JWTs and enforcing RLS. Plain Docker Postgres alone cannot prove WebSocket authorization.

Exit: cross-org/direct unauthorized subscriptions fail; permission parity and token-expiry behavior are demonstrated; the binding meets keyboard/mobile requirements. If authorization cannot be proved, no public-channel fallback.

### Phase B — durable notes backend

4. Add fields and explicit DTO shaping. Deploy additive migration ahead of activation; do not globally enable collaboration.
5. Implement atomic bootstrap and merge endpoints, bounds, revisions, and writer guards.
6. Add summary input revisions and legacy behavior.

Exit: concurrent saves followed by a fresh server read preserve both edits; simultaneous first open seeds once; retries are idempotent; tenant tests pass.

### Phase C — client and recovery

7. Build provider/session manager with deterministic tests for dropped, delayed, duplicated, and reordered messages.
8. Add IndexedDB recovery, serialized autosave, retry, post-subscribe reconciliation, and awareness liveness.
9. Replace the textarea and remove its old autosave path together; adapt summarize/close/switch flows.

Exit: two browsers converge through reconnect and reload; failed writes survive recovery where local storage completed; UI never reports later unsaved edits as saved.

### Phase D — collaborative UI and pilot

10. Add colored carets/selections, collaborator popover, and typing text; tune traffic jointly rather than adding a second high-frequency channel.
11. Run responsive, keyboard, IME, accessibility, and multiple-editor tests. Measure bundle/load time, lock duration, save latency, throughput, and egress.
12. Enable for one org via a server-controlled org allowlist; keep capability/read/write guards consistent. Move to a few orgs only after at least two real meeting sessions and a reconnect/recovery exercise without lost acknowledged edits.

Do not present a calendar-time delivery estimate as evidence of readiness. Each phase exits on its tests. This is a moderately sized feature: transport is the easy part; editor lifecycle, auth, and recovery are the substantial work.

### Rollback

Maintain separate controls for live Broadcast and collaborative writes. Disable live transport first if it is unstable; continue safe server merges. If writes must be paused, serve the last saved plain-text notes read-only and retain pending recovery. Do not roll back to a pre-feature writer that can overwrite description independently. Keep additive columns and compatibility guards deployed. Do not drop CRDT data or reset document identities during incident response.

## 14. Test and acceptance checklist

### Service/database integration

- Two divergent documents save concurrently in either order; a fresh load contains both valid edits.
- Concurrent insert/delete and sequential retry cases, not just append-only examples.
- Two first-open calls with nonempty legacy notes produce one baseline with no duplication.
- No-op replay does not bump content revision/time or emit duplicate meaningful-change telemetry.
- Foreign event/org, pending join, removed membership, role differences, elevated admins, and multi-org names.
- Malformed base64/binary, unsupported roots/embeds, too-large requests, merged oversize, and bounded decode work.
- Atomic mirror, lock-timeout/retry behavior, service reverse-writer guards, category conversion, and initialization races.
- Summary completion after newer edits; two summary requests finishing in reverse order; legacy summary freshness.
- No raw binary leaks in list/general mutation DTOs.

### Provider tests with deterministic transport faults

- Dropped final edit, duplicate delivery, out-of-order updates/deletes, subscribe race, and peer exiting before save.
- Reconnect when all original peers have left; HTTP recovery remains sufficient for acknowledged edits.
- Edits arriving during a save; stale response never clears newer dirty generations.
- Save failure without further typing still retries; 429 honors delay; invalid input does not retry indefinitely.
- Large-paste resync path, sync response bounds, protocol mismatch, unknown peers and invalid awareness metadata.
- Idle awareness renewal, stopped-typing expiry, abrupt disconnect, multiple tabs and color collisions.

### Browser automation and manual supplement

Use Playwright browser contexts, separate accounts, and explicit network interception; the current repo has Playwright available, but add a real test runner/config/script if none exists. Assert after fresh reload, not just what two live documents happen to display.

- Two editors type, replace selection, paste, undo and redo; remote text is not undone by the other person's local undo.
- Remote edit before the local cursor preserves selection/focus and scroll position.
- Offline 15–60 seconds, edits on both sides, reconnect, server confirmation, close all browsers, reopen.
- Delayed saves, overlay switch, route/org switch, tab close, refresh, signout/login as another user, and blocked IndexedDB.
- Direct realtime access attempts bypassing our HTTP endpoints, JWT renewal/expiry, policy revocation and broad-policy regression.
- 375 px, 768 px, and desktop widths; long names; popover keyboard behavior; reduced motion.
- Manual iOS/Android keyboard and IME checks, plus screen-reader review of status changes. These supplement rather than replace automation.

### Measured pilot targets

Proposed acceptance targets, not vendor guarantees: local input remains immediate without visible re-render jank; healthy small-room remote text/caret updates usually arrive within 500 ms; stopped typing disappears within 4 seconds; acknowledged notes survive every fresh reload; idle peers remain present and dropped peers disappear around the awareness timeout; save queue converges without further typing after network recovery. Run a 10-editor stress test and record degraded-mode timing and platform message counts explicitly.

Run the existing TypeScript/build and relevant boundary lint gates: `npx tsc --noEmit`, `npm run build`, `npm run lint:prisma`, `npm run lint:services`, `npm run lint:modules`, and `npm run lint:home-org`. Run targeted Vitest suites with `npm run test:db:up` as required, then relevant tenancy/regression tests. Separate baseline unrelated failures from new regressions; do not modify unrelated work to manufacture a clean report.

## 15. Observability and operational handoff

Record metadata only: bootstrap latency, subscription failures, reconnect count, message/envelope bytes and counts, pending generation age, retries, save latency, lock wait, encoded document size, validation rejections, reconciliation mismatch, and rescue-save/no-op frequency. Never log meeting text, binary payloads, JWTs, or private cursor/typing histories.

Use existing observability and the Supabase dashboard initially. Review monthly quota and peak throughput at 50%, 75%, and 90% of the available budget; these are operational review thresholds, not promised automatic alerts unless explicitly configured. Compare cold-start/database cost with Broadcast traffic. Record the tested JWT revocation window, browser-cache retention behavior, restoration process, feature flags, and rollback instructions in the deployment notes.

Remaining environment facts to establish in Phase A: current paid/free plan and remaining quota, actual JWT expiry, existing realtime policies, any unrelated public channels, and database backup configuration. These are preflight facts, not reasons to delay producing or starting the plan.

## 16. Sources and verification notes

Official documentation checked September 13, 2026. Recheck prices/limits and installed package types at implementation time.

- [S1 — Supabase Realtime pricing](https://supabase.com/docs/guides/realtime/pricing)
- [S2 — Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits)
- [S3 — Broadcast message accounting](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)
- [S4 — Realtime authorization and cached-policy behavior](https://supabase.com/docs/guides/realtime/authorization)
- [S5 — Yjs updates, state vectors, merge APIs](https://docs.yjs.dev/api/document-updates)
- [S6 — Stable CodeMirror binding, cursors, selections and undo](https://github.com/yjs/y-codemirror.next)
- [S7 — Yjs Awareness](https://docs.yjs.dev/api/about-awareness)
- [S8 — Offline persistence](https://docs.yjs.dev/getting-started/allowing-offline-editing)

Repository facts were inspected directly; timing, batching, thresholds, UX and implementation phases are design recommendations. This document does not claim staging policies, editor behavior, cost estimates, or concurrency tests have already been implemented or validated.
