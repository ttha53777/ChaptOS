# ChaptOS

Chapter operations platform — a single place to run any chapter-based organization. It covers the whole operational surface — members, attendance, dues, GPA, service hours, tasks and polls handed out to members or roles, treasury and budgets with dues/reimbursement approvals, parties, programming events with prep checklists, Instagram content, community-service participation, meeting notes, and a foldered docs library — tied together by a live activity log, a pinned announcement, and a weekly digest of what's on deck. Members join by claiming a pre-seeded roster row or by redeeming an org invite link.

Each org shapes the platform to itself: a founder builds their org through a short pre-auth `/create` flow that tailors the enabled pages, vocabulary, officer roles, **custom per-member fields**, and **custom org-defined metrics** to the kind of organization being set up — a sports team, a marching band, a volunteer group, or a fraternity each get a starting setup that fits, rather than a chapter-only default.

Everything runs in one operations dashboard, with a dedicated app-like layout on mobile. A tool-calling AI assistant ("Ask the Chapter") answers questions and proposes write actions, backed by an offline eval harness so answer quality is measured, not guessed at.

Multi-org: each Organization is a fully isolated tenant. One Google account can belong to multiple orgs and switch between them via an `active_org_id` cookie.

---

## Table of Contents

- [Highlights](#highlights)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Tenancy Model](#tenancy-model)
- [Org Creation](#org-creation)
- [AI Features](#ai-features)
- [Roles & Access](#roles--access)
- [Project Structure](#project-structure)
- [Auth Flow](#auth-flow)
- [Database Schema](#database-schema)
- [Environment Variables](#environment-variables)
- [Local Setup](#local-setup)
- [Deployment](#deployment)

---

## Highlights

The design decisions that do the most work:

- **Org-scoped DB wrapper with automatic tenancy injection.** `lib/db/tenant.ts` wraps every Prisma operation to inject `organizationId` automatically — services call `ctx.db.transaction.create(...)` and can't accidentally touch another org's data. `findUnique` is replaced by `findFirst + org filter`; updates and deletes run a verify-then-mutate pattern to preserve exact return types without needing composite unique constraints everywhere.
- **Three-tier auth: PlatformAdmin → OrgAdmin → Member.** `buildContext()` in `lib/context` resolves all three tiers per request, emits a typed `RequestContext`, and optionally gates on a specific permission or rate-limits the caller. Route handlers open with `buildContext()`, parse with Zod, call a service, and map errors with `toResponse()` — no `prisma.*` calls in `app/api/**`.
- **Side effects through events, never service-to-service calls.** Services call `emit(ctx, action, subject, metadata)` from `lib/events`. Reactions (recalcs, notifications, projections) live as `on(action, handler)` registrations in `lib/events/handlers/`. The event writer also dual-writes an `ActivityLog` row so the existing feed keeps working.
- **Tool-calling AI assistant with self-correcting validation.** Sixteen read tools + six write-proposal tools in one file ([lib/ai-tools.ts](lib/ai-tools.ts)) so schema and dispatcher can't drift. `validateArgs` walks the schema before dispatch — a wrong enum returns a structured error the model self-corrects on the next iteration.
- **Pre-auth org creation that survives OAuth.** A founder builds their org through a six-step `/create` flow (name → interview → roles → timeline → blueprint → build) while signed out — Google sign-in happens *last*, at the Build step. The in-progress answers live in a `localStorage` draft ([lib/onboarding/draft.ts](lib/onboarding/draft.ts)) so the whole flow round-trips through the OAuth redirect and resumes at `/create?resume=1`. The draft is untrusted on the way back in: `parseDraft()` Zod-validates and expires it, and `draftToCreateOrgInput()` is the single mapping to the real `POST /api/orgs` payload. `provisionOrg` applies the resulting blueprint atomically and stamps `onboardingCompletedAt` at creation — there is no separate post-creation setup step.
- **Org-defined custom fields and metrics.** Admins can add per-member fields (stored sparsely on `Brother.customFields`) and define their own KPIs (`OrgMetricDefinition` + `BrotherMetricValue`) with goal / watch / at-risk bands and an aggregation (`avg` / `sum` / `count_on_track`) — so a team can track "Jersey #" and a band can track "Section" without schema changes. Pure status/headline math lives in [lib/metrics.ts](lib/metrics.ts) and [lib/custom-member-fields.ts](lib/custom-member-fields.ts), importable from both server and client.
- **Offline eval harness.** Hand-written cases at [evals/ask-the-chapter/cases.jsonl](evals/ask-the-chapter/cases.jsonl) drive the same loop as the production route in-process, graded on tool selection, args, and final-answer substrings. Lets prompt and model changes be measured instead of vibes-checked.
- **Per-org timeline vocabulary.** The categories every timeline entry is tagged with are `CalendarEventType` rows the org owns, not a hardcoded enum. Four built-ins ([lib/event-types.ts](lib/event-types.ts)) seed at creation with immutable slugs — behavior branches on them — but any org can rename, recolor, reorder, hide, or add its own from the `/create` Timeline step or **Settings → Event types**. Each type carries a light/dark hex pair and an optional gating `workflowId`, so a type whose page is off stays seeded but drops out of the picker.
- **Tasks and polls target roles, not just people.** A `Task` (dated = a "deadline", undated = a to-do) or `Poll` attaches to any mix of members and roles. Role targets resolve to *current* holders at read time rather than being snapshotted, so granting someone a role hands them that role's open tasks and voting rights automatically.
- **Money moves only on approval.** `DuesPayment` and `Reimbursement` rows are requests: nothing touches `Brother.duesOwed` or the `Transaction` ledger until a treasurer approves, at which point the service mints the matching ledger row and adjusts the balance atomically in one transaction. The `transactionId` link is the only thread between the two books.
- **Discord-style role system with permission bitfields.** Fourteen named permissions ([lib/permissions.ts](lib/permissions.ts)) packed into a 32-bit int on each `Role`. A member's effective bits are the bitwise OR of every role they hold. Role hierarchy ranks prevent privilege escalation — a caller can only grant/edit roles strictly below their own highest rank.
- **Write proposals, never silent writes.** The AI's `propose_*` tools validate inputs server-side but never touch the database. The client renders a confirm card; only on user confirmation does it POST to the real `/api/*` route where `buildContext()` guards decide whether the write actually happens.
- **Structured server-side observability.** One JSON-per-line error log ([lib/observability.ts](lib/observability.ts)) with request IDs, route tags, and optional Sentry forwarding via a lazy dynamic import — no dependency cost until enabled.
- **Two ways into an org.** Admins can pre-seed roster rows that members claim by name, or share an `OrgInvite` link ([app/join/[token]/](app/join/%5Btoken%5D/)). Invites come in two modes: `open` mints a fresh `Brother` + `Membership` on redemption, `claim` routes the user into the existing name-match claim flow. Every redemption is recorded in `InviteRedemption`.
- **Soft deletes on financial data.** `Transaction` rows are never hard-deleted; `deletedAt` preserves history for audit and undo.
- **Foldered docs library with drag-and-drop.** The docs page groups pinned links into one-level `DocFolder`s (à la Google Drive) with drag-and-drop filing, a sort control (newest / name / kind), contributor attribution, and copy-link / refresh-preview card actions. Deleting a folder releases its docs back to the library root instead of cascading them away.
- **Admin-reorderable sidebar.** Admins can reorder the nav pages within each group; the chosen order persists to `OrganizationConfig.navOrder` as a sparse, advisory list of nav labels. The sidebar sorts each group by it and appends anything not listed, so a hidden page keeps its slot and re-enabling it lands back where the admin put it ([lib/nav-order.ts](lib/nav-order.ts)).
- **CSS-only responsiveness.** Desktop and mobile dashboards are sibling trees toggled with Tailwind breakpoints — no JS viewport detection, no layout flash on hydration.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 6 |
| UI | React 19, Tailwind CSS 4 |
| Charts | Recharts 3 |
| Auth | Supabase Auth (Google OAuth) |
| Database | PostgreSQL via Supabase |
| ORM | Prisma 7 with `@prisma/adapter-pg` |
| Connection pooling | `pg.Pool` + Supabase pooler (PgBouncer) |
| File storage | Supabase Storage (`avatars` bucket) |
| AI | OpenAI Chat Completions (`gpt-5.2`) with parallel tool calls |

> **Note:** This project pins recent, fast-moving versions (Next 16, React 19, Prisma 7, Tailwind 4). APIs and conventions may differ from older majors — check `node_modules/next/dist/docs/` and the Prisma 7 docs before assuming older patterns apply. In Prisma 7, datasource connection URLs live in `prisma.config.ts`, **not** in `schema.prisma`.

---

## Architecture

```
Browser
  │
  ├── Next.js App Router (app/)
  │     ├── proxy.ts (middleware) — auth gate on every request
  │     ├── app/layout.tsx — ChapterProvider wraps the whole app
  │     ├── app/[slug]/page.tsx — the Operations Dashboard (desktop + mobile)
  │     └── app/api/** — JSON API routes (thin controllers)
  │            ├── api/ai/chat        — streaming tool-calling assistant
  │            ├── api/ai/digest      — one-sentence weekly recap (cached)
  │            └── api/ai/summarize-meeting — meeting-notes summary (cached)
  │
  ├── Supabase Auth — Google OAuth, cookie-based sessions
  ├── Supabase Storage — custom profile photos (avatars bucket)
  ├── OpenAI API — gpt-5.2, server-side only
  │
  └── PostgreSQL (Supabase) — Prisma ORM over a pg.Pool
```

**Key design decisions:**

- **Route handlers are thin controllers.** Open with `buildContext()` from `@/lib/context`, parse with a Zod schema from `@/lib/validation`, call a service from `@/lib/services`, map errors with `toResponse()` from `@/lib/errors`. No `prisma.*` or raw `db()` calls in `app/api/**` outside the auth bootstrap routes.
- **Side effects flow through events.** Services call `emit(ctx, action, subject, metadata)` from `@/lib/events`. Reactions live as `on(action, handler)` registrations in `lib/events/handlers/`. Never call another service from inside a service — emit an event.
- **Three-layer identity.** Supabase manages OAuth sessions; `Brother` holds per-org profile data; `Membership` links the two and carries the org-admin flag. A signed-in user has no access until their Google account is linked to a `Brother` row within an org.
- **Global state via `ChapterContext`.** All chapter data is fetched once on mount in `ChapterProvider` and shared app-wide. Pages do optimistic updates against context instead of refetching.
- **All DB access through API routes.** Client components never touch Prisma. Every mutation goes through an API route that resolves `buildContext()` before touching the database.
- **Persistent avatars.** Custom profile photos are stored in Supabase Storage and the URL is persisted on `Brother.avatarUrl`. That column — not the volatile Supabase auth metadata — is the source of truth.
- **CSS-only responsiveness.** The desktop and mobile dashboards are sibling trees toggled purely with Tailwind breakpoints (`md:hidden` / `hidden md:block`). The mobile dashboard is a tabbed layout: **Overview · Tasks · Money · Brothers · Logs**.
- **Rate-limited mutations.** A simple in-memory limiter ([lib/rate-limit.ts](lib/rate-limit.ts)) caps mutations and AI chat turns per member per minute.

---

## Tenancy Model

Every organization is a fully isolated tenant. The enforcement layers, from outermost to innermost:

1. **Active-org cookie.** `proxy.ts` reads the `active_org_id` cookie on every request and the resolved org flows into `requireUser()`.
2. **`buildContext()`** resolves the `RequestContext` for the request, which includes `ctx.orgId` and an org-scoped `ctx.db` instance. Route handlers never resolve org context themselves.
3. **`ctx.db` (org-scoped wrapper).** `lib/db/tenant.ts` wraps every Prisma model to inject `organizationId` on all reads and writes automatically. `findUnique` is silently promoted to `findFirst + org filter`; updates and deletes use a verify-then-mutate pattern to avoid needing `@@unique([id, organizationId])` on every model.
4. **Postgres RLS.** Row-level security policies are the DB-layer backstop. As of Phase 4, `allow_all` permissive policies have been dropped on all org-scoped tables; only `org_isolation` (`organizationId = app.org_id`) remains. `RLS_SET_ORG_ID=1` must be set in every env — `db()` issues `SET LOCAL app.org_id` on every scoped query. Bootstrap paths (claim, redeem-invite, provisionOrg) run as `prismaPrivileged` (BYPASSRLS via `DIRECT_URL`) and are unaffected. To revert to permissive, apply `prisma/migrations/20260622000002_phase4_revert_allow_all/migration.sql` directly.

Every write must go through `ctx.db.<model>` (org-scoped) or carry an explicit `organizationId` in the data. Tenancy tests in `tests/tenancy/` guard this invariant.

**Multi-org membership.** A single `Brother` (Google identity) can hold `Membership` rows in multiple orgs. The `active_org_id` cookie selects which org's data the current session operates on. Switching orgs updates the cookie.

---

## Org Creation

Founders build a new org through a self-contained, **pre-auth** flow at [app/create/](app/create/) — the whole interview runs signed out, and Google sign-in happens *last*, at the Build step. This keeps the door to the platform open to anyone with a Google account: no invite, no pre-seeded row, no admin required to start.

**The six steps** ([CreateFlow.tsx](app/create/_components/CreateFlow.tsx)):

1. **Name** — org name, live slug preview, and an optional logo/crest upload.
2. **Interview** — a **scripted spine with AI branches** (~8 questions: kind → activity variant → pages deep-dive → term model → current term → per-member metrics → the founder's name → their title). Chip taps are fully deterministic; free-text routes through the pre-auth, IP-rate-limited interpreter at [app/api/ai/interview/route.ts](app/api/ai/interview/route.ts), which turns the words into structured picks and — on the pages stage — may ask a few *specific* clarifying follow-ups (bounded client-side) to settle the workflow set. Any AI failure degrades to keyword matchers ([lib/onboarding/kinds.ts](lib/onboarding/kinds.ts), [lib/onboarding/terms.ts](lib/onboarding/terms.ts)), so the flow works with `OPENAI_API_KEY` unset and never blocks on a model. The kind answer sets *vocabulary only*; the variant follow-up ("what kind of fraternity?") layers workflow/seat/metric deltas via `KIND_VARIANTS` — fixing the "fraternity collapse" documented in [docs/onboarding-interview-discovery.md](docs/onboarding-interview-discovery.md). Every answer flashes the live blueprint sheet.
3. **Roles** — stacked seat cards with renameable titles, workflow-gated ability pills (whole-area grants) and an Advanced disclosure of the individual `MANAGE_*` flags. Seats describe *authority*, not people — no holder names, no invite step here.
4. **Timeline** — the categories every timeline entry gets tagged with, edited against a live sample month so a rename or recolor shows its consequence immediately. Built-ins can be renamed and recolored but never removed (their slugs are load-bearing); the org type's starter set and anything the founder adds are removable. A type whose gating page is off renders as a *ghost* row rather than vanishing — it still gets seeded, so the row tells the truth about what provisioning will build. Gated behind the interview: unreachable until the activity questions are answered.
5. **Blueprint** — a full review sheet: editable chapter URL with a live slug check, workflow toggles with rationale, the high-signal vocab words with derived plurals, the "This term" card (term model + editable first-term dates), the "Tracking" card (built-in metric toggles + custom per-member metrics), and the leadership seat list.
6. **Build** — Google sign-in (for a signed-out founder), then the real `POST /api/orgs` fires and provisioning animates.

**How it holds together:**

- **The draft survives OAuth.** All answers live in a `localStorage` draft ([lib/onboarding/draft.ts](lib/onboarding/draft.ts)) keyed `figurints:create-draft:v2` (v1, the pain-question era, is discarded on sight rather than migrated). The founder signs in at the Build step; the OAuth callback lands back at `/create?resume=1`, the draft is restored, and Build auto-fires provisioning. Drafts older than 7 days are discarded on restore.
- **The draft is untrusted on the way back in.** It round-trips through the browser, so `parseDraft()` Zod-validates and expires it rather than trusting our own writes — a draft that fails to parse is discarded and the founder restarts, never crashes. `draftToCreateOrgInput()` is the single mapping from draft to the `POST /api/orgs` payload, and `tests/onboarding/create-draft.test.ts` asserts its output parses under `createOrgInput` for every org kind × variant.
- **`provisionOrg` applies the blueprint atomically.** [lib/services/org-service.ts](lib/services/org-service.ts) resolves the founder's blueprint against the org-type template (filling any omitted field), then runs the whole org + config + roles + founder-membership provisioning in a single `$transaction`, stamping `OrganizationConfig.onboardingCompletedAt` at creation. The interview's term answer becomes the org's **first active `Semester`** (so attendance/dues book against it on day one), custom metrics seed **`OrgMetricDefinition`** rows, the Timeline answer seeds **`CalendarEventType`** rows, and un-tracked built-ins hide their dashboard KPI widgets via `disabledFeatures`. The founder role is forced to rank 100 + full bitfield so the founder can never lock themselves out. Bootstrap provisioning runs as `prismaPrivileged` (BYPASSRLS) since no org context exists yet.
- **Org-type priors as a fallback.** [lib/org-types.ts](lib/org-types.ts) seeds a sensible preset per org type, so provisioning still yields a coherent setup for any field the blueprint leaves unset.

> The old post-creation `/[slug]/onboarding` wizard is **retired** — setup now happens entirely pre-creation, and that route redirects straight into the live workspace.

---

## AI Features

Four AI surfaces, all server-side, all dormant when `OPENAI_API_KEY` is unset. Three run behind auth; the interview interpreter is deliberately **pre-auth** (the `/create` flow runs signed out) and is bounded by IP rate limits + tight token budgets instead:

### Create-interview interpreter
[app/api/ai/interview/route.ts](app/api/ai/interview/route.ts) · [lib/ai.ts](lib/ai.ts) `interpretInterview()`

Turns a founder's free-text interview answers into structured picks (workflow add/removes, vocab tweaks, kind/variant, custom metrics, a founder title) plus at most one clarifying follow-up per turn — deepest on the pages stage, where a bounded loop (max 5 follow-ups) asks specific workflow-resolving questions instead of assuming from the template. Non-streaming strict-JSON-schema output; every id in the response is intersected with the real registries (`validateInterviewResult`) before it leaves the route, and the model only *proposes* — picks dispatch into the same client-side draft reducer the founder's own taps use, with the blueprint review still in front of provisioning. Any failure returns `result: null` and the client falls back to keyword matchers.

### Ask the Chapter — tool-calling assistant
[app/api/ai/chat/route.ts](app/api/ai/chat/route.ts) · [app/components/ChatWidget.tsx](app/components/ChatWidget.tsx)

A floating chat widget that answers ad-hoc questions about chapter state — *"who has the worst attendance?"*, *"how much have we spent on Party Supplies?"*, *"add a deadline for next Friday"* — by calling tools instead of inventing answers.

**How it's built:**
- **Twenty-two tools** declared in [lib/ai-tools.ts](lib/ai-tools.ts): 16 read tools and 6 write-proposal tools. The schemas the model sees and the dispatcher that runs the tools live in the same file so they can't drift.
- **Scoped to the authenticated org.** The system prompt and all tool data are bounded to `ctx.orgId`. The assistant can't read or propose writes against another org's data.
- **Server-Sent Events streaming** with a Node-runtime endpoint, custom SSE framing, and a 10-iteration tool-call loop that lets the model chain queries.
- **Parallel tool calls.** When the model emits multiple calls in one turn, the server runs them concurrently via `Promise.all`.
- **Schema-validated args** (`validateArgs`). Wrong enums return a structured error the model self-corrects on the next iteration.
- **Writes are proposals, not executions.** `propose_*` tools validate inputs but never write — the client renders a confirm card and POSTs to the real route on user confirmation. `buildContext()` guards still decide whether the write happens.
- **Date context injected at prompt build time** ([lib/ai-prompt.ts](lib/ai-prompt.ts)): today's date + weekday, week bounds, last chapter-meeting date, active semester.
- **History trimmed before send.** Last 12 turns, prior messages capped at 600 chars.

### Weekly digest narration
[app/api/ai/digest/route.ts](app/api/ai/digest/route.ts)

One short sentence summarizing this week's deadlines, IG tasks, mandatory events, parties, and at-risk members. Heavily cached: in-memory by content hash on the server, plus per-key localStorage on the client. Falls back gracefully when AI is disabled.

### Meeting-notes summarization
[app/api/ai/summarize-meeting/route.ts](app/api/ai/summarize-meeting/route.ts)

On-demand summary of free-form chapter-meeting notes into Decisions / Action items / Discussed sections. Summary + content hash persist on the `CalendarEvent` row so a re-render doesn't re-summarize, but a content change does.

### Eval harness
[evals/ask-the-chapter/cases.jsonl](evals/ask-the-chapter/cases.jsonl) · [scripts/eval-ask-the-chapter.ts](scripts/eval-ask-the-chapter.ts)

Offline pass/fail harness for the chat feature. Drives the same tool-calling loop as the production route in-process (no HTTP, no SSE), against the live seeded DB. Grades each case on tool selection, args, and final-answer substrings. Cases run concurrently (4 at a time).

```
[PASS] super-attendance-worst (1820ms, 2 iter)
[FAIL] deadlines-empty-broaden (2410ms, 2 iter)
        ↳ mustNotInclude present: "error"
──────────────────────────────────
Score: 24/31  (77.4%)
──────────────────────────────────
```

---

## Roles & Access

Access is controlled by three independent mechanisms: auth tiers, identity flags, and permission bitfields.

### Auth tiers (checked in order)

| Tier | What it does |
|------|--------------|
| **`PlatformAdmin`** | Cross-org superuser. A separate `PlatformAdmin` table row, not a flag on `Brother`. All permission bits set. Can operate on any org via the active-org cookie. All actions are auditable. |
| **`isOrgAdmin = true`** on `Membership` | Per-org admin. All permission bits set within the active org only. Switching to a different org yields a regular member context. Does not bypass rate limiting. |
| *Regular member* | Permission bitfield from assigned `BrotherRole` rows. No elevated bits. |

`buildContext()` resolves these tiers per request and exposes `ctx.isPlatformAdmin` and `ctx.isOrgAdmin`.

### Identity flags on `Brother`

| Flag | What it does |
|------|--------------|
| **`isAdmin = true`** | Legacy superuser flag. Still present in schema for backcompat; new code should use `Membership.isOrgAdmin` instead. |
| **`isGhost = true`** | Full member-level read access, but hidden from every member listing, count, and attendance enrollment — an observer (e.g. an alumnus) with no footprint. Provisioned via the "Atomic Samurai" claim name; never granted admin. |

### Permission flags ([lib/permissions.ts](lib/permissions.ts))

Fourteen named permissions packed into a 32-bit bitfield on each `Role`:

```
MANAGE_BROTHERS  MANAGE_TREASURY  MANAGE_EVENTS       MANAGE_PARTIES   MANAGE_INSTAGRAM
MANAGE_SERVICE   MANAGE_ATTENDANCE  MANAGE_SEMESTERS  MANAGE_ROLES     MANAGE_DOCS
MANAGE_ANNOUNCEMENTS  MANAGE_SETTINGS  MANAGE_TASKS   MANAGE_POLLS
```

`MANAGE_SETTINGS` covers org config + invite links, kept distinct from `MANAGE_BROTHERS` (roster CRUD) so settings authority isn't bundled with roster editing. `MANAGE_TASKS` / `MANAGE_POLLS` gate *authoring* — anyone assigned to a task can mark it done, and anyone assigned to a poll can vote, without either bit.

A member's *effective* bitfield is the bitwise OR of every role they hold. UI surfaces and API routes both check the same `hasPermission(bits, "MANAGE_X")` helper.

### Roles

Each role bundles a name, optional color chip, a permission bitfield, and a hierarchy `rank`. Seeded system roles (e.g. **President** with all permissions) are protected from rename/delete. Custom roles are managed from **Settings → Roles** by anyone with `MANAGE_ROLES`.

**Hierarchy guard:** a caller can only grant, edit, or revoke roles whose `rank` is *strictly less* than their own highest assigned role's rank.

---

## Project Structure

```
figurints/
├── app/
│   ├── [slug]/                   # per-org routes (org resolved from the slug segment)
│   │   ├── layout.tsx            # gates link/membership status, syncs active org
│   │   ├── page.tsx              # the Operations Dashboard (desktop + mobile)
│   │   ├── onboarding/           # retired — redirects into the live workspace
│   │   ├── brothers/  chapter/  docs/  events/  instagram/
│   │   ├── parties/  service/  settings/  tasks/  timeline/  treasury/
│   │   └── AccessDenied.tsx · ActiveOrgSync.tsx
│   ├── create/                   # pre-auth org-creation flow (name→interview→roles→timeline→blueprint→build)
│   │   ├── page.tsx · create-flow.css
│   │   └── _components/          # CreateFlow + step components, flow-state (useDraft)
│   ├── api/                      # JSON API routes (thin controllers)
│   │   ├── ai/                   # chat (SSE), digest, summarize-meeting, interview (pre-auth)
│   │   ├── metrics/              # custom metric definitions + dashboard snapshot
│   │   │                         #   (per-member values live under brothers/[id]/metrics)
│   │   ├── activity/             # activity log (+ /full)
│   │   ├── admin/orgs/           # platform-admin cross-org management
│   │   ├── announcement/         # single pinned chapter announcement
│   │   ├── attendance/           # record attendance per event
│   │   ├── auth/                 # claim, me, signout, avatar, accounts, unlink-self
│   │   ├── brothers/             # roster CRUD (+ /[id]/attendance, /[id]/roles, /[id]/metrics)
│   │   ├── budget/               # semester budget + allocations
│   │   ├── calendar/             # chapter events (+ /event-types — per-org timeline categories)
│   │   ├── docs/                 # pinned chapter links + folders + /refresh-metadata
│   │   ├── dues/                 # dues adjustments + reconciliation
│   │   ├── excuses/              # attendance excuses
│   │   ├── exemptions/           # per-semester attendance exemptions
│   │   ├── instagram/            # content calendar
│   │   ├── invites/              # org invite links (open / claim modes)
│   │   ├── orgs/                 # config, logo, manage, leave, setup-apply, slug-check
│   │   ├── parties/              # party events + revenue
│   │   ├── polls/                # member/role-assigned polls + voting
│   │   ├── programming/          # programming events + prep checklist + docs
│   │   ├── reimbursements/       # reimbursement requests + approval
│   │   ├── roles/                # role CRUD + permission bitfield editor
│   │   ├── semesters/
│   │   ├── service-events/       # community service log
│   │   ├── service-participation/ # per-member service-event attendance
│   │   ├── tasks/                # tasks + deadlines assigned to members/roles
│   │   ├── transactions/         # treasury entries (+ /export CSV)
│   │   └── treasury/             # balance/trend rollup
│   ├── auth/callback/            # OAuth redirect handler
│   ├── join/[token]/             # invite-link redemption
│   ├── welcome/                  # zero-membership landing
│   ├── components/
│   │   ├── ChatWidget.tsx        # floating "Ask the Chapter" assistant
│   │   ├── ChatWidgetGate.tsx
│   │   ├── Sidebar.tsx
│   │   ├── UserAvatar.tsx        # photo upload/remove menu
│   │   ├── BrotherAvatar.tsx     # avatar with initials fallback
│   │   ├── dashboard/
│   │   │   ├── widgets.tsx       # KPI cards, health, activity feed, charts
│   │   │   ├── AnnouncementCard.tsx / AnnouncementEditor.tsx
│   │   │   ├── DashboardCharts.tsx · SparkLine.tsx · DrawerTrendChart.tsx
│   │   │   ├── QuickActionsMenu.tsx · Toast.tsx · forms.tsx · styles.ts
│   │   │   ├── drawers/          # BrotherDrawer, etc.
│   │   │   ├── primitives.tsx    # Card, Modal, StatusBadge, ConfirmDialog
│   │   │   └── mobile/           # MobileDashboard + Overview/Tasks/Money/Logs/Brothers tabs
│   │   ├── programming/          # programming-event planner + prep checklist UI
│   │   ├── timeline/             # CalendarEventForm
│   │   ├── treasury/             # BudgetView, TreasuryCharts, TxForm
│   │   ├── grid/                 # shared grid/table primitives
│   │   └── landing/              # marketing/landing surfaces
│   ├── context/ChapterContext.tsx
│   ├── hooks/                    # useCurrentUser, useOrgLogo, useOrgPath
│   ├── generated/prisma/         # generated client (gitignored)
│   ├── login/  pending-access/  welcome/  join/   # auth + onboarding entry points
│   ├── data.ts                   # shared types, thresholds, formatters
│   ├── page.tsx                  # root redirect to the active org's /[slug]
│   └── layout.tsx                # ChapterProvider wraps the whole app
├── lib/
│   ├── context/                  # buildContext() — per-request auth + tenancy
│   │   └── request-context.ts
│   ├── db/                       # org-scoped Prisma wrapper (tenancy enforcement)
│   │   └── tenant.ts
│   ├── services/                 # domain services (brother-service, transaction-service, …)
│   ├── events/                   # emit(), on(), action registry, handlers/
│   │   ├── emit.ts
│   │   ├── actions.ts
│   │   └── handlers/             # recalc-attendance, …
│   ├── state/                    # typed enums + guards for status columns
│   ├── validation/               # shared Zod schemas
│   ├── errors/                   # toResponse() — canonical error mapping
│   ├── canonical.ts              # Member/Org/Period aliases
│   ├── ai.ts                     # OpenAI client + shared narrate() helper
│   ├── ai-prompt.ts              # buildSystemPrompt
│   ├── ai-tools.ts               # tool schemas + dispatcher + validateArgs
│   ├── onboarding/               # /create draft model (draft, kinds, seats, perm-areas, event-types)
│   ├── org-types.ts              # org-type presets + workflow registry (onboarding priors)
│   ├── event-types.ts            # built-in timeline event types + shared color palette
│   ├── workflow-features.ts      # per-workflow toggleable features + disabledFeatures
│   ├── metrics.ts                # custom-metric status/headline math (pure)
│   ├── custom-member-fields.ts   # custom member-field types + helpers (pure)
│   ├── tasks/                    # urgency.ts — task urgency computed from dueDate (pure)
│   ├── auth/                     # require-user, require-permission, require-admin
│   ├── permissions.ts            # 14-bit permission flags + helpers
│   ├── seed-roles.ts             # system role seeding (idempotent)
│   ├── og-metadata.ts            # Doc URL probe (OG tags, favicon, embed-OK check)
│   ├── supabase/                 # client.ts, server.ts, admin.ts
│   ├── activity.ts · attendance.ts
│   ├── avatar.ts · brother-avatar.ts
│   ├── observability.ts          # structured JSON logging + lazy Sentry
│   ├── rate-limit.ts             # per-user mutation/chat rate limiter
│   └── prisma.ts                 # Prisma singleton over pg.Pool
├── evals/ask-the-chapter/        # AI eval cases + how-to
├── scripts/                      # eval-ask-the-chapter.ts, seed-roles.ts, diag-*, dedupe-*
├── prisma/                       # schema, seed, migrations
├── supabase/                     # storage bucket + RLS SQL
├── tests/tenancy/                # tenancy isolation tests
├── tests/onboarding/             # /create draft mapping + org provisioning tests
├── proxy.ts                      # Next.js middleware (auth gate + org resolution)
├── prisma.config.ts              # Prisma 7 datasource for CLI
└── next.config.ts
```

---

## Auth Flow

```
1. User visits any protected page
        │
        ▼
2. proxy.ts checks for a valid Supabase session cookie
        │
        ├── No session ──────────────────────────────────► /login
        │
        └── Session present ──────────────────────────────► pass through (refreshed cookie)
                │
                ▼
   [slug] layout gates link/membership status (proxy no longer does):
        ├── Member of <slug> ─────────────────────────────► render org dashboard
        ├── Signed in, no Brother linked ─────────────────► /pending-access
        └── Linked, but not a member of <slug> ───────────► access-denied (or /welcome if zero memberships)
                │
                ▼
3. /login — "Continue with Google" → Supabase OAuth
        │
        ▼
4. /auth/callback — exchanges code for session, checks Brother + Membership tables
        │
        ├── Membership found for this authUserId + org → set active_org_id cookie → /
        │
        └── No Membership yet → /pending-access
                │
                ▼
5. User types their name → POST /api/auth/claim
        │
        ├── Name matches one unclaimed Brother row → link it, create Membership
        └── Name is "Atomic Samurai" → provision a hidden ghost row (full access, no footprint)
                │
                ▼
6. authUserId written to the Brother row, Membership created
        → set active_org_id cookie → /
```

> **Note:** Link status is the DB's truth, resolved by `requireUser()` in the pages/layouts that need it — there is no `brother_linked` cookie. (A legacy `brother_linked` cookie was removed; signout/unlink only *expire* it to clean up sessions carried across that deploy.) The `[slug]` layout gates an authenticated-but-unlinked user into the claim flow.

**Admin workflow:** add a `Brother` row from the Brothers page **before** the person signs in. They claim it themselves on first login by entering their name exactly. Alternatively, share an invite link (**Settings → Invites**) — an `open`-mode link creates a member on redemption, a `claim`-mode link drops the user into the name-match claim flow above.

**Founder workflow:** a brand-new founder starts at `/create` (linked from `/login`). The pre-auth flow builds a full org blueprint *before* any sign-in; Google OAuth happens at the final Build step, the callback returns to `/create?resume=1`, and `POST /api/orgs` provisions the org and makes the founder its first admin member. See [Org Creation](#org-creation).

---

## Database Schema

Defined in [prisma/schema.prisma](prisma/schema.prisma). Highlights:

### Organization
The tenant root. Every domain row carries an `organizationId` FK here. `slug` is unique and used for org routing.

### Membership
Links a `Brother` to an `Organization`. `isOrgAdmin` grants all permission bits within that org. One `Brother` can have many `Membership` rows (multi-org).

### PlatformAdmin
A separate table (not a flag on `Brother`) for cross-org superusers. One row per platform staff member.

### Brother
| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| organizationId | Int | FK → Organization |
| name | String | |
| role | String | e.g. "President · Rush" |
| attendance | Float | 0–100, system-managed |
| duesOwed | Float | |
| gpa | Float | |
| serviceHours | Float | |
| authUserId | String? | Supabase user UUID, set on claim (unique) |
| avatarUrl | String? | Custom profile photo (source of truth) |
| email | String? | Cached from the session |
| isAdmin | Boolean | Legacy flag; prefer `Membership.isOrgAdmin` in new code |
| isGhost | Boolean | Hidden observer — excluded from all listings/counts |
| customFields | Json | Sparse `{ fieldId → value }` map for org-defined member fields |
| roles | BrotherRole[] | Many-to-many join to `Role` |
| memberships | Membership[] | Orgs this brother belongs to |
| metricValues | BrotherMetricValue[] | Per-member values for custom org metrics |

### Role / BrotherRole
`Role` is a named bundle of permission bits with a hierarchy `rank` and optional UI `color`. `permissions` is a 32-bit integer; meanings are defined in [lib/permissions.ts](lib/permissions.ts). `isSystem = true` protects seeded roles from rename/delete. `BrotherRole` is the join table — a member's effective permissions are the bitwise OR of every role they hold.

### OrgMetricDefinition / BrotherMetricValue
Org-defined custom KPIs. `OrgMetricDefinition` carries a `slug` (immutable after create), display `name`, optional `unit`, a per-member `goal`, `atRiskBelow` / optional `watchBelow` bands, and an `aggregation` (`avg` / `sum` / `count_on_track`) used to compute the dashboard headline. `BrotherMetricValue` holds one member's value for one definition (`organizationId` denormalized for tenant scoping). Status/headline math is pure and lives in [lib/metrics.ts](lib/metrics.ts). Custom **member fields** (lighter-weight, free-text/number/select) are not separate tables — definitions live on `OrganizationConfig.customMemberFields` (JSON) and values sparsely on `Brother.customFields` (JSON); see [lib/custom-member-fields.ts](lib/custom-member-fields.ts).

### OperationalEvent
Structured audit log. Every meaningful state change emitted by a service lands here (`action`, `subjectType`, `subjectId`, `actorId`, `orgId`, `metadata` JSON). Drives reactions via the event handler registry and dual-writes to `ActivityLog` for the UI feed.

### CalendarEvent / CalendarEventType
Chapter events: `title`, `date`, optional `time`, `category`, `mandatory`, `description` (doubles as meeting notes), `location`, plus `notesSummary` + `notesSummaryAt` for AI-generated summaries.

`CalendarEventType` is the per-org registry `CalendarEvent.category` points at — `slug` (immutable after create, unique per org), `label`, a `color` / `colorDark` hex pair for the light and dark timeline themes, an optional `workflowId` that gates picker visibility, and `builtin` / `creatable` / `hidden` / `mandatoryDefault` / `displayOrder`. Every org is seeded with the four built-ins from [lib/event-types.ts](lib/event-types.ts) — `chapter`, `party`, `deadline`, `service` — as editable copies; `party` and `deadline` are `creatable: false` because those rows are minted by their own features rather than the event form.

### Task / TaskAssignment
A `Task` is a unit of work handed to members and/or roles. A task *with* a `dueDate` is what the UI calls a deadline and folds into the timeline; without one it's a loose to-do. Stored `status` is only `open` / `done` — urgency (overdue / urgent / due soon / upcoming) is computed from `dueDate` at render time by [lib/tasks/urgency.ts](lib/tasks/urgency.ts), never persisted. `TaskAssignment` targets exactly one of `brotherId` / `roleId` (CHECK constraint); role targets resolve to current holders at read time, so adding someone to a role auto-assigns them its open tasks. Anyone assigned can flip the shared status to done; only `MANAGE_TASKS` can edit or reassign. Replaces the legacy `Deadline` model.

### Poll / PollOption / PollAssignment / PollVote
Task-shaped voting: a `Poll` attaches members and roles the same way a task does, plus a question with 2–10 `PollOption`s and an optional `closeDate`. Single-choice — `PollVote` is unique on `(pollId, brotherId)`, so re-voting upserts. Votes key to the poll rather than the assignment, so a vote survives its voter later being un-assigned. Closing locks voting but keeps results visible.

### DuesPayment / Reimbursement
Two request queues that gate the ledger. Both hold `amount`, `date`, a `status`, an optional `rejectionNote`, and a unique `transactionId` that is null until approval. Nothing moves on either book — not `Brother.duesOwed`, not `Transaction` — until a treasurer approves, at which point the service mints the ledger row and adjusts the balance atomically ([lib/services/dues-service.ts](lib/services/dues-service.ts), [lib/services/reimbursement-service.ts](lib/services/reimbursement-service.ts)). That `transactionId` is the only link between the two books, so a balance is blind to an approved payout until it exists.

### AttendanceExemption
Excuses a member from attendance math for a whole `Semester` (e.g. studying abroad, inactive status) rather than event-by-event. Unique on `(semesterId, brotherId)`.

### ProgrammingEvent / ProgrammingChecklistItem / ProgrammingEventDoc
The events/programming planner. A `ProgrammingEvent` starts life as an idea (`stage = "idea"`) holding its own planning fields, and is linked one-to-one to a `CalendarEvent` (`calendarEventId`) only once it leaves the idea stage. Carries prep/ops fields — `owner`, `collabOrg`, `roomStatus`, `flyerPosted`, `socialsMeeting`, `spendingCents` — plus post-event `successRating` and `wrapUpNotes`. `ProgrammingChecklistItem` rows are the ordered prep checklist; `ProgrammingEventDoc` links attached docs.

### ServiceParticipation
Per-member attendance for a `ServiceEvent` — who actually showed up, used to credit service hours.

### OrgInvite / InviteRedemption
Org invite links. `OrgInvite` carries a unique `token`, a `mode` (`open` mints a new member on redemption, `claim` routes into the name-match claim flow), and optional `expiresAt` / `revokedAt`. `InviteRedemption` records each use.

### AttendanceRecord / AttendanceExcuse
`AttendanceRecord` links a `Brother` to a `CalendarEvent` in a `Semester` with an `attended` flag. `AttendanceExcuse` records an approved/pending excuse; approved excuses don't count against attendance.

### Semester
`label` (unique per org, e.g. `SPR26`), `startDate`, `endDate`, `isActive` (one active at a time per org).

### Transaction / TransactionCalendarEvent
Treasury entries with `type` (`income`/`expense`), `category`, `amount`, `paymentMethod`. Soft-deleted via `deletedAt`. `TransactionCalendarEvent` is a many-to-many join attributing spend to the events it paid for.

### Budget / BudgetAllocation
Per-semester budget (`carryoverBalance`, `reserveAmount`) with line-item `allocations`.

### Doc / DocFolder
`Doc` is a pinned chapter link with cached OG metadata (`title`, favicon, `embedOk`) and an optional `folderId`. `DocFolder` is a flat, one-level folder for grouping docs on the `/docs` page. Deleting a folder releases its docs back to the library root (sets `folderId = null`) rather than cascading them away.

### PartyEvent / ServiceEvent / InstagramTask / ChapterAnnouncement / ActivityLog
See [prisma/schema.prisma](prisma/schema.prisma) for full field lists. All carry `organizationId`.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Runtime Postgres connection. Use the Supabase **pooled** URL (PgBouncer, port 6543). |
| `DIRECT_URL` | Recommended | A **direct** session connection (port 5432) used by Prisma CLI commands (`migrate`, `db seed`). Migrations hang over the pooled URL because PgBouncer doesn't support DDL/advisory locks. `prisma.config.ts` falls back to `DATABASE_URL` if unset. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Server-only. Enables admin reads of auth metadata. Never expose to the client. |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Optional | Bare apex for org subdomain routing (e.g. `example.com`); org slugs resolve as `<slug>.<root>`. Defaults to `localhost` ([lib/domains.ts](lib/domains.ts)). |
| `NEXT_PUBLIC_DOMAIN_ALIASES` | Optional | Comma-separated extra apexes that should also resolve org subdomains. |
| `NEXT_PUBLIC_APP_NAME` | Optional | Display name for the wordmark/footer. Defaults to `ChaptOS`. |
| `OPENAI_API_KEY` | Optional | Enables AI features (chat, digest narration, meeting summaries). All three degrade gracefully when unset. |
| `RLS_SET_ORG_ID` | Yes | Must be `1` in every env. Causes `db()` to issue `SET LOCAL app.org_id` on every scoped query, which Postgres RLS uses to enforce tenant isolation. |
| `SENTRY_DSN` | Optional | When set, `logError` forwards to Sentry via a lazy dynamic import. No dependency cost when unset. |

**Where to find these in Supabase:**
- `DATABASE_URL` / `DIRECT_URL`: Project Settings → Database → Connection string (pooled = port 6543, direct/session = port 5432).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: Project Settings → API.

> The runtime client connects through its own `pg.Pool` reading `DATABASE_URL` ([lib/prisma.ts](lib/prisma.ts)); the Prisma CLI uses the URL in `prisma.config.ts`. Never expose `DATABASE_URL` to the client.

---

## Local Setup

### Prerequisites
- Node.js 20+
- A Supabase project with Google OAuth enabled

### Steps

**1. Clone and install**
```bash
git clone <repo-url>
cd figurints
npm install        # postinstall runs `prisma generate`
```

**2. Configure environment**
```bash
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
```

**3. Enable Google OAuth in Supabase**
Authentication → Providers → Google → enable and add your Google OAuth credentials.
Add the redirect URL: `http://localhost:3000/auth/callback`

**4. Run migrations** (uses `DIRECT_URL`)
```bash
npx prisma migrate deploy
```

**5. Generate the Prisma client** (also runs on install/build)
```bash
npx prisma generate
```
Output goes to `app/generated/prisma/` (gitignored — generated locally and in CI).

**6. Enable profile photos (optional)**
Run the SQL in `supabase/` to create the `avatars` storage bucket and its RLS policies.

**7. Seed sample data (optional)**
```bash
npx prisma db seed
```

**8. Start the dev server**
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000), sign in with Google, then claim your member row on `/pending-access`.

**9. (Optional) Run the AI eval harness**
With `OPENAI_API_KEY` set and the DB seeded:
```bash
npx tsx scripts/eval-ask-the-chapter.ts
```
See [evals/ask-the-chapter/README.md](evals/ask-the-chapter/README.md) for the case schema and how to add new cases.

---

## Deployment

Built for **Vercel** with a Supabase backend.

1. **Import the repository** in Vercel.
2. **Add environment variables** (Project Settings → Environment Variables): `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RLS_SET_ORG_ID=1` (and `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `SENTRY_DSN` if used).
3. **Add the production redirect URL** in Supabase → Authentication → URL Configuration → Redirect URLs:
   ```
   https://your-app.vercel.app/auth/callback
   ```
4. **Deploy.** The `build` script runs `prisma generate && next build` on each push to `main`.

> **Migrations are not run by the build.** Apply schema changes with `npx prisma migrate deploy` against the production database (locally with prod `DIRECT_URL`, or via your CI/pipeline) — otherwise new columns won't exist and queries will error.

> **Connection pooling.** Use the pooled URL (port 6543) for `DATABASE_URL` so short-lived Vercel functions don't exhaust connections, and the direct URL (port 5432) for `DIRECT_URL` so migrations work.

### Post-deploy checklist
- [ ] All env vars set in Vercel
- [ ] Production redirect URL added in Supabase Auth
- [ ] `npx prisma migrate deploy` run against the production database
- [ ] `avatars` storage bucket + policies created (if using profile photos)
- [ ] At least one `Organization` row and one `Brother` row exist (or seed them) so the first user can claim
- [ ] (If using AI) `OPENAI_API_KEY` set; verify the chat widget appears
