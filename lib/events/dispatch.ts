/**
 * Handler registry + dispatch.
 *
 * Handlers subscribe to actions via on(). dispatchHandlers() runs all matching
 * handlers in sequence, isolating failures so one bad handler can't break
 * another.
 *
 * Each handler is subject to HANDLER_TIMEOUT_MS so a slow side-effect (e.g.
 * attendance recalc on a large org) cannot block the HTTP response indefinitely.
 * A timed-out handler is logged and skipped; the business write already
 * committed before dispatch runs, so data is safe.
 *
 * Phase 2.5: synchronous, in-process. Phase 2.6: flip dispatchHandlers to
 * enqueue via Inngest — handler signatures stay the same, only this function
 * changes.
 */

/** Maximum wall-clock time for a single handler invocation. */
const HANDLER_TIMEOUT_MS = 3_000;

import { logError } from "@/lib/observability";
import type { RequestContext } from "@/lib/context";
import type { Action, EventMetadata, SubjectType } from "./actions";

export type Handler<A extends Action> = (
  ctx: RequestContext,
  payload: {
    subject:  { type: SubjectType; id: number };
    metadata: EventMetadata[A];
  },
) => Promise<void>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<Action, Handler<any>[]>();

export function on<A extends Action>(action: A, handler: Handler<A>): void {
  const existing = registry.get(action) ?? [];
  existing.push(handler);
  registry.set(action, existing);
}

export async function dispatchHandlers<A extends Action>(
  ctx: RequestContext,
  action: A,
  subject: { type: SubjectType; id: number },
  metadata: EventMetadata[A],
): Promise<void> {
  const handlers = registry.get(action);
  if (!handlers || handlers.length === 0) return;

  for (const handler of handlers) {
    try {
      await Promise.race([
        handler(ctx, { subject, metadata }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Handler timed out after ${HANDLER_TIMEOUT_MS}ms`)),
            HANDLER_TIMEOUT_MS,
          )
        ),
      ]);
    } catch (e) {
      logError(e, {
        route: "events/dispatch",
        method: "HANDLER",
        userId: ctx.actorId,
        extra: {
          action,
          subjectType: subject.type,
          subjectId:   subject.id,
          requestId:   ctx.requestId,
        },
      });
      // Continue dispatching other handlers; a single handler's failure or
      // timeout does not block the rest or roll back the business write.
    }
  }
}

/**
 * Derive a human-readable ActivityLog message from a structured event. Used by
 * the dual-write shim until the UI feed reads from OperationalEvent directly.
 *
 * Falls back to a generic verb when the action is unknown; specific cases get
 * tailored phrasing so the feed reads naturally.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatActivityMessage(ctx: RequestContext, action: Action, m: any): string {
  const who = ctx.actorName || "Someone";
  switch (action) {
    case "excuse.submitted":
      return m.autoApproved
        ? `${who} ${m.isRetroactive ? "submitted retroactive excuse for" : "excused"} brother #${m.brotherId}`
        : `${who} submitted excuse for review`;
    case "excuse.approved":
      return `${who} approved excuse for brother #${m.brotherId} (${m.eventTitle})`;
    case "excuse.rejected":
      return `${who} rejected excuse for brother #${m.brotherId} (${m.eventTitle})`;
    case "attendance.recorded":
      return `${who} recorded attendance for ${m.eventTitle}: ${m.presentCount}/${m.eligibleCount} present`;
    case "transaction.created":
      return `${who} added a $${Number(m.amount).toFixed(2)} ${m.type} for ${m.category}: ${m.description}`;
    case "transaction.updated":
      return `${who} updated transaction (${m.description})`;
    case "transaction.soft_deleted":
      return `${who} deleted transaction: ${m.description} ($${Number(m.amount).toFixed(2)})`;
    case "budget.upserted":
      return `${who} updated the ${m.semester} budget`;
    case "role.created":
      return `${who} created role "${m.name}" (rank ${m.rank})`;
    case "role.updated":
      return `${who} updated role "${m.name}"`;
    case "role.deleted":
      return `${who} deleted role "${m.name}" (was held by ${m.affectedBrothers} brother${m.affectedBrothers === 1 ? "" : "s"})`;
    case "role.granted":
      return `${who} granted role "${m.roleName}" to ${m.brotherName}`;
    case "role.revoked":
      return `${who} revoked role "${m.roleName}" from ${m.brotherName}`;
    case "brother.claimed":
      return `${m.name} claimed their profile (${m.email ?? "no email"})`;
    case "brother.added":
      return `${who} added ${m.name} as ${m.role}`;
    case "brother.updated":
      return `${who} updated ${m.name}'s ${m.changedFields.join(", ")}`;
    case "brother.removed":
      return `${who} removed ${m.name}`;
    case "brother.admin_changed":
      return `${who} ${m.isAdmin ? "promoted" : "demoted"} ${m.name}`;
    case "brother.account_unlinked":
      return m.bySelf
        ? `${m.name} unlinked their own account`
        : `${who} unlinked ${m.name}'s Google account`;
    case "calendar.created":
      return `${who} scheduled ${m.title} for ${m.date}`;
    case "calendar.updated":
      return `${who} updated event ${m.title}`;
    case "calendar.deleted":
      return `${who} deleted event ${m.title}`;
    case "programming.created":
      return `${who} added event idea ${m.title}`;
    case "programming.deleted":
      return `${who} deleted programming event ${m.title}`;
    case "service_event.created":
      return `${who} added service event ${m.title} on ${m.date}`;
    case "service_event.updated":
      return `${who} updated service event ${m.title}`;
    case "service_event.deleted":
      return `${who} deleted service event ${m.title}`;
    case "party.created":
      return `${who} scheduled ${m.name} on ${m.date}`;
    case "party.updated":
      return `${who} updated ${m.name}`;
    case "party.completed":
      return `${who} marked ${m.name} complete`;
    case "party.deleted":
      return `${who} deleted party ${m.name}`;
    case "task.created":
      return m.dueDate ? `${who} added task ${m.title} (due ${m.dueDate})` : `${who} added task ${m.title}`;
    case "task.updated":
      return `${who} updated task ${m.title}`;
    case "task.completed":
      return `${who} completed task ${m.title}`;
    case "task.reopened":
      return `${who} reopened task ${m.title}`;
    case "task.deleted":
      return `${who} deleted task ${m.title}`;
    case "instagram_task.created":
      return `${who} added IG task ${m.title}`;
    case "instagram_task.updated":
      return `${who} updated IG task ${m.title}`;
    case "instagram_task.deleted":
      return `${who} deleted IG task ${m.title}`;
    case "doc.created":
      return `${who} added doc: ${m.title}`;
    case "doc.updated":
      return `${who} updated doc: ${m.title}`;
    case "doc.deleted":
      return `${who} deleted doc: ${m.title}`;
    case "announcement.updated":
      return `${who} updated the chapter announcement`;
    case "semester.created":
      return `${who} created semester ${m.label} and made it active`;
    case "semester.activated":
      return `${who} set the active semester to ${m.label}`;
    case "org.created":
      return `${m.founderName} created the ${m.name} organization`;
    case "org.config.updated":
      return `${who} updated organization settings`;
    case "membership.left":
      return `${who} left ${m.orgName}`;
    default:
      return `${who} performed ${action}`;
  }
}
