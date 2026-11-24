/**
 * Pure More rules: the web sidebar's pages as the phone's page grid (no sidebar in the
 * app), the Yours pages, and each tile's badge.
 *
 * Pages (app/components/Sidebar.tsx + lib/nav-order.ts, ported: runtime code can't be
 * imported into the app): the web's groups in their order, each sorted by the org's
 * `navOrder` (applyNavOrder), hidden by NAV_WORKFLOW_MAP, labelled with the org's words
 * (NAV_DISPLAY). Left out: what the tab bar already carries (Dashboard = Home, Timeline,
 * Brotherhood = Members), and the pages the phone hasn't built yet (NATIVE).
 *
 * Yours: my own records, which on the web live inside other pages:
 *   Attendance, Excuses   the chapter tracks attendance (members/model trackedOf)
 *   Dues                  the chapter tracks dues, or has the "finance" workflow
 *   Reimbursements        workflow "finance" (the web's Treasury → Reimbursements tab)
 */
import type { CalendarEvent, Doc, Fundraiser, InstagramPost, MeResponse, MemberDuesBook, MyExcuseItem, Party, Reimbursement, ServiceEvent, ServiceParticipationRow, Task, TreasuryData } from "@/lib/api-types";
import type { IconName } from "~/icons/Icon";
import { days as mediaDays, summary as mediaSummary } from "~/media/model";
import { money, trackedOf } from "~/members/model";
import { isUpcoming, monDay, profit, signed$ as signed, upcomingLabel, waiting } from "~/parties/model";
import { isMine, pileOf, type Viewer } from "~/tasks/model";
import type { Tone } from "~/theme/palette";

export type PageId =
  | "tasks" | "meetings" | "docs" | "media" | "programming" | "service" | "parties" | "fundraisers" | "treasury"
  | "attendance" | "excuses" | "dues" | "reimbursements";

const TREASURY_BIT = 1 << 1; // MANAGE_TREASURY (lib/permissions.ts)

/** The books' keepers: the server's canManageTreasury (a role that grants treasury, this
 *  chapter's admin, or a platform admin). Everyone on "finance" reads the treasury; only
 *  keepers see the requests waiting on them. */
export const seesTreasury = (me: MeResponse) =>
  me.isAdmin || (me.permissions & TREASURY_BIT) !== 0 || me.memberships.some(x => x.organizationId === me.orgId && x.isOrgAdmin);

export interface Page { id: PageId; title: string; icon: IconName; tone: Tone }

/* ── the web sidebar ──────────────────────────────────────────────────────────── */

/** lib/nav-order.ts NAV_GROUPS. The labels are the web's routing keys, not display text. */
export const NAV_GROUPS: readonly { label: string; items: readonly string[] }[] = [
  { label: "Overview", items: ["Dashboard", "Timeline"] },
  { label: "Members", items: ["Brotherhood", "Chapter", "Tasks"] },
  { label: "Operations", items: ["Docs", "Instagram", "Programming", "Service", "Parties", "Fundraisers", "Treasury"] },
];

/** Sidebar.tsx NAV_WORKFLOW_MAP: null = always shown. */
export const NAV_WORKFLOW_MAP: Record<string, string | null> = {
  Dashboard: null, Timeline: null, Chapter: "meetings", Tasks: "tasks", Brotherhood: "members", Docs: "docs",
  Instagram: "communications", Treasury: "finance", Service: "service", Programming: "events", Parties: "parties", Fundraisers: "fundraisers",
};

/** On the tab bar instead (Dashboard is Home). */
const ON_TAB_BAR = new Set(["Dashboard", "Timeline", "Brotherhood"]);

/** Web label → the phone's page. A label missing here isn't built on the phone yet. */
const NATIVE: Record<string, { id: PageId; icon: IconName; tone: Tone }> = {
  Chapter:     { id: "meetings", icon: "gavel", tone: "sky" },
  Tasks:       { id: "tasks", icon: "box", tone: "lilac" },
  Programming: { id: "programming", icon: "board", tone: "peach" },
  Docs:        { id: "docs", icon: "folder", tone: "butter" },
  Instagram:   { id: "media", icon: "camera", tone: "lilac" },
  Service:     { id: "service", icon: "heart", tone: "mint" },
  Parties:     { id: "parties", icon: "note", tone: "rose" },
  Fundraisers: { id: "fundraisers", icon: "jar", tone: "rose" },
  Treasury:    { id: "treasury", icon: "wallet", tone: "sky" },
};

/** lib/nav-order.ts applyNavOrder: the ordered labels first, the rest in default order. */
export function applyNavOrder(labels: readonly string[], navOrder: readonly string[]): string[] {
  if (!navOrder.length) return [...labels];
  const present = new Set(labels);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of navOrder) if (present.has(l) && !seen.has(l)) { out.push(l); seen.add(l); }
  for (const l of labels) if (!seen.has(l)) out.push(l);
  return out;
}

/** The `pluralize` cases the vocab words actually hit ("Brother" → "Brothers", "Fee" → "Fees"). */
export function plural(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** The org's word for a canonical vocab key (lib/vocab DEFAULT_LABELS are the keys themselves here). */
const word = (me: MeResponse, key: string) => me.org?.vocabularyOverrides[key] || key;

/** Sidebar.tsx NAV_DISPLAY: what each label reads as in this chapter. */
export function navLabel(me: MeResponse, label: string): string {
  switch (label) {
    case "Brotherhood": return plural(word(me, "Member"));
    case "Instagram": return "Media";
    case "Chapter": return word(me, "Meetings");
    case "Treasury": return word(me, "Treasury");
    case "Service": return word(me, "Service");
    default: return label;
  }
}

/** Sidebar.tsx isNavVisible. */
export const navVisible = (label: string, workflows: readonly string[]) => {
  const wf = NAV_WORKFLOW_MAP[label];
  return wf == null || workflows.includes(wf);
};

/** More's page grid (the app has no sidebar): the sidebar's pages as ONE list, the groups'
 *  order flattened, each group sorted by the org's `navOrder`, minus what the tab bar
 *  carries and what isn't built on the phone yet. */
export function pagesFor(me: MeResponse): Page[] {
  const wf = me.org?.enabledWorkflows ?? [];
  const order = me.org?.navOrder ?? [];
  return NAV_GROUPS.flatMap(g => applyNavOrder(g.items, order))
    .filter(l => !ON_TAB_BAR.has(l) && navVisible(l, wf) && NATIVE[l])
    .map(l => ({ ...NATIVE[l]!, title: navLabel(me, l) }));
}

/** More's page map: the same pages as pagesFor, kept in the web sidebar's groups (its
 *  "Members" group reads "Chapter" here, since Members is a tab of its own). Empty
 *  groups drop out. */
export function pageGroupsFor(me: MeResponse): { label: string; pages: Page[] }[] {
  const wf = me.org?.enabledWorkflows ?? [];
  const order = me.org?.navOrder ?? [];
  const LABEL: Record<string, string> = { Members: "Chapter", Operations: "Operations" };
  return NAV_GROUPS
    .map(g => ({
      label: LABEL[g.label] ?? g.label,
      pages: applyNavOrder(g.items, order)
        .filter(l => !ON_TAB_BAR.has(l) && navVisible(l, wf) && NATIVE[l])
        .map(l => ({ ...NATIVE[l]!, title: navLabel(me, l) })),
    }))
    .filter(g => g.pages.length);
}

/** The web sidebar's "Needs you" dots and the phone bar's More badge, as tile badges:
 *  my overdue tasks (rose), wrap-ups due (Programming), fundraisers to count up, and
 *  reimbursements waiting (Treasury). Each count is already gated by the server on /me. */
export function pageBadges(me: MeResponse, overdueTasks: number, today: string): Partial<Record<PageId, number>> {
  const o = me.org;
  if (!o) return {};
  // lib/programming.ts needsWrapUp
  const wraps = o.wrapUpsDue.filter(w => w.stage === "confirmed" && (w.schedule?.kind === "allDay" ? w.schedule.end <= today : w.dueDate != null && w.dueDate < today)).length;
  return {
    tasks: overdueTasks,
    programming: wraps,
    fundraisers: o.fundraisersToWrap.filter(f => f.date <= today).length,
    treasury: o.pendingReimbursementCount,
  };
}

/** More's Yours: my own records. */
export function yoursFor(me: MeResponse): Page[] {
  const wf = me.org?.enabledWorkflows ?? [];
  const tracked = trackedOf(me.org?.disabledFeatures);
  const all: (Page & { on: boolean })[] = [
    { id: "attendance", title: word(me, "Attendance"), icon: "clip", tone: "sky", on: tracked.attendance },
    { id: "excuses", title: "Excuses", icon: "form", tone: "butter", on: tracked.attendance },
    { id: "dues", title: word(me, "Dues"), icon: "cash", tone: "peach", on: tracked.duesOwed || wf.includes("finance") },
    { id: "reimbursements", title: "Reimbursements", icon: "receipt", tone: "mint", on: wf.includes("finance") },
  ];
  return all.filter(p => p.on).map(({ on: _on, ...p }) => p);
}

/** Whether the tab bar shows Members (the web's MobileTabBar: the "members" workflow). */
export const showsMembers = (me: MeResponse | null | undefined) => !me?.org || (me.org.enabledWorkflows ?? []).includes("members");

/** More's badge on the tab bar: my overdue tasks (MobileTabBar `moreBadge`). Reads the
 *  tasks list when it's loaded, else /me's candidates (dated tasks due by about tomorrow). */
export function overdueMine(me: MeResponse, tasks: Task[] | undefined, v: Viewer | null, today: string): number {
  if (!(me.org?.enabledWorkflows ?? []).includes("tasks")) return 0;
  if (tasks && v) return tasks.filter(t => t.status !== "done" && isMine(t, v) && pileOf(t, today) === "over").length;
  return (me.org?.myTasksDue ?? []).filter(t => t.dueDate < today).length;
}

/* ── Create: Log excuse ───────────────────────────────────────────────────────── */

/** The web's "Select Event to Excuse" list for a member: required events this term I
 *  wasn't marked at and haven't an excuse in for (a rejected one can be filed again),
 *  the next ones first, then the ones I missed, most recent first. */
export function excusable(events: CalendarEvent[], attended: number[], excuses: MyExcuseItem[], today: string, termStart?: string | null): CalendarEvent[] {
  const here = new Set(attended);
  const filed = new Map(excuses.map(x => [x.calendarEventId, x.status]));
  const open = events.filter(e => e.mandatory && (!termStart || e.date >= termStart) && !here.has(e.id) && (filed.get(e.id) ?? "rejected") === "rejected");
  const ahead = open.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const missed = open.filter(e => e.date < today).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return [...ahead, ...missed];
}

/* ── attendance ───────────────────────────────────────────────────────────────── */

export type Mark = "here" | "excused" | "missed" | "pending" | "ahead";
export interface Meeting { event: CalendarEvent; mark: Mark }

/** Every required event this term, oldest first, with my mark on each. */
export function myMeetings(events: CalendarEvent[], attended: number[], excuses: MyExcuseItem[], today: string, termStart?: string | null): Meeting[] {
  const here = new Set(attended);
  const ex = new Map(excuses.map(x => [x.calendarEventId, x.status]));
  return events
    .filter(e => e.mandatory && (!termStart || e.date >= termStart))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map(e => {
      const s = ex.get(e.id);
      const mark: Mark = here.has(e.id) ? "here"
        : s === "approved" ? "excused"
        : e.date >= today ? "ahead"
        : s === "pending" ? "pending"
        : "missed";
      return { event: e, mark };
    });
}

/* ── live lines ───────────────────────────────────────────────────────────────── */

export interface Live { line: string | null; badge: number; started: boolean }

/** Programming's card: what's live on the slate; badge = wrap-ups due (officers). */
export function programmingLive(list: { stage: string; dueDate: string | null; schedule?: { kind: string; end?: string } | null }[] | undefined, today: string, officer: boolean): Live {
  if (!list) return { line: null, badge: 0, started: true };
  if (!list.length) return { line: "Not started", badge: 0, started: false };
  const live = list.filter(e => e.stage !== "done").length;
  const wrap = officer ? list.filter(e => e.stage === "confirmed" && (e.schedule?.kind === "allDay" && e.schedule.end ? e.schedule.end <= today : e.dueDate != null && e.dueDate < today)).length : 0;
  return { line: live ? `${live} on the slate` : `${list.length} wrapped`, badge: wrap, started: true };
}

/** Parties' card: wrap-ups waiting (officers; the badge too), else the next party, else the net. */
export function partiesLive(list: Party[] | undefined, today: string, officer: boolean): Live {
  if (!list) return { line: null, badge: 0, started: true };
  if (!list.length) return { line: "Not started", badge: 0, started: false };
  const wait = officer ? waiting(list, today).length : 0;
  if (wait) return { line: `${wait} to close out`, badge: wait, started: true };
  const next = list.filter(p => isUpcoming(p, today)).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (next) {
    const when = upcomingLabel(next.date, today);
    return { line: `${when === "Upcoming" ? monDay(next.date) : when}: ${next.name}`, badge: 0, started: true };
  }
  const closed = list.filter(p => p.completed);
  return { line: closed.length ? `${signed(closed.reduce((s, p) => s + profit(p), 0))} net` : `${list.length} on the books`, badge: 0, started: true };
}

/** Media's card: what's overdue (badged for officers), else the next post due, else the cadence. */
export function mediaLive(list: InstagramPost[] | undefined, today: string, officer: boolean): Live {
  if (!list) return { line: null, badge: 0, started: true };
  if (!list.length) return { line: "Not started", badge: 0, started: false };
  const s = mediaSummary(list, today);
  if (s.overdue) return { line: `${s.overdue} overdue`, badge: officer ? s.overdue : 0, started: true };
  const next = list.filter(p => p.status !== "posted").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (next) {
    const n = mediaDays(next.dueDate, today);
    return { line: `${n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`}: ${next.title}`, badge: 0, started: true };
  }
  return { line: s.sinceLast == null ? `${list.length} posted` : s.sinceLast === 0 ? "Posted today" : `Last post ${s.sinceLast}d ago`, badge: 0, started: true };
}

/** Meetings' card: the next one, else how many were held; badge = excuses waiting (officers). */
export function meetingsLive(events: CalendarEvent[] | undefined, today: string, waiting: number): Live {
  if (!events) return { line: null, badge: waiting, started: true };
  const ms = events.filter(e => e.category === "chapter");
  if (!ms.length) return { line: "Not started", badge: waiting, started: false };
  const next = ms.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (next) {
    const n = Math.round((Date.parse(`${next.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
    return { line: n === 0 ? "Next: today" : n === 1 ? "Next: tomorrow" : `Next in ${n} days`, badge: waiting, started: true };
  }
  return { line: `${ms.length} held`, badge: waiting, started: true };
}

export function attendanceLive(ms: Meeting[] | null): Live {
  if (!ms) return { line: null, badge: 0, started: true };
  const counted = ms.filter(m => m.mark !== "ahead" && m.mark !== "excused" && m.mark !== "pending");
  if (!counted.length) return { line: "Not started", badge: 0, started: false };
  const here = counted.filter(m => m.mark === "here").length;
  return { line: `${here} of ${counted.length} meetings`, badge: 0, started: true };
}

export function myHours(rows: ServiceParticipationRow[] | undefined, meId: number): number {
  return (rows ?? []).filter(r => r.brotherId === meId).reduce((s, r) => s + r.hours, 0);
}

export const r1 = (n: number) => (Math.round(n * 10) / 10).toString();

export function serviceLive(events: ServiceEvent[] | undefined, rows: ServiceParticipationRow[] | undefined, meId: number, goal: number): Live {
  if (!events || !rows) return { line: null, badge: 0, started: true };
  if (!events.length) return { line: "Not started", badge: 0, started: false };
  return { line: `${r1(myHours(rows, meId))} of ${goal}h`, badge: 0, started: true };
}

export function duesLive(book: MemberDuesBook | undefined): Live {
  if (!book) return { line: null, badge: 0, started: true };
  if (!book.entries.length) return { line: "Not started", badge: 0, started: false };
  const s = book.standing;
  return { line: s.owes > 0 ? `${money(s.owes)} owed` : "Paid up", badge: s.overdue > 0 ? 1 : 0, started: true };
}

export function reimbursementsLive(list: Reimbursement[] | undefined, meId: number): Live {
  if (!list) return { line: null, badge: 0, started: true };
  const mine = list.filter(r => r.brotherId === meId);
  if (!mine.length) return { line: "None sent", badge: 0, started: false };
  const waiting = mine.filter(r => r.status === "pending").length;
  return { line: waiting ? `${waiting} waiting` : `${mine.length} sent`, badge: 0, started: true };
}

export function treasuryLive(t: TreasuryData | undefined): Live {
  if (!t) return { line: null, badge: 0, started: true };
  return { line: `${money(t.balance)} on hand`, badge: 0, started: true };
}

export function tasksLive(tasks: Task[] | undefined, v: Viewer | null, today: string): Live {
  if (!tasks || !v) return { line: null, badge: 0, started: true };
  if (!tasks.length) return { line: "Not started", badge: 0, started: false };
  const mine = tasks.filter(t => t.status !== "done" && isMine(t, v));
  const over = mine.filter(t => pileOf(t, today) === "over").length;
  return { line: over ? `${over} overdue` : mine.length ? `${mine.length} on you` : "Nothing on you", badge: over, started: true };
}

export function excusesLive(list: MyExcuseItem[] | undefined): Live {
  if (!list) return { line: null, badge: 0, started: true };
  if (!list.length) return { line: "None filed", badge: 0, started: false };
  const waiting = list.filter(x => x.status === "pending").length;
  const turned = list.filter(x => x.status === "rejected").length;
  return { line: waiting ? `${waiting} waiting` : turned ? `${turned} not accepted` : `${list.length} filed`, badge: turned, started: true };
}

export function docsLive(docs: Doc[] | undefined): Live {
  if (!docs) return { line: null, badge: 0, started: true };
  if (!docs.length) return { line: "Not started", badge: 0, started: false };
  return { line: `${docs.length} ${docs.length === 1 ? "doc" : "docs"}`, badge: 0, started: true };
}

export function fundraisersLive(list: Fundraiser[] | undefined, today: string): Live {
  if (!list) return { line: null, badge: 0, started: true };
  if (!list.length) return { line: "Not started", badge: 0, started: false };
  const next = list.filter(f => f.date >= today && !f.wrappedAt).sort((a, b) => a.date.localeCompare(b.date))[0];
  const raised = list.reduce((s, f) => s + (f.cameIn ?? 0), 0);
  return { line: next ? `${next.name} next` : `${money(raised)} raised`, badge: 0, started: true };
}
