/**
 * Tool surface exposed to the chatbot (gpt-4o-mini via /api/ai/chat).
 *
 * Read tools run on the server and feed results back to the model. Write tools
 * NEVER execute writes — they validate inputs and return a structured proposal
 * the client renders as a confirm card; only on user confirm does the client
 * POST to the real /api/* route, where existing auth (requireUser/requireAdmin/
 * requireAdminOrSelf) decides if the write actually goes through.
 *
 * One source of truth: the JSON schemas the model sees AND the server-side
 * dispatcher live in this file so they can't drift.
 */
import type OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { THRESHOLDS, getBrotherStatus, type Brother as BrotherType } from "@/app/data";

// ────────────────────────────────────────────────────────────────────────────
// Tool schemas (OpenAI Chat Completions tool format)
// ────────────────────────────────────────────────────────────────────────────

// Shapes the proposal payload sent over SSE to the client.
export interface Proposal {
  kind: "proposal";
  action: string;       // tool name, e.g. "propose_add_deadline"
  endpoint: string;     // /api/deadlines etc.
  method: "POST" | "PATCH";
  payload: Record<string, unknown>;
  summary: string;      // human-readable one-liner for the confirm card
}

const TASK_STATUSES = ["Upcoming", "Due Soon", "Urgent", "Complete"] as const;
const IG_TYPES = ["Feed Post", "Reel", "Story", "Carousel", "Story + Feed"] as const;
const CAL_CATEGORIES = ["chapter", "social", "fundy", "program", "party", "deadline", "service"] as const;
const TX_TYPES = ["income", "expense"] as const;

export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_brothers",
      description:
        "List active brothers (ghosts excluded) with attendance %, GPA, dues owed, service hours, and computed status. Use this for any question about the brotherhood roster, at-risk members, or who owes dues.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["At Risk", "Watch", "Good", "Any"],
            description: "Filter by computed status. 'Any' returns all.",
          },
          owes_dues_only: { type: "boolean", description: "Only brothers with duesOwed > 0." },
          limit: { type: "integer", minimum: 1, maximum: 100, description: "Max rows (default 100)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_brother",
      description: "Get one brother by id or by exact-name match (case-insensitive). Returns metrics + recent attendance count.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer", description: "Brother id." },
          name: { type: "string", description: "Exact full name (case-insensitive)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_deadlines",
      description: "Chapter deadlines (title, dueDate, owner, status). Optionally filter by date range or status.",
      parameters: {
        type: "object",
        properties: {
          start: { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:   { type: "string", description: "Inclusive YYYY-MM-DD end." },
          status: { type: "string", description: 'e.g. "Urgent", "Due Soon", "Upcoming", "Complete".' },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_instagram_tasks",
      description: "Instagram content tasks with status, type (Feed Post / Reel / Story / Carousel), owner, dueDate.",
      parameters: {
        type: "object",
        properties: {
          start: { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:   { type: "string", description: "Inclusive YYYY-MM-DD end." },
          status: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_calendar_events",
      description: "Chapter calendar events (title, date, time, category, mandatory). Filter by date range, category, or mandatory_only.",
      parameters: {
        type: "object",
        properties: {
          start: { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:   { type: "string", description: "Inclusive YYYY-MM-DD end." },
          category: { type: "string", description: "chapter | social | fundy | program | party | deadline | service" },
          mandatory_only: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_parties",
      description: "Party events with date, theme, doorRevenue, expenses, attendance, completed flag.",
      parameters: {
        type: "object",
        properties: {
          start: { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:   { type: "string", description: "Inclusive YYYY-MM-DD end." },
          completed_only: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sum_transactions",
      description:
        "Aggregate non-deleted transactions. Returns totals split by type, optional grouping by category, optional date range or semester filter. Use for spending and revenue questions.",
      parameters: {
        type: "object",
        properties: {
          start: { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:   { type: "string", description: "Inclusive YYYY-MM-DD end." },
          semester: { type: "string", description: 'e.g. "SPR26".' },
          group_by_category: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_treasury",
      description: "Current treasury: balance (party door revenue + income − expenses), projected, and recent transactions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budget",
      description: "Active semester budget: carryoverBalance, reserveAmount, and per-allocation actuals.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "recent_activity",
      description: "N most recent activity-log entries (message, type, timestamp, actor name).",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100, description: "Default 20." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "weekly_digest",
      description:
        "This week's agenda (Mon–Sun containing today): deadlines due, IG tasks due, mandatory events, parties, and the count of at-risk brothers.",
      parameters: { type: "object", properties: {} },
    },
  },
  // ── Write proposals (server validates and returns a confirm card; never executes) ──
  {
    type: "function",
    function: {
      name: "propose_add_deadline",
      description:
        "Propose adding a chapter deadline. Returns a confirm card — the deadline is NOT created until the user clicks Confirm. Use when the user asks to add or schedule a deadline.",
      parameters: {
        type: "object",
        properties: {
          title:   { type: "string", description: "Short descriptive title." },
          dueDate: { type: "string", description: "YYYY-MM-DD." },
          owner:   { type: "string", description: "Brother name responsible." },
          status:  { type: "string", enum: ["Upcoming", "Due Soon", "Urgent"], description: "Initial status." },
        },
        required: ["title", "dueDate", "owner", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_add_instagram_task",
      description:
        "Propose adding an Instagram content task (post, reel, story, etc.). Returns a confirm card; the task is NOT created until confirmed.",
      parameters: {
        type: "object",
        properties: {
          title:   { type: "string" },
          dueDate: { type: "string", description: "YYYY-MM-DD." },
          owner:   { type: "string", description: "Brother name responsible." },
          status:  { type: "string", enum: ["Upcoming", "Due Soon", "Urgent"] },
          type:    { type: "string", enum: [...IG_TYPES], description: "Content format." },
        },
        required: ["title", "dueDate", "owner", "status", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_add_calendar_event",
      description:
        "Propose adding a chapter calendar event. Returns a confirm card; the event is NOT created until confirmed. Mandatory events count toward attendance.",
      parameters: {
        type: "object",
        properties: {
          title:       { type: "string" },
          date:        { type: "string", description: "YYYY-MM-DD." },
          time:        { type: "string", description: "Optional, e.g. '7:00 PM'." },
          category:    { type: "string", enum: [...CAL_CATEGORIES] },
          mandatory:   { type: "boolean", description: "True for events that count toward attendance." },
          location:    { type: "string" },
          description: { type: "string" },
        },
        required: ["title", "date", "category", "mandatory"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_log_transaction",
      description:
        "Propose logging a treasury transaction (income or expense). Returns a confirm card; the transaction is NOT recorded until confirmed. Only admins can successfully confirm.",
      parameters: {
        type: "object",
        properties: {
          type:        { type: "string", enum: [...TX_TYPES] },
          category:    { type: "string" },
          amount:      { type: "number", description: "Non-negative dollars." },
          date:        { type: "string", description: "YYYY-MM-DD." },
          description: { type: "string" },
          paymentMethod: { type: "string", description: "venmo | cash | check | invoice" },
          paidTo:      { type: "string" },
        },
        required: ["type", "category", "amount", "date", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_mark_dues_paid",
      description:
        "Propose marking a brother's dues as paid (sets duesOwed to 0). Returns a confirm card; the brother record is NOT changed until confirmed. Only admins (or the brother themselves) can successfully confirm.",
      parameters: {
        type: "object",
        properties: {
          brother_id:   { type: "integer", description: "Brother id. Use list_brothers or get_brother first to find it." },
          brother_name: { type: "string", description: "Provide the name too for the confirm card preview." },
        },
        required: ["brother_id", "brother_name"],
      },
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mon–Sun ISO bounds containing `today` (matches app/data.ts isoWeekBounds). */
function isoWeekBoundsServer(today: Date) {
  const diffToMon = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const pad = (n: number) => String(n).padStart(2, "0");
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { start: toISO(monday), end: toISO(sunday) };
}

function clampLimit(n: unknown, def = 100, max = 100): number {
  const v = typeof n === "number" ? Math.floor(n) : def;
  return Math.max(1, Math.min(max, v));
}

// ────────────────────────────────────────────────────────────────────────────
// Read-tool handlers
// ────────────────────────────────────────────────────────────────────────────

type ToolArgs = Record<string, unknown>;
type ToolResult = unknown;

async function listBrothers(args: ToolArgs): Promise<ToolResult> {
  const rows = await prisma.brother.findMany({
    where: { isGhost: false },
    orderBy: { name: "asc" },
    take: clampLimit(args.limit),
  });
  const owesOnly = args.owes_dues_only === true;
  const statusFilter = typeof args.status === "string" ? args.status : "Any";

  return rows
    .map(b => ({
      id: b.id,
      name: b.name,
      role: b.role,
      attendance: r2(b.attendance),
      gpa: r2(b.gpa),
      duesOwed: r2(b.duesOwed),
      serviceHours: r2(b.serviceHours),
      status: getBrotherStatus(b as BrotherType),
      isAdmin: b.isAdmin,
    }))
    .filter(b => (statusFilter === "Any" ? true : b.status === statusFilter))
    .filter(b => (owesOnly ? b.duesOwed > 0 : true));
}

async function getBrother(args: ToolArgs): Promise<ToolResult> {
  const id = typeof args.id === "number" ? args.id : undefined;
  const name = typeof args.name === "string" ? args.name : undefined;
  if (id == null && !name) return { error: "Provide id or name." };
  const b = id != null
    ? await prisma.brother.findUnique({ where: { id } })
    : await prisma.brother.findFirst({ where: { name: { equals: name!, mode: "insensitive" }, isGhost: false } });
  if (!b) return { error: "Brother not found." };
  if (b.isGhost) return { error: "Brother not found." }; // ghosts stay hidden

  const attendanceCount = await prisma.attendanceRecord.count({ where: { brotherId: b.id, attended: true } });
  return {
    id: b.id,
    name: b.name,
    role: b.role,
    attendance: r2(b.attendance),
    gpa: r2(b.gpa),
    duesOwed: r2(b.duesOwed),
    serviceHours: r2(b.serviceHours),
    status: getBrotherStatus(b as BrotherType),
    isAdmin: b.isAdmin,
    email: b.email,
    eventsAttended: attendanceCount,
  };
}

async function listDeadlines(args: ToolArgs): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const status = typeof args.status === "string" ? args.status : undefined;
  const rows = await prisma.deadline.findMany({
    orderBy: { dueDate: "asc" },
    take: 100,
  });
  return rows
    .filter(d => (start ? d.dueDate >= start : true))
    .filter(d => (end   ? d.dueDate <= end   : true))
    .filter(d => (status ? d.status === status : true));
}

async function listInstagram(args: ToolArgs): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const status = typeof args.status === "string" ? args.status : undefined;
  const rows = await prisma.instagramTask.findMany({ orderBy: { dueDate: "asc" }, take: 100 });
  return rows
    .filter(t => (start ? t.dueDate >= start : true))
    .filter(t => (end   ? t.dueDate <= end   : true))
    .filter(t => (status ? t.status === status : true));
}

async function listCalendar(args: ToolArgs): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const category = typeof args.category === "string" ? args.category : undefined;
  const mandatoryOnly = args.mandatory_only === true;
  const rows = await prisma.calendarEvent.findMany({ orderBy: { date: "asc" }, take: 100 });
  return rows
    .filter(e => (start ? e.date >= start : true))
    .filter(e => (end   ? e.date <= end   : true))
    .filter(e => (category ? e.category === category : true))
    .filter(e => (mandatoryOnly ? e.mandatory : true));
}

async function listParties(args: ToolArgs): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const completedOnly = args.completed_only === true;
  const rows = await prisma.partyEvent.findMany({ orderBy: { date: "asc" }, take: 100 });
  return rows
    .filter(p => (start ? p.date >= start : true))
    .filter(p => (end   ? p.date <= end   : true))
    .filter(p => (completedOnly ? p.completed : true))
    .map(p => ({
      id: p.id, name: p.name, date: p.date, partyType: p.partyType, theme: p.theme,
      doorRevenue: r2(p.doorRevenue), expenses: r2(p.expenses),
      attendance: p.attendance, completed: p.completed,
    }));
}

async function sumTransactions(args: ToolArgs): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const semester = typeof args.semester === "string" ? args.semester : undefined;
  const rows = await prisma.transaction.findMany({
    where: {
      deletedAt: null,
      ...(start || end ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
      ...(semester ? { semester } : {}),
    },
    select: { type: true, category: true, amount: true },
  });

  let income = 0, expense = 0;
  const byCategory: Record<string, { income: number; expense: number }> = {};
  for (const t of rows) {
    if (t.type === "income") income += t.amount;
    else                     expense += t.amount;
    if (args.group_by_category) {
      const slot = byCategory[t.category] ?? { income: 0, expense: 0 };
      if (t.type === "income") slot.income += t.amount;
      else                     slot.expense += t.amount;
      byCategory[t.category] = slot;
    }
  }

  return {
    totals: { income: r2(income), expense: r2(expense), net: r2(income - expense), count: rows.length },
    ...(args.group_by_category
      ? {
          byCategory: Object.fromEntries(
            Object.entries(byCategory).map(([k, v]) => [k, { income: r2(v.income), expense: r2(v.expense) }]),
          ),
        }
      : {}),
  };
}

async function getTreasury(): Promise<ToolResult> {
  const [parties, transactions] = await Promise.all([
    prisma.partyEvent.findMany({ select: { doorRevenue: true } }),
    prisma.transaction.findMany({
      where: { deletedAt: null }, orderBy: { date: "desc" }, take: 10,
      select: { date: true, type: true, amount: true, category: true, description: true },
    }),
  ]);
  const allTx = await prisma.transaction.findMany({
    where: { deletedAt: null }, select: { type: true, amount: true },
  });
  const doorRevenue = parties.reduce((s, p) => s + p.doorRevenue, 0);
  let income = 0, expense = 0;
  for (const t of allTx) { if (t.type === "income") income += t.amount; else expense += t.amount; }
  const balance = doorRevenue + income - expense;
  return {
    balance: r2(balance),
    projected: r2(balance * 1.3),
    breakdown: { doorRevenue: r2(doorRevenue), income: r2(income), expense: r2(expense) },
    recentTransactions: transactions.map(t => ({ ...t, amount: r2(t.amount) })),
  };
}

async function getBudget(): Promise<ToolResult> {
  // Active semester is the one flagged isActive (matches the rest of the app).
  const semester = await prisma.semester.findFirst({ where: { isActive: true } });
  if (!semester) return { error: "No active semester." };
  const budget = await prisma.budget.findFirst({
    where: { semester: semester.label },
    include: { allocations: true },
  });
  if (!budget) return { semester: semester.label, message: "No budget defined for this semester." };

  // Pull actuals per category for this semester
  const txs = await prisma.transaction.findMany({
    where: { deletedAt: null, semester: semester.label },
    select: { category: true, amount: true, type: true },
  });
  const spentByCategory: Record<string, number> = {};
  for (const t of txs) {
    if (t.type !== "expense") continue;
    spentByCategory[t.category] = (spentByCategory[t.category] ?? 0) + t.amount;
  }

  // Allocations are stored as percent-of-pool. Pool = carryoverBalance − reserveAmount.
  const pool = Math.max(0, budget.carryoverBalance - budget.reserveAmount);
  return {
    semester: semester.label,
    carryoverBalance: r2(budget.carryoverBalance),
    reserveAmount: r2(budget.reserveAmount),
    spendablePool: r2(pool),
    allocations: budget.allocations.map(a => {
      const planned = (a.percent / 100) * pool;
      const spent = spentByCategory[a.category] ?? 0;
      return {
        category: a.category,
        percent: r2(a.percent),
        planned: r2(planned),
        spent: r2(spent),
        remaining: r2(planned - spent),
      };
    }),
  };
}

async function recentActivity(args: ToolArgs): Promise<ToolResult> {
  const take = clampLimit(args.limit, 20, 100);
  const rows = await prisma.activityLog.findMany({
    orderBy: { timestamp: "desc" },
    take,
    include: { actor: { select: { name: true } } },
  });
  return rows.map(r => ({
    id: r.id,
    message: r.message,
    type: r.type,
    timestamp: r.timestamp,
    actor: r.actor?.name ?? null,
  }));
}

async function weeklyDigest(): Promise<ToolResult> {
  const { start, end } = isoWeekBoundsServer(new Date());
  const inWeek = (iso: string) => iso >= start && iso <= end;
  const [deadlines, ig, events, parties, brothers] = await Promise.all([
    prisma.deadline.findMany(),
    prisma.instagramTask.findMany(),
    prisma.calendarEvent.findMany({ where: { mandatory: true } }),
    prisma.partyEvent.findMany(),
    prisma.brother.findMany({ where: { isGhost: false } }),
  ]);
  const atRiskCount = brothers.filter(b => getBrotherStatus(b as BrotherType) === "At Risk").length;
  return {
    weekRange: { start, end },
    deadlinesDue: deadlines.filter(d => inWeek(d.dueDate)).map(d => ({ id: d.id, title: d.title, dueDate: d.dueDate, owner: d.owner, status: d.status })),
    igDue:        ig.filter(t => inWeek(t.dueDate)).map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate, type: t.type })),
    events:       events.filter(e => inWeek(e.date)).map(e => ({ id: e.id, title: e.title, date: e.date, time: e.time })),
    parties:      parties.filter(p => inWeek(p.date)).map(p => ({ id: p.id, name: p.name, date: p.date })),
    atRiskCount,
    thresholds: THRESHOLDS,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Write proposal builders — VALIDATE only, NEVER touch the DB. The chat route
// surfaces the returned Proposal over SSE as a confirm card on the client.
// The client posts the validated payload to the existing /api/* route, whose
// existing auth (requireUser / requireAdmin / requireAdminOrSelf) decides if
// the write actually happens.
// ────────────────────────────────────────────────────────────────────────────

function badProposal(reason: string): { error: string } { return { error: reason }; }

function proposeAddDeadline(args: ToolArgs): Proposal | { error: string } {
  const title = String(args.title ?? "").trim();
  const dueDate = String(args.dueDate ?? "").trim();
  const owner = String(args.owner ?? "").trim();
  const status = String(args.status ?? "").trim();
  if (!title || !dueDate || !owner || !status) return badProposal("Missing required fields.");
  if (!DATE_RE.test(dueDate)) return badProposal("dueDate must be YYYY-MM-DD.");
  if (!(TASK_STATUSES as readonly string[]).includes(status)) return badProposal(`status must be one of ${TASK_STATUSES.join(", ")}.`);
  if (title.length > 200 || owner.length > 200) return badProposal("Field too long.");
  return {
    kind: "proposal",
    action: "propose_add_deadline",
    endpoint: "/api/deadlines",
    method: "POST",
    payload: { title, dueDate, owner, status },
    summary: `Add deadline "${title}" — due ${dueDate}, owner ${owner}.`,
  };
}

function proposeAddInstagram(args: ToolArgs): Proposal | { error: string } {
  const title = String(args.title ?? "").trim();
  const dueDate = String(args.dueDate ?? "").trim();
  const owner = String(args.owner ?? "").trim();
  const status = String(args.status ?? "").trim();
  const type = String(args.type ?? "").trim();
  if (!title || !dueDate || !owner || !status || !type) return badProposal("Missing required fields.");
  if (!DATE_RE.test(dueDate)) return badProposal("dueDate must be YYYY-MM-DD.");
  if (!(TASK_STATUSES as readonly string[]).includes(status)) return badProposal(`status must be one of ${TASK_STATUSES.join(", ")}.`);
  if (!(IG_TYPES as readonly string[]).includes(type)) return badProposal(`type must be one of ${IG_TYPES.join(", ")}.`);
  return {
    kind: "proposal",
    action: "propose_add_instagram_task",
    endpoint: "/api/instagram",
    method: "POST",
    payload: { title, dueDate, owner, status, type },
    summary: `Add IG ${type}: "${title}" — due ${dueDate}, owner ${owner}.`,
  };
}

function proposeAddCalendarEvent(args: ToolArgs): Proposal | { error: string } {
  const title = String(args.title ?? "").trim();
  const date = String(args.date ?? "").trim();
  const category = String(args.category ?? "").trim();
  const mandatory = args.mandatory === true;
  if (!title || !date || !category) return badProposal("Missing required fields.");
  if (!DATE_RE.test(date)) return badProposal("date must be YYYY-MM-DD.");
  if (!(CAL_CATEGORIES as readonly string[]).includes(category)) return badProposal(`category must be one of ${CAL_CATEGORIES.join(", ")}.`);
  if (typeof args.mandatory !== "boolean") return badProposal("mandatory must be a boolean.");
  if (category === "chapter" && !mandatory) return badProposal("Chapter events must be mandatory.");
  const payload: Record<string, unknown> = { title, date, category, mandatory };
  if (typeof args.time === "string" && args.time.trim()) payload.time = String(args.time).trim();
  if (typeof args.location === "string" && args.location.trim()) payload.location = String(args.location).trim();
  if (typeof args.description === "string" && args.description.trim()) payload.description = String(args.description).trim();
  return {
    kind: "proposal",
    action: "propose_add_calendar_event",
    endpoint: "/api/calendar",
    method: "POST",
    payload,
    summary: `Schedule ${category} event "${title}" on ${date}${mandatory ? " (mandatory)" : ""}.`,
  };
}

function proposeLogTransaction(args: ToolArgs): Proposal | { error: string } {
  const type = String(args.type ?? "").trim();
  const category = String(args.category ?? "").trim();
  const date = String(args.date ?? "").trim();
  const description = String(args.description ?? "").trim();
  const amount = Number(args.amount);
  if (!type || !category || !date || !description || !(amount >= 0)) return badProposal("Missing or invalid required fields.");
  if (!(TX_TYPES as readonly string[]).includes(type)) return badProposal('type must be "income" or "expense".');
  if (!DATE_RE.test(date)) return badProposal("date must be YYYY-MM-DD.");
  const payload: Record<string, unknown> = { type, category, amount: r2(amount), date, description };
  if (typeof args.paymentMethod === "string" && args.paymentMethod.trim()) payload.paymentMethod = String(args.paymentMethod).trim();
  if (typeof args.paidTo === "string" && args.paidTo.trim()) payload.paidTo = String(args.paidTo).trim();
  return {
    kind: "proposal",
    action: "propose_log_transaction",
    endpoint: "/api/transactions",
    method: "POST",
    payload,
    summary: `Log $${r2(amount).toFixed(2)} ${type} (${category}) on ${date}: ${description}. Admin-only.`,
  };
}

function proposeMarkDuesPaid(args: ToolArgs): Proposal | { error: string } {
  const id = typeof args.brother_id === "number" ? args.brother_id : Number(args.brother_id);
  const name = typeof args.brother_name === "string" ? args.brother_name.trim() : "";
  if (!Number.isFinite(id) || id <= 0) return badProposal("brother_id required.");
  if (!name) return badProposal("brother_name required for the confirm card.");
  return {
    kind: "proposal",
    action: "propose_mark_dues_paid",
    endpoint: `/api/brothers/${id}`,
    method: "PATCH",
    payload: { duesOwed: 0 },
    summary: `Mark ${name}'s dues as paid (set duesOwed = 0). Admin or self required.`,
  };
}

const PROPOSAL_HANDLERS: Record<string, (args: ToolArgs) => Proposal | { error: string }> = {
  propose_add_deadline:       proposeAddDeadline,
  propose_add_instagram_task: proposeAddInstagram,
  propose_add_calendar_event: proposeAddCalendarEvent,
  propose_log_transaction:    proposeLogTransaction,
  propose_mark_dues_paid:     proposeMarkDuesPaid,
};

/** True when the tool name is a write proposal (server validates but never writes). */
export function isProposalTool(name: string): boolean {
  return name in PROPOSAL_HANDLERS;
}

/** Run a proposal tool. Always returns synchronously-shaped result; never throws. */
export function runProposal(name: string, args: ToolArgs): Proposal | { error: string } {
  const handler = PROPOSAL_HANDLERS[name];
  if (!handler) return { error: `Unknown proposal: ${name}` };
  try { return handler(args); }
  catch (e) { return { error: e instanceof Error ? e.message : "Proposal failed" }; }
}

// ────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ────────────────────────────────────────────────────────────────────────────

const READ_HANDLERS: Record<string, (args: ToolArgs) => Promise<ToolResult>> = {
  list_brothers:        listBrothers,
  get_brother:          getBrother,
  list_deadlines:       listDeadlines,
  list_instagram_tasks: listInstagram,
  list_calendar_events: listCalendar,
  list_parties:         listParties,
  sum_transactions:     sumTransactions,
  get_treasury:         () => getTreasury(),
  get_budget:           () => getBudget(),
  recent_activity:      recentActivity,
  weekly_digest:        () => weeklyDigest(),
};

/**
 * Run a read tool and return its result (will be JSON-stringified and fed back
 * to the model as a `tool` message). On any failure, returns an `{error}` object
 * the model can react to, rather than throwing — keeps the chat loop alive.
 */
export async function runTool(name: string, args: ToolArgs): Promise<ToolResult> {
  const handler = READ_HANDLERS[name];
  if (!handler) return { error: `Unknown tool: ${name}` };
  try {
    return await handler(args);
  } catch (e) {
    console.error(`runTool(${name}) failed:`, e);
    return { error: e instanceof Error ? e.message : "Tool failed" };
  }
}

/** True when the tool name is one the server should execute (read tool). */
export function isReadTool(name: string): boolean {
  return name in READ_HANDLERS;
}
