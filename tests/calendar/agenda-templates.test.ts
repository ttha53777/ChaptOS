/**
 * Agenda templates: the shared meeting agendas Add meeting copies into a new
 * meeting's notes.
 *
 * What's load-bearing here: one live default per org (and flipping it isn't an
 * "edit"), delete is an archive that Undo reverses with the meeting count
 * intact, a save that raced another officer's is refused rather than winning,
 * an unknown {{field}} never gets saved, and none of it crosses orgs.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import {
  archiveAgendaTemplate,
  createAgendaTemplate,
  listAgendaTemplates,
  updateAgendaTemplate,
} from "@/lib/services/agenda-template-service";
import { agendaFieldsIn, agendaSections, agendaValues, bulletOf, checkOf, fillAgenda, formatAgendaDate, formatAgendaTime, hasMinutes, headingOf, minutesBeyondAgenda, unknownAgendaFields } from "@/lib/agenda-template";
import { createAgendaTemplateInput } from "@/lib/validation/agenda-template";
import { PERMISSIONS } from "@/lib/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, actorId: number, permissions: number = PERMISSIONS.MANAGE_EVENTS): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions,
    maxRank:         0,
    isOrgAdmin:      false,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

async function chapter(slug = "alpha") {
  const org = await createOrg("Alpha", slug);
  const member = await createBrother({ orgId: org.id, name: "Jamie Sullivan" });
  return { org, member, ctx: ctxFor(org.id, member.id) };
}

const WEEKLY = {
  name: "Weekly chapter meeting",
  description: "Roll call to adjournment.",
  category: "meetings" as const,
  body: "## Roll call\n{{meeting_date}} · {{meeting_time}} · {{location}}\n\n## Action items\n[ ] Task — owner — due",
};

describe("lib/agenda-template", () => {
  it("lists known blanks, flags unknown ones, and reads section headings", () => {
    const body = "## Opening\n{{ meeting_title }} on {{meeting_date}}\n{{room}}\n## Close";
    expect(agendaFieldsIn(body)).toEqual(["meeting_title", "meeting_date"]);
    expect(unknownAgendaFields(body)).toEqual(["room"]);
    expect(agendaSections(body)).toEqual(["Opening", "Close"]);
  });

  it("fills blanks from the form and marks the ones the form left empty", () => {
    expect(fillAgenda("{{meeting_date}} at {{location}}", { meeting_date: "Mon, Oct 12", location: "  " }))
      .toBe("Mon, Oct 12 at [Location]");
  });

  it("reads headings the way people type them — with or without the space", () => {
    // The real template that rendered as plain text: "##Prez:" with no space.
    expect(agendaSections("##Prez:\n\n\n##VPI:\n\n## Treasurer\n# Old business\n### Votes")).toEqual(["Prez:", "VPI:", "Treasurer", "Old business", "Votes"]);
    expect(headingOf("##Prez:")).toEqual({ text: "Prez:", marker: 2 });
    expect(headingOf("#1 priority is rush")).toBeNull();
    expect(headingOf("####too deep")).toBeNull();
    expect(headingOf("##")).toBeNull();
    expect(checkOf("- [x] Book the DJ")).toEqual({ box: "- [x]", done: true, text: "Book the DJ" });
    expect(checkOf("[ ] Task")).toEqual({ box: "[ ]", done: false, text: "Task" });
    expect(bulletOf("* Chapter priorities")).toEqual({ marker: "*", text: "Chapter priorities" });
    expect(bulletOf("- [ ] not a bullet")).toBeNull();
    expect(minutesBeyondAgenda({ description: "##Prez:\nDues are due Friday", notesSeed: "##Prez:\n" })).toBe("##Prez:\nDues are due Friday");
  });

  it("writes dates and times the way the filled agenda reads them", () => {
    expect(formatAgendaDate("2026-10-12")).toBe("Mon, Oct 12");
    expect(formatAgendaDate("not a date")).toBe("");
    expect(formatAgendaTime("19:30", "21:00")).toBe("7:30 – 9:00 PM");
    expect(formatAgendaTime("11:00", "13:00")).toBe("11:00 AM – 1:00 PM");
    expect(formatAgendaTime("00:15")).toBe("12:15 AM");
    expect(formatAgendaTime("")).toBe("");
    expect(agendaValues({ title: " Chapter ", date: "2026-10-12", startTime: "19:30", allDay: true, location: null }))
      .toEqual({ meeting_title: "Chapter", meeting_date: "Mon, Oct 12", meeting_time: "All day", location: "" });
  });

  it("an untouched agenda is not minutes; edited or seedless text is", () => {
    const seed = "## Roll call\nMon, Oct 12";
    expect(hasMinutes({ description: seed, notesSeed: seed })).toBe(false);
    expect(hasMinutes({ description: `${seed}\n`, notesSeed: seed })).toBe(false);
    expect(hasMinutes({ description: `${seed}\nPresent: 41`, notesSeed: seed })).toBe(true);
    expect(hasMinutes({ description: "Minutes", notesSeed: null })).toBe(true);
    expect(hasMinutes({ description: "  ", notesSeed: null })).toBe(false);
  });
});

describe("createAgendaTemplate", () => {
  it("saves a template the drawer then lists, with its editor's name", async () => {
    const { ctx } = await chapter();
    const created = await createAgendaTemplate(ctx, WEEKLY);

    expect(created).toMatchObject({ name: WEEKLY.name, category: "meetings", isDefault: false, uses: 0 });
    expect(created.updatedBy?.name).toBe("Jamie Sullivan");
    expect((await listAgendaTemplates(ctx)).map(t => t.id)).toEqual([created.id]);
  });

  it("refuses an unknown {{field}}, naming it", async () => {
    const { ctx } = await chapter();
    await expect(createAgendaTemplate(ctx, { ...WEEKLY, body: "## Roll\n{{room}}" }))
      .rejects.toThrow(/\{\{room\}\} isn't a blank/);
  });

  it("refuses a second live template with the same name, any case", async () => {
    const { ctx } = await chapter();
    await createAgendaTemplate(ctx, WEEKLY);
    await expect(createAgendaTemplate(ctx, { ...WEEKLY, name: "weekly CHAPTER meeting" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("the schema rejects a blank body and an unknown category", () => {
    expect(createAgendaTemplateInput.safeParse({ ...WEEKLY, body: "  \n" }).success).toBe(false);
    expect(createAgendaTemplateInput.safeParse({ ...WEEKLY, category: "socials" }).success).toBe(false);
  });

  it("needs MANAGE_EVENTS", async () => {
    const { org, member } = await chapter();
    const plain = ctxFor(org.id, member.id, 0);
    await expect(createAgendaTemplate(plain, WEEKLY)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listAgendaTemplates(plain)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("the default", () => {
  it("is one per org: making a second default clears the first", async () => {
    const { ctx } = await chapter();
    const a = await createAgendaTemplate(ctx, { ...WEEKLY, isDefault: true });
    const b = await createAgendaTemplate(ctx, { ...WEEKLY, name: "Exec check-in", category: "leadership" });

    await updateAgendaTemplate(ctx, b.id, { isDefault: true });
    const list = await listAgendaTemplates(ctx);
    expect(list.filter(t => t.isDefault).map(t => t.id)).toEqual([b.id]);
    // Listed first.
    expect(list[0].id).toBe(b.id);
    expect(list.find(t => t.id === a.id)?.isDefault).toBe(false);
  });

  it("flipping it isn't an edit: another officer's open editor still saves", async () => {
    const { ctx } = await chapter();
    const a = await createAgendaTemplate(ctx, { ...WEEKLY, isDefault: true });
    const b = await createAgendaTemplate(ctx, { ...WEEKLY, name: "Exec check-in" });

    // Someone has `a` open in the editor while b becomes the default (clearing a's flag).
    await updateAgendaTemplate(ctx, b.id, { isDefault: true });
    const saved = await updateAgendaTemplate(ctx, a.id, { body: `${WEEKLY.body}\n## Adjournment`, expectedUpdatedAt: a.updatedAt });
    expect(saved.body).toContain("Adjournment");
  });

  it("two officers making different defaults at once still leaves exactly one", async () => {
    const { ctx } = await chapter();
    const ids = [];
    for (const name of ["A", "B", "C", "D"]) ids.push((await createAgendaTemplate(ctx, { ...WEEKLY, name })).id);

    const results = await Promise.allSettled(ids.map(id => updateAgendaTemplate(ctx, id, { isDefault: true })));
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ConflictError);
    expect((await listAgendaTemplates(ctx)).filter(t => t.isDefault)).toHaveLength(1);
  });

  it("the database itself refuses a second live default", async () => {
    const { org, ctx } = await chapter();
    await createAgendaTemplate(ctx, { ...WEEKLY, isDefault: true });
    await expect(testPrisma.agendaTemplate.create({
      data: { organizationId: org.id, name: "Rogue", category: "meetings", body: "x", isDefault: true },
    })).rejects.toThrow();
  });

  it("is cleared by deleting the default, and can be cleared outright", async () => {
    const { ctx } = await chapter();
    const a = await createAgendaTemplate(ctx, { ...WEEKLY, isDefault: true });
    expect(await archiveAgendaTemplate(ctx, a.id)).toEqual({ id: a.id, wasDefault: true });

    const b = await createAgendaTemplate(ctx, { ...WEEKLY, name: "Exec check-in", isDefault: true });
    const cleared = await updateAgendaTemplate(ctx, b.id, { isDefault: false });
    expect(cleared.isDefault).toBe(false);
  });
});

describe("edit conflicts", () => {
  it("refuses a save made against a version someone else has since replaced", async () => {
    const { ctx } = await chapter();
    const t = await createAgendaTemplate(ctx, WEEKLY);
    await updateAgendaTemplate(ctx, t.id, { name: "Monday meeting", expectedUpdatedAt: t.updatedAt });

    await expect(updateAgendaTemplate(ctx, t.id, { name: "Weekly sync", expectedUpdatedAt: t.updatedAt }))
      .rejects.toBeInstanceOf(ConflictError);
    expect((await listAgendaTemplates(ctx))[0].name).toBe("Monday meeting");
  });

  it("refuses a body with an unknown field on edit too", async () => {
    const { ctx } = await chapter();
    const t = await createAgendaTemplate(ctx, WEEKLY);
    await expect(updateAgendaTemplate(ctx, t.id, { body: "{{when}}" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("delete and Undo", () => {
  it("archives: gone from the drawer, unreachable to edits, restored by Undo with its meetings", async () => {
    const { org, ctx } = await chapter();
    const t = await createAgendaTemplate(ctx, { ...WEEKLY, isDefault: true });
    await testPrisma.calendarEvent.create({
      data: { organizationId: org.id, title: "Chapter", date: "2026-10-12", category: "chapter", mandatory: true, agendaTemplateId: t.id },
    });

    await archiveAgendaTemplate(ctx, t.id);
    expect(await listAgendaTemplates(ctx)).toEqual([]);
    await expect(updateAgendaTemplate(ctx, t.id, { name: "Nope" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveAgendaTemplate(ctx, t.id)).rejects.toBeInstanceOf(NotFoundError);

    const back = await updateAgendaTemplate(ctx, t.id, { archived: false, isDefault: true });
    expect(back).toMatchObject({ id: t.id, uses: 1, isDefault: true });
  });

  it("Undo is refused when a live template took the name meanwhile", async () => {
    const { ctx } = await chapter();
    const t = await createAgendaTemplate(ctx, WEEKLY);
    await archiveAgendaTemplate(ctx, t.id);
    await createAgendaTemplate(ctx, WEEKLY);
    await expect(updateAgendaTemplate(ctx, t.id, { archived: false })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("tenancy", () => {
  it("another org can neither see nor touch a chapter's templates", async () => {
    const a = await chapter("alpha");
    const bOrg = await createOrg("Beta", "beta");
    const bMember = await createBrother({ orgId: bOrg.id, name: "Other Officer" });
    const b = ctxFor(bOrg.id, bMember.id);

    const t = await createAgendaTemplate(a.ctx, { ...WEEKLY, isDefault: true });
    expect(await listAgendaTemplates(b)).toEqual([]);
    await expect(updateAgendaTemplate(b, t.id, { name: "Hijacked" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveAgendaTemplate(b, t.id)).rejects.toBeInstanceOf(NotFoundError);

    // Beta's own default doesn't clear Alpha's.
    await createAgendaTemplate(b, { ...WEEKLY, isDefault: true });
    expect((await listAgendaTemplates(a.ctx))[0]).toMatchObject({ id: t.id, name: WEEKLY.name, isDefault: true });
  });
});
