/**
 * The Ask Chapt approval record.
 *
 * Proposals are ephemeral (validate-only in lib/ai-tools.ts; the client POSTs
 * the payload to the real route on confirm). What persists is the APPROVAL:
 * after the underlying write succeeds, the client echoes back the proposal
 * blob the server HMAC-signed at draft time, and recordChatApproval writes the
 * durable audit row from it. The signature — not the client — attests the
 * card's contents; a tampered blob writes nothing.
 *
 * Trust model on record:
 *   1. sig verifies over {blob, perm, orgId, actorId, iat} rebuilt from server
 *      state — so the approver must be the same member, in the same org, the
 *      proposal was drafted for (the permission model: proposer == approver).
 *   2. The actor must (still) hold the required permission — defense in depth;
 *      the underlying POST already enforced it.
 */

import type { RequestContext } from "@/lib/context";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { verifyProposalBlob } from "@/lib/ai-approval-sig";
import { PROPOSAL_META } from "@/lib/ai-tools";
import { hasPermission } from "@/lib/permissions";
import { emit } from "@/lib/events";
import type { RecordApprovalInput } from "@/lib/validation/ai";

// Where each proposal's approved POST lands — the audit row's subject link.
const SUBJECT_BY_ACTION: Record<string, string> = {
  propose_add_deadline:          "Task",
  propose_add_instagram_task:    "InstagramTask",
  propose_add_calendar_event:    "CalendarEvent",
  propose_log_transaction:       "Transaction",
  propose_record_dues_payment:   "Transaction",
  propose_add_programming_event: "ProgrammingEvent",
};

interface ApprovalRow {
  id: number;
  kind: string;
  title: string;
  summary: string;
  rows: unknown;
  permLabel: string;
  approvedByName: string;
  approvedByRole: string;
  approvedAt: Date;
}

function shape(r: ApprovalRow) {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    summary: r.summary,
    rows: r.rows,
    permLabel: r.permLabel,
    approvedByName: r.approvedByName,
    approvedByRole: r.approvedByRole,
    approvedAt: r.approvedAt.toISOString(),
  };
}

/**
 * The actor's office title at approval time — snapshot for the record.
 * Same precedence as roleTitle() in app/data.ts: relational roles are the
 * source of truth; the free-text Brother.role covers members who hold no
 * relational role (plain members, imported rosters, committee labels).
 */
async function actorRoleTitle(ctx: RequestContext): Promise<string> {
  try {
    const roles = await ctx.db.role.findMany({
      where: { brothers: { some: { brotherId: ctx.actorId } } },
      orderBy: { rank: "desc" },
      select: { name: true },
    });
    if (roles.length > 0) return roles[0].name;
    const m = await ctx.db.member.findByBrotherId(ctx.actorId);
    return m?.role?.trim() || "Member";
  } catch {
    return "Member";
  }
}

/** List-row label: the writ title + the row that names what it acted on. */
function deriveSummary(display: RecordApprovalInput["display"]): string {
  const rows = display.rows;
  const named = rows.find(r => r.k === "Title")?.v
    ?? rows.find(r => r.k === "Brother")?.v
    ?? rows.find(r => r.em)?.v;
  return named ? `${display.title} · ${named}` : display.title;
}

export async function recordChatApproval(ctx: RequestContext, input: RecordApprovalInput) {
  const meta = PROPOSAL_META[input.action];
  if (!meta) throw new ValidationError("Unknown proposal action.");
  if (input.display.kind !== meta.kind) throw new ValidationError("Proposal kind mismatch.");

  // Rebuild the signed blob exactly as runProposal signed it. perm, orgId, and
  // actorId come from SERVER state, so a blob drafted for someone else — or
  // another org — cannot verify here.
  const blob = {
    action: input.action,
    endpoint: input.endpoint,
    method: input.method,
    payload: input.payload,
    display: input.display,
    perm: meta.perm,
    orgId: ctx.orgId,
    actorId: ctx.actorId,
    iat: input.iat,
  };
  if (!verifyProposalBlob(blob, input.sig)) {
    throw new ForbiddenError("Proposal could not be verified.");
  }
  if (!(ctx.isPlatformAdmin || ctx.isOrgAdmin || hasPermission(ctx.permissions, meta.perm))) {
    throw new ForbiddenError(`Recording this approval requires ${meta.label}.`);
  }

  const approvedByRole = await actorRoleTitle(ctx);
  const subjectType = SUBJECT_BY_ACTION[input.action] ?? null;
  const subjectId = input.subjectId ?? null;

  const row = await ctx.db.chatApproval.create({
    data: {
      kind: meta.kind,
      action: input.action,
      title: input.display.title,
      summary: deriveSummary(input.display),
      rows: input.display.rows,
      permission: meta.perm,
      permLabel: meta.label,
      approvedById: ctx.actorId,
      approvedByName: ctx.actorName,
      approvedByRole,
      subjectType,
      subjectId,
      requestId: ctx.requestId,
    },
  });

  // The underlying domain event (transaction.created, task.created, …) already
  // told the feed's story — this one is the audit mirror, feed-silent.
  await emit(ctx, "assistant.proposal_approved", { type: "ChatApproval", id: row.id }, {
    action: input.action,
    kind: meta.kind,
    permission: meta.perm,
    subjectType,
    subjectId,
  }, { activity: false });

  return shape(row);
}

/**
 * Record the approval of an event booked from the event-idea panel.
 *
 * The panel is the one proposal surface where the CONFIRMED values are not the
 * signed ones. Every other card is drafted complete and ratified as-is, so the
 * client can echo the signed blob back and recordChatApproval verifies it
 * verbatim. Here the whole point is that the card opens with a blank date the
 * user fills in, so the signed payload (drafted against a placeholder) and the
 * payload that actually got booked necessarily differ — echoing the former would
 * file an audit row that misstates what happened, and echoing the latter would
 * fail the HMAC and file nothing.
 *
 * So this path doesn't trust a blob at all. The client sends only the id of the
 * row its POST created; the audit line is then built by READING THAT ROW BACK
 * through ctx.db, which is org-scoped — a caller can only ever record an event
 * that exists, in their own org, and the recorded values are the committed ones
 * by construction rather than by attestation. That is strictly stronger than a
 * signature over client-held values, which is why no sig is required here.
 */
export async function recordEventIdeaApproval(ctx: RequestContext, eventId: number) {
  const meta = PROPOSAL_META.propose_add_calendar_event;
  if (!(ctx.isPlatformAdmin || ctx.isOrgAdmin || hasPermission(ctx.permissions, meta.perm))) {
    throw new ForbiddenError(`Recording this approval requires ${meta.label}.`);
  }

  const event = await ctx.db.calendarEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new ValidationError("No such event.");

  const rows = [
    { k: "Title", v: event.title },
    { k: "Date", v: event.date, em: true },
    { k: "Category", v: event.category },
    ...(event.time ? [{ k: "Time", v: event.time }] : []),
    ...(event.location ? [{ k: "Location", v: event.location }] : []),
    ...(event.mandatory ? [{ k: "Mandatory", v: "Yes" }] : []),
  ];
  const display = { kind: meta.kind, title: meta.title, rows };
  const approvedByRole = await actorRoleTitle(ctx);

  const row = await ctx.db.chatApproval.create({
    data: {
      kind: meta.kind,
      action: "propose_add_calendar_event",
      title: meta.title,
      summary: deriveSummary(display),
      rows,
      permission: meta.perm,
      permLabel: meta.label,
      approvedById: ctx.actorId,
      approvedByName: ctx.actorName,
      approvedByRole,
      subjectType: SUBJECT_BY_ACTION.propose_add_calendar_event,
      subjectId: event.id,
      requestId: ctx.requestId,
    },
  });

  await emit(ctx, "assistant.proposal_approved", { type: "ChatApproval", id: row.id }, {
    action: "propose_add_calendar_event",
    kind: meta.kind,
    permission: meta.perm,
    subjectType: SUBJECT_BY_ACTION.propose_add_calendar_event,
    subjectId: event.id,
  }, { activity: false });

  return shape(row);
}

export async function listChatApprovals(ctx: RequestContext, opts: { kind?: string } = {}) {
  const rows = await ctx.db.chatApproval.findMany({
    where: opts.kind ? { kind: opts.kind } : {},
    orderBy: { approvedAt: "desc" },
    take: 100,
  });
  return { approvals: rows.map(shape) };
}
