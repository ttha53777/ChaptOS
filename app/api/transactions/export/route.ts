import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";

function csvSafeStr(s: string | null | undefined): string {
  const v = (s ?? "").replace(/"/g, '""');
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
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
      csvSafeStr(tx.date),
      csvSafeStr(tx.type),
      csvSafeStr(tx.category),
      `"${csvSafeStr(tx.description)}"`,
      tx.amount.toFixed(2),
      csvSafeStr(tx.paymentMethod),
      csvSafeStr(tx.paidTo),
      csvSafeStr(tx.semester),
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
    console.error("GET /api/transactions/export failed:", e);
    return Response.json({ error: "Failed to export transactions" }, { status: 500 });
  }
}
