import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
const BASE = "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/prog";
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
  await p.goto(`${BASE}/${SLUG}/events`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  try { await p.waitForSelector(".ev-add", { timeout: 60000 }); } catch { await p.screenshot({ path: `${OUT}/00-fail.png` }); console.log(p.url()); throw new Error("no ev-add"); }
  await p.waitForTimeout(2500);
  const shot = async (n: string) => { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
  const esc = async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(400); };
  await shot("01-page");
  const steps: [string, () => Promise<void>][] = [
    ["02-idea", async () => { await p.click("text=New idea"); }],
    ["03-add", async () => { await p.click("button.ev-add:has-text('New event')"); }],
    ["04-help", async () => { await p.click(".ev-help-btn"); }],
  ];
  for (const [n, f] of steps) { try { await f(); await shot(n); } catch (e) { console.log("fail", n, String(e).slice(0, 200)); } await esc(); await esc(); }
  try { await p.click(".ev-views button:has-text('calendar')"); await shot("05-calendar"); await p.click(".ev-views button:has-text('board')"); } catch (e) { console.log("cal fail", String(e).slice(0,200)); }
  try {
    const card = p.locator("[data-stage] [role=button], .pc-card, .ev-card").first();
    await card.click(); await shot("06-panel");
    console.log(await p.$$eval(".ev-panel .ev-fld-main", els => els.map(e => e.className + " | " + (e.textContent ?? "").slice(0, 30))));
    const own = p.locator(".ev-panel .ev-fld-main", { hasText: "Owner" }).first();
    await own.click(); await p.waitForTimeout(500);
    await p.locator(".ev-panel .ev-ownpick").first().scrollIntoViewIfNeeded().catch(() => {});
    await shot("07-owner");
    await p.locator(".ev-panel .ev-fp").first().scrollIntoViewIfNeeded().catch(() => {});
    await shot("08-fields");
    await p.locator(".ev-panel .ev-fp-add").first().click().catch(() => {});
    await p.locator(".ev-panel .ev-fn").first().scrollIntoViewIfNeeded().catch(() => {});
    await shot("09-newfield");
  } catch (e) { console.log("panel fail", String(e).slice(0,200)); }
  await b.close();
})();
