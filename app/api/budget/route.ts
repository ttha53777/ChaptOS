import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logActivity } from "@/lib/activity";
import { EXPENSE_CATEGORIES } from "../../data";

const VALID_CATEGORIES = new Set<string>(EXPENSE_CATEGORIES);

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const semester = searchParams.get("semester");
  if (!semester) return Response.json({ error: "semester is required" }, { status: 400 });

  try {
    const budget = await prisma.budget.findUnique({
      where: { semester },
      include: { allocations: true },
    });
    if (!budget) return Response.json(null);
    return Response.json({
      semester: budget.semester,
      carryoverBalance: budget.carryoverBalance,
      reserveAmount: budget.reserveAmount,
      allocations: budget.allocations.map(a => ({ category: a.category, percent: a.percent })),
    });
  } catch (e) {
    console.error("GET /api/budget failed:", e);
    return Response.json({ error: "Failed to fetch budget" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { semester, carryoverBalance, reserveAmount, allocations } = body as {
    semester?: string;
    carryoverBalance?: number;
    reserveAmount?: number;
    allocations?: { category: string; percent: number }[];
  };

  if (!semester || typeof semester !== "string") {
    return Response.json({ error: "semester is required" }, { status: 400 });
  }
  const carryover = Number(carryoverBalance ?? 0);
  if (isNaN(carryover)) {
    return Response.json({ error: "carryoverBalance must be a number" }, { status: 400 });
  }
  const reserve = Number(reserveAmount ?? 0);
  if (isNaN(reserve) || reserve < 0) {
    return Response.json({ error: "reserveAmount must be a non-negative number" }, { status: 400 });
  }
  if (!Array.isArray(allocations)) {
    return Response.json({ error: "allocations must be an array" }, { status: 400 });
  }

  const seenCategories = new Set<string>();
  for (const a of allocations) {
    if (!a || typeof a.category !== "string" || !VALID_CATEGORIES.has(a.category)) {
      return Response.json({ error: `Invalid category: ${a?.category}` }, { status: 400 });
    }
    if (seenCategories.has(a.category)) {
      return Response.json({ error: `Duplicate category: ${a.category}` }, { status: 400 });
    }
    seenCategories.add(a.category);
    if (typeof a.percent !== "number" || isNaN(a.percent) || a.percent < 0 || a.percent > 100) {
      return Response.json({ error: `Invalid percent for ${a.category}` }, { status: 400 });
    }
  }

  const total = allocations.reduce((s, a) => s + a.percent, 0);
  if (Math.abs(total - 100) > 0.01 && total !== 0) {
    return Response.json({ error: `Allocation percents must sum to 100 (got ${total.toFixed(2)})` }, { status: 400 });
  }

  try {
    const budget = await prisma.budget.upsert({
      where: { semester },
      create: { semester, carryoverBalance: carryover, reserveAmount: reserve },
      update: { carryoverBalance: carryover, reserveAmount: reserve },
    });
    await prisma.budgetAllocation.deleteMany({ where: { budgetId: budget.id } });
    if (allocations.length > 0) {
      await prisma.budgetAllocation.createMany({
        data: allocations.map(a => ({ budgetId: budget.id, category: a.category, percent: a.percent })),
      });
    }
    const result = await prisma.budget.findUnique({
      where: { id: budget.id },
      include: { allocations: true },
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} updated the ${semester} budget`,
    });

    return Response.json({
      semester: result!.semester,
      carryoverBalance: result!.carryoverBalance,
      reserveAmount: result!.reserveAmount,
      allocations: result!.allocations.map(a => ({ category: a.category, percent: a.percent })),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("PUT /api/budget failed:", e);
    return Response.json({ error: `Failed to save budget: ${detail}` }, { status: 500 });
  }
}
