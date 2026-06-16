/**
 * Test data factories. Builds the minimal seed shape needed for tenancy and
 * service tests. Each factory returns the created row so tests can assert on
 * specific ids without hardcoding.
 */

import { testPrisma } from "./prisma";

export async function createOrg(name: string, slug: string) {
  return testPrisma.organization.create({ data: { name, slug } });
}

export async function createBrother(opts: {
  orgId: number;
  name?: string;
  isAdmin?: boolean;
  isOrgAdmin?: boolean;
  serviceHours?: number;
  isGhost?: boolean;
}) {
  const brother = await testPrisma.brother.create({
    data: {
      organizationId: opts.orgId,
      name:           opts.name ?? `Tester ${Math.random().toString(36).slice(2, 7)}`,
      role:           "Brother",
      attendance:     0,
      duesOwed:       0,
      gpa:            0,
      serviceHours:   opts.serviceHours ?? 0,
      isAdmin:        opts.isAdmin ?? false,
      isGhost:        opts.isGhost ?? false,
    },
  });
  await testPrisma.membership.create({
    data: {
      brotherId:      brother.id,
      organizationId: opts.orgId,
      isOrgAdmin:     opts.isOrgAdmin ?? opts.isAdmin ?? false,
    },
  });
  return brother;
}

export async function createSemester(opts: {
  orgId: number;
  label?: string;
  isActive?: boolean;
}) {
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
  orgId: number;
  title?: string;
  date?: string;
  category?: string;
  mandatory?: boolean;
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
  orgId: number;
  type?: "income" | "expense";
  category?: string;
  amount?: number;
  description?: string;
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

export async function createServiceEvent(opts: {
  orgId: number;
  title?: string;
  calendarEventId?: number;
}) {
  return testPrisma.serviceEvent.create({
    data: {
      organizationId: opts.orgId,
      title:          opts.title ?? "Test Service Event",
      date:           "2026-05-01",
      location:       "TBD",
      calendarEventId: opts.calendarEventId ?? null,
    },
  });
}

export async function createServiceParticipation(opts: {
  orgId: number;
  serviceEventId: number;
  brotherId: number;
  hours?: number;
}) {
  return testPrisma.serviceParticipation.create({
    data: {
      organizationId: opts.orgId,
      serviceEventId: opts.serviceEventId,
      brotherId:      opts.brotherId,
      hours:          opts.hours ?? 0,
    },
  });
}

export async function createPartyEvent(opts: {
  orgId: number;
  name?: string;
}) {
  return testPrisma.partyEvent.create({
    data: {
      organizationId: opts.orgId,
      name:           opts.name ?? "Test Party",
      date:           "2026-06-01",
      partyType:      "Open",
    },
  });
}

export async function createDeadline(opts: {
  orgId: number;
  title?: string;
}) {
  return testPrisma.deadline.create({
    data: {
      organizationId: opts.orgId,
      title:          opts.title ?? "Test Deadline",
      dueDate:        "2026-06-01",
      owner:          "Test Owner",
      status:         "pending",
    },
  });
}

export async function createInstagramTask(opts: {
  orgId: number;
  title?: string;
}) {
  return testPrisma.instagramTask.create({
    data: {
      organizationId: opts.orgId,
      title:          opts.title ?? "Test IG Task",
      dueDate:        "2026-06-01",
      status:         "Upcoming",
      type:           "Story",
    },
  });
}

export async function createDoc(opts: {
  orgId: number;
  title?: string;
}) {
  return testPrisma.doc.create({
    data: {
      organizationId: opts.orgId,
      title:          opts.title ?? "Test Doc",
      url:            "https://docs.google.com/test",
    },
  });
}

export async function createBudget(opts: {
  orgId: number;
  semester?: string;
}) {
  return testPrisma.budget.create({
    data: {
      organizationId:       opts.orgId,
      semester:             opts.semester ?? "SPR26",
      carryoverBalance:     0,
      carryoverBalanceCents: BigInt(0),
      reserveAmount:        0,
      reserveAmountCents:   BigInt(0),
    },
  });
}

export async function createActivityLog(opts: {
  orgId: number;
  message?: string;
}) {
  return testPrisma.activityLog.create({
    data: {
      organizationId: opts.orgId,
      type:           "info",
      message:        opts.message ?? "Test log entry",
    },
  });
}

export async function createAnnouncement(opts: {
  orgId: number;
  title?: string;
}) {
  return testPrisma.chapterAnnouncement.create({
    data: {
      organizationId: opts.orgId,
      title:          opts.title ?? "Test Announcement",
      body:           "Test body",
    },
  });
}
