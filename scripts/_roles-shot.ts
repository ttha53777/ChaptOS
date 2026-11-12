// Screenshots Settings → Roles and the role sheet. Read-only: every write to
// /api/roles is stubbed. Usage: tsx --env-file=.env.local scripts/_roles-shot.ts <outDir>
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = process.env.BASE ?? "http://localhost:3100";
const SLUG = process.env.SLUG ?? "lpe";
const out = process.argv[2]!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();

  const b = await chromium.launch();
  const errs: string[] = [];
  const writes: string[] = [];
  const runs = [[1440, 1000, "ivory"], [1440, 1000, "dusk"], [390, 844, "ivory"]] as const;
  for (const [w, h, theme] of process.env.ONLY ? runs.slice(0, 1) : runs) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addCookies([
      { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE },
      { name: "active_org_id", value: String(org.id), url: BASE },
    ]);
    await ctx.addInitScript(t => { try { localStorage.setItem("chaptos:theme:v1", t); } catch {} }, theme);
    await ctx.route("**/api/roles**", async route => {
      const r = route.request();
      if (r.method() === "GET") return route.continue();
      writes.push(`${r.method()} ${new URL(r.url()).pathname} ${r.postData() ?? ""}`);
      const body = r.postData() ? JSON.parse(r.postData()!) : {};
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 999999, isSystem: false, memberCount: 0, ...body }) });
    });
    // The Terms gate would cover the page; mark them accepted in the response
    // rather than clicking "I agree" (a real write).
    await ctx.route("**/api/auth/me", async route => {
      const res = await route.fetch();
      const json = await res.json();
      if (json?.terms) json.terms.acceptedVersion = json.terms.version;
      return route.fulfill({ response: res, json });
    });
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(String(e)));
    p.on("console", msg => { if (msg.type() === "error" && !/Failed to load resource|401/.test(msg.text())) errs.push(msg.text()); });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    await p.goto(`${BASE}/org/${SLUG}/settings?section=roles`);
    await p.waitForSelector(".rp-card", { timeout: 120_000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await p.waitForTimeout(800);
    const tag = `${w}-${theme}`;
    await p.screenshot({ path: `${out}/list-${tag}.png` });

    // Create
    await p.click(".rp-bar .rp-btn");
    await p.waitForSelector(".rs");
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}/create-${tag}.png` });
    const tpl = p.locator(".rs-tpl:not(.blank)").first();
    if (await tpl.count()) await tpl.click();
    await p.waitForTimeout(300);
    const body = p.locator(".ui-modal-body");
    const scrollTo = async (sel: string) => {
      await p.evaluate(s => document.querySelector(s)?.scrollIntoView({ block: "start" }), sel);
      await p.waitForTimeout(350);
    };
    await scrollTo(".rs-step:nth-of-type(3)");
    await p.locator(".rs-pg").nth(4).hover();
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${out}/create-perms-${tag}.png` });
    await scrollTo(".rs-ladder");
    await p.screenshot({ path: `${out}/create-ladder-${tag}.png` });
    const ov = await body.evaluate(el => el.scrollWidth - el.clientWidth);
    console.log(tag, "modal h-overflow", ov, "| save:", await p.textContent(".rs-foot .rs-btn:last-child"), "| sum:", await p.textContent(".rs-sum"));

    if (w === 1440 && theme === "ivory") {
      // custom color via hex, then a gap on the ladder, then create (stubbed)
      await scrollTo(".rs-sws");
      await p.fill(".rs-hex input", "D9480F");
      await p.waitForTimeout(200);
      await p.screenshot({ path: `${out}/create-color.png` });
      const gap = p.locator(".rs-gap").first();
      if (await gap.count()) await gap.click();
      await p.click(".rs-foot .rs-btn:last-child");
      await p.waitForTimeout(800);
      console.log("sheet open after create:", await p.locator(".rs").count());

      // Discard guard
      await p.click(".rp-bar .rp-btn");
      await p.waitForSelector(".rs");
      await p.fill("#rs-name", "Temp");
      console.log("before esc: rs", await p.locator(".rs").count(), "focus", await p.evaluate(() => document.activeElement?.id || document.activeElement?.className));
      await p.keyboard.press("Escape");
      console.log("after esc: rs", await p.locator(".rs").count());
      await p.waitForTimeout(200);
      console.log("confirm:", await p.textContent(".rs-sum"));
      await p.screenshot({ path: `${out}/discard.png` });
      await p.click(".rs-foot .rs-btn.danger");
      await p.waitForTimeout(300);

      // Edit an existing (non-system) role
      const rows = p.locator(".rp-card-name");
      const n = await rows.count();
      for (let i = 0; i < n; i++) {
        if (/^Treasurer/.test((await rows.nth(i).innerText()).trim())) { await rows.nth(i).click(); break; }
      }
      await p.waitForSelector(".rs");
      await p.waitForTimeout(600);
      await p.screenshot({ path: `${out}/edit.png` });
      console.log("edit save disabled until change:", await p.locator(".rs-foot .rs-btn:last-child").isDisabled());
      await p.locator(".rs-pg:not([aria-pressed=true])").first().click();
      console.log("after toggle disabled:", await p.locator(".rs-foot .rs-btn:last-child").isDisabled());
      await p.click(".rs-foot .rs-btn:last-child");
      await p.waitForTimeout(600);
      // System role
      for (let i = 0; i < n; i++) {
        if (/^President/.test((await rows.nth(i).innerText()).trim())) { await rows.nth(i).click(); break; }
      }
      await p.waitForSelector(".rs");
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${out}/system.png` });
    }
    await ctx.close();
  }
  console.log("writes (stubbed):", writes);
  console.log("errors:", errs);
  await b.close();
}
main();
