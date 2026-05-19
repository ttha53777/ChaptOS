import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";

// DELETE — unlink auth account from a brother row
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    // Prevent unlinking yourself — would lock you out
    const target = await prisma.brother.findUnique({
      where: { id: numId },
      select: { authUserId: true },
    });
    if (!target) return Response.json({ error: "Brother not found" }, { status: 404 });
    if (target.authUserId === user.authUserId) {
      return Response.json({ error: "You cannot unlink your own account" }, { status: 400 });
    }

    await prisma.brother.update({
      where: { id: numId },
      data: { authUserId: null },
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    console.error("DELETE /api/auth/accounts/[id] failed:", e);
    return Response.json({ error: "Failed to unlink account" }, { status: 500 });
  }
}
