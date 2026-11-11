// Read-only: the Add sheet's folder picker with the library stubbed (GET /api/docs + folders).
// POST /api/docs/folders is answered locally (tests inline New folder); every other write aborts.
// tsx --env-file=.env.local scripts/_docs-folder-picker-shot.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
const BASE = "http://localhost:3000", SLUG = "lpe", OUT = "_screenshots/docs-fp";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
const now = "2026-11-01T12:00:00.000Z";
const F = (id: number, name: string, extra: object = {}) => ({ id, name, createdAt: now, updatedAt: now, createdById: null, pinnedAt: null, position: null, ...extra });
const FOLDERS = [F(1, "Bylaws & Policy", { pinnedAt: now }), F(2, "Recruitment"), F(3, "Risk Management"), F(4, "Treasury"), F(5, "Philanthropy"), F(6, "Alumni Relations")];
const D = (id: number, title: string, folderId: number | null) => ({ id, title, url: `https://docs.google.com/document/d/${id}`, description: null, ogImage: null, ogTitle: null, faviconUrl: null, embedOk: null, createdAt: now, updatedAt: now, createdById: null, createdByName: "Rob", folderId, pinnedAt: null, position: null });
const DOCS = [D(1, "Constitution", 1), D(2, "Bylaws", 1), D(3, "Rush schedule", 2), D(4, "Bid list", 2), D(5, "Waiver", 3), D(6, "Budget", 4), D(7, "Misc link", null)];
(async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const b = await chromium.launch();
  const runs: [string, string, string, number][] = [["paper-ivory", "paper", "ivory", 1440], ["paper-dusk", "paper", "dusk", 1440], ["ledger", "ledger", "dusk", 1440], ["paper-390", "paper", "ivory", 390]];
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
    await p.route(/\/api\/docs(\/folders)?(\?.*)?$/, r => {
      const u = r.request().url(), meth = r.request().method();
      if (meth === "GET") return r.fulfill({ json: u.includes("/folders") ? FOLDERS : DOCS });
      if (meth === "POST" && u.includes("/folders")) return r.fulfill({ status: 201, json: F(99, JSON.parse(r.request().postData() || "{}").name) });
      return r.abort();
    });
    await p.goto(`${BASE}/org/${SLUG}/docs`, { waitUntil: "domcontentloaded" });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    for (let tries = 0; ; tries++) {
      try { await p.waitForSelector(".dx-section", { timeout: 30000 }); break; }
      catch { if (tries >= 3) { await p.screenshot({ path: `${OUT}/fail.png` }); throw new Error("no sections"); } await p.reload({ waitUntil: "domcontentloaded" }); }
    }
    await p.waitForTimeout(1500);
    await p.keyboard.press("Escape"); await p.waitForTimeout(600);
    if (name === "paper-ivory") await p.screenshot({ path: `${OUT}/page.png` });
    await p.locator(".dx-add:not(.ghost)").first().click({ force: true });
    await p.waitForSelector(".dx-fp");
    await p.locator(".dx-fp-tab", { hasText: "Recruitment" }).click();
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/${name}.png` });
    if (name === "paper-ivory") {
      await p.locator(".dx-fp-add").click();
      await p.keyboard.type("Social");
      await p.screenshot({ path: `${OUT}/${name}-naming.png` });
      await p.keyboard.press("Enter"); await p.waitForTimeout(800);
      const checked = await p.locator(".dx-fp-tab:has(input:checked) .nm").textContent();
      const modalOpen = await p.locator(".dx-fp").count();
      console.log("after create: checked =", checked, "modal open =", modalOpen);
      await p.screenshot({ path: `${OUT}/${name}-created.png` });
    }
    console.log(name, "errors", errs);
    await ctx.close();
  }
  await b.close();
})();
