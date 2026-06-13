import { prisma } from "@/lib/prisma";
import { isoWeekBounds } from "@/lib/dates";

// Per-org caches keyed by orgId. Active semester changes at most a few times a
// year; caching for 5 minutes avoids a round trip before every chat message.
const semesterCache = new Map<number, { line: string; expires: number }>();

async function getSemesterLine(orgId: number): Promise<string> {
  const now = Date.now();
  const cached = semesterCache.get(orgId);
  if (cached && cached.expires > now) return cached.line;
  let line = "";
  try {
    const s = await prisma.semester.findFirst({
      where: { isActive: true, organizationId: orgId },
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

async function getLastMeetingLine(orgId: number, todayIso: string): Promise<string> {
  const cacheKey = `${orgId}:${todayIso}`;
  const now = Date.now();
  const cached = lastMeetingCache.get(cacheKey);
  if (cached && cached.expires > now) return cached.line;
  let line = "";
  try {
    const m = await prisma.calendarEvent.findFirst({
      where: { organizationId: orgId, category: "chapter", date: { lt: todayIso } },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    if (m) line = `Last chapter meeting: ${m.date}.`;
  } catch { /* DB blip — model still works without this line */ }
  lastMeetingCache.set(cacheKey, { line, expires: now + 5 * 60 * 1000 });
  return line;
}

function nextWeekBounds(today: Date): { start: string; end: string } {
  const nextMon = new Date(today);
  nextMon.setDate(today.getDate() + 7);
  return isoWeekBounds(nextMon);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function buildSystemPrompt(orgId: number, now: Date = new Date()): Promise<string> {
  const today = now.toISOString().slice(0, 10);
  const weekday = WEEKDAYS[now.getDay()];
  const week = isoWeekBounds(now);
  const next = nextWeekBounds(now);
  const [semesterLine, lastMeetingLine] = await Promise.all([
    getSemesterLine(orgId),
    getLastMeetingLine(orgId, today),
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

  return [
    "You are the assistant for ChaptOS, a fraternity chapter ops dashboard. Answer questions about brothers, attendance, deadlines, Instagram, parties, treasury, budget, and programming events by calling the provided tools — never make up numbers or names.",
    "SUPERLATIVES (worst/best/biggest/most/top/next): use order_by + order + small limit on the relevant list tool, NOT a status filter.",
    "NEXT/UPCOMING means from today forward: set start=<today> so overdue items don't crowd out the answer. Lead with the next future item; mention overdue ones separately if they exist. This applies ONLY to next/upcoming phrasing — status questions ('any urgent deadlines?') must NOT filter by date; overdue urgent items are the most urgent of all.",
    "EMPTY FILTERED RESULT: broaden — drop the filter or switch to a sort — before saying 'none'. Identify the user's underlying intent, not the literal phrasing.",
    "NAMES: get_brother accepts fragments; if multiple match, ask which one.",
    "BARE DATES: a day without a month ('the 14th') is NOT necessarily this month — pass day_of_month=14 (no start/end) to list_calendar_events / list_programming_events to match that day in every month. Present EVERY match with its month (don't ask 'which month?' when you can show what's there). Same for event names: prefer a title filter over guessing a date window.",
    "TOPIC ≠ TABLE: 'community service' (and similar topics) can live in the service list, the calendar (category 'service'), OR the programming board (type 'Community Service') — and events are sometimes filed under the wrong category. Check all relevant tools in parallel, and try a title-fragment search (e.g. title='service') before saying there's none.",
    "WRITES: call propose_* tools to surface a confirm card. Never claim you've done it — the user confirms.",
    "WRITE FIELDS: only ask the user for the schema's required fields. Omit optional fields (status, time, location, description, mandatory, paymentMethod, paidTo) unless the user supplied them — defaults handle the rest. Don't re-ask for details the user didn't volunteer.",
    "SOURCING: when you state a specific number or name, tag where it came from in a few words, e.g. '$1,240 (treasury balance)' or 'from this semester's transactions' — so officers can trust and verify. Keep it inline and brief.",
    "OUT OF SCOPE: for anything outside chapter ops (weather, news, general knowledge, coding), decline in ONE sentence and stop. Don't suggest workarounds, name external tools/apps, or volunteer adjacent info — a clean 'I can only help with chapter data' is the whole reply.",
    "Be terse. Numbers and names over prose. Skip preamble.",
    dateLine,
  ].join(" ");
}
