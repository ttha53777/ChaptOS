# Trust & Privacy — source of truth

Everything in this document was extracted from the code on `main` (2026-07-29), and revised for the
Stripe billing subsystem that landed 2026-07-30/31 (§3 sub-processors, §6 financial data, §14). It is
the factual
substrate for a `/trust` page, a privacy policy, a ToS, and a DPA. Every claim below is traceable to
a file so nothing on the published page is asserted without a basis in the product.

**One framing note up front.** No privacy page prevents legal action. What a page *does* is (a) satisfy
the affirmative disclosure duties that create liability by their absence, and (b) avoid creating new
liability by overclaiming. The largest legal exposure in this repo today is not a missing page — it is
**four claims already live on the marketing site that the code does not support**, plus **two
undisclosed access paths into customer data**. Those are listed in §1. Fix those and the page becomes
straightforward.

---

## 0. Status — what the published page already fixed (2026-07-29)

The page described in §15 now exists at [app/trust/page.tsx](app/trust/page.tsx) (styles in
[app/trust/trust.css](app/trust/trust.css)), linked from the landing footer and from the landing
trust section. Against the blocker table below:

| # | Status |
|---|--------|
| 1 | **Still open.** The page renders `LEGAL_ENTITY`, `PRIVACY_EMAIL`, `POSTAL_ADDRESS` and `GOVERNING_STATE` as loud dashed placeholders until the constants at the top of the page file are filled in. It must not go live until they are. |
| 2 | **Copy fixed.** The landing claim now reads "Roster and ledger export to CSV" — the two that exist. The missing attendance/docs exports are still unbuilt; the page routes those requests to a human instead of claiming a button. |
| 3 | **Copy fixed, code gap open.** The landing no longer promises deletion-on-request. `/trust` §11 states the attendance-history limitation plainly and offers a manual path. `deleteBrother()` still needs to clear attendance rows. |
| 4 | **Disclosed** in `/trust` §5, including an offer to confirm on request whether such a record exists in a given org. Gating or removing it is still the right call. |
| 5 | **Disclosed** in `/trust` §5, with the audit-trail constraint stated. |
| 6 | **Honoured** — the page lists report-only CSP under "what we don't claim yet" rather than claiming enforcement. |
| 7 | **Policy set on the page** (16+, no under-13 collection). Still needs mirroring in the ToS. |

Also done as part of that work: `trust`, `privacy`, `terms` and `legal` are now in `SYSTEM_ROUTES` in
[lib/slug-rules.ts](lib/slug-rules.ts), because a static `/trust` route would otherwise be shadowed
by — or shadow — an org that took that slug. No existing org uses any of the four (dev DB checked;
**verify against production before deploying**).

---

## 1. Blockers — resolve before publishing anything

| # | Issue | Where | Why it's a problem |
|---|-------|-------|--------------------|
| 1 | **No legal entity, no contact method, no address** anywhere in the app | grep for `mailto:`/`LLC`/`Inc` returns nothing; [Footer.tsx](app/components/landing/sections/Footer.tsx) links "Talk to a human" to `href="#"` | GDPR Art. 13(1)(a)–(b), CCPA §1798.130(a)(5), and CalOPPA all require an identified operator and a working contact channel. A policy without them is defective on its face. |
| 2 | **"Roster, ledger, attendance and docs export to CSV any time"** | [Trust.tsx:90-92](app/components/landing/sections/Trust.tsx#L90-L92) | Only two of four exist: roster (client-side, [brothers/page.tsx:410](app/[slug]/brothers/page.tsx#L410)) and ledger ([transactions/export/route.ts](app/api/transactions/export/route.ts)). **Attendance and docs have no export path at all.** FTC Act §5 / state UDAP deception. Either build the two exports or narrow the sentence. |
| 3 | **"full deletion is a request away"** | [Trust.tsx:92](app/components/landing/sections/Trust.tsx#L92) | There is no request channel (see #1), and `deleteBrother()` will **fail with a foreign-key violation** for any member who has ever been marked present or absent — `AttendanceRecord.brotherId` is `ON DELETE RESTRICT` ([migration](prisma/migrations/20260517000644_attendance_v2/migration.sql#L50)), and [deleteBrother()](lib/services/brother-service.ts#L225) does not clear attendance first. Org-level deletion works; member-level erasure does not. |
| 4 | **Undisclosed hidden-observer accounts.** `Brother.isGhost` grants full member-level read access while being hidden from every listing, count, and attendance roll — provisioned by typing the claim name "Atomic Samurai" | [schema.prisma:169](prisma/schema.prisma#L169), README "Identity flags" | An invisible account with read access to members' GPA and financial records, undisclosed, in a product sold to student orgs. This is the single highest-risk item in the repo. Disclose it precisely, gate it behind org-admin consent, or remove it. Do not publish a trust page while it exists undocumented. |
| 5 | **Platform staff can read and write any org's data** | `PlatformAdmin` tier, [require-user.ts:181](lib/auth/require-user.ts#L181); all permission bits granted, operates via the active-org cookie | Legitimate and normal for SaaS — but it must be disclosed as a named access path with a stated control (audit logging), not left implicit while the page says "your org, your data". |
| 6 | **CSP is report-only** | [next.config.ts:35](next.config.ts#L35) | Do not write "we enforce a content security policy". You may write that other headers are enforced (§10). |
| 7 | **No age floor and no age gate** | nothing in the codebase collects or checks age | The footer markets to "Bands, choirs & theatre" and "Student government" — plausibly high-school. Under-13 triggers COPPA; 13–18 triggers state student-privacy statutes (e.g. CA SOPIPA). Set a contractual age floor in the ToS (recommend 16+, or 13+ with school authorization) before this is a customer question. |

---

## 2. The controller / processor split — get this right first

This single distinction determines most of the page's content, and it is favorable to you. Say it
explicitly and early.

**The organization is the controller of its members' data.** The chapter/team/club decides what to
collect, who gets a seat, what custom fields exist, and how long records live. It obtains whatever
notice or consent its members are owed.

**ChaptOS is a processor / service provider for that data.** You store and compute over it on the
org's instruction and do not use it for your own purposes.

**ChaptOS is a controller for a narrow, separate set:** the Google account identity used to sign in,
the email on the account, platform telemetry, and abuse-prevention signals.

Practical consequences worth stating on the page:

- GPA, dues balances, and any custom fields are the org's collection decisions, not yours.
- Member requests for access/correction/deletion route to their org's admins first; you assist the org.
- You need a **DPA incorporated by reference into the ToS** (GDPR Art. 28 requires the processor
  relationship be in writing), including the sub-processor list in §3 and a change-notice commitment.
- CCPA: the correct term is **service provider**, and the contract must contain the §1798.140(ag)(1)
  restrictions (no selling, no retention beyond the business purpose, no combining with other data).

---

## 3. Sub-processors — the complete list

Every third party that can hold customer data. This list belongs on the page verbatim; it is what
a diligence questionnaire asks for.

| Processor | Purpose | Data it receives | Basis in code |
|-----------|---------|------------------|---------------|
| **Supabase** (Postgres, Auth, Storage) | Primary database, OAuth session management, image hosting | All application data; auth identities; avatars and org logos | [prisma.ts](lib/prisma.ts), [require-user.ts](lib/auth/require-user.ts), [org-logo.ts](lib/supabase/org-logo.ts) |
| **Vercel** | Application hosting, serverless execution, request/function logs | All data in transit; structured error and timing logs incl. `userId`, `orgId`, route, stack traces | README "Deployment"; [observability.ts](lib/observability.ts) writes JSON lines to stdout, which Vercel captures |
| **Google** (OAuth via Supabase) | Sign-in only | Authentication assertion; returns name, email, profile photo URL | [oauth.ts](lib/supabase/oauth.ts) — `signInWithOAuth({ provider: "google" })` |
| **Stripe** *(only when `STRIPE_SECRET_KEY` + `STRIPE_PRICE_ID` are set)* | Subscription billing — what an org pays **us**. Not the org's own dues/treasury books, which have no processor. | Card details, entered on Stripe-hosted Checkout/Portal pages and **never transiting our servers**; the billing contact's name and email; the org name, slug and id as metadata; and the billable member count, which is the quantity the price is computed from. No roster, dues, attendance or document data. | [stripe.ts](lib/stripe.ts), [billing-service.ts](lib/services/billing-service.ts) (`checkout.sessions.create`, `billingPortal.sessions.create`, `customers.create`), [webhook.ts](lib/billing/webhook.ts) |
| **OpenAI** | Four AI features (§9) | Chat questions, trimmed conversation history, **tool results containing real member names / dues / attendance / GPA aggregates**, meeting-notes text, digest inputs, pre-auth org-setup free text | [ai.ts](lib/ai.ts), [ai-prompt.ts](lib/ai-prompt.ts), [chat/route.ts](app/api/ai/chat/route.ts) |
| **Sentry** *(optional; only when `SENTRY_DSN` is set)* | Error monitoring | Exception messages, stack traces, `route`, `requestId`, `userId` as a tag | [observability.ts:56-72](lib/observability.ts#L56-L72) |

Notes for the page:

- The AI processors are **feature-gated, not optional-by-org**: everything is dormant when
  `OPENAI_API_KEY` is unset ([ai.ts:32](lib/ai.ts#L32)), but there is no per-org opt-out. If you want to
  offer one, that is a product change — do not imply it exists.
- Confirm and then state OpenAI's actual API data terms (default API behavior is no training on
  submitted data, with limited abuse-monitoring retention). **Verify against your current agreement
  before asserting it** — an inaccurate claim here is worse than silence.
- `SUPABASE_SERVICE_ROLE_KEY`, when configured, is a key that **bypasses row-level security**
  ([admin.ts](lib/supabase/admin.ts)). Internal-access disclosure, not a sub-processor.

---

## 4. Complete data inventory

Derived from [schema.prisma](prisma/schema.prisma) (36 models). Grouped by what a reader cares about.

### Identity & account
| Data | Model.field | Source | Notes |
|------|-------------|--------|-------|
| Google auth user id | `Brother.authUserId` | Google OAuth | Opaque UUID; the join key to Supabase Auth |
| Legal/display name | `Brother.name` | Self-entered at claim, or admin-seeded | |
| Per-org display name | `Membership.name` | Self-entered | Same person can be "Rob" in one org, "Robert Chen" in another |
| Email address | `Brother.email` | Google OAuth; backfilled on first `/api/auth/me` hit | [me/route.ts](app/api/auth/me/route.ts) — note the silent backfill write |
| Profile photo | `Brother.avatarUrl` | Google, or user upload | **Publicly readable URL** — see §12 |
| Free-text role/title | `Brother.role` | Admin | |

### Member records the org maintains
| Data | Model.field | Sensitivity |
|------|-------------|-------------|
| **Grade point average** | `Brother.gpa` | **Education-adjacent — see §6** |
| Attendance percentage | `Brother.attendance` | Behavioral; `-1` sentinel means exempt |
| Dues owed | `Brother.duesOwed` | Financial |
| Service hours | `Brother.serviceHours` | |
| **Org-defined custom fields** | `Brother.customFields` (JSON) + `OrganizationConfig.customMemberFields` | **Unbounded — see §6.** Up to 20 fields, 255 chars each, types text/number/select ([custom-member-fields.ts](lib/custom-member-fields.ts)) |
| Custom metric values | `BrotherMetricValue.value` + `OrgMetricDefinition` | Org-defined KPIs with at-risk bands |
| Hidden-observer flag | `Brother.isGhost` | See §1 #4 |

### Attendance & absence
`AttendanceRecord` (per member per event, attended true/false) · `AttendanceExcuse` (**free-text
`reason` written by the member**, plus `status`, `decidedById`, `rejectionNote`) · `AttendanceExemption`
(`reason` defaulting to "inactive", optional `note`, e.g. study abroad, co-op, medical leave).

The excuse `reason` and exemption `note` are the most likely place for a member to volunteer health or
family information. Worth calling out in the page and in admin-facing guidance.

### Financial
`Transaction` (amount, category, description, `paymentMethod`, optional `brotherId` attribution,
**soft-deleted via `deletedAt`, never hard-deleted**) · `DuesPayment` and `Reimbursement` (per-member
requests with `status` and `rejectionNote`) · `Budget` / `BudgetAllocation` · `PartyEvent`
(`doorRevenue`, `expenses`, attendance count).

`paymentMethod` is a **free-text string** — values seen in the codebase are `venmo`, `cash`, `check`,
`card`. **No payment processor is integrated for chapter money.** No card numbers, no bank details,
no ACH: ChaptOS *records* the org's money; it never moves it. This is a strong, true and reassuring
claim — make it prominently, but scope it to the chapter's books.

**The claim must NOT be made unqualified any more.** Stripe was integrated on 2026-07-30 for platform
billing (what an org pays us). The two are firewalled in code — nothing in `lib/billing/**` reads or
writes `Transaction`, `DuesPayment`, `Reimbursement` or `Budget`, and nothing in those services knows
billing exists — so the underlying facts are still good, but "no processor is integrated at all"
became false and had to be narrowed on `app/trust/page.tsx`. Card data still never touches our
servers: Checkout and the Billing Portal are Stripe-hosted, and the only thing we persist is
`Subscription.stripeCustomerId` / `stripeSubscriptionId`.

### Governance & participation
`Role` / `BrotherRole` (14 permission bits, hierarchy rank) · `Task` / `TaskAssignment` ·
**`Poll` / `PollVote` — votes are attributable: `PollVote.brotherId` records who voted for which
option, unique per poll.** Polls are *not* secret ballots; if the UI implies otherwise, that's a
disclosure gap. · `Membership` · `PlatformAdmin` · `OrgInvite` / `InviteRedemption`.

### Content & events
`CalendarEvent` (incl. `notesSummary` — AI-generated meeting summaries persisted on the row) ·
`ProgrammingEvent` (+ checklist, `wrapUpNotes`, `successRating`) · `ServiceEvent` /
`ServiceParticipation` · `Doc` / `DocFolder` (external URLs + **cached OG metadata scraped from the
destination**) · `InstagramTask` · `ChapterAnnouncement` · `PartyEvent` (`theme`, `collabOrg`, `notes`).

### Audit & telemetry
| Store | Contents | Retention |
|-------|----------|-----------|
| `OperationalEvent` | Structured fact stream: `action`, `subjectType/Id`, `actorId`, `requestId`, `metadata` JSON. **Metadata carries member names, event titles, amounts** ([emit.ts](lib/events/emit.ts)) | Indefinite; deleted only with the org |
| `ActivityLog` | Human-readable feed messages naming members and actions | Indefinite |
| `ChatApproval` | Every AI proposal a member approved, with **name and role snapshotted at approval time** ([schema.prisma:946](prisma/schema.prisma#L946)) | Indefinite |
| Assistant feedback | **The member's verbatim question text**, stored in `OperationalEvent.metadata` on thumbs-up/down ([assistant-feedback-service.ts](lib/services/assistant-feedback-service.ts)) | Indefinite |
| Server logs | JSON lines: `requestId`, `route`, `method`, `userId`, error message, **stack trace**; plus AI timing with `orgId` | Per Vercel/Sentry retention |
| Rate-limit buckets | Brother id, or **client IP** for pre-auth routes | In-memory only, per instance, evaporates on cold start ([rate-limit.ts](lib/rate-limit.ts)) |

**No product analytics exist.** No Google Analytics, no PostHog, Mixpanel, Segment, Plausible, or
Vercel Analytics — verified by grep across `app/` and `lib/`. **No advertising or tracking pixels. No
data sold or shared for cross-context behavioral advertising** (that exact CCPA phrasing matters: it
lets you state you have no §1798.120 opt-out obligation). This is your strongest privacy claim.

---

## 5. Cookies & client-side storage

There is **no cookie banner** and, on this inventory, none is required beyond a clear notice — every
cookie is strictly necessary or functional. Nothing is used for advertising or cross-site tracking.

| Name | Type | Purpose | Attributes |
|------|------|---------|-----------|
| `sb-*` (Supabase Auth) | First-party, essential | Session; refreshed on every matched request by [proxy.ts](proxy.ts) | `SameSite=Lax`, HttpOnly |
| `active_org_id` | First-party, functional | Which org the session is operating on | `HttpOnly`, `SameSite=Lax`, `path=/`, **`maxAge` 1 year** ([session-cookies.ts](lib/auth/session-cookies.ts)) |
| `brother_linked` | Legacy | No longer read; only expired to clean up old sessions | — |
| `dev_impersonate` | Development only | Local screenshot tooling | **Inert in production** — double-gated on `NODE_ENV !== "production"` *and* `DEV_AUTH_BYPASS=1`, and HMAC-signed ([dev-bypass.ts](lib/auth/dev-bypass.ts)). Safe to state plainly. |

Because auth cookies are `SameSite=Lax`, CSRF is enforced centrally: [proxy.ts](proxy.ts) rejects any
cross-origin `POST/PUT/PATCH/DELETE` to `/api/*` with a 403, covering all mutating routes including
pre-auth bootstrap endpoints.

**localStorage** (stays on the device, never transmitted except as noted):
- `Ask Chapt` conversation history — **client-only; the server never stores transcripts**
  ([ChatWidget.tsx](app/components/ChatWidget.tsx))
- `/create` org-setup draft — survives the OAuth redirect; Zod-validated and expiring on the way back
  in ([flow-state.ts](app/create/_components/flow-state.ts))
- `chaptos_last_org`, setup-checklist dismissal, cached digest strings, chat-pulse seen flag

---

## 6. Regulated and special-category data — read carefully

**GPA (`Brother.gpa`).** FERPA binds *schools*, not vendors, so ChaptOS is not directly regulated
when a student org self-reports grades. Two things change that: (a) a university adopts ChaptOS
institutionally, in which case you need a written "school official" arrangement under
34 CFR §99.31(a)(1)(i)(B) with direct-control and redisclosure terms; (b) a chapter obtains grades
*from* the registrar and loads them in — then the school has a FERPA problem and will look to your
contract. Recommended posture: state that GPA is entered by the org, that ChaptOS does not receive it
from any institution, and that orgs must have authority to hold it. Add a FERPA-addendum path for
institutional customers rather than claiming compliance you can't unilaterally deliver.

**Custom member fields are an unbounded intake.** Twenty fields × 255 free-text characters, labeled by
the org, is a vector for allergies, emergency contacts, dietary/medical notes, immigration status —
i.e. GDPR Art. 9 special categories that would pull Art. 9 duties onto a processor who never intended
them. **Mitigation is contractual and cheap: prohibit special-category data in the ToS** ("you agree
not to use custom fields to collect health, biometric, racial/ethnic, religious, sexual-orientation,
or government-identifier data"), and repeat the warning in the Settings UI where fields are created.

**Free-text absence reasons.** `AttendanceExcuse.reason` and `AttendanceExemption.note` invite health
disclosure by design ("medical leave", "study abroad"). Disclose that these are visible to anyone with
`MANAGE_ATTENDANCE` and retained indefinitely.

**Financial data.** Dues, reimbursements, and ledger entries — **no payment instruments, no card or
bank data**. The org's own books have no processor at all. Platform billing goes through Stripe, but
using Stripe-hosted Checkout and Billing Portal means card data never reaches our servers, which is
SAQ-A territory rather than PCI-DSS scope proper, and GLBA is not triggered.

**Minors.** No age collection and no gate. See §1 #7.

---

## 7. Purposes and legal bases (GDPR Art. 6 / CCPA business purposes)

| Purpose | Data | Art. 6 basis |
|---------|------|--------------|
| Provide the org's operations workspace | All org data | Art. 6(1)(b) contract, with the **org** as controller; ChaptOS acts on instruction under Art. 28 |
| Authenticate and maintain sessions | Auth id, email, cookies | Art. 6(1)(b) |
| Enforce tenancy and permissions | Membership, roles, bits | Art. 6(1)(b) / (1)(f) |
| Answer questions via AI assistant | Question text, trimmed history, tool results | Art. 6(1)(b) — the feature is the service |
| Audit trail and dispute resolution | `OperationalEvent`, `ActivityLog`, `ChatApproval` | Art. 6(1)(f) legitimate interest; accountability |
| Abuse prevention and rate limiting | Brother id, client IP | Art. 6(1)(f) |
| Error monitoring and reliability | Logs, stack traces, `userId` | Art. 6(1)(f) |
| Improve answer quality | Thumbs-up/down + **verbatim question text** | Art. 6(1)(f) — disclose specifically; this is the one purpose that is yours, not the org's |

---

## 8. Access control — who can see what inside an org

Truthful and specific beats vague reassurance. All of this is real and citable.

**Four tiers**, resolved per request by `buildContext()`:
1. **PlatformAdmin** — cross-org superuser, all bits, any org via the active-org cookie (§1 #5)
2. **`Membership.isOrgAdmin`** — all bits within the active org only; switching orgs drops back to member
3. **Member with roles** — effective permissions = bitwise OR of every held role
4. **Ghost** (`isGhost`) — member-level read, hidden from all listings (§1 #4)

**Fourteen permission bits** ([permissions.ts](lib/permissions.ts)): `MANAGE_BROTHERS`,
`MANAGE_TREASURY`, `MANAGE_EVENTS`, `MANAGE_PARTIES`, `MANAGE_INSTAGRAM`, `MANAGE_SERVICE`,
`MANAGE_ATTENDANCE`, `MANAGE_SEMESTERS`, `MANAGE_ROLES`, `MANAGE_DOCS`, `MANAGE_ANNOUNCEMENTS`,
`MANAGE_SETTINGS`, `MANAGE_TASKS`, `MANAGE_POLLS`.

**Privilege-escalation guard:** a caller may only grant, edit, or revoke roles whose `rank` is
*strictly less* than their own highest rank.

**Honest limits to state:** permission bits gate *management*, not *visibility*, for most surfaces —
ordinary members can see the roster and much of the dashboard. Do not imply field-level privacy that
doesn't exist. Anyone with `MANAGE_BROTHERS` sees GPA, dues, and every custom field for every member.

---

## 9. AI disclosures

Four surfaces, all server-side, all dormant without `OPENAI_API_KEY`. Model: `gpt-5.2`.

**What leaves your infrastructure for OpenAI:**

1. **Ask Chapt** ([chat/route.ts](app/api/ai/chat/route.ts)) — the question, up to 12 prior turns
   (older ones truncated to 600 chars), and **the full JSON of every tool result the model requested**.
   Those results contain real member names, dues balances, attendance records, and ledger rows. The
   system prompt additionally embeds a cached **chapter snapshot** — member count, number owing dues
   and total, average attendance, average GPA, treasury balance — deliberately quantized (dollars to
   $10, GPA to 0.05) for prompt-cache stability ([ai-prompt.ts](lib/ai-prompt.ts)), plus the asking
   member's name and id.
2. **Create-interview interpreter** ([interview route](app/api/ai/interview/route.ts)) — **pre-auth.**
   A founder's free-text answers go to OpenAI before any account exists or any terms are accepted.
   Bounded by per-IP rate limits (per-minute and per-day) instead of auth. **This needs a notice at the
   point of entry on `/create`, not only in the policy.**
3. **Weekly digest** ([digest route](app/api/ai/digest/route.ts)) — this week's deadlines, IG tasks,
   mandatory events, parties, and at-risk members. Cached in-memory by content hash server-side and in
   localStorage client-side.
4. **Meeting-notes summarization** ([summarize route](app/api/ai/summarize-meeting/route.ts)) — raw
   free-form meeting notes. The resulting summary **persists on `CalendarEvent.notesSummary`**.

**What you can truthfully claim:**
- Server-side only; `OPENAI_API_KEY` never reaches the browser.
- Tool data is scoped to `ctx.orgId` — the assistant cannot read another org's data.
- **Chat transcripts are not stored server-side.** History is localStorage-only.
- **The assistant never writes to the database on its own.** `propose_*` tools validate but do not
  write; the client renders a confirm card; the write happens only when a human with the right
  permission confirms, via the normal permission-guarded API route. Proposals are HMAC-signed
  ([ai-approval-sig.ts](lib/ai-approval-sig.ts)) so the confirm POST can't be tampered with. If the
  member lacks the permission, the card is **blocked, not routed** — and names who holds it.
- Approvals produce a durable `ChatApproval` record, so every AI-assisted write is auditable.
- Answers cite the records they came from; sources are derived server-side from the tools that actually
  ran, never claimed by the model ([ai-refs.ts](lib/ai-refs.ts)).
- `prompt_cache_key` is set per-org, which routes repeat requests to the same OpenAI cache shard.
  Disclose the caching; don't characterize its retention beyond what OpenAI documents.

**What you must not claim** without verifying your OpenAI agreement: that data is never retained,
never human-reviewed, or never used for training.

---

## 10. Security controls you can claim — and the ones you can't

**Claimable, with citations:**

- **Tenant isolation in two independent layers.** (1) Every Prisma operation goes through an org-scoped
  wrapper that injects `organizationId` automatically; `findUnique` is promoted to `findFirst + org
  filter`; updates and deletes use verify-then-mutate ([tenant.ts](lib/db/tenant.ts)). (2) **Postgres
  row-level security is enforcing** — as of Phase 4 the permissive `allow_all` policies are dropped and
  only `org_isolation` (`organizationId = app.org_id`) remains; `db()` issues `SET LOCAL app.org_id` on
  every scoped query. Isolation tests live in `tests/tenancy/`. This makes "one org can't read another
  — enforced at the database, not just the UI" ([Trust.tsx:89](app/components/landing/sections/Trust.tsx#L89)) an **accurate** claim.
- **Enforced security headers** ([next.config.ts](next.config.ts)): `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
  `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- **Central CSRF enforcement** on every mutating API route (§5).
- **Input validation on every write** — Zod schemas in [lib/validation/](lib/validation/), 26 modules.
- **SSRF hardening on the only outbound fetch.** The Docs link-preview scraper resolves every hostname
  and rejects private, loopback, link-local, CGNAT, and reserved ranges — including the cloud metadata
  endpoint `169.254.169.254`. Redirects are followed manually so each hop is re-validated. 5s timeout,
  256 KB read cap ([og-metadata.ts](lib/og-metadata.ts)).
- **CSV injection defense** on ledger export (`=`, `+`, `-`, `@`, tab, CR prefixes are neutralized).
- **Upload constraints**: images only, 2 MB cap, and Storage RLS confines writes to the uploader's own
  `auth.uid()` folder.
- **Money never moves without approval.** `DuesPayment` and `Reimbursement` are requests; nothing
  touches `Brother.duesOwed` or the ledger until a treasurer approves, at which point the matching
  ledger row is minted atomically in one transaction.
- **Financial soft-deletes** preserve audit history (`Transaction.deletedAt`).
- **No secrets in the client.** `DATABASE_URL`, `OPENAI_API_KEY`, and the service-role key are
  server-only.
- **Dev impersonation is dead code in production** (double-gated + HMAC).

**Not claimable as written:**

| Don't say | Because |
|-----------|---------|
| "We enforce a Content Security Policy" | It's `Content-Security-Policy-Report-Only` |
| "Rate limiting protects against abuse" | In-memory per-instance; resets on cold start; not a distributed guarantee ([rate-limit.ts:5-11](lib/rate-limit.ts#L5-L11)) |
| "Encrypted at rest / in transit" | True via Supabase and TLS, but say *"provided by our infrastructure providers"* rather than implying your own implementation |
| "SOC 2" / "ISO 27001" / "HIPAA compliant" | No audit, no BAA, no evidence in repo |
| "Penetration tested" | No evidence in repo |
| "We delete your data on request" | Not implementable for members today (§1 #3) |
| Any uptime or backup guarantee | No backup policy, DR plan, or SLA exists in the repo |

---

## 11. Retention and deletion — what actually happens

**Nothing expires on its own.** There is no cron, no pruning job, no retention policy anywhere in the
codebase (verified by grep). Every record persists until explicitly deleted. State a retention posture
honestly: *"we retain org data for as long as the organization maintains its account."*

**Org deletion works and is thorough.** An org admin typing the org slug triggers
[deleteOrg()](lib/services/org-service.ts#L772) — a hand-ordered cascade across ~20 tables inside one
transaction (rolls back on partial failure): audit logs, attendance, finance, events, content,
semesters, roles, invites, config, memberships. It also deletes the org's logo from Storage. Members
whose *only* org this was are deleted; **multi-org members are re-homed and their accounts survive** —
correct behavior, and worth explaining so the deletion summary count isn't misread as "accounts
destroyed."

**Member self-service that exists today:**
- **Leave an org** — drops their own membership and role grants; refused for the last remaining org
  admin ([leave route](app/api/orgs/leave/route.ts))
- **Unlink the account** — nulls `Brother.authUserId` and signs out; **the `Brother` row and all its
  records remain** ([unlink-self route](app/api/auth/unlink-self/route.ts))

**Erasure gaps to disclose or fix:**
- `deleteBrother()` fails on `ON DELETE RESTRICT` for anyone with attendance history (§1 #3)
- Dues payments survive member deletion by design — `Transaction.brotherId` is `SetNull` ("removing
  someone from the roster must not erase the record that they paid")
- `ChatApproval` snapshots name and role permanently, by design
- `OperationalEvent` / `ActivityLog` retain names in message text and metadata indefinitely
- Assistant-feedback question text is retained indefinitely
- Public storage objects (§12) are removed best-effort; the DB column is the source of truth, so an
  orphaned public image can survive a failed delete

---

## 12. Public exposure surfaces — must be disclosed

**Avatars and org logos are in public Supabase Storage buckets.** `avatars_public_read` grants
`SELECT` to everyone, unconditionally ([storage-avatars.sql](supabase/storage-avatars.sql)); the
`org-logos` bucket is public too. **Anyone with the URL — signed in or not — can fetch a member's
profile photo or an org's crest.** Paths are predictable (`<auth-uid>/avatar.png`,
`<auth-uid>/org-<id>-logo.png`), so the URL is the only barrier. Say this plainly. It is a normal
tradeoff, but an undisclosed one is a complaint waiting to happen.

**Invite tokens are plaintext bearer credentials.** `OrgInvite.token` is stored unhashed, deliberately
([schema.prisma:215-219](prisma/schema.prisma#L215-L219)). Anyone holding the link can join until it
expires or is revoked — and `expiresAt: null` means **never expires**, `maxUses: null` means
**unlimited**. The use cap is intentionally **soft**: concurrent joins can exceed it. Disclose that
invite links are shareable secrets, that admins should scope and revoke them, and that every redemption
is recorded in `InviteRedemption`.

**The Docs link-preview scraper makes outbound requests to URLs members paste**, identifying itself as
`ChaptOS-Docs/1.0`. This tells the destination site that someone using ChaptOS saved that link.

**The claim flow is a name-match.** A signed-in user who types a name matching an unclaimed roster row
is linked to it. Guessing a plausible name on a known org is the attack; disclose that admins should
seed rosters with names they control and review the member list.

---

## 13. Data-subject rights — implementable today vs. needs building

| Right | Status | Path |
|-------|--------|------|
| Access / portability | **Partial.** Roster and ledger export to CSV; attendance and docs do not | §1 #2 |
| Rectification | **Yes** — members edit their own name; admins edit roster fields | |
| Erasure | **No working path** for an individual member (§1 #3); works at org level | |
| Restriction / objection | **No mechanism** | Would need building |
| Withdraw AI processing | **No opt-out** — org-wide feature gate only | |
| Not sold / not shared | **Yes, truthfully** — no advertising, no analytics, nothing sold | §4 |
| Non-discrimination (CCPA) | Assertable | |
| Human review of automated decisions | **Assertable and strong** — the assistant proposes, a permitted human decides; no solely-automated decision-making with legal effect | §9 |

The cheapest credible fix: a documented rights request address (§1 #1) with a stated response window
(GDPR: one month; CCPA: 45 days), plus building the two missing exports and clearing attendance rows
inside `deleteBrother()`.

---

## 14. Jurisdictional checklist

- **GDPR / UK GDPR** — Art. 13/14 notice, Art. 28 DPA, Art. 30 records, sub-processor list, transfer
  mechanism (data sits in US infrastructure → SCCs / UK Addendum), and an EU/UK representative if you
  target those markets. Art. 9 exposure is contractual-only if you prohibit special-category custom
  fields (§6).
- **CCPA/CPRA** — you are likely a **service provider** for org data. State categories collected,
  purposes, no sale / no sharing, retention, and the rights process. Below the revenue/volume
  thresholds you may not be a covered "business" yet — the disclosures are still the right posture and
  CalOPPA independently requires a conspicuous policy for any commercial site collecting California
  residents' PII.
- **FERPA** — not directly binding; becomes contractual on institutional adoption (§6).
- **State student-privacy statutes** (CA SOPIPA, ~40 similar) — trigger on K-12 use. Bind to the age
  floor decision in §1 #7.
- **COPPA** — trigger under 13. Prohibit contractually.
- **PCI-DSS / GLBA** — no payment instruments stored and no financial-institution role. Card data is
  entered on Stripe-hosted pages and never touches our servers (SAQ-A shape), so full PCI-DSS scope
  does not attach; GLBA is not triggered. Note this is a *narrowing* of the pre-2026-07-30 position,
  which was simply "no processor" — see §6.
- **HIPAA** — out of scope, but the free-text fields in §6 are how it accidentally comes into scope.
  The contractual prohibition is the control.
- **FTC Act §5 / state UDAP** — **the most likely enforcement theory against this product today**, and
  it is entirely about §1's claim/reality gaps rather than about data handling.

---

## 15. Suggested page structure

A `/trust` page that lands well and defends well:

1. **What we are** — legal entity, contact, and the controller/processor split in three sentences (§2)
2. **What we never do** — no data sold, no advertising, no analytics or tracking pixels, no payment
   instruments held, no AI training on your data *(subject to §3 verification)*, no cross-org access
3. **The data your org keeps here** — the §4 inventory in plain categories
4. **Who can see it** — the four tiers, the fourteen permissions, plus the honest note that management
   bits aren't visibility bits, plus the platform-staff and hidden-observer disclosures (§8, §1)
5. **How the AI works** — proposes, never acts; scoped to your org; transcripts stay on your device;
   what goes to OpenAI and why (§9)
6. **How isolation is enforced** — the two independent layers, with the RLS detail (§10)
7. **Security specifics** — headers, CSRF, validation, SSRF, upload limits, approval-gated money (§10)
8. **Where your data lives** — the sub-processor table verbatim (§3)
9. **Cookies** — the four-row table; note that none are used for advertising (§5)
10. **Retention and deletion** — org deletion, leaving, unlinking, and the honest limits (§11)
11. **Your rights and how to exercise them** — with a real address and a stated response window (§13)
12. **Changes to this page** — versioning and notice commitment

**Tone note.** The product's own voice — "An assistant holding your org's money should be boring about
it" — is the right register for this page: specific mechanisms, named limits, no adjectives. Every
place §10 says "don't claim," there is usually a narrower true statement that reads *more* credibly
than the overclaim it replaces.

---

## 16. Ranked pre-publish fix list

1. Register the entity; add a real contact address and a rights-request inbox. *(Blocks everything.)*
2. Resolve the ghost-account disclosure — document it precisely, gate it, or remove it.
3. Fix the [Trust.tsx](app/components/landing/sections/Trust.tsx) export sentence, **or** build
   attendance and docs CSV export. Two lines of copy, or two small routes.
4. Make member erasure actually work: clear `AttendanceRecord` inside `deleteBrother()`, and document
   what intentionally survives (ledger attribution, audit log).
5. Add the special-category prohibition to the ToS and a warning where custom fields are created.
6. Set the age floor and reflect it in the ToS.
7. Add a pre-auth AI notice on `/create` — data goes to OpenAI before any account exists.
8. Verify OpenAI's data terms in writing, then state them; don't infer.
9. Write the DPA (Art. 28 terms + §3 sub-processor list + change notice) and incorporate it by reference.
10. Decide whether polls should be secret ballots. `PollVote.brotherId` makes every vote attributable
    today; if the UI reads as anonymous, either change the UI copy or stop storing the voter.
11. Promote the CSP from report-only once violations are clean — then you can claim it.
12. Write down a retention schedule, even a permissive one, so "indefinite" is a decision rather than
    an omission.
