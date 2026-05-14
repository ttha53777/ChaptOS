import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type     = searchParams.get("type");
  const semester = searchParams.get("semester");
  const category = searchParams.get("category");

  const transactions = await prisma.transaction.findMany({
    where: {
      deletedAt: null,
      ...(type     ? { type }     : {}),
      ...(semester ? { semester } : {}),
      ...(category ? { category } : {}),
    },
    orderBy: { date: "desc" },
  });

  return Response.json(transactions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, category, amount, date, description, paymentMethod, paidTo, semester } = body;

  if (!type || !category || amount == null || !date || description == null) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (type !== "income" && type !== "expense") {
    return Response.json({ error: "type must be income or expense" }, { status: 400 });
  }

  const tx = await prisma.transaction.create({
    data: {
      type:          String(type),
      category:      String(category),
      amount:        Number(amount),
      date:          String(date),
      description:   String(description),
      paymentMethod: paymentMethod ? String(paymentMethod) : null,
      paidTo:        paidTo        ? String(paidTo)        : null,
      semester:      semester      ? String(semester)      : null,
    },
  });

  return Response.json(tx, { status: 201 });
}
