/**
 * Dues allocation (lib/dues-ledger.ts): which lines a payment or waiver covers.
 *
 * Pure module, no DB. This is the rule every "overdue", "31 of 52 paid" and
 * line-by-line tab on the Dues tab is derived from, so it is pinned here
 * case by case rather than through the service.
 */

import { describe, expect, it } from "vitest";
import {
  allocate, chargeStats, compareLines, daysBetween, duesToday, summarize,
  type LedgerLine,
} from "@/lib/dues-ledger";

let seq = 0;
function line(chargeId: number, dollars: number, dueDate: string | null, createdAt = "2026-09-01T00:00:00.000Z"): LedgerLine {
  return { lineId: ++seq, chargeId, amountCents: Math.round(dollars * 100), dueDate, createdAt };
}
const pay = (dollars: number, chargeId?: number) => ({ amountCents: Math.round(dollars * 100), chargeId: chargeId ?? null });

describe("compareLines", () => {
  it("orders earliest due first, then no due date, then billing order", () => {
    const a = line(1, 10, "2026-10-01");
    const b = line(2, 10, null, "2026-08-01T00:00:00.000Z");
    const c = line(3, 10, "2026-09-01");
    const d = line(4, 10, null, "2026-09-15T00:00:00.000Z");
    expect([a, b, c, d].sort(compareLines).map(l => l.chargeId)).toEqual([3, 1, 2, 4]);
  });

  it("breaks a due-date tie by when the line was billed, then by id", () => {
    const late = line(1, 10, "2026-10-01", "2026-09-05T00:00:00.000Z");
    const early = line(2, 10, "2026-10-01", "2026-09-01T00:00:00.000Z");
    const sameA = line(3, 10, "2026-10-01", "2026-09-09T00:00:00.000Z");
    const sameB = line(4, 10, "2026-10-01", "2026-09-09T00:00:00.000Z");
    expect([sameB, late, sameA, early].sort(compareLines).map(l => l.chargeId)).toEqual([2, 1, 3, 4]);
  });
});

describe("allocate", () => {
  it("covers the oldest-due line first", () => {
    const fall = line(1, 140, "2026-10-01");
    const photo = line(2, 20, "2026-10-30");
    const { lines, unappliedCents } = allocate([photo, fall], [pay(150)]);
    expect(lines.map(l => [l.chargeId, l.paidCents, l.restCents])).toEqual([[1, 14000, 0], [2, 1000, 1000]]);
    expect(unappliedCents).toBe(0);
  });

  it("pools several credits across lines", () => {
    const { lines } = allocate(
      [line(1, 140, "2026-10-01"), line(2, 20, "2026-10-30"), line(3, 25, "2026-11-01")],
      [pay(75), pay(70), pay(20)],
    );
    expect(lines.map(l => l.restCents)).toEqual([0, 0, 2000]);
  });

  it("applies a pinned waiver to its own charge before the oldest line", () => {
    const fall = line(1, 140, "2026-10-01");
    const fine = line(2, 25, "2026-11-01");
    const { lines } = allocate([fall, fine], [pay(25, 2)]);
    expect(lines.find(l => l.chargeId === 2)!.restCents).toBe(0);
    expect(lines.find(l => l.chargeId === 1)!.restCents).toBe(14000);
  });

  it("sends a pinned waiver's overflow to the pool", () => {
    const fall = line(1, 140, "2026-10-01");
    const fine = line(2, 25, "2026-11-01");
    const { lines } = allocate([fall, fine], [pay(40, 2)]);
    expect(lines.find(l => l.chargeId === 2)!.restCents).toBe(0);
    expect(lines.find(l => l.chargeId === 1)!.restCents).toBe(12500);
  });

  it("pools a waiver pinned to a charge the member isn't on", () => {
    const { lines } = allocate([line(1, 140, "2026-10-01")], [pay(40, 99)]);
    expect(lines[0].restCents).toBe(10000);
  });

  it("leaves an un-dated line for last", () => {
    const earlier = line(1, 300, null, "2026-01-01T00:00:00.000Z");
    const fall = line(2, 140, "2026-10-01");
    const { lines } = allocate([earlier, fall], [pay(140)]);
    expect(lines.map(l => [l.chargeId, l.restCents])).toEqual([[2, 0], [1, 30000]]);
  });

  it("reports credit with nothing left to cover instead of dropping it", () => {
    const { lines, unappliedCents } = allocate([line(1, 20, null)], [pay(25)]);
    expect(lines[0].restCents).toBe(0);
    expect(unappliedCents).toBe(500);
  });

  it("is exact to the cent", () => {
    const { lines } = allocate([line(1, 33.34, "2026-10-01"), line(2, 33.33, "2026-10-02")], [pay(33.35)]);
    expect(lines.map(l => l.restCents)).toEqual([0, 3332]);
  });

  it("does not mutate its input", () => {
    const l = line(1, 50, "2026-10-01");
    const input = [l];
    allocate(input, [pay(50)]);
    expect(input[0]).toEqual(l);
    expect("paidCents" in input[0]).toBe(false);
  });
});

describe("summarize", () => {
  const today = "2026-10-19";

  it("is none when nothing is billed", () => {
    expect(summarize([], today)).toMatchObject({ standing: "none", billedCents: 0, owesCents: 0, lateDays: 0, next: null });
  });

  it("is paid when every line is covered", () => {
    const { lines } = allocate([line(1, 140, "2026-10-01")], [pay(140)]);
    expect(summarize(lines, today)).toMatchObject({ standing: "paid", paidCents: 14000, owesCents: 0, next: null });
  });

  it("is overdue when an open line is past due, with days late from the earliest one", () => {
    const { lines } = allocate(
      [line(1, 140, "2026-10-01"), line(2, 25, "2026-10-12"), line(3, 20, "2026-10-30")],
      [pay(100)],
    );
    const s = summarize(lines, today);
    expect(s.standing).toBe("overdue");
    expect(s.overdueCents).toBe(4000 + 2500);
    expect(s.owesCents).toBe(4000 + 2500 + 2000);
    expect(s.lateDays).toBe(18);
    expect(s.next).toEqual({ chargeId: 1, dueDate: "2026-10-01" });
  });

  it("is due (not overdue) on the due date itself and for no-due-date lines", () => {
    const onTheDay = allocate([line(1, 20, today)], []).lines;
    expect(summarize(onTheDay, today).standing).toBe("due");
    const undated = allocate([line(1, 20, null)], []).lines;
    expect(summarize(undated, today)).toMatchObject({ standing: "due", lateDays: 0, next: { chargeId: 1, dueDate: null } });
  });

  it("summarizes a scoped subset without re-allocating", () => {
    const { lines } = allocate([line(1, 140, "2026-10-01"), line(2, 20, "2026-10-30")], [pay(140)]);
    expect(summarize(lines.filter(l => l.chargeId === 2), today)).toMatchObject({ standing: "due", owesCents: 2000 });
    expect(summarize(lines.filter(l => l.chargeId === 1), today)).toMatchObject({ standing: "paid" });
  });
});

describe("chargeStats", () => {
  it("counts people and paid people per charge across members", () => {
    const maya = allocate([line(1, 140, "2026-10-01"), line(2, 20, "2026-10-30")], [pay(160)]).lines;
    const leo = allocate([line(1, 140, "2026-10-01"), line(2, 20, "2026-10-30")], [pay(100)]).lines;
    const zane = allocate([line(1, 90, "2026-10-01")], []).lines;
    const s = chargeStats([maya, leo, zane]);
    expect(s.get(1)).toEqual({ people: 3, paidPeople: 1, totalCents: 37000, outCents: 4000 + 9000 });
    expect(s.get(2)).toEqual({ people: 2, paidPeople: 1, totalCents: 4000, outCents: 2000 });
  });
});

describe("dates", () => {
  it("counts whole days between calendar dates", () => {
    expect(daysBetween("2026-10-01", "2026-10-19")).toBe(18);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2); // across a DST change
    expect(daysBetween("2026-10-19", "2026-10-01")).toBe(-18);
  });

  it("takes today in the org's zone, not the server's", () => {
    const at = new Date("2026-10-20T03:30:00Z");
    expect(duesToday("America/Los_Angeles", at)).toBe("2026-10-19");
    expect(duesToday("Asia/Tokyo", at)).toBe("2026-10-20");
    expect(duesToday(null, at)).toBe("2026-10-20");
  });
});
