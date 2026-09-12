# Collaborative meeting notes: implementation and rollout

Updated September 13, 2026. The notes migration and private Realtime policies are installed in the user-selected Supabase project `yxmnnsxvitsduvexnuuz`. The user is running the app locally, so Vercel deployment is not needed. Collaboration and Realtime are enabled in the ignored `.env.local` for the 12 existing organizations; defaults in source remain off.

The local service runs on port 3000 under `com.figurints.dev`. Prisma was regenerated and that existing service restarted after a stale in-memory client rejected the new fields. To try live collaboration, use actual Supabase sign-ins in two browser sessions with `MANAGE_EVENTS`, open the same chapter meeting, and edit its minutes. The dev impersonation cookie can test HTTP permissions and saves but does not grant Realtime a signed-in identity. Local hosting still persists notes to the selected remote Supabase database.

## Deployment preflight: September 13

The checkout is linked to Vercel project `chaptos-v1`. The Vercel CLI has no credentials, and the in-app dashboard opens to the login screen. No separate staging environment is configured in this checkout.

The initial read-only preflight found all five collaboration columns, the authorization function, and Realtime policies absent. After the user selected project `yxmnnsxvitsduvexnuuz`, the target was verified against the configured public URL and both database connections. The five columns, authorization function, and two private Broadcast policies were installed together in a transaction. Prisma migration `20260913000000_collaborative_notes` was then marked applied. No other migration was applied, no meetings were initialized, and the pilot flags remain off. This is the existing configured project, not a newly created isolated staging environment.

Live verification confirmed Realtime RLS is enabled. Initially a private-channel probe returned `MissingPartition`; an empty public diagnostic channel connected successfully and Supabase provisioned five message partitions. That diagnostic channel was closed without sending notes or changing any access settings. A subsequent real WebSocket attempt to join a private notes room without a signed-in user was denied as unauthorized. A rollback-only SQL INSERT as `authenticated` without user claims was rejected by row-level security. The existing lack of `authenticated` USAGE on the public schema was preserved; the stored policy can invoke its granted helper without exposing the application schema for direct queries.

This follows the provider's [partition lifecycle guidance](https://supabase.com/docs/guides/troubleshooting/realtime-warn-sending-broadcast-message). Authorized user delivery, role revocation/JWT refresh, production usage, and pilot behavior remain unverified. Vercel login is unnecessary for the current local setup.

The additive schema migration must precede deployment of this code, even with the feature disabled: ordinary calendar queries now read the new revision fields. Default-off flags prevent collaborative use; they do not make the new code compatible with the old database schema.

## What is built

- Existing chapter meeting overlay with a lazily loaded CodeMirror plain-text editor, Yjs merging, colored remote carets and selections, collaborator initials, typing indicators, and local undo/redo.
- Private Supabase Broadcast for live deltas and awareness. Existing HTTP routes and Postgres remain the durable authority. No Liveblocks subscription or additional server is required.
- Serialized client saves, generation acknowledgements, retry/backoff, periodic reconciliation, offline recovery through IndexedDB, and independent saving when an overlay closes.
- Server initialization and full-state merges under an org-scoped row lock. Canonical text, CRDT bytes, sequence, content revision, and linked service notes update atomically.
- Strict document, request, and peer-message bounds. Untrusted peer updates are validated on a disposable document before reaching the editor.
- Guards against older forms overwriting an initialized document or changing its event category. Ordinary calendar lists omit binary document state.
- Summary revisions capture the actual source text revision; an older AI response cannot replace a summary of newer notes. Legacy calendar, service, and programming description changes advance revisions too.
- Paused pilots show saved text read-only on a fresh page load. Existing open sessions stop editing when their next HTTP authorization check fails.

## Configuration

`COLLABORATIVE_NOTES_ORG_IDS` is a comma-separated allowlist of numeric organization IDs. An unset or empty value disables collaborative endpoints. Initialization is restricted to chapter meetings and officers with `MANAGE_EVENTS`.

`COLLABORATIVE_NOTES_REALTIME=1` enables Broadcast for newly opened sessions. Leave it unset until private-channel authorization has been verified. Without Broadcast, the editor still merges through HTTP, but remote changes appear through saves and the 30-second reconciliation interval; the UI labels live updates unavailable.

Keep the existing `RLS_SET_ORG_ID=1` configuration. The browser uses the existing Supabase public client and signed-in user session. A service-role key must never be added to browser configuration.

## Staging activation sequence

1. Use a separate staging project with the existing application schema and auth setup. Back up that database using the project's normal process.
2. Apply `prisma/migrations/20260913000000_collaborative_notes/migration.sql` through the normal reviewed migration workflow. It adds five CalendarEvent columns and leaves legacy text intact. Do not run a wholesale `migrate deploy` against an unknown database: this repository's test setup documents historical migration-chain gaps, and this working tree also contains an unrelated check-in migration.
3. Review existing `realtime.messages` policies for broad permissive access, then install `supabase/realtime-meeting-notes.sql` as the staging database administrator. Permissive policies combine with OR; the new policies cannot cancel a broad existing policy. Confirm the security-definer function is owned by the intended database administrator and the private Broadcast project settings are correct.
4. Deploy this code with only a staging org allowlisted and Realtime disabled. Verify initialize/save/reload, legacy overwrite rejection, summary freshness, and read-only member access to saved text.
5. Test real Supabase sessions using two authorized accounts and one unauthorized account. Exercise both receiving and sending: same-org officer, plain member, foreign org, multi-org membership, org admin, both platform-admin representations, signed-out user, and fabricated topics. Confirm an unauthorized client cannot join by calling the channel API directly.
6. Revoke a role while connected. Measure actual access loss across HTTP polling, JWT refresh, expiry, reconnect, and resubscribe. Realtime caches authorization; local SQL policy tests do not prove immediate WebSocket revocation. Record the observed window and accept it explicitly before a pilot.
7. Enable Realtime for staging and repeat browser coverage against actual channels. Verify ten simultaneous editors, a mobile browser with an IME, close/reopen while unsaved, two orgs in separate tabs, offline edits across a browser restart, tab visibility, and expired authentication.
8. Inspect actual message throughput, peak connections, HTTP save volume, DB latency, payload sizes, and egress in the existing dashboards. Allowlist a small production pilot only after those results are acceptable.

## Verification in this checkout

`npm run build` passes. This compiles production assets and performs TypeScript checking; it does not activate the feature.

Latest regression run: `npx vitest run tests/calendar tests/programming tests/service tests/tenancy` — 252 tests passed across 16 files. Prisma-boundary, service-boundary, and home-org checks pass. The module-boundary check retains an existing warning in `app/api/announcement/route.ts`; this feature does not introduce that import.

`npx vitest run tests/calendar` covers atomic concurrent initialization and saves, deleted-span preservation, idempotent retry, service mirroring, legacy overwrite rejection, tenant and permission checks, database-enforced RLS, actual Realtime policy SQL with local auth/topic shims, invalid peer state, incomplete snapshots, save acknowledgement/retry behavior, summary races, and pause behavior.

`npm run test:notes:browser` mounts the real React editor in Chromium. It verifies ten simultaneous editors converging on all ten contributions, remote carets/presence, local undo/redo, simulated offline retry, reload, and a 375-pixel viewport. The transport is deliberately simulated using BroadcastChannel and an in-memory HTTP authority. It does not test real Supabase JWT handling, production latency, production quotas, or the full meeting-overlay layout.

The automated database suite resets the disposable local test database on port 54330. Do not point `TEST_DATABASE_URL` or `TEST_APP_DATABASE_URL` at shared or production data.

## Current implementation limits

- IndexedDB recovery stores the full Yjs document keyed by Supabase host, auth user, org, event, and protocol. Reopening first requires server authorization. Recovery detects a difference from server state instead of using the original plan's separate persisted dirty-generation record. Storage eviction can still lose unsaved changes; only an HTTP acknowledgement means saved.
- There is not yet a bounded local-cache retention or explicit account-cache deletion UI. Documents persist in that browser profile until browser storage is cleared/evicted. This needs a product decision and multi-tab-safe cleanup before broad rollout, particularly on shared devices.
- Peer identities are cooperative presence labels, not cryptographic authorship or an audit trail. Every room participant is already an authorized notes editor. The server rechecks authorization for durable writes.
- State-vector replies are size-bounded but not yet staggered/deduplicated across peers. Large rooms need real transport measurement. Full-state HTTP saves are appropriate for small notes; document history is capped at 1.5 MB and visible text at 50,000 characters. Automatic compaction/reset is deliberately absent because replacing document identities could corrupt offline recovery.
- The original plan's production quota alerts, operational thresholds, recovery/restore drills, and real JWT/IME/full-overlay checks remain staging work. Local tests are not evidence of those outcomes.

## Pause and recovery

To disable live delivery while retaining safe writes, unset `COLLABORATIVE_NOTES_REALTIME` and reopen sessions. This flag is read at session bootstrap; it does not instantly disconnect existing WebSockets. For immediate transport shutdown use the provider's verified channel/project controls.

To pause writes for an org, remove it from `COLLABORATIVE_NOTES_ORG_IDS` and deploy/restart the runtime using the normal environment workflow. New page loads show saved minutes read-only. Open sessions stop through failed saves or their next visible HTTP reconciliation, ordinarily within 30 seconds; their local recovery data remains. This is not an instant Realtime permission revocation mechanism.

Keep the additive columns, saved CRDT documents, and compatibility guards. Do not fall back to an older application writer, null out notesDoc, or regenerate a document from its plain-text projection. Re-enable the same org/document/protocol to recover pending edits. If an incident requires restoring data, restore the canonical CRDT and corresponding text/revisions together under a documented maintenance procedure.

## Cost controls

Small edits are batched before Broadcast; large rooms increase the batch interval. The author autosaves after roughly two seconds of idle time, with a maximum timer; remote recipients perform delayed rescue saves. Hidden/offline sessions disconnect, and polling runs only while visible. Large live messages fall back to HTTP reconciliation.

Additional hosting cost can be zero if the existing quotas have room, but this has not been measured in this account. There is no claim of unlimited free usage. Start with a small pilot and use provider usage dashboards before considering another service or a dedicated WebSocket process.
