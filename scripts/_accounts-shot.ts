// Screenshots Settings → Accounts and the person sheet. Read-only: every write
// (rename, admin, roles, remove) is stubbed.
// Usage: tsx --env-file=.env.local scripts/_accounts-shot.ts <outDir>
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const out = process.argv[2]!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  // A plain member: not an admin, no roles in this org.
  const plain = await prisma.membership.findFirstOrThrow({
    where: { organizationId: org.id, isOrgAdmin: false, archivedAt: null, brother: { roles: { none: { role: { organizationId: org.id } } }, isAdmin: false } },
    select: { brotherId: true },
  });
  await prisma.$disconnect();

  const b = await chromium.launch();
  const errs: string[] = [];
  const writes: string[] = [];
  const runs = [
    { who: "admin", id: admin.brotherId, w: 1440, h: 1000, theme: "ivory" },
    { who: "admin", id: admin.brotherId, w: 1440, h: 1000, theme: "dusk" },
    { who: "admin", id: admin.brotherId, w: 390, h: 844, theme: "ivory" },
    { who: "member", id: plain.brotherId, w: 1440, h: 1000, theme: "ivory" },
  ];
  for (const run of process.env.ONLY ? runs.slice(0, 1) : runs) {
    const ctx = await b.newContext({ viewport: { width: run.w, height: run.h } });
    await ctx.addCookies([
      { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(run.id), url: BASE },
      { name: "active_org_id", value: String(org.id), url: BASE },
    ]);
    await ctx.addInitScript(t => { try { localStorage.setItem("chaptos:theme:v1", t); } catch {} }, run.theme);
    const stub = async (route: import("playwright").Route) => {
      const r = route.request();
      if (r.method() === "GET") return route.continue();
      writes.push(`${r.method()} ${new URL(r.url()).pathname} ${r.postData() ?? ""}`);
      const body = r.postData() ? JSON.parse(r.postData()!) : {};
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ...body }) });
    };
    await ctx.route("**/api/brothers/**", stub);
    await ctx.route("**/api/auth/accounts/**", stub);
    await ctx.route("**/api/auth/me", async route => {
      const res = await route.fetch();
      const json = await res.json();
      if (json?.terms) json.terms.acceptedVersion = json.terms.version;
      return route.fulfill({ response: res, json });
    });
    const p: Page = await ctx.newPage();
    p.on("pageerror", e => errs.push(String(e)));
    p.on("console", msg => { if (msg.type() === "error" && !/Failed to load resource|401/.test(msg.text())) errs.push(msg.text()); });
    await p.goto(`${BASE}/org/${SLUG}/settings?section=accounts`);
    await p.waitForSelector(".ac-row", { timeout: 120_000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await p.waitForTimeout(900);
    const tag = `${run.who}-${run.w}-${run.theme}`;
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    console.log(tag, "page h-overflow", ov, "| rows", await p.locator(".ac-row").count(), "| views", await p.locator(".ac-views").count());
    await p.evaluate(() => document.querySelector(".ac-page")?.scrollIntoView({ block: "start" }));
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/list-${tag}.png` });

    // Open an officer if there is one, else the first row.
    const officer = p.locator(".ac-row:has(.ac-chip:not(.none))").first();
    await ((await officer.count()) ? officer : p.locator(".ac-row").first()).click();
    await p.waitForSelector(".ac-sheet.on");
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}/sheet-${tag}.png` });

    if (run.who === "admin" && run.w === 1440 && run.theme === "ivory") {
      const free = p.locator(".ac-ropt:not(:disabled)[aria-checked=false]").first();
      if (await free.count()) { await free.click(); await p.waitForTimeout(500); }
      await p.screenshot({ path: `${out}/sheet-granted-${tag}.png` });
      const sw = p.locator(".ac-switch:not(:disabled)");
      if (await sw.count()) { await sw.click(); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/sheet-admin-confirm-${tag}.png` }); }
      await p.keyboard.press("Escape");
      const rm = p.locator("text=Remove…");
      if (await rm.count()) { await rm.click(); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/sheet-remove-${tag}.png` }); }
      await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
      await p.waitForTimeout(500);
      console.log("sheet closed:", (await p.locator(".ac-sheet").count()) === 0);
      if (await p.locator(".ac-views").count()) {
        await p.click("text=By area");
        await p.waitForTimeout(400);
        await p.evaluate(() => document.querySelector(".ac-page")?.scrollIntoView({ block: "start" }));
        await p.screenshot({ path: `${out}/area-${tag}.png`, fullPage: true });
        await p.locator(".ac-arow").nth(4).click();
        await p.waitForTimeout(400);
        await p.evaluate(() => document.querySelector(".ac-page")?.scrollIntoView({ block: "start" }));
        await p.screenshot({ path: `${out}/filtered-${tag}.png` });
      }
      await p.evaluate(() => document.querySelector(".ac-mine")?.scrollIntoView({ block: "center" }));
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${out}/mine-${tag}.png` });
    }
    await ctx.close();
  }
  console.log("writes:", writes);
  console.log("errors:", errs);
  await b.close();
}
main().catch(e => { console.error(e); process.exit(1); });
