import { describe, it, expect } from "vitest";
import { instagramToday, instagramDays, instagramLane, instagramSummary, instagramGaps } from "@/lib/instagram-planner";
import { createInstagramTaskInput, updateInstagramTaskInput } from "@/lib/validation/instagram";
import { updateOrgConfigInput } from "@/lib/validation/org";

describe("Instagram planner dates", () => {
  it("uses the org's day across the UTC boundary and a deterministic fallback", () => {
    const now = new Date("2026-10-05T02:00:00Z");
    expect(instagramToday("America/New_York", now)).toBe("2026-10-04");
    expect(instagramToday(null, now)).toBe("2026-10-05");
  });
  it("counts calendar days through DST and respects inclusive seven-day lanes", () => {
    expect(instagramDays("2026-11-02", "2026-10-31")).toBe(2);
    expect(instagramLane({ dueDate: "2026-10-12", status: "open" }, "2026-10-05")).toBe("week");
    expect(instagramLane({ dueDate: "2026-10-13", status: "open" }, "2026-10-05")).toBe("upcoming");
  });
  it("measures cadence from actual posting dates, with a legacy fallback", () => {
    const posts = [{ dueDate: "2026-10-01", postedDate: "2026-10-04", status: "posted" }, { dueDate: "2026-10-03", status: "posted" }, { dueDate: "2026-10-02", status: "open" }];
    expect(instagramSummary(posts, "2026-10-05")).toMatchObject({ sinceLast: 1, overdue: 1, oldest: 3 });
    expect(instagramSummary([], "2026-10-05").sinceLast).toBeNull();
    expect(instagramSummary([posts[0]], "2026-10-04").sinceLast).toBe(0);
  });
  it("hatches only internal gaps of at least five days", () => {
    const gaps = instagramGaps([1, 4, 4, 10, 13]);
    expect(gaps.longest).toBe(5);
    expect([...gaps.hatched]).toEqual([5, 6, 7, 8, 9]);
    expect(instagramGaps([3]).hatched.size).toBe(0);
  });
  it("rejects impossible dates and retired formats on creation", () => {
    const base = { title: "Post", type: "Story", dueDate: "2026-02-28" };
    expect(createInstagramTaskInput.safeParse(base).success).toBe(true);
    expect(createInstagramTaskInput.safeParse({ ...base, dueDate: "2026-02-29" }).success).toBe(false);
    expect(createInstagramTaskInput.safeParse({ ...base, type: "Feed Post" }).success).toBe(false);
    expect(updateInstagramTaskInput.safeParse({ postedDate: "2026-04-31" }).success).toBe(false);
    expect(updateInstagramTaskInput.safeParse({ postedDate: null }).success).toBe(true);
  });
  it("normalizes handles, clears blank values, and rejects links", () => {
    expect(updateOrgConfigInput.parse({ instagramHandle: " @chapter.test " }).instagramHandle).toBe("chapter.test");
    expect(updateOrgConfigInput.parse({ instagramHandle: "" }).instagramHandle).toBeNull();
    expect(updateOrgConfigInput.parse({ instagramHandle: null }).instagramHandle).toBeNull();
    expect(updateOrgConfigInput.safeParse({ instagramHandle: "https://instagram.com/test" }).success).toBe(false);
  });
});
