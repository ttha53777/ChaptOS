import { prismaPrivileged } from "@/lib/prisma-privileged";
import { db } from "@/lib/db";
import { tokenMatches, digestToken } from "@/lib/calendar-feed/credentials";
import { feedRolloutAllowed } from "@/lib/calendar-feed/config";
import { feedCredentialsInput } from "@/lib/validation/calendar-feed";

export interface FeedContext {
  kind: "calendarFeed";
  orgId: number;
  publicId: string;
  tokenDigest: string;
  generation: number;
  // No member, permissions, mutation delegates or raw transaction escape hatch.
  db: { read: () => ReturnType<typeof readFeedSnapshot> };
}
function readFeedSnapshot(orgId: number) {
  return db(orgId).$transaction(async tx => {
    const subscription = await tx.calendarSubscription.findUnique({ where: { organizationId: orgId } });
    const work = await tx.calendarFeedWork.findUnique({ where: { organizationId: orgId } });
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true, slug: true } });
    const items = await tx.calendarFeedItem.findMany({ where: { organizationId: orgId }, orderBy: { uid: "asc" } });
    return { subscription, work, organization, items };
  }, { isolationLevel: "RepeatableRead" });
}
export async function buildFeedContext(raw: unknown): Promise<{ ctx: FeedContext; error?: undefined } | { ctx?: undefined; error: Response }> {
  const missing = () => ({ error: new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } }) });
  const parsed = feedCredentialsInput.safeParse(raw);
  if (!parsed.success) return missing();
  // Sole privileged bootstrap query: credential fields only, keyed by opaque ID.
  const row = await prismaPrivileged.calendarSubscription.findUnique({ where: { publicId: parsed.data.publicId }, select: { organizationId: true, publicId: true, tokenDigest: true, enabled: true, generation: true, validatedAt: true } });
  const verified = tokenMatches(parsed.data.secret, row?.tokenDigest ?? null);
  if (!row || !verified || !row.enabled || !row.validatedAt || !feedRolloutAllowed(row.organizationId)) return missing();
  return { ctx: { kind: "calendarFeed", orgId: row.organizationId, publicId: row.publicId, tokenDigest: digestToken(parsed.data.secret), generation: row.generation, db: { read: () => readFeedSnapshot(row.organizationId) } } };
}
