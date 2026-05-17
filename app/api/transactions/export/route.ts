import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const semester = searchParams.get("semester") ?? "all";

    const transactions = await prisma.transaction.findMany({
      where: semester !== "all"
        ? { deletedAt: null, semester }
        : { deletedAt: null },
      orderBy: { date: "asc" },
    });

    const header = ["Date", "Type", "Category", "Description", "Amount", "Payment Method", "Paid To", "Semester"];
    const rows = transactions.map(tx => [
      tx.date,
      tx.type,
      tx.category,
      `"${tx.description.replace(/"/g, '""')}"`,
      tx.amount.toFixed(2),
      tx.paymentMethod ?? "",
      tx.paidTo        ?? "",
      tx.semester      ?? "",
    ]);

    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const filename = semester !== "all" ? `transactions-${semester}.csv` : "transactions.csv";

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
