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
    const key = Object.keys(STREAMS).find(k => q.includes(k)) ?? "dues";
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
