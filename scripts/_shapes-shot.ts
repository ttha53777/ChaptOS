// Read-only check for Ask Chapt answer shapes: runs the REAL shape builders
// (lib/ai-shapes) against a dev org, then feeds what they built through a stubbed
// /api/ai/chat stream into the real widget and screenshots each one.
// No LLM call, no writes. tsx --env-file=.env.local scripts/_shapes-shot.ts
// (AES=paper|ledger THEME=ivory|dusk W=1280 OUT=… CASES=1-tally,3-week BASE=http://localhost:3100)
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
import { db } from "../lib/db";
import { runTool, SCREEN_PATHS, type AnswerRow } from "../lib/ai-tools";
import { createRefIndex } from "../lib/ai-refs";
import { attachPeople, buildShape, createShapeEvidence } from "../lib/ai-shapes";
import { isoWeekBounds } from "../lib/dates";
import { getPeek } from "../lib/services/peek-service";
import type { RequestContext } from "../lib/context";

const BASE = process.env.BASE ?? "http://localhost:3000";
const CASES = process.env.CASES ? new Set(process.env.CASES.split(",")) : null;
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/shapes";
const THEME = process.env.THEME ?? "ivory";
const AES = process.env.AES ?? "paper";
const W = Number(process.env.W ?? 1280);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
const frame = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;

(async () => {
  mkdirSync(OUT, { recursive: true });
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const scoped = db(org.id);

  // What the model would have read, via the real tools.
  const ev = createShapeEvidence();
  const read = async (name: string, args: Record<string, unknown>) => {
    const r = await runTool(name, args, scoped, org.id);
    ev.add(name, args, r);
    return r;
  };
  const budget = await read("get_budget", {}) as { semester?: string };
  await read("list_brothers", { owes_dues_only: true });
  await read("sum_transactions", { ...(budget.semester ? { semester: budget.semester } : {}), type_filter: "expense", group_by_category: true });
  const SHAPE_WEEK = process.env.WEEK ?? isoWeekBounds(new Date()).start;
  await read("list_calendar_events", { start: SHAPE_WEEK });

  // Not found: a fresh evidence set, as a "beach cleanup" turn would read.
  const evMiss = createShapeEvidence();
  for (const [name, args] of [["list_calendar_events", { title: "beach" }], ["list_service_events", {}], ["list_programming_events", {}]] as const) {
    evMiss.add(name, { ...args }, await runTool(name, { ...args }, scoped, org.id));
  }
  const TERM = process.env.TERM_Q ?? "beach cleanup";
  const missing = await buildShape({ type: "missing", term: TERM }, evMiss, scoped, org.id);
  console.log("missing", missing && missing.shape, missing?.rows.map(r => r.title));
  const tally = await buildShape({ type: "tally", metric: "owes_dues" }, ev, scoped, org.id);
  const brk = await buildShape({ type: "breakdown" }, ev, scoped, org.id);
  const week = await buildShape({ type: "week", start: SHAPE_WEEK }, ev, scoped, org.id);
  console.log("tally", tally && { of: (tally.shape as { of: number }).of, hit: (tally.shape as { hit: number }).hit, rows: tally.rows.length });
  console.log("breakdown", brk && (brk.shape as { parts: unknown[] }).parts);
  console.log("week", week && (week.shape as { items: unknown[] }).items.length, "items from", SHAPE_WEEK);

  // Which one: two real members, as a get_brother multi-match would surface them.
  const roster = await scoped.member.listRoster();
  const pair = roster.slice(0, 2);
  const refs = createRefIndex();
  refs.add("get_brother", { candidates: pair.map(b => ({ id: b.id, name: b.name, role: b.role })) });
  const askback = await attachPeople({ questions: [{ question: "Which one did you mean?", chips: pair.map(b => b.name) }] }, refs, scoped, org.id);

  // Game plan: tiered advice, as an advisory answer sends it (client-only form).
  const planRows = [
    { kind: "generic", title: "Make the next two meetings mandatory", subtitle: "People skip what looks optional. Mark them, and an absence needs an excuse.", tier: "high", screen: SCREEN_PATHS.events },
    { kind: "generic", title: "Close excuses at meeting time", subtitle: "Right now an excuse can be filed days later, so missing costs nothing.", tier: "high", screen: SCREEN_PATHS.settings },
    { kind: "generic", title: "Send a reminder the morning of", subtitle: "One message with the time, the room and what's on the agenda.", tier: "medium", screen: SCREEN_PATHS.tasks },
    { kind: "generic", title: "Put attendance on the dashboard", subtitle: "Members see their own number every time they open the app.", tier: "medium", screen: SCREEN_PATHS.dashboard },
    { kind: "generic", title: "Pair one meeting a month with a dinner", tier: "later", screen: SCREEN_PATHS.events },
    { kind: "generic", title: "Ask the three lowest what gets in the way", tier: "later", screen: SCREEN_PATHS.roster },
  ];
  // By drawer: mixed kinds, each with the ref the route attaches.
  const someEvent = (await scoped.calendarEvent.findFirst({ orderBy: { date: "desc" }, select: { id: true, title: true, date: true } }))!;
  const someTasks = await scoped.task.findMany({ where: { dueDate: { not: null } }, take: 2, select: { id: true, title: true, dueDate: true } });
  const drawerRows = [
    { kind: "event", title: someEvent.title, subtitle: someEvent.date, ref: { type: "event", id: someEvent.id } },
    ...someTasks.map(t => ({ kind: "task", title: t.title, subtitle: `Due ${t.dueDate}`, ref: { type: "task", id: t.id } })),
    { kind: "person", title: roster[0].name, subtitle: roster[0].role, value: `$${roster[0].duesOwed}`, ref: { type: "member", id: roster[0].id } },
  ];

  // ── List forms, built by the real builders from real reads (flag forced on
  // here; the driver never calls the model). Dev events are all in the past,
  // so each form pins its own TODAY where it needs one ahead of it.
  process.env.ASK_CHAPT_FORMS = "1";
  const formRead = async (pairs: Array<[string, Record<string, unknown>]>) => {
    const e = createShapeEvidence();
    for (const [name, args] of pairs) e.add(name, args, await runTool(name, args, scoped, org.id));
    return e;
  };
  const D_TODAY = process.env.DATED_TODAY ?? "2026-06-10";
  const dated = await buildShape({ type: "dated" }, await formRead([
    ["list_deadlines", { start: "2026-05-20", end: "2026-06-30" }],
    ["list_calendar_events", { start: "2026-05-20", end: "2026-06-30" }],
  ]), scoped, org.id, { today: D_TODAY });
  const logbook = await buildShape({ type: "logbook" }, await formRead([["list_calendar_events", { category: "chapter", start: "2026-01-01", end: "2026-06-30" }]]), scoped, org.id);
  const P_TODAY = process.env.PASTDUE_TODAY ?? "2026-07-10";
  const pastdue = await buildShape({ type: "pastdue" }, await formRead([["list_deadlines", { open_only: true, end: "2026-07-09" }]]), scoped, org.id, { today: P_TODAY });
  const brothersEv = await formRead([["list_brothers", {}]]);
  const ranked = await buildShape({ type: "ranked", rank: "service_hours" }, brothersEv, scoped, org.id);
  const table = await buildShape({ type: "table", metrics: ["gpa", "dues_owed", "attendance"] }, brothersEv, scoped, org.id);
  const meetingsEv = await formRead([["list_calendar_events", { category: "chapter", start: "2026-01-01", end: "2026-06-30" }]]);
  const rankedDates = await buildShape({ type: "ranked", rank: "event_attendance" }, meetingsEv, scoped, org.id);
  // The most recent meeting with anyone marked absent, as "who missed chapter?" would read it.
  const missedAt = await scoped.attendanceRecord.findFirst({ where: { attended: false }, orderBy: { calendarEventId: "desc" }, select: { calendarEventId: true } });
  const roll = missedAt ? await buildShape({ type: "roll", split: "excused" }, await formRead([["get_event_attendance", { id: missedAt.calendarEventId }]]), scoped, org.id) : null;
  // Yes or no: "has exec paid?" over five named members; "is X done?" over one task.
  const exec = roster.slice(0, 5).map(b => ({ kind: "person" as const, title: b.name }));
  const yesno = await buildShape({ type: "yesno", test: "dues_paid" }, brothersEv, scoped, org.id, { rows: exec });
  const oneTaskEv = await formRead([["list_deadlines", { open_only: true, end: "2026-07-09" }]]);
  const firstTask = (oneTaskEv.get("list_deadlines")!.result as Array<{ title: string }>)[0];
  const yesnoOne = firstTask ? await buildShape({ type: "yesno", test: "task_done" }, oneTaskEv, scoped, org.id, { rows: [{ kind: "task", title: firstTask.title }], today: P_TODAY }) : null;
  const status = await buildShape({ type: "status" }, await formRead([["list_deadlines", { start: "2026-05-01", end: "2026-06-30" }]]), scoped, org.id, { today: D_TODAY });
  // The record: "when was our last chapter meeting?" — the row's ref, its peek card.
  // The peek service only reads ctx.db, so a context of the scoped client is enough.
  const peekCtx = { db: scoped, orgId: org.id, actorId: admin.brotherId } as unknown as RequestContext;
  const lastMeeting = (await scoped.calendarEvent.findFirst({ where: { category: "chapter" }, orderBy: { date: "desc" }, select: { id: true, title: true, date: true } }))!;
  const record = await buildShape({ type: "record" }, createShapeEvidence(), scoped, org.id, {
    rows: [{ kind: "event", title: lastMeeting.title, value: lastMeeting.date, ref: { type: "event", id: lastMeeting.id } }],
    peek: (type, id) => getPeek(peekCtx, type, id),
  });
  const record2 = await buildShape({ type: "record" }, createShapeEvidence(), scoped, org.id, {
    rows: roster.slice(0, 2).map(b => ({ kind: "person" as const, title: b.name, value: b.role, ref: { type: "member" as const, id: b.id } })),
    peek: (type, id) => getPeek(peekCtx, type, id),
  });
  // Nothing yet: no fundraisers since July (dev data stops at June 1).
  const zero = await buildShape({ type: "zero" }, await formRead([["list_calendar_events", { category: "fundy", start: "2026-07-01" }]]), scoped, org.id, {
    access: { actorId: admin.brotherId, permissions: 0, isOrgAdmin: true, isPlatformAdmin: false },
  });
  console.log("record", !!record, "record2", !!record2, "zero", zero && JSON.stringify(zero.shape));
  console.log("yesno", yesno && JSON.stringify(yesno.shape).slice(0, 120), "yesnoOne", !!yesnoOne, "status", status?.rows.length);
  console.log("ranked", ranked?.rows.length, "table", table?.rows.length, "rankedDates", rankedDates?.rows.length, "roll", roll?.rows.length);
  console.log("dated", dated && dated.rows.length, "logbook", logbook && logbook.rows.map(r => `${r.title}:${r.ref?.id ?? "-"}`).join(", "), "pastdue", pastdue && JSON.stringify(pastdue.shape));

  const ledger = (verb: string, source: string, finding: string) => [
    frame("step", { id: "0", verb, source }), frame("step_start", { id: "0" }), frame("step_done", { id: "0", finding }),
  ].join("");
  const answer = (verdict: string, built: typeof tally, sources: string[], extra: Record<string, unknown> = {}) =>
    frame("answer", { verdict, rows: (built?.rows ?? []).map(wire), follows: [{ label: "Record a payment", ask: "Record a payment" }], sources, ...(built ? { shape: built.shape } : {}), ...extra });
  // What the route's resolveScreen does before the wire.
  function wire(r: AnswerRow) { const { screen, ...rest } = r; return screen ? { ...rest, screen: { ...SCREEN_PATHS[screen] } } : rest; }
  const t = tally?.shape as { hit: number; of: number } | undefined;
  const STREAMS: Record<string, string> = {
    dues: ledger("Reading the roster", "Brotherhood", `${t?.hit ?? 0} owe`) + answer(`*${t?.hit ?? 0} of ${t?.of ?? 0}* still owe dues.`, tally, ["Brotherhood"]),
    money: ledger("Summing spending by category", "Treasury", "by category") + answer("*Most of it* went to the top category.", brk, ["Treasury", "Budget"]),
    week: ledger("Scanning the calendar", "Events", "this week") + answer("Here's *this week*.", week, ["Events", "Tasks"]),
    beach: ledger("Searching the calendar", "Events", "none found") + answer(`I couldn't find a *${TERM}* anywhere.`, missing, ["Events", "Service", "Programming"], { follows: [{ label: "Add it to Programming", ask: `Add ${TERM} to Programming` }] }),
    plan: ledger("Reading attendance", "Attendance", "72% avg") + frame("answer", { verdict: "Start with the *two that cost nothing*.", rows: planRows, follows: [], sources: ["Attendance"] }),
    drawer: ledger("Searching everything", "Timeline", "4 found") + frame("answer", { verdict: "*Four things* in three places.", rows: drawerRows, follows: [], sources: ["Timeline", "Tasks", "Roster"] }),
    dated: ledger("Checking deadlines", "Tasks", "this month") + answer("*A busy June*, and two things are already late.", dated, ["Tasks", "Timeline"]),
    logbook: ledger("Scanning the calendar", "Timeline", "chapter meetings") + answer(`*${logbook?.rows.length ?? 0}* chapter meetings so far this year.`, logbook, ["Timeline"]),
    pastdue: ledger("Checking deadlines", "Tasks", "overdue") + answer(`*${pastdue?.rows.length ?? 0} things* are overdue.`, pastdue, ["Tasks"]),
    ranked: ledger("Reading the roster", "Roster", "service hours") + answer("*Most* have cleared the bar.", ranked, ["Roster"]),
    rankdate: ledger("Reading attendance", "Attendance", "per meeting") + answer("Turnout *dipped late* in the term.", rankedDates, ["Timeline", "Attendance"]),
    table: ledger("Reading the roster", "Roster", "3 measures") + answer("*Mostly fine*, with a few under a bar.", table, ["Roster"]),
    roll: ledger("Checking attendance", "Attendance", "absences") + answer(`*${roll?.rows.length ?? 0}* missed it.`, roll, ["Attendance"]),
    yesno: ledger("Reading the roster", "Roster", "dues") + answer("*Not yet*, one still owes.", yesno, ["Roster", "Dues"]),
    yesone: ledger("Checking deadlines", "Tasks", "1 task") + answer("*No*, it's still open.", yesnoOne, ["Tasks"]),
    status: ledger("Checking deadlines", "Tasks", "May – Jun") + answer("*Most of it* is done; two are stuck.", status, ["Tasks"]),
    record: ledger("Scanning the calendar", "Timeline", "1 found") + answer("It was *on " + lastMeeting.date + "*.", record, ["Timeline"]),
    recpair: ledger("Reading the roster", "Roster", "2 found") + answer("*These two* run it.", record2, ["Roster"]),
    zero: ledger("Scanning the calendar", "Timeline", "none") + answer("*None* filed as fundraisers since July.", zero, ["Timeline"]),
    which: ledger("Looking up the name", "Brotherhood", "2 matches") + frame("answer", { verdict: "There are *two* matches on the roster.", rows: [], follows: [], sources: ["Brotherhood"], askback }),
  };

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: 1000 } });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(admin.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  await ctx.addInitScript(([aes, theme]) => {
    try { localStorage.setItem("chaptos:aesthetic:v1", aes); localStorage.setItem("chaptos:theme:v1", theme); localStorage.removeItem("chaptos_chat_v2"); } catch {}
  }, [AES, THEME]);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", e => { errors.push(String(e)); console.log("PAGEERROR", String(e).slice(0, 400)); });
  p.on("console", m => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 400)); });
  // The Terms wall covers the page for an account that hasn't accepted the
  // current version; read it as accepted here rather than writing an acceptance.
  await p.route("**/api/auth/me", async r => {
    const res = await r.fetch();
    const j = await res.json() as { terms?: { version: string; acceptedVersion: string | null } };
    if (j.terms) j.terms.acceptedVersion = j.terms.version;
    return r.fulfill({ response: res, json: j });
  });
  await p.route("**/api/ai/chat", r => {
    if (r.request().method() === "GET") return r.fulfill({ json: { enabled: true } });
    const body = JSON.parse(r.request().postData() ?? "{}") as { messages?: Array<{ content: string }> };
    const q = (body.messages?.at(-1)?.content ?? "").toLowerCase();
    const key = Object.keys(STREAMS).find(k => q.startsWith(`${k}:`)) ?? Object.keys(STREAMS).find(k => q.includes(k)) ?? "dues";
    return r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: frame("open", {}) + STREAMS[key] + frame("done", {}) });
  });
  await p.goto(`${BASE}/org/${SLUG}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await p.waitForSelector(".chat-launcher", { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.click(".chat-launcher");
  await p.waitForSelector(".cs-spot");

  const SHOTS: ReadonlyArray<readonly [string, string, string]> = [
    ["1-tally", "who owes dues", ".shp-tally"],
    ["2-breakdown", "where did the money go", ".shp-brk"],
    ["3-week", "what's on this week", ".shp-wk"],
    ["4-which", "how is which one doing", ".ab-people"],
    ["5-missing", "did anyone sign up for the beach cleanup", ".shp-miss"],
    ["11-plan", "plan to get attendance up", ".gp"],
    ["8-drawer", "drawer: what do we have on the retreat", ".mx"],
    ["02-dated", "dated: what's on my plate this month", ".shp-td"],
    ["03-logbook", "logbook: how many chapter meetings have we had", ".shp-lg"],
    ["10-pastdue", "pastdue: what's overdue", ".shp-pd"],
    ["01-ranked", "ranked: service hours standings", ".shp-rk"],
    ["01b-ranked-dates", "rankdate: attendance at each meeting", ".rk-rows.by-date"],
    ["06-table", "table: grades dues attendance", ".shp-tb"],
    ["07-roll", "roll: who missed chapter", ".shp-roll"],
    ["13-yesno", "yesno: has exec paid", ".shp-yn"],
    ["13b-yesno-one", "yesone: is the roster update done", ".shp-yn"],
    ["04-status", "status: where are we on spring", ".shp-sx"],
    ["05-record", "record: when was the last chapter meeting", ".shp-recs"],
    ["05b-record-pair", "recpair: who runs dues", ".shp-recs.two"],
    ["12-zero", "zero: how many fundraisers since july", ".shp-zero"],
  ];
  for (const [n, q, sel] of SHOTS.filter(([n]) => !CASES || CASES.has(n))) {
    await p.fill(".cs-dock textarea", q);
    await p.keyboard.press("Enter");
    await p.waitForSelector(sel, { timeout: 20000 }).catch(() => console.log("MISSING", sel, p.url()));
    console.log("after", n, p.url(), await p.locator(".cs-spot").count());
    await p.waitForTimeout(1800);
    await p.evaluate(s => { const all = document.querySelectorAll(s); all[all.length - 1]?.closest(".answer")?.scrollIntoView({ block: "start" }); }, sel);
    await p.waitForTimeout(300);
    await p.locator(".cs-spot").screenshot({ path: `${OUT}/${n}-${AES}-${THEME}-${W}.png` });
    console.log("shot", n);
  }
  // Hover a dot: the tooltip names the member.
  if (!CASES || CASES.has("1-tally")) {
    await p.evaluate(() => document.querySelector(".shp-tally")?.scrollIntoView({ block: "start" }));
    await p.locator(".tl-dot").first().hover();
    await p.waitForTimeout(300);
    console.log("tip:", await p.locator(".tl-tip").textContent().catch(() => null));
  }
  console.log("overflow:", await p.evaluate(() => { const s = document.querySelector(".cs-spot .cs-body, .cs-spot"); return s ? s.scrollWidth - s.clientWidth : null; }));
  console.log("errors", errors);
  await b.close();
  process.exit(0);
})();
