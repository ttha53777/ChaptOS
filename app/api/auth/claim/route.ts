import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { db } from "@/lib/db";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseAvatarFromMetadata } from "@/lib/avatar";
import { logActivity } from "@/lib/activity";
import { resolveOrgFromRequest } from "@/lib/auth/org-resolution";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

/**
 * Emit a minimal structured OperationalEvent for the claim flow.
 * We have no RequestContext here (pre-auth), so we write directly.
 * Errors are logged at WARNING level — a failure must not block the claim response.
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
  } catch (e) {
    logError(e, { route: "/api/auth/claim", method: "POST", extra: { stage: "emit_event", orgId, brotherId } });
  }
}

// This route runs pre-auth: the user's Supabase session exists but their
// Brother row has not been linked yet. We cannot use buildContext() here
// (it requires a linked Brother). Instead we:
//   1. Resolve the org from the request (query param, header, or subdomain).
//      Using strict resolution (no "first org" fallback) to prevent silent
//      wrong-org assignment in multi-org production.
//   2. Validate the Supabase session directly.
//   3. Scope all Brother reads/writes to that org.
//   4. Wrap the link + Membership creation in a single transaction so a
//      partial failure cannot leave the account in an inconsistent state.

export async function POST(req: NextRequest) {
  // ── 1. Resolve org (strict — no fallback to first org) ───────────────────
  // Must happen before session validation so we can return a clear 400/404
  // when the org context is missing or unknown, rather than a confusing error.
  const org = await resolveOrgFromRequest(req).catch(() => null);
  if (!org) {
    return Response.json(
      { error: "Organization context is required. Please use the sign-in link from your chapter's login page." },
      { status: 400 },
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

  // ── 5. Name-match claim ───────────────────────────────────────────────────
  // Search only within the resolved org so a user on org-beta cannot claim
  // a brother from org-alpha.
  const matches = await db(orgId).brother.findMany({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, authUserId: true },
  });

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

  const { avatarUrl: metaAvatarUrl } = parseAvatarFromMetadata(user.user_metadata);

  // ── 6. Atomic link + Membership creation ─────────────────────────────────
  // Both writes are inside a single transaction so a DB failure cannot leave
  // the brother linked but without a Membership row (which would cause the
  // user to land in the wrong org on next sign-in).
  //
  // updateMany with authUserId: null in WHERE guards the TOCTOU window — two
  // concurrent claims for the same name cannot both succeed.
  try {
    await db(orgId).$transaction(async (tx) => {
      const claimed = await tx.brother.updateMany({
        where: { id: brother.id, authUserId: null },
        data:  { authUserId: user.id, avatarUrl: metaAvatarUrl, email: user.email ?? null },
      });
      if (claimed.count === 0) {
        // Another concurrent request claimed this name in the TOCTOU window.
        throw Object.assign(new Error("ALREADY_CLAIMED"), { code: "ALREADY_CLAIMED" });
      }
      await tx.membership.upsert({
        where:  { brotherId_organizationId: { brotherId: brother.id, organizationId: orgId } },
        create: { brotherId: brother.id, organizationId: orgId, isOrgAdmin: false },
        update: {},
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_CLAIMED") {
      return Response.json({ error: "This name was just linked to another account." }, { status: 409 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "Your account is already linked to a brother." }, { status: 409 });
    }
    logError(e, { route: "/api/auth/claim", method: "POST", userId: user.id, extra: { stage: "link_account", orgId } });
    return Response.json({ error: "Failed to link account. Please try again." }, { status: 500 });
  }

  await logActivity({
    actorId: brother.id,
    type:    "success",
    message: `${user.email ?? "A new user"} claimed the ${name} profile`,
    orgId,
  });
  await emitClaimEvent(orgId, brother.id, name, user.email ?? null);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("brother_linked", "1", {
    path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
