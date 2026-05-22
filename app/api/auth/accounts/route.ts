import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const brothers = await prisma.brother.findMany({
      where: { isGhost: false },
      select: { id: true, name: true, role: true, authUserId: true, isAdmin: true, email: true },
      orderBy: { name: "asc" },
    });

    return Response.json(
      brothers.map(b => ({
        id: b.id,
        name: b.name,
        role: b.role,
        linked: b.authUserId !== null,
        isSelf: b.authUserId === user.authUserId,
        isAdmin: b.isAdmin,
        email: b.email,
      }))
    );
  } catch (e) {
    console.error("GET /api/auth/accounts failed:", e);
    return Response.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}
