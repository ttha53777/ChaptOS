/**
 * The Fundraisers pages' rules and words, shared by the web (`app/org/[slug]/fundraisers`,
 * the list and `[id]`) and the app (`mobile/src/fundraisers`). Pure: "today" is passed in
 * as a YYYY-MM-DD string, no Temporal, no server imports, safe under
 * noUncheckedIndexedAccess.
 *
 * The model is three numbers per fundraiser (lib/fundraisers): supplies (the shopping
 * list), came in (one wrap-up total), made = came in − supplies. The stage is derived:
 * wrapped / ready (the day has come, nobody has counted) / planning.
 */
import type { Fundraiser, FundraiserKind } from "@/lib/api-types";
import { FUNDRAISER_KINDS, formatDollars, kindOf, stageOf, type FundraiserStage } from "@/lib/fundraisers";

export { FUNDRAISER_KINDS, kindOf, stageOf, type FundraiserStage };

export const $m = formatDollars;

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function dt(s: string): Date {
  const [y = 1970, m = 1, d = 1] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** YYYY-MM-DD of `now` in the device's zone. */
export function todayOf(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export const daysFrom = (s: string, today: string) => Math.round((dt(s).getTime() - dt(today).getTime()) / 864e5);
/** "Nov 2". */
export const fmtD = (s: string) => { const d = dt(s); return `${MON3[d.getMonth()]} ${d.getDate()}`; };
/** "Mon". */
export const dow3 = (s: string) => (DOW[dt(s).getDay()] ?? "").slice(0, 3);
/** "Nov". */
export const mon3 = (s: string) => MON3[dt(s).getMonth()] ?? "";
export const dayOf = (s: string) => dt(s).getDate();
export const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "today", "yesterday", "tomorrow", "Monday", "this Friday", else "Nov 2". */
export function rel(s: string, today: string): string {
  const n = daysFrom(s, today);
  if (n === 0) return "today"; if (n === -1) return "yesterday"; if (n === 1) return "tomorrow";
  const day = DOW[dt(s).getDay()] ?? "";
  if (n < 0 && n > -7) return day;
  if (n > 0 && n < 7) return "this " + day;
  return fmtD(s);
}

/** "14:00" → "2 PM", "09:30" → "9:30 AM". */
export function clock(t: string): string {
  const [hs = "0", m = "00"] = t.split(":"); let h = Number(hs); const ap = h < 12 ? "AM" : "PM"; h = h % 12 || 12;
  return `${h}${m !== "00" ? ":" + m : ""} ${ap}`;
}

/** A range drops the first AM/PM when both match: "9 – 11 AM". */
export function hours(f: Pick<Fundraiser, "startTime" | "endTime">): string {
  if (!f.startTime) return "";
  if (!f.endTime) return clock(f.startTime);
  let a = clock(f.startTime); const b = clock(f.endTime);
  if (a.slice(-2) === b.slice(-2)) a = a.slice(0, -3);
  return `${a} – ${b}`;
}

/** A typed dollar figure: "$1,2.5x" → 12.5, two places; blank or junk → 0. */
export const num = (s: string) => { const v = parseFloat(s.replace(/[^0-9.]/g, "")); return isNaN(v) ? 0 : Math.round(v * 100) / 100; };
/** A cost as it sits in its input: "" for 0, "12" or "12.50". */
export const inV = (v: number) => (v ? (v % 1 ? v.toFixed(2) : String(v)) : "");

/** Step dots on a card: 0 none, 1 list started, 3 wrapped. */
export const dotsOn = (f: Pick<Fundraiser, "wrappedAt" | "supplies">) => (f.wrappedAt ? 3 : f.supplies.length ? 1 : 0);

/** A card's price tag tilt, by its place in the grid. */
export const TILT = [6, -5, 4, -7, 5] as const;
export const tiltAt = (i: number) => TILT[i % TILT.length] ?? 0;

/* ── the list ─────────────────────────────────────────────────────────────────── */

export interface Lists {
  ready: Fundraiser[];
  upcoming: Fundraiser[];
  /** Wrapped this term, newest first. */
  wrapped: Fundraiser[];
  /** Wrapped before this term. */
  earlier: Fundraiser[];
  termMade: number;
}

export function lists(list: readonly Fundraiser[], today: string, term: { startDate: string; endDate: string } | null): Lists {
  const inThisTerm = (f: Fundraiser) => !term || (f.date >= term.startDate && f.date <= term.endDate);
  const stage = (f: Fundraiser) => stageOf({ date: f.date, wrapped: !!f.wrappedAt }, today);
  const byDate = (a: Fundraiser, b: Fundraiser) => a.date.localeCompare(b.date);
  const ready = list.filter(f => stage(f) === "ready").sort(byDate);
  const upcoming = list.filter(f => stage(f) === "planning").sort(byDate);
  const wrappedAll = list.filter(f => stage(f) === "wrapped").sort((a, b) => b.date.localeCompare(a.date));
  const wrapped = wrappedAll.filter(inThisTerm), earlier = wrappedAll.filter(f => !inThisTerm(f));
  return { ready, upcoming, wrapped, earlier, termMade: wrapped.reduce((a, f) => a + (f.made ?? 0), 0) };
}

/** The brief's counts, as [number, words] runs: "2 wrapped up · 1 coming up". */
export function briefBits(l: Lists): [number, string][] {
  const out: [number, string][] = [];
  if (l.wrapped.length) out.push([l.wrapped.length, " wrapped up"]);
  if (l.ready.length) out.push([l.ready.length, " waiting to be counted"]);
  if (l.upcoming.length) out.push([l.upcoming.length, " coming up"]);
  return out;
}

export const LIST = {
  crumb: "Fundraisers",
  kick: "Fundraising",
  greetEmpty: ["Fundraising, ", "the easy way"] as const,
  made: (termMade: number) => (termMade < 0 ? "Down " : "You’ve made "),
  thisTerm: " this term",
  nothing: "Nothing counted yet",
  subEmpty: "Write down what you buy. After the sale, type in what came in. We do the subtraction and keep the score for the term.",
  subTail: "Every fundraiser is the same two steps: list what you bought, then count what came in.",
  newOne: "New fundraiser",
  loadFailed: "Couldn’t load fundraisers.",
  retry: "Try again",
  heroTag: "Ready to wrap up",
  heroQ: (name: string, when: string) => `${name} was ${when}. How much came in?`,
  heroSpent: ["You spent ", " on supplies. "] as const,
  heroOfficer: "Type in the total that came in and we’ll tell you what you made.",
  heroMember: "An officer types in what came in, and you’ll see what it made.",
  heroAct: (canManage: boolean) => (canManage ? "Wrap it up" : "Open"),
  upcoming: "Coming up",
  wrapped: "Wrapped up",
  wrappedCnt: (n: number, made: number) => `${n} · ${$m(made)} ${made < 0 ? "short" : "made"}`,
  earlier: "Earlier terms",
  cardMade: (m: number) => (m < 0 ? "Short " : "Made "),
  cardOn: [" on ", " of supplies"] as const,
  cardReady: ["Sale’s over · ", "count the money"] as const,
  cardWrap: "Wrap up",
  /** After the count: "3 supplies · $43". */
  cardSupplies: " supplies · ",
  cardNoList: "No shopping list yet",
  cardOpen: "Open",
  /** The card's when chip: "This Friday · 9 AM". */
  cardWhen: (f: Pick<Fundraiser, "date" | "startTime">, today: string) => `${cap1(rel(f.date, today))}${f.startTime ? ` · ${clock(f.startTime)}` : ""}`,
  step: (n: number) => `Step ${Math.min(n + 1, 3)} of 3`,
} as const;

export const DAY_ONE = {
  pad: [["Flour & sugar", "$18"], ["Butter", "$14"], ["Boxes", "$11"], ["Supplies", "$43"]] as const,
  jar: { sup: 43, inn: 180 },
  tag: 137,
  steps: [
    ["1 · List your supplies", "What you’re buying, and what it cost."],
    ["2 · Count what came in", "One total, once the sale’s over."],
    ["3 · See what you made", "Came in, minus supplies. That’s it."],
  ] as const,
  cta: "Plan your first fundraiser",
  member: "Nothing planned yet. An officer can start the first one.",
} as const;

/* ── the composer ─────────────────────────────────────────────────────────────── */

export const COMPOSE = {
  eyebrow: (editing: boolean) => (editing ? "Edit fundraiser" : "New fundraiser"),
  namePh: "Name it",
  hintEmpty: "Say what it is (“bake sale”, “car wash”) and we’ll suggest the supplies.",
  hintOther: "We’ll start you with a blank shopping list.",
  /** " We’ll suggest flour & sugar, butter & eggs, chocolate chips…" after the kind chip. */
  hintKind: (kind: FundraiserKind) => ` We’ll suggest ${FUNDRAISER_KINDS[kind].suggestions.slice(0, 3).map(x => x[0].toLowerCase()).join(", ")}…`,
  calNone: ["Day", "?"] as const,
  day: "Day", time: "Time", where: "Where", goal: "Goal", optional: "optional", to: "to",
  wherePh: "Add a place", goalPh: "No goal",
  note: (editing: boolean) => (editing ? "Name, day, time and place also show on the Timeline." : "You can change any of this later."),
  cancel: "Cancel",
  go: (editing: boolean, busy: boolean) => (editing ? (busy ? "Saving…" : "Save") : busy ? "Creating…" : "Start the shopping list"),
  failed: (editing: boolean) => (editing ? "Couldn’t save. Try again." : "Couldn’t create the fundraiser. Try again."),
} as const;

/** The composer's body, as both clients send it (the zone is this device's). */
export function composeBody(v: { name: string; date: string; t0: string; t1: string; place: string; goal: string }, timeZone: string) {
  const goalN = Number(v.goal.replace(/[^0-9.]/g, ""));
  return {
    name: v.name.trim(), date: v.date, place: v.place.trim() || null, goal: goalN > 0 ? goalN : null,
    startTime: v.t0 || null, endTime: v.t0 && v.t1 ? v.t1 : null, timeZone,
  };
}

/* ── one fundraiser ───────────────────────────────────────────────────────────── */

export type StepState = "done" | "now" | "" | "miss" | "win";

/** The three steps over the page: shopping list → wrap up → what you made. */
export function steps(f: Fundraiser, spent: number, count: number, today: string): { state: StepState; title: string; sub: string }[] {
  const w = !!f.wrappedAt, m = f.made ?? 0, st = stageOf({ date: f.date, wrapped: w }, today);
  return [
    { state: count ? "done" : "now", title: "Shopping list", sub: count ? `${count} item${count > 1 ? "s" : ""} · ${$m(spent)}` : "Add what you’ll buy" },
    { state: w ? "done" : count || st === "ready" ? "now" : "", title: "Wrap up", sub: w ? `${$m(f.cameIn ?? 0)} came in` : st === "ready" ? "Count the money" : `After the sale, ${fmtD(f.date)}` },
    { state: w ? (m < 0 ? "miss" : "win") : "", title: w && m < 0 ? "Came up short" : "What you made", sub: w ? $m(Math.abs(m)) : "—" },
  ];
}

/** The usual supplies for its kind that aren't on the list yet. */
export function suggestionsFor(kind: FundraiserKind, names: readonly string[]): readonly (readonly [string, number])[] {
  const have = new Set(names.map(n => n.trim().toLowerCase()));
  return FUNDRAISER_KINDS[kind].suggestions.filter(([n]) => !have.has(n.toLowerCase()));
}

/** The list total while you type (the server's total takes over on save). */
export const spentOf = (costs: readonly string[]) => Math.round(costs.reduce((a, c) => a + num(c), 0) * 100) / 100;

/** The date chip's tail after "Nov 2": " · Yesterday", or "" once wrapped or when it's just the date. */
export function dateRel(date: string, wrapped: boolean, today: string): string {
  const r = rel(date, today);
  return wrapped || r === fmtD(date) ? "" : ` · ${cap1(r)}`;
}

export const DETAIL = {
  back: "All fundraisers",
  goal: (g: number) => `Goal ${$m(g)}`,
  /** The web sets the figure as its own text node after this. */
  goalK: "Goal ",
  edit: "Edit",
  del: (asking: boolean) => (asking ? "Delete for good?" : "Delete"),
  missing: "That fundraiser isn’t here anymore.",
  loadFailed: "Couldn’t load this fundraiser.",
  retry: "Try again",
  padTitle: "Shopping list",
  padSub: (wrapped: boolean, canManage: boolean) => (wrapped ? "Locked when you wrapped up." : canManage ? "Everything you’re buying for this, and what it cost." : "What the chapter is buying for this."),
  addPh: "Add a supply…",
  costPh: "0",
  empty: ["Nothing yet. Type one above", ", or tap a usual one below", "."] as const,
  emptyLocked: "Nothing on the list.",
  usually: (kindLabel: string) => `Usually on a ${kindLabel.toLowerCase()} list:`,
  sugg: (cost: number) => `~$${cost}`,
  supplies: "Supplies",
  items: (n: number) => `${n} item${n === 1 ? "" : "s"}`,
  jarTitle: (ready: boolean) => (ready ? "How much came in?" : "After the sale: count it up"),
  lede: (canManage: boolean, ready: boolean, date: string) => (!canManage ? "Waiting for an officer to count it." : ready ? "Everything together: cash, Venmo, card. Rough is fine." : `Come back after ${fmtD(date)} and type in what came in.`),
  legend: ["Pays back supplies", "What you made", "Goal"] as const,
  total: "Total that came in",
  mathEmpty: ["Type what came in and we’ll subtract the ", " of supplies. ", "= ?"] as const,
  math: [" came in ", "−", " on supplies ", "="] as const,
  short: "short", made: "made",
  wrap: "Wrap it up",
  wrapNote: "Take out any starting change before you count the cash.",
  kick: (loss: boolean) => (loss ? "Came up short" : "We made"),
  rcpt: (loss: boolean) => ["Came in", "Supplies", loss ? "Short" : "Made"] as const,
  lossLine: "Supplies cost more than came in. The list on the left shows where it went.",
  copy: "Copy for the group chat",
  reopen: "Reopen",
} as const;

/** The goal line under a wrapped result, as runs: bold figures are the web's <b>. */
export function goalLine(made: number, goal: number): { text: string; bold?: boolean }[] {
  if (made >= goal) return [{ text: "Goal was " }, { text: $m(goal), bold: true }, { text: ". You beat it by " }, { text: $m(made - goal), bold: true }, { text: "." }];
  if (made > 0) return [{ text: "Goal was " }, { text: $m(goal), bold: true }, { text: ". " }, { text: $m(goal - made), bold: true }, { text: " short of it." }];
  return [{ text: "Goal was " }, { text: $m(goal), bold: true }, { text: ". Not this time." }];
}

/** What "Copy for the group chat" puts on the clipboard. */
export function copyText(f: Fundraiser): string {
  const m = f.made ?? 0;
  return `${f.name} wrap-up: ${$m(f.cameIn ?? 0)} came in, ${$m(f.spent)} on supplies, ${m < 0 ? `${$m(-m)} short` : `${$m(m)} made`}.`;
}

/** Every toast and refusal, as the web says it. */
export const SAY = {
  created: "Created. Now, what are you buying?",
  added: (name: string) => `Added ${name}. Change the price if it’s off.`,
  removed: (name: string) => `Removed ${name}`,
  wrapped: (made: number) => (made < 0 ? "Wrapped up. Came in a little short." : `Wrapped up: ${$m(made)} made`),
  deleted: (name: string) => `Deleted ${name}`,
  copied: "Copied for the group chat",
  copyFailed: "Couldn’t copy. Select the numbers instead.",
  saved: "Saved",
  addFailed: "Couldn’t add that supply.",
  lineFailed: "Couldn’t save that line.",
  removeFailed: "Couldn’t remove that supply.",
  wrapFailed: "Couldn’t wrap it up.",
  reopenFailed: "Couldn’t reopen it.",
  deleteFailed: "Couldn’t delete it.",
} as const;

/* ── the jar ──────────────────────────────────────────────────────────────────── */

/**
 * The money jar's geometry (viewBox 200×250). Butter fills to what the supplies cost,
 * mint is everything above that line (made); money that never reaches the line leaves a
 * rose hatch (short). One dashed line = supplies, a lilac one = the goal.
 */
export const JAR = {
  top: 74, h: 164,
  body: "M56 40h88v10c0 8 30 12 30 40v128c0 12-10 22-22 22H48c-12 0-22-10-22-22V90c0-28 30-32 30-40z",
} as const;

/** The jar's full-scale figure: room above the supplies, the goal and what came in. */
export const jarCap = (sup: number, goal: number | null, inn: number | null) => Math.max(sup * 2.6, (goal ?? 0) * 1.22, (inn ?? 0) * 1.12, 40);
/** A figure's line, px down from the top of the money. */
export const jarY = (x: number, cap: number) => JAR.h * (1 - Math.min(Math.max(x, 0) / cap, 1.02));
/** The goal's label drops under its line when it would sit on the supplies label. */
export const goalClose = (sup: number, goal: number | null, cap: number) => !!goal && sup > 0 && Math.abs(jarY(goal, cap) - jarY(sup, cap)) < 15;
export const jarLabel = (sup: number, inn: number | null) => (inn == null ? `Money jar. Supplies line at ${$m(sup)}.` : `Money jar: ${$m(inn)} came in against ${$m(sup)} of supplies.`);
