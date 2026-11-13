import { prismaPrivileged } from "@/lib/prisma-privileged";
import type { Prisma } from "@/app/generated/prisma/client";
import { resolveJoinViewer } from "./join-viewer";

/** A slug selects the caller's own request, never another applicant's row. */
export async function ownJoinStatus(authUserId: string, slug: string, client: Pick<Prisma.TransactionClient, "organization" | "membership" | "joinRequest"> = prismaPrivileged) {
  const org = await client.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!org) return null;
  const viewer = await resolveJoinViewer(org.id, authUserId, undefined, client);
  // "guest" can't happen (the caller is signed in); the check only narrows the type.
  if (viewer.state === "ready" || viewer.state === "guest") return null;
  return { ...viewer, state: viewer.state, orgSlug: slug };
}

/** Account notices are read from the durable request, not a duplicate inbox. */
export async function listOwnJoinRequests(authUserId: string) {
  const rows = await prismaPrivileged.joinRequest.findMany({
    where: { authUserId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30,
    select: { id: true, name: true, status: true, decidedAt: true,
      organization: { select: { name: true, slug: true } } },
  });
  return rows.map(r => ({ id: r.id, submittedName: r.name, status: r.status,
    decidedAt: r.decidedAt?.toISOString() ?? null, org: r.organization }));
}
