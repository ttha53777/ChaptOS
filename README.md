# ChaptOS

Chapter operations dashboard for Lambda Phi Epsilon. Tracks brothers, attendance, deadlines, treasury, Instagram tasks, and chapter meetings in one place.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
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
| Framework | Next.js 16.2 (App Router) |
| Language | TypeScript 6 |
| UI | React 19, Tailwind CSS 4 |
| Charts | Recharts 3 |
| Auth | Supabase Auth (Google OAuth) |
| Database | PostgreSQL via Supabase |
| ORM | Prisma 7 with `@prisma/adapter-pg` |
| Connection pooling | `pg.Pool` + pgbouncer |

---

## Architecture

```
Browser
  │
  ├── Next.js App Router (app/)
  │     ├── proxy.ts (middleware) — auth gate on every request
  │     ├── app/layout.tsx — ChapterProvider wraps entire app
  │     ├── app/page.tsx — main dashboard
  │     └── app/api/** — 27 JSON API routes
  │
  ├── Supabase Auth — Google OAuth sessions, cookie-based
  │
  └── PostgreSQL (Supabase) — Prisma ORM + pg.Pool
```

**Key design decisions:**

- **Two-layer auth**: Supabase manages OAuth sessions; a separate `Brother` table links each auth user to chapter data. A user cannot access the app until an admin links their Google account to a `Brother` row.
- **Global state via ChapterContext**: All chapter data (brothers, deadlines, tasks, parties, transactions) is fetched once on mount in `ChapterProvider` and shared app-wide. Individual pages do optimistic updates against context without refetching.
- **All data access through API routes**: Client components never touch Prisma directly. Every mutation goes through an API route that calls `requireUser()` to verify the session before touching the database.
- **Soft deletes on transactions**: `Transaction` rows are never deleted — they get a `deletedAt` timestamp so financial history is always preserved.

---

## Project Structure

```
figurints/
├── app/
│   ├── api/                  # API routes (27 endpoints)
│   │   ├── activity/
│   │   ├── attendance/
│   │   ├── auth/             # claim, me, signout, unlink-self, accounts
│   │   ├── brothers/
│   │   ├── calendar/
│   │   ├── deadlines/
│   │   ├── excuses/
│   │   ├── instagram/
│   │   ├── parties/
│   │   ├── semesters/
│   │   ├── transactions/     # includes /export for CSV download
│   │   └── treasury/
│   ├── auth/callback/        # OAuth redirect handler
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── UserAvatar.tsx
│   │   └── dashboard/        # widgets, forms, primitives, drawers, charts
│   ├── context/
│   │   └── ChapterContext.tsx
│   ├── hooks/
│   │   ├── useCurrentUser.ts
│   │   └── useOrgLogo.ts
│   ├── lib/
│   │   ├── api.ts            # requestJson<T> fetch helper
│   │   └── dates.ts          # pad, todayStr, daysFromToday, toDateStr
│   ├── brothers/
│   ├── chapter/              # meeting notes
│   ├── instagram/
│   ├── login/
│   ├── parties/
│   ├── pending-access/       # account claim page (new users)
│   ├── settings/
│   ├── timeline/
│   ├── treasury/
│   ├── data.ts               # shared types, constants, formatters
│   ├── globals.css
│   └── layout.tsx
├── lib/
│   ├── auth/
│   │   └── require-user.ts   # API route auth guard
│   ├── supabase/
│   │   ├── client.ts         # browser Supabase client (anon key)
│   │   └── server.ts         # server Supabase client (uses cookies)
│   ├── attendance.ts         # attendance calculation helpers
│   └── prisma.ts             # Prisma singleton with pg.Pool
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── proxy.ts                  # Next.js middleware (auth gate)
├── next.config.ts
└── tsconfig.json
```

---

## Auth Flow

```
1. User visits any protected page
        │
        ▼
2. proxy.ts checks for valid Supabase session cookie
        │
        ├── No session ──────────────────────────────► /login
        │
        └── Session present but no brother_linked cookie ► /pending-access
                │
                ▼
3. /login — "Continue with Google" → Supabase OAuth
        │
        ▼
4. /auth/callback — exchanges code for session, checks Brother table
        │
        ├── Brother row with this authUserId exists
        │       → set brother_linked cookie → /
        │
        └── No Brother row yet → /pending-access
                │
                ▼
5. User selects their name → POST /api/auth/claim
        │
        ▼
6. authUserId written to Brother row
        → set brother_linked cookie → /
```

Admin workflow: add a `Brother` row via the Brothers page **before** the person tries to sign in. They claim the row themselves on first login.

---

## Database Schema

### Brother

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| name | String | |
| role | String | e.g. "President", "Active" |
| attendance | Float | 0–100, system-managed |
| duesOwed | Float | |
| gpa | Float | |
| serviceHours | Float | |
| authUserId | String? | Supabase user UUID, set on claim |

### CalendarEvent

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| title | String | |
| date | String | YYYY-MM-DD |
| time | String? | |
| category | Enum | `chapter` `social` `fundy` `program` `party` `deadline` |
| mandatory | Boolean | Mandatory events count toward attendance |
| description | String? | Doubles as meeting notes for chapter events |
| location | String? | |

### AttendanceRecord

Links a `Brother` to a `CalendarEvent` in a given `Semester`. The `attended` flag is set when attendance is logged.

### AttendanceExcuse

Excuse for a missed mandatory event. `isRetroactive` is true when added after attendance was already recorded. Excused absences do not count against attendance percentage.

### Semester

| Column | Type | Notes |
|--------|------|-------|
| id | Int | PK |
| label | String | Unique, e.g. `SPR26` |
| startDate | String | YYYY-MM-DD |
| endDate | String | YYYY-MM-DD |
| isActive | Boolean | Only one active semester at a time |

### Transaction

Financial entries with `type` (`income` / `expense`). Never hard-deleted — rows get a `deletedAt` timestamp.

### PartyEvent

Tracks door revenue, expenses, attendance count, and wrap-up status per party event.

### InstagramTask

Content calendar items with `status` (Urgent / Due Soon / Upcoming / Complete) and `type` (Feed Post, Reel, Story, Carousel, Story + Feed).

### Deadline

Chapter deadlines with `owner` (assigned brother name) and `status`.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the three values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string. Use the **Session Mode pooler** URL from Supabase (port 5432). Must include `?pgbouncer=true`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key. |

**Where to find these in Supabase:**

- `DATABASE_URL`: Project Settings → Database → Connection string → URI → select "Session mode"
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Project Settings → API

> The service role key is intentionally unused. All database access goes through the anon key + Prisma on the server. Never expose `DATABASE_URL` to the client.

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
npm install
```

**2. Configure environment**

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
```

**3. Enable Google OAuth in Supabase**

Authentication → Providers → Google → enable and add your Google OAuth credentials.

Add the redirect URL: `http://localhost:3000/auth/callback`

**4. Run database migrations**

```bash
npx prisma migrate deploy
```

**5. Generate the Prisma client**

```bash
npx prisma generate
```

The client outputs to `app/generated/prisma/` (gitignored — must be generated locally and in CI).

**6. Enable profile photos (optional)**

Run `supabase/storage-avatars.sql` in the Supabase SQL Editor to create the `avatars` storage bucket and RLS policies. Without this, users can still sign in but changing profile photos from the top-right menu will fail.

**7. (Optional) Seed sample data**

```bash
npx prisma db seed
```

Creates sample brothers, deadlines, calendar events, transactions, and attendance records.

**8. Start the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with Google, then claim your brother row on the `/pending-access` page.

---

## Deployment

The app is built for **Vercel** with a Supabase backend.

**1. Import the repository** in the Vercel dashboard.

**2. Add environment variables** in Project Settings → Environment Variables:

```
DATABASE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**3. Add the production redirect URL** in Supabase:

Authentication → URL Configuration → Redirect URLs → add:

```
https://your-app.vercel.app/auth/callback
```

**4. Deploy.** Vercel runs `next build` on each push to `main`.

> **Connection pooling note:** Vercel functions are short-lived, so many connections would be created without pooling. The app uses `pg.Pool` and the `?pgbouncer=true` flag routes connections through Supabase's built-in pgbouncer. Use the **Session Mode** pooler URL (port 5432), not Transaction Mode — Prisma requires session-level features.

### Post-deploy checklist

- [ ] All three env vars set in Vercel
- [ ] Production redirect URL added in Supabase Auth settings
- [ ] `npx prisma migrate deploy` run against the production database
- [ ] At least one `Brother` row exists so the first user can claim it on login
