import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma"; // lint-modules:ignore (pre-auth onboarding helper)
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { validateSlugFormat } from "@/lib/slug-rules";
import { logError } from "@/lib/observability";

// GET /api/orgs/slug-check?slug=...
//
// Used by the create-org form to tell the user as they type whether their
// chosen slug is well-formed, reserved, and available. Returns a structured
// result every time (never 4xx for "taken" or "bad-format") so the client
// can render the right message inline without parsing error bodies.
//
// Status semantics:
//   200 { ok: true,  available: true }                    — usable.
//   200 { ok: false, reason: "reserved", message }        — bad format/reserved.
//   200 { ok: false, reason: "taken",    message }        — already in use.
//   429                                                   — rate-limited.
//
// Rate limit: per-IP, 120/min. Tighter than /api/orgs/lookup because the
// client typically debounces; loose enough that fast typing won't trip it.

const LIMIT  = 120;
const WINDOW = 60_000;

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`slug-check:${ip}`, LIMIT, WINDOW);
  if (!rl.ok) return tooManyRequests(rl);

  const raw = new URL(req.url).searchParams.get("slug") ?? "";
  const check = validateSlugFormat(raw);
  if (!check.ok) {
    return Response.json({
      ok:       false,
      reason:   check.issue,
      message:  check.message,
    });
  }

  try {
    const existing = await prisma.organization.findUnique({
      where: { slug: raw.trim() },
      select: { id: true },
    });
    if (existing) {
      return Response.json({
        ok:      false,
        reason:  "taken",
        message: "That slug is already in use.",
      });
    }
    return Response.json({ ok: true, available: true });
  } catch (e) {
    logError(e, { route: "/api/orgs/slug-check", method: "GET" });
    return Response.json({ error: "Slug check failed." }, { status: 500 });
  }
}
