// Read-only: Ask Chapt spotlight shots for the desktop paper restyle
// (docs/ask-chapt-paper-desktop-plan.md). Stubs the /api/ai/chat SSE stream
// (no LLM call) and aborts every other non-GET /api call (the dev DB is prod).
// tsx --env-file=.env.local scripts/_chat-desk-paper-shot.ts
//   MODE=phone|desk  THEME=ivory|dusk  OUT=dir  FRAMES=1 (desk: slowed flight frames)
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, devices, webkit, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const MODE = process.env.MODE ?? "phone";
const DESK = MODE === "desk";
const THEME = process.env.THEME ?? "ivory";
const WIDTH = Number(process.env.WIDTH ?? 1440);
const OUT = process.env.OUT ?? `_screenshots/paper-desk/${MODE}-${THEME}`;
const FRAMES = !!process.env.FRAMES;
mkdirSync(OUT, { recursive: true });

const frame = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
const ANSWER = frame("answer", {
  verdict: "Nine brothers owe *$1,240* — four of them are past the October 1 deadline.",
  rows: [
    { kind: "person", title: "Marcus Hale", subtitle: "Overdue · 28 days", value: "$320", ask: "Tell me about Marcus Hale" },
    { kind: "person", title: "Jordan Kim", subtitle: "Overdue · 28 days", value: "$280", ask: "Tell me about Jordan Kim" },
    { kind: "money", title: "Fall dues", subtitle: "Due Oct 1", value: "$1,240" },
  ],
  follows: [{ label: "Who's on a payment plan?", ask: "Who's on a payment plan?" }, { label: "What did we collect in October?", ask: "What did we collect in October?" }, { label: "Remind them", ask: "Draft a reminder" }],
  sources: ["Dues", "Roster"],
});
const STEPS = [
  frame("step", { id: "0", verb: "Reading the dues ledger", source: "Dues" }),
  frame("step_start", { id: "0" }),
  frame("step_done", { id: "0", finding: "9 of 52 owe · $1,240 open" }),
  frame("step", { id: "1", verb: "Matching names to the roster", source: "Roster" }),
  frame("step_start", { id: "1" }),
  frame("step_done", { id: "1", finding: "9 members" }),
].join("");
const PROPOSAL = frame("proposal", {
  action: "propose_add_deadline", endpoint: "/api/__stub", method: "POST",
  payload: { title: "Pay fall dues", dueDate: "2026-11-07" }, summary: "Add a deadline",
  display: { kind: "timeline", title: "Add a deadline", rows: [{ k: "Title", v: "Pay fall dues", em: true }, { k: "Due", v: "Nov 7, 2026" }] },
  perm: { name: "MANAGE_TASKS", label: "Manage timeline", canApprove: true }, sig: null, iat: Date.now(),
});
const STREAM = STEPS + ANSWER + PROPOSAL + frame("done", {});

async function shot(p: Page, n: string, wait = 700) { await p.waitForTimeout(wait); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); }

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();

  const b = await (DESK ? chromium : webkit).launch();
  const ctx = await b.newContext(DESK ? { viewport: { width: WIDTH, height: 900 }, ...(process.env.REDUCED ? { reducedMotion: "reduce" as const } : {}) } : { ...devices["iPhone 14"] });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(admin.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  await ctx.addInitScript(theme => { try { localStorage.setItem("chaptos:theme:v1", theme); } catch {} }, THEME);
  const p = await ctx.newPage();
  if (DESK && p.viewportSize()?.width !== WIDTH) throw new Error("viewport not applied");
  const errs: string[] = [];
  p.on("pageerror", e => errs.push(e.message));
  // `hold` lets a test keep the stream open (New mid-stream), `slow` delays the answer.
  let mode: "full" | "hold" | "slow" = "full";
  await p.route(u => u.pathname.startsWith("/api/"), async r => {
    const url = new URL(r.request().url());
    if (url.pathname === "/api/ai/chat") {
      if (r.request().method() === "GET") return r.fulfill({ json: { enabled: true } });
      if (mode === "slow") { await new Promise(z => setTimeout(z, 8000)); return r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: STEPS }).catch(() => {}); }
      if (mode === "hold") return r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: STEPS + frame("step", { id: "2", verb: "Checking payment plans", source: "Dues" }) + frame("step_start", { id: "2" }) }).catch(() => {});
      return r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: STREAM });
    }
    // NOMEET=1: an org with no chapter meeting yet (the desktop welcome's day-one question).
    if (process.env.NOMEET && url.pathname === "/api/calendar" && url.searchParams.get("take")) return r.fulfill({ json: [] });
    if (r.request().method() !== "GET") return r.abort();
    for (let i = 0; ; i++) {
      const res = await r.fetch({ timeout: 60000 }).catch(() => null);
      if (res && (res.status() < 500 || i === 5)) return r.fulfill({ response: res });
      if (!res && i === 5) return r.abort();
      await new Promise(z => setTimeout(z, 800));
    }
  });
  await p.goto(`${BASE}/${SLUG}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal,.ui-modal{display:none!important} .wl-time,.wl-elapsed{visibility:hidden!important}" }).catch(() => {});
  await p.waitForSelector(".chat-launcher", { timeout: 120000 }).catch(async e => { await p.screenshot({ path: `${OUT}/00-fail.png` }); throw e; });
  await p.waitForFunction(() => !document.querySelector(".fls-splash"), null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);

  const field = ".cs-spot textarea";
  const overflow = () => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, spotSw: document.querySelector(".cs-spot")?.scrollWidth, spotW: document.querySelector(".cs-spot")?.clientWidth }));

  await p.locator(".chat-launcher").click({ force: true });
  await p.waitForSelector(".cs-spot textarea");
  await p.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await shot(p, "01-welcome", 900);
  if (DESK) {
    const t0 = Date.now();
    await p.waitForFunction(() => document.querySelectorAll(".try").length === 3, null, { timeout: 30000 }).catch(() => {});
    console.log("starters", `(${Date.now() - t0}ms)`, JSON.stringify(await p.evaluate(() => [...document.querySelectorAll(".try")].map(b => b.textContent))));
    await shot(p, "01b-welcome", 600);
    // Reopen in the same browser: the remembered answer should show the third row at once.
    await p.keyboard.press("Escape");
    await p.waitForTimeout(400);
    await p.locator(".chat-launcher").click({ force: true });
    await p.waitForSelector(".try");
    console.log("reopen rows at first paint", await p.evaluate(() => document.querySelectorAll(".try").length));
  }
  console.log("welcome overflow", await overflow(), "spot", await p.evaluate(() => { const r = document.querySelector(".cs-spot")!.getBoundingClientRect(); return { w: r.width, h: r.height }; }));

  if (DESK && FRAMES) {
    // Slow every animation to 12% and grab the flight, with the stream held open
    // (no answer) so the first turn stays in view. Typed first, then a tapped row.
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Animation.enable");
    mode = "hold";
    for (const [tag, go] of [
      ["typed", async () => { await p.locator(field).fill("How are we doing on dues?"); await p.keyboard.press("Enter"); }],
      ["tapped", async () => { await p.locator(".try").nth(1).click(); }],
    ] as const) {
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.12 });
      await go();
      let t0 = 0;
      for (const t of [80, 700, 1500, 2600, 4000, 6500]) { await p.waitForTimeout(t - t0); t0 = t; await p.screenshot({ path: `${OUT}/02-${tag}-${String(t).padStart(4, "0")}.png` }); console.log("shot", tag, t); }
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
      await p.locator(".newq").click();
      await p.waitForSelector(".try");
      await p.waitForTimeout(900);
      console.log("send after New", await p.evaluate(() => document.querySelector(".cs-spot .composer .send")?.className));
    }
    console.log("errors", errs);
    await b.close();
    return;
  }
  await p.locator(field).fill("How are we doing on dues?");
  await p.keyboard.press("Enter");
  // Scripted (WAAPI) animations right after asking: the flight, or none under reduced motion.
  console.log("thread / flight anims after 60ms", await p.waitForTimeout(60).then(() => p.evaluate(() => [!!document.querySelector(".cs-thread"), document.getAnimations().filter(a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length])));
  await p.waitForSelector(".verdict", { timeout: 20000 });
  await p.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const t = document.querySelector(".cs-thread")!; t.scrollTop = 0; });
  await shot(p, "03-answer", 300);
  await p.evaluate(() => { const t = document.querySelector(".cs-thread")!; t.scrollTop = t.scrollHeight; });
  await shot(p, "04-footing");
  console.log("thread overflow", await overflow(), "spot h", await p.evaluate(() => document.querySelector(".cs-spot")!.getBoundingClientRect().height));

  await p.locator(".apprchip").click();
  await p.waitForTimeout(1500);
  await shot(p, "06-approvals");

  // New mid-stream: the stream stays open, press New, the send must be an arrow again.
  if (DESK) {
    await p.locator(".newq").click().catch(() => {});
    await p.waitForTimeout(400);
    mode = "slow";
    await p.locator(field).fill("Who still owes?");
    await p.keyboard.press("Enter");
    await p.waitForTimeout(1200);
    await shot(p, "07-midstream", 0);
    console.log("send mid-stream", await p.evaluate(() => document.querySelector(".cs-spot .composer .send")?.className));
    await p.locator(".newq").click();
    await p.waitForTimeout(600);
    await shot(p, "08-after-new", 0);
    console.log("send after New", await p.evaluate(() => { const s = document.querySelector(".cs-spot .composer button[type=submit], .cs-spot .composer .send"); return s ? { cls: s.className, label: s.getAttribute("aria-label") } : null; }));
    mode = "full";
  }
  console.log("errors", errs);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
