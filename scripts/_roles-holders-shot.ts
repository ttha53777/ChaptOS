// Screenshots Settings → Roles (cards, register, picker, toast). Read-only: role
// grants/revokes and /api/roles writes are stubbed. Usage:
//   BASE=http://localhost:3000 npx tsx --env-file=.env.local scripts/_roles-holders-shot.ts <outDir>
// IMP=<brotherId> impersonates someone other than the first org admin.
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
  const m = process.env.IMP
    ? { brotherId: Number(process.env.IMP) }
    : await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
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
    await ctx.addInitScript(t => { try { localStorage.setItem("chaptos:theme:v1", t); localStorage.removeItem("chaptos:roles-view:v1"); } catch {} }, theme);
    const stub = async (route: import("playwright").Route) => {
      const r = route.request();
      if (r.method() === "GET") return route.continue();
      writes.push(`${r.method()} ${new URL(r.url()).pathname} ${r.postData() ?? ""}`);
      if (r.method() === "DELETE") return route.fulfill({ status: 204, body: "" });
      return route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
    };
    await ctx.route("**/api/roles**", stub);
    await ctx.route("**/api/brothers/*/roles**", stub);
    await ctx.route("**/api/auth/me", async route => {
      const res = await route.fetch();
      const json = await res.json();
      if (json?.terms) json.terms.acceptedVersion = json.terms.version;
      return route.fulfill({ response: res, json });
    });
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(String(e)));
    p.on("console", msg => { if (msg.type() === "error" && !/Failed to load resource|401/.test(msg.text())) errs.push(msg.text()); });
    await p.goto(`${BASE}/org/${SLUG}/settings?section=roles`);
    await p.waitForSelector(".rp-card", { timeout: 120_000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await p.waitForTimeout(900);
    const tag = `${w}-${theme}`;
    const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    console.log(tag, "cards", await p.locator(".rp-card").count(), "locked", await p.locator(".rp-card.locked").count(), "overflow", await overflow());
    await p.screenshot({ path: `${out}/cards-${tag}.png` });
    if (w === 1440 && theme === "ivory") {
      await p.evaluate(() => { document.querySelectorAll<HTMLElement>(".set-page, main").forEach(el => { el.style.overflow = "visible"; el.style.height = "auto"; }); });
      await p.screenshot({ path: `${out}/cards-full.png`, fullPage: true });
    }

    // Picker from a card
    const add = p.locator(".rp-add-line").first();
    if (await add.count()) {
      await add.click();
      await p.waitForSelector(".rp-pick");
      await p.waitForTimeout(500);
      const opt = p.locator(".rp-opt:not([aria-selected=true])").first();
      await opt.click();
      await p.waitForTimeout(400);
      console.log(tag, "ticked:", await p.locator(".rp-opt[aria-selected=true]").count(), "| sum:", await p.textContent(".rp-pick-sum"));
      await p.screenshot({ path: `${out}/picker-${tag}.png` });
      await p.click(".rp-pick-foot .rp-btn");
      await p.waitForTimeout(500);
    }

    // Remove from a card → toast with Undo
    const x = p.locator(".rp-x").first();
    if (await x.count()) {
      await x.click();
      await p.waitForSelector(".rp-toast.show");
      await p.waitForTimeout(500);
      console.log(tag, "toast:", await p.textContent(".rp-toast .m"));
      await p.screenshot({ path: `${out}/toast-${tag}.png` });
      await p.click(".rp-toast button");
      await p.waitForTimeout(400);
    }

    // By person
    await p.click(".rp-views button:nth-child(2)");
    await p.waitForTimeout(500);
    console.log(tag, "rows", await p.locator(".rp-prow").count(), "overflow", await overflow());
    await p.screenshot({ path: `${out}/people-${tag}.png` });
    const pill = p.locator(".rp-add-pill").first();
    if (await pill.count()) {
      await pill.click();
      await p.waitForSelector(".rp-pick");
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${out}/picker-person-${tag}.png` });
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
    }
    await ctx.close();
  }
  await b.close();
  console.log("writes (all stubbed):\n " + writes.join("\n "));
  console.log("errors:", errs.length ? errs : "none");
}

main().catch(e => { console.error(e); process.exit(1); });
