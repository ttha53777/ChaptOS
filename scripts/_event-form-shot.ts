// Read-only: the timeline's Add event form vs _design/Event Details Paper Mock.html.
// Every API write is aborted — the dev DB is shared with prod.
// THEME=ivory W=1440 H=900 OUT=… tsx --env-file=.env.local scripts/_event-form-shot.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import path from "node:path";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/event-form";
const THEME = process.env.THEME ?? "ivory";
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);
const ONLY = process.env.ONLY; // "app" | "mock"

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
(async () => {
  const b = await chromium.launch();

  if (ONLY !== "app") {
    const mp = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
    await mp.goto("file://" + path.resolve("_design/Event Details Paper Mock.html"));
    await mp.waitForTimeout(600);
    await mp.fill("#title", "Homecoming Tailgate");
    await mp.screenshot({ path: `${OUT}/mock-1.png` });
    await mp.click("#tab2"); await mp.waitForTimeout(700);
    await mp.screenshot({ path: `${OUT}/mock-2-empty.png` });
    await mp.click('.kind[data-add="checklist"]'); await mp.waitForTimeout(700);
    await mp.click('.kind[data-add="budget"]'); await mp.waitForTimeout(700);
    await mp.screenshot({ path: `${OUT}/mock-2-two.png` });
    console.log("mock shots done");
  }
  if (ONLY === "mock") { await b.close(); return; }

  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  await ctx.addInitScript(([theme]) => {
    try { localStorage.setItem("chaptos:aesthetic:v1", "paper"); localStorage.setItem("chaptos:theme:v1", theme); } catch {}
  }, [THEME]);
  const p = await ctx.newPage();
  p.on("pageerror", e => console.log("pageerror", String(e)));
  await p.route(u => u.pathname.startsWith("/api/"), r => {
    const method = r.request().method();
    return method === "GET" || method === "HEAD" ? r.continue() : r.abort();
  });
  await p.goto(`${BASE}/${SLUG}/timeline`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  const add = p.locator("button:visible", { hasText: /^\s*Add Event\s*$/i }).first();
  await add.waitFor({ timeout: 90000 });
  for (let i = 0; i < 10 && !(await p.locator(".cef-sheet").count()); i++) { await add.click().catch(() => {}); await p.waitForTimeout(700); }
  await p.waitForSelector(".cef-sheet", { timeout: 30000 });
  await p.waitForTimeout(800);
  await p.fill("#event-title", "Homecoming Tailgate");
  await p.screenshot({ path: `${OUT}/app-1.png` });
  await p.locator(".cef-tabs [role=tab]").nth(1).click(); await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/app-2-empty.png` });
  await p.locator(".edt-kind", { hasText: "Checklist" }).click(); await p.waitForTimeout(700);
  await p.locator(".edt-kind", { hasText: "Budget" }).click(); await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/app-2-two.png` });
  // mid-animation frames: a detail sliding off, then the turn back to page 1
  await p.locator(".edt-fld.open .edt-ib.rm").click(); await p.waitForTimeout(140);
  console.log("bye class:", await p.locator(".edt-fld.bye").count());
  await p.screenshot({ path: `${OUT}/anim-bye.png` });
  await p.waitForTimeout(500);
  console.log("details after remove:", await p.locator(".edt-fld").count());
  await p.locator(".cef-tabs [role=tab]").nth(0).click(); await p.waitForTimeout(120);
  await p.screenshot({ path: `${OUT}/anim-turn.png` });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/app-1-after.png` });
  console.log("app shots done");
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
