/** Real billing page with mocked HTTP/auth boundaries; no live Stripe calls. */
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { BILLING_BANDS, formatPrice, formatRange } from "../lib/billing/tiers";

async function main() {
  const temp = await mkdtemp(join(tmpdir(), "figurints-billing-browser-"));
  const root = process.cwd();
  const artifacts = process.env.BILLING_SCREENSHOT_DIR ?? join(temp, "screenshots");
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(temp, "context.ts"), `const value={currentUser:{name:'Alex',email:'alex@example.test',orgId:1,memberships:[{organizationId:1,isOrgAdmin:true}],org:{slug:'alpha'}}}; export const useChapter=()=>value;`);
  await writeFile(join(temp, "navigation.ts"), `export const usePathname=()=>location.pathname;`);
  await writeFile(join(temp, "sidebar.tsx"), `export const Sidebar=()=>null;`);
  await writeFile(join(temp, "toast.ts"), `const show=m=>document.getElementById('notice').textContent=m; export const useToast=()=>({success:show,error:show});`);
  await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Page from '${root}/app/[slug]/billing/page';createRoot(document.getElementById('root')).render(<Page/>);`, resolveDir: root, loader: "tsx" },
    bundle: true, nodePaths: [join(root, "node_modules")], outfile: join(temp, "main.js"), jsx: "automatic", platform: "browser", format: "iife",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, alias: { "@": root },
    plugins: [{ name: "boundaries", setup(b) {
      b.onResolve({ filter: /ChapterContext$/ }, () => ({ path: join(temp, "context.ts") }));
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(temp, "navigation.ts") }));
      b.onResolve({ filter: /components\/Sidebar$/ }, () => ({ path: join(temp, "sidebar.tsx") }));
      b.onResolve({ filter: /dashboard\/Toast$/ }, () => ({ path: join(temp, "toast.ts") }));
    } }],
  });
  const css = await postcss([tailwind({ base: root })]).process(await readFile("app/globals.css", "utf8"), { from: resolve("app/globals.css") });
  await writeFile(join(temp, "main.css"), css.css + await readFile(join(temp, "main.css"), "utf8"));
  const server = createServer(async (req, res) => {
    if (req.url === "/main.js" || req.url === "/main.css") {
      res.setHeader("Content-Type", req.url.endsWith("css") ? "text/css" : "text/javascript");
      res.end(await readFile(join(temp, req.url.slice(1)))); return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/main.css"></head><body><div id="notice" role="status"></div><div id="root"></div><script src="/main.js"></script></body></html>');
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.setDefaultTimeout(8000);
  let summary = { members: 2, tier: "free", tierLabel: "Free", priceCents: 0, priceLabel: "$0", status: "free",
    currentPeriodEnd: null as string | null, cancelAtPeriodEnd: false, canAddMember: true, blockedBy: null as string | null,
    selfServeMax: 120, groupPlanEligible: false, billingEnabled: true,
    billingMode: "automatic", selectedPlan: null as string | null, capacity: 4,
    scheduledPlan: null as string | null, planChangeAt: null as string | null, hasSubscription: false,
    bands: BILLING_BANDS.map(b => ({ id: b.id, label: b.label, range: formatRange(b), priceLabel: formatPrice(b.priceCents) })),
  };
  let checkoutBody: unknown, changeBody: unknown;
  await page.route("**/api/billing**", async route => {
    const path = new URL(route.request().url()).pathname;
    const send = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/billing") return send(summary);
    if (path === "/api/billing/checkout") { checkoutBody = route.request().postDataJSON(); return send({ url: `${base}/paid` }); }
    if (path === "/api/billing/plan") { changeBody = route.request().postDataJSON(); return send({ error: "Payment could not complete. Your plan has not changed." }, 400); }
    return send({});
  });
  try {
    await page.goto(`${base}/alpha/billing`);
    await page.getByRole("button", { name: "Choose Standard", exact: true }).waitFor();
    await page.screenshot({ path: join(artifacts, "billing-mobile.png") });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole("button", { name: "Choose Standard", exact: true }).click();
    await page.getByText(/first monthly payment is due/).waitFor();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.waitForURL("**/paid");
    assert.deepEqual(checkoutBody, { plan: "standard" });
    await page.goto(`${base}/alpha/billing`);
    await page.getByRole("button", { name: "Add a card", exact: true }).click();
    await page.waitForURL("**/paid");
    assert.deepEqual(checkoutBody, {});
    summary = { ...summary, members: 50, tier: "standard", tierLabel: "Standard", priceCents: 2500, priceLabel: "$25", status: "active", currentPeriodEnd: "2026-10-24T00:00:00Z", billingMode: "selected", selectedPlan: "standard", capacity: 50, hasSubscription: true, canAddMember: false, blockedBy: "upgrade" };
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`${base}/alpha/billing`);
    await page.getByRole("button", { name: "Current plan" }).waitFor();
    await page.screenshot({ path: join(artifacts, "billing-desktop.png") });
    assert.equal(await page.getByRole("button", { name: "Current plan" }).isDisabled(), true);
    await page.getByRole("button", { name: "Choose Pro", exact: true }).click();
    await page.getByRole("button", { name: "Confirm plan change" }).click();
    await page.locator("#notice").getByText(/plan has not changed/).waitFor();
    assert.deepEqual(changeBody, { action: "select", plan: "pro" });
    await page.getByRole("button", { name: "Go back" }).click();
    summary = { ...summary, tier: "pro", tierLabel: "Pro", selectedPlan: "pro", priceCents: 6500, priceLabel: "$65", capacity: 120, scheduledPlan: "standard", planChangeAt: summary.currentPeriodEnd };
    await page.reload();
    await page.getByRole("button", { name: "Cancel scheduled change" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Switch to Standard" }).isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log(`Billing browser checks passed. Screenshots: ${artifacts}`);
  } finally {
    await browser.close(); await new Promise<void>(r => server.close(() => r()));
    await rm(temp, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
