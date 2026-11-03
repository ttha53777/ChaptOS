// Read-only: /docs day one with the library stubbed empty (GET /api/docs + folders → []).
// Any non-GET to /api/docs is aborted so nothing can write to the shared DB.
// tsx --env-file=.env.local scripts/_docs-dayone-shot.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
const BASE = "http://localhost:3000", SLUG = "lpe", OUT = "_screenshots/docs-d1";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
(async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const b = await chromium.launch();
  const runs: [string, string, string, number][] = [
    ["paper-ivory", "paper", "ivory", 1440], ["paper-dusk", "paper", "dusk", 1440],
    ["paper-390", "paper", "ivory", 390],
  ];
  for (const [name, aes, theme, w] of runs) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    await ctx.addCookies([
      { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE },
      { name: "active_org_id", value: String(org.id), url: BASE },
    ]);
    await ctx.addInitScript(([a, t]) => { try { localStorage.setItem("chaptos:aesthetic:v1", a); localStorage.setItem("chaptos:theme:v1", t); } catch {} }, [aes, theme]);
    const p = await ctx.newPage();
    const errs: string[] = [];
    p.on("pageerror", e => errs.push(String(e)));
    p.on("response", r => { if (r.url().includes("/api/auth/me")) console.log("me", r.status()); });
    await p.route(/\/api\/docs(\/folders)?(\?.*)?$/, r => r.request().method() === "GET" ? r.fulfill({ json: [] }) : r.abort());
    await p.goto(`${BASE}/${SLUG}/docs`, { waitUntil: "domcontentloaded" });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    // /api/auth/me sometimes 500s on the dev pool; reload rather than fail
    for (let tries = 0; ; tries++) {
      try { await p.waitForSelector(".dx1-btn, .dx1-note", { timeout: 30000 }); break; }
      catch { if (tries >= 3) { await p.screenshot({ path: `${OUT}/fail.png` }); throw new Error("no cta"); } await p.reload({ waitUntil: "domcontentloaded" }); }
    }
    await p.waitForTimeout(1500);
    await p.keyboard.press("Escape"); await p.waitForTimeout(800); // the Terms prompt this account hasn't accepted
    await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: w < 600 });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (name === "paper-ivory") {
      await p.keyboard.press("Escape"); await p.waitForTimeout(500);
      await p.locator(".dx1-btn").click({ force: true }); await p.waitForTimeout(1200);
      await p.screenshot({ path: `${OUT}/paper-ivory-add.png` });
    }
    console.log(name, "overflow", over, "errors", errs);
    await ctx.close();
  }
  await b.close();
})();
