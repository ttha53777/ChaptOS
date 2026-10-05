// Scratch driver: Instagram page vs the paper mock, same data + same "today". Read-only (all writes stubbed).
// npx tsx scripts/_ig-shot.ts [full|day] [width] [ivory|dusk] [real|mock|both]
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = "http://localhost:3000", SLUG = process.env.SLUG ?? "lpe", OUT = process.env.OUT ?? "_screenshots/ig";
const mode = (process.argv[2] ?? "full") as "full" | "day", width = Number(process.argv[3] ?? 1440), theme = process.argv[4] ?? "ivory", which = process.argv[5] ?? "both";
const TODAY = mode === "full" ? "2026-10-14" : "2026-09-01";
const EV = [[1, "2026-09-03", "Rush info night", "social"], [2, "2026-09-20", "Fall retreat", "chapter"], [3, "2026-10-03", "Philanthropy 5K", "program"], [4, "2026-10-10", "Homecoming tailgate", "social"],
  [5, "2026-10-14", "Chapter meeting", "chapter"], [6, "2026-10-16", "Alumni mixer", "social"], [7, "2026-10-17", "Beach cleanup", "service"], [8, "2026-10-24", "Fall formal", "party"], [9, "2026-11-07", "Philanthropy week kickoff", "program"]]
  .map(([id, date, title, category]) => ({ id, date, title, category }));
const P = (id: number, title: string, type: string, dueDate: string, o: { posted?: string; ev?: number } = {}) =>
  ({ id, title, type, dueDate, status: o.posted ? "posted" : "open", postedDate: o.posted ?? null, calendarEventId: o.ev ?? null });
const POSTS = mode === "day" ? [] : [
  P(1, "Welcome back to campus", "Carousel", "2026-09-02", { posted: "2026-09-02" }), P(2, "Rush week — night one", "Story", "2026-09-03", { posted: "2026-09-03", ev: 1 }),
  P(3, "Fall retreat highlights", "Reel", "2026-09-22", { posted: "2026-09-24", ev: 2 }), P(4, "Meet the exec board", "Carousel", "2026-09-28", { posted: "2026-09-29" }),
  P(5, "Philanthropy 5K — we ran it", "Reel", "2026-10-04", { posted: "2026-10-04", ev: 3 }), P(6, "Homecoming tailgate recap", "Carousel", "2026-10-11", { posted: "2026-10-12", ev: 4 }),
  P(7, "Alumni mixer save-the-date", "Story", "2026-10-09", { ev: 6 }), P(8, "Brother spotlight: Nia Brooks", "Carousel", "2026-10-12"),
  P(9, "Chapter tonight — 7:30, the house", "Story", "2026-10-14", { ev: 5 }), P(10, "Formal: ten days out", "Reel", "2026-10-15", { ev: 8 }),
  P(11, "Beach cleanup needs you", "Carousel", "2026-10-16", { ev: 7 }), P(12, "Fall formal — night of", "Story", "2026-10-24", { ev: 8 }),
  P(13, "Formal photo dump", "Carousel", "2026-10-27", { ev: 8 }), P(14, "Philanthropy week kickoff", "Reel", "2026-11-06", { ev: 9 }),
];
const KILL = "html{scroll-behavior:auto!important} nextjs-portal{display:none!important} *,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}";

async function snapSeq(page: Page, tag: string, s: { row: string; posted: string; month: string; add: string; idea?: string; railSel: string; esc: () => Promise<void> }) {
  const shot = async (n: string) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}/${mode}-${width}-${theme}-${n}-${tag}.png` }); };
  await shot("top");
  if (mode === "day") {
    await page.evaluate(() => (document.querySelector("main") ?? document.scrollingElement)!.scrollTo(0, 400)); await shot("top2");
    await page.locator(s.add).first().click(); await shot("create"); await s.esc();
    if (s.idea) { await page.locator(s.idea).first().click(); await shot("idea"); await s.esc(); }
    return;
  }
  for (const y of [700, 1400, 2100]) { await page.evaluate(y => { const m = document.querySelector("main.igp-main") as HTMLElement | null; (m ?? document.scrollingElement!).scrollTo(0, y); }, y); await shot(`s${y}`); }
  await page.locator(s.row).first().click(); await shot("rail"); await s.esc();
  await page.locator(s.posted).first().click(); await shot("rail-posted");
  await page.locator(`${s.railSel} :is(.igp-btn.ghost, .btn--ghost)`).first().click(); await shot("rail-edit"); await s.esc(); await s.esc();
  await page.locator(s.month).click(); await page.waitForTimeout(200);
  await page.evaluate(() => { const c = document.querySelector("#igp-month, .ig-mh"); c?.scrollIntoView({ block: "start" }); }); await shot("month");
  await page.locator(s.add).first().click(); await shot("create"); await s.esc();
}

async function real(browser: import("playwright").Browser) {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addCookies([{ name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE }, { name: "active_org_id", value: String(org.id), url: BASE }]);
  await ctx.addInitScript(([th]) => { try { localStorage.setItem("chaptos:aesthetic:v1", "paper"); localStorage.setItem("chaptos:theme:v1", th); } catch {} }, [theme]);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T17:00:00Z`));
  page.on("pageerror", e => console.log("PAGEERROR", e.message));
  await page.route("**/api/instagram**", r => r.request().method() === "GET" ? r.fulfill({ json: POSTS }) : r.abort());
  await page.route("**/api/calendar", r => r.fulfill({ json: EV }));
  await page.route("**/api/auth/me", async r => { const res = await r.fetch(); const j = await res.json(); if (j.org) { j.org.instagramHandle = "oozmakappa"; j.org.timeZone = "America/New_York"; } await r.fulfill({ response: res, json: j }); });
  await page.goto(`${BASE}/${SLUG}/instagram`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.addStyleTag({ content: KILL });
  await page.waitForSelector(mode === "day" ? ".igp-empty" : ".igp-measures", { timeout: 40_000 }).catch(async e => { await page.screenshot({ path: `${OUT}/fail.png` }); console.log(await page.locator("main").innerText().catch(() => "")); throw e; }); await page.evaluate(([th, aes]) => { document.documentElement.dataset.theme = th; document.documentElement.dataset.aesthetic = aes; }, [theme, process.env.AES ?? "paper"]); // fake clock trips a hydration re-render that drops the boot attrs
  await page.waitForTimeout(800);
  console.log("real overflow", await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await snapSeq(page, "real", { row: ".igp-ln-overdue .igp-row-open", posted: ".igp-ln-posted .igp-row-open", month: ".igp-tabs button:nth-child(2)", add: ".igp-head-actions .igp-btn, .igp-empty .igp-btn", idea: ".igp-ideas button", railSel: ".igp-rail",
    esc: async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(250); } });
  await ctx.close();
}

async function mock(browser: import("playwright").Browser) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript(([th]) => { try { if (th === "dusk") localStorage.setItem("paper-mock-theme", "dark"); } catch {} }, [theme]);
  const page = await ctx.newPage();
  await page.goto("file:///Users/thalhat/figurints/_design/Dashboard%20Paper%20Mock.html#instagram");
  await page.addStyleTag({ content: KILL + " .mockbar,.mock-strip,[class*=mockstrip]{display:none!important}" });
  await page.waitForTimeout(800);
  if (mode === "day") { await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Day one")?.click()); await page.waitForTimeout(500); }
  await snapSeq(page, "mock", { row: ".ig-row.ln-overdue", posted: ".ig-row.ln-posted", month: '[data-ig="view:month"]', add: '[data-ig="new:"]', idea: '[data-ig^="idea:"]', railSel: ".ig-rail",
    esc: async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(250); } });
  await ctx.close();
}

(async () => {
  (await import("node:fs")).mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  if (which !== "mock") await real(browser);
  if (which !== "real") await mock(browser);
  await browser.close();
})();
