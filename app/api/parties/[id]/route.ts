import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logActivity } from "@/lib/activity";
import { coerceString, coerceNumber, isValidDateString } from "@/lib/coerce";
import { logError } from "@/lib/observability";

type PartyUpdateData = Prisma.PartyEventUpdateInput;

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

  const stringFields  = ["name", "date", "notes", "theme", "collabOrg", "partyType"] as const;
  const numericFields = ["doorRevenue", "attendance", "expenses"] as const;
  const data: PartyUpdateData = {};

  for (const key of stringFields) {
    if (!(key in body)) continue;
    if (key === "partyType") {
      const pt = coerceString(body[key]);
      if (pt === undefined) return Response.json({ error: "partyType cannot be null" }, { status: 400 });
      data.partyType = pt === "Closed" ? "Closed" : "Open";
    } else {
      const s = coerceString(body[key]);
      if (s === undefined) return Response.json({ error: `${key} cannot be null` }, { status: 400 });
      if (key === "date" && !isValidDateString(s)) {
        return Response.json({ error: "date must use YYYY-MM-DD format" }, { status: 400 });
      }
      data[key] = s;
    }
  }
  for (const key of numericFields) {
    if (!(key in body)) continue;
    const n = coerceNumber(body[key]);
    if (n === undefined) return Response.json({ error: `${key} cannot be null` }, { status: 400 });
    if (n === null || n < 0) return Response.json({ error: `${key} must be a non-negative number` }, { status: 400 });
    data[key] = n;
  }

  if ("completed" in body) {
    const completing = body.completed === true;
    data.completed = completing;
    data.completedAt = completing ? new Date() : null;
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "No valid fields provided" }, { status: 400 });
  }

  if (body.completed === true) {
    const hasFinancials =
      ("doorRevenue" in body && body.doorRevenue != null) &&
      ("attendance" in body && body.attendance != null) &&
      ("expenses" in body && body.expenses != null);
    if (!hasFinancials) {
      return Response.json({ error: "Revenue, expenses, and attendance are required to complete a party" }, { status: 400 });
    }
  }

  const completing = body.completed === true;

  try {
    const party = await prisma.partyEvent.update({
      where: { id: numId },
      data,
    });

    await logActivity({
      actorId: user.id,
      type: completing ? "success" : "info",
      message: completing
        ? `${user.name} marked ${party.name} complete`
        : `${user.name} updated ${party.name}`,
    });

    return Response.json(party);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Party event not found" }, { status: 404 });
    }
    logError(e, { route: "/api/parties/[id]", method: "PATCH", userId: user?.id });
    return Response.json({ error: "Failed to update party event" }, { status: 500 });
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
    const target = await prisma.partyEvent.findUnique({
      where: { id: numId },
      select: { name: true },
    });
    await prisma.partyEvent.delete({ where: { id: numId } });

    await logActivity({
      actorId: user.id,
      type: "warning",
      message: `${user.name} deleted party ${target?.name ?? `#${numId}`}`,
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Party event not found" }, { status: 404 });
    }
    return Response.json({ error: "Failed to delete party event" }, { status: 500 });
  }
}
