import { NextRequest } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { db } from "@/lib/db"; // lint-modules:ignore (unauthenticated read for login splash)
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { upsertAnnouncementInput } from "@/lib/validation/announcement";
import { emit } from "@/lib/events";
import { logError } from "@/lib/observability";

// Dashboard singleton announcement (one row per org). GET is intentionally
// unauthenticated to render on the login splash; PUT requires sign-in.

const SINGLE_ROW_ID = 1;
const AUTHOR_NAME_MAX = 80;

type AnnouncementResponse = {
  title: string; body: string; ctaLabel: string | null; ctaUrl: string | null;
  authorName: string | null; updatedAt: string;
} | null;

function serialize(row: {
  title: string; body: string; ctaLabel: string | null; ctaUrl: string | null;
  authorName: string | null; updatedAt: Date;
}): AnnouncementResponse {
  return {
    title: row.title, body: row.body, ctaLabel: row.ctaLabel, ctaUrl: row.ctaUrl,
    authorName: row.authorName, updatedAt: row.updatedAt.toISOString(),
  };
}

function isTableMissing(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021";
}

export async function GET() {
  // Unauthenticated read — used by the login screen pre-session. Defaults to
  // org 1 (single-org era); when multi-org URLs land this resolves via slug.
  try {
    const row = await db(1).chapterAnnouncement.findUnique({
      where: { id: SINGLE_ROW_ID },
    });
    return Response.json(row ? serialize(row) : null);
  } catch (e) {
    if (isTableMissing(e)) return Response.json(null);
    logError(e, { route: "/api/announcement", method: "GET" });
    return Response.json({ error: "Failed to fetch announcement" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = upsertAnnouncementInput.parse(body);

    const authorName = (ctx.actorName.trim() || input.authorName?.trim() || "").slice(0, AUTHOR_NAME_MAX) || null;

    const row = await ctx.db.chapterAnnouncement.upsert({
      where: { id: SINGLE_ROW_ID },
      create: {
        id: SINGLE_ROW_ID,
        organizationId: ctx.orgId,
        title:      input.title,
        body:       input.body,
        ctaLabel:   input.ctaLabel ?? null,
        ctaUrl:     input.ctaUrl   ?? null,
        authorId:   ctx.actorId,
        authorName,
      },
      update: {
        title:      input.title,
        body:       input.body,
        ctaLabel:   input.ctaLabel ?? null,
        ctaUrl:     input.ctaUrl   ?? null,
        authorId:   ctx.actorId,
        authorName,
      },
    });

    await emit(ctx, "announcement.updated", { type: "ChapterAnnouncement", id: row.id }, { title: row.title });
    return Response.json(serialize(row));
  } catch (e) {
    logError(e, { route: "/api/announcement", method: "PUT", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
