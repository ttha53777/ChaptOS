import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseAvatarFromMetadata } from "@/lib/avatar";
import { logActivity } from "@/lib/activity";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Validate Supabase session directly (can't use requireUser here — it checks
  // Brother linkage too, but the user isn't linked yet at this point)
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Throttle claim attempts to stop name-guessing brute force. Keyed by the
  // authenticated Supabase user (they're already signed in via Google here).
  const limit = rateLimit(`claim:${user.id}`, 5, 60_000);
  if (!limit.ok) return tooManyRequests(limit);

  // Prevent the same Google account from claiming a second Brother row
  const alreadyClaimed = await prisma.brother.findUnique({
    where: { authUserId: user.id },
    select: { id: true },
  });
  if (alreadyClaimed) {
    return Response.json({ error: "Your account is already linked to a brother." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });

  const matches = await prisma.brother.findMany({
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

  const { avatarUrl } = parseAvatarFromMetadata(user.user_metadata);

  try {
    // Atomic check-and-set: only claim if the row is still unlinked. Guards the
    // TOCTOU window between the read above and this write — two accounts racing
    // for the same unclaimed brother can't both win (last-writer-wins overwrite).
    const claimed = await prisma.brother.updateMany({
      where: { id: brother.id, authUserId: null },
      data: { authUserId: user.id, avatarUrl, email: user.email ?? null },
    });
    if (claimed.count === 0) {
      return Response.json({ error: "This name was just linked to another account." }, { status: 409 });
    }
  } catch (e) {
    // Unique violation on authUserId (P2002) = this Google account already
    // claimed a different brother in a concurrent request.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "Your account is already linked to a brother." }, { status: 409 });
    }
    console.error("POST /api/auth/claim: DB update failed for user", user.id);
    return Response.json({ error: "Failed to link account. Please try again." }, { status: 500 });
  }

  await logActivity({
    actorId: brother.id,
    type: "success",
    message: `${user.email ?? "A new user"} claimed the ${name} profile`,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("brother_linked", "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
