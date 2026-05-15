import { NextRequest } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type     = searchParams.get("type");
  const semester = searchParams.get("semester");
  const category = searchParams.get("category");

  try {
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
  } catch {
    return Response.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { type, category, amount, date, description, paymentMethod, paidTo, semester } = body;

  if (!type || !category || amount == null || !date || description == null) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (type !== "income" && type !== "expense") {
    return Response.json({ error: "type must be income or expense" }, { status: 400 });
  }
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount < 0) {
    return Response.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }

  try {
    const tx = await prisma.transaction.create({
      data: {
        type:          String(type),
        category:      String(category),
        amount:        numAmount,
        date:          String(date),
        description:   String(description),
        paymentMethod: paymentMethod ? String(paymentMethod) : null,
        paidTo:        paidTo        ? String(paidTo)        : null,
        semester:      semester      ? String(semester)      : null,
      },
    });
    return Response.json(tx, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "Duplicate entry" }, { status: 409 });
    }
    return Response.json({ error: "Failed to create transaction" }, { status: 500 });
  }
}
