/**
 * The web dashboard, derived for one viewer: the same lib/dashboard functions the web
 * page runs, over GET /api/dashboard's inputs and /me's config. Nothing here decides
 * a rule of its own; where the web page gates a card or a number, this gates it the
 * same way (feature toggles, workflows, permissions, tracked metrics).
 */
import type { DashboardResponse, MeResponse } from "@/lib/api-types";
import { resolveDashboardLayout, type DashCardId, type DashStatId } from "@/lib/dashboard-layout";
import { numberFacts, type NumberFact } from "@/lib/dashboard/numbers";
import { phoneDash, type PhoneDash } from "@/lib/dashboard/phone";
import { derivePlate, taskAssigneeLabel, type PlateItem, type PlatePerm } from "@/lib/dashboard/plate";
import { calcHealthScore, getBrotherStatus, rosterData, standingCounts, type Band, type RosterData } from "@/lib/dashboard/standing";
import { weekDigest, type WeekDigest } from "@/lib/dashboard/week";
import { isNavVisible } from "@/lib/nav-order";
import { resolveTrackedMetrics, trackedCount, type TrackedMetrics } from "@/lib/tracked-metrics";
import { isFeatureEnabled, type DisabledFeatures } from "@/lib/workflow-features";
import type { Thresholds } from "@/lib/thresholds";

const BIT = { brothers: 1 << 0, treasury: 1 << 1, events: 1 << 2, tasks: 1 << 12, fundraising: 1 << 14 } as const;

export interface Health { score: number; label: string; breakdown: Record<string, number> }

export interface DashModel {
  today: string;
  thresholds: Thresholds;
  tracked: TrackedMetrics;
  roster: RosterData;
  /** Bands, or null while nothing measured can decide a standing. */
  standing: Record<Band, number> | null;
  /** The web's health score and its gate. Not drawn on a phone: the web hides the dial there. */
  health: Health | null;
  plate: PlateItem[];
  plateRoles: Partial<Record<PlatePerm, string>>;
  week: WeekDigest;
  numbers: NumberFact[];
  phone: PhoneDash;
  words: { dues: string; service: string; members: string; member: string; meetings: string; treasury: string };
  financeEnabled: boolean;
  igEnabled: boolean;
  canTreasury: boolean;
  canBrothers: boolean;
}

const word = (me: MeResponse, term: string) => me.org?.vocabularyOverrides[term] ?? term;
const plural = (w: string) => (/s$/i.test(w) ? w : /y$/i.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);

export function dashModel(me: MeResponse, d: DashboardResponse): DashModel {
  const org = me.org;
  const today = d.today;
  const wf = org?.enabledWorkflows ?? [];
  const disabled = (org?.disabledFeatures ?? {}) as DisabledFeatures;
  const feature = (id: string) => isFeatureEnabled("operations", id, disabled);
  const thresholds = org!.thresholds;
  const tracked = resolveTrackedMetrics(disabled);
  const can = (bit: number) => me.isAdmin || (me.permissions & bit) !== 0;
  const financeEnabled = isNavVisible("Treasury", wf);
  const eventsEnabled = isNavVisible("Programming", wf);
  const tasksEnabled = isNavVisible("Tasks", wf);
  const igEnabled = isNavVisible("Instagram", wf);
  const fundraisersEnabled = isNavVisible("Fundraisers", wf);
  const canTreasury = can(BIT.treasury);
  const canBrothers = can(BIT.brothers);

  const roster = rosterData(d.brothers, tracked, !!d.treasury && (d.treasury.trend.length > 0 || d.treasury.openingBalance != null));
  const standing = standingCounts(d.brothers, thresholds, roster.measured);
  const atRisk = d.brothers.filter(b => getBrotherStatus(b, thresholds, roster.measured) === "At Risk").length;
  const h = calcHealthScore(d.brothers, d.tasks, thresholds, today, tracked);
  const layoutRaw = resolveDashboardLayout(org?.dashboardLayout);
  const health = feature("health") && trackedCount(tracked) >= 2 && roster.hasAnyData && !layoutRaw.hidden.includes("health")
    ? { score: h.score, label: h.label, breakdown: h.breakdown as Record<string, number> } : null;

  const duesLate = new Map<number, number>();
  for (const s of d.duesStandings) if (s.standing === "overdue") duesLate.set(s.brotherId, s.lateDays);
  const wrapUps = eventsEnabled
    ? (org?.wrapUpsDue ?? []).filter(w => w.stage === "confirmed" && (w.schedule?.kind === "allDay" ? w.schedule.end <= today : w.dueDate != null && w.dueDate < today))
    : [];
  const plate = feature("needs-attention") ? derivePlate({
    today, selfId: me.id, myRoleIds: new Set(me.roles.map(r => r.id)),
    tasks: d.tasks, polls: d.polls, wrapUps,
    fundraisers: (org?.fundraisersToWrap ?? []).filter(f => f.date <= today),
    reimbursements: d.reimbursements, brothers: d.brothers, duesLate, tracked: roster.measured,
    can: { tasks: can(BIT.tasks), treasury: canTreasury, events: can(BIT.events) && eventsEnabled, fundraising: fundraisersEnabled },
    assigneeLabel: t => taskAssigneeLabel(t),
  }) : [];
  const roles = [...me.roles].sort((a, b) => b.rank - a.rank);
  const plateRoles: Partial<Record<PlatePerm, string>> = {};
  for (const k of ["tasks", "treasury", "events", "fundraising"] as PlatePerm[]) {
    plateRoles[k] = roles.find(r => (r.permissions & BIT[k]) !== 0)?.name ?? (me.isAdmin ? "admin" : undefined);
  }

  const week = weekDigest({ today, tasks: d.tasks, calendar: d.calendar, instagram: d.instagram, parties: d.parties, atRiskCount: atRisk });

  const words = {
    dues: word(me, "Dues"), service: word(me, "Service"), members: plural(word(me, "Member")), member: word(me, "Member"),
    meetings: word(me, "Meetings"), treasury: word(me, "Treasury"),
  };
  const facts = numberFacts({
    today, brothers: d.brothers, roster, thresholds, feature,
    words: { dues: words.dues, service: words.service, members: words.members, member: p => (p ? words.members : words.member) },
    weekEvents: week.agenda.length, weekDeadlines: week.deadlinesDue.length,
    tasksEnabled, openTasks: d.tasks.filter(t => t.status !== "done").length, overdueTasks: week.overdueCount,
    canBrothers, pendingJoins: org?.pendingJoinRequestCount ?? 0,
    financeEnabled, canTreasury, treasury: d.treasury, metrics: d.metrics,
  });
  const layout = layoutRaw;
  const numbers = layout.numbers.map(k => facts[k as DashStatId]).filter((f): f is NumberFact => !!f);

  // The cards the web page registers for this viewer (app/org/[slug]/page.tsx dashCards).
  const available = new Set<DashCardId>(["week", "activity", "next"]);
  if (feature("needs-attention")) available.add("needs");
  if (feature("brother-tracking")) available.add("members");
  if (financeEnabled) available.add("treasury");
  if (feature("announcement")) available.add("announcement");
  if (isNavVisible("Docs", wf)) available.add("docs");
  // The opt-in cards, each only while the org tracks that thing (none is on a layout
  // until an admin brings it in from the Arrange tray).
  if (financeEnabled) available.add("money");
  if (financeEnabled && tracked.duesOwed) available.add("dues");
  if (tracked.serviceHours) available.add("service");
  if (tracked.gpa) available.add("gpa");
  if (igEnabled) available.add("social");
  for (const m of d.metrics) available.add(`metric:${m.definitionId}`);
  const phone = phoneDash(layout, available);

  return {
    today, thresholds, tracked, roster, standing, health, plate, plateRoles, week, numbers, phone, words,
    financeEnabled, igEnabled, canTreasury, canBrothers,
  };
}
