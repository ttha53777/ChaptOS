import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { listTransactionsForExport } from "@/lib/services/transaction-service";

function csvSafeStr(s: string | null | undefined): string {
  const v = (s ?? "").replace(/"/g, '""');
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}
function quote(s: string | null | undefined): string { return `"${csvSafeStr(s)}"`; }

export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY", rateLimit: false });
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const semester = (searchParams.get("semester") ?? "").trim();
    const term = semester && semester !== "all" ? semester : null;
    const transactions = await listTransactionsForExport(ctx, term);

    const header = ["Date", "Type", "Category", "Description", "Amount", "Payment Method", "Semester"];
    const rows = transactions.map(tx => [
      quote(tx.date),
      quote(tx.type),
      quote(tx.category),
      quote(tx.description),
      tx.amount.toFixed(2),
      quote(tx.paymentMethod),
      quote(tx.semester),
    ]);

    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const fileTerm = term?.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
    const filename = fileTerm
      ? `transactions-${fileTerm}.csv`
      : "transactions.csv";

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    logError(e, { route: "/api/transactions/export", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
