# FraternityOps

Chapter operations dashboard for Lambda Phi Epsilon — track brothers, attendance, dues, academics, service hours, deadlines, Instagram tasks, treasury, parties, and the chapter timeline in one place.

Built with Next.js 16, React 19, Tailwind CSS 4, Prisma 7, and PostgreSQL.

---

## Features

**Dashboard** — KPI cards, brother roster, upcoming deadlines, Instagram tasks, activity feed, and quick actions all on the home page.

**Timeline** — Chapter calendar with event logging. Brothers can mark attendance or submit excuses for mandatory events.

**Parties** — Track party profit with Open/Closed event types, a wrap-up flow for closing out events, and Upcoming/Past tabs for browsing history.

**Treasury** — Balance trends and party revenue across semester views. A dedicated transactions page provides a full income/expense ledger with filters and CSV export.

**Attendance** — Per-semester attendance records with excuse tracking. Each brother's attendance percentage is computed automatically from logged events.

---

## Routes

| Path | Page |
| --- | --- |
| `/` | Main dashboard |
| `/timeline` | Calendar and event attendance |
| `/parties` | Party dashboard |
| `/treasury` | Treasury overview |
| `/treasury/transactions` | Transaction ledger |

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, Recharts |
| ORM | Prisma 7 |
| Database | PostgreSQL via `pg` and `@prisma/adapter-pg` |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL running locally or a connection string to a remote instance

### Setup

```bash
# Clone the repo
git clone https://github.com/<your-org>/fraternityops.git
cd fraternityops

# Install dependencies
npm install

# Set up your environment
cp .env.example .env
# Edit .env and add your DATABASE_URL

# Run migrations
npx prisma migrate dev

# Seed the database with sample data
npx prisma db seed

# Start the dev server
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## Data Model

| Model | Purpose |
| --- | --- |
| `Brother` | Chapter roster. Attendance percentage is recalculated from semester records. |
| `Semester` | Defines the active semester for attendance tracking. |
| `AttendanceRecord` | Logs a brother's attendance at a specific event. |
| `AttendanceExcuse` | Stores excuses submitted for missed events. |
| `CalendarEvent` | Events displayed on the timeline. |
| `Deadline` | Upcoming chapter deadlines. |
| `InstagramTask` | Social media tasks assigned to brothers. |
| `ActivityLog` | Feed of recent chapter activity. |
| `PartyEvent` | Parties with revenue, expenses, Open/Closed type, and completion status. |
| `Transaction` | Treasury income and expense line items. |

Data is served through API routes under `app/api/*` and consumed via `ChapterProvider` in `app/context/ChapterContext.tsx`.

---

## Project Structure

```
app/
├── api/              # API routes (brothers, calendar, attendance, parties, treasury, …)
├── components/       # Shared UI components
├── context/          # ChapterProvider (global state)
├── parties/          # Party dashboard page
├── timeline/         # Calendar page
├── treasury/         # Treasury overview and transactions pages
└── data.ts           # Types, thresholds, and seed data

lib/
├── prisma.ts         # Prisma client singleton
└── attendance.ts     # Attendance recalculation helpers

prisma/
├── schema.prisma     # Database schema
├── migrations/       # Migration history
└── seed.ts           # Development seed script
```

---

## Contributing

1. Create a feature branch off `main`.
2. Run `npx prisma migrate dev` if you change the schema.
3. Make sure `npm run build` passes before opening a PR.

---

## License

MIT
