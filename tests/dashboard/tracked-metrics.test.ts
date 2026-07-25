/**
 * Unit tests for org-type-aware dashboard math.
 *
 * The dashboard used to score every org as if it were a fraternity: GPA, dues
 * and service hours were 60% of the health score and could flag members At
 * Risk, even for an org that switched those metrics off during onboarding and
 * therefore stores a literal 0 for all of them. These tests pin the fix and,
 * just as importantly, pin that orgs which track everything are unaffected.
 *
 * Pure derivations — no DB. (vitest's global setup still runs a `prisma db
 * push`, so `npm run test:db:up` must be running.)
 */

import { describe, expect, it } from "vitest";
import { calcHealthScore, deriveNeedsAttention, getBrotherStatus, type Brother, type Task } from "@/app/data";
import { DEFAULT_THRESHOLDS, ATTENDANCE_EXEMPT } from "@/lib/thresholds";
import { ALL_TRACKED, resolveTrackedMetrics, trackedCount } from "@/lib/tracked-metrics";

const TODAY = "2026-06-13";

function brother(over: Partial<Brother> & { id: number; name: string }): Brother {
  return { role: "", attendance: 95, gpa: 3.7, duesOwed: 0, serviceHours: 15, ...over };
}

/** A sports team: tracks attendance only, so every other column is a stored 0. */
const TEAM_TRACKED = { attendance: true, gpa: false, duesOwed: false, serviceHours: false };
/** A club: attendance + dues, no GPA or service. */
const CLUB_TRACKED = { attendance: true, gpa: false, duesOwed: true, serviceHours: false };

/** A well-run team — perfect attendance, and 0 in every untracked column. */
const teamRoster = [
  brother({ id: 1, name: "Alex Rivera", attendance: 100, gpa: 0, duesOwed: 0, serviceHours: 0 }),
  brother({ id: 2, name: "Sam Okafor",  attendance: 100, gpa: 0, duesOwed: 0, serviceHours: 0 }),
];

function task(over: Partial<Task> & { id: number }): Task {
  return {
    title: "Task", dueDate: "2026-05-14", status: "open", notes: null,
    createdById: null, completedById: null, completedAt: null, createdAt: "2026-05-01",
    assignments: [], ...over,
  };
}

describe("resolveTrackedMetrics", () => {
  it("fails open — an org with no disabled features tracks everything", () => {
    expect(resolveTrackedMetrics({})).toEqual(ALL_TRACKED);
    expect(resolveTrackedMetrics(null)).toEqual(ALL_TRACKED);
    expect(resolveTrackedMetrics(undefined)).toEqual(ALL_TRACKED);
  });

  it("maps hidden KPI widgets back to their built-in metrics", () => {
    const tracked = resolveTrackedMetrics({ operations: ["kpi-gpa", "kpi-dues", "kpi-service"] });
    expect(tracked).toEqual({ attendance: true, gpa: false, duesOwed: false, serviceHours: false });
    expect(trackedCount(tracked)).toBe(1);
  });

  it("ignores unrelated disabled features", () => {
    expect(resolveTrackedMetrics({ operations: ["health", "needs-attention"] })).toEqual(ALL_TRACKED);
  });
});

describe("calcHealthScore — untracked metrics", () => {
  it("does not cap a team at 'Needs Attention' for metrics it never tracked", () => {
    // Before the fix this was exactly 60: GPA and Service scored 0 while still
    // claiming 40% of the weight, so a flawless team could never read Healthy.
    const { score, label } = calcHealthScore(teamRoster, [], DEFAULT_THRESHOLDS, TODAY, TEAM_TRACKED);
    expect(score).toBe(100);
    expect(label).toBe("Healthy");
  });

  it("omits untracked components from the breakdown entirely", () => {
    const { breakdown } = calcHealthScore(teamRoster, [], DEFAULT_THRESHOLDS, TODAY, TEAM_TRACKED);
    expect(Object.keys(breakdown).sort()).toEqual(["Attendance", "Deadlines"]);
    expect(breakdown.GPA).toBeUndefined();
    expect(breakdown.Service).toBeUndefined();
  });

  it("still penalizes tracked metrics that are genuinely bad", () => {
    const poor = [brother({ id: 1, name: "Jo", attendance: 40, gpa: 0, duesOwed: 0, serviceHours: 0 })];
    const { score, label } = calcHealthScore(poor, [], DEFAULT_THRESHOLDS, TODAY, TEAM_TRACKED);
    // attendance 40 @ .30 + deadlines 100 @ .10, renormalized over .40
    expect(score).toBe(55);
    expect(label).toBe("Critical");
  });

  it("is byte-identical to the legacy weighting for an org that tracks everything", () => {
    const roster = [
      brother({ id: 1, name: "A", attendance: 90, gpa: 3.5, duesOwed: 0,  serviceHours: 12 }),
      brother({ id: 2, name: "B", attendance: 70, gpa: 2.8, duesOwed: 75, serviceHours: 4 }),
    ];
    const tasks = [task({ id: 1, dueDate: "2026-05-01", status: "open" })];

    // Legacy formula, spelled out: att*.30 + gpa*.25 + dues*.20 + svc*.15 + dl*.10
    const attScore = (90 + 70) / 2;
    const gpaScore = (((3.5 + 2.8) / 2 - 2.0) / 2.0) * 100;
    const duesScore = (1 / 2) * 100;
    const svcScore = (1 / 2) * 100;
    const dlScore = 100 - 15;
    const expected = Math.round(
      attScore * 0.30 + gpaScore * 0.25 + duesScore * 0.20 + svcScore * 0.15 + dlScore * 0.10,
    );

    expect(calcHealthScore(roster, tasks, DEFAULT_THRESHOLDS, TODAY).score).toBe(expected);
    expect(calcHealthScore(roster, tasks, DEFAULT_THRESHOLDS, TODAY, ALL_TRACKED).score).toBe(expected);
  });

  it("excludes attendance-exempt members from the attendance component", () => {
    const roster = [
      brother({ id: 1, name: "Present", attendance: 80 }),
      brother({ id: 2, name: "Abroad",  attendance: ATTENDANCE_EXEMPT }),
    ];
    const { breakdown } = calcHealthScore(roster, [], DEFAULT_THRESHOLDS, TODAY, TEAM_TRACKED);
    // The -1 sentinel must not be averaged in as a percentage: 80, not 39.5.
    expect(breakdown.Attendance).toBe(80);
  });

  it("drops attendance rather than scoring 0 when every member is exempt", () => {
    const roster = [brother({ id: 1, name: "Abroad", attendance: ATTENDANCE_EXEMPT })];
    const { score, breakdown } = calcHealthScore(roster, [], DEFAULT_THRESHOLDS, TODAY, TEAM_TRACKED);
    expect(breakdown.Attendance).toBeUndefined();
    expect(score).toBe(100); // deadlines only, renormalized
  });
});

describe("getBrotherStatus — untracked metrics", () => {
  it("does not flag a team member At Risk on a GPA the org never recorded", () => {
    const member = brother({ id: 1, name: "Alex", attendance: 100, gpa: 0, duesOwed: 0, serviceHours: 0 });
    expect(getBrotherStatus(member, DEFAULT_THRESHOLDS, TEAM_TRACKED)).toBe("Good");
    // The legacy behavior, for contrast — this is what every team member saw.
    expect(getBrotherStatus(member, DEFAULT_THRESHOLDS)).toBe("At Risk");
  });

  it("still flags on metrics the org does track", () => {
    const owing = brother({ id: 1, name: "Sam", attendance: 100, gpa: 0, duesOwed: 40, serviceHours: 0 });
    expect(getBrotherStatus(owing, DEFAULT_THRESHOLDS, CLUB_TRACKED)).toBe("Watch");

    const absent = brother({ id: 2, name: "Kai", attendance: 20, gpa: 0, duesOwed: 0, serviceHours: 0 });
    expect(getBrotherStatus(absent, DEFAULT_THRESHOLDS, TEAM_TRACKED)).toBe("At Risk");
  });

  it("leaves fully-tracked orgs unchanged", () => {
    const atRisk = brother({ id: 1, name: "Jo", attendance: 50, gpa: 2.1 });
    expect(getBrotherStatus(atRisk, DEFAULT_THRESHOLDS)).toBe(getBrotherStatus(atRisk, DEFAULT_THRESHOLDS, ALL_TRACKED));
    expect(getBrotherStatus(atRisk, DEFAULT_THRESHOLDS, ALL_TRACKED)).toBe("At Risk");
  });
});

describe("deriveNeedsAttention — untracked metrics", () => {
  it("produces no member-risk rows for a healthy team", () => {
    // Previously this returned one row per member, each reading "0.0 GPA".
    expect(deriveNeedsAttention(teamRoster, [], DEFAULT_THRESHOLDS, TODAY, [], TEAM_TRACKED)).toEqual([]);
    expect(deriveNeedsAttention(teamRoster, [], DEFAULT_THRESHOLDS, TODAY)).toHaveLength(teamRoster.length);
  });

  it("skips the outstanding-dues row when the org doesn't track dues", () => {
    const roster = [brother({ id: 1, name: "Sam", attendance: 100, gpa: 0, duesOwed: 90, serviceHours: 0 })];
    const items = deriveNeedsAttention(roster, [], DEFAULT_THRESHOLDS, TODAY, [], TEAM_TRACKED);
    expect(items.some(i => i.kind === "dues")).toBe(false);

    const clubItems = deriveNeedsAttention(roster, [], DEFAULT_THRESHOLDS, TODAY, [], CLUB_TRACKED);
    expect(clubItems.some(i => i.kind === "dues")).toBe(true);
  });

  it("still reports overdue deadlines, which are not per-member metrics", () => {
    const tasks = [task({ id: 1, title: "Roster due", dueDate: "2026-05-14", status: "open" })];
    const items = deriveNeedsAttention(teamRoster, tasks, DEFAULT_THRESHOLDS, TODAY, [], TEAM_TRACKED);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "deadline-overdue", id: 1 });
  });
});
