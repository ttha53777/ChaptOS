/**
 * Test data factories. Builds the minimal seed shape needed for tenancy and
 * service tests. Each factory returns the created row so tests can assert on
 * specific ids without hardcoding.
 */

import { testPrisma } from "./prisma";
import { BUILTIN_EVENT_TYPES } from "@/lib/event-types";

export async function createOrg(name: string, slug: string) {
  const org = await testPrisma.organization.create({ data: { name, slug } });
  // Seed the built-in event types, mirroring provisionOrg, so service-layer
  // category validation (calendar-service) resolves like it does for a real org.
  await testPrisma.calendarEventType.createMany({
    data: BUILTIN_EVENT_TYPES.map((t, i) => ({
      organizationId:   org.id,
      slug:             t.slug,
      label:            t.label,
      color:            t.color,
      colorDark:        t.colorDark,
      workflowId:       t.workflowId,
      builtin:          true,
      creatable:        t.creatable,
      hidden:           false,
      mandatoryDefault: t.mandatoryDefault,
      displayOrder:     i,
    })),
  });
  return org;
}

export async function createBrother(opts: {
  orgId: number;
  name?: string;
  /** Per-org display name (Membership.name). Omit to fall back to Brother.name. */
  membershipName?: string;
  isAdmin?: boolean;
  isOrgAdmin?: boolean;
  serviceHours?: number;
  /** Opening dues balance. Seeded raw — the service layer no longer lets you set this. */
  duesOwed?: number;
  isGhost?: boolean;
}) {
  const brother = await testPrisma.brother.create({
    data: {
      organizationId: opts.orgId,
      name:           opts.name ?? `Tester ${Math.random().toString(36).slice(2, 7)}`,
      role:           "Brother",
      attendance:     0,
      duesOwed:       opts.duesOwed ?? 0,
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
      name:           opts.membershipName ?? null,
    },
  });
  return brother;
}

export async function createSemester(opts: {
  orgId: number;
  label?: string;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
}) {
  return testPrisma.semester.create({
    data: {
      organizationId: opts.orgId,
      label:          opts.label ?? "TEST26",
      startDate:      opts.startDate ?? "2026-01-01",
      endDate:        opts.endDate ?? "2026-06-30",
      isActive:       opts.isActive ?? true,
    },
  });
}

/** A custom (non-builtin) event type — e.g. the demoted social/fundy/program. */
export async function createEventType(opts: {
  orgId: number;
  slug: string;
  label?: string;
  color?: string;
  creatable?: boolean;
  hidden?: boolean;
  displayOrder?: number;
}) {
  return testPrisma.calendarEventType.create({
    data: {
      organizationId:   opts.orgId,
      slug:             opts.slug,
      label:            opts.label ?? opts.slug,
      color:            opts.color ?? "#888888",
      colorDark:        null,
      workflowId:       null,
      builtin:          false,
      creatable:        opts.creatable ?? true,
      hidden:           opts.hidden ?? false,
      mandatoryDefault: false,
      displayOrder:     opts.displayOrder ?? 100,
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

export async function createTask(opts: {
  orgId: number;
  title?: string;
  dueDate?: string | null;
  status?: "open" | "done";
  assigneeBrotherId?: number;
  assigneeRoleId?: number;
}) {
  const task = await testPrisma.task.create({
    data: {
      organizationId: opts.orgId,
      title:          opts.title ?? "Test Task",
      dueDate:        opts.dueDate === undefined ? "2026-06-01" : opts.dueDate,
      status:         opts.status ?? "open",
    },
  });
  if (opts.assigneeBrotherId || opts.assigneeRoleId) {
    await testPrisma.taskAssignment.create({
      data: {
        taskId:         task.id,
        organizationId: opts.orgId,
        brotherId:      opts.assigneeBrotherId ?? null,
        roleId:         opts.assigneeRoleId ?? null,
      },
    });
  }
  return task;
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
