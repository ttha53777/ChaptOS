import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";
import { changeEventDetail, listCalendar, updateCalendar } from "@/lib/services/calendar-service";
import { listEventTypes } from "@/lib/services/calendar-event-type-service";
import { eventDetailsSchema, parseEventDetails, type EventDetail } from "@/lib/event-details";
import { updateCalendarInput } from "@/lib/validation/calendar";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createCalendarEvent } from "../setup/factories";

beforeEach(async () => { await resetDb(); });
afterAll(() => testPrisma.$disconnect());

const DETAILS: EventDetail[] = [
  { id: "sup", type: "supplies", items: [{ id: "ice", item: "Ice (6 bags)", who: null }, { id: "grill", item: "Grill", who: null }] },
  { id: "ck", type: "checklist", items: [{ id: "lot", t: "Reserve the lot", done: false }] },
  { id: "bg", type: "budget", items: [{ id: "food", label: "Food", amt: 180 }] },
  { id: "dr", type: "dress", pick: "Theme", note: "Wear the colors" },
];

async function setup() {
  const org = await createOrg("Details", "details");
  const officer = await createBrother({ orgId: org.id, name: "Priya Shah", isOrgAdmin: true });
  const leo = await createBrother({ orgId: org.id, name: "Leo Park" });
  const ana = await createBrother({ orgId: org.id, name: "Ana Torres" });
  const event = await createCalendarEvent({ orgId: org.id, category: "social", mandatory: false });
  await testPrisma.calendarEvent.update({ where: { id: event.id }, data: { details: DETAILS } });
  const ctxFor = (b: { id: number }, admin = false) => ({ orgId: org.id, actorId: b.id, isOrgAdmin: admin, permissions: 0, requestId: "t", db: db(org.id) }) as unknown as RequestContext;
  return { org, event, officerCtx: ctxFor(officer, true), leoCtx: ctxFor(leo), anaCtx: ctxFor(ana), leo };
}
const stored = async (id: number) => parseEventDetails((await testPrisma.calendarEvent.findUniqueOrThrow({ where: { id } })).details);

describe("event details", () => {
  it("hides the planning details (checklist, budget) from members' reads", async () => {
    const { event, officerCtx, leoCtx } = await setup();
    const asOfficer = (await listCalendar(officerCtx)).find(e => e.id === event.id)!;
    const asMember = (await listCalendar(leoCtx)).find(e => e.id === event.id)!;
    expect(asOfficer.details.map(d => d.type)).toEqual(["supplies", "checklist", "budget", "dress"]);
    expect(asMember.details.map(d => d.type)).toEqual(["supplies", "dress"]);
  });

  it("lets a member claim an open item once, and only drop their own claim", async () => {
    const { event, leoCtx, anaCtx, officerCtx, leo } = await setup();
    const back = await changeEventDetail(leoCtx, event.id, { op: "claim", detailId: "sup", itemId: "ice", claim: true });
    expect(back.map(d => d.type)).not.toContain("budget");
    expect((await stored(event.id))[0]).toMatchObject({ items: [{ id: "ice", who: leo.id }, { id: "grill", who: null }] });

    await expect(changeEventDetail(anaCtx, event.id, { op: "claim", detailId: "sup", itemId: "ice", claim: true })).rejects.toThrow(/claimed/);
    await expect(changeEventDetail(anaCtx, event.id, { op: "claim", detailId: "sup", itemId: "ice", claim: false })).rejects.toThrow(/officer/);
    await changeEventDetail(officerCtx, event.id, { op: "claim", detailId: "sup", itemId: "ice", claim: false });
    expect((await stored(event.id))[0]).toMatchObject({ items: [{ id: "ice", who: null }, { id: "grill", who: null }] });
    expect(await testPrisma.operationalEvent.count({ where: { action: "calendar.detail_changed" } })).toBe(2);
  });

  it("keeps the checklist officers-only", async () => {
    const { event, leoCtx, officerCtx } = await setup();
    await expect(changeEventDetail(leoCtx, event.id, { op: "tick", detailId: "ck", itemId: "lot", done: true })).rejects.toThrow(/officer/);
    await changeEventDetail(officerCtx, event.id, { op: "tick", detailId: "ck", itemId: "lot", done: true });
    expect((await stored(event.id))[1]).toMatchObject({ items: [{ id: "lot", done: true }] });
  });

  it("can't reach another org's event", async () => {
    const { event } = await setup();
    const other = await createOrg("Other", "other");
    const stranger = await createBrother({ orgId: other.id });
    const ctx = { orgId: other.id, actorId: stranger.id, isOrgAdmin: false, permissions: 0, requestId: "t", db: db(other.id) } as unknown as RequestContext;
    await expect(changeEventDetail(ctx, event.id, { op: "claim", detailId: "sup", itemId: "ice", claim: true })).rejects.toThrow(/not found/i);
    expect((await stored(event.id))[0]).toMatchObject({ items: [{ who: null }, { who: null }] });
  });

  it("remembers a blank copy as the type's template, and clears it when switched off", async () => {
    const { org, event, officerCtx } = await setup();
    await testPrisma.calendarEventType.create({ data: { organizationId: org.id, slug: "social", label: "Social", color: "#9C6B08" } });
    await updateCalendar(officerCtx, event.id, updateCalendarInput.parse({ details: DETAILS, rememberDetails: true }));
    const social = (await listEventTypes(officerCtx)).find(t => t.slug === "social")!;
    expect(social.detailTemplate!.map(d => d.type)).toEqual(["supplies", "checklist", "budget", "dress"]);
    expect(social.detailTemplate![0]).toMatchObject({ items: [] });
    expect(social.detailTemplate![3]).toMatchObject({ pick: null, note: "" });

    await updateCalendar(officerCtx, event.id, updateCalendarInput.parse({ rememberDetails: false }));
    expect((await listEventTypes(officerCtx)).find(t => t.slug === "social")!.detailTemplate).toBeNull();
    // The event's own details are untouched by either.
    expect(await stored(event.id)).toHaveLength(4);
  });

  it("refuses two of the same kind and keeps a bad stored entry from sinking the rest", () => {
    expect(eventDetailsSchema.safeParse([DETAILS[3], { ...DETAILS[3], id: "dr2" }]).success).toBe(false);
    expect(eventDetailsSchema.safeParse([{ id: "c1", type: "custom", label: "A", kind: "text", value: "", options: [] }, { id: "c2", type: "custom", label: "B", kind: "yesno", value: true, options: [] }]).success).toBe(true);
    expect(parseEventDetails([DETAILS[3], { id: "x", type: "cover", src: "" }, null]).map(d => d.id)).toEqual(["dr"]);
  });
});
