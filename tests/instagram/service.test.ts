import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createCalendarEvent } from "../setup/factories";
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";
import { createInstagramTask, updateInstagramTask, listInstagramTasks, deleteInstagramTask } from "@/lib/services/instagram-service";
import { setInstagramHandle } from "@/lib/services/org-config-service";

beforeEach(resetDb);
afterEach(() => vi.useRealTimers());
afterAll(() => testPrisma.$disconnect());
function context(orgId: number, actorId: number, admin = true): RequestContext {
  return { requestId: randomUUID(), orgId, actorId, actorName: "Tester", actorEmail: null, authUserId: "auth-test", membershipId: null, permissions: 0, maxRank: 0, isOrgAdmin: admin, isPlatformAdmin: false, db: db(orgId) };
}
async function setup() {
  const org = await createOrg("Planner", "planner");
  const member = await createBrother({ orgId: org.id });
  return context(org.id, member.id);
}
const post = { title: "Welcome", type: "Story" as const, dueDate: "2026-10-01" };
describe("Instagram persistence", () => {
  it("preserves retired formats on edits but won't assign them to another record", async () => {
    const ctx = await setup();
    const legacy = await testPrisma.instagramTask.create({ data: { ...post, type: "Story + Feed", organizationId: ctx.orgId } });
    expect(await updateInstagramTask(ctx, legacy.id, { title: "Updated", type: "Story + Feed" })).toMatchObject({ title: "Updated", type: "Story + Feed" });
    await expect(updateInstagramTask(ctx, legacy.id, { type: "Feed Post" })).rejects.toThrow("Choose Story");
    expect(await updateInstagramTask(ctx, legacy.id, { type: "Carousel" })).toMatchObject({ type: "Carousel" });
    await expect(updateInstagramTask(ctx, legacy.id, { type: "Story + Feed" })).rejects.toThrow("Choose Story");
  });
  it("defaults posting to the org-local day and keeps an explicit posting date", async () => {
    const ctx = await setup();
    await testPrisma.organization.update({ where: { id: ctx.orgId }, data: { timeZone: "America/New_York" } });
    const task = await createInstagramTask(ctx, post);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-05T02:00:00Z"));
    expect(await updateInstagramTask(ctx, task.id, { status: "posted" })).toMatchObject({ postedDate: "2026-10-04", dueDate: "2026-10-01" });
    expect(await updateInstagramTask(ctx, task.id, { status: "posted", postedDate: "2026-10-03" })).toMatchObject({ postedDate: "2026-10-03" });
    expect(await updateInstagramTask(ctx, task.id, { status: "posted" })).toMatchObject({ postedDate: "2026-10-03" });
  });
  it("isolates posts, links, mutations and handles across orgs", async () => {
    const ctx = await setup();
    const other = await createOrg("Other", "other");
    const outsider = context(other.id, ctx.actorId);
    const event = await createCalendarEvent({ orgId: other.id });
    await expect(createInstagramTask(ctx, { ...post, calendarEventId: event.id })).rejects.toThrow();
    const task = await createInstagramTask(ctx, post);
    expect(await listInstagramTasks(outsider)).toEqual([]);
    await expect(updateInstagramTask(outsider, task.id, { title: "Bad" })).rejects.toThrow();
    await expect(deleteInstagramTask(outsider, task.id)).rejects.toThrow();
    await setInstagramHandle(ctx, "planner.chapter");
    expect((await ctx.db.organizationConfig.find())?.instagramHandle).toBe("planner.chapter");
    expect((await outsider.db.organizationConfig.find())?.instagramHandle ?? null).toBeNull();
    await expect(setInstagramHandle(context(ctx.orgId, ctx.actorId, false), "bad")).rejects.toThrow("Only an org admin");
    await setInstagramHandle(ctx, null);
    expect((await ctx.db.organizationConfig.find())?.instagramHandle).toBeNull();
  });
});
