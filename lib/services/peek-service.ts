// Peek cards — the read-only detail behind a tapped answer row in Ask Chapt.
//
// Tapping a result row used to send a follow-up QUESTION, which cost a full LLM
// turn (two model round trips and several seconds of dead air) to re-derive facts
// the DB can hand back directly. This service answers the same "tell me more
// about this record" in one request, deterministically.
//
// Read surface: a peek must show no more than the chat's read tools already show
// this member (lib/ai-tools) — the chat itself isn't permission-gated, so widening
// here would quietly open a new hole. Where a card wants something richer than the
// tools expose (excuse reasons, individual ledger lines), it stays out or sits
// behind the same permission the owning page uses.

import type { RequestContext } from "@/lib/context";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { isAttendanceExempt } from "@/lib/thresholds";
import { readStandingConfig, rosterMeasured } from "@/lib/member-standing";
import { ALL_TRACKED, anyMeasured, type TrackedMetrics } from "@/lib/tracked-metrics";
import { getBrotherStatus, type Brother as BrotherType, type BrotherStatus } from "@/app/data";
import { formatEventTime } from "@/lib/event-time";
import { fmtUsd } from "@/lib/money";
import { ExcuseStatus } from "@/lib/state";

export const PEEK_TYPES = ["member", "event", "task", "transaction"] as const;
export type PeekType = (typeof PEEK_TYPES)[number];

// The card is wire data (it also rides inline in a `record` answer), so its
// types live in lib/api-types; re-exported so existing imports don't move.
import type { PeekCard, PeekFact, PeekRow, PeekSection, PeekTone } from "@/lib/api-types";
export type { PeekCard, PeekFact, PeekRow, PeekSection, PeekTone };

// ────────────────────────────────────────────────────────────────────────────
// Formatting — matches how officers read these numbers elsewhere in the app.
// ────────────────────────────────────────────────────────────────────────────

function usd(n: number): string {
  return Number.isInteger(n)
    ? `$${n.toLocaleString("en-US")}`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "2026-07-14" → "Jul 14, 2026". Dates are stored as ISO day strings, not Date. */
function prettyDate(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// BrotherStatus is "Good" | "Watch" | "At Risk" (app/data.ts) — the middle tier
// is "Watch", not "Warning", or a flagged member reads as green on the card.
function statusTone(status: BrotherStatus): PeekTone {
  if (status === "At Risk") return "risk";
  if (status === "Watch") return "warn";
  return "good";
}


// ────────────────────────────────────────────────────────────────────────────
// Member
// ────────────────────────────────────────────────────────────────────────────

async function memberPeek(ctx: RequestContext, id: number): Promise<PeekCard> {
  // Everything the card needs, in one round of queries. Each scoped call is its
  // own BEGIN/SET LOCAL/COMMIT under RLS (lib/db/tenant), so serial awaits here
  // would stack real latency on a path whose whole point is being instant.
  const [brother, { thresholds, tracked }, recorded, roleRows, records] = await Promise.all([
    // The roster row for THIS org, org-local name already resolved — so the
    // separate Membership name lookup this used to need is gone.
    ctx.db.member.findRosterRow(id),
    readStandingConfig(ctx.db),
    // Which metrics anyone has a record for, narrowed to `tracked` below — in
    // parallel rather than after the config read, since it's the same answer.
    rosterMeasured(ctx.db, ALL_TRACKED),
    ctx.db.brotherRole.listWithRole([id]),
    // Relation-scoped: the wrapper ANDs calendarEvent.organizationId, so this
    // bare brotherId filter can't reach another org's attendance.
    ctx.db.attendanceRecord.findMany({
      where: { brotherId: id },
      include: { calendarEvent: { select: { title: true, date: true } } },
      take: 40,
    }),
  ]);
  if (!brother) throw new NotFoundError("Member");

  // Judged on what's been recorded, like the roster: on a new org a 0% and a
  // 0.00 are "not entered", and the card mustn't badge the member At Risk.
  const measured = Object.fromEntries(
    Object.entries(tracked).map(([k, on]) => [k, on && recorded[k as keyof TrackedMetrics]]),
  ) as TrackedMetrics;
  const status = getBrotherStatus(brother as BrotherType, thresholds, measured);
  const exempt = isAttendanceExempt(brother.attendance);

  // Relational roles are the truth; the roster row's `role` is stale free text on older rows.
  const roles = roleRows.map(r => r.role).sort((a, z) => z.rank - a.rank);
  const title = roles.length > 0 ? roles.map(r => r.name).join(" · ") : brother.role;

  // Only what the org tracks (the roster's columns), and "—" for a metric
  // nobody has a record for yet.
  const facts: PeekFact[] = [
    tracked.duesOwed && { k: "Dues owed", v: usd(brother.duesOwed), mono: true, tone: brother.duesOwed > 0 ? "warn" : "good" },
    tracked.attendance && (exempt ? { k: "Attendance", v: "Exempt" }
      : measured.attendance ? { k: "Attendance", v: `${Math.round(brother.attendance)}%`, mono: true }
      : { k: "Attendance", v: "—", tone: "muted" }),
    tracked.gpa && (measured.gpa ? { k: "GPA", v: brother.gpa.toFixed(2), mono: true } : { k: "GPA", v: "—", tone: "muted" }),
    tracked.serviceHours && { k: "Service hours", v: String(brother.serviceHours), mono: true },
  ].filter((f): f is PeekFact => !!f);

  // Most recent first. Excuse REASONS are deliberately absent — the state is
  // enough to explain the number, and the reason is the excuse review's business.
  const recent = records
    .sort((a, z) => z.calendarEvent.date.localeCompare(a.calendarEvent.date))
    .slice(0, 5)
    .map<PeekRow>(r => ({
      title: r.calendarEvent.title,
      subtitle: prettyDate(r.calendarEvent.date),
      value: r.attended ? "Present" : "Absent",
      tone: r.attended ? "good" : "risk",
    }));

  return {
    type: "member",
    id: brother.id,
    title: brother.name,
    subtitle: title,
    badge: anyMeasured(measured) ? { label: status, tone: statusTone(status) } : { label: "Not yet", tone: "muted" },
    facts,
    sections: [{ label: "Recent attendance", rows: recent, empty: "No attendance logged yet." }],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Event
// ────────────────────────────────────────────────────────────────────────────

async function eventPeek(ctx: RequestContext, id: number): Promise<PeekCard> {
  const [event, records, excuses] = await Promise.all([
    ctx.db.calendarEvent.findFirst({ where: { id } }),
    ctx.db.attendanceRecord.findMany({
      where: { calendarEventId: id },
      include: { brother: { select: { name: true, isGhost: true } } },
    }),
    // Approved only — a pending or rejected excuse doesn't excuse anyone.
    ctx.db.attendanceExcuse.findMany({ where: { calendarEventId: id, status: ExcuseStatus.Approved }, select: { brotherId: true } }),
  ]);
  if (!event) throw new NotFoundError("Event");

  // Ghosts are hidden from every other roster count; keep them out of this one.
  const visible = records.filter(r => !r.brother.isGhost);
  // An approved excuse wins over the record, as in the roster % (lib/attendance.ts):
  // an excused member is neither present nor absent.
  const excusedIds = new Set(excuses.map(e => e.brotherId));
  const attended = visible.filter(r => r.attended && !excusedIds.has(r.brotherId));
  const absent = visible.filter(r => !r.attended && !excusedIds.has(r.brotherId));

  // The date is the subtitle — repeating it here would spend a grid cell saying
  // what the header already said.
  const facts: PeekFact[] = [
    ...(formatEventTime(event.time, event.schedule) ? [{ k: "Time", v: formatEventTime(event.time, event.schedule)!, mono: true }] : []),
    ...(event.location ? [{ k: "Location", v: event.location }] : []),
    { k: "Category", v: event.category },
    { k: "Attendance required", v: event.mandatory ? "Yes" : "No", tone: event.mandatory ? "warn" : "muted" },
  ];

  // What's been spent on it: expenses linked to the event, the same filter
  // list_transactions uses (any member can read the ledger). After the reads
  // above rather than beside them — the pool is two connections.
  const linked = await ctx.db.transaction.findMany({
    where: { deletedAt: null, type: "expense", calendarEvents: { some: { calendarEventId: id } } },
    select: { amount: true },
  }) as Array<{ amount: number }>;
  if (linked.length > 0) {
    const spent = linked.reduce((sum, t) => sum + t.amount, 0);
    facts.push({ k: "Spent so far", v: `${fmtUsd(spent)} · ${linked.length} ${linked.length === 1 ? "expense" : "expenses"}`, mono: true });
  }

  const sections: PeekSection[] = [
    {
      label: "Attendance",
      rows: visible.length === 0 ? [] : [
        { title: "Present", value: String(attended.length), tone: "good" },
        { title: "Absent", value: String(absent.length), tone: absent.length > 0 ? "risk" : "muted" },
        { title: "Excused", value: String(excusedIds.size), tone: "muted" },
      ],
      empty: "No attendance logged for this event yet.",
    },
  ];

  // Who missed it is the actionable half of "how did attendance go" — the same
  // list get_event_attendance already returns to the chat.
  if (absent.length > 0) {
    sections.push({
      label: "Missed it",
      rows: absent.slice(0, 8).map<PeekRow>(r => ({ title: r.brother.name })),
    });
  }

  return {
    type: "event",
    id: event.id,
    title: event.title,
    subtitle: prettyDate(event.date),
    date: event.date,
    ...(event.mandatory ? { badge: { label: "Mandatory", tone: "warn" as PeekTone } } : {}),
    facts,
    sections,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Task
// ────────────────────────────────────────────────────────────────────────────

async function taskPeek(ctx: RequestContext, id: number): Promise<PeekCard> {
  // findMany, not findFirst: only the generic wrapper preserves the `include`
  // payload type through the scoping layer (see lib/db/tenant).
  const [task] = await ctx.db.task.findMany({
    where: { id },
    take: 1,
    include: {
      assignments: {
        include: {
          brother: { select: { name: true } },
          role:    { select: { name: true } },
        },
      },
    },
  });
  if (!task) throw new NotFoundError("Task");

  const done = task.status === "done";
  // Undated tasks are to-dos, not deadlines — no overdue state to compute.
  const overdue = !done && !!task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10);

  // A Task carries little beyond its date and state, so the card says each of
  // those exactly once: state in the badge, date in the facts, and the subtitle
  // names which KIND of row this is rather than echoing the date underneath it.
  const facts: PeekFact[] = [
    { k: "Due", v: task.dueDate ? prettyDate(task.dueDate) : "No due date", mono: !!task.dueDate, tone: overdue ? "risk" : undefined },
    ...(done && task.completedAt
      ? [{ k: "Completed", v: prettyDate(task.completedAt.toISOString().slice(0, 10)), mono: true, tone: "good" as PeekTone }]
      : []),
  ];

  // Role targets stay as one chip ("Role: Recruitment") rather than expanding to
  // holders — same as the timeline's own assignee display.
  const assignees: PeekRow[] = task.everyone
    ? [{ title: task.everyone === "each" ? "Everyone" : "Anyone", subtitle: task.everyone === "each" ? "Each member does their own" : "One person does it for the chapter" }]
    : task.assignments
    .map<PeekRow | null>(a =>
      a.brother ? { title: a.brother.name }
      : a.role   ? { title: a.role.name, subtitle: "Role" }
      : null)
    .filter((r): r is PeekRow => r !== null);

  return {
    type: "task",
    id: task.id,
    title: task.title,
    subtitle: task.dueDate ? "Deadline" : "To-do",
    ...(task.dueDate ? { date: task.dueDate } : {}),
    badge: { label: done ? "Done" : overdue ? "Overdue" : "Open", tone: done ? "good" : overdue ? "risk" : "warn" },
    facts,
    sections: [{ label: "Assigned to", rows: assignees, empty: "Unassigned." }],
  };
}

// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// Transaction — one ledger line. The same fields get_treasury and
// list_transactions already hand any member; who paid it back stays a status,
// not a name, as on the ledger page.
// ────────────────────────────────────────────────────────────────────────────

async function transactionPeek(ctx: RequestContext, id: number): Promise<PeekCard> {
  const tx = await ctx.db.transaction.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, date: true, type: true, amount: true, category: true, description: true, status: true, paymentMethod: true,
      reimbursement: { select: { status: true } },
      calendarEvents: { select: { calendarEvent: { select: { title: true, date: true } } } },
    },
  }) as unknown as {
    id: number; date: string; type: string; amount: number; category: string; description: string; status: string; paymentMethod: string | null;
    reimbursement: { status: string } | null;
    calendarEvents: Array<{ calendarEvent: { title: string; date: string } }>;
  } | null;
  if (!tx) throw new NotFoundError("Transaction");
  const category = await ctx.db.transactionCategory.findFirst({ where: { slug: tx.category }, select: { label: true } });
  const income = tx.type === "income";
  const scheduled = tx.status === "scheduled";
  const owed = tx.reimbursement?.status === "pending";
  const facts: PeekFact[] = [
    { k: income ? "Came in" : "Paid out", v: `${income ? "+" : "−"} ${usd(tx.amount)}`, mono: true, tone: income ? "good" : undefined },
    { k: "Category", v: category?.label ?? tx.category },
    ...(tx.paymentMethod ? [{ k: "Method", v: tx.paymentMethod }] : []),
    ...(tx.reimbursement ? [{ k: "Reimbursement", v: tx.reimbursement.status, tone: (owed ? "warn" : "muted") as PeekTone }] : []),
  ];
  const sections: PeekSection[] = tx.calendarEvents.length
    ? [{ label: "For", rows: tx.calendarEvents.map(l => ({ title: l.calendarEvent.title, subtitle: prettyDate(l.calendarEvent.date) })) }]
    : [];
  return {
    type: "transaction",
    id: tx.id,
    title: tx.description || (category?.label ?? tx.category),
    subtitle: prettyDate(tx.date),
    ...(scheduled || owed ? { badge: { label: scheduled ? "Scheduled" : "Pending", tone: "warn" as PeekTone } } : {}),
    facts,
    sections,
  };
}

export async function getPeek(ctx: RequestContext, type: PeekType, id: number): Promise<PeekCard> {
  switch (type) {
    case "member": return memberPeek(ctx, id);
    case "event":  return eventPeek(ctx, id);
    case "task":   return taskPeek(ctx, id);
    case "transaction": return transactionPeek(ctx, id);
    default:       throw new ValidationError(`Unknown peek type: ${type}`);
  }
}
