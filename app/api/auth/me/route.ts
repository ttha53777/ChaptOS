import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const brother = await prisma.brother.findUnique({
    where: { id: user.id },
    select: { name: true },
  });

  return Response.json({
    name: brother?.name ?? user.email ?? "Unknown",
    role: user.role,
    email: user.email ?? "",
  });
}
