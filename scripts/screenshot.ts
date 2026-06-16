/**
 * Headless-browser screenshotter for visually inspecting the running app —
 * including authenticated /[slug]/* pages — without a real Supabase session.
 *
 * How it works:
 *   1. Picks an org-admin Brother from the dev DB (so every page renders).
 *   2. Forges the dev_impersonate cookie (HMAC-signed, see lib/auth/dev-bypass.ts)
 *      and sets active_org_id so the org is pre-selected.
 *   3. Drives Playwright Chromium across a route list, writing full-page PNGs to
 *      _screenshots/ (gitignored) for review.
 *
 * Prereqs:
 *   - DEV_AUTH_BYPASS=1 and DEV_AUTH_BYPASS_SECRET set in .env.local
 *   - dev server already running:  npm run dev   (http://localhost:3000)
 *   - Chromium binary: auto-installed on first run if missing.
 *
 * Usage:
 *   npm run screenshot                       # default route list
 *   npm run screenshot -- /lpe /lpe/timeline # specific routes
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Browser } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
import { ACTIVE_ORG_COOKIE } from "../lib/auth/require-user";

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const ORG_SLUG = process.env.SCREENSHOT_ORG_SLUG ?? "lpe";
const OUT_DIR = resolve(process.cwd(), "_screenshots");

const DEFAULT_ROUTES = [
  `/${ORG_SLUG}`,
  `/${ORG_SLUG}/timeline`,
  `/${ORG_SLUG}/brothers`,
  `/${ORG_SLUG}/settings`,
];

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function pickAdminBrother(): Promise<{ id: number; name: string; orgId: number }> {
  const org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG }, select: { id: true } });
  if (!org) fail(`No organization with slug "${ORG_SLUG}". Seed the DB first (npx prisma db seed).`);

  // Prefer an org-admin membership so all pages/permissions render.
  const adminMembership = await prisma.membership.findFirst({
    where: { organizationId: org!.id, isOrgAdmin: true },
    select: { brother: { select: { id: true, name: true } } },
  });
  const brother =
    adminMembership?.brother ??
    (await prisma.membership.findFirst({
      where: { organizationId: org!.id },
      select: { brother: { select: { id: true, name: true } } },
    }))?.brother;

  if (!brother) fail(`No members in org "${ORG_SLUG}".`);
  return { id: brother!.id, name: brother!.name, orgId: org!.id };
}

async function ensureChromium(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (err) {
    const msg = String(err);
    if (/Executable doesn't exist|install/i.test(msg)) {
      console.log("Chromium binary not found — installing (one-time)…");
      execSync("npx playwright install chromium", { stdio: "inherit" });
      return await chromium.launch();
    }
    throw err;
  }
}

async function assertServerUp() {
  // Retry a few times — a cold dev server compiles the first route on demand,
  // and Node's fetch to "localhost" can be slow resolving IPv4/IPv6. Any HTTP
  // response (including a redirect) means the server is up.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await fetch(BASE_URL, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      return;
    } catch {
      if (attempt === 5) break;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  fail(`Dev server not reachable at ${BASE_URL}. Start it with: DEV_AUTH_BYPASS=1 npm run dev`);
}

async function main() {
  if (process.env.DEV_AUTH_BYPASS !== "1") {
    fail("DEV_AUTH_BYPASS=1 must be set (in .env.local) for impersonation to work.");
  }
  if (!process.env.DEV_AUTH_BYPASS_SECRET) {
    fail("DEV_AUTH_BYPASS_SECRET must be set in .env.local.");
  }
  await assertServerUp();

  const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES;
  const { id, name, orgId } = await pickAdminBrother();
  console.log(`Impersonating: ${name} (brother #${id}) in org "${ORG_SLUG}" (#${orgId})`);

  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await ensureChromium();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Use `url` (origin) rather than domain/path — the robust form for localhost,
  // which browsers otherwise drop when set via an explicit domain attribute.
  await context.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(id), url: BASE_URL },
    { name: ACTIVE_ORG_COOKIE, value: String(orgId), url: BASE_URL },
  ]);

  const page = await context.newPage();
  for (const route of routes) {
    const target = new URL(route, BASE_URL).toString();
    const file = resolve(OUT_DIR, route.replace(/^\//, "").replace(/\//g, "_").replace(/[^a-z0-9_-]/gi, "") + ".png" || "root.png");
    try {
      const resp = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
      // These pages are client components that fetch their data via several
      // /api/* calls *after* hydration (some — the AI digest — take many
      // seconds), so networkidle is both too early and unreliable here. Instead
      // wait until the roster actually has data: the empty state renders the
      // literal "No brothers match your filters." string, so we wait for that to
      // disappear. Falls back to a fixed settle if the marker never resolves
      // (e.g. a genuinely empty org, or a non-dashboard route).
      await page
        .waitForFunction(
          () => !document.body.innerText.includes("No brothers match your filters"),
          { timeout: 20_000 },
        )
        .catch(() => {});
      await page.waitForTimeout(800);
      const landed = page.url().replace(BASE_URL, "");
      const redirected = landed !== route && !landed.startsWith(route);
      console.log(`  ${route} → ${file.replace(process.cwd() + "/", "")}` +
        ` [${resp?.status() ?? "?"}]${redirected ? ` ⚠ redirected to ${landed}` : ""}`);
    } catch (err) {
      console.error(`  ${route} → FAILED: ${String(err).split("\n")[0]}`);
    }
  }

  await browser.close();
  console.log(`\nDone. PNGs in ${OUT_DIR.replace(process.cwd() + "/", "")}/`);
}

main().finally(() => prisma.$disconnect());
