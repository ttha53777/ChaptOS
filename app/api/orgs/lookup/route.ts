import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma"; // lint-modules:ignore (pre-auth onboarding; user has no Brother yet)
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { validateSlugFormat } from "@/lib/slug-rules";
import { logError } from "@/lib/observability";

// Public, unauthenticated org lookup by slug. Used by /welcome's Join branch:
// a user types or pastes a slug and we confirm it points to a real org before
// routing them to /pending-access?org=<slug> for the existing claim flow.
//
// Returns the org's `name` only — never member counts, descriptions, or other
// fields — so the endpoint cannot be used to harvest information about orgs.
// Slug existence itself is technically enumerable here, but the reserved-slug
// list + format rules cap the search space and rate-limit caps the throughput.
//
// Rate limit: per-IP, modest (60/min). Enough to support typo retries and
// paste-the-URL flows, low enough to make enumeration uneconomical.

const LIMIT  = 60;
const WINDOW = 60_000;

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`org-lookup:${ip}`, LIMIT, WINDOW);
  if (!rl.ok) return tooManyRequests(rl);

  const raw = new URL(req.url).searchParams.get("slug") ?? "";
  const check = validateSlugFormat(raw);
  if (!check.ok) {
    // 400 with the format reason. The client surfaces this as a hint.
    return Response.json({ error: check.message ?? "Invalid slug." }, { status: 400 });
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { slug: raw.trim() },
      select: { name: true, slug: true },
    });
    if (!org) {
      return Response.json({ error: "No organization found with that slug." }, { status: 404 });
    }
    return Response.json({ name: org.name, slug: org.slug });
  } catch (e) {
    logError(e, { route: "/api/orgs/lookup", method: "GET" });
    return Response.json({ error: "Lookup failed." }, { status: 500 });
  }
}
