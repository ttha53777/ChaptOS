import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { attachReceipt, getReceiptUrl } from "@/lib/services/reimbursement-service";
import { logError } from "@/lib/observability";

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid ID");
  return id;
}

// Attach or replace the receipt (multipart, field `file`). Who may is decided in
// the service: the requester while pending, treasury at any time.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ rateLimit: { limit: 10, windowMs: 60_000 } });
  if (error) return error;
  try {
    const id = parseId((await params).id);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new ValidationError("No receipt file provided");
    const r = await attachReceipt(ctx, id, file);
    return Response.json(r);
  } catch (e) {
    logError(e, { route: "/api/reimbursements/[id]/receipt", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

// Opened as a plain link (target=_blank), which can't send the x-org-slug header,
// so the org comes from ?org=<slug>. Redirects to a 60-second signed URL; an app
// client asking for JSON gets { url } instead.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgSlug = req.nextUrl.searchParams.get("org") ?? undefined;
  const { ctx, error } = await buildContext({ rateLimit: false, orgSlug });
  if (error) return error;
  try {
    const id = parseId((await params).id);
    const url = await getReceiptUrl(ctx, id);
    if (req.headers.get("accept")?.includes("application/json")) {
      return Response.json({ url }, { headers: { "Cache-Control": "no-store" } });
    }
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (e) {
    logError(e, { route: "/api/reimbursements/[id]/receipt", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
