import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const brothers = await prisma.brother.findMany({
      select: { id: true, name: true, role: true, authUserId: true },
      orderBy: { name: "asc" },
    });

    return Response.json(
      brothers.map(b => ({
        id: b.id,
        name: b.name,
        role: b.role,
        linked: b.authUserId !== null,
        isSelf: b.authUserId === user.authUserId,
      }))
    );
  } catch (e) {
    console.error("GET /api/auth/accounts failed:", e);
    return Response.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}
