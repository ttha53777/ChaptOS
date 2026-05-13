import { prisma } from "@/lib/prisma";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export async function GET() {
  const parties = await prisma.partyEvent.findMany({
    orderBy: { date: "asc" },
    select: { date: true, doorRevenue: true },
  });

  const totalRevenue = parties.reduce((sum, p) => sum + p.doorRevenue, 0);

  // Group revenue by YYYY-MM, then build a cumulative monthly trend
  const monthMap = new Map<string, number>();
  for (const p of parties) {
    const month = p.date.slice(0, 7); // "2026-02"
    monthMap.set(month, (monthMap.get(month) ?? 0) + p.doorRevenue);
  }

  let running = 0;
  const trend = Array.from(monthMap.entries()).map(([ym, rev]) => {
    running += rev;
    const [, m] = ym.split("-");
    return { month: MONTH_LABELS[Number(m) - 1], balance: running };
  });

  return Response.json({
    balance: totalRevenue,
    projected: Math.round(totalRevenue * 1.3),
    trend,
  });
}
