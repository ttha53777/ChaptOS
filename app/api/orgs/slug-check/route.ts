import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma"; // lint-modules:ignore (pre-auth onboarding helper)
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { validateSlugFormat, generateSlugVariants } from "@/lib/slug-rules";
import { logError } from "@/lib/observability";

// GET /api/orgs/slug-check?slug=...
//
// Used by the create-org form to tell the user as they type whether their
// chosen slug is well-formed, reserved, and available. Returns a structured
// result every time (never 4xx for "taken" or "bad-format") so the client
// can render the right message inline without parsing error bodies.
//
// Status semantics:
//   200 { ok: true,  available: true }
//   200 { ok: false, reason: "reserved"|"bad-format"|..., message }
//   200 { ok: false, reason: "taken", message, suggestions: string[] }
//   429                                                   — rate-limited.
//
// On "taken", we generate variants (lpe → lpe-2, lpe-2026, lpe-chapter, …)
// and filter against the DB in one query so the form can offer one-tap
// alternatives instead of forcing the user to invent something.
//
// Rate limit: per-IP, 120/min. Tighter than /api/orgs/lookup because the
// client typically debounces; loose enough that fast typing won't trip it.

const LIMIT             = 120;
const WINDOW            = 60_000;
const SUGGESTION_LIMIT  = 3;

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

  const slug = raw.trim();
  try {
    const existing = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) {
      return Response.json({ ok: true, available: true });
    }
    // Generate a slightly oversized pool so we can prune DB collisions and
    // still return ~SUGGESTION_LIMIT. Single `IN (...)` query keeps it cheap.
    const candidates = generateSlugVariants(slug, { limit: SUGGESTION_LIMIT + 3 });
    let suggestions: string[] = [];
    if (candidates.length > 0) {
      const taken = await prisma.organization.findMany({
        where:  { slug: { in: candidates } },
        select: { slug: true },
      });
      const takenSet = new Set(taken.map(t => t.slug));
      suggestions = candidates.filter(c => !takenSet.has(c)).slice(0, SUGGESTION_LIMIT);
    }
    return Response.json({
      ok:          false,
      reason:      "taken",
      message:     "That slug is already in use.",
      suggestions,
    });
  } catch (e) {
    logError(e, { route: "/api/orgs/slug-check", method: "GET" });
    return Response.json({ error: "Slug check failed." }, { status: 500 });
  }
}
