import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logActivity } from "@/lib/activity";
import { coerceString, coerceNumber, isValidDateString } from "@/lib/coerce";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAdmin();
  if (error) return error;
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
    if (!(key in body)) continue;
    const s = coerceString(body[key]);
    if (s === undefined) return Response.json({ error: `${key} cannot be null` }, { status: 400 });
    if (key === "date" && !isValidDateString(s)) {
      return Response.json({ error: "date must use YYYY-MM-DD format" }, { status: 400 });
    }
    data[key] = s;
  }
  for (const key of numericFields) {
    if (!(key in body)) continue;
    const n = coerceNumber(body[key]);
    if (n === undefined) return Response.json({ error: `${key} cannot be null` }, { status: 400 });
    if (n === null || n < 0) return Response.json({ error: `${key} must be a non-negative number` }, { status: 400 });
    data[key] = n;
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

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} updated transaction #${tx.id} (${tx.description})`,
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
  const { user, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const existing = await prisma.transaction.findUnique({
      where: { id: numId },
      select: { description: true, amount: true },
    });
    await prisma.transaction.update({
      where: { id: numId },
      data: { deletedAt: new Date() },
    });

    if (existing) {
      await logActivity({
        actorId: user.id,
        type: "warning",
        message: `${user.name} deleted transaction: ${existing.description} ($${existing.amount.toFixed(2)})`,
      });
    }

    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Transaction not found" }, { status: 404 });
    }
    return Response.json({ error: "Failed to delete transaction" }, { status: 500 });
  }
}
