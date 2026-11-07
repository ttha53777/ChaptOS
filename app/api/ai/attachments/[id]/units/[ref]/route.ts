import type { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { DomainError, NotFoundError, toResponse } from "@/lib/errors";
import { filesEnabled } from "@/lib/files/limits";
import { attachmentPublicId, attachmentUnitRef } from "@/lib/validation/ai";
import { getAttachmentUnit } from "@/lib/services/chat-attachment-service";
import { logError } from "@/lib/observability";

// The extracted text (or sheet range) a citation chip opens. Owner only.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; ref: string }> }) {
  if (!filesEnabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const p = await params;
    const id = attachmentPublicId.safeParse(p.id);
    const ref = attachmentUnitRef.safeParse(decodeURIComponent(p.ref));
    if (!id.success || !ref.success) throw new NotFoundError("Passage");
    return Response.json(await getAttachmentUnit(ctx, id.data, ref.data), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (!(e instanceof DomainError)) logError(e, { route: "/api/ai/attachments/[id]/units/[ref]", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
