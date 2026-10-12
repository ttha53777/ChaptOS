# ChaptOS

**The operating system for chapter-based organizations.** Fraternities and sororities, student clubs, club sports teams, service orgs, honor societies, performing-arts groups — anything that has a roster, officers, dues, meetings, and a calendar that never stops.

ChaptOS puts the whole operational surface in one place: the member roster, attendance with live check-in, dues and the treasury ledger, tasks and polls, meeting minutes edited together in real time, parties, programming, community service, Instagram planning, and a foldered docs library. An AI assistant, **Ask Chapt**, answers questions about the chapter and drafts changes for an officer to approve.

Every organization is a fully isolated tenant, enforced from the route handler down to Postgres row-level security. One Google account can belong to many orgs, with a separate roster identity in each.

---

## Contents

- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Tenancy and identity](#tenancy-and-identity)
- [Joining an org](#joining-an-org)
- [Creating an org](#creating-an-org)
- [Roles and permissions](#roles-and-permissions)
- [Ask Chapt and other AI features](#ask-chapt-and-other-ai-features)
- [Billing](#billing)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [Environment variables](#environment-variables)
- [Local setup](#local-setup)
- [Testing and verification](#testing-and-verification)
- [Deployment](#deployment)

---

## What it does

### Signed-in app (`/[slug]/…`)

| Page | What it covers |
|------|----------------|
| **Dashboard** | KPIs, roster health, a pinned announcement, a "Needs you" queue (join requests, excuses, reimbursements, events to wrap up), and the **Open check-in** band for live attendance. |
| **Timeline** | Every dated thing in one place: meetings, parties, service events, programming, and task deadlines. Event categories are per-org, so each org can rename, recolor, hide, or add its own. |
| **Chapter** | Chapter meetings and their minutes. Minutes are a **collaborative editor** (CodeMirror + Yjs) with live carets, @mentions, action items you can tick off, and AI summaries. **Agenda templates** pre-fill new meetings. |
| **Brotherhood** (roster) | Members, officer roles, GPA, dues owed, attendance, service hours, custom fields and metrics, archiving, and the join-request review band. Clicking a member opens their **Member Spotlight** card. |
| **Treasury** | The income/expense ledger with per-org categories, term-aware charts, budgets and allocations, dues payments and reimbursements that wait for approval, and CSV export. |
| **Tasks** | Tasks and polls assigned to members, roles, or **everyone**. "Everyone" can mean one shared task or one task per member. A task with a due date also shows up on the Timeline as a deadline. |
| **Programming** (events) | An event planner that moves ideas through a staged pipeline, with prep checklists, attached docs, custom event fields, and a post-event wrap-up. |
| **Parties** | Party events, revenue, and attendance. Party spending is tracked in the Treasury ledger. |
| **Service** | Community-service events, sign-ups, and participation. Service hours are recalculated automatically. |
| **Instagram** | A monthly content calendar and post planner. |
| **Docs** | Pinned links with fetched previews, one-level folders, drag-and-drop filing, and manual ordering. |
| **Settings** | Org profile, pages on/off, vocabulary, roles, invites, accounts, event types, money categories, thresholds, custom fields and metrics, calendar subscription. |
| **Billing** | Plan, headcount band, checkout, and the Stripe customer portal. |

Each org chooses which **workflows** (pages) it uses: `members` and `operations` are always on; `meetings`, `attendance`, `parties`, `service`, `events`, `finance`, `tasks`, `communications`, and `docs` can each be turned on or off ([lib/org-types.ts](lib/org-types.ts)). Vocabulary comes from the org type, so a sports team sees "Team" and "Players" where a fraternity sees "Chapter" and "Brothers".

The app has two looks: **paper**, the default (cream paper, brown ink, hard offset shadows, in per-page `app/paper-*.css`), and the original **ledger** look. Each has light and dark modes ([lib/aesthetic.ts](lib/aesthetic.ts), [lib/theme.ts](lib/theme.ts)). Both are stamped on `<html>` by a boot script before first paint, so the page never flashes the wrong theme.

### Public site

The marketing landing page (`/`), audience pages (`/for/[slug]`), `/pricing`, `/trust`, `/help`, `/contact`, and a Markdown **blog** at `/blog`, with posts in [content/blog/](content/blog/) and an RSS feed at `/blog/rss.xml`.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 7 |
| UI | React 19, Tailwind CSS 4, hand-written per-page CSS |
| Charts | Recharts 3 and hand-built SVG |
| Auth | Supabase Auth (Google OAuth) |
| Database | PostgreSQL on Supabase, with row-level security enforced |
| ORM | Prisma 7 with `@prisma/adapter-pg` over a `pg.Pool` |
| Realtime | Supabase Realtime (private Broadcast) + Yjs CRDTs for meeting notes |
| Storage | Supabase Storage (`avatars`, `org-logos`) |
| Billing | Stripe (one volume-tiered Price) |
| AI | OpenAI `gpt-5.2` (chat completions + tool calling) |
| Calendar | `ical-generator` for subscribable `.ics` feeds |
| Validation | Zod 4 |
| Observability | Structured JSON logs + optional Sentry |
| Tests | Vitest 4 against real Postgres; Playwright for browser checks |

> **Fast-moving majors.** Next 16, React 19, Prisma 7, Tailwind 4, and Zod 4 all differ from older versions. Read `node_modules/next/dist/docs/` before writing Next code. In Prisma 7, datasource URLs live in [prisma.config.ts](prisma.config.ts), not `schema.prisma`.

---

## Architecture

```
Browser
  │
  ├── proxy.ts — session refresh + public-path gate on every request
  ├── app/[slug]/layout.tsx — resolves the org, gates membership
  │     (NeedsInvite / AwaitingApproval / SemesterGate / the app shell)
  ├── app/api/** — thin JSON controllers
  │
  ├── lib/context      buildContext(): auth tiers, permission gate, rate limit, ctx.db
  ├── lib/validation   Zod schemas
  ├── lib/services     domain logic — one service per area
  ├── lib/events       emit() → handlers (recalcs, calendar feed, seat sync)
  ├── lib/db           db(orgId): org-scoped Prisma wrapper + SET LOCAL app.org_id
  │
  ├── Supabase — Auth, Storage, Realtime
  ├── Stripe — subscriptions + webhook
  ├── OpenAI — server-side only
  └── PostgreSQL — RLS org_isolation on every org-scoped table
```

**Conventions** (enforced by review and by the `scripts/` lints):

- **Route handlers are thin controllers.** Each one calls `buildContext()` from `@/lib/context`, parses input with a Zod schema from `@/lib/validation`, calls a service from `@/lib/services`, and maps errors with `toResponse()` from `@/lib/errors`. There are no `prisma.*` or `db()` calls in `app/api/**` except the auth bootstrap routes.
- **Side effects go through events.** Services call `emit(ctx, action, subject, metadata)`. Reactions are `on(action, handler)` registrations in [lib/events/handlers/](lib/events/handlers/) (attendance and service-hour recalcs, party → calendar sync, calendar-feed projection, billing seat sync). A service never calls another service. Every event is written as an `OperationalEvent` and to the `ActivityLog` feed.
- **Status fields are typed enums.** [lib/state/](lib/state/) exports unions and guards for every status column, and the database has CHECK constraints for the stable ones.
- **Pure modules stay pure.** Anything a client component imports ([lib/org-types.ts](lib/org-types.ts), [lib/checkin.ts](lib/checkin.ts), [lib/metrics.ts](lib/metrics.ts)…) must not reach `lib/db` or Prisma. DB-backed halves live in `*-db.ts` siblings.
- **One client data store.** `ChapterContext` loads the org's data once and shares it across the app. Pages update it optimistically instead of refetching.
- **Vocabulary.** Database models keep their historical names (`Brother`, `Organization`, `Semester`). New code may use the platform-neutral aliases in [lib/canonical.ts](lib/canonical.ts) (`Member`, `Org`, `Period`).

---

## Tenancy and identity

Every org is a fully isolated tenant. Isolation is enforced in several layers:

1. **Org resolution.** The org comes from the `/[slug]` segment (or a `<slug>.<root-domain>` subdomain). The `active_org_id` cookie only picks a default for `/`.
2. **`buildContext()`** builds the `RequestContext`: the caller, their auth tier, effective permission bits, `ctx.orgId`, and an org-scoped `ctx.db`.
3. **`ctx.db`** ([lib/db/tenant.ts](lib/db/tenant.ts)) adds `organizationId` to every read and write. `findUnique` becomes `findFirst` with an org filter. Updates and deletes check that the row belongs to the org before changing it.
4. **Postgres RLS.** Every org-scoped table has only the `org_isolation` policy (`organizationId = current_setting('app.org_id')`). `db()` runs `SET LOCAL app.org_id` on each scoped query, which requires `RLS_SET_ORG_ID=1`. Bootstrap paths (join approval, `provisionOrg`, operator scripts) use `prismaPrivileged`, a BYPASSRLS role connected through `DIRECT_URL`. Production refuses to boot if that connection isn't configured.

Tests in [tests/tenancy/](tests/tenancy/) check this. A failure there blocks everything else.

### `Brother` is the person; `Membership` is the roster row

One Google account maps to one `Brother` (`authUserId` is globally unique). That person has one `Membership` row in each org they belong to. Everything an org records about a member lives on the `Membership`: `name`, `role`, `gpa`, `duesOwed`, `attendance`, `serviceHours`, `archivedAt`, `customFields`, and `isOrgAdmin`. `Brother` holds only the identity: canonical name, email, avatar, and auth link.

So the same person can be *Rob*, the Treasurer who owes $120, in one chapter, and *Robert Chen*, a plain member who owes nothing, in another. Neither chapter can see or change the other's row.

- Read and write the roster through **`ctx.db.member`**, which is backed by `Membership`, scoped to the org, and keyed by `brotherId`. There is deliberately no `ctx.db.brother`.
- The few legitimate cross-org identity writes go through **`ctx.db.identity`** (`setEmail`, `setAvatarUrl`, `unlinkAuth`, `setPlatformAdminFlag`). It has no general `update()`.
- Inside `$transaction`, roster writes must use `ctx.db.member.onTx(tx)`. A hand-written `updateMany({ where: { brotherId } })` would change that person's row in *every* org.
- Removing someone from one org is not `DELETE FROM Brother`. `deleteBrother` checks whether they belong to other orgs and, if they do, deletes only this org's rows.
- `Brother.organizationId` is only a hint for which org the account was created in. Nothing roster-related may filter by it (`npm run lint:home-org` checks this).

---

## Joining an org

**An invite link lets you ask to join; it doesn't let you in. Every new member is approved.**

1. An officer creates an invite link in **Settings → Invites**. A link can have a label, a use limit, and an expiry date, and can be revoked.
2. Opening `/join/<token>` (after Google sign-in) creates a **`JoinRequest`**. Nothing else is created yet: no `Brother`, no `Membership`, nothing an org-scoped query would return.
3. Officers with `MANAGE_BROTHERS` see pending requests in a band at the top of the roster page, with a count badge in the sidebar's "Needs you" section.
4. **Approval** is one transaction. It reuses the person's existing `Brother` if that Google account is already in another org, or creates one if not. It then creates the `Membership`, an optional starting `BrotherRole`, and the `InviteRedemption`. The **seat check happens here**, so an org on a capped plan can still collect requests and choose whom to make room for.
5. `JoinRequest` is unique per `(organizationId, authUserId)`. A rejected request stays, so reopening the same link is refused. A *different* link from an officer resets it to pending.

A signed-in person who isn't a member sees `NeedsInvite` on `/[slug]`. Someone with a pending request sees `AwaitingApproval`.

Officers can't type someone onto the roster by hand, and the old name-matching "claim your row" flow has been removed.

---

## Creating an org

Founders start at **`/create`**, a pre-auth flow styled as a paper "charter" ([app/create/](app/create/)). Google sign-in comes **last**.

| Step | What happens |
|------|--------------|
| **Name** | Org name, live URL preview, optional crest/logo. |
| **Interview** | Scripted questions with optional AI interpretation of free-text answers: org type → variant → which pages they need → how their terms work → the current term → what they track per member → the founder's name and title. |
| **Roles** | Officer seats with editable titles, ability toggles grouped by workflow, and an Advanced view of individual `MANAGE_*` flags. |
| **Timeline** | Event categories, edited against a live sample month. Built-in categories can be renamed and recolored but not removed. |
| **Charter** | A full review: URL with a live availability check, pages, vocabulary, the first term's dates, tracked metrics, and leadership seats. |
| **Sign in** | Google OAuth, then `POST /api/orgs` provisions the org. |

- **The draft survives OAuth.** Answers are saved in `localStorage` ([lib/onboarding/draft.ts](lib/onboarding/draft.ts)), and the callback returns to `/create?resume=1`. When the draft comes back it is treated as untrusted: `parseDraft()` validates it with Zod and discards it after 7 days. [lib/onboarding/answers.ts](lib/onboarding/answers.ts) rebuilds the page list from all the answers.
- **Works without OpenAI.** Tapping a chip is deterministic. Free text goes to the IP-rate-limited `/api/ai/interview`, and if that fails the flow falls back to keyword matching.
- **Provisioning is atomic.** `provisionOrg` ([lib/services/org-service.ts](lib/services/org-service.ts)) creates the org, config, roles, founder membership, the first **active** `Semester`, `CalendarEventType`s, `TransactionCategory`s, and metric definitions in a single transaction. Org-type presets fill any gaps. The founder role always gets full permissions, so a founder can't lock themselves out. Each account can create at most 3 orgs per day by default (`ORG_CREATE_LIMIT_PER_DAY`).
- The founder lands on **`/[slug]/onboarding`**, a welcome page inside the real app. It shows what's already set up and the next step: inviting members with a join link.

---

## Roles and permissions

### Auth tiers

| Tier | Scope |
|------|-------|
| **Platform admin** | Row in `PlatformAdmin`. Has every permission in every org, plus `/admin/orgs` (cross-org management, billing health, leads, performance). |
| **Org admin** | `Membership.isOrgAdmin`. Has every permission, but only in that org. |
| **Member** | The bitwise OR of the permission bits of every role they hold. |

### Permission bits ([lib/permissions.ts](lib/permissions.ts))

```
MANAGE_BROTHERS   MANAGE_TREASURY     MANAGE_EVENTS     MANAGE_PARTIES   MANAGE_INSTAGRAM
MANAGE_SERVICE    MANAGE_ATTENDANCE   MANAGE_SEMESTERS  MANAGE_ROLES     MANAGE_DOCS
MANAGE_ANNOUNCEMENTS  MANAGE_SETTINGS  MANAGE_TASKS     MANAGE_POLLS
```

- Each `Role` stores a 32-bit permission bitfield, a `rank`, and an optional color. The UI and the API both check permissions with the same `hasPermission(bits, "MANAGE_X")` helper.
- **Rank guard:** you can only grant, edit, or revoke roles ranked *strictly below* your own highest role.
- System roles (like President) can't be renamed or deleted.
- `MANAGE_TASKS` and `MANAGE_POLLS` control *creating and editing*. Anyone assigned a task can complete it, and anyone assigned a poll can vote.
- The role templates for each org type live in [lib/org-types.ts](lib/org-types.ts).

---

## Ask Chapt and other AI features

All AI runs server-side and turns off cleanly when `OPENAI_API_KEY` is unset.

### Ask Chapt (`⌘K` / `Ctrl-K`)
[app/api/ai/chat/route.ts](app/api/ai/chat/route.ts) · [app/components/ChatWidget.tsx](app/components/ChatWidget.tsx) · [app/components/chat/](app/components/chat/) · [lib/ai-tools.ts](lib/ai-tools.ts)

A spotlight that answers questions like *"who hasn't paid dues?"* or *"what did we spend on Party Supplies?"* by calling tools instead of guessing.

- **Tools.** About 26 read tools (roster, attendance, treasury, budget, tasks, polls, meeting notes, docs, service, programming, join requests…), 11 `propose_*` write tools, and a final `compose_answer` tool. The schemas and the dispatcher are in one file, so they can't drift apart. `validateArgs` checks arguments against the schema before running a tool, so the model can correct a bad enum on the next turn.
- **Fast path.** Common questions with one obvious query ([lib/ai-fastpath.ts](lib/ai-fastpath.ts)) skip the model and run the same read handler directly, answering in under 100ms. If anything is uncertain, it falls back to the full tool-calling loop.
- **Live reasoning ledger.** Steps stream over SSE as pending → active → done ([lib/ai-ledger.ts](lib/ai-ledger.ts)) and collapse into a trace you can audit. Tool calls in the same turn run in parallel.
- **Structured answers.** The answer has a verdict, tappable rows, sources, follow-up suggestions, and optional follow-up questions. Rows open a record **peek** sheet. The server matches rows to records from the tool results that actually ran ([lib/ai-refs.ts](lib/ai-refs.ts)); the model never supplies them.
- **Advisory answers.** For how-to and recommendation questions, the answer links to a screen from a fixed list, never a raw URL.
- **Writes need approval.** `propose_*` tools validate their input but never write. Each proposal is checked against the caller's permissions and HMAC-signed ([lib/ai-approval-sig.ts](lib/ai-approval-sig.ts)). The user sees an Approve/Discard card. If they lack the permission, the card is blocked and names who has it. Approving sends the request to the normal API route and records a `ChatApproval` in an Approvals inbox.
- Scoped to the active org. The prompt includes today's date, week boundaries, the active term, and the last meeting date.

### Other AI surfaces

| Endpoint | Purpose |
|----------|---------|
| `/api/ai/interview` (pre-auth) | Turns `/create` free-text answers into structured choices plus specific follow-up questions. Every ID it returns is checked against the real registries. |
| `/api/ai/summarize-meeting` | Turns minutes into decisions and **action items** (stored as structured JSON on the `CalendarEvent`). A response for an older notes revision can't overwrite a newer summary. |
| `/api/ai/digest` | A one-sentence weekly recap, cached by content hash. |
| `/api/ai/event-idea`, `/api/ai/recommend-setup` | Help drafting programming ideas and setup suggestions. |
| `/api/ai/feedback` | Thumbs up/down on assistant answers. |

### Eval harness
[evals/ask-the-chapter/](evals/ask-the-chapter/) · `npm run eval:chat`

Hand-written cases run through the same tool loop as production, in-process against the seeded database. Each case is graded on which tools were called, their arguments, and text the answer must or must not contain. The harness measures prompt and model changes instead of relying on spot checks. If a case fails, re-check its expected values against the live seed before calling it a regression.

---

## Billing

What an org pays ChaptOS. This is separate from in-app dues, which is the chapter's own bookkeeping and never touches a payment processor.

| Active members | Plan | Price |
|----------------|------|-------|
| 1–4 | Free | $0 |
| 5–50 | Standard | $25/mo |
| 51–120 | Pro | $65/mo |
| 121+ | Custom | Quote (sales lead) |

- The bands are defined once in [lib/billing/tiers.ts](lib/billing/tiers.ts). `npm run stripe:setup` uses them to create **one** volume-tiered Stripe Price, so moving between bands just changes the subscription quantity. There's no plan switching.
- Archived members don't count as seats ([lib/billing/seats.ts](lib/billing/seats.ts)). The seat check runs when a join request is approved.
- The local `Subscription` row is a cache. Webhooks (`/api/billing/webhook`, deduplicated through `StripeEvent`) keep it current, and `/api/billing/sync` can pull fresh state from Stripe in case a webhook is lost.
- Without Stripe keys, every org stays on Free, paid options are hidden, and the webhook returns 503.

---

## Project structure

```
├── app/
│   ├── [slug]/                  # the signed-in app, one folder per page
│   │   ├── layout.tsx           # org resolution + membership gate
│   │   ├── NeedsInvite.tsx · AwaitingApproval.tsx · ActiveOrgSync.tsx
│   │   ├── page.tsx             # Dashboard
│   │   ├── onboarding/          # founder welcome frame
│   │   ├── brothers/ chapter/ chapter/templates/ docs/ events/ instagram/
│   │   └── parties/ service/ settings/ tasks/ timeline/ treasury/ billing/
│   ├── create/                  # pre-auth charter flow
│   ├── join/[token]/            # invite → join request
│   ├── admin/orgs/              # platform-admin console
│   ├── api/                     # thin controllers (see below)
│   ├── blog/ for/ help/ pricing/ trust/ contact/   # public site
│   ├── login/ welcome/ auth/callback/
│   ├── components/
│   │   ├── ChatWidget.tsx · chat/        # Ask Chapt
│   │   ├── meeting-notes/                # collaborative minutes editor
│   │   ├── agenda-templates/ timeline/ treasury/ programming/ members/
│   │   ├── dashboard/                    # widgets, forms, primitives, join-request panel
│   │   ├── Sidebar.tsx · OrgSwitcher.tsx · SemesterGate.tsx · LiveCheckInBar.tsx
│   │   ├── paper/                        # paper-aesthetic primitives
│   │   └── landing/
│   ├── context/                 # ChapterContext, LiveCheckInContext
│   ├── hooks/
│   ├── paper-*.css              # per-page paper aesthetic
│   └── generated/prisma/        # generated client (gitignored)
├── lib/
│   ├── context/                 # buildContext()
│   ├── db/                      # db(orgId) tenant wrapper, runtime URLs, admission lock
│   ├── services/                # one service per domain
│   ├── events/                  # emit(), on(), actions, handlers/
│   ├── state/                   # status enums + guards
│   ├── validation/              # Zod schemas
│   ├── errors/                  # toResponse()
│   ├── auth/                    # require-user/permission/admin, join flow, dev bypass
│   ├── billing/                 # tiers, seats, sync, webhook, guard
│   ├── calendar-feed/           # .ics projection, credentials, worker
│   ├── collaboration/           # Yjs notes protocol + persistence
│   ├── onboarding/              # /create draft model
│   ├── ai*.ts                   # client, prompt, tools, ledger, refs, fast path, approval signing
│   ├── org-types.ts             # org-type presets, workflows, role templates
│   ├── permissions.ts           # 14 permission bits
│   └── prisma.ts · prisma-privileged.ts · observability.ts · rate-limit.ts
├── prisma/                      # schema.prisma, migrations/, seed.ts
├── supabase/                    # storage bucket + Realtime policy SQL
├── content/blog/                # Markdown blog posts
├── evals/ask-the-chapter/       # AI eval cases
├── tests/                       # Vitest suites (tenancy, services, permissions, …)
├── scripts/                     # lints, eval, stripe setup, calendar feeds, screenshots, diagnostics
├── docs/                        # design plans and rollout notes
├── proxy.ts                     # Next.js middleware
├── instrumentation.ts           # boot hook (Sentry init)
└── prisma.config.ts
```

**API areas** under `app/api/`: `activity`, `admin`, `ai`, `announcement`, `attendance` (incl. live check-in windows), `auth`, `billing`, `brothers`, `budget`, `calendar` (events, event types, agenda templates, notes, action items, `.ics` export, subscription feeds), `docs`, `dues`, `events` (custom fields), `excuses`, `exemptions`, `instagram`, `invites`, `join-requests`, `metrics`, `orgs`, `parties`, `polls`, `programming`, `reimbursements`, `roles`, `semesters`, `service-events`, `service-participation`, `tasks`, `transactions`, `treasury` (balance, settings, categories).

`_design/` holds standalone HTML design mocks and `assets/` holds marketing captures. Neither is part of the app build.

---

## Data model

Full schema: [prisma/schema.prisma](prisma/schema.prisma) (~50 models). Every org-scoped row has an `organizationId`.

| Area | Models |
|------|--------|
| Tenancy & identity | `Organization`, `OrganizationConfig` (workflows, vocab, thresholds, custom fields, nav order), `Brother` (identity), `Membership` (roster row), `PlatformAdmin` |
| Joining | `OrgInvite`, `JoinRequest`, `InviteRedemption` |
| Roles | `Role`, `BrotherRole` |
| Terms & attendance | `Semester`, `AttendanceRecord`, `AttendanceExcuse`, `AttendanceExemption` |
| Calendar & meetings | `CalendarEvent` (incl. check-in window, collaborative notes state, summary data), `CalendarEventType`, `AgendaTemplate`, `EventFieldDefinition` |
| Tasks & polls | `Task`, `TaskAssignment`, `TaskCompletion`, `Poll`, `PollOption`, `PollAssignment`, `PollVote` |
| Money | `Transaction` (soft delete), `TransactionCategory`, `TransactionCalendarEvent`, `DuesPayment`, `Reimbursement`, `Budget`, `BudgetAllocation` |
| Programming, parties, service | `ProgrammingEvent`, `ProgrammingEventDoc`, `PartyEvent`, `ServiceEvent`, `ServiceParticipation` |
| Content | `Doc`, `DocFolder`, `InstagramTask`, `ChapterAnnouncement` |
| Metrics | `OrgMetricDefinition`, `BrotherMetricValue` |
| Audit & AI | `OperationalEvent`, `ActivityLog`, `ChatApproval` |
| Billing | `Subscription`, `StripeEvent`, `OrphanedSubscription`, `SalesLead` |
| Calendar feeds | `CalendarSubscription`, `CalendarFeedItem`, `CalendarFeedWork` |

Some rules that hold across the schema:

- **Money moves only on approval.** `DuesPayment` and `Reimbursement` are requests. A member's balance and the ledger change only when a treasurer approves, and then both change in one transaction, linked by `transactionId`.
- **Category slugs don't change.** For event types and transaction categories, the `slug` is the value stored on existing rows and can't be edited. The label can be renamed freely.
- **Task urgency is calculated, not stored.** `Task.status` is only `open` or `done`. Urgency is computed from `dueDate` when the page renders ([lib/tasks/urgency.ts](lib/tasks/urgency.ts)). Role targets resolve to whoever holds the role *now*.
- **Cached roster numbers are recalculated by event handlers.** Attendance % and service hours on `Membership` are never written directly.

### Migrations

107 migrations live in [prisma/migrations/](prisma/migrations/). New tables need:

- an `org_isolation` RLS policy (and nothing permissive);
- `GRANT USAGE` on their `_id_seq` to the app role, or inserts fail with "permission denied for sequence".

Restart `next dev` after adding a column. A Prisma client already loaded in memory will reject the new field.

---

## Environment variables

```bash
cp .env.example .env.local
```

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Runtime Postgres, using the Supabase **transaction pooler** (port 6543). |
| `DIRECT_URL` | Direct/session connection (port 5432). Used by the Prisma CLI and by the privileged (BYPASSRLS) runtime client. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project URL and anon key. |
| `RLS_SET_ORG_ID` | Must be `1` in every environment. |

### Optional

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin reads of auth metadata. |
| `NEXT_PUBLIC_ROOT_DOMAIN` / `NEXT_PUBLIC_DOMAIN_ALIASES` | Apex domain(s) for `<slug>.<domain>` routing ([lib/domains.ts](lib/domains.ts)). Defaults to `localhost`. |
| `NEXT_PUBLIC_APP_NAME` | Wordmark text. Defaults to `ChaptOS`. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Support contact shown in the app. |
| `OPENAI_API_KEY` | Turns on every AI feature. |
| `PROPOSAL_SIGNING_SECRET` | Dedicated HMAC key for Ask Chapt proposals. Derived from the OpenAI key if unset. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` | Platform billing. The price ID is printed by `npm run stripe:setup`. |
| `SENTRY_DSN` | Forwards errors to Sentry. Recommended in production: Stripe failures are logged and swallowed on purpose, so without it nobody gets alerted. |
| `ORG_CREATE_LIMIT_PER_DAY` | Cap on new orgs per account per day. |
| `COLLABORATIVE_NOTES_ORG_IDS` | `*` or a comma-separated list of org IDs that can use collaborative minutes. Unset turns the feature off. |
| `COLLABORATIVE_NOTES_REALTIME` | `1` turns on live Broadcast. Without it, notes merge over HTTP every 30 seconds. See [docs/collaborative-meeting-notes-rollout.md](docs/collaborative-meeting-notes-rollout.md). |
| `CALENDAR_FEED_KEY`, `CALENDAR_FEED_ORIGIN`, `CALENDAR_FEED_ORGS`, `CALENDAR_FEED_WORKER_ENABLED`, `CALENDAR_FEED_PATH_REDACTION_VERIFIED` | Subscribable `.ics` feeds. Off by default. See [docs/calendar-subscriptions-rollout.md](docs/calendar-subscriptions-rollout.md) before turning them on. |
| `PERF_INSTRUMENT` | Per-query timing logs. Set it in `.env.local`, not on the command line. |
| `DEV_AUTH_BYPASS` / `DEV_AUTH_BYPASS_SECRET` | **Local only.** Lets `npm run screenshot` act as a member. Ignored when `NODE_ENV=production`. |

Never expose `DATABASE_URL`, `DIRECT_URL`, or any secret key to the client.

---

## Local setup

**Prerequisites:** Node 20+, a Supabase project with Google OAuth enabled, and Docker (for tests).

```bash
git clone https://github.com/ttha53777/ChaptOS.git
cd ChaptOS
npm install                    # also runs prisma generate
cp .env.example .env.local     # fill in Supabase + DB URLs, RLS_SET_ORG_ID=1
```

1. **Google OAuth.** In Supabase, go to Authentication → Providers → Google, enable it, and add `http://localhost:3000/auth/callback` as a redirect URL.
2. **Migrations.** Run `npx prisma migrate deploy`. It uses `DIRECT_URL`; migrations hang over the pooler.
3. **Storage and Realtime (optional).** Run the SQL in [supabase/](supabase/): `storage-avatars.sql`, `storage-org-logos.sql`, and `realtime-meeting-notes.sql`.
4. **Seed (optional).** Run `npx prisma db seed`. The seed refuses to run twice; use `FORCE_RESEED=1` to override.
5. **Run.** `npm run dev`, then open [http://localhost:3000](http://localhost:3000). Create an org at `/create`, or open an invite link to request to join an existing one.
6. **Billing (optional).** Run `npm run stripe:setup`, then `stripe listen --forward-to localhost:3000/api/billing/webhook`.

---

## Testing and verification

There is no ESLint and no separate typecheck script. These are the checks:

```bash
npx tsc --noEmit               # types
npm run lint:prisma            # no direct prisma in app/api
npm run lint:services          # no raw prisma in services
npm run lint:modules           # module-boundary rules
npm run lint:home-org          # nothing scopes the roster by Brother.organizationId

npm run test:db:up             # Postgres for tests on :54330 (Docker)
npm test                       # Vitest, ~110 suites
npm run test:db:down

npm run eval:chat              # Ask Chapt evals (needs OPENAI_API_KEY + seeded DB)
```

- Tests run against a real Postgres database, not mocks. `resetDb()` truncates the tables between tests. See [tests/README.md](tests/README.md).
- `npm run screenshot` renders signed-in `/[slug]/*` pages headlessly using the dev bypass cookie. There are also browser checks for invites, billing, collaborative notes, and calendar subscriptions (`npm run test:*:browser`).
- `npx tsc` doesn't catch Prisma `select` keys that no longer exist. An "Unknown field" error means the generated client is ahead of the code; "column does not exist" means the database is behind the migrations.

---

## Deployment

The app is built for **Vercel** with a Supabase backend.

1. Import the repo into Vercel and set the environment variables (at minimum `DATABASE_URL`, `DIRECT_URL`, the Supabase public pair, and `RLS_SET_ORG_ID=1`, plus whichever optional features you use).
2. In Supabase → Authentication → URL Configuration, add `https://<your-domain>/auth/callback`.
3. If you use billing, point a Stripe webhook at `https://<your-domain>/api/billing/webhook`.
4. Push to `main`. The build runs `prisma generate && next build`.

> **The build doesn't run migrations.** Apply them yourself with `npx prisma migrate deploy` (or one reviewed migration at a time) against the production `DIRECT_URL` **before** deploying code that needs them.

### Checklist

- [ ] Env vars set; `RLS_SET_ORG_ID=1`; `DIRECT_URL` reachable (prod won't boot without the privileged client)
- [ ] Migrations applied
- [ ] OAuth redirect URL added
- [ ] Storage buckets and Realtime policies installed (if used)
- [ ] Stripe webhook + `STRIPE_PRICE_ID` (if billing)
- [ ] `SENTRY_DSN` set
- [ ] Calendar feed log redaction verified before setting `CALENDAR_FEED_PATH_REDACTION_VERIFIED`
