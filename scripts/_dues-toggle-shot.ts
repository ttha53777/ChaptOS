// Screenshots the Track dues switch (Settings → Workflows) and Treasury with dues
// on and off. Read-only: /api/auth/me is rewritten to flip operations/kpi-dues,
// and the config PATCH is stubbed.
// Usage: tsx --env-file=.env.local scripts/_dues-toggle-shot.ts <outDir>
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const out = process.argv[2]!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();

  const b = await chromium.launch();
  const errs: string[] = [];
  const writes: string[] = [];
  for (const run of [
    { name: "on", dues: true, w: 1440 },
    { name: "off", dues: false, w: 1440 },
    { name: "off-phone", dues: false, w: 390 },
  ]) {
    const ctx = await b.newContext({ viewport: { width: run.w, height: run.w > 500 ? 1000 : 844 } });
    await ctx.addCookies([
      { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(admin.brotherId), url: BASE },
      { name: "active_org_id", value: String(org.id), url: BASE },
    ]);
    await ctx.addInitScript(() => { try { localStorage.setItem("chaptos:theme:v1", "ivory"); } catch {} });
    await ctx.route("**/api/orgs/config", async route => {
      if (route.request().method() === "GET") return route.continue();
      writes.push(`${route.request().method()} ${route.request().postData()}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await ctx.route("**/api/auth/me", async route => {
      const res = await route.fetch().catch(() => null);
      if (!res) return;
      const json = await res.json();
      if (json?.terms) json.terms.acceptedVersion = json.terms.version;
      if (json?.org) {
        const df = { ...(json.org.disabledFeatures ?? {}) };
        const ops = new Set<string>(df.operations ?? []);
        if (run.dues) ops.delete("kpi-dues"); else ops.add("kpi-dues");
        df.operations = [...ops];
        json.org.disabledFeatures = df;
      }
      return route.fulfill({ response: res, json });
    });
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(String(e)));

    await p.goto(`${BASE}/org/${SLUG}/treasury`);
    await p.waitForSelector(".tr-tabs", { timeout: 120_000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await p.waitForSelector(".tr-lower", { timeout: 60_000 });
    await p.waitForTimeout(2000);
    const tabs = await p.$$eval(".tr-tabs > button", els => els.map(e => e.getAttribute("data-tab")));
    console.log(run.name, "tabs:", tabs.join(","), "duesCard:", await p.locator(".tr-lower .tr-dues-card, .tr-lower > :first-child").first().getAttribute("class"));
    await p.screenshot({ path: `${out}/treasury-${run.name}.png`, fullPage: true });
    await p.locator(".tr-lower").scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${out}/treasury-${run.name}-lower.png` });

    if (run.w > 500) {
      await p.goto(`${BASE}/org/${SLUG}/settings?section=workflows`);
      await p.waitForSelector(".wf-dues", { timeout: 120_000 });
      await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await p.locator(".wf-dues").scrollIntoViewIfNeeded();
      await p.screenshot({ path: `${out}/settings-${run.name}.png` });
      await p.click(".wf-switch");
      await p.screenshot({ path: `${out}/settings-${run.name}-toggled.png` });
      await p.click(".sc-actions .sc-btn-primary");
      await p.waitForTimeout(1500);
    }
    await p.unrouteAll({ behavior: "ignoreErrors" });
    await ctx.close();
  }
  await b.close();
  console.log("writes:", writes);
  console.log("errors:", errs);
}
main().catch(e => { console.error(e); process.exit(1); });
