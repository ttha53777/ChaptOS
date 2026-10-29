// Read-only: Ask Chapt as a phone sheet (chat-phone.css + chat/usePhoneSheet).
// Stubs the /api/ai/chat SSE stream (no LLM call) and aborts every other
// non-GET /api call (the dev DB is prod).
// tsx --env-file=.env.local scripts/_chat-phone-shot.ts   (BASE=… SLUG=… OUT=… ENGINE=webkit|chromium THEME=dusk|ivory)
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, devices, webkit, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const ENGINE = process.env.ENGINE ?? "webkit";
const THEME = process.env.THEME ?? "dusk";
const DESK = !!process.env.DESK; // desktop regression pass: the centered spotlight must be unchanged
const OUT = process.env.OUT ?? `_screenshots/chat-${DESK ? "desk" : "phone"}-${ENGINE}-${THEME}`;
mkdirSync(OUT, { recursive: true });

const frame = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
const STREAM = [
  frame("step", { id: "0", verb: "Reading the dues ledger", source: "Dues" }),
  frame("step_start", { id: "0" }),
  frame("step_done", { id: "0", finding: "9 of 52 owe · $1,240 open" }),
  frame("step", { id: "1", verb: "Matching names to the roster", source: "Roster" }),
  frame("step_start", { id: "1" }),
  frame("step_done", { id: "1", finding: "9 members" }),
  frame("answer", {
    verdict: "Nine brothers owe *$1,240* — four of them are past the October 1 deadline.",
    rows: [
      { kind: "person", title: "Marcus Hale", subtitle: "Overdue · 28 days", value: "$320", ask: "Tell me about Marcus Hale" },
      { kind: "person", title: "Jordan Kim", subtitle: "Overdue · 28 days", value: "$280", ask: "Tell me about Jordan Kim" },
      { kind: "money", title: "Fall dues", subtitle: "Due Oct 1", value: "$1,240" },
    ],
    follows: [{ label: "Who's on a payment plan?", ask: "Who's on a payment plan?" }, { label: "What did we collect in October?", ask: "What did we collect in October?" }, { label: "Remind them", ask: "Draft a reminder" }],
    sources: ["Dues", "Roster"],
  }),
  frame("proposal", {
    action: "propose_add_deadline", endpoint: "/api/__stub", method: "POST",
    payload: { title: "Pay fall dues", dueDate: "2026-11-07" }, summary: "Add a deadline",
    display: { kind: "timeline", title: "Add a deadline", rows: [{ k: "Title", v: "Pay fall dues", em: true }, { k: "Due", v: "Nov 7, 2026" }] },
    perm: { name: "MANAGE_TASKS", label: "Manage timeline", canApprove: true }, sig: null, iat: Date.now(),
  }),
  frame("done", {}),
].join("");

async function shot(p: Page, n: string) { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); }

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();

  const b = await (ENGINE === "webkit" ? webkit : chromium).launch();
  const ctx = await b.newContext(DESK ? { viewport: { width: 1280, height: 900 } } : { ...devices["iPhone 14"], ...(ENGINE === "chromium" ? { defaultBrowserType: undefined } : {}) });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(admin.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  await ctx.addInitScript(theme => { try { localStorage.setItem("chaptos:theme:v1", theme); localStorage.removeItem("chaptos_chat_v2"); } catch {} }, THEME);
  const p = await ctx.newPage();
  const errs: string[] = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.route(u => u.pathname.startsWith("/api/"), r => {
    const url = new URL(r.request().url());
    if (url.pathname === "/api/ai/chat") {
      return r.request().method() === "GET"
        ? r.fulfill({ json: { enabled: true } })
        : r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: STREAM });
    }
    if (r.request().method() !== "GET") return r.abort();
    // The dev server's pool sometimes 500s /api/auth/me; retry before the page gives up.
    return (async () => {
      for (let i = 0; ; i++) {
        const res = await r.fetch({ timeout: 60000 }).catch(() => null);
        if (res && (res.status() < 500 || i === 5)) return r.fulfill({ response: res });
        if (!res && i === 5) return r.abort();
        await new Promise(z => setTimeout(z, 800));
      }
    })();
  });
  await p.goto(`${BASE}/${SLUG}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await p.waitForSelector(".chat-launcher", { timeout: 120000 }).catch(async e => { await p.screenshot({ path: `${OUT}/00-fail.png` }); throw e; });
  await p.waitForTimeout(1500);

  await p.locator(".chat-launcher").click();
  await p.waitForSelector(DESK ? ".cs-welcome .starter" : ".pl-tkt");
  await shot(p, "01-landing");
  const box = await p.evaluate(() => {
    const s = document.querySelector(".cs-spot")!.getBoundingClientRect();
    return { top: s.top, h: s.height, vh: innerHeight, sw: document.documentElement.scrollWidth, w: innerWidth, fs: getComputedStyle(document.querySelector(".cs-dock textarea")!).fontSize };
  });
  console.log("sheet", box);

  await p.locator(".cs-dock textarea").click();
  await p.waitForTimeout(300);
  await shot(p, "02-landing-focused");
  console.log("kb attr", await p.evaluate(() => document.querySelector(".chat-root")!.hasAttribute("data-kb")));

  await p.locator(".cs-dock textarea").fill("How are we doing on dues?");
  await p.keyboard.press("Enter");
  await p.waitForSelector(".verdict", { timeout: 20000 });
  await p.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await shot(p, "03-answer");
  await p.evaluate(() => { const t = document.querySelector(".cs-thread")!; t.scrollTop = t.scrollHeight; });
  await shot(p, "04-writ");

  await p.locator(".writ .wv.val").first().click();
  await p.waitForTimeout(500);
  await shot(p, "05-writ-edit");
  console.log("dock while editing", await p.evaluate(() => getComputedStyle(document.querySelector(".cs-dock")!).display));
  await p.evaluate(() => (document.activeElement as HTMLElement)?.blur());

  await p.locator(".apprchip").click();
  await p.waitForTimeout(1500);
  await shot(p, "06-approvals");

  await p.locator(".cs-close").click();
  await p.waitForTimeout(500);
  console.log("closed", await p.evaluate(() => !document.querySelector(".cs-spot") && document.body.style.overflow === ""));
  console.log("errors", errs);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
