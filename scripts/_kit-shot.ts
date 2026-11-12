// Read-only check for the Ask Chapt answer system, phase 1 (the grammar):
// footing, tone, prose as a Note, and the slips. Every answer arrives through a
// stubbed /api/ai/chat stream into the real widget — no LLM call, no writes.
// tsx --env-file=.env.local scripts/_kit-shot.ts
// (THEME=ivory|dusk W=1280 OUT=… CASES=prose,stop BASE=http://localhost:3100)
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
import { SCREEN_PATHS } from "../lib/ai-tools";
import { balanceFigure, membersFigure } from "../lib/ai-shapes-figure";
import { declineShape, stepsFromPlaybook } from "../lib/ai-howto";
import { caseFile } from "../lib/ai-shapes-reasons";
import { quoteFrom } from "../lib/ai-shapes-quote";
import { DEFAULT_THRESHOLDS } from "../lib/thresholds";

const BASE = process.env.BASE ?? "http://localhost:3000";
const CASES = process.env.CASES ? new Set(process.env.CASES.split(",")) : null;
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/kit";
const THEME = process.env.THEME ?? "ivory";
const W = Number(process.env.W ?? 1280);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
const frame = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
const ledger = (verb: string, source: string, finding: string) =>
  frame("step", { id: "0", verb, source }) + frame("step_start", { id: "0" }) + frame("step_done", { id: "0", finding });

// Prose the way the model writes a how-it-works answer: headings, bullets, a
// numbered list, two real controls and one name that isn't a control.
const PROSE = [
  "### Taking it",
  "- During the meeting, `Open check-in` and members check themselves in.",
  "- Afterward, `Mark who attended` from the event.",
  "### Excuses and exemptions",
  "Members file their own `Excuse`, before or after the meeting, and an officer reviews it. Someone away all term gets `Mark exempt…` instead.",
  "1. Only **mandatory** events count.",
  "2. An approved excuse takes that meeting out of the math.",
  "The setting is called `attendanceAtRisk` under the hood.",
].join("\n");

// Phases 2–5: shapes from the REAL pure builders over sample data, so what's
// drawn is exactly what the server would send for these reads.
const admin = { actorId: 1, permissions: 0, isOrgAdmin: true, isPlatformAdmin: false };
const balance = balanceFigure({
  read: { balance: 4210.5, breakdown: { openingBalance: 1200, doorRevenue: 0, income: 6830, expense: 3819.5 } },
  moves: [
    { date: "2026-08-28", amount: 900 }, { date: "2026-09-04", amount: 1500 }, { date: "2026-09-15", amount: -800 },
    { date: "2026-09-29", amount: 1200 }, { date: "2026-10-06", amount: -600 }, { date: "2026-10-14", amount: 2400 },
    { date: "2026-10-20", amount: -1419.5 }, { date: "2026-10-30", amount: -1000 }, { date: "2026-11-03", amount: 830 },
  ],
  today: "2026-11-12", windowStart: "2026-08-24", termLabel: "Fall 26",
});
const members = membersFigure({ joined: [...Array(46).fill("2025-02-01T00:00:00Z"), ...Array(6).fill("2026-09-10T00:00:00Z")], termStart: "2026-08-24", termLabel: "Fall 26", today: "2026-11-12" })!;
const steps = stepsFromPlaybook("custom_metric", { Name: "Study hours", Unit: "hrs", "Goal (per member)": "20", "At Risk below": "8" }, admin)!;
const decline = declineShape("Lambda Phi Epsilon");
const meetings = ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08"].map((date, i) => ({ id: 9000 + i, date }));
const file = caseFile({
  member: { id: 1, name: "Cole Brennan", role: "Member", joinedAt: "2025-01-15T00:00:00Z", duesOwed: 0, serviceHours: 14, gpa: 3.4 },
  thresholds: { ...DEFAULT_THRESHOLDS, attendanceAtRisk: 75, attendanceWatch: 85 },
  meetings,
  records: [...[0, 1, 2, 4, 5].map(i => ({ calendarEventId: 9000 + i, attended: true })), ...[6, 7, 8].map(i => ({ calendarEventId: 9000 + i, attended: false }))],
  excuses: [{ calendarEventId: 9003, status: "approved", reason: "Travel for a family wedding" }],
  mandatory: new Set(meetings.map(m => m.id)), today: "2026-11-12", seeReasons: true,
});
const reasonsRows = [
  { kind: "generic", title: "He's at 63%, twelve points short.", subtitle: "He came to 5 of the 8 meetings that count, against the 75% bar you set.", panel: "gauge" },
  { kind: "generic", title: "Three unexcused misses in a row.", subtitle: "Oct 20, Oct 27 and Nov 3. Before that he hadn't missed one.", panel: "strip" },
  { kind: "generic", title: "Everything else on his record is fine.", subtitle: "Dues are paid and his service is over the goal.", panel: "rest" },
];
const quote = quoteFrom({
  meeting: { id: 9100, title: "Chapter meeting", date: "2026-10-20" },
  minutes: "4. Formal budget. Motion to set the Winter Formal budget at $3,000, venue deposit of $800 due by Nov 10. Seconded by Marcus.",
  summary: { gist: "", decisions: ["Set the Winter Formal budget at $3,000, venue deposit of $800 due by Nov 10"], actions: [
    { id: "a1", text: "Pay the venue deposit · $800", owner: "Priya Nair", brotherId: null, due: "2026-11-10", done: false },
    { id: "a2", text: "Sign the venue contract", owner: "Priya Nair", brotherId: null, due: "2026-10-24", done: true },
  ] },
  quote: "Motion to set the Winter Formal budget at $3,000, venue deposit of $800 due by Nov 10. Seconded by Marcus.",
  decision: 0,
})!;
const card = {
  type: "event", id: 9200, title: "Winter Formal", subtitle: "Sat, Dec 5", date: "2026-12-05",
  facts: [{ k: "Time", v: "8:00 PM", mono: true }, { k: "Location", v: "The Lindell Ballroom" }, { k: "Category", v: "Social" }, { k: "Spent so far", v: "$1,820 · 3 expenses", mono: true }],
  sections: [],
};

const STREAMS: Record<string, string> = {
  figure: ledger("Reading the treasury", "Treasury", "$4,210.50") + frame("answer", { verdict: "You have *$4,210.50*, up $830 this month.", rows: [], follows: [{ label: "Where did October's money go?", ask: "Where did October's money go?" }], sources: ["Treasury"], shape: balance.shape }),
  members: ledger("Reading the roster", "Roster", "52 members") + frame("answer", { verdict: "*52* active members. Six joined this term.", rows: [], follows: [], sources: ["Roster"], shape: members.shape }),
  card: ledger("Scanning the calendar", "Timeline", "1 found") + frame("answer", { verdict: "Formal is *Saturday, Dec 5*, three weeks out.", rows: [{ kind: "event", title: "Winter Formal", value: "Dec 5", ref: { type: "event", id: 9200 } }], follows: [], sources: ["Timeline"], shape: { type: "record", cards: [card] } }),
  steps: ledger("Thinking it through", "ChaptOS help", "custom metrics") + frame("answer", { verdict: "Add it as a *custom metric* in Settings.", rows: [], follows: [{ label: "How do I enter values?", ask: "How do I enter values for it?" }], sources: [], shape: steps.shape }),
  reasons: ledger("Reading attendance", "Attendance", "5 of 8") + frame("answer", { verdict: "Cole is at *63% attendance*, under your 75% bar. It's recent: three straight misses since Oct 20.", rows: reasonsRows, follows: [{ label: "Who else is close to the bar?", ask: "Who else is close to the bar?" }], sources: ["Roster", "Attendance"], shape: { type: "reasons", judgment: "attendance", ...file } }),
  quote: ledger("Reading meeting notes", "Chapter · minutes", "1 meeting") + frame("answer", { verdict: "You *approved $3,000* on Oct 20. The $800 deposit was due Nov 10 and isn't ticked.", rows: quote.rows, follows: [{ label: "Has the deposit been paid?", ask: "Has the deposit been paid?" }], sources: ["Chapter · minutes"], shape: quote.shape }),
  decline: ledger("Thinking it through", "Events", "cookout") + frame("answer", { verdict: "I can't see the weather, but *the cookout is Saturday at 1 PM*.", rows: [], follows: [{ label: "Does the event mention rain?", ask: "Does the cookout event say anything about rain?" }, { label: "What's left to do before it?", ask: "What's left to do before the cookout?" }], sources: ["Events"], shape: decline.shape }),
  clarify: frame("answer", { verdict: "Happy to. *Which part* of Spring 26?", rows: [], follows: [], sources: [], askback: { questions: [{ question: "Which part?", chips: ["Attendance", "Money", "Service"], areas: ["attendance", "money", "service"] }] } }),
  refs: ledger("Reading the roster", "Roster", "3 under") + frame("text", { delta: "### Under the line right now\nCole Brennan, Dev Arora and Maya Lin are under your 75% at-risk line. `Open check-in` at the next meeting to start fresh." }) + frame("note_refs", { refs: [{ text: "Cole Brennan", ref: { type: "member", id: 1 } }, { text: "Dev Arora", ref: { type: "member", id: 2 } }, { text: "Maya Lin", ref: { type: "member", id: 3 } }] }),
  notice: ledger("Reading the treasury", "Treasury", "") + frame("notice", { kind: "error" }) + frame("text", { delta: "\n\n_(Sorry — I hit an error. Try again in a moment.)_" }),
  prose: ledger("Thinking it through", "ChaptOS help", "attendance") + frame("text", { delta: PROSE }),
  answer: ledger("Reading the calendar", "Events", "3 found") + frame("answer", {
    verdict: "*Three things* on before Friday.",
    rows: [
      { kind: "event", title: "Chapter meeting", subtitle: "Tue · 7:00 PM", ask: "Tell me about chapter" },
      { kind: "task", title: "Pay the venue deposit", subtitle: "Due Thu", ask: "Who owns the deposit?" },
      { kind: "event", title: "Cookout", subtitle: "Sat · 1:00 PM", ask: "Tell me about the cookout" },
    ],
    follows: [{ label: "Just the mandatory ones", ask: "Just the mandatory ones" }, { label: "Who owns the deposit?", ask: "Who owns the deposit?" }],
    sources: ["Events", "Tasks"],
  }),
  plan: ledger("Reading attendance", "Attendance", "72% avg") + frame("answer", {
    verdict: "Start with the *two that cost nothing*.",
    rows: [
      { kind: "generic", title: "Make the next two meetings mandatory", subtitle: "An absence then needs an excuse.", tier: "high", screen: SCREEN_PATHS.events },
      { kind: "generic", title: "Put attendance on the dashboard", subtitle: "Members see their own number.", tier: "medium", screen: SCREEN_PATHS.dashboard },
      { kind: "generic", title: "Ask the three lowest what gets in the way", tier: "later", screen: SCREEN_PATHS.roster },
    ],
    follows: [], sources: ["Attendance"],
  }),
  draft: ledger("Drafting a task", "Tasks", "1 draft") + frame("proposal", {
    action: "propose_add_deadline", endpoint: "/api/tasks", method: "POST",
    payload: { title: "Pay the venue deposit", dueDate: "2026-11-13" }, summary: "New task",
    display: { kind: "timeline", title: "New task", rows: [{ k: "Task", v: "Pay the venue deposit", em: true }, { k: "Assigned to", v: "Exec board" }, { k: "Due", v: "Fri, Nov 13" }] },
    perm: { name: "MANAGE_TASKS", label: "Manage tasks", canApprove: true }, sig: null, iat: Date.now(),
  }) + frame("text", { delta: "Drafted a reminder task for the exec board." }),
};

(async () => {
  mkdirSync(OUT, { recursive: true });
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: 1000 } });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(admin.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  await ctx.addInitScript(theme => {
    try { localStorage.setItem("chaptos:theme:v1", theme); } catch {}
  }, THEME);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", e => { errors.push(String(e)); console.log("PAGEERROR", String(e).slice(0, 400)); });
  // Read the Terms wall as accepted rather than writing an acceptance.
  await p.route("**/api/auth/me", async r => {
    const res = await r.fetch();
    const j = await res.json() as { terms?: { version: string; acceptedVersion: string | null } };
    if (j.terms) j.terms.acceptedVersion = j.terms.version;
    return r.fulfill({ response: res, json: j });
  });
  await p.route("**/api/ai/chat", async r => {
    if (r.request().method() === "GET") return r.fulfill({ json: { enabled: true } });
    const body = JSON.parse(r.request().postData() ?? "{}") as { messages?: Array<{ content: string }> };
    const q = (body.messages?.at(-1)?.content ?? "").toLowerCase();
    // fail: the connection drops. stop: the answer never comes, so Stop can land.
    if (q.startsWith("fail:")) return r.abort("failed");
    if (q.startsWith("stop:")) { await new Promise(res => setTimeout(res, 15000)); return r.abort("failed").catch(() => {}); }
    const key = Object.keys(STREAMS).find(k => q.startsWith(`${k}:`)) ?? "answer";
    return r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: frame("open", {}) + STREAMS[key] + frame("done", {}) });
  });
  await p.goto(`${BASE}/org/${SLUG}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await p.waitForSelector(".chat-launcher", { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.click(".chat-launcher");
  await p.waitForSelector(".cs-spot");

  const SHOTS: ReadonlyArray<readonly [string, string, string]> = [
    ["answer", "answer: what's on before friday", ".footing"],
    ["plan", "plan: how do we get attendance up", ".answer.t-chapt"],
    ["prose", "prose: how does attendance work", ".msg.ai .note .kc"],
    ["draft", "draft: remind exec about the deposit", ".slip.t-chapt"],
    ["fail", "fail: what did we spend on rush", ".slip.t-watch"],
    ["stop", "stop: who missed the most meetings", ".slip.dash"],
    ["figure", "figure: what's our balance", ".fg-n"],
    ["members", "members: how many members do we have", ".fg-split"],
    ["card", "card: when is winter formal", ".fc"],
    ["steps", "steps: how do I track study hours", ".sp-l"],
    ["reasons", "reasons: why is cole at risk", ".rz-case"],
    ["quote", "quote: what did we decide about the formal budget", ".qt"],
    ["decline", "decline: will it rain for the cookout", ".dc"],
    ["clarify", "clarify: how did we do last semester", ".ab-areas"],
    ["refs", "refs: who's under the bar", ".msg.ai .note .ent"],
    ["notice", "notice: what did we spend on rush", ".slip.t-watch"],
  ];
  for (const [n, q, sel] of SHOTS.filter(([n]) => !CASES || CASES.has(n))) {
    await p.fill(".cs-dock textarea", q);
    await p.keyboard.press("Enter");
    if (n === "stop") {
      await p.waitForTimeout(1200);
      await p.click(".cs-dock .send.stop");
    }
    const found = await p.waitForSelector(sel, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!found) console.log("MISSING", n, sel);
    await p.waitForTimeout(1500);
    await p.evaluate(s => { const all = document.querySelectorAll(s); all[all.length - 1]?.closest(".msg")?.scrollIntoView({ block: "start" }); }, sel);
    await p.waitForTimeout(300);
    await p.locator(".cs-spot").screenshot({ path: `${OUT}/${n}-${THEME}-${W}.png` });
    if (n === "reasons" || n === "quote") {
      // The case file runs long: a second frame further down.
      await p.evaluate(() => { const t = document.querySelector(".cs-thread"); if (t) t.scrollTop += 560; });
      await p.waitForTimeout(250);
      await p.locator(".cs-spot").screenshot({ path: `${OUT}/${n}-b-${THEME}-${W}.png` });
    }
    console.log("shot", n);
  }
  const kc = await p.locator(".msg.ai .note .kc").allTextContents();
  const code = await p.locator(".msg.ai .note code").allTextContents();
  console.log("keycaps:", kc, "code:", code);
  console.log("overflow:", await p.evaluate(() => { const s = document.querySelector(".cs-thread"); return s ? s.scrollWidth - s.clientWidth : null; }));
  console.log("errors", errors);
  await b.close();
  process.exit(0);
})();
