import { NextRequest } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { resolveOrgFromRequestOrFirst } from "@/lib/auth/org-resolution";
import { upsertAnnouncementInput } from "@/lib/validation/announcement";
import { emit } from "@/lib/events";
import { logError } from "@/lib/observability";
import { db } from "@/lib/db";

// Dashboard announcement — one row per org (@@unique organizationId in schema).
// GET is intentionally unauthenticated: used by the login splash and by the
// dashboard before the full ChapterContext resolves.
// PUT requires sign-in and goes through buildContext() for org scoping.

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

export async function GET(req: NextRequest) {
  // Resolve org from the request (query param, header, or subdomain).
  // Falls back to the first org in the database for single-org / dev deployments.
  const org = await resolveOrgFromRequestOrFirst(req).catch(() => null);
  if (!org) return Response.json(null);

  try {
    const row = await db(org.id).chapterAnnouncement.findFirst({ where: {} });
    return Response.json(row ? serialize(row) : null);
  } catch (e) {
    if (isTableMissing(e)) return Response.json(null);
    logError(e, { route: "/api/announcement", method: "GET" });
    return toResponse(e);
  }
}

export async function PUT(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_ANNOUNCEMENTS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = upsertAnnouncementInput.parse(body);

    const authorName = (ctx.actorName.trim() || input.authorName?.trim() || "").slice(0, AUTHOR_NAME_MAX) || null;

    // Upsert keyed on organizationId (@@unique in schema — one row per org).
    const row = await ctx.db.chapterAnnouncement.upsert({
      where:  { organizationId: ctx.orgId },
      create: {
        organizationId: ctx.orgId,
        title:          input.title,
        body:           input.body,
        ctaLabel:       input.ctaLabel ?? null,
        ctaUrl:         input.ctaUrl   ?? null,
        authorId:       ctx.actorId,
        authorName,
      },
      update: {
        title:     input.title,
        body:      input.body,
        ctaLabel:  input.ctaLabel ?? null,
        ctaUrl:    input.ctaUrl   ?? null,
        authorId:  ctx.actorId,
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
