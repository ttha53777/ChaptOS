/**
 * Tool surface exposed to the chatbot (gpt-4o-mini via /api/ai/chat).
 *
 * Read tools run on the server and feed results back to the model. Write tools
 * NEVER execute writes — they validate inputs and return a structured proposal
 * the client renders as a confirm card; only on user confirm does the client
 * POST to the real /api/* route, where existing auth (requireUser/requireAdmin)
 * decides if the write actually goes through.
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
        "List active brothers (ghosts excluded) with attendance %, GPA, dues owed, service hours, and computed status. " +
        "For ranking questions (\"worst attendance\", \"top GPA\", \"lowest service hours\", \"who owes the most dues\"), " +
        "use order_by + order + limit instead of the status filter — those questions are about absolute rank, not the at-risk bucket. " +
        "Use the status filter only when the user explicitly asks about At Risk / Watch / Good categories.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["At Risk", "Watch", "Good", "Any"],
            description: "Filter by computed status. Only use when the question is explicitly about these buckets.",
          },
          owes_dues_only: { type: "boolean", description: "Only brothers with duesOwed > 0." },
          order_by: {
            type: "string",
            enum: ["attendance", "gpa", "duesOwed", "serviceHours", "name"],
            description: "Sort field. For 'worst/lowest' use the metric with order=asc; for 'best/highest/most' use order=desc.",
          },
          order: { type: "string", enum: ["asc", "desc"], description: "Sort direction (default asc)." },
          limit: { type: "integer", minimum: 1, maximum: 100, description: "Max rows (default 100; use ~5 for ranking questions)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_brother",
      description:
        "Get one brother by id or by a name fragment (case-insensitive, partial match — 'Bryan' matches 'Bryan Lee'). " +
        "If multiple names match, returns the list so the user (or you) can disambiguate. Returns metrics + attended-event count.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer", description: "Brother id." },
          name: { type: "string", description: "Full name or any fragment (case-insensitive)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_deadlines",
      description:
        "Chapter deadlines (title, dueDate, owner, status). " +
        "For 'soonest/next/closest' use order_by='dueDate', order='asc', small limit. " +
        "For 'most overdue' filter to past dates and sort asc. " +
        "Use status filter ONLY when the user explicitly asks about that bucket. " +
        "If a filtered query returns empty (e.g. no Urgent), broaden — drop the filter or check the next-tightest status.",
      parameters: {
        type: "object",
        properties: {
          start:  { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:    { type: "string", description: "Inclusive YYYY-MM-DD end." },
          status: { type: "string", description: 'e.g. "Urgent", "Due Soon", "Upcoming", "Complete".' },
          open_only: { type: "boolean", description: "Exclude Complete deadlines (default false)." },
          order_by:  { type: "string", enum: ["dueDate", "title", "owner"], description: "Sort field (default dueDate)." },
          order:     { type: "string", enum: ["asc", "desc"], description: "Default asc." },
          limit:     { type: "integer", minimum: 1, maximum: 100, description: "Default 100; use ~5 for 'next/soonest'." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_instagram_tasks",
      description:
        "Instagram content tasks (title, dueDate, owner, status, type). " +
        "For 'next/soonest' use order_by='dueDate', asc, small limit. " +
        "If filtering by status returns empty, broaden — don't say 'no IG tasks' before checking without the filter.",
      parameters: {
        type: "object",
        properties: {
          start:  { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:    { type: "string", description: "Inclusive YYYY-MM-DD end." },
          status: { type: "string", description: '"Urgent", "Due Soon", "Upcoming", "Complete".' },
          type:   { type: "string", description: "Feed Post | Reel | Story | Carousel | Story + Feed." },
          open_only: { type: "boolean", description: "Exclude Complete tasks." },
          order_by:  { type: "string", enum: ["dueDate", "title", "owner"], description: "Sort field (default dueDate)." },
          order:     { type: "string", enum: ["asc", "desc"], description: "Default asc." },
          limit:     { type: "integer", minimum: 1, maximum: 100, description: "Default 100." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_calendar_events",
      description:
        "Chapter calendar events (title, date, time, category, mandatory). " +
        "For 'next event' or 'upcoming events', set start=<today>, order_by='date', order='asc', limit=5. " +
        "For 'most recent past event' set end=<today>, order='desc', limit=5.",
      parameters: {
        type: "object",
        properties: {
          start:    { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:      { type: "string", description: "Inclusive YYYY-MM-DD end." },
          category: { type: "string", description: "chapter | social | fundy | program | party | deadline | service." },
          mandatory_only: { type: "boolean" },
          order_by: { type: "string", enum: ["date", "title"], description: "Default date." },
          order:    { type: "string", enum: ["asc", "desc"], description: "Default asc." },
          limit:    { type: "integer", minimum: 1, maximum: 100, description: "Default 100; use ~5 for 'next' or 'recent'." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_parties",
      description:
        "Party events (date, theme, doorRevenue, expenses, attendance, completed). " +
        "For 'biggest/best revenue' use order_by='doorRevenue', desc. " +
        "For 'most attended' use order_by='attendance', desc. " +
        "For 'most expensive' use order_by='expenses', desc.",
      parameters: {
        type: "object",
        properties: {
          start: { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:   { type: "string", description: "Inclusive YYYY-MM-DD end." },
          completed_only: { type: "boolean" },
          order_by: { type: "string", enum: ["date", "doorRevenue", "attendance", "expenses", "name"], description: "Default date." },
          order:    { type: "string", enum: ["asc", "desc"], description: "Default asc (use desc for biggest/most)." },
          limit:    { type: "integer", minimum: 1, maximum: 100, description: "Default 100; use ~5 for ranking." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sum_transactions",
      description:
        "Aggregate non-deleted transactions. Returns totals (income, expense, net) optionally grouped by category. " +
        "For 'biggest expense category' or 'top 3 spending areas', set group_by_category=true and type_filter='expense' — the response sorts categories by spend desc. " +
        "For 'how much did we spend on X', filter by category. " +
        "For 'how much have we made this semester', no filters needed beyond semester or date range.",
      parameters: {
        type: "object",
        properties: {
          start:    { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:      { type: "string", description: "Inclusive YYYY-MM-DD end." },
          semester: { type: "string", description: 'e.g. "SPR26".' },
          category: { type: "string", description: "Filter to one category (e.g. 'Operations', 'Door')." },
          type_filter: { type: "string", enum: ["income", "expense"], description: "Limit to one type." },
          group_by_category: { type: "boolean", description: "When true, response includes byCategory sorted by total desc." },
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
      description:
        "N most recent activity-log entries (message, type, timestamp, actor name). " +
        "Filter by type to find 'recent warnings' or 'recent successes'. If a type filter returns empty, drop the filter before reporting nothing.",
      parameters: {
        type: "object",
        properties: {
          type:  { type: "string", enum: ["success", "warning", "info"], description: "Filter by entry type." },
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
        "Propose adding a chapter deadline. Returns a confirm card — the deadline is NOT created until the user clicks Confirm. " +
        "Use when the user asks to add or schedule a deadline. Only ask the user for the required fields (title, dueDate, owner); " +
        "do NOT ask for status — omit it and it defaults to 'Upcoming'.",
      parameters: {
        type: "object",
        properties: {
          title:   { type: "string", description: "Short descriptive title." },
          dueDate: { type: "string", description: "YYYY-MM-DD." },
          owner:   { type: "string", description: "Brother name responsible." },
          status:  { type: "string", enum: ["Upcoming", "Due Soon", "Urgent"], description: "Optional. Defaults to 'Upcoming' — only set if the user explicitly mentions urgency." },
        },
        required: ["title", "dueDate", "owner"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_add_instagram_task",
      description:
        "Propose adding an Instagram content task (post, reel, story, etc.). Returns a confirm card; the task is NOT created until confirmed. " +
        "Only ask the user for the required fields (title, dueDate, owner, type); do NOT ask for status — omit it and it defaults to 'Upcoming'.",
      parameters: {
        type: "object",
        properties: {
          title:   { type: "string" },
          dueDate: { type: "string", description: "YYYY-MM-DD." },
          owner:   { type: "string", description: "Brother name responsible." },
          status:  { type: "string", enum: ["Upcoming", "Due Soon", "Urgent"], description: "Optional. Defaults to 'Upcoming' — only set if the user explicitly mentions urgency." },
          type:    { type: "string", enum: [...IG_TYPES], description: "Content format." },
        },
        required: ["title", "dueDate", "owner", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_add_calendar_event",
      description:
        "Propose adding a chapter calendar event. Returns a confirm card; the event is NOT created until confirmed. " +
        "Only ask the user for the required fields (title, date, category). Do NOT ask for time, location, description, or mandatory — " +
        "those are optional. Mandatory defaults to true for 'chapter' category and false otherwise.",
      parameters: {
        type: "object",
        properties: {
          title:       { type: "string" },
          date:        { type: "string", description: "YYYY-MM-DD." },
          time:        { type: "string", description: "Optional, e.g. '7:00 PM'. Only include if the user mentions a time." },
          category:    { type: "string", enum: [...CAL_CATEGORIES] },
          mandatory:   { type: "boolean", description: "Optional. Defaults to true for 'chapter' category, false otherwise. Only set if the user explicitly says mandatory/optional." },
          location:    { type: "string", description: "Optional. Only include if the user mentions a location." },
          description: { type: "string", description: "Optional. Only include if the user provides one." },
        },
        required: ["title", "date", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_log_transaction",
      description:
        "Propose logging a treasury transaction (income or expense). Returns a confirm card; the transaction is NOT recorded until confirmed. Only admins can successfully confirm. " +
        "Only ask the user for the required fields (type, category, amount, date, description). Do NOT ask for paymentMethod or paidTo — those are optional.",
      parameters: {
        type: "object",
        properties: {
          type:        { type: "string", enum: [...TX_TYPES] },
          category:    { type: "string" },
          amount:      { type: "number", description: "Non-negative dollars." },
          date:        { type: "string", description: "YYYY-MM-DD." },
          description: { type: "string" },
          paymentMethod: { type: "string", enum: ["venmo", "cash", "check", "invoice"], description: "Optional. Only include if the user mentions how it was paid." },
          paidTo:      { type: "string", description: "Optional. Only include if the user names a payee." },
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
// Tool-arg validation
//
// Walks the JSON Schema already declared in TOOLS (so there's no second
// source of truth) and checks enums, primitive types, and numeric bounds. On
// failure we return a structured error instead of dispatching — the chat
// route surfaces that error to the model as the tool result, and the model
// self-corrects on the next iteration of the existing tool-call loop.
//
// Intentionally lenient on unknown properties: the model sometimes adds
// harmless extras, and rejecting them just burns an iteration.
// ────────────────────────────────────────────────────────────────────────────

type JsonSchema = {
  type?: string;
  enum?: readonly unknown[];
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  description?: string;
};

function getToolSchema(name: string): JsonSchema | null {
  for (const t of TOOLS) {
    if (t.type === "function" && t.function.name === name) {
      return (t.function.parameters as JsonSchema) ?? null;
    }
  }
  return null;
}

function typeMatches(value: unknown, expected: string): boolean {
  switch (expected) {
    case "string":  return typeof value === "string";
    case "number":  return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "object":  return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":   return Array.isArray(value);
    default:        return true;
  }
}

export function validateArgs(toolName: string, args: ToolArgs): { ok: true } | { ok: false; error: string } {
  const schema = getToolSchema(toolName);
  if (!schema || !schema.properties) return { ok: true };

  // Required-field check first — the rest of the validation assumes presence.
  for (const key of schema.required ?? []) {
    if (args[key] === undefined || args[key] === null) {
      return { ok: false, error: `${toolName}: missing required field "${key}".` };
    }
  }

  for (const [key, propSchemaRaw] of Object.entries(schema.properties)) {
    const value = args[key];
    if (value === undefined || value === null) continue; // optional & absent

    const propSchema = propSchemaRaw as JsonSchema;

    if (propSchema.type && !typeMatches(value, propSchema.type)) {
      return {
        ok: false,
        error: `${toolName}.${key}: expected ${propSchema.type}, got ${typeof value} (${JSON.stringify(value)}).`,
      };
    }

    if (propSchema.enum && !propSchema.enum.includes(value)) {
      return {
        ok: false,
        error: `${toolName}.${key}: must be one of [${propSchema.enum.map(v => JSON.stringify(v)).join(", ")}] — got ${JSON.stringify(value)}.`,
      };
    }

    if (typeof value === "number") {
      if (propSchema.minimum !== undefined && value < propSchema.minimum) {
        return { ok: false, error: `${toolName}.${key}: must be ≥ ${propSchema.minimum}, got ${value}.` };
      }
      if (propSchema.maximum !== undefined && value > propSchema.maximum) {
        return { ok: false, error: `${toolName}.${key}: must be ≤ ${propSchema.maximum}, got ${value}.` };
      }
    }
  }

  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Read-tool handlers
// ────────────────────────────────────────────────────────────────────────────

type ToolArgs = Record<string, unknown>;
type ToolResult = unknown;

async function listBrothers(args: ToolArgs, orgId: number): Promise<ToolResult> {
  // Sort at the DB layer for the ranking case; status filter is post-computed so
  // we always fetch the full set first, then trim.
  const orderByField = typeof args.order_by === "string"
    && ["attendance", "gpa", "duesOwed", "serviceHours", "name"].includes(args.order_by)
    ? args.order_by as "attendance" | "gpa" | "duesOwed" | "serviceHours" | "name"
    : "name";
  const orderDir = args.order === "desc" ? "desc" : "asc";

  const rows = await prisma.brother.findMany({
    where: { isGhost: false, organizationId: orgId },
    orderBy: { [orderByField]: orderDir },
  });
  const owesOnly = args.owes_dues_only === true;
  const statusFilter = typeof args.status === "string" ? args.status : "Any";

  const mapped = rows
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

  // Apply limit AFTER filtering so ranking + filtering compose cleanly.
  return mapped.slice(0, clampLimit(args.limit));
}

async function getBrother(args: ToolArgs, orgId: number): Promise<ToolResult> {
  const id = typeof args.id === "number" ? args.id : undefined;
  const name = typeof args.name === "string" ? args.name.trim() : undefined;
  if (id == null && !name) return { error: "Provide id or name." };

  // ID path → single record
  if (id != null) {
    const b = await prisma.brother.findFirst({ where: { id, organizationId: orgId } });
    if (!b || b.isGhost) return { error: "Brother not found." };
    return formatBrotherDetail(b);
  }

  // Name path → fuzzy. Try exact (case-insensitive) first; fall back to
  // substring "contains" so "Bryan" finds "Bryan Lee". Return multiple matches
  // if found so the model can disambiguate.
  const exact = await prisma.brother.findMany({
    where: { name: { equals: name!, mode: "insensitive" }, isGhost: false, organizationId: orgId },
  });
  const matches = exact.length > 0
    ? exact
    : await prisma.brother.findMany({
        where: { name: { contains: name!, mode: "insensitive" }, isGhost: false, organizationId: orgId },
        orderBy: { name: "asc" },
        take: 10,
      });

  if (matches.length === 0) return { error: `No brother matched "${name}".` };
  if (matches.length > 1) {
    return {
      matches: matches.length,
      note: "Multiple brothers match — narrow by id, or ask the user which one.",
      candidates: matches.map(b => ({ id: b.id, name: b.name, role: b.role })),
    };
  }
  return formatBrotherDetail(matches[0]);
}

async function formatBrotherDetail(b: { id: number; name: string; role: string; attendance: number; gpa: number; duesOwed: number; serviceHours: number; isAdmin: boolean; email: string | null; isGhost: boolean }) {
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

async function listDeadlines(args: ToolArgs, orgId: number): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const status = typeof args.status === "string" ? args.status : undefined;
  const openOnly = args.open_only === true;
  const orderByField = typeof args.order_by === "string" && ["dueDate", "title", "owner"].includes(args.order_by)
    ? args.order_by as "dueDate" | "title" | "owner" : "dueDate";
  const orderDir = args.order === "desc" ? "desc" : "asc";

  const rows = await prisma.deadline.findMany({ where: { organizationId: orgId }, orderBy: { [orderByField]: orderDir } });
  const filtered = rows
    .filter(d => (start ? d.dueDate >= start : true))
    .filter(d => (end   ? d.dueDate <= end   : true))
    .filter(d => (status ? d.status === status : true))
    .filter(d => (openOnly ? d.status !== "Complete" : true));
  return filtered.slice(0, clampLimit(args.limit));
}

async function listInstagram(args: ToolArgs, orgId: number): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const status = typeof args.status === "string" ? args.status : undefined;
  const typeFilter = typeof args.type === "string" ? args.type : undefined;
  const openOnly = args.open_only === true;
  const orderByField = typeof args.order_by === "string" && ["dueDate", "title", "owner"].includes(args.order_by)
    ? args.order_by as "dueDate" | "title" | "owner" : "dueDate";
  const orderDir = args.order === "desc" ? "desc" : "asc";

  const rows = await prisma.instagramTask.findMany({ where: { organizationId: orgId }, orderBy: { [orderByField]: orderDir } });
  const filtered = rows
    .filter(t => (start ? t.dueDate >= start : true))
    .filter(t => (end   ? t.dueDate <= end   : true))
    .filter(t => (status ? t.status === status : true))
    .filter(t => (typeFilter ? t.type === typeFilter : true))
    .filter(t => (openOnly ? t.status !== "Complete" : true));
  return filtered.slice(0, clampLimit(args.limit));
}

async function listCalendar(args: ToolArgs, orgId: number): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const category = typeof args.category === "string" ? args.category : undefined;
  const mandatoryOnly = args.mandatory_only === true;
  const orderByField = typeof args.order_by === "string" && ["date", "title"].includes(args.order_by)
    ? args.order_by as "date" | "title" : "date";
  const orderDir = args.order === "desc" ? "desc" : "asc";

  const rows = await prisma.calendarEvent.findMany({ where: { organizationId: orgId }, orderBy: { [orderByField]: orderDir } });
  const filtered = rows
    .filter(e => (start ? e.date >= start : true))
    .filter(e => (end   ? e.date <= end   : true))
    .filter(e => (category ? e.category === category : true))
    .filter(e => (mandatoryOnly ? e.mandatory : true));
  return filtered.slice(0, clampLimit(args.limit));
}

async function listParties(args: ToolArgs, orgId: number): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const completedOnly = args.completed_only === true;
  const orderByField = typeof args.order_by === "string" && ["date", "doorRevenue", "attendance", "expenses", "name"].includes(args.order_by)
    ? args.order_by as "date" | "doorRevenue" | "attendance" | "expenses" | "name" : "date";
  const orderDir = args.order === "desc" ? "desc" : "asc";

  const rows = await prisma.partyEvent.findMany({ where: { organizationId: orgId }, orderBy: { [orderByField]: orderDir } });
  const filtered = rows
    .filter(p => (start ? p.date >= start : true))
    .filter(p => (end   ? p.date <= end   : true))
    .filter(p => (completedOnly ? p.completed : true))
    .map(p => ({
      id: p.id, name: p.name, date: p.date, partyType: p.partyType, theme: p.theme,
      doorRevenue: r2(p.doorRevenue), expenses: r2(p.expenses),
      attendance: p.attendance, completed: p.completed,
    }));
  return filtered.slice(0, clampLimit(args.limit));
}

async function sumTransactions(args: ToolArgs, orgId: number): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const semester = typeof args.semester === "string" ? args.semester : undefined;
  const category = typeof args.category === "string" ? args.category : undefined;
  const typeFilter = args.type_filter === "income" || args.type_filter === "expense" ? args.type_filter : undefined;

  const rows = await prisma.transaction.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      ...(start || end ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
      ...(semester ? { semester } : {}),
      ...(category ? { category } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
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

  // Sort grouped output by the relevant total descending so "top categories" is
  // the obvious first row, no further work needed from the model.
  let grouped: Array<{ category: string; income: number; expense: number; total: number }> | undefined;
  if (args.group_by_category) {
    grouped = Object.entries(byCategory)
      .map(([k, v]) => ({
        category: k,
        income: r2(v.income),
        expense: r2(v.expense),
        // "total" = the metric this query is about (expense if filtered to expense, else income+expense)
        total: r2(typeFilter === "income" ? v.income : typeFilter === "expense" ? v.expense : v.income + v.expense),
      }))
      .sort((a, b) => b.total - a.total);
  }

  return {
    filters: { start, end, semester, category, type: typeFilter },
    totals: { income: r2(income), expense: r2(expense), net: r2(income - expense), count: rows.length },
    ...(grouped ? { byCategory: grouped } : {}),
  };
}

async function getTreasury(orgId: number): Promise<ToolResult> {
  const [parties, transactions] = await Promise.all([
    prisma.partyEvent.findMany({ where: { organizationId: orgId }, select: { doorRevenue: true } }),
    prisma.transaction.findMany({
      where: { organizationId: orgId, deletedAt: null }, orderBy: { date: "desc" }, take: 10,
      select: { date: true, type: true, amount: true, category: true, description: true },
    }),
  ]);
  const allTx = await prisma.transaction.findMany({
    where: { organizationId: orgId, deletedAt: null }, select: { type: true, amount: true },
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

async function getBudget(orgId: number): Promise<ToolResult> {
  // Active semester is the one flagged isActive (matches the rest of the app).
  // Fall back to the most recent semester so the model still has a useful answer.
  let semester = await prisma.semester.findFirst({ where: { isActive: true, organizationId: orgId } });
  let usedFallback = false;
  if (!semester) {
    semester = await prisma.semester.findFirst({ where: { organizationId: orgId }, orderBy: { startDate: "desc" } });
    if (!semester) return { error: "No semesters defined yet." };
    usedFallback = true;
  }
  const budget = await prisma.budget.findFirst({
    where: { organizationId: orgId, semester: semester.label },
    include: { allocations: true },
  });
  if (!budget) return {
    semester: semester.label,
    isActiveSemester: !usedFallback,
    message: usedFallback
      ? `No active semester; latest is ${semester.label} but no budget is defined for it.`
      : "No budget defined for the active semester.",
  };

  // Pull actuals per category for this semester
  const txs = await prisma.transaction.findMany({
    where: { organizationId: orgId, deletedAt: null, semester: semester.label },
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
    isActiveSemester: !usedFallback,
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

async function recentActivity(args: ToolArgs, orgId: number): Promise<ToolResult> {
  const take = clampLimit(args.limit, 20, 100);
  const typeFilter = args.type === "success" || args.type === "warning" || args.type === "info" ? args.type : undefined;
  const rows = await prisma.activityLog.findMany({
    where: { organizationId: orgId, ...(typeFilter ? { type: typeFilter } : {}) },
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

async function weeklyDigest(orgId: number): Promise<ToolResult> {
  const { start, end } = isoWeekBoundsServer(new Date());
  const inWeek = (iso: string) => iso >= start && iso <= end;
  const [deadlines, ig, events, parties, brothers] = await Promise.all([
    prisma.deadline.findMany({ where: { organizationId: orgId } }),
    prisma.instagramTask.findMany({ where: { organizationId: orgId } }),
    prisma.calendarEvent.findMany({ where: { organizationId: orgId, mandatory: true } }),
    prisma.partyEvent.findMany({ where: { organizationId: orgId } }),
    prisma.brother.findMany({ where: { organizationId: orgId, isGhost: false } }),
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
// existing auth (requireUser / requireAdmin) decides if
// the write actually happens.
// ────────────────────────────────────────────────────────────────────────────

function badProposal(reason: string): { error: string } { return { error: reason }; }

function proposeAddDeadline(args: ToolArgs): Proposal | { error: string } {
  const title = String(args.title ?? "").trim();
  const dueDate = String(args.dueDate ?? "").trim();
  const owner = String(args.owner ?? "").trim();
  const rawStatus = typeof args.status === "string" ? args.status.trim() : "";
  const status = rawStatus || "Upcoming";
  if (!title || !dueDate || !owner) return badProposal("Missing required fields.");
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
  const rawStatus = typeof args.status === "string" ? args.status.trim() : "";
  const status = rawStatus || "Upcoming";
  const type = String(args.type ?? "").trim();
  if (!title || !dueDate || !owner || !type) return badProposal("Missing required fields.");
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
  if (!title || !date || !category) return badProposal("Missing required fields.");
  if (!DATE_RE.test(date)) return badProposal("date must be YYYY-MM-DD.");
  if (!(CAL_CATEGORIES as readonly string[]).includes(category)) return badProposal(`category must be one of ${CAL_CATEGORIES.join(", ")}.`);
  // mandatory is optional: default true for chapter (which must be mandatory anyway), false otherwise.
  const mandatory = typeof args.mandatory === "boolean" ? args.mandatory : category === "chapter";
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
  const v = validateArgs(name, args);
  if (!v.ok) return { error: v.error };
  try { return handler(args); }
  catch (e) { return { error: e instanceof Error ? e.message : "Proposal failed" }; }
}

// ────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ────────────────────────────────────────────────────────────────────────────

const READ_HANDLERS: Record<string, (args: ToolArgs, orgId: number) => Promise<ToolResult>> = {
  list_brothers:        listBrothers,
  get_brother:          getBrother,
  list_deadlines:       listDeadlines,
  list_instagram_tasks: listInstagram,
  list_calendar_events: listCalendar,
  list_parties:         listParties,
  sum_transactions:     sumTransactions,
  get_treasury:         (_args, orgId) => getTreasury(orgId),
  get_budget:           (_args, orgId) => getBudget(orgId),
  recent_activity:      recentActivity,
  weekly_digest:        (_args, orgId) => weeklyDigest(orgId),
};

/**
 * Run a read tool and return its result (will be JSON-stringified and fed back
 * to the model as a `tool` message). On any failure, returns an `{error}` object
 * the model can react to, rather than throwing — keeps the chat loop alive.
 */
export async function runTool(name: string, args: ToolArgs, orgId: number): Promise<ToolResult> {
  const handler = READ_HANDLERS[name];
  if (!handler) return { error: `Unknown tool: ${name}` };
  const v = validateArgs(name, args);
  if (!v.ok) return { error: v.error };
  try {
    return await handler(args, orgId);
  } catch (e) {
    console.error(`runTool(${name}) failed:`, e);
    return { error: e instanceof Error ? e.message : "Tool failed" };
  }
}

/** True when the tool name is one the server should execute (read tool). */
export function isReadTool(name: string): boolean {
  return name in READ_HANDLERS;
}
