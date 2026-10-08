/**
 * A meeting started from an agenda template: the server copies the template's
 * body into the notes with the blanks filled from the meeting itself, records
 * that copy as `notesSeed`, and from then on "has minutes" (and the summarizer)
 * only count what was written beyond it.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import { createCalendar } from "@/lib/services/calendar-service";
import { archiveAgendaTemplate, createAgendaTemplate, listAgendaTemplates } from "@/lib/services/agenda-template-service";
import { summarizeMeeting } from "@/lib/services/meeting-summary-service";
import { hasMinutes, minutesBeyondAgenda } from "@/lib/agenda-template";
import { ValidationError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getOpenAI: () => ({ chat: { completions: { create: complete } } }), CHAT_MODEL: "test", MAX_COMPLETION_TOKENS: 100 }));

beforeEach(async () => { await resetDb(); complete.mockReset(); });
afterAll(async () => { await testPrisma.$disconnect(); });

function ctxFor(orgId: number, actorId: number): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId, actorName: "Officer", actorEmail: null, authUserId: "auth-test",
    membershipId: null, permissions: 0, maxRank: 0, isOrgAdmin: true, isPlatformAdmin: false, db: db(orgId),
  };
}

const BODY = "## Roll call\n{{meeting_title}} · {{meeting_date}} · {{meeting_time}} · {{location}}\nPresent / Absent / Excused:\n\n## Action items\n[ ] Task — owner — due date";

async function chapter(slug = "alpha") {
  const org = await createOrg("Alpha", slug);
  await createSemester({ orgId: org.id });
  const officer = await createBrother({ orgId: org.id, name: "Jamie Sullivan" });
  const ctx = ctxFor(org.id, officer.id);
  const template = await createAgendaTemplate(ctx, { name: "Weekly chapter meeting", category: "meetings", body: BODY });
  return { org, ctx, template };
}

// Mon May 4 2026, 7:30–9:00 PM in New York (EDT, UTC−4).
const MAY4 = { kind: "timed" as const, start: "2026-05-04T23:30:00Z", end: "2026-05-05T01:00:00Z", timeZone: "America/New_York" };
const meeting = (extra: Record<string, unknown> = {}) => ({
  title: "Chapter meeting", date: "2026-05-04", category: "chapter", mandatory: true, location: "Chapter room", schedule: MAY4, ...extra,
});

describe("createCalendar with an agenda template", () => {
  it("copies the agenda with blanks filled in the meeting's own zone, and seeds it", async () => {
    const { ctx, template } = await chapter();
    const event = await createCalendar(ctx, { ...meeting(), agendaTemplateId: template.id });

    expect(event.description).toBe(
      "## Roll call\nChapter meeting · Mon, May 4 · 7:30 – 9:00 PM · Chapter room\nPresent / Absent / Excused:\n\n## Action items\n[ ] Task — owner — due date",
    );
    expect(event.notesSeed).toBe(event.description);
    expect(event.agendaTemplateId).toBe(template.id);
    expect(hasMinutes(event)).toBe(false);
    expect((await listAgendaTemplates(ctx))[0].uses).toBe(1);
  });

  it("uses a typed time when there's no structured schedule, and marks an empty blank", async () => {
    const { ctx, template } = await chapter();
    const event = await createCalendar(ctx, { ...meeting({ schedule: null, time: "7:00 PM", location: null }), agendaTemplateId: template.id });
    expect(event.description).toContain("Chapter meeting · Mon, May 4 · 7:00 PM · [Location]");
  });

  it("all-day meetings read 'All day'", async () => {
    const { ctx, template } = await chapter();
    const event = await createCalendar(ctx, { ...meeting({ schedule: { kind: "allDay", start: "2026-05-04", end: "2026-05-05" } }), agendaTemplateId: template.id });
    expect(event.description).toContain("· All day ·");
  });

  it("without a template the notes are exactly what was sent, unseeded", async () => {
    const { ctx } = await chapter();
    const event = await createCalendar(ctx, { ...meeting(), description: "" });
    expect(event.notesSeed).toBeNull();
    expect(event.agendaTemplateId).toBeNull();
  });

  it("refuses a deleted template, another org's template, a non-meeting, and text alongside a template", async () => {
    const { ctx, template } = await chapter();
    const other = await chapter("beta");

    await expect(createCalendar(ctx, { ...meeting(), agendaTemplateId: other.template.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(createCalendar(ctx, { ...meeting({ category: "party" }), agendaTemplateId: template.id })).rejects.toThrow(/chapter meetings/);
    await expect(createCalendar(ctx, { ...meeting({ description: "My own notes" }), agendaTemplateId: template.id })).rejects.toThrow(/not both/);
    await archiveAgendaTemplate(ctx, template.id);
    await expect(createCalendar(ctx, { ...meeting(), agendaTemplateId: template.id })).rejects.toThrow(/deleted/);
    expect(await testPrisma.calendarEvent.count()).toBe(0);
  });
});

describe("minutes beyond the agenda", () => {
  it("drops lines still exactly as the agenda wrote them, keeps headings and anything written", () => {
    const seed = "## Roll call\nPresent / Absent / Excused:\n\n## Action items\n[ ] Task — owner — due date";
    const notes = "## Roll call\nPresent / Absent / Excused: 41 / 3 / 2\n\n## Action items\n[ ] Task — owner — due date\n[ ] Dev to book the DJ by Oct 10";
    expect(minutesBeyondAgenda({ description: notes, notesSeed: seed }))
      .toBe("## Roll call\nPresent / Absent / Excused: 41 / 3 / 2\n\n## Action items\n[ ] Dev to book the DJ by Oct 10");
    expect(minutesBeyondAgenda({ description: "  Plain minutes  ", notesSeed: null })).toBe("Plain minutes");
  });

  it("the summarizer refuses an untouched agenda and never sees its placeholders", async () => {
    const { ctx, template } = await chapter();
    const event = await createCalendar(ctx, { ...meeting(), agendaTemplateId: template.id });
    await expect(summarizeMeeting(ctx, event.id)).rejects.toThrow(/Not enough notes/);
    expect(complete).not.toHaveBeenCalled();

    await testPrisma.calendarEvent.update({
      where: { id: event.id },
      data: { description: `${event.description}\n[ ] Dev to book the DJ for formal by Oct 10`, notesContentRevision: 1 },
    });
    complete.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ gist: "DJ booked.", decisions: [], actions: [] }) } }] });
    await summarizeMeeting(ctx, event.id);
    const sent = complete.mock.calls[0][0].messages[1].content as string;
    expect(sent).toContain("Dev to book the DJ");
    expect(sent).not.toContain("Task — owner — due date");
    expect(sent).not.toContain("Present / Absent / Excused:");
  });
});
