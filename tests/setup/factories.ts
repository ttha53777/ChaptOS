/**
 * Test data factories. Builds the minimal seed shape needed for tenancy and
 * service tests. Each factory returns the created row so tests can assert on
 * specific ids without hardcoding.
 */

import { testPrisma } from "./prisma";
import { BUILTIN_EVENT_TYPES } from "@/lib/event-types";
import { isReservedCategory, resolveCategorySeeds, type CategorySeed } from "@/lib/transaction-categories";

/**
 * The income/expense vocabulary a test org is seeded with.
 *
 * The default starter pack plus the legacy fraternity categories the existing
 * treasury tests are written against ("Brotherhood", "House", "Misc", …). Seeding
 * both keeps those tests honest — they exercise a real org's categories rather
 * than strings the service would now reject — without pinning every test to the
 * generic pack's vocabulary.
 *
 * Pass `categories` to createOrg to seed a different set (e.g. to test that a
 * category one org defined is invisible to another).
 */
const TEST_EXTRA_CATEGORIES: readonly CategorySeed[] = [
  // Expense side. Kept strictly one-sided so kind-mismatch tests have something
  // real to file on the wrong book — seeding every name under both kinds would
  // make the kind check untestable.
  ...["Brotherhood", "House", "Misc", "Events", "Party Supplies", "Travel"]
    .map((slug): CategorySeed => ({ kind: "expense", slug, label: slug, color: "#7a7266", colorDark: null })),
  ...["Door", "Fines"]
    .map((slug): CategorySeed => ({ kind: "income", slug, label: slug, color: "#7a7266", colorDark: null })),
];

export async function createOrg(name: string, slug: string, opts?: { categories?: readonly CategorySeed[] }) {
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

  // Same for the treasury vocabulary: every financial write now validates its
  // category against these rows (assertCategoryExists), so an org without them
  // can't record a transaction at all.
  const seeds = opts?.categories
    ? resolveCategorySeeds(opts.categories)
    : [...resolveCategorySeeds(), ...TEST_EXTRA_CATEGORIES];

  const order: Record<string, number> = { income: 0, expense: 0 };
  await testPrisma.transactionCategory.createMany({
    skipDuplicates: true,
    data: seeds.map(c => ({
      organizationId: org.id,
      kind:           c.kind,
      slug:           c.slug,
      label:          c.label,
      color:          c.color,
      colorDark:      c.colorDark,
      builtin:        isReservedCategory(c.kind, c.slug),
      hidden:         false,
      displayOrder:   order[c.kind]!++,
    })),
  });
  return org;
}

/**
 * A person plus their roster spot in one org.
 *
 * Two rows, because that is what a member is: a Brother (the shared identity —
 * one per human, whatever orgs they belong to) and a Membership (the roster row
 * — one per human per org, carrying everything that org assesses about them).
 * Use joinOrg below to give the same person a roster spot in a second org.
 */
export async function createBrother(opts: {
  orgId: number;
  name?: string;
  /** Per-org display name (Membership.name). Omit to fall back to Brother.name. */
  membershipName?: string;
  /** The legacy PLATFORM superuser flag on the shared account row. */
  isAdmin?: boolean;
  isOrgAdmin?: boolean;
  role?: string;
  gpa?: number;
  attendance?: number;
  serviceHours?: number;
  /** Opening dues balance. Seeded raw — the service layer no longer lets you set this. */
  duesOwed?: number;
  isGhost?: boolean;
  archivedAt?: Date | null;
}) {
  const brother = await testPrisma.brother.create({
    data: {
      organizationId: opts.orgId,
      name:           opts.name ?? `Tester ${Math.random().toString(36).slice(2, 7)}`,
      isAdmin:        opts.isAdmin ?? false,
      isGhost:        opts.isGhost ?? false,
    },
  });
  await joinOrg({ brotherId: brother.id, ...opts });
  return brother;
}

/**
 * Give an EXISTING person a roster spot in another org — the multi-org case.
 *
 * The identity row is untouched and shared; everything passed here lands on the
 * new Membership, so the same brotherId can carry entirely different numbers in
 * each org. This is the factory most Phase 2 tests are actually about.
 */
export async function joinOrg(opts: {
  brotherId: number;
  orgId: number;
  membershipName?: string;
  isAdmin?: boolean;
  isOrgAdmin?: boolean;
  role?: string;
  gpa?: number;
  attendance?: number;
  serviceHours?: number;
  duesOwed?: number;
  archivedAt?: Date | null;
}) {
  return testPrisma.membership.create({
    data: {
      brotherId:      opts.brotherId,
      organizationId: opts.orgId,
      isOrgAdmin:     opts.isOrgAdmin ?? opts.isAdmin ?? false,
      name:           opts.membershipName ?? null,
      role:           opts.role ?? "Brother",
      attendance:     opts.attendance ?? 0,
      duesOwed:       opts.duesOwed ?? 0,
      gpa:            opts.gpa ?? 0,
      serviceHours:   opts.serviceHours ?? 0,
      archivedAt:     opts.archivedAt ?? null,
    },
  });
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

/**
 * A member's roster row — the Membership carrying their numbers in one org.
 *
 * Most assertions want this rather than the Brother row: after Phase 2, `Brother`
 * holds only identity (name, email, avatar, authUserId) and every value a test
 * asserts on — dues, attendance, GPA, service hours, role, archived — lives here,
 * once per org.
 *
 * `orgId` is optional because most fixtures give a person exactly one org. Pass
 * it in multi-org tests, where the whole point is that the same brotherId has a
 * different row in each.
 */
export async function rosterOf(brotherId: number, orgId?: number) {
  return testPrisma.membership.findFirst({
    where: { brotherId, ...(orgId === undefined ? {} : { organizationId: orgId }) },
  });
}

/** Write roster values straight onto a member's row, bypassing the services. */
export async function setRoster(
  brotherId: number,
  data: Record<string, unknown>,
  orgId?: number,
) {
  return testPrisma.membership.updateMany({
    where: { brotherId, ...(orgId === undefined ? {} : { organizationId: orgId }) },
    data,
  });
}

/**
 * A person's shared identity row — name, email, avatar, authUserId, origin org.
 *
 * Use this only when the assertion is genuinely about the ACCOUNT: that it
 * survived, that another org's rename left it alone, that the origin-org pointer
 * is stale. Anything an org assesses (dues, GPA, attendance, role, archived)
 * lives on the roster row — use rosterOf.
 */
export async function accountOf(brotherId: number) {
  return testPrisma.brother.findUnique({ where: { id: brotherId } });
}
