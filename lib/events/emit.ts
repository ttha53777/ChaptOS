/**
 * Structured event emission.
 *
 *   await emit(ctx, "excuse.approved", { type: "AttendanceExcuse", id: 42 }, {
 *     brotherId: 7, calendarEventId: 12, semesterId: 1, eventTitle: "Chapter Meeting",
 *   });
 *
 * What happens:
 *   1) Inserts a row in OperationalEvent (structured fact).
 *   2) Dispatches any registered handlers for this action (in-process,
 *      synchronous). Handler failures are logged but never roll back the caller.
 *   3) Dual-writes an ActivityLog row so the existing UI feed keeps working
 *      until Phase 3 cuts the feed over to OperationalEvent projections.
 *
 * Services should call emit() for every meaningful state change. Routes should
 * never call emit() directly — that's the service layer's responsibility.
 */

import type { Prisma } from "@/app/generated/prisma/client";
import { logError } from "@/lib/observability";
import type { RequestContext } from "@/lib/context";
import { type Action, type EventMetadata, type SubjectType, defaultActivityType, isKnownAction } from "./actions";
import { dispatchHandlers, formatActivityMessage } from "./dispatch";

export interface EmitOptions {
  /** Persist the fact, activity, and delivery intent with the business write. */
  transaction?: Prisma.TransactionClient;
  /**
   * Override the auto-derived ActivityLog message. Pass when the human-readable
   * verb in the feed differs from what defaultActivityType implies.
   */
  activityMessage?: string;
  /**
   * Override the auto-derived ActivityLog type. Defaults are defined in
   * actions.ts → defaultActivityType().
   */
  activityType?: "success" | "warning" | "info";
  /**
   * Pass false to skip the ActivityLog dual-write entirely — for telemetry-grade
   * actions (assistant feedback, audit-mirror events) whose feed story is
   * already told by the underlying domain event, or that members should never
   * see in the feed. The OperationalEvent row is always written.
   */
  activity?: boolean;
}

export async function emit<A extends Action>(
  ctx: RequestContext,
  action: A,
  subject: { type: SubjectType; id: number },
  metadata: EventMetadata[A],
  options: EmitOptions = {},
): Promise<void> {
  if (options.transaction) {
    if (action !== "join_request.approved" && action !== "join_request.rejected") {
      throw new Error("Transactional delivery is currently supported for admission decisions only");
    }
    const tx = options.transaction;
    await tx.operationalEvent.create({ data: {
      organizationId: ctx.orgId, requestId: ctx.requestId, actorId: ctx.actorId,
      action, subjectType: subject.type, subjectId: subject.id, metadata: metadata as object,
      deliveryPending: true, deliveryAvailableAt: new Date(), deliveryActorName: ctx.actorName,
    } });
    if (options.activity !== false) await tx.activityLog.create({ data: {
      organizationId: ctx.orgId, actorId: ctx.actorId,
      type: options.activityType ?? defaultActivityType(action),
      message: options.activityMessage ?? formatActivityMessage(ctx, action, metadata),
    } });
    return;
  }
  if (!isKnownAction(action)) {
    // Defensive: typing should make this impossible, but a string cast could
    // slip through. Log and continue — we'd rather lose an event than break
    // a write path.
    console.warn(`emit: unknown action "${action}"`);
  }

  // 1) Insert the structured event.
  try {
    await ctx.db.operationalEvent.create({
      data: {
        requestId:      ctx.requestId,
        actorId:        ctx.actorId,
        action,
        subjectType:    subject.type,
        subjectId:      subject.id,
        metadata:       metadata as object,
      },
    });
  } catch (e) {
    logError(e, {
      route: "events/emit",
      method: "INSERT",
      userId: ctx.actorId,
      extra: { action, subjectType: subject.type, subjectId: subject.id, requestId: ctx.requestId },
    });
    // Don't throw — losing telemetry shouldn't fail business writes.
  }

  // 2) Dual-write ActivityLog (UI feed backward-compat) — unless suppressed.
  if (options.activity !== false) try {
    const type = options.activityType ?? defaultActivityType(action);
    const message = options.activityMessage ?? formatActivityMessage(ctx, action, metadata);
    await ctx.db.activityLog.create({
      data: {
        actorId:        ctx.actorId,
        type,
        message,
      },
    });
  } catch (e) {
    logError(e, {
      route: "events/emit",
      method: "ACTIVITY_LOG",
      userId: ctx.actorId,
      extra: { action, requestId: ctx.requestId },
    });
  }

  // 3) Dispatch handlers (synchronous, in-process). Handler failures are
  // isolated per-handler and logged with requestId for correlation.
  await dispatchHandlers(ctx, action, subject, metadata);
}
