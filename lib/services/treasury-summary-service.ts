import type { RequestContext } from "@/lib/context";
import { money } from "@/lib/money";
import { netBalance } from "@/lib/treasury-balance";
import type { TreasuryData } from "@/lib/api-types";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** GET /api/treasury: balance, projection and the monthly trend. Also read by GET /api/dashboard. */
export async function getTreasurySummary(ctx: RequestContext): Promise<TreasuryData> {
    // One transaction for all three reads instead of three. Under
    // RLS_SET_ORG_ID=1 each ctx.db call opens its own (BEGIN + SET LOCAL +
    // query + COMMIT — ~570ms of fixed overhead apiece), so this Promise.all
    // overlapped the waiting but still paid the wrapper cost three times and
    // took three pooler checkouts. The reads are mutually independent, so they
    // stay in Promise.all inside the shared transaction. `.onTx(tx)` keeps each
    // one on its scoped delegate, so organizationId injection is unchanged.
    const [parties, transactions, config] = await ctx.db.$transaction(async tx => Promise.all([
      ctx.db.partyEvent.onTx(tx).findMany({
        orderBy: { date: "asc" },
        select: { date: true, doorRevenue: true },
      }),
      ctx.db.transaction.onTx(tx).findMany({
        where: { deletedAt: null },
        orderBy: { date: "asc" },
        select: { date: true, type: true, amount: true },
      }),
      ctx.db.organizationConfig.onTx(tx).find(),
    ]));

    const openingBalance = config?.openingBalance ?? null;

    const totalDoorRevenue = parties.reduce((sum: number, p) => sum + p.doorRevenue, 0);
    let totalIncome = 0, totalExpenses = 0;
    for (const t of transactions) {
      if (t.type === "income") totalIncome  += t.amount;
      else                     totalExpenses += t.amount;
    }
    const balance = netBalance({
      openingBalance,
      doorRevenue: totalDoorRevenue,
      income:      totalIncome,
      expense:     totalExpenses,
    });

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

    // The trend line starts where the books started, not at zero, so the last point
    // agrees with `balance` above.
    const sortedMonths = Array.from(monthMap.keys()).sort();
    let running = openingBalance ?? 0;
    const trend = sortedMonths.map(ym => {
      running += monthMap.get(ym) ?? 0;
      const [, m] = ym.split("-");
      return { month: MONTH_LABELS[Number(m) - 1], balance: money(running) };
    });

    return {
      balance:   money(balance),
      projected: Math.round(balance * 1.3),
      trend,
      openingBalance,
    } satisfies TreasuryData;
}
