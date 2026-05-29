/**
 * Test data factories. Builds the minimal seed shape needed for tenancy and
 * service tests. Each factory returns the created row so tests can assert on
 * specific ids without hardcoding.
 */

import { testPrisma } from "./prisma";

export async function createOrg(name: string, slug: string) {
  return testPrisma.organization.create({ data: { name, slug } });
}

export async function createBrother(opts: { orgId: number; name?: string; isAdmin?: boolean }) {
  const brother = await testPrisma.brother.create({
    data: {
      organizationId: opts.orgId,
      name:           opts.name ?? `Tester ${Math.random().toString(36).slice(2, 7)}`,
      role:           "Brother",
      attendance:     0,
      duesOwed:       0,
      gpa:            0,
      serviceHours:   0,
      isAdmin:        opts.isAdmin ?? false,
    },
  });
  await testPrisma.membership.create({
    data: { brotherId: brother.id, organizationId: opts.orgId, isOrgAdmin: opts.isAdmin ?? false },
  });
  return brother;
}

export async function createSemester(opts: { orgId: number; label?: string; isActive?: boolean }) {
  return testPrisma.semester.create({
    data: {
      organizationId: opts.orgId,
      label:          opts.label ?? "TEST26",
      startDate:      "2026-01-01",
      endDate:        "2026-06-30",
      isActive:       opts.isActive ?? true,
    },
  });
}

export async function createCalendarEvent(opts: {
  orgId: number; title?: string; date?: string; category?: string; mandatory?: boolean;
}) {
  return testPrisma.calendarEvent.create({
    data: {
      organizationId: opts.orgId,
      title:          opts.title ?? "Test Event",
      date:           opts.date ?? "2026-05-01",
      category:       opts.category ?? "chapter",
      mandatory:      opts.mandatory ?? true,
    },
  });
}

export async function createTransaction(opts: {
  orgId: number; type?: "income" | "expense"; category?: string; amount?: number; description?: string;
}) {
  return testPrisma.transaction.create({
    data: {
      organizationId: opts.orgId,
      type:           opts.type ?? "income",
      category:       opts.category ?? "Dues",
      amount:         opts.amount ?? 100,
      amountCents:    BigInt(Math.round((opts.amount ?? 100) * 100)),
      date:           "2026-05-01",
      description:    opts.description ?? "Test tx",
    },
  });
}
