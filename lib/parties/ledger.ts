/**
 * The Parties page's rules and words (the house ledger), shared by the web
 * (`app/org/[slug]/parties`) and the app (`mobile/src/parties`). Pure: "today" is passed
 * in as a YYYY-MM-DD string, no Temporal, no server imports, safe under
 * noUncheckedIndexedAccess.
 *
 * The page answers three questions, top to bottom:
 *   What needs me?    the oldest party that happened with no figures: Close it out
 *   Did we net money? net over closed parties, door, spent + kept %, avg member roll,
 *                     best night, and the night-by-night strip
 *   What happened?    every party, newest first
 *
 * A party is "due" once its date has passed and it isn't completed; "upcoming" while it's
 * today or later and still open.
 */
import type { Schedule } from "@/lib/calendar-feed/schedule";
import { fmt$, fmtDate } from "@/lib/treasury/ledger";

export { fmt$, fmtDate };

/** What the page reads off a party (the wire's Party, or the web's optimistic draft). */
export interface LedgerParty {
  id: number;
  name: string;
  date: string;
  partyType: "Open" | "Closed";
  theme: string;
  collabOrg: string;
  doorRevenue: number;
  attendance: number;
  expenses: number;
  notes: string;
  completed: boolean;
  attendanceEventId?: number | null;
  mandatory?: boolean;
  schedule?: Schedule | null;
  time?: string | null;
}

/** One rolled party's member roll (PartyRollRow, as far as the page reads it). */
export interface Roll { present: number; eligible: number }

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function parts(date: string): { y: number; m: number; d: number } {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return { y, m, d };
}

/** YYYY-MM-DD of `now` in the device's zone. */
export function todayOf(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Whole days from `today` to `date` (negative in the past). */
export function daysFrom(date: string, today: string): number {
  const a = parts(today), b = parts(date);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** "Sat". */
export function dow(date: string): string {
  const { y, m, d } = parts(date);
  return DOW[new Date(y, m - 1, d).getDay()] ?? "";
}
/** "Nov 29". */
export const monDay = (date: string): string => fmtDate(date);
/** "Nov". */
export const mon = (date: string): string => MON[parts(date).m - 1] ?? "";
/** "29". */
export const dayNum = (date: string): number => parts(date).d;

export const profit = (p: LedgerParty) => p.doorRevenue - p.expenses;
export const needsWrapUp = (p: LedgerParty, today: string) => !p.completed && p.date < today;
export const isUpcoming = (p: LedgerParty, today: string) => !p.completed && p.date >= today;

/** "Open · All White · with KDF": only the parts that exist. */
export function subLine(p: LedgerParty): string {
  return [p.partyType, p.theme, p.collabOrg ? `with ${p.collabOrg}` : ""].filter(Boolean).join(" · ");
}

/** "9:00 PM" from the linked calendar entry, else its legacy free text. */
export function partyTime(p: LedgerParty): string {
  const s = p.schedule;
  if (s && s.kind === "timed") {
    return new Date(s.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: s.timeZone });
  }
  return p.time ?? "";
}

/** "+$1,240" / "−$80", whole dollars. */
export function signed$(n: number): string {
  return `${n >= 0 ? "+" : "−"}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

export function upcomingLabel(date: string, today: string): string {
  const n = daysFrom(date, today);
  return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : n <= 7 ? `In ${n} days` : "Upcoming";
}

/** The seal on the wrap-up envelope: the org's initials. */
export function orgInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0]).join("").toUpperCase();
}

export const PARTY_TYPES: readonly { v: "Open" | "Closed"; blurb: string }[] = [
  { v: "Open", blurb: "Anyone with a wristband. Door money counts." },
  { v: "Closed", blurb: "Members and their plus-ones." },
];

/* ── the lists ────────────────────────────────────────────────────────────────── */

/** Newest first; same day, newest added first. */
export function newestFirst<P extends LedgerParty>(l: readonly P[]): P[] {
  return [...l].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

/** Past and still open, most overdue first: the hero is the first. */
export function waiting<P extends LedgerParty>(l: readonly P[], today: string): P[] {
  return l.filter(p => needsWrapUp(p, today)).sort((a, b) => a.date.localeCompare(b.date));
}

export interface Takings<P extends LedgerParty = LedgerParty> {
  closed: P[];
  door: number;
  spent: number;
  net: number;
  keptPct: number;
  best: P | null;
  /** Average member roll over rolled parties, %; null before any roll. */
  avg: number | null;
  rolled: number;
  /** Closed parties oldest → newest, for the strip. */
  chron: P[];
  maxSwing: number;
}

export function takings<P extends LedgerParty>(l: readonly P[], rolls: Iterable<Roll>): Takings<P> {
  const closed = l.filter(p => p.completed);
  const door = closed.reduce((s, p) => s + p.doorRevenue, 0);
  const spent = closed.reduce((s, p) => s + p.expenses, 0);
  const net = door - spent;
  const best = closed.length ? closed.reduce((a, b) => (profit(b) > profit(a) ? b : a)) : null;
  const r = [...rolls].filter(x => x.eligible > 0);
  const avg = r.length ? Math.round((r.reduce((s, x) => s + x.present / x.eligible, 0) / r.length) * 100) : null;
  const chron = [...closed].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  return {
    closed, door, spent, net, keptPct: door > 0 ? Math.round((net / door) * 100) : 0, best, avg, rolled: r.length,
    chron, maxSwing: Math.max(1, ...chron.map(p => Math.abs(profit(p)))),
  };
}

/** A strip bar's height, % of the lane (at least 6). */
export const barPct = (n: number, maxSwing: number) => Math.max(6, Math.round(Math.abs(n) / maxSwing * 100));

/** Members present as a whole %, or null with no one eligible. */
export const rollPct = (r: Roll | undefined | null) => (r && r.eligible > 0 ? Math.round((r.present / r.eligible) * 100) : null);

/* ── the words ────────────────────────────────────────────────────────────────── */

/** The briefing under the title, as runs: `strong` is set in bold. */
export function briefing(closed: number, net: number, wait: number): { lead: string; strong: string | null; rest: string } {
  const lead = closed > 0 ? `${closed} ${closed === 1 ? "party" : "parties"} closed out and the books are ` : "No parties closed out yet.";
  const strong = closed > 0 ? (net >= 0 ? "net positive" : "in the red") : null;
  const rest = (closed > 0 ? "." : "") + (wait > 0
    ? ` ${wait} ${wait === 1 ? "party is" : "parties are"} still waiting on numbers — close ${wait === 1 ? "it" : "them"} out and you're square.`
    : " Everything's accounted for.");
  return { lead, strong, rest };
}

/** "Needs wrap-up · 6 days ago". */
export function heroTag(date: string, today: string): string {
  const ago = -daysFrom(date, today);
  return `Needs wrap-up · ${Math.max(0, ago)} ${ago === 1 ? "day" : "days"} ago`;
}

export const PAGE = {
  crumb: "Parties",
  kicker: (org: string) => `Parties · ${org}`,
  title: ["The ", "house", " ledger."] as const,
  add: "Add party",
  ask: "Ask what the door cleared",
  askQ: "What did the door clear this semester?",
  heroAct: "Close it out",
  heroMeta: " — add the door & expenses so the semester totals are right.",
  heroMore: (n: number) => `+${n} more waiting below`,
  netK: "Net this semester",
  netNote: (n: number) => `across ${n} closed ${n === 1 ? "party" : "parties"}`,
  door: "Door taken", doorSub: "gross revenue",
  spent: "Spent", spentSub: (pct: number) => `kept ${pct}%`,
  avg: "Avg attendance", avgSub: (rolled: number | null) => (rolled != null ? `of members, ${rolled} rolled` : "no roll taken yet"),
  best: "Best night", bestNone: "none yet",
  none: "—",
  strip: "Night by night", stripSub: "net per closed party — tap one to open it",
  book: "Every party",
  count: (n: number) => `${n} total · newest first`,
  cols: ["Date", "Party", "Net"] as const,
  net: "net",
  wrap: "Wrap up →",
  needs: "Needs wrap-up",
  emptyT: "No parties yet",
  emptyOfficer: "Add your first party to start tracking the books — after the night, close it out with the door and what you spent, and the semester’s net keeps itself.",
  emptyMember: "Nothing here yet. Once an officer adds a party, it lands in this book.",
} as const;

export const RECEIPT = {
  head: (org: string) => `${org} · the house`,
  door: "Door", spent: "Spent", net: "Net",
  noFigures: "NO FIGURES", tabOpen: "TAB OPEN",
  dueLine: "Happened already — no figures recorded yet.",
  openLine: "Numbers open until it’s wrapped up.",
  members: "Members", thru: "Thru door",
  closed: "*** CLOSED OUT ***", open: "*** OPEN TAB ***",
  noNotes: "No notes.",
  mandatory: "Mandatory — counts toward attendance",
  whoCame: "Who came",
  of: (r: Roll) => `${r.present} of ${r.eligible}`,
  wrapUp: "Wrap up", timeline: "Open in Timeline", edit: "Edit", del: "Delete",
} as const;

/** The drawer's note: the party's own, else what its state says. */
export function noteFor(p: LedgerParty, today: string): string {
  return p.notes || (isUpcoming(p, today) ? RECEIPT.openLine : needsWrapUp(p, today) ? RECEIPT.dueLine : RECEIPT.noNotes);
}

/** "Net" on the receipt: "+$1,240.00" / "−$80.00". */
export const receiptNet = (n: number) => `${n >= 0 ? "+" : "−"}${fmt$(Math.abs(n))}`;

export const FORM = {
  addTitle: "Add Party", editTitle: "Edit Party",
  name: "Party name", namePh: "Spring Rush Social",
  when: "When",
  type: "Party type",
  theme: "Theme", themePhAdd: "All White, Black & Gold…", themePhEdit: "All White…",
  collab: "Collab org", collabPh: "KDF, DSP…",
  opt: "opt",
  addFoot: "Lands on the Timeline as a party.", editFoot: "Changes carry to its Timeline entry.",
  cancel: "Cancel", add: "Add Party", save: "Save Changes",
} as const;

export const WRAP = {
  title: "Mark Completed",
  head: (p: LedgerParty) => `${fmtDate(p.date)} · ${subLine(p)}`,
  step: (n: 1 | 2) => `Step ${n} of 2`,
  door: "Door Revenue ($) *", spent: "Expenses ($) *", amtPh: "0.00",
  preview: "Net preview",
  notes: "Post-event notes", notesPh: "How did it go?",
  footRoll: "Next you’ll tick off who came.", footMoney: "The roll’s already in — this just saves the money.",
  cancel: "Cancel", next: "Next: Who came? →", done: "Mark Completed",
  who: (n: number, of: number) => `Who came? (${n}/${of})`,
  /** The web sets the counts as their own text nodes after this. */
  whoOpen: "Who came? (",
  all: "All", none: "None",
  find: "Find a member…", nobody: "Nobody by that name.",
  mandatory: ["Mandatory", " — count this toward each brother’s attendance %"] as const,
  footTick: "Everyone starts ticked — untick the no-shows.",
  back: "← Back",
} as const;

/** The roll's search shows past 8 people. */
export const FIND_AFTER = 8;

/** Step 2 runs only with someone to roll and no roll yet. */
export const canTakeRoll = (people: number, alreadyRolled: boolean) => people > 0 && !alreadyRolled;

/** The wrap-up's money as the route takes it: a blank or bad figure is 0. */
export const money = (s: string) => Number(s) || 0;

export const DELETE = {
  title: "Delete Party",
  message: (name: string) => ["Delete ", name, "? Its timeline entry, financial totals, attendance records, and excuses will also be removed. This cannot be undone."] as const,
} as const;

/** Every refusal, as the web's banner says it. */
export const SAY = {
  addFailed: "Could not save party. Changes reverted.",
  editFailed: "Could not save changes. Changes reverted.",
  stillSaving: "Party is still saving. Wait a moment, then try again.",
  wrapFailed: "Could not mark party completed. Changes reverted.",
  deleteFailed: "Could not delete party. Changes reverted.",
} as const;
