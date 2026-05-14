# FraternityOps

Chapter operations dashboard for Lambda Phi Epsilon. It tracks member health, attendance, dues, academics, service hours, deadlines, Instagram tasks, treasury metrics, party revenue, activity updates, and a shared chapter timeline.

The app is built with Next.js, React, Tailwind CSS, Prisma, and PostgreSQL. It ships with seed data so the dashboard can be populated quickly in a local or hosted database.

## Features

- Dashboard KPI cards for attendance, dues, GPA, service hours, treasury balance, and door revenue.
- Brother profiles with editable attendance, dues, GPA, service hours, and status indicators.
- Deadline, Instagram, party, and activity feeds backed by API routes.
- Treasury trend data and projected balance summaries.
- Timeline page for chapter events, mandatory events, deadlines, and parties.
- Prisma migrations and seed data for bootstrapping PostgreSQL.

## Tech Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- Prisma 7
- PostgreSQL with `pg` and `@prisma/adapter-pg`
- Recharts

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Set `DATABASE_URL` in `.env.local` to a PostgreSQL connection string. The example is written for Supabase Postgres, but any compatible PostgreSQL database should work.

Generate the Prisma client, apply migrations, and seed the database:

```bash
npx prisma generate
npx prisma migrate dev
npx prisma db seed
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Scripts

```bash
npm run dev
npm run build
npm run start
```

- `npm run dev` starts the local Next.js development server.
- `npm run build` creates a production build.
- `npm run start` serves the production build.

## Project Structure

```text
app/
  api/                    Next.js API routes for chapter data
  components/             Dashboard UI components
  context/                Shared chapter data provider
  generated/prisma/       Generated Prisma client output
  timeline/               Chapter timeline page
  data.ts                 Types, thresholds, helpers, and seed data
lib/
  prisma.ts               Shared Prisma client
prisma/
  migrations/             Database migrations
  schema.prisma           Database schema
  seed.ts                 Database seed script
```

## Data Model

The PostgreSQL schema includes:

- `Brother`
- `Deadline`
- `InstagramTask`
- `PartyEvent`
- `CalendarEvent`
- `ActivityLog`

Most dashboard data loads through API routes under `app/api/*`, then flows through `ChapterProvider` in `app/context/ChapterContext.tsx`.

## Development Notes

- The app expects `DATABASE_URL` to be present before API routes or Prisma commands run.
- Seed data lives in `app/data.ts` and is inserted by `prisma/seed.ts`.
- The main dashboard lives at `/`; the chapter timeline lives at `/timeline`.
- Generated Prisma output is configured to `app/generated/prisma`.
