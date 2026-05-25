import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { logError } from "@/lib/observability";
import { scrapeMetadata } from "@/lib/og-metadata";

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requirePermission("MANAGE_DOCS");
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }
    const body = await req.json();

    const data: Prisma.DocUpdateInput = {};

    if ("title" in body) {
      const title = optionalString(body.title);
      if (!title) return Response.json({ error: "Title is required" }, { status: 400 });
      if (title.length > 200) return Response.json({ error: "Title too long" }, { status: 400 });
      data.title = title;
    }

    if ("description" in body) {
      const description = optionalString(body.description);
      if (description && description.length > 2000) {
        return Response.json({ error: "Description too long" }, { status: 400 });
      }
      data.description = description;
    }

    let urlChanged = false;
    if ("url" in body) {
      const urlCheck = validateUrl(body.url);
      if ("error" in urlCheck) return Response.json({ error: urlCheck.error }, { status: 400 });
      data.url = urlCheck.url;
      urlChanged = true;
    }

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "No valid fields provided" }, { status: 400 });
    }

    // When the URL changes, re-scrape so the cached preview metadata stays
    // accurate. Same inline-await trade-off as POST: a few seconds added to
    // the request in exchange for instant correctness in the UI.
    if (urlChanged && typeof data.url === "string") {
      const meta = await scrapeMetadata(data.url).catch(() => null);
      data.ogImage = meta?.ogImage ?? null;
      data.ogTitle = meta?.ogTitle ?? null;
      data.faviconUrl = meta?.faviconUrl ?? null;
      data.embedOk = meta?.embedOk ?? null;
    }

    const doc = await prisma.doc.update({ where: { id: numId }, data });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} updated doc: ${doc.title}`,
    });

    return Response.json(doc);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Doc not found" }, { status: 404 });
    }
    logError(e, { route: "/api/docs/[id]", method: "PATCH", userId: user.id });
    return Response.json({ error: "Failed to update doc" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requirePermission("MANAGE_DOCS");
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }
    const target = await prisma.doc.findUnique({ where: { id: numId }, select: { title: true } });
    await prisma.doc.delete({ where: { id: numId } });

    await logActivity({
      actorId: user.id,
      type: "warning",
      message: `${user.name} deleted doc: ${target?.title ?? `#${numId}`}`,
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Doc not found" }, { status: 404 });
    }
    logError(e, { route: "/api/docs/[id]", method: "DELETE", userId: user.id });
    return Response.json({ error: "Failed to delete doc" }, { status: 500 });
  }
}
