import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { EXPENSE_CATEGORIES } from "../../data";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

const VALID_CATEGORIES = new Set<string>(EXPENSE_CATEGORIES);

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const semester = searchParams.get("semester");
  if (!semester) return Response.json({ error: "semester is required" }, { status: 400 });

  try {
    const budget = await prisma.budget.findUnique({ // lint-direct-prisma:ignore (include not typed through scoped wrapper)
      where: { organizationId_semester: { organizationId: user.orgId, semester } },
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
    logError(e, { route: "/api/budget", method: "GET", userId: user?.id });
    return Response.json({ error: "Failed to fetch budget" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { user, error } = await requirePermission("MANAGE_TREASURY");
  if (error) return error;
  const limited = checkMutationRate(user.id);
  if (limited) return limited;

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
    const orgId = user.orgId;
    const result = await db(orgId).$transaction(async (tx) => {
      const budget = await tx.budget.upsert({
        where: { organizationId_semester: { organizationId: orgId, semester } },
        create: { organizationId: orgId, semester, carryoverBalance: carryover, reserveAmount: reserve },
        update: { carryoverBalance: carryover, reserveAmount: reserve },
      });
      await tx.budgetAllocation.deleteMany({ where: { budgetId: budget.id } });
      if (allocations.length > 0) {
        await tx.budgetAllocation.createMany({
          data: allocations.map(a => ({ budgetId: budget.id, category: a.category, percent: a.percent })),
        });
      }
      return tx.budget.findUnique({
        where: { id: budget.id },
        include: { allocations: true },
      });
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} updated the ${semester} budget`,
      orgId: user.orgId,
    });

    return Response.json({
      semester: result!.semester,
      carryoverBalance: result!.carryoverBalance,
      reserveAmount: result!.reserveAmount,
      allocations: result!.allocations.map(a => ({ category: a.category, percent: a.percent })),
    });
  } catch (e) {
    logError(e, { route: "/api/budget", method: "PUT", userId: user?.id });
    return Response.json({ error: "Failed to save budget" }, { status: 500 });
  }
}
