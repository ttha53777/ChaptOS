import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";
import { summarizeMeeting } from "@/lib/services/meeting-summary-service";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createCalendarEvent } from "../setup/factories";

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getOpenAI: () => ({ chat: { completions: { create: complete } } }), CHAT_MODEL: "test", MAX_COMPLETION_TOKENS: 100 }));
beforeEach(async () => { await resetDb(); complete.mockReset(); });
afterAll(() => testPrisma.$disconnect());

describe("meeting summary revisions", () => {
  it("keeps a newer summary when an older AI request finishes last", async () => {
    const org = await createOrg("Summary", "summary");
    const actor = await createBrother({ orgId: org.id });
    const event = await createCalendarEvent({ orgId: org.id });
    const ctx = { orgId: org.id, actorId: actor.id, requestId: "summary-test", db: db(org.id) } as RequestContext;
    await testPrisma.calendarEvent.update({ where: { id: event.id }, data: { description: "First decision with enough notes to summarize.", notesContentRevision: 1 } });
    let resolveOld!: (value: unknown) => void;
    complete.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const oldRequest = summarizeMeeting(ctx, event.id);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    await testPrisma.calendarEvent.update({ where: { id: event.id }, data: { description: "Second decision with new action items for the chapter.", notesContentRevision: 2 } });
    complete.mockResolvedValueOnce({ choices: [{ message: { content: "New summary" } }] });
    const latest = await summarizeMeeting(ctx, event.id);
    expect(latest.notesSummaryRevision).toBe(2);
    resolveOld({ choices: [{ message: { content: "Old summary" } }] });
    expect(await oldRequest).toMatchObject({ notesSummary: "New summary", notesSummaryRevision: 2 });
  });
});
