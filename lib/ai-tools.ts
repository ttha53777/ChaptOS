/**
 * Tool surface exposed to the chatbot (CHAT_MODEL via /api/ai/chat).
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
import { db } from "@/lib/db";
import type { RosterRow } from "@/lib/db/tenant";
import { isoWeekBounds, todayISO, DATE_RE } from "@/lib/dates";
import { getBrotherStatus, type Brother as BrotherType } from "@/app/data";
import { fmtUsd as fmtMoney, money } from "@/lib/money";
import { resolveThresholds, type Thresholds } from "@/lib/thresholds";
import { netBalance } from "@/lib/treasury-balance";
import { isProgrammingManagedType } from "@/lib/programming";
import { ownerLabel, resolveOwner, type OwnerRow } from "@/lib/event-owner";
import { INSTAGRAM_TYPES } from "@/lib/validation/instagram";
import { hasPermission, type Permission } from "@/lib/permissions";
import { signProposalBlob } from "@/lib/ai-approval-sig";
import { findPermHolders, type PermHolders } from "@/lib/permission-holders";
import { getMetricStatus } from "@/lib/metrics";
import { sanitizeFieldDefs, type CustomMemberFieldDef } from "@/lib/custom-member-fields";

/**
 * Org-scoped data accessor (the same shape as ctx.db). Every tool handler reads
 * through this instead of the raw prisma client so tenant scoping is structural,
 * not per-query discipline — and so reads set app.org_id once RLS enforcement
 * (Phase 2) lands. The route builds it once from the request context and threads
 * it through runTool/runProposal. `orgId` is still passed alongside for cache
 * keys (orgThresholds) where the numeric id, not the client, is the key.
 */
type Scoped = ReturnType<typeof db>;

/**
 * Resolve the org's member-status thresholds so the assistant reports the same
 * At-Risk/Watch status the dashboard shows. Reads the shared OrganizationConfig
 * row (set in Settings → Thresholds); falls back to the app defaults when the
 * org hasn't customized them.
 *
 * Cached 5 min per org (same policy as the semester line in lib/ai-prompt.ts):
 * thresholds change rarely, but every list_brothers / weekly_digest call needs
 * them — caching drops a DB round trip from most chat turns. A threshold edit
 * takes ≤5 min to reach the assistant; the dashboard itself is unaffected.
 */
const thresholdsCache = new Map<number, { value: Thresholds; expires: number }>();

async function orgThresholds(scoped: Scoped, orgId: number): Promise<Thresholds> {
  const now = Date.now();
  const cached = thresholdsCache.get(orgId);
  if (cached && cached.expires > now) return cached.value;
  const config = await scoped.organizationConfig.find();
  const value = resolveThresholds(config?.thresholds);
  thresholdsCache.set(orgId, { value, expires: now + 5 * 60 * 1000 });
  return value;
}

// ────────────────────────────────────────────────────────────────────────────
// Tool schemas (OpenAI Chat Completions tool format)
// ────────────────────────────────────────────────────────────────────────────

/** The chapter surface a proposal writes to — drives approvals filters + card glyphs. */
export const PROPOSAL_KINDS = ["timeline", "instagram", "events", "treasury", "dues", "programming", "excuse", "reimbursement", "service", "poll"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

/** One key/value line on the writ card (and, verbatim, in the approval record). */
export interface DisplayRow { k: string; v: string; em?: boolean }

/** Server-built card content — what the writ card shows and the audit row stores. */
export interface ProposalDisplay {
  kind: ProposalKind;
  title: string;        // "Record a dues payment"
  rows: DisplayRow[];
}

/**
 * The authority a proposal runs under, resolved against the calling member.
 * The permission gates BOTH proposing and approving: a holder self-approves;
 * a non-holder's draft is blocked (not routed), with `holders` naming who in
 * this org does hold it so the model/UI can point them the right way.
 *
 * `name: null` marks a SELF-SERVICE action — one any member may take on their
 * own record (file an excuse, log their hours). It needs no permission, is
 * never blocked, and is not filed in the Approvals record: that record audits
 * officer authority exercised through chat, and a member acting for themselves
 * exercised none. The target endpoint pins the write to ctx.actorId itself.
 */
export interface ProposalPerm {
  name: Permission | null;
  label: string;        // human label, e.g. "Manage dues"
  canApprove: boolean;
  holders?: PermHolders;
}

// Shapes the proposal payload sent over SSE to the client.
export interface Proposal {
  kind: "proposal";
  action: string;       // tool name, e.g. "propose_add_deadline"
  endpoint: string;     // /api/deadlines etc.
  method: "POST" | "PATCH";
  payload: Record<string, unknown>;
  summary: string;      // human-readable one-liner for the confirm card
  display: ProposalDisplay;
  perm: ProposalPerm;
  /**
   * HMAC over {action,endpoint,method,payload,display,perm,orgId,actorId,iat}
   * (see lib/ai-approval-sig.ts). The client echoes blob+sig back when the
   * approved action is recorded, so the audit row can't be client-forged.
   * Null when no signing key is configured — the card still works; only the
   * approval record is skipped.
   */
  sig: string | null;
  iat: number;
}

/** What a proposal handler returns: everything above except the authority/signature, which runProposal resolves. */
type ProposalDraft = Omit<Proposal, "display" | "perm" | "sig" | "iat"> & { rows: DisplayRow[] };

/** The slice of RequestContext runProposal needs — the eval harness fabricates one. */
export interface ProposalCtx {
  /**
   * Everything the user typed this conversation. Self-service builders refuse a
   * dollar/hour figure that doesn't appear in it. Undefined skips that check
   * (the eval harness, the event-idea panel).
   */
  userText?: string;
  orgId: number;
  actorId: number;
  permissions: number;
  isOrgAdmin: boolean;
  isPlatformAdmin: boolean;
}

/**
 * Per-proposal authority + card identity. `perm` mirrors the requirePerm of the
 * endpoint the payload targets (verified against each app/api route) — if a
 * route's gate changes, change it here too. `label` is the human name the writ
 * card and gate copy use; two tools may share a bit but read differently
 * ("Manage dues" vs "Manage treasury" are both MANAGE_TREASURY).
 */
export const PROPOSAL_META: Record<string, { perm: Permission | null; label: string; kind: ProposalKind; title: string }> = {
  propose_add_deadline:          { perm: "MANAGE_TASKS",     label: "Manage timeline",  kind: "timeline",    title: "Add a deadline" },
  propose_add_instagram_task:    { perm: "MANAGE_INSTAGRAM", label: "Manage Instagram", kind: "instagram",   title: "Add an Instagram task" },
  propose_add_calendar_event:    { perm: "MANAGE_EVENTS",    label: "Manage events",    kind: "events",      title: "Add a calendar event" },
  propose_log_transaction:       { perm: "MANAGE_TREASURY",  label: "Manage treasury",  kind: "treasury",    title: "Log a transaction" },
  propose_record_dues_payment:   { perm: "MANAGE_TREASURY",  label: "Manage dues",      kind: "dues",        title: "Record a dues payment" },
  propose_add_programming_event: { perm: "MANAGE_EVENTS",    label: "Manage events",    kind: "programming", title: "Add a programming event" },
  // Self-service (perm null — see ProposalPerm). Each endpoint writes only the
  // caller's own row, so the draft never needs anyone else's authority.
  propose_submit_excuse:         { perm: null, label: "Just you", kind: "excuse",        title: "Submit an excuse" },
  propose_request_reimbursement: { perm: null, label: "Just you", kind: "reimbursement", title: "Request a reimbursement" },
  propose_log_my_service_hours:  { perm: null, label: "Just you", kind: "service",       title: "Log your service hours" },
  propose_complete_task:         { perm: null, label: "Just you", kind: "timeline",      title: "Mark a task done" },
  propose_cast_vote:             { perm: null, label: "Just you", kind: "poll",          title: "Cast your vote" },
};

const IG_TYPES = INSTAGRAM_TYPES;
const TX_TYPES = ["income", "expense"] as const;
const PROGRAMMING_STAGES = ["idea", "planning", "confirmed", "done"] as const;

// Event types are per-org rows (CalendarEventType) — no fixed enum anymore.
// Tool schemas take a free-form type/category and handlers resolve it against
// the org's rows (matching either the slug or the display label).
type OrgEventType = { slug: string; label: string; creatable: boolean; hidden: boolean };

async function orgEventTypes(scoped: Scoped): Promise<OrgEventType[]> {
  return await scoped.calendarEventType.findMany({
    select: { slug: true, label: true, creatable: true, hidden: true },
  }) as OrgEventType[];
}

/** Resolve a user/model-supplied type string to a row by slug or label. */
function resolveEventType(types: OrgEventType[], raw: string): OrgEventType | undefined {
  const needle = raw.trim().toLowerCase();
  return types.find(t => t.slug === needle) ?? types.find(t => t.label.toLowerCase() === needle);
}

function describeTypes(types: OrgEventType[]): string {
  return types.map(t => t.slug).join(", ");
}

export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_brothers",
      description:
        "List active brothers (ghosts excluded) with attendance %, GPA, dues owed, service hours, and computed status. " +
        "The response includes a `summary` (count, totalDuesOwed, owingCount, avgAttendance, avgGpa, totalServiceHours) computed over ALL matching rows — " +
        "use those exact figures for aggregate questions (\"how much is owed in total\", \"average attendance\") instead of summing rows yourself. " +
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
        "Chapter deadlines: dated tasks (title, dueDate, status, assignees). Status is open or done. " +
        "Urgency ('urgent', 'due soon') is NOT a stored status — it's how close dueDate is, so ask for it with a date window, not a status filter. " +
        "For 'soonest/next/closest' set start=<today> (overdue isn't 'next'), order_by='dueDate', order='asc', small limit. " +
        "For 'most overdue' filter to past dates and sort asc. " +
        "For 'what's left/outstanding' set open_only=true.",
      parameters: {
        type: "object",
        properties: {
          start:  { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:    { type: "string", description: "Inclusive YYYY-MM-DD end." },
          status: { type: "string", description: '"open" or "done".' },
          open_only: { type: "boolean", description: "Only incomplete (open) tasks (default false)." },
          order_by:  { type: "string", enum: ["dueDate", "title"], description: "Sort field (default dueDate)." },
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
        "Instagram content tasks (title, dueDate, status, type). Status is open or posted. " +
        "Urgency ('urgent', 'due soon') is NOT a stored status — it's how close dueDate is, so ask for it with a date window, not a status filter. " +
        "For 'next/soonest' set start=<today> (overdue tasks aren't 'next'), order_by='dueDate', asc, small limit.",
      parameters: {
        type: "object",
        properties: {
          start:  { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:    { type: "string", description: "Inclusive YYYY-MM-DD end." },
          status: { type: "string", description: '"open" or "posted".' },
          type:   { type: "string", description: "Story | Reel | Carousel." },
          open_only: { type: "boolean", description: "Exclude posted tasks." },
          order_by:  { type: "string", enum: ["dueDate", "title"], description: "Sort field (default dueDate)." },
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
        "For 'most recent past event' set end=<today>, order='desc', limit=5. " +
        "For 'when is X?' pass title=<fragment> with NO date range — searching by name beats guessing a date window. " +
        "For a bare day like 'the 14th' pass day_of_month=14 with NO start/end — it matches that day in EVERY month.",
      parameters: {
        type: "object",
        properties: {
          title:    { type: "string", description: "Title fragment (case-insensitive contains). Use for 'when is X' lookups." },
          day_of_month: { type: "integer", minimum: 1, maximum: 31, description: "Match events on this day in ANY month. Use for bare dates ('the 14th')." },
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
  {
    type: "function",
    function: {
      name: "get_event_attendance",
      description:
        "Attendance for one calendar event: who attended, who was absent, and who has an excuse. " +
        "Identify the event by id, or by an event_name fragment (case-insensitive) plus optional date to disambiguate. " +
        "Use this for 'who missed last chapter?', 'who showed up to the car wash?', 'who's excused from the meeting?'. " +
        "For 'last chapter meeting', the system prompt gives its date — pass event_name='Chapter Meeting' with that date.",
      parameters: {
        type: "object",
        properties: {
          id:         { type: "integer", description: "Calendar event id (preferred when known)." },
          event_name: { type: "string", description: "Event title or fragment (case-insensitive). Used when id is unknown." },
          date:       { type: "string", description: "YYYY-MM-DD to disambiguate when multiple events share a name." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_brother_attendance",
      description:
        "One brother's attendance detail this semester: counts of events attended / missed / excused, plus the list of missed events with any excuse reason. " +
        "Identify the brother by id or by a name fragment (same matching as get_brother). " +
        "Use for 'how many meetings has X missed?', 'what's X's attendance record?', 'is X's absence excused?'.",
      parameters: {
        type: "object",
        properties: {
          id:   { type: "integer", description: "Brother id." },
          name: { type: "string", description: "Full name or any fragment (case-insensitive)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_roles",
      description:
        "Officer roles in this org and who holds each (e.g. President, Treasurer, Social, PR). " +
        "Use for 'who's the treasurer?', 'who are our officers?', 'what role does X have?'. " +
        "Pass role_name to look up holders of one role; pass brother_name to list one brother's roles; omit both to list all roles.",
      parameters: {
        type: "object",
        properties: {
          role_name:    { type: "string", description: "Filter to one role by name fragment (e.g. 'treasurer')." },
          brother_name: { type: "string", description: "Filter to the roles held by one brother (name fragment)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_service_events",
      description:
        "The dedicated community-service list (title, date, location, notes). " +
        "NOT exhaustive: service events also appear on the calendar (category 'service') and the programming board (type 'Community Service'), sometimes filed under other categories — " +
        "for service questions, also call list_calendar_events / list_programming_events (category/type filter or a title fragment like 'service') in the same turn. " +
        "For 'next/upcoming service' set start=<today>, order='asc', small limit. " +
        "If a date-filtered query returns empty, broaden before saying there's none.",
      parameters: {
        type: "object",
        properties: {
          start: { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:   { type: "string", description: "Inclusive YYYY-MM-DD end." },
          order: { type: "string", enum: ["asc", "desc"], description: "Sort by date (default asc)." },
          limit: { type: "integer", minimum: 1, maximum: 100, description: "Default 100; use ~5 for 'next'." },
        },
      },
    },
  },
  // ── Blind-spot reads: org data the tools above don't reach ──
  // Descriptions are deliberately short — every schema rides in the tools array
  // on every loop iteration. Member rows come back as {id, name} so answer rows
  // resolve to a peekable member (lib/ai-refs).
  {
    type: "function",
    function: {
      name: "get_custom_metrics",
      description:
        "The chapter's own custom metrics (e.g. study hours, workouts) — defined in Settings, separate from attendance/GPA/dues/service. " +
        "No metric → one summary per metric (goal, average/total, on-track / watch / at-risk / not-recorded counts). " +
        "metric=<name fragment> → also that metric's members; add status to filter (e.g. 'who's behind on study hours' → status='at_risk', order='asc').",
      parameters: {
        type: "object",
        properties: {
          metric: { type: "string", description: "Metric name or fragment. Omit for the overview of every metric." },
          status: { type: "string", enum: ["at_risk", "watch", "on_track", "missing"], description: "Member filter (needs metric). missing = no value recorded." },
          order:  { type: "string", enum: ["asc", "desc"], description: "Sort members by value (default asc = lowest first)." },
          limit:  { type: "integer", minimum: 1, maximum: 100, description: "Max members (default 25)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_member_fields",
      description:
        "The chapter's custom roster fields (e.g. Pledge Class, Major, Shirt Size, Waiver) and members' values. " +
        "No field → the field list with how many members have filled each in. " +
        "field=<name> → members and their value; value=<fragment> filters ('who's in the Fall 24 class'); missing_only=true finds who hasn't filled it in.",
      parameters: {
        type: "object",
        properties: {
          field:        { type: "string", description: "Field label or fragment." },
          value:        { type: "string", description: "Value fragment to match (case-insensitive)." },
          missing_only: { type: "boolean", description: "Only members with no value for field." },
          limit:        { type: "integer", minimum: 1, maximum: 100, description: "Max members (default 100)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_polls",
      description:
        "Chapter polls: question, status (open/closed), close date, per-option vote counts, and turnout. " +
        "Results are hidden (sealed) on open polls the asker hasn't voted in unless they manage polls — say so rather than guessing. " +
        "Poll managers also get `notVoted` names ('who hasn't voted?').",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "Question fragment (case-insensitive)." },
          status:   { type: "string", enum: ["open", "closed"] },
          limit:    { type: "integer", minimum: 1, maximum: 50, description: "Default 10, newest first." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reimbursements",
      description:
        "Reimbursement requests members filed (who, amount, date, description, category, status pending/approved/rejected). " +
        "`summary` has exact totals over ALL matches (e.g. pendingTotal) — use it instead of adding rows. " +
        "'What do we owe people back?' → status='pending'.",
      parameters: {
        type: "object",
        properties: {
          status:   { type: "string", enum: ["pending", "approved", "rejected"] },
          member:   { type: "string", description: "Member name fragment." },
          start:    { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:      { type: "string", description: "Inclusive YYYY-MM-DD end." },
          order_by: { type: "string", enum: ["date", "amount"], description: "Default date." },
          order:    { type: "string", enum: ["asc", "desc"], description: "Default desc." },
          limit:    { type: "integer", minimum: 1, maximum: 100, description: "Default 25." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dues_payments",
      description:
        "Dues payment HISTORY (who paid, amount, date, method, status pending/approved/rejected) — list_brothers only has the current balance owed. " +
        "Use for 'when did X last pay?', 'payments awaiting approval', 'how much dues came in this month'. " +
        "Treasury managers see everyone; other members see only their own payments. `summary` holds exact totals.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "approved", "rejected"] },
          member: { type: "string", description: "Member name fragment." },
          start:  { type: "string", description: "Inclusive YYYY-MM-DD start." },
          end:    { type: "string", description: "Inclusive YYYY-MM-DD end." },
          order:  { type: "string", enum: ["asc", "desc"], description: "By date, default desc (latest first)." },
          limit:  { type: "integer", minimum: 1, maximum: 100, description: "Default 25." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_docs",
      description:
        "Search the chapter's Docs library (links to bylaws, forms, sheets, policies) by title, description, or folder name. " +
        "Returns title, url, folder, description. Omit query to list pinned + most recent docs.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Word or phrase, e.g. 'bylaws', 'risk'. Short fragments match best." },
          limit: { type: "integer", minimum: 1, maximum: 25, description: "Default 10." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_announcement",
      description: "The chapter announcement currently pinned for all members (title, body, link, who posted it, when).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_join_requests",
      description:
        "People who asked to join via an invite link and are waiting on officer review (name, email, requested date). " +
        "Default status is pending. Requires the Manage members permission.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "approved", "rejected"], description: "Default pending." },
          limit:  { type: "integer", minimum: 1, maximum: 100, description: "Default 50." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_attendance_exemptions",
      description:
        "Members exempted from attendance this semester (abroad, co-op, inactive, other) and why. Explains low or missing attendance numbers. " +
        "Requires the Manage attendance permission.",
      parameters: {
        type: "object",
        properties: {
          member: { type: "string", description: "Member name fragment." },
        },
      },
    },
  },
  // ── Write proposals (server validates and returns a confirm card; never executes) ──
  {
    type: "function",
    function: {
      name: "propose_add_deadline",
      description:
        "Propose adding a chapter deadline (a dated task). Returns a confirm card — it is NOT created until the user clicks Confirm. " +
        "Use when the user asks to add or schedule a deadline. A task MUST be assigned to at least one member or role: resolve the owner's name to an id first with list_brothers (member) or list_roles (role), then pass assigneeBrotherId or assigneeRoleId. " +
        "dueDate is required here (a deadline is a dated task).",
      parameters: {
        type: "object",
        properties: {
          title:            { type: "string", description: "Short descriptive title." },
          dueDate:          { type: "string", description: "YYYY-MM-DD." },
          assigneeBrotherId:{ type: "integer", description: "Member id responsible (from list_brothers). Provide this OR assigneeRoleId." },
          assigneeRoleId:   { type: "integer", description: "Role id responsible (from list_roles). Provide this OR assigneeBrotherId." },
          notes:            { type: "string", description: "Optional free-text note / extra detail for the deadline." },
        },
        required: ["title", "dueDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_add_instagram_task",
      description:
        "Propose adding an Instagram content task (story, reel, or carousel). Returns a confirm card; the task is NOT created until confirmed. " +
        "Only ask the user for the required fields (title, dueDate, type). New posts start 'open'; there is no status to set.",
      parameters: {
        type: "object",
        properties: {
          title:   { type: "string" },
          dueDate: { type: "string", description: "YYYY-MM-DD." },
          type:    { type: "string", enum: [...IG_TYPES], description: "Content format." },
        },
        required: ["title", "dueDate", "type"],
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
          category:    { type: "string", description: "Event-type slug or name. Types are per-chapter; 'chapter' and 'service' are built-ins, and many chapters have their own (e.g. 'social', 'fundy', 'program'). An unknown type is rejected with the valid list." },
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
        "Only ask the user for the required fields (type, category, amount, date, description). Do NOT ask for paymentMethod — that is optional.",
      parameters: {
        type: "object",
        properties: {
          type:        { type: "string", enum: [...TX_TYPES] },
          category:    { type: "string" },
          amount:      { type: "number", description: "Non-negative dollars." },
          date:        { type: "string", description: "YYYY-MM-DD." },
          description: { type: "string" },
          paymentMethod: { type: "string", enum: ["venmo", "cash", "check", "invoice"], description: "Optional. Only include if the user mentions how it was paid." },
        },
        required: ["type", "category", "amount", "date", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_record_dues_payment",
      description:
        "Propose recording a dues payment from a brother. On confirm this only STAGES the payment as a pending request — it does not post to the treasury ledger or change what the brother owes. A treasurer must separately approve the request (on the Treasury page) before either book moves; that approval is the one atomic operation, not this confirm. Returns a confirm card; nothing is changed until confirmed, and nothing posts until approved after that. Defaults to paying off their full outstanding balance; pass amount for a partial payment. Requires treasury authority to confirm. Do NOT use this to waive or correct a balance where no money changed hands.",
      parameters: {
        type: "object",
        properties: {
          brother_id:   { type: "integer", description: "Brother id. Use list_brothers or get_brother first to find it." },
          brother_name: { type: "string", description: "Provide the name too for the confirm card preview." },
          amount:       { type: "number",  description: "Optional. Dollars paid. Omit to pay off the full outstanding balance." },
        },
        required: ["brother_id", "brother_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_programming_events",
      description:
        "Programming board events (title, type, stage, date, owner, category). " +
        "Stages: idea → planning → confirmed → done. Types: Program, Social, Fundraiser, Community Service. " +
        "For 'upcoming programs' set start=<today>, order='asc', small limit. " +
        "For 'what's in planning?' filter by stage='planning'. " +
        "For 'what socials do we have?' filter by type='Social'. " +
        "For 'when is X?' / 'what stage is X at?' pass title=<fragment> with no date range. " +
        "If a filtered query returns empty, broaden before saying there are none.",
      parameters: {
        type: "object",
        properties: {
          title:    { type: "string", description: "Title fragment (case-insensitive contains). Use for lookups by name." },
          day_of_month: { type: "integer", minimum: 1, maximum: 31, description: "Match events on this day in ANY month. Use for bare dates ('the 14th')." },
          start:    { type: "string", description: "Inclusive YYYY-MM-DD start (filters by date)." },
          end:      { type: "string", description: "Inclusive YYYY-MM-DD end." },
          stage:    { type: "string", enum: [...PROGRAMMING_STAGES], description: "Filter by stage." },
          type:     { type: "string", description: "Filter by event type — a slug or display name from the chapter's event types (e.g. 'Community Service', 'social')." },
          order_by: { type: "string", enum: ["date", "title", "stage"], description: "Sort field (default date)." },
          order:    { type: "string", enum: ["asc", "desc"], description: "Default asc." },
          limit:    { type: "integer", minimum: 1, maximum: 100, description: "Default 100; use ~5 for 'next' or 'top'." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_add_programming_event",
      description:
        "Propose adding a programming event (program, social, fundraiser, or community service). Returns a confirm card; the event is NOT created until confirmed. " +
        "Only ask the user for the required fields (title, type). Omit date/owner/stage unless the user mentions them — defaults handle the rest.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short descriptive title." },
          type:  { type: "string", description: "Event type — a slug or display name from the chapter's event types (e.g. 'social', 'Fundraiser', 'Community Service'). An unknown type is rejected with the valid list." },
          date:  { type: "string", description: "Optional YYYY-MM-DD. Only include if the user mentions a date." },
          owner: { type: "string", description: "Optional brother name responsible. Only include if the user mentions one." },
        },
        required: ["title", "type"],
      },
    },
  },
  // ── Self-service proposals: any member, acting on their OWN record only ──
  // These take the user's OWN WORDS for the record ("chapter", "Thursday"), not
  // an id: the server matches them against what the asker can act on. That
  // saves the lookup round trip and leaves no id for the model to get wrong.
  {
    type: "function",
    function: {
      name: "propose_submit_excuse",
      description:
        "Submit the ASKER's own attendance excuse for an event they can't make or missed. Call this DIRECTLY — no lookup first; the server finds the event from `event` + `date`. " +
        "Returns a confirm card showing the matched event; nothing is filed until they confirm.",
      parameters: {
        type: "object",
        properties: {
          event:  { type: "string", description: "The event as the user named it, e.g. 'chapter', 'formal', 'study hours'." },
          date:   { type: "string", description: "YYYY-MM-DD of the event, if the user gave a day ('Thursday', 'last week's', 'the 14th') — resolve it against Today. Omit if they gave none (then the next upcoming match is used)." },
          reason: { type: "string", description: "Why, in the user's own words. If they gave none, ask for one line instead of calling." },
        },
        required: ["event", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_request_reimbursement",
      description:
        "Request reimbursement for money the ASKER spent on the chapter. Returns a confirm card; nothing is filed until they confirm, and a treasurer approves it afterwards. " +
        "amount must be the figure the user typed — if they didn't say how much, ask; never estimate.",
      parameters: {
        type: "object",
        properties: {
          amount:      { type: "number", description: "Dollars spent, exactly as the user stated." },
          description: { type: "string", description: "What it was for, e.g. 'Pizza for chapter'." },
          date:        { type: "string", description: "Optional YYYY-MM-DD of the purchase, only if the user named when. Defaults to today." },
        },
        required: ["amount", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_log_my_service_hours",
      description:
        "Log the ASKER's own hours for a service event. Call this DIRECTLY — no lookup first; the server finds the event from `event` + `date`. " +
        "This SETS their hours for that event (replacing any earlier entry). hours must be the number the user typed — if they didn't say, ask.",
      parameters: {
        type: "object",
        properties: {
          event: { type: "string", description: "The service event as the user named it, e.g. 'food bank', 'beach cleanup'." },
          date:  { type: "string", description: "YYYY-MM-DD, only if the user gave a day. Omit otherwise (the most recent match is used)." },
          hours: { type: "number", description: "Hours worked, exactly as the user stated." },
        },
        required: ["event", "hours"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_complete_task",
      description:
        "Mark one of the ASKER's open tasks done. Call this DIRECTLY — no lookup first; the server matches `task` against the open tasks assigned to them (officers who manage tasks: any open task).",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The task as the user named it, e.g. 'flyers', 'venue deposit'." },
        },
        required: ["task"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_cast_vote",
      description:
        "Cast (or change) the ASKER's vote on an open poll assigned to them. Call this DIRECTLY — no lookup first; the server finds the poll and option from the user's words.",
      parameters: {
        type: "object",
        properties: {
          poll:   { type: "string", description: "The poll as the user named it ('formal date'). Omit if they didn't — works when only one poll is open for them." },
          option: { type: "string", description: "The choice the user picked, in their words ('May 2', 'B')." },
        },
        required: ["option"],
      },
    },
  },
  // ── Structured final answer (terminal — the call IS the answer) ──
  {
    type: "function",
    function: {
      name: "compose_answer",
      description:
        "Present your FINAL answer as a structured verdict plus result rows. Call this exactly once, ALONE in its own turn " +
        "(never alongside read tools — finish your reads first), INSTEAD of writing a prose answer. " +
        "Use it for BOTH data answers and ADVISORY answers (recommendations, 'how do we improve X', product how-to that lists several steps or features). " +
        "verdict: ONE short sentence carrying the judgment AND the headline number, with the single most important figure or phrase wrapped in *asterisks* — never a count of the rows below ('here are 3 ideas'). " +
        "rows: up to 6 records backing the verdict (the people/events/transactions the question is about) — put each row's figure in value, and give each row an `ask` " +
        "(the natural follow-up question tapping it should send). follows: up to 3 short follow-up suggestions. " +
        "For an ADVISORY answer, each row is one recommendation: title = the change, subtitle = why it matters, `tier` = its impact, and `screen` = where it lives. " +
        "Rows MUST be ordered best-first, and tiers must not improve as you go down the list. " +
        "When the rows are RIVAL answers to one decision (picking one makes the others unnecessary), commit: name the pick in the verdict, " +
        "tier it high, and keep at most two real backups instead of listing everything you considered. Rows that are independently true " +
        "regardless of what else is picked — separate fixes, findings in different areas, ordered steps, or a menu the user asked for — stay a full list. " +
        "If you need something from the user to narrow the advice, put it in `askback` INSTEAD of trailing questions in the verdict. " +
        "Do NOT use this for refusals, one-line clarifying questions, or when there's no data to show — answer those in plain text.",
      parameters: {
        type: "object",
        properties: {
          verdict: { type: "string", description: "One sentence, ≤160 chars, exactly one *emphasis*. Never end with a question — use askback." },
          rows: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind:     { type: "string", enum: ["person", "money", "event", "task", "generic"], description: "Row glyph: person = a member (avatar from title initials)." },
                title:    { type: "string", description: "Primary label — a name, event title, or (advisory) the recommended change." },
                subtitle: { type: "string", description: "One quiet detail line, e.g. 'Secretary · on a payment plan', or (advisory) why it matters." },
                value:    { type: "string", description: "Right-aligned figure, e.g. '$250' or '2' or 'Thu'. Omit on advisory rows — `tier` fills this slot." },
                ask:      { type: "string", description: "Follow-up question to send if the user taps this row." },
                tier:     { type: "string", enum: ["high", "medium", "later"], description: "ADVISORY ONLY: impact. Rows are ranked, so tiers must never improve further down the list." },
                screen:   { type: "string", enum: ["dashboard", "roster", "events", "attendance", "tasks", "treasury", "dues", "service", "instagram", "parties", "docs", "settings"], description: "ADVISORY ONLY: which screen this change lives on. Tapping the row navigates there." },
              },
              required: ["kind", "title"],
            },
          },
          follows: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Chip label, ≤30 chars." },
                ask:   { type: "string", description: "The question the chip sends." },
              },
              required: ["label", "ask"],
            },
          },
          askback: {
            type: "object",
            description:
              "Up to 2 questions back to the user, each with the likely answers as tappable chips. Use ONLY when the answer would genuinely " +
              "change based on the reply — never as a conversational sign-off.",
            properties: {
              lead: { type: "string", description: "One short serif line introducing the questions, ≤120 chars." },
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string", description: "The question, ≤80 chars." },
                    chips:    { type: "array", items: { type: "string" }, description: "2–5 short likely answers, ≤24 chars each." },
                    select:   { type: "string", enum: ["one", "many"], description: "\"one\" (default) when the chips are alternatives only one of which can be true (cost vs speed). \"many\" when they are constraints or preferences that stack, so the user can pick several before replying (under $500 AND no Saturdays)." },
                  },
                  required: ["question", "chips"],
                },
              },
            },
            required: ["questions"],
          },
        },
        required: ["verdict"],
      },
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// compose_answer — parse + sanitize
// ────────────────────────────────────────────────────────────────────────────

export const ANSWER_TOOL = "compose_answer";

/** True when the tool name is the terminal structured-answer tool. */
export function isAnswerTool(name: string): boolean {
  return name === ANSWER_TOOL;
}

export interface AnswerRow {
  kind: "person" | "money" | "event" | "task" | "generic";
  title: string;
  subtitle?: string;
  value?: string;
  ask?: string;
  /**
   * The record this row stands for, so tapping it can open the peek instead of
   * asking a follow-up question. Never model-supplied — attached server-side in
   * the chat route by matching the title against ids seen in this turn's tool
   * results. See lib/ai-refs.
   */
  ref?: { type: "member" | "event" | "task"; id: number };
  /**
   * Impact tier for an advisory row, rendered in the same mono slot a data row
   * uses for its figure. Advisory rows are RANKED — that order is the argument —
   * so the tier and the row order must agree; parseComposeAnswer enforces it.
   */
  tier?: AnswerTier;
  /**
   * Screen this row is about, as a key from SCREEN_PATHS — never a raw href.
   * The model picks a screen by name and the server resolves the path, so a
   * model-authored string can never become an arbitrary navigation target.
   * Resolved to a {label, path} by the chat route before it reaches the wire;
   * see WireAnswerRow.
   */
  screen?: ScreenKey;
}

/** An AnswerRow as it goes over the SSE wire — `screen` resolved to its target. */
export type WireAnswerRow = Omit<AnswerRow, "screen"> & {
  screen?: { label: string; path: string };
};

/**
 * Where an advisory row points. A closed enum rather than a free href: the
 * values are model-supplied, and mapping them server-side is what keeps a
 * hallucinated (or injected) path from becoming a live link. Unknown keys are
 * dropped, leaving the row to fall back to its `ask`.
 */
export const SCREEN_PATHS = {
  dashboard:   { label: "Dashboard",   path: "" },
  roster:      { label: "Roster",      path: "/brothers" },
  events:      { label: "Events",      path: "/events" },
  attendance:  { label: "Attendance",  path: "/attendance" },
  tasks:       { label: "Timeline",    path: "/tasks" },
  treasury:    { label: "Treasury",    path: "/treasury" },
  dues:        { label: "Dues",        path: "/treasury/dues" },
  service:     { label: "Service",     path: "/service" },
  instagram:   { label: "Instagram",   path: "/instagram" },
  parties:     { label: "Parties",     path: "/parties" },
  docs:        { label: "Docs",        path: "/docs" },
  settings:    { label: "Settings",    path: "/settings" },
} as const;

export type ScreenKey = keyof typeof SCREEN_PATHS;

export const ANSWER_TIERS = ["high", "medium", "later"] as const;
export type AnswerTier = (typeof ANSWER_TIERS)[number];

/** Rank order for tier-vs-row-order agreement. Lower sorts first. */
const TIER_RANK: Record<AnswerTier, number> = { high: 0, medium: 1, later: 2 };

/** A question the answer asks back, with its plausible replies as tappable chips. */
export interface AskBackQuestion {
  question: string;
  chips: string[];
  /**
   * How the chips relate to each other, and so what a tap means. "one" —
   * alternatives, where picking one rules out the rest, and the tap sends
   * immediately. "many" — constraints that stack, where the client stages the
   * selections and sends them as a single reply. Absent means "one": a model
   * that never sets the field keeps today's tap-to-send behavior exactly.
   */
  select?: AskBackSelect;
}

export const ASKBACK_SELECTS = ["one", "many"] as const;
export type AskBackSelect = (typeof ASKBACK_SELECTS)[number];

export interface AskBack {
  lead?: string;
  questions: AskBackQuestion[];
}

export interface AnswerPayload {
  verdict: string;   // may contain ONE *emphasis* span; client renders it, escaping everything else
  rows: AnswerRow[];
  follows: Array<{ label: string; ask: string }>;
  /** Present only when the answer genuinely needs input to narrow further. */
  askback?: AskBack;
}

const ANSWER_ROW_KINDS = new Set(["person", "money", "event", "task", "generic"]);

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * A verdict that announces the length of its own list — "here are 3 next-event
 * ideas", "four options worth running". Deliberately narrow: it only matches a
 * count bound to a list noun (idea/option/suggestion/pick/recommendation), so
 * the ordinary headline figure is left alone. "*12* brothers owe dues" over six
 * rows is a truncated sample and correct; "3 ideas" over four rows is a
 * contradiction the user can see on screen.
 */
const SELF_COUNT =
  /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:[\w-]+\s+){0,2}(?:ideas?|options?|suggestions?|picks?|recommendations?)\b/i;

/** The count a verdict claims for its own rows, or null if it doesn't claim one. */
function claimedRowCount(verdict: string): number | null {
  const m = SELF_COUNT.exec(verdict.replace(/\*/g, ""));
  if (!m) return null;
  const raw = m[1].toLowerCase();
  return NUM_WORDS[raw] ?? Number(raw);
}

/**
 * Sanitize compose_answer args into the payload the `answer` SSE event carries.
 * Deep-validates what validateArgs (top-level only) can't: row/follow shapes,
 * caps (6 rows, 3 follows), and length limits. Malformed entries are dropped,
 * not fatal; a missing verdict and a verdict that miscounts its own rows are
 * the hard errors (fed back to the model so it retries).
 */
export function parseComposeAnswer(args: ToolArgs): AnswerPayload | { error: string } {
  const verdict = typeof args.verdict === "string" ? args.verdict.trim() : "";
  if (!verdict) return { error: "compose_answer: verdict (one sentence) is required." };

  const rows: AnswerRow[] = [];
  if (Array.isArray(args.rows)) {
    for (const raw of args.rows.slice(0, 6)) {
      if (typeof raw !== "object" || raw === null) continue;
      const r = raw as Record<string, unknown>;
      const title = typeof r.title === "string" ? r.title.trim() : "";
      if (!title) continue;
      const kind = typeof r.kind === "string" && ANSWER_ROW_KINDS.has(r.kind)
        ? (r.kind as AnswerRow["kind"])
        : "generic";
      const tier = typeof r.tier === "string" && (ANSWER_TIERS as readonly string[]).includes(r.tier)
        ? (r.tier as AnswerTier)
        : undefined;
      // An unknown screen key is dropped rather than fatal: the row still works,
      // it just falls back to its `ask`. This is the check that keeps a
      // model-authored string from ever reaching the client as a link target.
      const screen = typeof r.screen === "string" && r.screen in SCREEN_PATHS
        ? (r.screen as ScreenKey)
        : undefined;
      rows.push({
        kind,
        title: title.slice(0, 80),
        ...(typeof r.subtitle === "string" && r.subtitle.trim() ? { subtitle: r.subtitle.trim().slice(0, 120) } : {}),
        ...(typeof r.value === "string" && r.value.trim() ? { value: r.value.trim().slice(0, 24) } : {}),
        ...(typeof r.ask === "string" && r.ask.trim() ? { ask: r.ask.trim().slice(0, 200) } : {}),
        ...(tier ? { tier } : {}),
        ...(screen ? { screen } : {}),
      });
    }
  }

  const follows: Array<{ label: string; ask: string }> = [];
  if (Array.isArray(args.follows)) {
    for (const raw of args.follows.slice(0, 3)) {
      if (typeof raw !== "object" || raw === null) continue;
      const f = raw as Record<string, unknown>;
      const label = typeof f.label === "string" ? f.label.trim() : "";
      const ask = typeof f.ask === "string" ? f.ask.trim() : "";
      if (label && ask) follows.push({ label: label.slice(0, 40), ask: ask.slice(0, 200) });
    }
  }

  const claimed = claimedRowCount(verdict);
  if (claimed !== null && claimed !== rows.length) {
    return {
      error:
        `compose_answer: your verdict says ${claimed} but you sent ${rows.length} rows, and the user sees both. ` +
        `Don't count the rows in the verdict — the list is right there. Re-send with a verdict that leads on what the data shows, ` +
        `and make sure every row is the same kind of thing you're claiming.`,
    };
  }

  // Advisory rows are RANKED, and the tier column is that ranking made visible.
  // A "high" sitting below a "medium" makes the list argue with itself on
  // screen, so it's a hard error the model retries rather than a silent re-sort
  // (only the model knows which of the two it actually meant).
  const tiered = rows.filter(r => r.tier);
  if (tiered.length > 1) {
    for (let i = 1; i < tiered.length; i++) {
      const prev = TIER_RANK[tiered[i - 1].tier!];
      const cur = TIER_RANK[tiered[i].tier!];
      if (cur < prev) {
        return {
          error:
            `compose_answer: your rows are ranked best-first, but "${tiered[i].title}" is tier ${tiered[i].tier} ` +
            `below a ${tiered[i - 1].tier} row — the order and the tiers disagree, and the user sees both. ` +
            `Re-send with rows sorted best-first, or fix the tiers so they never improve going down the list.`,
        };
      }
    }
  }

  const askback = parseAskBack(args.askback);

  return { verdict: verdict.slice(0, 240), rows, follows, ...(askback ? { askback } : {}) };
}

/**
 * Sanitize the optional ask-back block: at most 2 questions, each needing at
 * least 2 chips to be worth rendering (a single chip isn't a choice). Returns
 * undefined rather than an error — a malformed ask-back should cost the block,
 * not the whole answer.
 */
function parseAskBack(raw: unknown): AskBack | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const ab = raw as Record<string, unknown>;
  if (!Array.isArray(ab.questions)) return undefined;

  const questions: AskBackQuestion[] = [];
  for (const q of ab.questions.slice(0, 2)) {
    if (typeof q !== "object" || q === null) continue;
    const qq = q as Record<string, unknown>;
    const question = typeof qq.question === "string" ? qq.question.trim() : "";
    if (!question || !Array.isArray(qq.chips)) continue;
    const chips = qq.chips
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .slice(0, 5)
      .map(c => c.trim().slice(0, 24));
    if (chips.length < 2) continue;
    // Anything but an explicit "many" is the exclusive default — an unrecognized
    // value must not turn a pick-one question into a staged multi-select.
    const select: AskBackSelect = qq.select === "many" ? "many" : "one";
    questions.push({ question: question.slice(0, 80), chips, ...(select === "many" ? { select } : {}) });
  }
  if (questions.length === 0) return undefined;

  const lead = typeof ab.lead === "string" && ab.lead.trim() ? ab.lead.trim().slice(0, 120) : undefined;
  return { ...(lead ? { lead } : {}), questions };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

// Both now come from lib/money.ts — the same rounding and the same "whole
// dollars when round, else two decimals" the officers' surfaces use. Kept as
// local aliases so the ~80 r2()/fmtUsd() call sites in this file don't churn.
const r2 = money;
const fmtUsd = fmtMoney;

function clampLimit(n: unknown, def = 100, max = 100): number {
  const v = typeof n === "number" ? Math.floor(n) : def;
  return Math.max(1, Math.min(max, v));
}

// List-tool return shaping. A bare `[]` reads ambiguously to the model — it can't
// tell "no rows match this filter" from "this resource is empty" and sometimes
// reports "none" without broadening. When the result is non-empty we return the
// array unchanged (so existing answers/behavior are untouched); when it's empty we
// return an explicit envelope that names the contract: broaden before saying none.
// `filtered` is whether any narrowing filter was applied — only then is broadening
// meaningful advice.
function listResult<T>(items: T[], filtered: boolean): T[] | { count: 0; items: []; hint: string } {
  if (items.length > 0) return items;
  return {
    count: 0,
    items: [],
    hint: filtered
      ? "No rows matched these filters. Broaden — drop a filter or switch to a sort — before telling the user there are none."
      : "This resource has no rows yet. It's safe to tell the user there are none.",
  };
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

async function listBrothers(args: ToolArgs, scoped: Scoped, orgId: number): Promise<ToolResult> {
  // Sort at the DB layer for the ranking case; status filter is post-computed so
  // we always fetch the full set first, then trim.
  const orderByField = typeof args.order_by === "string"
    && ["attendance", "gpa", "duesOwed", "serviceHours", "name"].includes(args.order_by)
    ? args.order_by as "attendance" | "gpa" | "duesOwed" | "serviceHours" | "name"
    : "name";
  const orderDir = args.order === "desc" ? "desc" : "asc";

  // Rows + thresholds are independent — fetch together instead of serially.
  const [rows, thresholds] = await Promise.all([
    // This org's roster rows, with each member's org-local name already
    // resolved — so a member of two chapters reports THIS chapter's dues, GPA
    // and attendance here, and the other chapter's numbers stay invisible.
    scoped.member.listRoster({ orderBy: { [orderByField]: orderDir } }),
    orgThresholds(scoped, orgId),
  ]);
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
      status: getBrotherStatus(b as BrotherType, thresholds),
      // Per-org admin authority (Membership.isOrgAdmin), not the legacy
      // platform-superuser flag that used to sit on the account row — being an
      // admin is something you are in a particular chapter.
      isAdmin: b.isOrgAdmin,
    }))
    .filter(b => (statusFilter === "Any" ? true : b.status === statusFilter))
    .filter(b => (owesOnly ? b.duesOwed > 0 : true));

  // Apply limit AFTER filtering so ranking + filtering compose cleanly.
  const filtered = statusFilter !== "Any" || owesOnly;
  const limited = mapped.slice(0, clampLimit(args.limit));
  if (limited.length === 0) return listResult(limited, filtered);

  // Exact aggregates over ALL matching rows (pre-limit). The model is bad at
  // summing 60 rows of floats — handing it the totals makes "how are we doing
  // on dues / attendance" answers exact instead of approximate.
  const n = mapped.length;
  const sum = (f: (b: typeof mapped[number]) => number) => mapped.reduce((s, b) => s + f(b), 0);
  return {
    summary: {
      count: n,
      totalDuesOwed: r2(sum(b => b.duesOwed)),
      owingCount: mapped.filter(b => b.duesOwed > 0).length,
      avgAttendance: r2(sum(b => b.attendance) / n),
      avgGpa: r2(sum(b => b.gpa) / n),
      totalServiceHours: r2(sum(b => b.serviceHours)),
    },
    brothers: limited,
  };
}

async function getBrother(args: ToolArgs, scoped: Scoped, orgId: number): Promise<ToolResult> {
  const id = typeof args.id === "number" ? args.id : undefined;
  const name = typeof args.name === "string" ? args.name.trim() : undefined;
  if (id == null && !name) return { error: "Provide id or name." };

  // ID path → single record (thresholds fetched alongside, not before).
  if (id != null) {
    const [thresholds, b] = await Promise.all([
      orgThresholds(scoped, orgId),
      scoped.member.findRosterRow(id, { fields: "contact" }),
    ]);
    if (!b || b.isGhost) return { error: "Brother not found." };
    return formatBrotherDetail(b, thresholds, scoped);
  }

  // Name path → fuzzy. Exact (case-insensitive) wins; otherwise fall back to
  // substring "contains" so "Bryan" finds "Bryan Lee". Both lookups (plus
  // thresholds) run in parallel — the wasted contains query when exact hits is
  // cheaper than a second serial round trip when it doesn't. Return multiple
  // matches if found so the model can disambiguate.
  const [thresholds, exact, fuzzy] = await Promise.all([
    orgThresholds(scoped, orgId),
    // Through member.search, which matches BOTH the org-local name and the
    // account name it falls back to. Matching only one of them silently misses
    // people — someone this chapter renamed, or someone it never renamed at all.
    scoped.member.search(name!, { exact: true, fields: "contact" }),
    scoped.member.search(name!, { fields: "contact" }),
  ]);
  const matches = exact.length > 0 ? exact : fuzzy;

  if (matches.length === 0) return { error: `No brother matched "${name}".` };
  if (matches.length > 1) {
    return {
      matches: matches.length,
      note: "Multiple brothers match — narrow by id, or ask the user which one.",
      candidates: matches.map(b => ({ id: b.id, name: b.name, role: b.role })),
    };
  }
  return formatBrotherDetail(matches[0], thresholds, scoped);
}

async function formatBrotherDetail(
  b: RosterRow,
  thresholds: Thresholds,
  scoped: Scoped,
) {
  // Relation-scoped: the wrapper ANDs calendarEvent.organizationId, so this bare
  // brotherId count is now org-safe structurally (was previously safe only
  // because the caller pre-scoped the brother).
  const attendanceCount = await scoped.attendanceRecord.count({ where: { brotherId: b.id, attended: true } });
  return {
    id: b.id,
    name: b.name,
    role: b.role,
    attendance: r2(b.attendance),
    gpa: r2(b.gpa),
    duesOwed: r2(b.duesOwed),
    serviceHours: r2(b.serviceHours),
    status: getBrotherStatus(b as BrotherType, thresholds),
    isAdmin: b.isOrgAdmin,
    email: b.email ?? null,
    eventsAttended: attendanceCount,
  };
}

async function listDeadlines(args: ToolArgs, scoped: Scoped): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  // Status is now binary open/done; an "open_only" flag (or any non-done status)
  // narrows to incomplete tasks. Urgency (overdue/urgent/upcoming) is computed from the
  // due date, not a stored status, so a date window is the way to ask for it.
  const status = typeof args.status === "string" ? args.status : undefined;
  const openOnly = args.open_only === true;
  const orderByField = typeof args.order_by === "string" && ["dueDate", "title"].includes(args.order_by)
    ? args.order_by as "dueDate" | "title" : "dueDate";
  const orderDir = args.order === "desc" ? "desc" : "asc";

  // Filters + limit run in the DB — fetching the whole table to filter in JS
  // pays a transfer cost on every chat turn that grows with org history. "Deadlines"
  // are tasks that HAVE a due date, so scope to dated tasks here.
  const rows = await scoped.task.findMany({
    where: {
      dueDate: start || end ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } : { not: null },
      ...(status === "done" ? { status: "done" } : status === "open" || openOnly ? { status: "open" } : {}),
    },
    orderBy: { [orderByField]: orderDir },
    take: clampLimit(args.limit),
    include: {
      assignments: {
        include: {
          brother: { select: { name: true } },
          role:    { select: { name: true } },
        },
      },
    },
  });
  // Flatten assignees into a label so the model sees who owns each task (replaces
  // the old free-text `owner` column).
  const shaped = rows.map(r => ({
    id: r.id,
    title: r.title,
    dueDate: r.dueDate,
    status: r.status,
    assignees: r.everyone === "each" ? "Everyone (each member does their own)"
      : r.everyone === "any" ? "Anyone (one person does it for the chapter)"
      : r.assignments.map(a => a.brother?.name ?? a.role?.name).filter(Boolean).join(", ") || "Unassigned",
  }));
  return listResult(shaped, !!(start || end || status || openOnly));
}

async function listInstagram(args: ToolArgs, scoped: Scoped): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const status = typeof args.status === "string" ? args.status : undefined;
  const typeFilter = typeof args.type === "string" ? args.type : undefined;
  const openOnly = args.open_only === true;
  const orderByField = typeof args.order_by === "string" && ["dueDate", "title"].includes(args.order_by)
    ? args.order_by as "dueDate" | "title" : "dueDate";
  const orderDir = args.order === "desc" ? "desc" : "asc";

  const rows = await scoped.instagramTask.findMany({
    where: {
      ...(start || end ? { dueDate: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
      ...(status ? { status } : openOnly ? { status: { not: "posted" } } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    orderBy: { [orderByField]: orderDir },
    take: clampLimit(args.limit),
  });
  return listResult(rows, !!(start || end || status || typeFilter || openOnly));
}

// Bare-day filter ("the 14th" in any month): dates are YYYY-MM-DD strings, so
// matching the zero-padded suffix is an exact day-of-month match.
function dayOfMonthSuffix(v: unknown): string | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 31
    ? `-${String(v).padStart(2, "0")}`
    : undefined;
}

async function listCalendar(args: ToolArgs, scoped: Scoped): Promise<ToolResult> {
  const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : undefined;
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const daySuffix = dayOfMonthSuffix(args.day_of_month);
  const category = typeof args.category === "string" ? args.category : undefined;
  const mandatoryOnly = args.mandatory_only === true;
  const orderByField = typeof args.order_by === "string" && ["date", "title"].includes(args.order_by)
    ? args.order_by as "date" | "title" : "date";
  const orderDir = args.order === "desc" ? "desc" : "asc";

  const rows = await scoped.calendarEvent.findMany({
    where: {
      ...(title ? { title: { contains: title, mode: "insensitive" } } : {}),
      ...(start || end || daySuffix
        ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}), ...(daySuffix ? { endsWith: daySuffix } : {}) } }
        : {}),
      ...(category ? { category } : {}),
      ...(mandatoryOnly ? { mandatory: true } : {}),
    },
    orderBy: { [orderByField]: orderDir },
    take: clampLimit(args.limit),
  });
  return listResult(rows, !!(title || start || end || daySuffix || category || mandatoryOnly));
}

async function listParties(args: ToolArgs, scoped: Scoped): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const completedOnly = args.completed_only === true;
  const orderByField = typeof args.order_by === "string" && ["date", "doorRevenue", "attendance", "expenses", "name"].includes(args.order_by)
    ? args.order_by as "date" | "doorRevenue" | "attendance" | "expenses" | "name" : "date";
  const orderDir = args.order === "desc" ? "desc" : "asc";

  const rows = await scoped.partyEvent.findMany({
    where: {
      ...(start || end ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
      ...(completedOnly ? { completed: true } : {}),
    },
    orderBy: { [orderByField]: orderDir },
    take: clampLimit(args.limit),
  });
  const mapped = rows.map(p => ({
    id: p.id, name: p.name, date: p.date, partyType: p.partyType, theme: p.theme,
    doorRevenue: r2(p.doorRevenue), expenses: r2(p.expenses),
    attendance: p.attendance, completed: p.completed,
  }));
  return listResult(mapped, !!(start || end || completedOnly));
}

async function sumTransactions(args: ToolArgs, scoped: Scoped): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const semester = typeof args.semester === "string" ? args.semester : undefined;
  const category = typeof args.category === "string" ? args.category : undefined;
  const typeFilter = args.type_filter === "income" || args.type_filter === "expense" ? args.type_filter : undefined;

  // Aggregate in the DB — one grouped query replaces shipping every matching
  // row over the wire just to sum it here.
  const grouped_rows = await scoped.transaction.groupBy({
    by: ["type", "category"],
    where: {
      deletedAt: null,
      ...(start || end ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
      ...(semester ? { semester } : {}),
      ...(category ? { category } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    _sum: { amount: true },
    _count: true,
  });

  let income = 0, expense = 0, count = 0;
  const byCategory: Record<string, { income: number; expense: number }> = {};
  for (const g of grouped_rows) {
    const amount = g._sum.amount ?? 0;
    count += g._count;
    if (g.type === "income") income += amount;
    else                     expense += amount;
    if (args.group_by_category) {
      const slot = byCategory[g.category] ?? { income: 0, expense: 0 };
      if (g.type === "income") slot.income += amount;
      else                     slot.expense += amount;
      byCategory[g.category] = slot;
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
    totals: { income: r2(income), expense: r2(expense), net: r2(income - expense), count },
    ...(grouped ? { byCategory: grouped } : {}),
  };
}

async function getTreasury(scoped: Scoped): Promise<ToolResult> {
  // All three queries are independent — run them together, and sum in the DB
  // instead of fetching every party/transaction row to add up here.
  const [doorAgg, txByType, transactions, config] = await Promise.all([
    scoped.partyEvent.aggregate({ _sum: { doorRevenue: true } }),
    scoped.transaction.groupBy({
      by: ["type"],
      where: { deletedAt: null },
      _sum: { amount: true },
    }),
    scoped.transaction.findMany({
      where: { deletedAt: null }, orderBy: { date: "desc" }, take: 10,
      select: { date: true, type: true, amount: true, category: true, description: true },
    }),
    scoped.organizationConfig.find(),
  ]);
  const doorRevenue = doorAgg._sum?.doorRevenue ?? 0;
  const income  = txByType.find(g => g.type === "income")?._sum.amount ?? 0;
  const expense = txByType.find(g => g.type === "expense")?._sum.amount ?? 0;
  const openingBalance = config?.openingBalance ?? null;
  const balance = netBalance({ openingBalance, doorRevenue, income, expense });
  return {
    balance: r2(balance),
    projected: r2(balance * 1.3),
    breakdown: { openingBalance: openingBalance == null ? null : r2(openingBalance), doorRevenue: r2(doorRevenue), income: r2(income), expense: r2(expense) },
    recentTransactions: transactions.map(t => ({ ...t, amount: r2(t.amount) })),
  };
}

async function getBudget(scoped: Scoped): Promise<ToolResult> {
  // Active semester is the one flagged isActive (matches the rest of the app).
  // Fall back to the most recent semester so the model still has a useful answer.
  let semester = await scoped.semester.findFirst({ where: { isActive: true } });
  let usedFallback = false;
  if (!semester) {
    semester = await scoped.semester.findFirst({ orderBy: { startDate: "desc" } });
    if (!semester) return { error: "No semesters defined yet." };
    usedFallback = true;
  }
  // Budget + per-category actuals both depend only on the semester label —
  // run them together, and sum expenses in the DB instead of shipping every
  // transaction row over the wire to add up here.
  const [budget, expenseGroups] = await Promise.all([
    scoped.budget.findFirst({
      where: { semester: semester.label },
      include: { allocations: true },
    }),
    scoped.transaction.groupBy({
      by: ["category"],
      where: { deletedAt: null, semester: semester.label, type: "expense" },
      _sum: { amount: true },
    }),
  ]);
  if (!budget) return {
    semester: semester.label,
    isActiveSemester: !usedFallback,
    message: usedFallback
      ? `No active semester; latest is ${semester.label} but no budget is defined for it.`
      : "No budget defined for the active semester.",
  };

  const spentByCategory: Record<string, number> = {};
  for (const g of expenseGroups) {
    spentByCategory[g.category] = g._sum.amount ?? 0;
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

async function recentActivity(args: ToolArgs, scoped: Scoped): Promise<ToolResult> {
  const take = clampLimit(args.limit, 20, 100);
  const typeFilter = args.type === "success" || args.type === "warning" || args.type === "info" ? args.type : undefined;
  const rows = await scoped.activityLog.findMany({
    where: { ...(typeFilter ? { type: typeFilter } : {}) },
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

// `now` is injectable so the eval can pin "this week" to the same date the
// pinned system prompt advertises; prod callers omit it and get the real today.
async function weeklyDigest(scoped: Scoped, orgId: number, now: Date = new Date()): Promise<ToolResult> {
  const { start, end } = isoWeekBounds(now);
  const week = { gte: start, lte: end };
  const [deadlines, ig, events, parties, brothers, thresholds] = await Promise.all([
    scoped.task.findMany({ where: { dueDate: week } }),
    scoped.instagramTask.findMany({ where: { dueDate: week } }),
    scoped.calendarEvent.findMany({ where: { mandatory: true, date: week } }),
    scoped.partyEvent.findMany({ where: { date: week } }),
    scoped.member.listRoster(),
    orgThresholds(scoped, orgId),
  ]);
  const atRiskCount = brothers.filter(b => getBrotherStatus(b as BrotherType, thresholds) === "At Risk").length;
  return {
    weekRange: { start, end },
    deadlinesDue: deadlines.map(d => ({ id: d.id, title: d.title, dueDate: d.dueDate, status: d.status })),
    igDue:        ig.map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate, type: t.type })),
    events:       events.map(e => ({ id: e.id, title: e.title, date: e.date, time: e.time })),
    parties:      parties.map(p => ({ id: p.id, name: p.name, date: p.date })),
    atRiskCount,
    thresholds,
  };
}

async function getEventAttendance(args: ToolArgs, scoped: Scoped): Promise<ToolResult> {
  const id = typeof args.id === "number" ? args.id : undefined;
  const name = typeof args.event_name === "string" ? args.event_name.trim() : undefined;
  const date = typeof args.date === "string" && DATE_RE.test(args.date) ? args.date : undefined;
  if (id == null && !name) return { error: "Provide id or event_name." };

  // Resolve the event (org-scoped). ID path is exact; name path is fuzzy and may
  // need the date to disambiguate duplicate-titled events (e.g. recurring meetings).
  let event: { id: number; title: string; date: string } | null = null;
  if (id != null) {
    event = await scoped.calendarEvent.findFirst({
      where: { id },
      select: { id: true, title: true, date: true },
    });
  } else {
    const matches = await scoped.calendarEvent.findMany({
      where: {
        title: { contains: name!, mode: "insensitive" },
        ...(date ? { date } : {}),
      },
      orderBy: { date: "desc" },
      select: { id: true, title: true, date: true },
      take: 10,
    });
    if (matches.length === 0) return { error: `No event matched "${name}"${date ? ` on ${date}` : ""}.` };
    if (matches.length > 1) {
      return {
        matches: matches.length,
        note: "Multiple events match — pass a date or id to pick one.",
        candidates: matches.map(e => ({ id: e.id, title: e.title, date: e.date })),
      };
    }
    event = matches[0];
  }
  if (!event) return { error: "Event not found." };

  // Relation-scoped wrappers AND the org via the CalendarEvent/Brother parent, so
  // these bare-FK reads can no longer return another org's rows even though the
  // WHERE only names calendarEventId.
  const [records, excuses] = await Promise.all([
    scoped.attendanceRecord.findMany({
      where: { calendarEventId: event.id },
      include: { brother: { select: { name: true, isGhost: true } } },
    }),
    scoped.attendanceExcuse.findMany({
      where: { calendarEventId: event.id },
      include: { brother: { select: { name: true } } },
    }),
  ]);

  // Ghosts are excluded everywhere else in the roster; keep them out here too.
  const visible = records.filter(r => !r.brother.isGhost);
  const excusedByName = new Map(excuses.map(e => [e.brother.name, e.status] as const));
  const attended = visible.filter(r => r.attended).map(r => r.brother.name);
  const absent = visible.filter(r => !r.attended).map(r => r.brother.name);

  return {
    event: { id: event.id, title: event.title, date: event.date },
    counts: { attended: attended.length, absent: absent.length, excused: excuses.length },
    attended,
    absent,
    excused: excuses.map(e => ({ name: e.brother.name, status: e.status, reason: e.reason })),
    ...(visible.length === 0 ? { note: "No attendance has been logged for this event yet." } : {}),
  };
}

async function getBrotherAttendance(args: ToolArgs, scoped: Scoped, access?: ToolAccess): Promise<ToolResult> {
  const id = typeof args.id === "number" ? args.id : undefined;
  const name = typeof args.name === "string" ? args.name.trim() : undefined;
  if (id == null && !name) return { error: "Provide id or name." };

  // Reuse the same fuzzy resolution as get_brother so name handling can't drift.
  let brother: { id: number; name: string } | null = null;
  if (id != null) {
    const b = await scoped.member.findRosterRow(id);
    brother = b && !b.isGhost ? { id: b.id, name: b.name } : null;
  } else {
    // Same parallel exact+contains as get_brother — one round trip, not two.
    const [exact, fuzzy] = await Promise.all([
      scoped.member.search(name!, { exact: true }),
      scoped.member.search(name!),
    ]);
    const matches = exact.length > 0 ? exact : fuzzy;
    if (matches.length === 0) return { error: `No brother matched "${name}".` };
    if (matches.length > 1) {
      return {
        matches: matches.length,
        note: "Multiple brothers match — narrow by id, or ask the user which one.",
        candidates: matches,
      };
    }
    brother = matches[0];
  }
  if (!brother) return { error: "Brother not found." };

  // Relation-scoped wrappers keep these bare-FK reads org-safe (attendanceRecord
  // via CalendarEvent, attendanceExcuse via CalendarEvent).
  const [records, excuses] = await Promise.all([
    scoped.attendanceRecord.findMany({
      where: { brotherId: brother.id },
      include: { calendarEvent: { select: { title: true, date: true } } },
    }),
    scoped.attendanceExcuse.findMany({
      where: { brotherId: brother.id },
      include: { calendarEvent: { select: { title: true, date: true } } },
    }),
  ]);
  const missed = records.filter(r => !r.attended);

  // This semester's exemption (abroad, co-op, inactive) is what explains a
  // record with misses or no record at all. It's a second wave rather than a
  // third parallel query — that would queue on the 2-connection pool
  // (lib/prisma.ts) for every call — so it's paid only when there's something
  // to explain, and only for whoever the app lets see exemptions: attendance
  // managers and the member themselves.
  const seeExemption = canAccess(access, "MANAGE_ATTENDANCE") || access?.actorId === brother.id;
  const exemption = seeExemption && (missed.length > 0 || records.length === 0)
    ? await scoped.attendanceExemption.findFirst({
        where: { brotherId: brother.id, semester: { is: { isActive: true } } },
        select: { reason: true, note: true },
      })
    : null;
  const excusedEventIds = new Set(excuses.map(e => e.calendarEventId));
  return {
    brother: { id: brother.id, name: brother.name },
    counts: {
      total: records.length,
      attended: records.filter(r => r.attended).length,
      missed: missed.length,
      excused: excuses.length,
    },
    missedEvents: missed.map(r => ({
      title: r.calendarEvent.title,
      date: r.calendarEvent.date,
      excused: excusedEventIds.has(r.calendarEventId),
    })),
    excuses: excuses.map(e => ({ title: e.calendarEvent.title, date: e.calendarEvent.date, status: e.status, reason: e.reason })),
    ...(exemption ? { exemptThisSemester: { reason: exemption.reason, ...(exemption.note ? { note: exemption.note } : {}) } } : {}),
  };
}

async function listRoles(args: ToolArgs, scoped: Scoped): Promise<ToolResult> {
  const roleName = typeof args.role_name === "string" ? args.role_name.trim() : undefined;
  const brotherName = typeof args.brother_name === "string" ? args.brother_name.trim() : undefined;

  const roles = await scoped.role.findMany({
    where: {
      ...(roleName ? { name: { contains: roleName, mode: "insensitive" } } : {}),
    },
    orderBy: { rank: "desc" },
    include: {
      brothers: {
        include: { brother: { select: { id: true, name: true, isGhost: true } } },
      },
    },
  });

  const mapped = roles
    .map(r => ({
      // id is what propose_add_deadline's assigneeRoleId needs — without it the
      // model cannot resolve a role assignee and resorts to guessing ids.
      id: r.id,
      role: r.name,
      rank: r.rank,
      holders: r.brothers
        .map(br => br.brother)
        .filter(b => !b.isGhost)
        .filter(b => (brotherName ? b.name.toLowerCase().includes(brotherName.toLowerCase()) : true))
        .map(b => ({ id: b.id, name: b.name })),
    }))
    // When filtering by brother, drop roles they don't hold so the answer is tight.
    .filter(r => (brotherName ? r.holders.length > 0 : true));

  return mapped;
}

async function listServiceEvents(args: ToolArgs, scoped: Scoped): Promise<ToolResult> {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const orderDir = args.order === "desc" ? "desc" : "asc";

  const rows = await scoped.serviceEvent.findMany({
    where: {
      ...(start || end ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
    },
    orderBy: { date: orderDir },
    take: clampLimit(args.limit),
    select: { id: true, title: true, date: true, location: true, notes: true },
  });
  return listResult(rows, !!(start || end));
}

async function listProgrammingEvents(args: ToolArgs, scoped: Scoped): Promise<ToolResult> {
  const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : undefined;
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  const stageFilter = typeof args.stage === "string" ? args.stage : undefined;
  const typeFilter  = typeof args.type  === "string" ? args.type  : undefined;
  const orderByField = typeof args.order_by === "string" && ["date", "title", "stage"].includes(args.order_by)
    ? args.order_by as "date" | "title" | "stage" : "date";
  const orderDir = args.order === "desc" ? "desc" : "asc";

  // Programming manages the org's own event types (everything creatable);
  // the type filter accepts a slug or a display label.
  const managed = (await orgEventTypes(scoped)).filter(isProgrammingManagedType);
  const labelBySlug = new Map(managed.map(t => [t.slug, t.label]));
  const categoryFilter = typeFilter ? resolveEventType(managed, typeFilter)?.slug : undefined;

  const daySuffix = dayOfMonthSuffix(args.day_of_month);

  // Date is nullable (idea-stage events). start excludes undated rows; an
  // end-only filter keeps them (an undated idea isn't "after" any cutoff).
  // day_of_month requires a date, so it excludes undated rows too.
  const dateWhere = start
    ? { date: { gte: start, ...(end ? { lte: end } : {}), ...(daySuffix ? { endsWith: daySuffix } : {}) } }
    : end
      ? { AND: [{ OR: [{ date: { lte: end } }, { date: null }] }, ...(daySuffix ? [{ date: { endsWith: daySuffix } }] : [])] }
      : daySuffix
        ? { date: { endsWith: daySuffix } }
        : {};

  const rows = await scoped.programmingEvent.findMany({
    where: {
      category: { in: managed.map(t => t.slug) },
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(stageFilter    ? { stage: stageFilter }        : {}),
      ...(title ? { title: { contains: title, mode: "insensitive" } } : {}),
      ...dateWhere,
    },
    orderBy: { [orderByField]: orderDir },
    take: clampLimit(args.limit),
    select: {
      id: true, title: true, date: true, category: true, stage: true,
      location: true, collabOrg: true,
      // The owner is a person-or-role FK now, not a free-text string. The role
      // case is why: "the Social Chair owns it" has to answer with whoever holds
      // that role TODAY, which a snapshotted name could never do.
      ownerBrother: { select: { id: true, name: true } },
      ownerRole:    { select: { id: true, name: true, brothers: { select: { brotherId: true } } } },
      ownerBrotherId: true, ownerRoleId: true,
      // A pre-migration name that matched nobody on the roster. Reported as-is so
      // the model doesn't call an event unowned when a name is sitting right there.
      ownerNote: true,
    },
    // The scoped wrapper isn't select-narrowed in its return type; the runtime
    // select is the shape below. Same cast the programming service makes.
  }) as unknown as (OwnerRow & {
    id: number; title: string; date: string | null; category: string; stage: string;
    location: string | null; collabOrg: string; ownerNote: string | null;
  })[];

  // One roster read for every row's owner name, resolved org-locally
  // (Membership.name) rather than from the account-canonical Brother.name.
  const roster = await scoped.member.listRoster();
  const nameById = new Map(roster.map(m => [m.id, m.name]));

  const mapped = rows
    .map(e => ({
      id:       e.id,
      title:    e.title,
      type:     labelBySlug.get(e.category) ?? e.category,
      stage:    e.stage,
      date:     e.date ?? null,
      owner:    ownerLabel(resolveOwner(e, id => nameById.get(id) ?? null)) ?? e.ownerNote ?? "",
      location: e.location ?? null,
      collabOrg: e.collabOrg || null,
    }));

  return listResult(mapped, !!(title || start || end || daySuffix || stageFilter || typeFilter));
}

// ────────────────────────────────────────────────────────────────────────────
// Blind-spot read handlers
//
// Latency rules these follow (the model round trip dominates, but every scoped
// query is its own BEGIN + SET LOCAL + query + COMMIT, and the app pool holds
// only 2 connections per instance — lib/prisma.ts):
//   - ONE wave per call, at most 2 queries wide. A third concurrent query
//     queues for a connection and costs a full extra round of latency.
//     Child rows ride the parent query's include/relation filter instead of a
//     second "now fetch the ids we found" query.
//   - Names come from rosterNames(), cached per org, so a tool that shows
//     people costs no extra query on a warm cache.
//   - Results are compact (no nulls, rounded money, capped lists): every byte
//     of a tool result is input the model must read before it can answer.
// ────────────────────────────────────────────────────────────────────────────

/** Who is asking — the gate for tools whose app screens are permission-gated. */
export interface ToolAccess {
  actorId: number;
  permissions: number;
  isOrgAdmin: boolean;
  isPlatformAdmin: boolean;
}

/** Mirrors buildContext({ requirePerm }): org/platform admins pass every gate. */
function canAccess(access: ToolAccess | undefined, perm: Permission): boolean {
  if (!access) return false; // callers that don't say who's asking get the conservative answer
  return access.isPlatformAdmin || access.isOrgAdmin || hasPermission(access.permissions, perm);
}

function denied(label: string): { error: string } {
  return { error: `This needs the ${label} permission, which the person asking doesn't hold. Tell them so in one sentence.` };
}

/**
 * brotherId → this org's display name for every non-ghost roster member.
 * 60s per-org cache: names change rarely, and this sits on the path of every
 * tool that lists people. A just-approved member shows up within a minute.
 */
const rosterNameCache = new Map<number, { value: Map<number, string>; expires: number }>();

async function rosterNames(scoped: Scoped, orgId: number): Promise<Map<number, string>> {
  const now = Date.now();
  const cached = rosterNameCache.get(orgId);
  if (cached && cached.expires > now) return cached.value;
  const rows = await scoped.member.findMany({
    where: { brother: { is: { isGhost: false } } },
    select: { brotherId: true, name: true, brother: { select: { name: true } } },
  });
  const value = new Map(rows.map(r => [r.brotherId, r.name ?? r.brother.name]));
  rosterNameCache.set(orgId, { value, expires: now + 60 * 1000 });
  return value;
}

/** brotherIds whose name contains the fragment, or null when no fragment was given. */
function idsMatching(names: Map<number, string>, fragment: unknown): Set<number> | null {
  if (typeof fragment !== "string" || !fragment.trim()) return null;
  const needle = fragment.trim().toLowerCase();
  return new Set([...names].filter(([, n]) => n.toLowerCase().includes(needle)).map(([id]) => id));
}

function dateRange(args: ToolArgs): { gte?: string; lte?: string } | undefined {
  const start = typeof args.start === "string" && DATE_RE.test(args.start) ? args.start : undefined;
  const end   = typeof args.end   === "string" && DATE_RE.test(args.end)   ? args.end   : undefined;
  return start || end ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } : undefined;
}

type MetricDef = { id: number; name: string; unit: string | null; goal: number; atRiskBelow: number; watchBelow: number | null; aggregation: string };
type MetricDefWithValues = MetricDef & { values: { brotherId: number; value: number }[] };

async function getCustomMetrics(args: ToolArgs, scoped: Scoped, orgId: number): Promise<ToolResult> {
  const fragment = typeof args.metric === "string" ? args.metric.trim().toLowerCase() : "";
  // Definitions and every member's value in ONE scoped query (the values are an
  // include, so they load inside the same transaction instead of costing a
  // second pool checkout); filtering to one metric happens in memory.
  const [defs, names] = await Promise.all([
    scoped.orgMetricDefinition.findMany({
      where: { deletedAt: null },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, name: true, unit: true, goal: true, atRiskBelow: true, watchBelow: true, aggregation: true,
        values: { select: { brotherId: true, value: true } },
      },
    }) as unknown as Promise<MetricDefWithValues[]>,
    rosterNames(scoped, orgId),
  ]);
  if (defs.length === 0) {
    return { count: 0, items: [], hint: "This chapter hasn't defined any custom metrics (Settings → Custom Metrics). Safe to say there are none." };
  }

  const picked = fragment
    ? (defs.find(d => d.name.toLowerCase() === fragment) ? defs.filter(d => d.name.toLowerCase() === fragment) : defs.filter(d => d.name.toLowerCase().includes(fragment)))
    : defs;
  if (picked.length === 0) {
    return { error: `No custom metric matches "${args.metric}". Metrics: ${defs.map(d => d.name).join(", ")}.` };
  }

  const byDef = new Map<number, Map<number, number>>();
  for (const d of picked) {
    // Off the roster (or a ghost) — the dashboard doesn't count them either.
    byDef.set(d.id, new Map(d.values.filter(v => names.has(v.brotherId)).map(v => [v.brotherId, v.value])));
  }

  const summarize = (d: MetricDef) => {
    const vals = byDef.get(d.id) ?? new Map<number, number>();
    const counts = { on_track: 0, watch: 0, at_risk: 0 };
    let sum = 0;
    for (const value of vals.values()) { counts[getMetricStatus(value, d)]++; sum += value; }
    return {
      metric: d.name,
      ...(d.unit ? { unit: d.unit } : {}),
      goal: d.goal,
      atRiskBelow: d.atRiskBelow,
      average: vals.size ? r2(sum / vals.size) : null,
      total: r2(sum),
      onTrack: counts.on_track,
      watch: counts.watch,
      atRisk: counts.at_risk,
      notRecorded: names.size - vals.size,
    };
  };

  // Overview, or an ambiguous fragment: summaries only — member lists for several
  // metrics at once would bloat the result the model has to read.
  if (picked.length > 1) return { metrics: picked.map(summarize) };

  const def = picked[0];
  const vals = byDef.get(def.id) ?? new Map<number, number>();
  const status = typeof args.status === "string" ? args.status : undefined;
  const dir = args.order === "desc" ? -1 : 1;
  const members = [...names]
    .map(([id, name]) => {
      const value = vals.get(id);
      return value === undefined
        ? { id, name, value: null as number | null, status: "missing" }
        : { id, name, value: r2(value), status: getMetricStatus(value, def) as string };
    })
    .filter(m => (status ? m.status === status : true))
    // Missing values sort last either way — "lowest" should mean lowest recorded.
    .sort((a, b) => (a.value === null ? 1 : b.value === null ? -1 : (a.value - b.value) * dir));

  return {
    summary: summarize(def),
    members: members.slice(0, clampLimit(args.limit, 25)),
    ...(members.length === 0 ? { hint: status ? "No members in that status. Broaden before saying none." : "No members on the roster." } : {}),
  };
}

// Custom field definitions share OrganizationConfig with thresholds; cached separately
// (5 min) so this tool doesn't pay the config read on every call.
const fieldDefCache = new Map<number, { value: CustomMemberFieldDef[]; expires: number }>();

async function memberFieldDefs(scoped: Scoped, orgId: number): Promise<CustomMemberFieldDef[]> {
  const now = Date.now();
  const cached = fieldDefCache.get(orgId);
  if (cached && cached.expires > now) return cached.value;
  const config = await scoped.organizationConfig.find();
  const raw = config?.customMemberFields;
  const value = Array.isArray(raw) ? sanitizeFieldDefs(raw) : [];
  fieldDefCache.set(orgId, { value, expires: now + 5 * 60 * 1000 });
  return value;
}

async function listMemberFields(args: ToolArgs, scoped: Scoped, orgId: number): Promise<ToolResult> {
  const [defs, rows] = await Promise.all([
    memberFieldDefs(scoped, orgId),
    scoped.member.findMany({
      where: { brother: { is: { isGhost: false } } },
      select: { brotherId: true, name: true, customFields: true, brother: { select: { name: true } } },
    }),
  ]);
  if (defs.length === 0) {
    return { count: 0, items: [], hint: "This chapter has no custom member fields (Settings → Member Fields). Safe to say there are none." };
  }
  const people = rows.map(r => ({
    id: r.brotherId,
    name: r.name ?? r.brother.name,
    values: (typeof r.customFields === "object" && r.customFields !== null ? r.customFields : {}) as Record<string, unknown>,
  }));
  const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";

  const fragment = typeof args.field === "string" ? args.field.trim().toLowerCase() : "";
  if (!fragment) {
    return {
      fields: defs.map(d => ({
        field: d.label,
        type: d.type,
        ...(d.required ? { required: true } : {}),
        ...(d.options?.length ? { options: d.options } : {}),
        filledIn: people.filter(p => filled(p.values[d.id])).length,
        of: people.length,
      })),
    };
  }

  const def = defs.find(d => d.label.toLowerCase() === fragment) ?? defs.find(d => d.label.toLowerCase().includes(fragment));
  if (!def) return { error: `No member field matches "${args.field}". Fields: ${defs.map(d => d.label).join(", ")}.` };

  const valueNeedle = typeof args.value === "string" ? args.value.trim().toLowerCase() : "";
  const missingOnly = args.missing_only === true;
  const matches = people
    .filter(p => {
      const v = p.values[def.id];
      if (missingOnly) return !filled(v);
      if (valueNeedle) return filled(v) && String(v).toLowerCase().includes(valueNeedle);
      return true;
    })
    .map(p => ({ id: p.id, name: p.name, value: filled(p.values[def.id]) ? p.values[def.id] : null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    field: def.label,
    matching: matches.length,
    members: matches.slice(0, clampLimit(args.limit)),
    ...(matches.length === 0 ? { hint: missingOnly ? "Everyone has filled this in." : "No members match. Broaden before saying none." } : {}),
  };
}

async function listPolls(args: ToolArgs, scoped: Scoped, orgId: number, access?: ToolAccess): Promise<ToolResult> {
  const question = typeof args.question === "string" && args.question.trim() ? args.question.trim() : undefined;
  const status = args.status === "open" || args.status === "closed" ? args.status : undefined;
  const manager = canAccess(access, "MANAGE_POLLS");

  // Role-assigned polls expand to their current holders through the include
  // (same transaction), so this is one pool checkout plus the cached names.
  const [polls, names] = await Promise.all([
    scoped.poll.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(question ? { question: { contains: question, mode: "insensitive" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: clampLimit(args.limit, 10, 50),
      select: {
        id: true, question: true, status: true, closeDate: true,
        options: { orderBy: { position: "asc" }, select: { id: true, label: true } },
        votes: { select: { brotherId: true, optionId: true } },
        assignments: {
          select: {
            brotherId: true,
            // Only managers see turnout, so only they pay for the expansion.
            ...(manager ? { role: { select: { brothers: { select: { brotherId: true } } } } } : {}),
          },
        },
      },
    }),
    rosterNames(scoped, orgId),
  ]);

  const mapped = polls.map(p => {
    const assignees = new Set<number>();
    for (const a of p.assignments as { brotherId: number | null; role?: { brothers: { brotherId: number }[] } | null }[]) {
      if (a.brotherId != null) assignees.add(a.brotherId);
      for (const h of a.role?.brothers ?? []) assignees.add(h.brotherId);
    }
    const voters = new Set(p.votes.map(v => v.brotherId));
    const myVote = access ? p.votes.find(v => v.brotherId === access.actorId) : undefined;
    // Same reveal rule as the Polls page (lib/services/poll-service buildDTOs).
    const revealed = p.status === "closed" || myVote != null || manager;
    const tally = new Map<number, number>();
    for (const v of p.votes) tally.set(v.optionId, (tally.get(v.optionId) ?? 0) + 1);
    return {
      id: p.id,
      question: p.question,
      status: p.status,
      ...(p.closeDate ? { closeDate: p.closeDate } : {}),
      votes: p.votes.length,
      ...(manager ? { eligible: assignees.size } : {}),
      ...(revealed
        ? { options: p.options.map(o => ({ label: o.label, votes: tally.get(o.id) ?? 0 })) }
        : { options: p.options.map(o => o.label), sealed: "Results hidden until the asker votes or the poll closes." }),
      ...(myVote ? { yourVote: p.options.find(o => o.id === myVote.optionId)?.label } : {}),
      ...(manager
        ? { notVoted: [...assignees].filter(id => !voters.has(id) && names.has(id)).map(id => ({ id, name: names.get(id)! })) }
        : {}),
    };
  });
  return listResult(mapped, !!(question || status));
}

async function listReimbursements(args: ToolArgs, scoped: Scoped, orgId: number): Promise<ToolResult> {
  const status = typeof args.status === "string" ? args.status : undefined;
  const range = dateRange(args);
  const orderField = args.order_by === "amount" ? "amount" : "date";
  const orderDir = args.order === "asc" ? "asc" : "desc";
  const [rows, names] = await Promise.all([
    scoped.reimbursement.findMany({
      where: { ...(status ? { status } : {}), ...(range ? { date: range } : {}) },
      orderBy: [{ [orderField]: orderDir }, { id: "desc" }],
      select: { id: true, brotherId: true, amount: true, date: true, description: true, category: true, status: true },
    }),
    rosterNames(scoped, orgId),
  ]);
  const who = idsMatching(names, args.member);
  const matched = who ? rows.filter(r => who.has(r.brotherId)) : rows;
  const filtered = !!(status || range || who);
  if (matched.length === 0) return listResult([], filtered);

  const pending = matched.filter(r => r.status === "pending");
  return {
    summary: {
      count: matched.length,
      total: r2(matched.reduce((s, r) => s + r.amount, 0)),
      pendingCount: pending.length,
      pendingTotal: r2(pending.reduce((s, r) => s + r.amount, 0)),
    },
    reimbursements: matched.slice(0, clampLimit(args.limit, 25)).map(r => ({
      id: r.brotherId, // member id, so the row opens that member (lib/ai-refs)
      name: names.get(r.brotherId) ?? "Former member",
      amount: r2(r.amount),
      date: r.date,
      description: r.description,
      ...(r.category ? { category: r.category } : {}),
      status: r.status,
    })),
  };
}

async function listDuesPayments(args: ToolArgs, scoped: Scoped, orgId: number, access?: ToolAccess): Promise<ToolResult> {
  // Treasury holders see the chapter's payments; everyone else only their own.
  const all = canAccess(access, "MANAGE_TREASURY");
  if (!all && !access) return denied("Manage treasury");
  const status = typeof args.status === "string" ? args.status : undefined;
  const range = dateRange(args);
  const [rows, names] = await Promise.all([
    scoped.duesPayment.findMany({
      where: {
        ...(all ? {} : { brotherId: access!.actorId }),
        ...(status ? { status } : {}),
        ...(range ? { date: range } : {}),
      },
      orderBy: [{ date: args.order === "asc" ? "asc" : "desc" }, { id: "desc" }],
      select: { brotherId: true, amount: true, date: true, paymentMethod: true, status: true },
    }),
    rosterNames(scoped, orgId),
  ]);
  const who = idsMatching(names, args.member);
  const matched = who ? rows.filter(r => who.has(r.brotherId)) : rows;
  const scope = all ? {} : { scope: "Only the asker's own payments — they can't see other members' payments." };
  if (matched.length === 0) {
    return { ...listResult([], !!(status || range || who)), ...scope } as ToolResult;
  }
  const approved = matched.filter(r => r.status === "approved");
  return {
    ...scope,
    summary: {
      count: matched.length,
      approvedTotal: r2(approved.reduce((s, r) => s + r.amount, 0)),
      pendingCount: matched.filter(r => r.status === "pending").length,
    },
    payments: matched.slice(0, clampLimit(args.limit, 25)).map(r => ({
      id: r.brotherId,
      name: names.get(r.brotherId) ?? "Former member",
      amount: r2(r.amount),
      date: r.date,
      ...(r.paymentMethod ? { method: r.paymentMethod } : {}),
      status: r.status,
    })),
  };
}

async function searchDocs(args: ToolArgs, scoped: Scoped): Promise<ToolResult> {
  const q = typeof args.query === "string" ? args.query.trim() : "";
  const contains = { contains: q, mode: "insensitive" as const };
  const rows = await scoped.doc.findMany({
    where: q
      ? { OR: [{ title: contains }, { description: contains }, { ogTitle: contains }, { folder: { is: { name: contains } } }] }
      : {},
    orderBy: [{ pinnedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    take: clampLimit(args.limit, 10, 25),
    select: { title: true, url: true, description: true, pinnedAt: true, folder: { select: { name: true } } },
  }) as unknown as { title: string; url: string; description: string | null; pinnedAt: Date | null; folder: { name: string } | null }[];
  return listResult(rows.map(d => ({
    title: d.title,
    url: d.url,
    ...(d.folder ? { folder: d.folder.name } : {}),
    ...(d.description ? { description: d.description.slice(0, 200) } : {}),
    ...(d.pinnedAt ? { pinned: true } : {}),
  })), !!q);
}

async function getAnnouncement(scoped: Scoped): Promise<ToolResult> {
  const a = await scoped.chapterAnnouncement.findFirst({
    select: { title: true, body: true, ctaLabel: true, ctaUrl: true, authorName: true, updatedAt: true },
  });
  if (!a) return { none: true, hint: "No announcement is posted. Safe to say so." };
  return {
    title: a.title,
    body: a.body.length > 800 ? `${a.body.slice(0, 800)}…` : a.body,
    ...(a.ctaUrl ? { link: { label: a.ctaLabel ?? "Link", url: a.ctaUrl } } : {}),
    ...(a.authorName ? { postedBy: a.authorName } : {}),
    updated: a.updatedAt.toISOString().slice(0, 10),
  };
}

async function listJoinRequests(args: ToolArgs, scoped: Scoped, _orgId: number, access?: ToolAccess): Promise<ToolResult> {
  if (!canAccess(access, "MANAGE_BROTHERS")) return denied("Manage members");
  const status = typeof args.status === "string" ? args.status : "pending";
  const rows = await scoped.joinRequest.findMany({
    where: { status },
    orderBy: { createdAt: "asc" }, // oldest first — who's been waiting longest
    take: clampLimit(args.limit, 50),
    select: { name: true, email: true, createdAt: true, decidedAt: true },
  });
  return listResult(rows.map(r => ({
    name: r.name,
    ...(r.email ? { email: r.email } : {}),
    requested: r.createdAt.toISOString().slice(0, 10),
    ...(r.decidedAt ? { decided: r.decidedAt.toISOString().slice(0, 10) } : {}),
  })), status !== "pending");
}

async function listAttendanceExemptions(args: ToolArgs, scoped: Scoped, orgId: number, access?: ToolAccess): Promise<ToolResult> {
  if (!canAccess(access, "MANAGE_ATTENDANCE")) return denied("Manage attendance");
  const [rows, names] = await Promise.all([
    scoped.attendanceExemption.findMany({
      where: { semester: { is: { isActive: true } } },
      select: { brotherId: true, reason: true, note: true },
    }),
    rosterNames(scoped, orgId),
  ]);
  const who = idsMatching(names, args.member);
  const mapped = rows
    .filter(r => names.has(r.brotherId) && (who ? who.has(r.brotherId) : true))
    .map(r => ({ id: r.brotherId, name: names.get(r.brotherId)!, reason: r.reason, ...(r.note ? { note: r.note } : {}) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return listResult(mapped, !!who);
}

// ────────────────────────────────────────────────────────────────────────────
// Write proposal builders — VALIDATE only, NEVER touch the DB. The chat route
// surfaces the returned Proposal over SSE as a confirm card on the client.
// The client posts the validated payload to the existing /api/* route, whose
// existing auth (requireUser / requireAdmin) decides if
// the write actually happens.
// ────────────────────────────────────────────────────────────────────────────

function badProposal(reason: string): { error: string } { return { error: reason }; }

async function proposeAddDeadline(args: ToolArgs, scoped: Scoped): Promise<ProposalDraft | { error: string }> {
  const title = String(args.title ?? "").trim();
  const dueDate = String(args.dueDate ?? "").trim();
  const assigneeBrotherId = typeof args.assigneeBrotherId === "number" ? args.assigneeBrotherId : undefined;
  const assigneeRoleId    = typeof args.assigneeRoleId === "number" ? args.assigneeRoleId : undefined;
  // Optional note — mirror createTaskInput's 2000-char cap so the proposal can't
  // produce a payload the POST would then reject.
  const notes = typeof args.notes === "string" ? args.notes.trim() : "";
  if (!title || !dueDate) return badProposal("Missing required fields.");
  if (!DATE_RE.test(dueDate)) return badProposal("dueDate must be YYYY-MM-DD.");
  if (title.length > 200 || notes.length > 2000) return badProposal("Field too long.");
  if (!assigneeBrotherId && !assigneeRoleId) {
    return badProposal("A deadline needs an assignee. Resolve the owner with list_brothers or list_roles, then pass assigneeBrotherId or assigneeRoleId.");
  }
  // Resolve the assignee's display name for the card (validate-only read).
  // A miss means the id isn't in this org — the model guessed instead of
  // resolving via list_brothers/list_roles. Reject NOW so it self-corrects,
  // rather than emitting a card whose Approve is destined to 400.
  let owner = "";
  try {
    if (assigneeBrotherId) {
      owner = (await scoped.member.findRosterRow(assigneeBrotherId))?.name ?? "";
      if (!owner) return badProposal(`No member with id ${assigneeBrotherId} in this chapter — resolve the owner with list_brothers first.`);
    } else if (assigneeRoleId) {
      owner = (await scoped.role.findFirst({ where: { id: assigneeRoleId }, select: { name: true } }))?.name ?? "";
      if (!owner) return badProposal(`No role with id ${assigneeRoleId} in this chapter — resolve the role with list_roles first.`);
    }
  } catch { /* DB blip — card degrades to no Owner row rather than blocking the draft */ }
  return {
    kind: "proposal",
    action: "propose_add_deadline",
    endpoint: "/api/tasks",
    method: "POST",
    payload: {
      title,
      dueDate,
      ...(notes ? { notes } : {}),
      assigneeBrotherIds: assigneeBrotherId ? [assigneeBrotherId] : [],
      assigneeRoleIds:    assigneeRoleId ? [assigneeRoleId] : [],
    },
    summary: `Add deadline "${title}" — due ${dueDate}.`,
    rows: [
      { k: "Title", v: title },
      ...(owner ? [{ k: "Owner", v: owner }] : []),
      { k: "Due", v: dueDate, em: true },
      ...(notes ? [{ k: "Notes", v: notes.length > 80 ? `${notes.slice(0, 77)}…` : notes }] : []),
    ],
  };
}

function proposeAddInstagram(args: ToolArgs): ProposalDraft | { error: string } {
  const title = String(args.title ?? "").trim();
  const dueDate = String(args.dueDate ?? "").trim();
  const type = String(args.type ?? "").trim();
  if (!title || !dueDate || !type) return badProposal("Missing required fields.");
  if (!DATE_RE.test(dueDate)) return badProposal("dueDate must be YYYY-MM-DD.");
  if (!(IG_TYPES as readonly string[]).includes(type)) return badProposal(`type must be one of ${IG_TYPES.join(", ")}.`);
  // New posts start "open" (the DB default); urgency is derived from dueDate.
  return {
    kind: "proposal",
    action: "propose_add_instagram_task",
    endpoint: "/api/instagram",
    method: "POST",
    payload: { title, dueDate, type },
    summary: `Add IG ${type}: "${title}" — due ${dueDate}.`,
    rows: [
      { k: "Title", v: title },
      { k: "Type", v: type },
      { k: "Due", v: dueDate, em: true },
    ],
  };
}

async function proposeAddCalendarEvent(args: ToolArgs, scoped: Scoped): Promise<ProposalDraft | { error: string }> {
  const title = String(args.title ?? "").trim();
  const date = String(args.date ?? "").trim();
  const rawCategory = String(args.category ?? "").trim();
  if (!title || !date || !rawCategory) return badProposal("Missing required fields.");
  if (!DATE_RE.test(date)) return badProposal("date must be YYYY-MM-DD.");
  // Categories are the org's CalendarEventType rows; mirror assertCategoryUsable
  // (create mode): the type must exist, be timeline-creatable, and not hidden.
  // A caller that already fetched this org's rows (event-idea-service) can
  // stash them on args._prefetchedTypes to skip a redundant round-trip.
  const prefetched = args._prefetchedTypes as OrgEventType[] | undefined;
  const types = prefetched ?? await orgEventTypes(scoped);
  const type = resolveEventType(types, rawCategory);
  if (!type) return badProposal(`Unknown event type "${rawCategory}" — this chapter's types are: ${describeTypes(types)}.`);
  if (!type.creatable || type.hidden) return badProposal(`The "${type.label}" event type isn't available for new events.`);
  const category = type.slug;
  // mandatory is optional: default true for chapter, false otherwise.
  const mandatory = typeof args.mandatory === "boolean" ? args.mandatory : category === "chapter";
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
    rows: [
      { k: "Title", v: title },
      { k: "Date", v: date, em: true },
      { k: "Category", v: type.label },
      ...(typeof payload.time === "string" ? [{ k: "Time", v: payload.time }] : []),
      ...(typeof payload.location === "string" ? [{ k: "Location", v: payload.location }] : []),
      ...(mandatory ? [{ k: "Mandatory", v: "Yes" }] : []),
    ],
  };
}

function proposeLogTransaction(args: ToolArgs): ProposalDraft | { error: string } {
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
  return {
    kind: "proposal",
    action: "propose_log_transaction",
    endpoint: "/api/transactions",
    method: "POST",
    payload,
    summary: `Log $${r2(amount).toFixed(2)} ${type} (${category}) on ${date}: ${description}. Admin-only.`,
    rows: [
      { k: "Type", v: type === "income" ? "Income" : "Expense" },
      { k: "Category", v: category },
      { k: "Amount", v: fmtUsd(amount), em: true },
      { k: "Date", v: date },
      { k: "For", v: description.length > 60 ? `${description.slice(0, 57)}…` : description },
      ...(typeof payload.paymentMethod === "string" ? [{ k: "Method", v: payload.paymentMethod }] : []),
    ],
  };
}

// Recording a dues payment posts a real income transaction — confirming this proposal
// POSTs to /api/transactions with the member attributed, which mints the "Dues" income
// row and decrements the balance together in one DB transaction (see createTransaction
// in lib/services/transaction-service.ts). The Ratify card is the review-before-write
// step. This used to propose `PATCH /api/brothers/:id { duesOwed: 0 }` — a flag flip that
// zeroed the roster and told the treasury nothing, so every dollar the chapter collected
// this way went unrecorded; posting the transaction closes that gap while keeping the
// treasurer's confirm in the loop.
//
// The balance read is therefore no longer decorative. It used to be best-effort
// enrichment that degraded to a plain summary on failure; now it determines the amount
// to be staged, so a failed read has to block the proposal rather than guess. Still
// VALIDATE-ONLY: it never writes.
async function proposeRecordDuesPayment(args: ToolArgs, scoped: Scoped): Promise<ProposalDraft | { error: string }> {
  const id = typeof args.brother_id === "number" ? args.brother_id : Number(args.brother_id);
  const name = typeof args.brother_name === "string" ? args.brother_name.trim() : "";
  if (!Number.isFinite(id) || id <= 0) return badProposal("brother_id required.");
  if (!name) return badProposal("brother_name required for the confirm card.");

  let currentOwed: number;
  try {
    const b = await scoped.member.findRosterRow(id);
    if (!b || b.isGhost) return badProposal(`No brother with id ${id} in this chapter.`);
    currentOwed = r2(b.duesOwed);
  } catch {
    return badProposal(`Could not read ${name}'s dues balance, so there is no amount to record.`);
  }

  // An explicit amount wins; otherwise pay the balance off in full.
  const requested = typeof args.amount === "number" ? args.amount : Number(args.amount);
  const explicit  = Number.isFinite(requested) && requested > 0 ? r2(requested) : null;
  const amount    = explicit ?? currentOwed;

  if (amount <= 0)          return badProposal(`${name} is already paid up — they owe $0.00.`);
  // createTransaction refuses this too (the balance check is in the decrement's WHERE
  // clause), but catching it here means the officer gets told before they click, not after.
  if (amount > currentOwed) {
    return badProposal(
      `${name} owes $${currentOwed.toFixed(2)}, so a $${amount.toFixed(2)} payment cannot be recorded.`,
    );
  }

  const remaining = r2(currentOwed - amount);
  const tail = remaining > 0
    ? `$${remaining.toFixed(2)} would remain owing.`
    : "That clears their balance.";

  return {
    kind: "proposal",
    action: "propose_record_dues_payment",
    endpoint: "/api/transactions",
    method: "POST",
    payload: {
      type: "income",
      category: "Dues",
      brotherId: id,
      amount,
      date: todayISO(),
      description: `Dues payment — ${name}`,
    },
    summary: `Record a $${amount.toFixed(2)} dues payment from ${name} (currently owes `
      + `$${currentOwed.toFixed(2)}). This posts an income transaction and lowers their `
      + `balance. ${tail}`,
    rows: [
      { k: "Brother", v: name },
      { k: "Amount", v: fmtUsd(amount), em: true },
      { k: "Date", v: todayISO() },
      { k: "Balance after", v: fmtUsd(remaining) },
    ],
  };
}

async function proposeAddProgrammingEvent(args: ToolArgs, scoped: Scoped): Promise<ProposalDraft | { error: string }> {
  const title   = String(args.title ?? "").trim();
  const rawType = String(args.type  ?? "").trim();
  if (!title || !rawType) return badProposal("Missing required fields.");
  // Programming manages the org's own event types (creatable minus chapter).
  const managed = (await orgEventTypes(scoped)).filter(t => isProgrammingManagedType(t) && !t.hidden);
  const type = resolveEventType(managed, rawType);
  if (!type) return badProposal(`Unknown event type "${rawType}" — this chapter's programming types are: ${describeTypes(managed)}.`);
  if (title.length > 200) return badProposal("Title too long.");
  const date  = typeof args.date  === "string" && DATE_RE.test(args.date)  ? args.date  : undefined;
  const owner = typeof args.owner === "string" && args.owner.trim() ? args.owner.trim() : undefined;
  const payload: Record<string, unknown> = { title, category: type.slug };
  if (date)  payload.dueDate = date;
  if (owner) payload.owner = owner;
  return {
    kind: "proposal",
    action: "propose_add_programming_event",
    endpoint: "/api/programming",
    method: "POST",
    payload,
    summary: `Add ${type.label} "${title}"${date ? ` on ${date}` : ""}${owner ? `, owner ${owner}` : ""} to Programming board.`,
    rows: [
      { k: "Title", v: title },
      { k: "Type", v: type.label },
      ...(date ? [{ k: "Date", v: date, em: true }] : []),
      ...(owner ? [{ k: "Owner", v: owner }] : []),
    ],
  };
}

// ── Self-service builders ──────────────────────────────────────────────────
// Each acts on the ASKER's own record. Two things keep them fast and keep the
// model from inventing anything:
//
//   • The model passes the user's WORDS for the record ("chapter", "flyers"),
//     never an id. The builder matches them against only what the asker can act
//     on (their open tasks, polls assigned to them), in ONE query, alongside the
//     second read it needs — so the turn is one model call, not lookup +
//     propose, and a wrong-but-real id can't slip onto a card. Genuinely
//     different matches come back as a one-line question, never a guess.
//   • A figure that ends up on the card (dollars, hours) must be one the user
//     actually typed this conversation (pctx.userText) — otherwise the model is
//     told to ask. A card is the last check, but a plausible $40 is easy to
//     approve without reading.
//
// Each builder also checks what its endpoint would refuse (duplicate excuse,
// closed poll, same vote, task already done), so the member hears why before
// they click. The endpoint still enforces all of it.

const MATCH_STOPWORDS = new Set(["the", "my", "our", "for", "of", "at", "to", "on", "and", "this", "that", "next", "last", "option", "one"]);

/** Lowercase word tokens worth matching on; a trailing plural "s" is dropped so "flyers" finds "Print flyer". */
function matchTokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter(t => t.length >= 2 && !MATCH_STOPWORDS.has(t))
    .map(t => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

/** Items tied for the best non-zero score (tokens found, +1 when the whole phrase appears). */
function bestMatches<T>(items: T[], needle: string, text: (t: T) => string): T[] {
  const toks = matchTokens(needle);
  const phrase = needle.trim().toLowerCase();
  let best = 0;
  let out: T[] = [];
  for (const it of items) {
    const hay = text(it).toLowerCase();
    let score = toks.filter(t => hay.includes(t)).length;
    if (score > 0 && phrase && hay.includes(phrase)) score++;
    if (score > best) { best = score; out = [it]; }
    else if (score === best && score > 0) out.push(it);
  }
  return out;
}

/** "A (2026-10-02); B (2026-10-09)" — the candidates a clarifying question names. */
function listChoices(items: { label: string; date?: string | null }[], max = 5): string {
  return items.slice(0, max).map(i => (i.date ? `${i.label} (${i.date})` : i.label)).join("; ");
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A caller-supplied YYYY-MM-DD, undefined when absent, or an error when present but malformed. */
function optionalDate(v: unknown): string | undefined | { error: string } {
  if (typeof v !== "string" || !v.trim()) return undefined;
  return DATE_RE.test(v.trim()) ? v.trim() : badProposal("date must be YYYY-MM-DD.");
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

/** Every number the user typed: digits (with thousands commas), number words, "an hour", "half an hour". */
function statedNumbers(text: string): number[] {
  const t = text.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, "$1");
  const out = [...t.matchAll(/\d+(?:\.\d+)?/g)].map(m => Number(m[0]));
  for (const w of t.split(/[^a-z]+/)) if (w in NUMBER_WORDS) out.push(NUMBER_WORDS[w]);
  if (/\b(an|a) hour\b/.test(t)) out.push(1);
  if (/\bhalf (an|a) hour\b/.test(t)) out.push(0.5);
  return out;
}

/**
 * Refuse a figure the user never typed. Skipped when no user text is supplied
 * (the eval harness), so the check can only ever narrow, never block a caller
 * that can't provide it.
 */
function unstatedFigure(value: number, pctx: ProposalCtx, what: string): { error: string } | null {
  if (pctx.userText === undefined) return null;
  if (statedNumbers(pctx.userText).some(n => Math.abs(n - value) < 0.005)) return null;
  return badProposal(`The user never stated ${value} as the ${what}. Ask them for the exact ${what} — don't estimate or compute it.`);
}

async function actorHeldRoleIds(scoped: Scoped, actorId: number): Promise<Set<number>> {
  const rows = await scoped.brotherRole.findMany({ where: { brotherId: actorId }, select: { roleId: true } });
  return new Set(rows.map(r => r.roleId));
}

function assignedTo(assignments: { brotherId: number | null; roleId: number | null }[], actorId: number, held: Set<number>): boolean {
  return assignments.some(a => a.brotherId === actorId || (a.roleId != null && held.has(a.roleId)));
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 3)}…` : s;
}

type DatedRow = { id: number; title: string; date: string };

/**
 * Pick the dated record the user meant from `rows` (already narrowed to a date
 * or a window). A named date is decisive: if the words match nothing that day
 * but only one thing happens that day, that's it ("Thursday's meeting" when
 * the event is titled "Chapter"). Without a date, several dates of the SAME
 * title (a weekly meeting) resolve by `prefer`; different titles are asked.
 */
function resolveDated<T extends DatedRow>(
  rows: T[], words: string, date: string | undefined, extra: (r: T) => string, prefer: "upcoming" | "recent", noun: string,
): T | { error: string } {
  let hits = bestMatches(rows, words, r => `${r.title} ${extra(r)}`);
  if (hits.length === 0 && date && rows.length === 1) hits = rows;
  if (hits.length === 0) {
    return badProposal(date
      ? `No ${noun} matching "${words}" on ${date}.${rows.length ? ` That day has: ${listChoices(rows.map(r => ({ label: r.title })))}.` : ""} Ask the user which one they mean.`
      : `No ${noun} matching "${words}" around now. Ask the user for its name or date.`);
  }
  const titles = new Set(hits.map(h => h.title.trim().toLowerCase()));
  if (titles.size > 1) {
    return badProposal(`"${words}" matches several ${noun}s: ${listChoices(hits.map(h => ({ label: h.title, date: h.date })))}. Ask the user which one, in one line.`);
  }
  if (date) return hits[0];
  const today = todayISO();
  const upcoming = hits.filter(h => h.date >= today).sort((x, y) => x.date.localeCompare(y.date));
  const past = hits.filter(h => h.date < today).sort((x, y) => y.date.localeCompare(x.date));
  const pick = prefer === "upcoming" ? upcoming[0] : past[0];
  if (pick) return pick;
  // Nothing on the expected side of today ("can't make the golf outing" when
  // the only one was three weeks ago). Crossing over is a guess about tense
  // the user never made — confirm it, then the date makes it decisive.
  const other = (prefer === "upcoming" ? past : upcoming)[0];
  return badProposal(`The only ${noun} matching "${words}" is "${other.title}" on ${other.date}, which is ${prefer === "upcoming" ? "already past" : "still upcoming"}. Ask the user if they mean that one; if so, call again with date=${other.date}.`);
}

async function proposeSubmitExcuse(args: ToolArgs, scoped: Scoped, pctx: ProposalCtx): Promise<ProposalDraft | { error: string }> {
  const words = String(args.event ?? "").trim();
  const reason = String(args.reason ?? "").trim();
  const date = optionalDate(args.date);
  if (typeof date === "object") return date;
  if (!words) return badProposal("event required — the event as the user named it.");
  if (!reason) return badProposal("A reason is required — ask the user for one line on why they can't attend.");
  if (reason.length > 1000) return badProposal("Reason too long (1000 characters max).");

  // Excuses can be retroactive ("I missed chapter"), so the no-date window
  // reaches back a month as well as forward.
  const today = todayISO();
  const when = date ? date : { gte: shiftISO(today, -30), lte: shiftISO(today, 90) };
  const [events, mine] = await Promise.all([
    scoped.calendarEvent.findMany({ where: { date: when }, orderBy: { date: "asc" }, take: 300, select: { id: true, title: true, date: true, category: true } }),
    scoped.attendanceExcuse.findMany({ where: { brotherId: pctx.actorId, calendarEvent: { date: when } }, select: { calendarEventId: true, status: true } }),
  ]);
  const event = resolveDated(events, words, date, e => e.category, "upcoming", "event");
  if ("error" in event) return event;

  // An attendance manager's own excuse auto-approves (submitExcuse); everyone
  // else's queues for review, and can't be re-filed while one is live.
  const selfApproves = pctx.isPlatformAdmin || hasPermission(pctx.permissions, "MANAGE_ATTENDANCE");
  const existing = mine.find(x => x.calendarEventId === event.id)?.status;
  if (!selfApproves && existing === "approved") return badProposal(`Your excuse for "${event.title}" (${event.date}) is already approved.`);
  if (!selfApproves && existing === "pending") return badProposal(`You already have an excuse pending review for "${event.title}" (${event.date}).`);

  return {
    kind: "proposal",
    action: "propose_submit_excuse",
    endpoint: "/api/excuses",
    method: "POST",
    payload: { calendarEventId: event.id, reason },
    summary: `Excuse for "${event.title}" (${event.date}): ${reason}. ${selfApproves ? "Approved on submit." : "An officer reviews it."}`,
    rows: [
      { k: "Event", v: event.title },
      { k: "Date", v: event.date, em: true },
      { k: "Reason", v: clip(reason, 80) },
      { k: "Review", v: selfApproves ? "Approved on submit" : "Pending officer review" },
    ],
  };
}

async function proposeRequestReimbursement(args: ToolArgs, _scoped: Scoped, pctx: ProposalCtx): Promise<ProposalDraft | { error: string }> {
  const amount = r2(Number(args.amount));
  const description = String(args.description ?? "").trim();
  const d = optionalDate(args.date);
  if (typeof d === "object") return d;
  const date = d ?? todayISO();
  if (!(amount > 0)) return badProposal("amount must be a positive dollar figure — ask the user how much.");
  if (!description) return badProposal("description required — what was the money spent on?");
  if (description.length > 500) return badProposal("Description too long (500 characters max).");
  if (date > todayISO()) return badProposal("That date is in the future — a reimbursement is for money already spent.");
  const unstated = unstatedFigure(amount, pctx, "amount");
  if (unstated) return unstated;

  return {
    kind: "proposal",
    action: "propose_request_reimbursement",
    endpoint: "/api/reimbursements",
    method: "POST",
    payload: { brotherId: pctx.actorId, amount, date, description },
    summary: `Reimbursement request: ${fmtUsd(amount)} for "${description}" (${date}). A treasurer approves it before it's paid.`,
    rows: [
      { k: "Amount", v: fmtUsd(amount), em: true },
      { k: "For", v: clip(description, 60) },
      { k: "Date", v: date },
      { k: "Review", v: "Pending treasurer approval" },
    ],
  };
}

async function proposeLogMyServiceHours(args: ToolArgs, scoped: Scoped, pctx: ProposalCtx): Promise<ProposalDraft | { error: string }> {
  const words = String(args.event ?? "").trim();
  const hours = Math.round(Number(args.hours) * 100) / 100;
  const date = optionalDate(args.date);
  if (typeof date === "object") return date;
  if (!words) return badProposal("event required — the service event as the user named it.");
  // Mirrors logMyParticipationInput's cap; zero is left to the Service page,
  // where clearing your hours is a deliberate act rather than a chat misread.
  if (!(hours > 0) || hours > 1000) return badProposal("hours must be a positive number — ask the user how many.");
  const unstated = unstatedFigure(hours, pctx, "number of hours");
  if (unstated) return unstated;

  // Hours get logged after the fact, so the window leans back.
  const today = todayISO();
  const when = date ? date : { gte: shiftISO(today, -90), lte: shiftISO(today, 7) };
  const [events, mine] = await Promise.all([
    scoped.serviceEvent.findMany({ where: { date: when }, orderBy: { date: "asc" }, take: 300, select: { id: true, title: true, date: true, location: true } }),
    scoped.serviceParticipation.findMany({ where: { brotherId: pctx.actorId, serviceEvent: { date: when } }, select: { serviceEventId: true, hours: true } }),
  ]);
  const event = resolveDated(events, words, date, e => e.location ?? "", "recent", "service event");
  if ("error" in event) return event;
  const before = mine.find(p => p.serviceEventId === event.id)?.hours;
  if (before === hours) return badProposal(`You already have ${hours} hours logged for "${event.title}" (${event.date}).`);

  return {
    kind: "proposal",
    action: "propose_log_my_service_hours",
    endpoint: `/api/service-events/${event.id}/participation/me`,
    method: "POST",
    payload: { hours },
    summary: `Log ${hours} service hours at "${event.title}" (${event.date})${before !== undefined ? `, replacing ${before}` : ""}.`,
    rows: [
      { k: "Event", v: event.title },
      { k: "Date", v: event.date },
      { k: "Hours", v: String(hours), em: true },
      ...(before !== undefined ? [{ k: "Replaces", v: `${before} hours` }] : []),
    ],
  };
}

async function proposeCompleteTask(args: ToolArgs, scoped: Scoped, pctx: ProposalCtx): Promise<ProposalDraft | { error: string }> {
  const words = String(args.task ?? "").trim();
  if (!words) return badProposal("task required — the task as the user named it.");

  const [open, held] = await Promise.all([
    scoped.task.findMany({
      where: { status: "open" },
      orderBy: { dueDate: "asc" },
      take: 300,
      select: { id: true, title: true, dueDate: true, everyone: true, assignments: { select: { brotherId: true, roleId: true } } },
    }),
    actorHeldRoleIds(scoped, pctx.actorId),
  ]);
  // Same rule as updateTask: a status flip is open to the task's assignees;
  // anyone else needs MANAGE_TASKS. Matching only within that set means a
  // member's words can never land on somebody else's task.
  const manages = pctx.isPlatformAdmin || pctx.isOrgAdmin || hasPermission(pctx.permissions, "MANAGE_TASKS");
  const mine = manages ? open : open.filter(t => t.everyone != null || assignedTo(t.assignments, pctx.actorId, held));
  if (mine.length === 0) return badProposal(manages ? "There are no open tasks." : "You have no open tasks assigned to you.");

  const hits = bestMatches(mine, words, t => t.title);
  if (hits.length === 0) {
    return badProposal(`None of ${manages ? "the open tasks" : "your open tasks"} match "${words}". ${manages ? "Open" : "Yours"}: ${listChoices(mine.map(t => ({ label: t.title, date: t.dueDate })), 8)}. Ask which one.`);
  }
  if (hits.length > 1) {
    return badProposal(`"${words}" matches several open tasks: ${listChoices(hits.map(t => ({ label: t.title, date: t.dueDate })))}. Ask the user which one, in one line.`);
  }
  const task = hits[0];

  return {
    kind: "proposal",
    action: "propose_complete_task",
    endpoint: `/api/tasks/${task.id}`,
    method: "PATCH",
    payload: { status: "done" },
    summary: `Mark "${task.title}" done.`,
    rows: [
      { k: "Title", v: task.title },
      ...(task.dueDate ? [{ k: "Due", v: task.dueDate }] : []),
      { k: "Status", v: "Open → Done", em: true },
    ],
  };
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

/** The option the user meant: exact label, "B"/"option 2"/"the second one", or a unique word match. */
function pickOption<O extends { id: number; label: string }>(options: O[], said: string): O | null {
  const t = said.trim().toLowerCase().replace(/^(option|choice)\s+/, "").replace(/^the\s+/, "").replace(/\s+one$/, "");
  const exact = options.find(o => o.label.trim().toLowerCase() === t);
  if (exact) return exact;
  const byIndex = /^[a-z]$/.test(t) ? t.charCodeAt(0) - 97 : /^\d$/.test(t) ? Number(t) - 1 : ORDINALS.indexOf(t);
  if (byIndex >= 0 && byIndex < options.length) return options[byIndex];
  const hits = bestMatches(options, said, o => o.label);
  return hits.length === 1 ? hits[0] : null;
}

async function proposeCastVote(args: ToolArgs, scoped: Scoped, pctx: ProposalCtx): Promise<ProposalDraft | { error: string }> {
  const words = typeof args.poll === "string" ? args.poll.trim() : "";
  const said = String(args.option ?? "").trim();
  if (!said) return badProposal("option required — the choice the user picked.");

  const [open, held] = await Promise.all([
    scoped.poll.findMany({
      where: { status: "open" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, question: true,
        options: { orderBy: { position: "asc" }, select: { id: true, label: true } },
        assignments: { select: { brotherId: true, roleId: true } },
        votes: { where: { brotherId: pctx.actorId }, select: { optionId: true } },
      },
    }),
    actorHeldRoleIds(scoped, pctx.actorId),
  ]);
  // Only polls the asker may vote on (castVote's assignee rule) are candidates.
  const mine = open.filter(p => assignedTo(p.assignments, pctx.actorId, held));
  if (mine.length === 0) return badProposal("There are no open polls assigned to you.");

  let candidates = words ? bestMatches(mine, words, p => p.question) : mine;
  if (words && candidates.length === 0) {
    return badProposal(`No open poll of yours matches "${words}". Yours: ${listChoices(mine.map(p => ({ label: p.question })))}.`);
  }
  // No poll named (or a vague one): the poll whose options the pick fits.
  if (candidates.length > 1) {
    const fits = candidates.filter(p => pickOption(p.options, said));
    if (fits.length >= 1) candidates = fits;
  }
  if (candidates.length > 1) {
    return badProposal(`Several open polls could take "${said}": ${listChoices(candidates.map(p => ({ label: p.question })))}. Ask which poll, in one line.`);
  }
  const poll = candidates[0];
  const option = pickOption(poll.options, said);
  if (!option) {
    return badProposal(`"${said}" doesn't match exactly one option on "${poll.question}". Options: ${poll.options.map(o => o.label).join(" | ")}. Ask which.`);
  }
  const prior = poll.votes[0] ? poll.options.find(o => o.id === poll.votes[0].optionId) : undefined;
  if (prior?.id === option.id) return badProposal(`You already voted "${option.label}" on "${poll.question}".`);

  return {
    kind: "proposal",
    action: "propose_cast_vote",
    endpoint: `/api/polls/${poll.id}/vote`,
    method: "POST",
    payload: { optionId: option.id },
    summary: `Vote "${option.label}" on "${poll.question}"${prior ? `, changing from "${prior.label}"` : ""}.`,
    rows: [
      { k: "Poll", v: clip(poll.question, 80) },
      { k: "Your vote", v: option.label, em: true },
      ...(prior ? [{ k: "Replaces", v: prior.label }] : []),
    ],
  };
}

// Handlers may be sync or async; runProposal awaits either. The scoped client
// lets a handler read current state to enrich the card (validate-only — never a
// write); pctx is who's asking, which the self-service builders act for.
// Handlers that need neither simply ignore the trailing args.
type ProposalHandler = (args: ToolArgs, scoped: Scoped, pctx: ProposalCtx) =>
  | (ProposalDraft | { error: string })
  | Promise<ProposalDraft | { error: string }>;

const PROPOSAL_HANDLERS: Record<string, ProposalHandler> = {
  propose_add_deadline:           proposeAddDeadline,
  propose_add_instagram_task:     proposeAddInstagram,
  propose_add_calendar_event:     proposeAddCalendarEvent,
  propose_log_transaction:        proposeLogTransaction,
  propose_record_dues_payment:    proposeRecordDuesPayment,
  propose_add_programming_event:  proposeAddProgrammingEvent,
  propose_submit_excuse:          proposeSubmitExcuse,
  propose_request_reimbursement:  proposeRequestReimbursement,
  propose_log_my_service_hours:   proposeLogMyServiceHours,
  propose_complete_task:          proposeCompleteTask,
  propose_cast_vote:              proposeCastVote,
};

/**
 * True for a self-service proposal (perm null). Once its card is out there is
 * nothing left for the model to say — the chat route ends the turn instead of
 * paying a round trip for "Here's your card."
 */
export function isSelfServiceProposal(name: string): boolean {
  return PROPOSAL_META[name]?.perm === null;
}

/** True when the tool name is a write proposal (server validates but never writes). */
export function isProposalTool(name: string): boolean {
  return name in PROPOSAL_HANDLERS;
}

/**
 * Run a proposal tool. Validate-only — never writes. Never throws.
 *
 * On a valid draft, resolves the caller's authority (the permission gates both
 * proposing and approving — see ProposalPerm), looks up who does hold it when
 * the caller can't approve, and signs the blob so a later approval record can
 * trust it. `pctx` is the slice of RequestContext this needs; the eval harness
 * fabricates an all-permissions one.
 */
export async function runProposal(name: string, args: ToolArgs, scoped: Scoped, pctx: ProposalCtx): Promise<Proposal | { error: string }> {
  const handler = PROPOSAL_HANDLERS[name];
  const meta = PROPOSAL_META[name];
  if (!handler || !meta) return { error: `Unknown proposal: ${name}` };
  const v = validateArgs(name, args);
  if (!v.ok) return { error: v.error };
  try {
    const draft = await handler(args, scoped, pctx);
    if ("error" in draft) return draft;
    const { rows, ...core } = draft;
    const display: ProposalDisplay = { kind: meta.kind, title: meta.title, rows };
    const iat = Date.now();
    // Self-service: the handler already checked the caller may act on this
    // record, and there's no approval to record, so nothing to sign.
    if (meta.perm === null) {
      return { ...core, display, perm: { name: null, label: meta.label, canApprove: true }, sig: null, iat };
    }
    const canApprove = pctx.isPlatformAdmin || pctx.isOrgAdmin || hasPermission(pctx.permissions, meta.perm);
    const holders = canApprove ? undefined : await findPermHolders(scoped, pctx.orgId, meta.perm);
    const sig = signProposalBlob({
      action: core.action,
      endpoint: core.endpoint,
      method: core.method,
      payload: core.payload,
      display,
      perm: meta.perm,
      orgId: pctx.orgId,
      actorId: pctx.actorId,
      iat,
    });
    return {
      ...core,
      display,
      perm: { name: meta.perm, label: meta.label, canApprove, ...(holders ? { holders } : {}) },
      sig,
      iat,
    };
  } catch (e) { return { error: e instanceof Error ? e.message : "Proposal failed" }; }
}

// ────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ────────────────────────────────────────────────────────────────────────────

const READ_HANDLERS: Record<string, (args: ToolArgs, scoped: Scoped, orgId: number, now?: Date, access?: ToolAccess) => Promise<ToolResult>> = {
  list_brothers:           (args, scoped, orgId) => listBrothers(args, scoped, orgId),
  get_brother:             (args, scoped, orgId) => getBrother(args, scoped, orgId),
  list_deadlines:          (args, scoped) => listDeadlines(args, scoped),
  list_instagram_tasks:    (args, scoped) => listInstagram(args, scoped),
  list_calendar_events:    (args, scoped) => listCalendar(args, scoped),
  list_parties:            (args, scoped) => listParties(args, scoped),
  sum_transactions:        (args, scoped) => sumTransactions(args, scoped),
  get_treasury:            (_args, scoped) => getTreasury(scoped),
  get_budget:              (_args, scoped) => getBudget(scoped),
  recent_activity:         (args, scoped) => recentActivity(args, scoped),
  weekly_digest:           (_args, scoped, orgId, now) => weeklyDigest(scoped, orgId, now),
  get_event_attendance:    (args, scoped) => getEventAttendance(args, scoped),
  get_brother_attendance:  (args, scoped, _orgId, _now, access) => getBrotherAttendance(args, scoped, access),
  list_roles:              (args, scoped) => listRoles(args, scoped),
  list_service_events:     (args, scoped) => listServiceEvents(args, scoped),
  list_programming_events: (args, scoped) => listProgrammingEvents(args, scoped),
  get_custom_metrics:      (args, scoped, orgId) => getCustomMetrics(args, scoped, orgId),
  list_member_fields:      (args, scoped, orgId) => listMemberFields(args, scoped, orgId),
  list_polls:              (args, scoped, orgId, _now, access) => listPolls(args, scoped, orgId, access),
  list_reimbursements:     (args, scoped, orgId) => listReimbursements(args, scoped, orgId),
  list_dues_payments:      (args, scoped, orgId, _now, access) => listDuesPayments(args, scoped, orgId, access),
  search_docs:             (args, scoped) => searchDocs(args, scoped),
  get_announcement:        (_args, scoped) => getAnnouncement(scoped),
  list_join_requests:      (args, scoped, orgId, _now, access) => listJoinRequests(args, scoped, orgId, access),
  list_attendance_exemptions: (args, scoped, orgId, _now, access) => listAttendanceExemptions(args, scoped, orgId, access),
};

/**
 * Run a read tool and return its result (will be JSON-stringified and fed back
 * to the model as a `tool` message). On any failure, returns an `{error}` object
 * the model can react to, rather than throwing — keeps the chat loop alive.
 *
 * `now` pins date-relative tools (weekly_digest) for the eval harness; omit it
 * in prod so tools see the same real today as the system prompt.
 *
 * `access` is who's asking. Tools whose app screen is permission-gated (join
 * requests, exemptions, other members' dues payments, poll results) answer only
 * what that person could see in the app; without it they return the most
 * restrictive answer.
 */
export async function runTool(name: string, args: ToolArgs, scoped: Scoped, orgId: number, now?: Date, access?: ToolAccess): Promise<ToolResult> {
  const handler = READ_HANDLERS[name];
  if (!handler) return { error: `Unknown tool: ${name}` };
  const v = validateArgs(name, args);
  if (!v.ok) return { error: v.error };
  try {
    return await handler(args, scoped, orgId, now, access);
  } catch (e) {
    console.error(`runTool(${name}) failed:`, e);
    return { error: e instanceof Error ? e.message : "Tool failed" };
  }
}

/** True when the tool name is one the server should execute (read tool). */
export function isReadTool(name: string): boolean {
  return name in READ_HANDLERS;
}

// ────────────────────────────────────────────────────────────────────────────
// Per-tool UI metadata — feeds the client's reasoning ledger.
//
// Each tool call the model makes renders as one ledger step: `verb` is the
// step's line ("Checking payments"), `source` the Consulted/Sources chip label
// ("Treasury · dues"), and `finding` derives the short mono figure the step
// posts to the margin ("28 of 34 paid") from the ACTUAL tool result — never
// from anything the model claimed. Findings are plain text (no markup); the
// client highlights the numeric part. Colocated with TOOLS so a new tool
// can't ship without its ledger presence (tests/ai/tool-ui.test.ts enforces).
// ────────────────────────────────────────────────────────────────────────────

export interface ToolUiMeta {
  verb: string;
  source?: string;
  finding?: (result: unknown, args: ToolArgs) => string | null;
}

// Result-shape helpers. List tools return an array, or listResult()'s empty
// envelope; anything with `error` posts no finding.
function isErr(r: unknown): boolean {
  return typeof r === "object" && r !== null && "error" in r;
}
function rowsOf(r: unknown): unknown[] | null {
  if (Array.isArray(r)) return r;
  if (typeof r === "object" && r !== null && Array.isArray((r as { items?: unknown[] }).items)) {
    return (r as { items: unknown[] }).items;
  }
  return null;
}
function countFinding(noun: string, plural = `${noun}s`) {
  return (r: unknown): string | null => {
    if (isErr(r)) return null;
    const rows = rowsOf(r);
    if (!rows) return null;
    if (rows.length === 0) return "none found";
    return `${rows.length} ${rows.length === 1 ? noun : plural}`;
  };
}

export const TOOL_UI: Record<string, ToolUiMeta> = {
  list_brothers: {
    verb: "Reading the roster",
    source: "Roster",
    finding: (r, args) => {
      if (isErr(r)) return null;
      if (rowsOf(r)?.length === 0) return "none found";
      const s = (r as { summary?: { count: number; owingCount: number; totalDuesOwed: number } }).summary;
      if (!s) return null;
      if (args.owes_dues_only === true) return `${s.owingCount} owe · ${fmtUsd(s.totalDuesOwed)}`;
      return `${s.count} member${s.count === 1 ? "" : "s"}`;
    },
  },
  get_brother: {
    verb: "Looking up a member",
    source: "Roster",
    finding: r => {
      if (isErr(r)) return null;
      const o = r as { name?: string; matches?: number };
      if (typeof o.matches === "number") return `${o.matches} matches`;
      return typeof o.name === "string" ? o.name : null;
    },
  },
  list_deadlines: { verb: "Checking deadlines", source: "Timeline", finding: countFinding("deadline") },
  list_instagram_tasks: { verb: "Checking Instagram tasks", source: "Instagram", finding: countFinding("task") },
  list_calendar_events: { verb: "Scanning the calendar", source: "Events", finding: countFinding("event") },
  list_parties: { verb: "Reviewing parties", source: "Parties", finding: countFinding("party", "parties") },
  sum_transactions: {
    verb: "Summing the ledger",
    source: "Treasury · ledger",
    finding: r => {
      if (isErr(r)) return null;
      const t = (r as { totals?: { net: number; count: number } }).totals;
      if (!t) return null;
      if (t.count === 0) return "no transactions";
      return `net ${t.net < 0 ? "−" : "+"}${fmtUsd(Math.abs(t.net))}`;
    },
  },
  get_treasury: {
    verb: "Reading the treasury",
    source: "Treasury",
    finding: r => {
      if (isErr(r)) return null;
      const b = (r as { balance?: number }).balance;
      return typeof b === "number" ? `${fmtUsd(b)} on hand` : null;
    },
  },
  get_budget: {
    verb: "Opening the budget",
    source: "Budget",
    finding: r => {
      if (isErr(r)) return null;
      const pool = (r as { spendablePool?: number }).spendablePool;
      return typeof pool === "number" ? `${fmtUsd(pool)} pool` : null;
    },
  },
  recent_activity: { verb: "Skimming recent activity", source: "Activity", finding: countFinding("entry", "entries") },
  weekly_digest: {
    verb: "Gathering the week",
    source: "Timeline",
    finding: r => {
      if (isErr(r)) return null;
      const d = r as { deadlinesDue?: unknown[]; igDue?: unknown[]; events?: unknown[]; parties?: unknown[] };
      const n = (d.deadlinesDue?.length ?? 0) + (d.igDue?.length ?? 0) + (d.events?.length ?? 0) + (d.parties?.length ?? 0);
      return `${n} this week`;
    },
  },
  get_event_attendance: {
    verb: "Pulling attendance",
    source: "Attendance",
    finding: r => {
      if (isErr(r)) return null;
      const c = (r as { counts?: { attended: number; absent: number } }).counts;
      if (!c) return null;
      const total = c.attended + c.absent;
      return total === 0 ? "not logged yet" : `${c.attended} of ${total} attended`;
    },
  },
  get_brother_attendance: {
    verb: "Checking attendance",
    source: "Attendance",
    finding: r => {
      if (isErr(r)) return null;
      const c = (r as { counts?: { missed: number; total: number } }).counts;
      if (!c) return null;
      return `${c.missed} of ${c.total} missed`;
    },
  },
  list_roles: { verb: "Checking officer roles", source: "Roles", finding: countFinding("role") },
  list_service_events: { verb: "Scanning service events", source: "Service", finding: countFinding("event") },
  list_programming_events: { verb: "Scanning the programming board", source: "Programming", finding: countFinding("event") },
  get_custom_metrics: {
    verb: "Checking custom metrics",
    source: "Metrics",
    finding: r => {
      if (isErr(r)) return null;
      const o = r as { summary?: { metric: string; atRisk: number }; metrics?: unknown[] };
      if (o.summary) return `${o.summary.atRisk} at risk`;
      if (o.metrics) return `${o.metrics.length} metric${o.metrics.length === 1 ? "" : "s"}`;
      return rowsOf(r)?.length === 0 ? "none defined" : null;
    },
  },
  list_member_fields: {
    verb: "Reading member fields",
    source: "Roster · fields",
    finding: r => {
      if (isErr(r)) return null;
      const o = r as { matching?: number; fields?: unknown[] };
      if (typeof o.matching === "number") return `${o.matching} member${o.matching === 1 ? "" : "s"}`;
      if (o.fields) return `${o.fields.length} field${o.fields.length === 1 ? "" : "s"}`;
      return rowsOf(r)?.length === 0 ? "none defined" : null;
    },
  },
  list_polls: { verb: "Checking polls", source: "Polls", finding: countFinding("poll") },
  list_reimbursements: {
    verb: "Reviewing reimbursements",
    source: "Treasury · reimbursements",
    finding: r => {
      if (isErr(r)) return null;
      const s = (r as { summary?: { count: number; pendingCount: number; pendingTotal: number } }).summary;
      if (!s) return rowsOf(r)?.length === 0 ? "none found" : null;
      return s.pendingCount ? `${s.pendingCount} pending · ${fmtUsd(s.pendingTotal)}` : `${s.count} request${s.count === 1 ? "" : "s"}`;
    },
  },
  list_dues_payments: {
    verb: "Checking dues payments",
    source: "Dues · payments",
    finding: r => {
      if (isErr(r)) return null;
      const s = (r as { summary?: { count: number } }).summary;
      if (!s) return rowsOf(r)?.length === 0 ? "none found" : null;
      return `${s.count} payment${s.count === 1 ? "" : "s"}`;
    },
  },
  search_docs: { verb: "Searching docs", source: "Docs", finding: countFinding("doc") },
  get_announcement: {
    verb: "Reading the announcement",
    source: "Announcement",
    finding: r => (isErr(r) ? null : (r as { none?: boolean }).none ? "none posted" : "posted"),
  },
  list_join_requests: { verb: "Checking join requests", source: "Join requests", finding: countFinding("request") },
  list_attendance_exemptions: { verb: "Checking exemptions", source: "Attendance · exemptions", finding: countFinding("exemption") },
  // Proposal drafts: no source chip (their reads are incidental) and no posted
  // finding — the writ card that follows IS the result.
  propose_add_deadline:          { verb: "Drafting a deadline" },
  propose_add_instagram_task:    { verb: "Drafting an Instagram task" },
  propose_add_calendar_event:    { verb: "Drafting an event" },
  propose_log_transaction:       { verb: "Drafting a transaction" },
  propose_record_dues_payment:   { verb: "Drafting a payment record" },
  propose_add_programming_event: { verb: "Drafting a programming event" },
  propose_submit_excuse:         { verb: "Drafting your excuse" },
  propose_request_reimbursement: { verb: "Drafting your reimbursement" },
  propose_log_my_service_hours:  { verb: "Drafting your service hours" },
  propose_complete_task:         { verb: "Drafting a task update" },
  propose_cast_vote:             { verb: "Drafting your vote" },
  // Terminal answer tool — the client renders its own standing "Composing the
  // answer" step, but keep the verb here so nothing falls back to a raw name.
  compose_answer: { verb: "Composing the answer" },
};
