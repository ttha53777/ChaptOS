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
import { resolveThresholds, isAttendanceExempt, type Thresholds } from "@/lib/thresholds";
import { getBrotherStatus, type Brother as BrotherType, type BrotherStatus } from "@/app/data";

export const PEEK_TYPES = ["member", "event", "task"] as const;
export type PeekType = (typeof PEEK_TYPES)[number];

/** Colour intent for a fact or badge. Maps to the spotlight's existing tones. */
export type PeekTone = "good" | "warn" | "risk" | "muted";

export interface PeekFact {
  k: string;
  v: string;
  /** Render the value in the mono face — figures, dates, counts. */
  mono?: boolean;
  tone?: PeekTone;
}

export interface PeekRow {
  title: string;
  subtitle?: string;
  value?: string;
  tone?: PeekTone;
}

export interface PeekSection {
  label: string;
  rows: PeekRow[];
  /** Shown in place of rows when the section is legitimately empty. */
  empty?: string;
}

export interface PeekCard {
  type: PeekType;
  id: number;
  title: string;
  subtitle?: string;
  badge?: { label: string; tone: PeekTone };
  facts: PeekFact[];
  sections: PeekSection[];
}

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

async function orgThresholds(ctx: RequestContext): Promise<Thresholds> {
  const config = await ctx.db.organizationConfig.find();
  return resolveThresholds(config?.thresholds);
}

// ────────────────────────────────────────────────────────────────────────────
// Member
// ────────────────────────────────────────────────────────────────────────────

async function memberPeek(ctx: RequestContext, id: number): Promise<PeekCard> {
  // Everything the card needs, in one round of queries. Each scoped call is its
  // own BEGIN/SET LOCAL/COMMIT under RLS (lib/db/tenant), so serial awaits here
  // would stack real latency on a path whose whole point is being instant.
  const [brother, thresholds, roleRows, nameOverride, records] = await Promise.all([
    ctx.db.brother.findFirst({ where: { id, isGhost: false } }),
    orgThresholds(ctx),
    ctx.db.brotherRole.listWithRole([id]),
    ctx.db.membership.findFirst({ where: { brotherId: id, name: { not: null } }, select: { name: true } }),
    // Relation-scoped: the wrapper ANDs calendarEvent.organizationId, so this
    // bare brotherId filter can't reach another org's attendance.
    ctx.db.attendanceRecord.findMany({
      where: { brotherId: id },
      include: { calendarEvent: { select: { title: true, date: true } } },
      take: 40,
    }),
  ]);
  if (!brother) throw new NotFoundError("Member");

  const status = getBrotherStatus(brother as BrotherType, thresholds);
  const exempt = isAttendanceExempt(brother.attendance);

  // Relational roles are the truth; Brother.role is stale free text on older rows.
  const roles = roleRows.map(r => r.role).sort((a, z) => z.rank - a.rank);
  const title = roles.length > 0 ? roles.map(r => r.name).join(" · ") : brother.role;

  const facts: PeekFact[] = [
    { k: "Dues owed", v: usd(brother.duesOwed), mono: true, tone: brother.duesOwed > 0 ? "warn" : "good" },
    { k: "Attendance", v: exempt ? "Exempt" : `${Math.round(brother.attendance)}%`, mono: !exempt },
    { k: "GPA", v: brother.gpa.toFixed(2), mono: true },
    { k: "Service hours", v: String(brother.serviceHours), mono: true },
  ];

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
    title: nameOverride?.name ?? brother.name,
    subtitle: title,
    badge: { label: status, tone: statusTone(status) },
    facts,
    sections: [{ label: "Recent attendance", rows: recent, empty: "No attendance logged yet." }],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Event
// ────────────────────────────────────────────────────────────────────────────

async function eventPeek(ctx: RequestContext, id: number): Promise<PeekCard> {
  const [event, records, excusedCount] = await Promise.all([
    ctx.db.calendarEvent.findFirst({ where: { id } }),
    ctx.db.attendanceRecord.findMany({
      where: { calendarEventId: id },
      include: { brother: { select: { name: true, isGhost: true } } },
    }),
    ctx.db.attendanceExcuse.count({ where: { calendarEventId: id } }),
  ]);
  if (!event) throw new NotFoundError("Event");

  // Ghosts are hidden from every other roster count; keep them out of this one.
  const visible = records.filter(r => !r.brother.isGhost);
  const attended = visible.filter(r => r.attended);
  const absent = visible.filter(r => !r.attended);

  // The date is the subtitle — repeating it here would spend a grid cell saying
  // what the header already said.
  const facts: PeekFact[] = [
    ...(event.time ? [{ k: "Time", v: event.time, mono: true }] : []),
    ...(event.location ? [{ k: "Location", v: event.location }] : []),
    { k: "Category", v: event.category },
    { k: "Attendance required", v: event.mandatory ? "Yes" : "No", tone: event.mandatory ? "warn" : "muted" },
  ];

  const sections: PeekSection[] = [
    {
      label: "Attendance",
      rows: visible.length === 0 ? [] : [
        { title: "Present", value: String(attended.length), tone: "good" },
        { title: "Absent", value: String(absent.length), tone: absent.length > 0 ? "risk" : "muted" },
        { title: "Excused", value: String(excusedCount), tone: "muted" },
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
  const assignees = task.assignments
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
    badge: { label: done ? "Done" : overdue ? "Overdue" : "Open", tone: done ? "good" : overdue ? "risk" : "warn" },
    facts,
    sections: [{ label: "Assigned to", rows: assignees, empty: "Unassigned." }],
  };
}

// ────────────────────────────────────────────────────────────────────────────

export async function getPeek(ctx: RequestContext, type: PeekType, id: number): Promise<PeekCard> {
  switch (type) {
    case "member": return memberPeek(ctx, id);
    case "event":  return eventPeek(ctx, id);
    case "task":   return taskPeek(ctx, id);
    default:       throw new ValidationError(`Unknown peek type: ${type}`);
  }
}
