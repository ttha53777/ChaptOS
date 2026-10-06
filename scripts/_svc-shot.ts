import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
const BASE = "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/svc";
const THEME = process.env.THEME ?? "ivory";
const AES = process.env.AES ?? "paper";
const W = Number(process.env.W ?? 1440);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
(async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: 900 } });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  await ctx.addInitScript(([aes, theme]) => {
    try { localStorage.setItem("chaptos:aesthetic:v1", aes); localStorage.setItem("chaptos:theme:v1", theme); } catch {}
  }, [AES, THEME]);
  const p = await ctx.newPage();
  // Read-only: forms are opened and screenshotted, never submitted.
  await p.goto(`${BASE}/${SLUG}/service`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  const root = AES === "paper" ? ".psv-page" : ".svc-briefing";
  await p.waitForSelector(root, { timeout: 60000 });
  const t0 = Date.now();
  p.on("response", r => { if (r.url().includes("/participation")) console.log("part", r.status(), Date.now() - t0, "ms"); });
  await p.waitForTimeout(Number(process.env.WAIT ?? 2500));
  const shot = async (n: string, full = false) => { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${AES}-${THEME}-${W}-${n}.png`, fullPage: full }); console.log("shot", n); };
  const esc = async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(400); };
  await shot("01-page");
  if (AES !== "paper") { await b.close(); return; }
  const steps: [string, () => Promise<void>][] = [
    ["02-open", async () => { await p.locator(".psv-head").last().click(); await p.waitForTimeout(1500); await p.locator(".psv-ev.open").scrollIntoViewIfNeeded(); }],
    ["03-new", async () => { await p.click(".psv-acts-top .psv-btn:has-text('New service event')"); }],
    ["04-log", async () => { await p.click(".psv-ev.open .psv-btn:has-text('Log hours')"); }],
    ["05-mine", async () => { await p.click(".psv-acts-top .psv-btn:has-text('Log my hours')"); }],
    ["06-members", async () => { await p.click(".psv-tabs button:has-text('Members')"); }],
    ["07-member", async () => { await p.locator(".psv-card").first().click(); await p.waitForTimeout(2000); }],
  ];
  for (const [n, f] of steps) { try { await f(); await shot(n); } catch (e) { console.log("fail", n, String(e).slice(0, 200)); } if (n !== "02-open" && n !== "06-members") { await esc(); } }
  await b.close();
})();
