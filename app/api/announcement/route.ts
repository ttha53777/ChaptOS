import { NextRequest } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { logActivity } from "@/lib/activity";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

// The dashboard always shows a single pinned announcement, so the table
// holds exactly one row at id = 1. GET returns it (or null), PUT upserts it.
// Pre-migrate fallback: if the table doesn't exist yet (deploy that hasn't
// run migrations), return null instead of 500 so the placeholder still renders.

const SINGLE_ROW_ID = 1;
const TITLE_MAX = 120;
const BODY_MAX = 2000;
const CTA_LABEL_MAX = 40;
const CTA_URL_MAX = 500;
const AUTHOR_NAME_MAX = 80;

type AnnouncementResponse = {
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  authorName: string | null;
  updatedAt: string;
} | null;

function serialize(row: {
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  authorName: string | null;
  updatedAt: Date;
}): AnnouncementResponse {
  return {
    title: row.title,
    body: row.body,
    ctaLabel: row.ctaLabel,
    ctaUrl: row.ctaUrl,
    authorName: row.authorName,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Catches the "relation does not exist" error Postgres throws when the
// migration hasn't been applied yet. Anything else bubbles to logError.
function isTableMissing(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2021"
  );
}

export async function GET() {
  try {
    const row = await prisma.chapterAnnouncement.findUnique({
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
  // No permission gate — matches the rest of the dashboard's mock-auth posture.
  // We still soft-attempt requireUser() so we can attribute the author when
  // someone is signed in, and so rate limiting has a stable key.
  const user = await requireUser();
  // Rate-limit per signed-in user; share a single bucket for all anonymous
  // callers (id = 0) so unauthenticated bursts can't drown out real users.
  const limited = checkMutationRate(user?.id ?? 0);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const ctaLabelRaw = typeof body.ctaLabel === "string" ? body.ctaLabel.trim() : "";
  const ctaUrlRaw = typeof body.ctaUrl === "string" ? body.ctaUrl.trim() : "";
  const authorNameFromBody = typeof body.authorName === "string" ? body.authorName.trim() : "";

  if (!title) return Response.json({ error: "title is required" }, { status: 400 });
  if (title.length > TITLE_MAX) return Response.json({ error: `title must be ≤ ${TITLE_MAX} chars` }, { status: 400 });
  if (!text) return Response.json({ error: "body is required" }, { status: 400 });
  if (text.length > BODY_MAX) return Response.json({ error: `body must be ≤ ${BODY_MAX} chars` }, { status: 400 });

  // CTA is optional but must be all-or-nothing — a label without a URL is a
  // broken button, and a URL without a label has nothing to render.
  if ((ctaLabelRaw && !ctaUrlRaw) || (!ctaLabelRaw && ctaUrlRaw)) {
    return Response.json({ error: "ctaLabel and ctaUrl must be provided together" }, { status: 400 });
  }
  if (ctaLabelRaw && ctaLabelRaw.length > CTA_LABEL_MAX) {
    return Response.json({ error: `ctaLabel must be ≤ ${CTA_LABEL_MAX} chars` }, { status: 400 });
  }
  if (ctaUrlRaw) {
    if (ctaUrlRaw.length > CTA_URL_MAX) {
      return Response.json({ error: `ctaUrl must be ≤ ${CTA_URL_MAX} chars` }, { status: 400 });
    }
    try {
      const parsed = new URL(ctaUrlRaw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return Response.json({ error: "ctaUrl must be http(s)" }, { status: 400 });
      }
    } catch {
      return Response.json({ error: "ctaUrl is not a valid URL" }, { status: 400 });
    }
  }

  const ctaLabel = ctaLabelRaw || null;
  const ctaUrl = ctaUrlRaw || null;
  const authorName =
    (user?.name?.trim() || authorNameFromBody || "").slice(0, AUTHOR_NAME_MAX) || null;
  const authorId = user?.id ?? null;

  try {
    const row = await prisma.chapterAnnouncement.upsert({
      where: { id: SINGLE_ROW_ID },
      create: {
        id: SINGLE_ROW_ID,
        title,
        body: text,
        ctaLabel,
        ctaUrl,
        authorId,
        authorName,
      },
      update: {
        title,
        body: text,
        ctaLabel,
        ctaUrl,
        authorId,
        authorName,
      },
    });

    await logActivity({
      actorId: authorId,
      type: "info",
      message: `${authorName ?? "Someone"} updated the chapter announcement`,
    });

    return Response.json(serialize(row));
  } catch (e) {
    logError(e, { route: "/api/announcement", method: "PUT", userId: user?.id });
    return Response.json({ error: "Failed to save announcement" }, { status: 500 });
  }
}
