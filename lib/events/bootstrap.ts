import { randomUUID } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";

/** Narrow bootstrap writer: an applicant has no member RequestContext. */
export function recordJoinSubmission(tx: Prisma.TransactionClient, request: { id: number; organizationId: number; inviteId: number; name: string }) {
  return tx.operationalEvent.create({ data: {
    organizationId: request.organizationId, requestId: randomUUID(), actorId: null,
    action: "join_request.submitted", subjectType: "JoinRequest", subjectId: request.id,
    metadata: { name: request.name, inviteId: request.inviteId, orgId: request.organizationId },
  } });
}
