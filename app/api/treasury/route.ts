import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { logError } from "@/lib/observability";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [parties, transactions] = await Promise.all([
      db(user.orgId).partyEvent.findMany({
        orderBy: { date: "asc" },
        select: { date: true, doorRevenue: true },
      }),
      db(user.orgId).transaction.findMany({
        where: { deletedAt: null },
        orderBy: { date: "asc" },
        select: { date: true, type: true, amount: true },
      }),
    ]);

    const totalDoorRevenue = parties.reduce((sum: number, p) => sum + p.doorRevenue, 0);
    let totalIncome = 0, totalExpenses = 0;
    for (const t of transactions) {
      if (t.type === "income") totalIncome  += t.amount;
      else                     totalExpenses += t.amount;
    }
    const netBalance = totalDoorRevenue + totalIncome - totalExpenses;

    // Build a combined month map: net delta per YYYY-MM
    const monthMap = new Map<string, number>();
    for (const p of parties) {
      const month = p.date.slice(0, 7);
      monthMap.set(month, (monthMap.get(month) ?? 0) + p.doorRevenue);
    }
    for (const t of transactions) {
      const month = t.date.slice(0, 7);
      const delta = t.type === "income" ? t.amount : -t.amount;
      monthMap.set(month, (monthMap.get(month) ?? 0) + delta);
    }

    const sortedMonths = Array.from(monthMap.keys()).sort();
    let running = 0;
    const trend = sortedMonths.map(ym => {
      running += monthMap.get(ym) ?? 0;
      const [, m] = ym.split("-");
      return { month: MONTH_LABELS[Number(m) - 1], balance: running };
    });

    return Response.json({
      balance:   Math.round(netBalance * 100) / 100,
      projected: Math.round(netBalance * 1.3),
      trend,
    });
  } catch (e) {
    logError(e, { route: "/api/treasury", method: "GET", userId: user?.id });
    return Response.json({ error: "Failed to fetch treasury data" }, { status: 500 });
  }
}
