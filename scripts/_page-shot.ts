// Read-only screenshot of one authed page in a given look.
// PAGE=/treasury WAIT=.tr-x SHOTS="tab:Transactions,..." tsx --env-file=.env.local scripts/_page-shot.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
const BASE = "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/page";
const THEME = process.env.THEME ?? "ivory";
const AES = process.env.AES ?? "paper";
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);
const PAGE = process.env.PAGE ?? "";
const WAIT = process.env.WAIT ?? "main";
const FULL = process.env.FULL === "1";
// SHOTS: ";"-separated steps, each "name=click:<selector>" | "name=scroll:<selector>" | "name=" (just shoot)
const SHOTS = (process.env.SHOTS ?? "").split(";").filter(Boolean);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
(async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  await ctx.addInitScript(([aes, theme]) => {
    try { localStorage.setItem("chaptos:aesthetic:v1", aes); localStorage.setItem("chaptos:theme:v1", theme); } catch {}
  }, [AES, THEME]);
  const p = await ctx.newPage();
  await p.route("**/api/__paperstub", r => r.fulfill({ json: { ok: true } }));
  await p.goto(`${BASE}/${SLUG}${PAGE}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  try { await p.waitForSelector(WAIT, { timeout: 90000 }); } catch { await p.screenshot({ path: `${OUT}/00-fail.png` }); throw new Error("no " + WAIT + " at " + p.url()); }
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/00-page.png`, fullPage: FULL });
  console.log("shot 00-page");
  for (const step of SHOTS) {
    const eq = step.indexOf("="), name = step.slice(0, eq), act = step.slice(eq + 1);
    const i = act.indexOf(":");
    const kind = act.slice(0, i), sel = act.slice(i + 1);
    try {
      if (kind === "click") await p.locator(sel).first().click({ timeout: 8000 });
      else if (kind === "scroll") await p.locator(sel).first().scrollIntoViewIfNeeded({ timeout: 8000 });
      else if (kind === "esc") await p.keyboard.press("Escape");
      else if (kind === "eval") await p.evaluate(sel);
      else if (kind === "y") await p.evaluate(y => { const m = document.querySelector("main.page-ambient, main") as HTMLElement; m.style.scrollBehavior = "auto"; m.scrollTop = Number(y); }, sel);
      await p.waitForTimeout(900);
      if (name) { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: FULL }); console.log("shot", name); }
    } catch (e) { console.log("fail", name, String(e).slice(0, 160)); }
  }
  await b.close();
})();
