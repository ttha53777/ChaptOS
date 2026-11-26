/**
 * Push notifications. Each handler works out who should hear about the event,
 * and lib/push/queue.ts drops the actor and anyone who opted out, writes the
 * outbox rows and schedules the send for after the response. Nothing here
 * talks to Expo, so a large roster stays well inside the 3s handler budget.
 *
 * Every dedupeKey identifies the push itself (the recipient is appended), so a
 * retried delivery — join_request.approved replays from the admission outbox —
 * or a handler re-run can never queue the same push twice.
 */
import { on } from "../dispatch";
import { pushEnabled } from "@/lib/push/config";
import { pushCopy } from "@/lib/push/copy";
import { queuePush } from "@/lib/push/queue";
import { activeRoster, assigneesOf, expectedAtCheckIn, holdersOf } from "@/lib/push/recipients";
import { sanitizeVocabOverrides } from "@/lib/vocab";
import { PushCategory } from "@/lib/state/push";
import type { RequestContext } from "@/lib/context";

/** A reopen or a second open within this window doesn't buzz the same person again. */
const CHECKIN_QUIET_MS = 10 * 60_000;

async function checkInPush(ctx: RequestContext, calendarEventId: number, title: string, reopened: boolean) {
  if (!pushEnabled()) return;
  const event = await ctx.db.calendarEvent.findUnique({ where: { id: calendarEventId }, select: { checkInOpenedAt: true } });
  if (!event?.checkInOpenedAt) return;
  const prefix = `checkin:${calendarEventId}:`;
  const [expected, recent] = await Promise.all([
    expectedAtCheckIn(ctx, calendarEventId),
    ctx.db.pushMessage.recentRecipients(prefix, new Date(Date.now() - CHECKIN_QUIET_MS)),
  ]);
  const quiet = new Set(recent);
  await queuePush(ctx, {
    category: PushCategory.Checkin,
    recipients: expected.filter(id => !quiet.has(id)),
    dedupeKey: `${prefix}${event.checkInOpenedAt.getTime()}`,
    copy: reopened ? pushCopy.checkinReopened(title) : pushCopy.checkinOpened(title),
    path: "checkin",
  });
}

on("checkin.opened",   (ctx, { metadata }) => checkInPush(ctx, metadata.calendarEventId, metadata.eventTitle, false));
on("checkin.reopened", (ctx, { metadata }) => checkInPush(ctx, metadata.calendarEventId, metadata.eventTitle, true));

/** Everyone a task's audience covers right now. */
async function taskAudience(ctx: RequestContext, a: { everyone: string | null; brotherIds: number[]; roleIds: number[] }) {
  return a.everyone ? activeRoster(ctx) : assigneesOf(ctx, a);
}

async function loadTask(ctx: RequestContext, id: number) {
  const [task, assignments] = await Promise.all([
    ctx.db.task.findFirst({ where: { id } }),
    ctx.db.taskAssignment.findMany({ where: { taskId: id } }),
  ]);
  return task ? { ...task, assignments } : null;
}

const split = (rows: { brotherId: number | null; roleId: number | null }[]) => ({
  brotherIds: rows.flatMap(r => (r.brotherId != null ? [r.brotherId] : [])),
  roleIds:    rows.flatMap(r => (r.roleId != null ? [r.roleId] : [])),
});

on("task.created", async (ctx, { subject }) => {
  if (!pushEnabled()) return;
  const task = await loadTask(ctx, subject.id);
  if (!task) return;
  await queuePush(ctx, {
    category: PushCategory.Tasks,
    recipients: await taskAudience(ctx, { everyone: task.everyone, ...split(task.assignments) }),
    dedupeKey: `task:${task.id}:new`,
    copy: pushCopy.task(task.title, task.dueDate),
    path: `tasks/${task.id}`,
  });
});

on("task.updated", async (ctx, { subject, metadata }) => {
  if (!pushEnabled() || !metadata.before) return;
  const task = await loadTask(ctx, subject.id);
  if (!task || task.status === "done") return;
  const [now, before] = await Promise.all([
    taskAudience(ctx, { everyone: task.everyone, ...split(task.assignments) }),
    taskAudience(ctx, metadata.before),
  ]);
  const had = new Set(before);
  // Keyed per task, not per edit: being dropped and re-added doesn't buzz twice.
  await queuePush(ctx, {
    category: PushCategory.Tasks,
    recipients: now.filter(id => !had.has(id)),
    dedupeKey: `task:${task.id}:new`,
    copy: pushCopy.task(task.title, task.dueDate),
    path: `tasks/${task.id}`,
  });
});

on("poll.created", async (ctx, { subject, metadata }) => {
  if (!pushEnabled()) return;
  const [poll, assignments] = await Promise.all([
    ctx.db.poll.findFirst({ where: { id: subject.id } }),
    ctx.db.pollAssignment.findMany({ where: { pollId: subject.id } }),
  ]);
  if (!poll) return;
  await queuePush(ctx, {
    category: PushCategory.Tasks,
    recipients: poll.everyone ? await activeRoster(ctx) : await assigneesOf(ctx, split(assignments)),
    dedupeKey: `poll:${poll.id}:new`,
    copy: pushCopy.poll(metadata.question, metadata.closeDate),
    path: `polls/${poll.id}`,
  });
});

on("dues.charge_issued", async (ctx, { metadata }) => {
  if (!pushEnabled()) return;
  const [lines, config] = await Promise.all([
    ctx.db.duesChargeLine.findMany({ where: { chargeId: metadata.chargeId, voidedAt: null }, select: { brotherId: true } }),
    ctx.db.organizationConfig.find(),
  ]);
  const vocab = sanitizeVocabOverrides((config?.vocabularyOverrides ?? {}) as Record<string, string>);
  await queuePush(ctx, {
    category: PushCategory.Dues,
    recipients: lines.map(l => l.brotherId),
    dedupeKey: `dues:${metadata.chargeId}`,
    copy: pushCopy.dues(metadata.name, metadata.dueDate, vocab),
    path: "dues",
  });
});

on("excuse.approved", async (ctx, { subject, metadata }) => {
  if (!pushEnabled()) return;
  await queuePush(ctx, {
    category: PushCategory.Attendance,
    recipients: [metadata.brotherId],
    dedupeKey: `excuse:${subject.id}:approved`,
    copy: pushCopy.excuseApproved(metadata.eventTitle),
    path: "excuses",
  });
});

// Replayed by the admission outbox (lib/events/admission-delivery.ts), so it
// must be idempotent. The key carries the membership's joinedAt: a person
// removed and later approved again (same JoinRequest row) still hears it.
on("join_request.approved", async (ctx, { metadata }) => {
  if (!pushEnabled()) return;
  const [membership, org] = await Promise.all([
    ctx.db.member.findFirst({ where: { brotherId: metadata.brotherId }, select: { joinedAt: true } }),
    ctx.db.organization.findUnique({ where: { id: ctx.orgId }, select: { name: true } }),
  ]);
  if (!org) return;
  const stamp = membership?.joinedAt ? membership.joinedAt.getTime() : 0;
  await queuePush(ctx, {
    category: "membership",
    recipients: [metadata.brotherId],
    dedupeKey: `joined:${metadata.brotherId}:${stamp}`,
    copy: pushCopy.joined(org.name),
    path: "today",
  });
});

// Officer-only. Emitted from the applicant's bootstrap path (they have no
// member context), which dispatches here after its transaction commits.
on("join_request.submitted", async (ctx, { subject, metadata }) => {
  if (!pushEnabled()) return;
  const [officers, org, request] = await Promise.all([
    holdersOf(ctx, "MANAGE_BROTHERS"),
    ctx.db.organization.findUnique({ where: { id: ctx.orgId }, select: { name: true } }),
    ctx.db.joinRequest.findFirst({ where: { id: subject.id }, select: { createdAt: true } }),
  ]);
  if (!org) return;
  await queuePush(ctx, {
    category: PushCategory.Requests,
    recipients: officers,
    dedupeKey: `join:${subject.id}:${request?.createdAt.getTime() ?? 0}`,
    copy: pushCopy.joinRequest(metadata.name, org.name),
    path: "requests",
  });
});
