import type { Prisma } from "@/app/generated/prisma/client";
import { prismaPrivileged } from "@/lib/prisma-privileged";
import { resolveJoinState } from "./join-state";

/** Only the verified account's own membership/request crosses bootstrap RLS. */
export async function resolveJoinViewer(
  orgId: number,
  authUserId: string,
  inviteId?: number,
  client: Pick<Prisma.TransactionClient, "membership" | "joinRequest"> = prismaPrivileged,
) {
  const membership = await client.membership.findFirst({
    where: { organizationId: orgId, brother: { authUserId } },
    select: { brotherId: true },
  });
  if (membership) return { state: resolveJoinState(true, true, null, inviteId), submittedName: null };
  const request = await client.joinRequest.findUnique({
    where: { organizationId_authUserId: { organizationId: orgId, authUserId } },
    select: { status: true, inviteId: true, name: true },
  });
  return {
    state: resolveJoinState(true, false, request, inviteId),
    submittedName: request?.name ?? null,
  };
}
