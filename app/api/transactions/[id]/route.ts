import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const stringFields  = ["type", "category", "date", "description", "paymentMethod", "paidTo", "semester"] as const;
  const numericFields = ["amount"] as const;
  const data: Record<string, string | number> = {};

  for (const key of stringFields) {
    if (key in body) data[key] = String(body[key]);
  }
  for (const key of numericFields) {
    if (key in body) {
      const n = Number(body[key]);
      if (isNaN(n) || n < 0) return Response.json({ error: `${key} must be a non-negative number` }, { status: 400 });
      data[key] = n;
    }
  }

  if ("type" in data && data.type !== "income" && data.type !== "expense") {
    return Response.json({ error: "type must be income or expense" }, { status: 400 });
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "No valid fields provided" }, { status: 400 });
  }

  try {
    const tx = await prisma.transaction.update({
      where: { id: numId },
      data,
    });
    return Response.json(tx);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Transaction not found" }, { status: 404 });
    }
    console.error("PATCH /api/transactions/[id] failed:", e);
    return Response.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}

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
    await prisma.transaction.update({
      where: { id: numId },
      data: { deletedAt: new Date() },
    });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Transaction not found" }, { status: 404 });
    }
    return Response.json({ error: "Failed to delete transaction" }, { status: 500 });
  }
}
