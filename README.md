# ChaptOS

Chapter operations dashboard for Lambda Phi Epsilon. One place to track brothers, attendance, dues, GPA, service hours, deadlines, the treasury and budget, party events, Instagram content, and chapter meeting notes — with a live activity log and a weekly digest of what's on deck.

Built as a single operations dashboard ("Operations Dashboard") with a dedicated, app-like mobile layout.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Roles & Access](#roles--access)
- [Project Structure](#project-structure)
- [Auth Flow](#auth-flow)
- [Database Schema](#database-schema)
- [Environment Variables](#environment-variables)
- [Local Setup](#local-setup)
- [Deployment](#deployment)

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

> **Note:** This project pins recent, fast-moving versions (Next 16, React 19, Prisma 7, Tailwind 4). APIs and conventions may differ from older majors — check `node_modules/next/dist/docs/` and the Prisma 7 docs before assuming older patterns apply. In Prisma 7, datasource connection URLs live in `prisma.config.ts`, **not** in `schema.prisma`.

---

## Architecture

```
Browser
  │
  ├── Next.js App Router (app/)
  │     ├── proxy.ts (middleware) — auth gate on every request
  │     ├── app/layout.tsx — ChapterProvider wraps the whole app
  │     ├── app/page.tsx — the Operations Dashboard (desktop + mobile)
  │     └── app/api/** — JSON API routes (all mutations server-side)
  │
  ├── Supabase Auth — Google OAuth, cookie-based sessions
  ├── Supabase Storage — custom profile photos (avatars bucket)
  │
  └── PostgreSQL (Supabase) — Prisma ORM over a pg.Pool
```

**Key design decisions:**

- **Two-layer identity.** Supabase manages OAuth sessions; a separate `Brother` table holds chapter data. A signed-in user has no access until their Google account is linked to a `Brother` row (see [Auth Flow](#auth-flow)).
- **Global state via `ChapterContext`.** All chapter data (brothers, deadlines, IG tasks, parties, transactions, treasury, activity) is fetched once on mount in `ChapterProvider` and shared app-wide. Pages do optimistic updates against context instead of refetching.
- **All DB access through API routes.** Client components never touch Prisma. Every mutation goes through an API route that calls `requireUser()` (and `requireAdmin()` where appropriate) to verify the session before touching the database.
- **Persistent avatars.** Custom profile photos are stored in Supabase Storage and the URL is persisted on `Brother.avatarUrl`. That column — not the volatile Supabase auth metadata — is the source of truth, so a photo survives OAuth token refreshes that would otherwise revert it to the Google picture.
- **Soft deletes on transactions.** `Transaction` rows are never hard-deleted — they get a `deletedAt` timestamp so financial history is preserved.
- **CSS-only responsiveness.** The desktop and mobile dashboards are sibling trees toggled purely with Tailwind breakpoints (`md:hidden` / `hidden md:block`) — no JS viewport detection. The mobile dashboard is a tabbed layout: **Overview · Tasks · Money · Logs**.

---

## Roles & Access

| Role | How it's set | What it can do |
|------|--------------|----------------|
| **Brother** | Default for any linked `Brother` row | Full read access; self-service actions (log excuse, add deadline/IG task/event, +service hour, edit own profile) |
| **Admin** | `Brother.isAdmin = true` | Everything a brother can, plus admin-only actions: log expenses/revenue, record attendance, manage other accounts, pay dues |
| **Ghost** | `Brother.isGhost = true` | Full brother-level read access, but **hidden** from every brother listing, count, and attendance enrollment — an observer (e.g. an alumnus) with no footprint. Provisioned via the "Atomic Samurai" claim name; never granted admin. |

`requireUser()` ([lib/auth/require-user.ts](lib/auth/require-user.ts)) gates every API route; `requireAdmin()` gates the admin-only ones.

---

## Project Structure

```
figurints/
├── app/
│   ├── api/                      # JSON API routes (all server-side)
│   │   ├── activity/             # activity log (+ /full)
│   │   ├── attendance/           # record attendance per event
│   │   ├── auth/                 # claim, me, signout, avatar, accounts, unlink-self
│   │   ├── brothers/             # roster CRUD (+ /[id]/attendance)
│   │   ├── budget/               # semester budget + allocations
│   │   ├── calendar/             # chapter events
│   │   ├── deadlines/
│   │   ├── excuses/              # attendance excuses
│   │   ├── instagram/            # content calendar
│   │   ├── parties/              # party events + revenue
│   │   ├── semesters/
│   │   ├── service-events/       # community service log
│   │   ├── transactions/         # treasury entries (+ /export CSV)
│   │   └── treasury/             # balance/trend rollup
│   ├── auth/callback/            # OAuth redirect handler
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── UserAvatar.tsx        # photo upload/remove menu
│   │   ├── BrotherAvatar.tsx     # avatar with initials fallback
│   │   └── dashboard/
│   │       ├── widgets.tsx       # KPI cards, health, activity feed, charts
│   │       ├── DashboardCharts.tsx
│   │       ├── drawers/          # BrotherDrawer, etc.
│   │       ├── primitives.tsx    # Card, Modal, StatusBadge, ConfirmDialog
│   │       ├── styles.ts
│   │       └── mobile/           # MobileDashboard + Overview/Tasks/Money/Logs tabs
│   ├── context/ChapterContext.tsx
│   ├── hooks/                    # useCurrentUser, useOrgLogo
│   ├── generated/prisma/         # generated client (gitignored)
│   ├── brothers/  chapter/  instagram/  login/  parties/
│   ├── pending-access/           # account-claim page (new users)
│   ├── settings/  timeline/  treasury/
│   ├── data.ts                   # shared types, thresholds, formatters (fmt$, fmtDate, fmtRange…)
│   ├── globals.css
│   └── layout.tsx
├── lib/
│   ├── auth/
│   │   ├── require-user.ts        # API auth guard
│   │   └── require-admin.ts       # admin-only guard
│   ├── supabase/                  # client.ts, server.ts, admin.ts
│   ├── avatar.ts  brother-avatar.ts
│   ├── attendance.ts              # attendance recalculation
│   ├── activity.ts  rate-limit.ts
│   └── prisma.ts                  # Prisma singleton over pg.Pool
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── supabase/                      # storage bucket / RLS SQL
├── proxy.ts                       # Next.js middleware (auth gate)
├── prisma.config.ts               # Prisma 7 config (datasource URL for CLI)
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
        ├── No session ──────────────────────────────► /login
        │
        └── Session but no brother_linked cookie ─────► /pending-access
                │
                ▼
3. /login — "Continue with Google" → Supabase OAuth
        │
        ▼
4. /auth/callback — exchanges code for a session, checks the Brother table
        │
        ├── Brother row with this authUserId exists
        │       → set brother_linked cookie → /
        │
        └── No Brother row yet → /pending-access
                │
                ▼
5. User types their name → POST /api/auth/claim
        │
        ├── Name matches one unclaimed Brother row → link it
        └── Name is "Atomic Samurai" → provision a hidden ghost row (full access, no footprint)
                │
                ▼
6. authUserId written to the Brother row
        → set brother_linked cookie → /
```

**Admin workflow:** add a `Brother` row from the Brothers page **before** the person signs in. They claim it themselves on first login by entering their name exactly.

---

## Database Schema

Defined in [prisma/schema.prisma](prisma/schema.prisma). Highlights:

### Brother
| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| name | String | |
| role | String | e.g. "President · Rush" |
| attendance | Float | 0–100, system-managed |
| duesOwed | Float | |
| gpa | Float | |
| serviceHours | Float | |
| authUserId | String? | Supabase user UUID, set on claim (unique) |
| avatarUrl | String? | Custom profile photo (source of truth) |
| email | String? | Cached from the session |
| isAdmin | Boolean | Admin privileges |
| isGhost | Boolean | Hidden observer — excluded from all listings/counts |

### CalendarEvent
Chapter events: `title`, `date` (YYYY-MM-DD), optional `time`, `category`, `mandatory` (counts toward attendance), `description` (doubles as meeting notes), `location`.

### AttendanceRecord / AttendanceExcuse
`AttendanceRecord` links a `Brother` to a `CalendarEvent` in a `Semester` with an `attended` flag. `AttendanceExcuse` records an approved/pending excuse for a missed mandatory event (`isRetroactive`, `status`); approved excuses don't count against attendance.

### Semester
`label` (unique, e.g. `SPR26`), `startDate`, `endDate`, `isActive` (one active at a time).

### Transaction
Treasury entries with `type` (`income`/`expense`), `category`, `amount`, `paymentMethod`. Soft-deleted via `deletedAt`.

### Budget / BudgetAllocation
Per-semester budget (`carryoverBalance`, `reserveAmount`) with line-item `allocations`.

### PartyEvent
Door revenue, expenses, attendance count, theme/collab, and wrap-up status per party.

### ServiceEvent
Community-service log; optionally tied to a `CalendarEvent`.

### InstagramTask
Content calendar items with `status` (Urgent / Due Soon / Upcoming / Complete) and `type` (Feed Post, Reel, Story, Carousel, …).

### Deadline
Chapter deadlines with `owner` (assigned brother) and `status`.

### ActivityLog
Audit/feed entries (`message`, `type`, `timestamp`, optional `actorId` → Brother, `SetNull` on delete).

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Runtime Postgres connection. Use the Supabase **pooled** URL (PgBouncer, port 6543) — short-lived serverless functions need pooling. |
| `DIRECT_URL` | Recommended | A **direct** session connection (port 5432) used by Prisma CLI commands (`migrate`, `db seed`). Migrations hang over the pooled URL because PgBouncer doesn't support DDL/advisory locks. `prisma.config.ts` falls back to `DATABASE_URL` if unset. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Server-only. Enables admin reads of auth metadata (e.g. backfilling avatars). Never expose to the client. |

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
Run the SQL in `supabase/` to create the `avatars` storage bucket and its RLS policies. Without it, sign-in still works but uploading a profile photo will fail.

**7. Seed sample data (optional)**
```bash
npx prisma db seed
```

**8. Start the dev server**
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000), sign in with Google, then claim your brother row on `/pending-access`.

---

## Deployment

Built for **Vercel** with a Supabase backend.

1. **Import the repository** in Vercel.
2. **Add environment variables** (Project Settings → Environment Variables): `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and `SUPABASE_SERVICE_ROLE_KEY` if used).
3. **Add the production redirect URL** in Supabase → Authentication → URL Configuration → Redirect URLs:
   ```
   https://your-app.vercel.app/auth/callback
   ```
4. **Deploy.** The `build` script runs `prisma generate && next build` on each push to `main`.

> **Migrations are not run by the build.** `next build` only generates the Prisma client. Apply schema changes with `npx prisma migrate deploy` against the production database (locally with prod `DIRECT_URL`, or via your CI/pipeline) — otherwise new columns won't exist and queries will error.

> **Connection pooling.** Use the pooled URL (port 6543) for `DATABASE_URL` so short-lived Vercel functions don't exhaust connections, and the direct URL (port 5432) for `DIRECT_URL` so migrations work.

### Post-deploy checklist
- [ ] All env vars set in Vercel
- [ ] Production redirect URL added in Supabase Auth
- [ ] `npx prisma migrate deploy` run against the production database
- [ ] `avatars` storage bucket + policies created (if using profile photos)
- [ ] At least one `Brother` row exists (or an admin) so the first user can claim it
```
