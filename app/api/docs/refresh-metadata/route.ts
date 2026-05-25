import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";
import { scrapeMetadata } from "@/lib/og-metadata";

/**
 * On-demand metadata refresh. The /api/docs POST + PATCH already scrape on
 * create / URL change, so this exists mostly for two cases:
 *   1) Backfilling old rows that pre-date OG caching (embedOk = null).
 *   2) Letting the user re-probe a URL whose destination has changed
 *      headers since (e.g. a Google Doc that was made public).
 *
 * Any signed-in user can trigger it — it's a read-only operation against
 * the destination and a single UPDATE against our own row.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limited = checkMutationRate(user.id);
  if (limited) return limited;

  try {
    const body = await req.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }
    const existing = await prisma.doc.findUnique({ where: { id }, select: { url: true } });
    if (!existing) return Response.json({ error: "Doc not found" }, { status: 404 });

    const meta = await scrapeMetadata(existing.url).catch(() => null);

    const updated = await prisma.doc.update({
      where: { id },
      data: {
        ogImage: meta?.ogImage ?? null,
        ogTitle: meta?.ogTitle ?? null,
        faviconUrl: meta?.faviconUrl ?? null,
        embedOk: meta?.embedOk ?? null,
      },
    });
    return Response.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Doc not found" }, { status: 404 });
    }
    logError(e, { route: "/api/docs/refresh-metadata", method: "POST", userId: user.id });
    return Response.json({ error: "Failed to refresh metadata" }, { status: 500 });
  }
}
