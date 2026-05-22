import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logActivity } from "@/lib/activity";
import { hydrateBrotherAvatars, publicBrother } from "@/lib/brother-avatar";

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
    console.error("GET /api/brothers failed:", e);
    return Response.json({ error: "Failed to fetch brothers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  try {
    const body = await req.json();
    const { name, role, duesOwed, gpa, serviceHours } = body;

    if (!name || !role || duesOwed == null || gpa == null || serviceHours == null) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (String(name).length > 200) return Response.json({ error: "Name too long" }, { status: 400 });

    const brother = await prisma.brother.create({
      data: {
        name: String(name),
        role: String(role),
        attendance: 0, // system-managed — always starts at 0
        duesOwed: Number(duesOwed),
        gpa: Number(gpa),
        serviceHours: Number(serviceHours),
      },
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} added ${brother.name} as ${brother.role}`,
    });

    return Response.json(brother, { status: 201 });
  } catch (e) {
    console.error("POST /api/brothers failed:", e);
    return Response.json({ error: "Failed to create brother" }, { status: 500 });
  }
}
