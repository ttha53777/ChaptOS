import { db } from "@/lib/db";
import { isoWeekBounds } from "@/lib/dates";

/** Org-scoped data accessor (same shape as ctx.db). See lib/ai-tools.ts. */
type Scoped = ReturnType<typeof db>;

// Per-org caches keyed by orgId. Active semester changes at most a few times a
// year; caching for 5 minutes avoids a round trip before every chat message.
const semesterCache = new Map<number, { line: string; expires: number }>();

async function getSemesterLine(scoped: Scoped, orgId: number): Promise<string> {
  const now = Date.now();
  const cached = semesterCache.get(orgId);
  if (cached && cached.expires > now) return cached.line;
  let line = "";
  try {
    const s = await scoped.semester.findFirst({
      where: { isActive: true },
      select: { label: true, startDate: true, endDate: true },
    });
    if (s) line = `Active semester: ${s.label} (${s.startDate} → ${s.endDate}).`;
  } catch { /* DB blip — model still works without this line */ }
  semesterCache.set(orgId, { line, expires: now + 5 * 60 * 1000 });
  return line;
}

// Last chapter meeting: same 5-min cache, keyed by orgId + today's ISO date so
// it expires at the day boundary rather than going stale at 11:59 PM.
const lastMeetingCache = new Map<string, { line: string; expires: number }>();

async function getLastMeetingLine(scoped: Scoped, orgId: number, todayIso: string): Promise<string> {
  const cacheKey = `${orgId}:${todayIso}`;
  const now = Date.now();
  const cached = lastMeetingCache.get(cacheKey);
  if (cached && cached.expires > now) return cached.line;
  let line = "";
  try {
    const m = await scoped.calendarEvent.findFirst({
      where: { category: "chapter", date: { lt: todayIso } },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    if (m) line = `Last chapter meeting: ${m.date}.`;
  } catch { /* DB blip — model still works without this line */ }
  lastMeetingCache.set(cacheKey, { line, expires: now + 5 * 60 * 1000 });
  return line;
}

// Chapter snapshot: a tiny block of pre-computed aggregates inlined into the
// system prompt so common "how are we doing on dues / attendance?" questions can
// be answered in a SINGLE model turn (zero tool calls) instead of two. Same
// 5-min per-org cache as the lines above.
//
// Cache discipline (the system prompt is the OpenAI prompt-cache prefix): the
// figures are QUANTIZED — dollars to the nearest $10, attendance/GPA to coarse
// steps — so the line only changes when numbers move materially, not on every
// refresh. The block is appended LAST so the stable instruction prefix stays
// byte-identical. It's labelled an approximation so the model still calls tools
// for exact/current numbers and for any list of names.
const snapshotCache = new Map<number, { line: string; expires: number }>();

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

async function getSnapshotLine(scoped: Scoped, orgId: number): Promise<string> {
  const now = Date.now();
  const cached = snapshotCache.get(orgId);
  if (cached && cached.expires > now) return cached.line;
  let line = "";
  try {
    const [agg, owing, doorAgg, txByType] = await Promise.all([
      scoped.brother.aggregate({
        where: { isGhost: false },
        _count: { _all: true },
        _sum: { duesOwed: true },
        _avg: { attendance: true, gpa: true },
      }),
      scoped.brother.count({ where: { isGhost: false, duesOwed: { gt: 0 } } }),
      scoped.partyEvent.aggregate({ _sum: { doorRevenue: true } }),
      scoped.transaction.groupBy({ by: ["type"], where: { deletedAt: null }, _sum: { amount: true } }),
    ]);
    // We requested _count: { _all: true }, so _count is the object form at
    // runtime; the wrapper's widened return type doesn't express that, hence the
    // guarded read.
    const count = (typeof agg._count === "object" && agg._count ? agg._count._all : 0) ?? 0;
    if (count > 0) {
      const totalDues = roundTo(agg._sum?.duesOwed ?? 0, 10);
      const avgAtt = Math.round(agg._avg?.attendance ?? 0);
      const avgGpa = roundTo(agg._avg?.gpa ?? 0, 0.05).toFixed(2);
      const income = txByType.find(g => g.type === "income")?._sum.amount ?? 0;
      const expense = txByType.find(g => g.type === "expense")?._sum.amount ?? 0;
      const balance = roundTo((doorAgg._sum?.doorRevenue ?? 0) + income - expense, 10);
      line =
        `Chapter snapshot (cached ≤5 min, approximate — call tools for exact/current figures or any list of names): ` +
        `${count} active brothers; ${owing} owe dues (~$${totalDues.toLocaleString("en-US")} total); ` +
        `avg attendance ~${avgAtt}%; avg GPA ~${avgGpa}; treasury ~$${balance.toLocaleString("en-US")}.`;
    }
  } catch { /* DB blip — the model still works without the snapshot */ }
  snapshotCache.set(orgId, { line, expires: now + 5 * 60 * 1000 });
  return line;
}

function nextWeekBounds(today: Date): { start: string; end: string } {
  const nextMon = new Date(today);
  nextMon.setDate(today.getDate() + 7);
  return isoWeekBounds(nextMon);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function buildSystemPrompt(
  scoped: Scoped,
  orgId: number,
  caller: { id: number; name: string },
  now: Date = new Date(),
): Promise<string> {
  const today = now.toISOString().slice(0, 10);
  const weekday = WEEKDAYS[now.getDay()];
  const week = isoWeekBounds(now);
  const next = nextWeekBounds(now);
  const [semesterLine, lastMeetingLine, snapshotLine] = await Promise.all([
    getSemesterLine(scoped, orgId),
    getLastMeetingLine(scoped, orgId, today),
    getSnapshotLine(scoped, orgId),
  ]);

  // Date anchors are kept on their own line so the model doesn't have to do
  // calendar math for common "this week" / "last meeting" / "next event"
  // questions. Saves tool calls and avoids weekday-off-by-one mistakes.
  const dateLine = [
    `Today: ${today} (${weekday}).`,
    `This week: ${week.start} → ${week.end} (Mon–Sun).`,
    `Next week: ${next.start} → ${next.end}.`,
    lastMeetingLine,
    semesterLine,
  ].filter(Boolean).join(" ");

  // Who's asking. The caller is authenticated server-side (ctx.actorId/actorName),
  // so first-person questions ("my attendance", "events I did", "what should I go
  // to next") resolve to THIS brother — the model must never ask the user to
  // identify themselves. Pass this name to the name-scoped tools (get_brother,
  // get_brother_attendance) when the user says I/me/my. Placed after the fixed
  // instruction block so the stable, cacheable prefix stays byte-identical across
  // users; only the tail of the prompt varies per caller.
  const callerLine =
    `The person asking is ${caller.name} (brother id ${caller.id}). ` +
    `Resolve "I"/"me"/"my"/"mine" to them — never ask who they are; you already know. ` +
    `For their own attendance/events, pass name="${caller.name}" to the name-scoped tools.`;

  return [
    "You are the assistant for ChaptOS, a fraternity chapter ops dashboard. Answer questions about brothers, attendance, deadlines, Instagram, parties, treasury, budget, programming events, and chapter settings (custom metrics, vocabulary, roles, member fields, semesters, thresholds) by calling the provided tools — never make up numbers or names.",
    "ONE BATCH: when a question needs several INDEPENDENT lookups (e.g. 'how are dues and attendance?', or checking the calendar AND programming board for one topic), emit all of them as parallel tool calls in a SINGLE turn instead of one at a time — it's faster. This is about independent reads only; still take a follow-up turn when a result genuinely requires it (broaden an empty filter, disambiguate a name, chain on a value you just learned).",
    "SUPERLATIVES (worst/best/biggest/most/top/next): use order_by + order + small limit on the relevant list tool, NOT a status filter.",
    "NEXT/UPCOMING means from today forward: set start=<today> so overdue items don't crowd out the answer. Lead with the next future item; mention overdue ones separately if they exist.",
    "DEADLINE URGENCY IS DERIVED FROM THE DUE DATE, not a stored status (status is only open/done). For 'urgent/due soon' deadlines, query a date window near today and open_only=true — do NOT pass a status filter for urgency. 'Overdue' = open tasks with dueDate before today.",
    "EMPTY FILTERED RESULT: broaden — drop the filter or switch to a sort — before saying 'none'. Identify the user's underlying intent, not the literal phrasing.",
    "NAMES: get_brother accepts fragments; if multiple match, ask which one.",
    "BARE DATES: a day without a month ('the 14th') is NOT necessarily this month — pass day_of_month=14 (no start/end) to list_calendar_events / list_programming_events to match that day in every month. Present EVERY match with its month (don't ask 'which month?' when you can show what's there). Same for event names: prefer a title filter over guessing a date window.",
    "TOPIC ≠ TABLE: 'community service' (and similar topics) can live in the service list, the calendar (category 'service'), OR the programming board (type 'Community Service') — and events are sometimes filed under the wrong category. Check all relevant tools in parallel, and try a title-fragment search (e.g. title='service') before saying there's none.",
    "WRITES: call propose_* tools to surface a confirm card. Never claim you've done it — the user confirms.",
    "WRITE FIELDS: only ask the user for the schema's required fields. Omit optional fields (status, time, location, description, mandatory, paymentMethod) unless the user supplied them — defaults handle the rest. Don't re-ask for details the user didn't volunteer.",
    "SOURCING: when you state a specific number or name, tag where it came from in a few words, e.g. '$1,240 (treasury balance)' or 'from this semester's transactions' — so officers can trust and verify. Keep it inline and brief.",
    "PRODUCT HOW-TO: 'how do I do X in ChaptOS' questions about real features ARE in scope. Custom metrics, vocabulary, roles, member fields, semesters, and dues/GPA thresholds are managed under Settings. For these, give a brief navigational answer (e.g. 'Settings → Custom Metrics → Add metric; you set a name, unit, goal, and at-risk threshold'). You configure these in the app, not via chat — point the user to the page, don't claim to do it for them. Don't decline these as out-of-scope.",
    "OUT OF SCOPE: for anything outside chapter ops (weather, news, general knowledge, writing code), decline in ONE sentence and stop. Don't suggest workarounds, name external tools/apps, or volunteer adjacent info — a clean 'I can only help with chapter data' is the whole reply. This does NOT cover product how-to about ChaptOS's own features (see PRODUCT HOW-TO).",
    "Be terse. Numbers and names over prose. Skip preamble.",
    callerLine,
    dateLine,
    snapshotLine,
  ].filter(Boolean).join(" ");
}
