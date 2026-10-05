import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";
import { setActionItemDone, summarizeMeeting } from "@/lib/services/meeting-summary-service";
import { parseMeetingSummary } from "@/lib/meeting-summary";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createCalendarEvent } from "../setup/factories";

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getOpenAI: () => ({ chat: { completions: { create: complete } } }), CHAT_MODEL: "test", MAX_COMPLETION_TOKENS: 100 }));
beforeEach(async () => { await resetDb(); complete.mockReset(); });
const reply = (gist: string, actions: { text: string; owner: string | null; due: string | null }[] = [], decisions: string[] = []) =>
  ({ choices: [{ message: { content: JSON.stringify({ gist, decisions, actions }) } }] });
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
    complete.mockResolvedValueOnce(reply("New summary"));
    const latest = await summarizeMeeting(ctx, event.id);
    expect(latest.notesSummaryRevision).toBe(2);
    resolveOld(reply("Old summary"));
    expect(await oldRequest).toMatchObject({ notesSummary: "New summary", notesSummaryRevision: 2 });
  });
});

describe("structured summary + action items", () => {
  async function setup() {
    const org = await createOrg("Items", "items");
    const officer = await createBrother({ orgId: org.id, name: "Priya Shah", isOrgAdmin: true });
    const dev = await createBrother({ orgId: org.id, name: "Dev Okafor" });
    await createBrother({ orgId: org.id, name: "Jordan Lee" });
    await createBrother({ orgId: org.id, name: "Jordan Park" });
    const event = await createCalendarEvent({ orgId: org.id });
    await testPrisma.calendarEvent.update({ where: { id: event.id }, data: { description: "Dues report, formal plans and the DJ. Plenty of notes.", notesContentRevision: 1 } });
    const ctxFor = (b: { id: number }, admin = false) => ({ orgId: org.id, actorId: b.id, isOrgAdmin: admin, permissions: 0, requestId: "t", db: db(org.id) }) as unknown as RequestContext;
    return { event, dev, officerCtx: ctxFor(officer, true), devCtx: ctxFor(dev) };
  }

  it("resolves owners against the roster and renders markdown", async () => {
    const { event, dev, officerCtx } = await setup();
    complete.mockResolvedValueOnce(reply("Dues are in.", [
      { text: "Send the budget", owner: "Dev", due: "2026-10-10" },
      { text: "Book the DJ", owner: "Jordan", due: null },
    ], ["Late fee stays at $15"]));
    const res = await summarizeMeeting(officerCtx, event.id);
    const data = parseMeetingSummary(res.notesSummaryData)!;
    expect(data.actions.map(a => [a.owner, a.brotherId, a.due])).toEqual([["Dev", dev.id, "2026-10-10"], ["Jordan", null, null]]);
    expect(res.notesSummary).toContain("**Action items**");
    expect(res.notesSummary).toContain("- Dev: Send the budget (by 2026-10-10)");
  });

  it("lets the owner tick their own item, refuses others, and keeps ticks across re-summarize", async () => {
    const { event, officerCtx, devCtx } = await setup();
    complete.mockResolvedValueOnce(reply("Dues are in.", [
      { text: "Send the budget", owner: "Dev", due: null },
      { text: "Book the DJ", owner: "Priya", due: null },
    ]));
    await summarizeMeeting(officerCtx, event.id);
    expect((await setActionItemDone(devCtx, event.id, "a1", true)).actions[0].done).toBe(true);
    await expect(setActionItemDone(devCtx, event.id, "a2", true)).rejects.toThrow(/owner/);
    expect((await setActionItemDone(officerCtx, event.id, "a2", true)).actions[1].done).toBe(true);
    expect(await testPrisma.operationalEvent.count({ where: { action: "calendar.action_item_toggled" } })).toBe(2);

    await testPrisma.calendarEvent.update({ where: { id: event.id }, data: { notesContentRevision: 2 } });
    complete.mockResolvedValueOnce(reply("Dues are in.", [
      { text: "Send the budget", owner: "Dev", due: null },
      { text: "Rent the grill", owner: "Priya", due: null },
    ]));
    const again = parseMeetingSummary((await summarizeMeeting(officerCtx, event.id)).notesSummaryData)!;
    expect(again.actions.map(a => a.done)).toEqual([true, false]);
  });
});
