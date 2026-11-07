import type { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { DomainError, toResponse } from "@/lib/errors";
import { filesEnabled, FILE_MAX_BYTES, UPLOADS_PER_MINUTE } from "@/lib/files/limits";
import { FILE_ERROR_MESSAGES } from "@/lib/files/types";
import { attachmentThreadId } from "@/lib/validation/ai";
import { listAttachments, removeThreadAttachments, uploadAttachment } from "@/lib/services/chat-attachment-service";
import { logError } from "@/lib/observability";

// Extraction runs inside the upload request; a 4 MB PDF parses in seconds, and
// this is the ceiling for a hostile one that tries to take longer.
export const maxDuration = 60;

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

/** Multipart slack over the file itself (boundaries, the threadId field). */
const FORM_OVERHEAD = 64 * 1024;

function threadIdFrom(raw: unknown) {
  return attachmentThreadId.parse(typeof raw === "string" ? raw : "");
}

// Attach a file to an Ask Chapt conversation (multipart: `file`, `threadId`).
// The bytes are extracted and dropped inside this request.
export async function POST(req: NextRequest) {
  if (!filesEnabled()) return notFound();
  const { ctx, error } = await buildContext({ rateLimit: { limit: UPLOADS_PER_MINUTE, windowMs: 60_000 } });
  if (error) return error;
  try {
    // Refuse an oversized body before buffering it.
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > FILE_MAX_BYTES + FORM_OVERHEAD) {
      throw new DomainError("VALIDATION", FILE_ERROR_MESSAGES.FILE_TOO_LARGE, 400, { code: "FILE_TOO_LARGE" });
    }
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new DomainError("VALIDATION", "No file provided", 400);
    const threadId = threadIdFrom(form?.get("threadId"));
    const info = await uploadAttachment(ctx, file, threadId);
    return Response.json(info, { status: 201 });
  } catch (e) {
    if (!(e instanceof DomainError)) logError(e, { route: "/api/ai/attachments", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function GET(req: NextRequest) {
  if (!filesEnabled()) return notFound();
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const threadId = threadIdFrom(req.nextUrl.searchParams.get("threadId"));
    return Response.json(await listAttachments(ctx, threadId), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (!(e instanceof DomainError)) logError(e, { route: "/api/ai/attachments", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

// Remove every file in a conversation (← New).
export async function DELETE(req: NextRequest) {
  if (!filesEnabled()) return notFound();
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const threadId = threadIdFrom(req.nextUrl.searchParams.get("threadId"));
    return Response.json(await removeThreadAttachments(ctx, threadId));
  } catch (e) {
    if (!(e instanceof DomainError)) logError(e, { route: "/api/ai/attachments", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
