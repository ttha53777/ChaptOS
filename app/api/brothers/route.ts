import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logActivity } from "@/lib/activity";
import { hydrateBrotherAvatars, publicBrother } from "@/lib/brother-avatar";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Ghost members (Atomic Samurai backdoor) are excluded from every listing —
    // they have full read access but never appear in the brotherhood.
    const brothers = await prisma.brother.findMany({ where: { isGhost: false }, orderBy: { id: "asc" } });
    const hydrated = await hydrateBrotherAvatars(brothers);
    return Response.json(hydrated.map(publicBrother));
  } catch (e) {
    logError(e, { route: "/api/brothers", method: "GET", userId: user.id });
    return Response.json({ error: "Failed to fetch brothers" }, { status: 500 });
  }
}

// Parse a non-negative finite number from an unknown input. Returns null when the
// value is missing, NaN, Infinity, negative, or otherwise unusable — callers
// translate null into a 400 with a specific field name.
function parseNonNegativeNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  // C1: rate-limit admin writes too — bug or compromised token shouldn't be able
  // to spam-create brothers. Mirrors every other write endpoint.
  const limited = checkMutationRate(user.id);
  if (limited) return limited;
  try {
    const body = await req.json();
    const { name, role, duesOwed, gpa, serviceHours } = body;

    if (!name || !role || duesOwed == null || gpa == null || serviceHours == null) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (String(name).length > 200) return Response.json({ error: "Name too long" }, { status: 400 });

    // C2: reject NaN/Infinity/negative *before* Prisma so the user sees a
    // specific field, not a generic 500.
    const parsedDues = parseNonNegativeNumber(duesOwed);
    const parsedGpa = parseNonNegativeNumber(gpa);
    const parsedHours = parseNonNegativeNumber(serviceHours);
    if (parsedDues === null)  return Response.json({ error: "duesOwed must be a non-negative number" }, { status: 400 });
    if (parsedGpa === null)   return Response.json({ error: "gpa must be a non-negative number" }, { status: 400 });
    if (parsedHours === null) return Response.json({ error: "serviceHours must be a non-negative number" }, { status: 400 });

    const brother = await prisma.brother.create({
      data: {
        name: String(name),
        role: String(role),
        attendance: 0, // system-managed — always starts at 0
        duesOwed: parsedDues,
        gpa: parsedGpa,
        serviceHours: parsedHours,
      },
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} added ${brother.name} as ${brother.role}`,
    });

    return Response.json(brother, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/brothers", method: "POST", userId: user.id });
    return Response.json({ error: "Failed to create brother" }, { status: 500 });
  }
}
