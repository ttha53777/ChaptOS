import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";
import { scrapeMetadata } from "@/lib/og-metadata";

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

// Reject anything that isn't http/https — the URL is fed straight into an
// <iframe src>, so a `javascript:` URL would be an XSS vector.
function validateUrl(raw: unknown): { url: string } | { error: string } {
  const str = optionalString(raw);
  if (!str) return { error: "URL is required" };
  let parsed: URL;
  try { parsed = new URL(str); } catch { return { error: "URL is invalid" }; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "URL must use http or https" };
  }
  return { url: parsed.toString() };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Pre-migration safety: if the Doc table doesn't exist yet (mirror of the
    // BrotherRole pattern in require-permission.ts), return an empty list
    // rather than 500 — the page should still render.
    const docs = await prisma.doc.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return Response.json(docs);
  } catch (e) {
    logError(e, { route: "/api/docs", method: "GET", userId: user.id });
    return Response.json([]);
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requirePermission("MANAGE_DOCS");
  if (error) return error;
  const limited = checkMutationRate(user.id);
  if (limited) return limited;

  try {
    const body = await req.json();
    const title = optionalString(body.title);
    const description = optionalString(body.description);
    const urlCheck = validateUrl(body.url);
    if ("error" in urlCheck) return Response.json({ error: urlCheck.error }, { status: 400 });
    if (!title) return Response.json({ error: "Title is required" }, { status: 400 });
    if (title.length > 200) return Response.json({ error: "Title too long" }, { status: 400 });
    if (description && description.length > 2000) {
      return Response.json({ error: "Description too long" }, { status: 400 });
    }

    // Probe metadata inline — slow URLs add up to 5s to the create, but it's
    // worth it so the new card renders something useful immediately. Any
    // failure is swallowed; the row is still created with embedOk = null.
    const meta = await scrapeMetadata(urlCheck.url).catch(() => null);

    const doc = await prisma.doc.create({
      data: {
        title,
        url: urlCheck.url,
        description,
        ogImage: meta?.ogImage ?? null,
        ogTitle: meta?.ogTitle ?? null,
        faviconUrl: meta?.faviconUrl ?? null,
        embedOk: meta?.embedOk ?? null,
        createdById: user.id,
      },
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} added doc: ${doc.title}`,
    });

    return Response.json(doc, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/docs", method: "POST", userId: user.id });
    return Response.json({ error: "Failed to create doc" }, { status: 500 });
  }
}
