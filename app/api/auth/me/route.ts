import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const brother = await prisma.brother.findUnique({
      where: { id: user.id },
      select: { name: true },
    });

    return Response.json({
      id: user.id,
      name: brother?.name ?? user.email ?? "Unknown",
      role: user.role,
      isAdmin: user.isAdmin,
      email: user.email ?? "",
    });
  } catch (e) {
    console.error("GET /api/auth/me failed:", e);
    return Response.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}
