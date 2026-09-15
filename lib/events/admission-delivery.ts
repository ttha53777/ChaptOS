import { db } from "@/lib/db";
import { prismaPrivileged } from "@/lib/prisma-privileged";
import type { RequestContext } from "@/lib/context";
import type { EventMetadata } from "./actions";
import { dispatchHandlers } from "./dispatch";
import { logError } from "@/lib/observability";
import "./handlers";

/**
 * Durable admission outbox. Workers claim with a lease and conditional update;
 * a crash leaves a retryable row. Reactions must be idempotent. Business state
 * and ActivityLog were already committed by emit({ transaction }), so retries
 * do not duplicate a decision or its member-visible activity.
 */
export async function deliverAdmissionEvents(ctx: RequestContext, limit = 5) {
  let delivered = 0, failed = 0;
  try {
    for (let i = 0; i < limit; i++) {
      const now = new Date();
      const lease = new Date(now.getTime() + 60_000);
      const event = await ctx.db.$transaction(async tx => {
        const row = await tx.operationalEvent.findFirst({ where: {
          organizationId: ctx.orgId, deliveryPending: true,
          deliveryAvailableAt: { lte: now },
          OR: [{ deliveryLeaseUntil: null }, { deliveryLeaseUntil: { lte: now } }],
        }, orderBy: { id: "asc" } });
        if (!row) return null;
        const claim = await tx.operationalEvent.updateMany({ where: {
          id: row.id, organizationId: ctx.orgId, deliveryPending: true,
          OR: [{ deliveryLeaseUntil: null }, { deliveryLeaseUntil: { lte: now } }],
        }, data: { deliveryLeaseUntil: lease, deliveryAttempts: { increment: 1 } } });
        return claim.count === 1 ? row : null;
      });
      if (!event) break;
      try {
        // Replay only known admission handlers, never arbitrary actions or
        // authority from JSON. This context is for reactions, not authorization.
        const reactionCtx = { ...ctx, requestId: event.requestId, actorId: event.actorId ?? ctx.actorId, actorName: event.deliveryActorName ?? "Officer" };
        if (event.subjectType !== "JoinRequest") throw new Error("Unexpected admission event subject");
        if (event.action === "join_request.approved") {
          await dispatchHandlers(reactionCtx, event.action, { type: "JoinRequest", id: event.subjectId }, event.metadata as unknown as EventMetadata["join_request.approved"], { retryOnFailure: true });
        } else if (event.action === "join_request.rejected") {
          await dispatchHandlers(reactionCtx, event.action, { type: "JoinRequest", id: event.subjectId }, event.metadata as unknown as EventMetadata["join_request.rejected"], { retryOnFailure: true });
        } else throw new Error("Unexpected admission event action");
        await ctx.db.$transaction(tx => tx.operationalEvent.updateMany({
          where: { id: event.id, organizationId: ctx.orgId, deliveryLeaseUntil: lease },
          data: { deliveryPending: false, deliveredAt: new Date(), deliveryLeaseUntil: null },
        }));
        delivered++;
      } catch (e) {
        failed++;
        const delay = Math.min(3_600_000, 30_000 * 2 ** Math.min(event.deliveryAttempts, 7));
        await ctx.db.$transaction(tx => tx.operationalEvent.updateMany({
          where: { id: event.id, organizationId: ctx.orgId, deliveryLeaseUntil: lease },
          data: { deliveryLeaseUntil: null, deliveryAvailableAt: new Date(Date.now() + delay) },
        }));
        logError(e, { route: "events/admission-delivery", method: "DELIVER", extra: { orgId: ctx.orgId, eventId: String(event.id), attempt: event.deliveryAttempts + 1 } });
      }
    }
  } catch (e) {
    // Delivery availability cannot turn an already committed approval into a
    // failed API response. The row or its lease remains available to the worker.
    failed++;
    logError(e, { route: "events/admission-delivery", method: "CLAIM", extra: { orgId: ctx.orgId } });
  }
  return { delivered, failed };
}

/** Trusted maintenance entry point. Only the org IDs cross the global read. */
export async function flushAdmissionEvents() {
  const pending = await prismaPrivileged.operationalEvent.findMany({
    where: { deliveryPending: true, deliveryAvailableAt: { lte: new Date() } },
    distinct: ["organizationId"], take: 50, select: { organizationId: true, actorId: true },
  });
  let delivered = 0, failed = 0;
  for (const row of pending) {
    const ctx: RequestContext = {
      orgId: row.organizationId, db: db(row.organizationId), actorId: row.actorId ?? 0,
      actorName: "Officer", requestId: "admission-delivery", actorEmail: null,
      authUserId: "", membershipId: null, permissions: 0, maxRank: 0,
      isOrgAdmin: false, isPlatformAdmin: false,
    };
    const result = await deliverAdmissionEvents(ctx, 20);
    delivered += result.delivered; failed += result.failed;
  }
  return { organizations: pending.length, delivered, failed };
}
