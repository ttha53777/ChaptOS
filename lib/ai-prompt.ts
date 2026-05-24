import { prisma } from "@/lib/prisma";

// Cache the active semester for 5 minutes — it changes at most a few times a
// year, and pulling it on every chat message adds a DB round trip before OpenAI
// even starts. Shared between the chat route and the offline eval runner so a
// prompt change in one can't silently desync from the other.
let semesterCache: { line: string; expires: number } | null = null;

async function getSemesterLine(): Promise<string> {
  const now = Date.now();
  if (semesterCache && semesterCache.expires > now) return semesterCache.line;
  let line = "";
  try {
    const s = await prisma.semester.findFirst({
      where: { isActive: true },
      select: { label: true, startDate: true, endDate: true },
    });
    if (s) line = `Active semester: ${s.label} (${s.startDate} → ${s.endDate}).`;
  } catch { /* DB blip — model still works without this line */ }
  semesterCache = { line, expires: now + 5 * 60 * 1000 };
  return line;
}

// Last chapter meeting: same 5-min cache. Keyed by today's ISO date so the
// cache naturally expires at the day boundary instead of going stale at 11:59 PM.
let lastMeetingCache: { date: string; line: string; expires: number } | null = null;

async function getLastMeetingLine(todayIso: string): Promise<string> {
  const now = Date.now();
  if (lastMeetingCache && lastMeetingCache.date === todayIso && lastMeetingCache.expires > now) {
    return lastMeetingCache.line;
  }
  let line = "";
  try {
    const m = await prisma.calendarEvent.findFirst({
      where: { category: "chapter", date: { lt: todayIso } },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    if (m) line = `Last chapter meeting: ${m.date}.`;
  } catch { /* DB blip — model still works without this line */ }
  lastMeetingCache = { date: todayIso, line, expires: now + 5 * 60 * 1000 };
  return line;
}

// Mon–Sun ISO bounds containing `today`. Mirrors isoWeekBoundsServer in
// lib/ai-tools.ts so the system prompt's "this week" matches what
// weekly_digest returns when the model calls it.
function isoWeekBounds(today: Date): { start: string; end: string } {
  const diffToMon = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const pad = (n: number) => String(n).padStart(2, "0");
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { start: toISO(monday), end: toISO(sunday) };
}

function nextWeekBounds(today: Date): { start: string; end: string } {
  const nextMon = new Date(today);
  nextMon.setDate(today.getDate() + 7);
  return isoWeekBounds(nextMon);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function buildSystemPrompt(now: Date = new Date()): Promise<string> {
  const today = now.toISOString().slice(0, 10);
  const weekday = WEEKDAYS[now.getDay()];
  const week = isoWeekBounds(now);
  const next = nextWeekBounds(now);
  const [semesterLine, lastMeetingLine] = await Promise.all([
    getSemesterLine(),
    getLastMeetingLine(today),
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
    "You are the assistant for ChaptOS, a fraternity chapter ops dashboard. Answer questions about brothers, attendance, deadlines, Instagram, parties, treasury, and budget by calling the provided tools — never make up numbers or names.",
    "SUPERLATIVES (worst/best/biggest/most/top/next): use order_by + order + small limit on the relevant list tool, NOT a status filter.",
    "EMPTY FILTERED RESULT: broaden — drop the filter or switch to a sort — before saying 'none'. Identify the user's underlying intent, not the literal phrasing.",
    "NAMES: get_brother accepts fragments; if multiple match, ask which one.",
    "WRITES: call propose_* tools to surface a confirm card. Never claim you've done it — the user confirms.",
    "WRITE FIELDS: only ask the user for the schema's required fields. Omit optional fields (status, time, location, description, mandatory, paymentMethod, paidTo) unless the user supplied them — defaults handle the rest. Don't re-ask for details the user didn't volunteer.",
    "Be terse. Numbers and names over prose. Skip preamble.",
    dateLine,
  ].join(" ");
}
