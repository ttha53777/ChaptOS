import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/require-permission";
import { logError } from "@/lib/observability";

function csvSafeStr(s: string | null | undefined): string {
  const v = (s ?? "").replace(/"/g, '""');
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Quote every string cell so embedded commas/newlines don't shift columns. */
function quote(s: string | null | undefined): string {
  return `"${csvSafeStr(s)}"`;
}

export async function GET(req: NextRequest) {
  const { user, error } = await requirePermission("MANAGE_TREASURY");
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const semester = searchParams.get("semester") ?? "all";
    const safeSemester = semester.replace(/[^A-Za-z0-9_-]/g, "");

    const transactions = await prisma.transaction.findMany({
      where: safeSemester && safeSemester !== "all"
        ? { deletedAt: null, semester: safeSemester }
        : { deletedAt: null },
      orderBy: { date: "asc" },
    });

    const header = ["Date", "Type", "Category", "Description", "Amount", "Payment Method", "Paid To", "Semester"];
    const rows = transactions.map(tx => [
      quote(tx.date),
      quote(tx.type),
      quote(tx.category),
      quote(tx.description),
      tx.amount.toFixed(2),
      quote(tx.paymentMethod),
      quote(tx.paidTo),
      quote(tx.semester),
    ]);

    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const filename = safeSemester && safeSemester !== "all"
      ? `transactions-${safeSemester}.csv`
      : "transactions.csv";

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    logError(e, { route: "/api/transactions/export", method: "GET", userId: user.id });
    return Response.json({ error: "Failed to export transactions" }, { status: 500 });
  }
}
