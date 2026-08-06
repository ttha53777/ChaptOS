import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { db } from "@/lib/db";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseAvatarFromMetadata } from "@/lib/avatar";
import { logActivity } from "@/lib/activity";
import { resolveOrgFromRequest } from "@/lib/auth/org-resolution";
import { claimedResponse } from "@/lib/auth/session-cookies";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

/**
 * Emit a minimal structured OperationalEvent for the claim flow.
 * We have no RequestContext here (pre-auth), so we write directly.
 * Fire-and-forget: a failure must not block the claim response.
 */
async function emitClaimEvent(orgId: number, brotherId: number, name: string, email: string | null) {
  try {
    await prisma.operationalEvent.create({
      data: {
        organizationId: orgId,
        requestId:      randomUUID(),
        actorId:        brotherId,
        action:         "brother.claimed",
        subjectType:    "Brother",
        subjectId:      brotherId,
        metadata:       { name, email, orgId },
      },
    });
  } catch {
    // Non-fatal — telemetry must not break auth.
  }
}

// This route runs pre-auth: the user's Supabase session exists but their
// Brother row has not been linked yet. We cannot use buildContext() here
// (it requires a linked Brother). Instead we:
//   1. Validate the Supabase session directly.
//   2. Resolve the org from the request (query param, header, or subdomain).
//   3. Scope all Brother reads/writes to that org.
//   4. Create a Membership row when linking succeeds so subsequent
//      requireUser() calls find the correct active org.

export async function POST(req: NextRequest) {
  // ── 1. Resolve org ────────────────────────────────────────────────────────
  // Must happen before session validation so we can return a clear error when
  // the org is unknown, rather than a confusing auth error.
  //
  // We require an EXPLICIT org (?org= slug, X-Org-Slug header, or subdomain) —
  // no "first org in the DB" fallback. In a multi-org world that fallback would
  // silently point a slug-less claim at org #1 and let a user claim a brother
  // in an org they never named. The login flow always carries the slug here, so
  // a missing org means a malformed entry; fail loudly.
  const slugPresent = new URL(req.url).searchParams.has("org") ||
    !!req.headers.get("x-org-slug");
  const org = await resolveOrgFromRequest(req).catch(() => null);
  if (!org) {
    return Response.json(
      {
        error: slugPresent
          ? "Organization not found"
          : "No organization specified. Start from your organization's sign-in link.",
      },
      { status: slugPresent ? 404 : 400 },
    );
  }
  const orgId = org.id;

  // ── 2. Validate Supabase session ─────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // ── 3. Rate-limit claim attempts (brute-force protection) ─────────────────
  const limit = rateLimit(`claim:${user.id}`, 5, 60_000);
  if (!limit.ok) return tooManyRequests(limit);

  // ── 4. Guard: already linked? ─────────────────────────────────────────────
  // Search across ALL orgs — a Google account links to exactly one Brother row
  // globally. Must not scope to orgId or a linked user on org-a could reclaim on org-b.
  const alreadyClaimed = await prisma.brother.findUnique({ // lint-direct-prisma:ignore
    where: { authUserId: user.id },
    select: { id: true, organizationId: true },
  });
  if (alreadyClaimed) {
    return Response.json({ error: "Your account is already linked to a brother." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });

  const { avatarUrl: metaAvatarUrl } = parseAvatarFromMetadata(user.user_metadata);

  // ── 5. Name-match claim ───────────────────────────────────────────────────
  // Search only within the resolved org so a user on org-beta cannot claim
  // a brother from org-alpha.
  //
  // Deliberately NOT seat-gated, unlike /api/auth/redeem-invite. Claiming adds
  // no billable seat: it links an auth account to a Brother row that already
  // exists in this org and therefore already counts toward the headcount
  // (lib/billing/seats.ts unions roster and memberships, deduped by brotherId).
  // Step 4 above turns away anyone who already owns a Brother elsewhere, so this
  // path cannot introduce a new person. Gating it would block roster
  // reconciliation for no revenue.
  //
  // Match EITHER name: the display name this org gave them (Membership.name) or
  // the account-level Brother.name it falls back to. Names are org-local, so the
  // roster may list someone under a name that isn't on their account row —
  // matching only one arm would 404 a legitimate claim. member.search owns that
  // rule for the whole codebase; it returns one row per roster spot, so someone
  // matching on both arms is still one match, not a false "multiple brothers
  // share that name" 409.
  //
  // Ghosts are included: a ghost's roster row is exactly the kind of stale entry
  // an officer would ask someone to claim, and excluding them here would 404 a
  // claim that the pre-Phase-2 Brother-based search would have found.
  const matches = await db(orgId).member.search(name, { exact: true });

  if (matches.length === 0) {
    return Response.json({ error: "No brother found with that name" }, { status: 404 });
  }
  if (matches.length > 1) {
    return Response.json(
      { error: "Multiple brothers share that name. Contact an officer to be linked manually." },
      { status: 409 }
    );
  }

  const brother = matches[0];
  if (brother.authUserId !== null) {
    return Response.json({ error: "This name is already linked to another account." }, { status: 409 });
  }

  // ── 6. Atomic link + Membership creation ─────────────────────────────────
  // updateMany with authUserId: null in WHERE guards the TOCTOU window — two
  // concurrent claims for the same name cannot both succeed.
  try {
    // Still a raw updateMany rather than ctx.db.identity: the whole point of the
    // authUserId: null guard is the TOCTOU window, and identity's write helpers
    // verify-then-update, which reopens it. Scoped by id, which step 5 already
    // proved belongs to this org's roster.
    const claimed = await prisma.brother.updateMany({ // lint-direct-prisma:ignore atomic claim guard, pre-membership bootstrap
      where: { id: brother.id, authUserId: null },
      data:  { authUserId: user.id, avatarUrl: metaAvatarUrl, email: user.email ?? null },
    });
    if (claimed.count === 0) {
      return Response.json({ error: "This name was just linked to another account." }, { status: 409 });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "Your account is already linked to a brother." }, { status: 409 });
    }
    logError(e, { route: "/api/auth/claim", method: "POST", userId: user.id, extra: { stage: "link_account", orgId } });
    return Response.json({ error: "Failed to link account. Please try again." }, { status: 500 });
  }

  // The roster row this claim just attached to an account already exists — the
  // search above found it, and after Phase 2 every roster row IS a Membership.
  // The upsert is kept as a belt-and-braces guarantee that requireUser() will
  // resolve this org, and stays FATAL on failure: a claim that links the Brother
  // but leaves zero memberships would let the [slug] guard see a linked user
  // with no membership here — access denied despite a "successful" claim.
  //
  // `name` is seeded on create so the row is never left with a null org-local
  // name; on the (normal) update path it is deliberately left alone, since the
  // roster's existing name for this person is the one the officer chose.
  try {
    await prisma.membership.upsert({
      where:  { brotherId_organizationId: { brotherId: brother.id, organizationId: orgId } },
      create: { brotherId: brother.id, organizationId: orgId, isOrgAdmin: false, name, role: "Member" },
      update: {},
    });
  } catch (e) {
    logError(e, { route: "/api/auth/claim", method: "POST", userId: user.id, extra: { stage: "membership_upsert", orgId } });
    return Response.json({ error: "Failed to link account. Please try again." }, { status: 500 });
  }

  await logActivity({
    actorId: brother.id,
    type:    "success",
    message: `${user.email ?? "A new user"} claimed the ${name} profile`,
    orgId,
  });
  void emitClaimEvent(orgId, brother.id, name, user.email ?? null);

  return claimedResponse(orgId);
}
