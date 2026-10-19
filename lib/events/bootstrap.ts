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

/**
 * Audit row for a self-serve account deletion, one per org the person belonged
 * to. Nameless on purpose (see "membership.account_deleted"); subjectId is the
 * former Brother id, a bare number that no longer resolves to anyone.
 */
export function recordAccountDeletion(tx: Prisma.TransactionClient, organizationId: number, formerBrotherId: number) {
  return tx.operationalEvent.create({ data: {
    organizationId, requestId: randomUUID(), actorId: null,
    action: "membership.account_deleted", subjectType: "Membership", subjectId: formerBrotherId,
    metadata: {},
  } });
}
