import type { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { DomainError, NotFoundError, toResponse } from "@/lib/errors";
import { filesEnabled } from "@/lib/files/limits";
import { attachmentPublicId } from "@/lib/validation/ai";
import { removeAttachment } from "@/lib/services/chat-attachment-service";
import { logError } from "@/lib/observability";

// Remove one attached file. Its content is wiped at once; a file that isn't the
// caller's answers 404, the same as one that doesn't exist.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!filesEnabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const parsed = attachmentPublicId.safeParse((await params).id);
    if (!parsed.success) throw new NotFoundError("Attachment");
    return Response.json(await removeAttachment(ctx, parsed.data));
  } catch (e) {
    if (!(e instanceof DomainError)) logError(e, { route: "/api/ai/attachments/[id]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
