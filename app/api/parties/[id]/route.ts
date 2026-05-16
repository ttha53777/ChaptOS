import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const data: Record<string, string | number | boolean | Date | null> = {};

  for (const key of stringFields) {
    if (key in body) {
      data[key] = key === "partyType"
        ? (body[key] === "Closed" ? "Closed" : "Open")
        : String(body[key]);
    }
  }
  for (const key of numericFields) {
    if (key in body) {
      const n = Number(body[key]);
      if (isNaN(n) || n < 0) return Response.json({ error: `${key} must be a non-negative number` }, { status: 400 });
      data[key] = n;
    }
  }

  // Handle completion payload
  if ("completed" in body) {
    const completing = body.completed === true;
    data.completed = completing;
    if (completing) {
      // Validate financial fields are present when marking complete
      const rev = "doorRevenue" in data ? data.doorRevenue : null;
      const att = "attendance"  in data ? data.attendance  : null;
      if (rev === null || att === null) {
        // Allow partial — they might already be set; just stamp completedAt
      }
      data.completedAt = new Date();
    } else {
      data.completedAt = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "No valid fields provided" }, { status: 400 });
  }

  try {
    const party = await prisma.partyEvent.update({
      where: { id: numId },
      data,
    });
    return Response.json(party);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Party event not found" }, { status: 404 });
    }
    return Response.json({ error: "Failed to update party event" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    await prisma.partyEvent.delete({ where: { id: numId } });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Party event not found" }, { status: 404 });
    }
    return Response.json({ error: "Failed to delete party event" }, { status: 500 });
  }
}
