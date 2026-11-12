// Screenshots Settings → Identity. Read-only: writes to /api/orgs/config and
// /api/orgs/logo are stubbed. Usage: tsx --env-file=.env.local scripts/_identity-shot.ts <outDir>
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page } from "playwright";
import { writeFileSync } from "node:fs";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const out = process.argv[2]!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });

// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  const plain = await prisma.membership.findFirst({ where: { organizationId: org.id, isOrgAdmin: false, archivedAt: null, brother: { roles: { none: {} } } }, select: { brotherId: true } });
  await prisma.$disconnect();
  writeFileSync(`${out}/logo.png`, PNG);

  const b = await chromium.launch();
  const errs: string[] = [];
  const writes: string[] = [];
  async function open(w: number, h: number, theme: string, brotherId: number): Promise<Page> {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addCookies([
      { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(brotherId), url: BASE },
      { name: "active_org_id", value: String(org.id), url: BASE },
    ]);
    await ctx.addInitScript(t => { try { localStorage.setItem("chaptos:theme:v1", t); } catch {} }, theme);
    await ctx.route(/\/api\/orgs\/(config|logo)/, async route => {
      const r = route.request();
      if (r.method() === "GET") return route.continue();
      writes.push(`${r.method()} ${new URL(r.url()).pathname} ${r.method() === "PATCH" ? r.postData() : ""}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, logoUrl: null }) });
    });
    await ctx.route("**/api/auth/me", async route => {
      try {
        const res = await route.fetch();
        const json = await res.json();
        if (json?.terms) json.terms.acceptedVersion = json.terms.version;
        return await route.fulfill({ response: res, json });
      } catch { /* context closed mid-flight */ }
    });
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(String(e)));
    p.on("console", msg => { if (msg.type() === "error" && !/Failed to load resource|401/.test(msg.text())) errs.push(msg.text()); });
    await p.goto(`${BASE}/org/${SLUG}/settings?section=general`);
    await p.waitForSelector(".id-badge h2", { timeout: 120_000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await p.waitForTimeout(900);
    return p;
  }
  const hov = (p: Page) => p.evaluate(() => { const m = document.querySelector("main")!; return m.scrollWidth - m.clientWidth; });

  for (const [w, h, theme] of [[1440, 1000, "ivory"], [1440, 1000, "dusk"], [390, 844, "ivory"]] as const) {
    const p = await open(w, h, theme, admin.brotherId);
    const tag = `${w}-${theme}`;
    await p.screenshot({ path: `${out}/top-${tag}.png` });
    await p.screenshot({ path: `${out}/full-${tag}.png`, fullPage: false });
    console.log(tag, "h-overflow", await hov(p));
    // edits
    await p.locator(".id-tag").filter({ hasText: "Treasury" }).locator(".id-pick", { hasText: "Finances" }).click();
    const hasIg = (await p.locator("#id-ig").count()) > 0;
    if (hasIg) await p.fill("#id-ig", "@new.handle");
    await p.setInputFiles('.id-page input[type="file"]', `${out}/logo.png`);
    await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelector("main")!.scrollTo({ top: 0 }));
    await p.screenshot({ path: `${out}/edited-top-${tag}.png` });
    await p.evaluate(() => document.querySelector(".id-w-group")!.scrollIntoView({ block: "start" }));
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/edited-words-${tag}.png` });
    console.log(tag, "savebar:", await p.textContent(".id-savebar .msg"));
    await p.evaluate(() => document.querySelector(".id-also")!.scrollIntoView({ block: "center" }));
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/bottom-${tag}.png` });
    if (w === 1440 && theme === "ivory") {
      if (hasIg) {
        await p.fill("#id-ig", "bad handle!");
        console.log("bad handle save disabled:", await p.isDisabled(".id-savebar .acts .id-btn:last-child"));
        await p.fill("#id-ig", "new.handle");
      }
      await p.click(".id-savebar .acts .id-btn:last-child");
      await p.waitForSelector(".set-toast", { timeout: 20_000 }).catch(() => {});
      console.log("after save, status:", await p.locator(".set-toast").allTextContents());
    }
    await p.context().close();
  }
  if (plain) {
    const p = await open(1440, 1000, "ivory", plain.brotherId);
    await p.screenshot({ path: `${out}/member-top.png` });
    console.log("member ro-note:", await p.locator(".id-ro-note").count(), "ig step:", await p.locator("#id-ig").count(), "danger:", await p.locator(".id-danger").count());
    await p.evaluate(() => document.querySelector(".id-w-group")!.scrollIntoView({ block: "start" }));
    await p.screenshot({ path: `${out}/member-words.png` });
    await p.context().close();
  } else console.log("no plain member found");
  console.log("writes:", writes);
  console.log("errors:", errs);
  await b.close();
}
main().catch(e => { console.error(e); process.exit(1); });
