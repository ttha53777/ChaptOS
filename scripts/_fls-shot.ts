// First load splash: frame strips, edge cases, client-nav check and a timing
// comparison with the splash skipped. Read-only (GETs only; /me is patched in
// flight to accept the terms and, for "logo", to give the org an uploaded logo).
// Usage: tsx --env-file=.env.local scripts/_fls-shot.ts <outDir> [case...]
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const out = process.argv[2]!;
const only = process.argv.slice(3);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });

const CREST = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">
<rect width="36" height="36" fill="#1F3A5F"/><path d="M18 6l9 3.4v7.4c0 6-4 10.4-9 12.6-5-2.2-9-6.6-9-12.6V9.4z" fill="#F3E3B5"/>
<path d="M18 9.6l6 2.3v5c0 4.3-2.7 7.5-6 9.2-3.3-1.7-6-4.9-6-9.2v-5z" fill="#1F3A5F"/></svg>`);

interface Opts { w: number; h: number; theme: "ivory" | "dusk"; logo?: boolean; meDelay?: number; reduce?: boolean; skip?: boolean }
let adminId = 0, orgId = 0;
const errs: string[] = [];

async function ctxFor(b: Browser, o: Opts): Promise<BrowserContext> {
  const ctx = await b.newContext({ viewport: { width: o.w, height: o.h }, reducedMotion: o.reduce ? "reduce" : "no-preference",
    hasTouch: o.w < 768, isMobile: o.w < 768 });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(adminId), url: BASE },
    { name: "active_org_id", value: String(orgId), url: BASE },
  ]);
  await ctx.addInitScript(([t, skip]) => {
    try { localStorage.setItem("chaptos:theme:v1", t as string); } catch {}
    if (skip && !sessionStorage.getItem("__skipped")) { sessionStorage.setItem("chaptos:fls-skip", String(Date.now())); sessionStorage.setItem("__skipped", "1"); }
    // timing probes
    const w = window as unknown as Record<string, unknown>;
    w.__lt = 0;
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) (w.__lt as number) += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true }); } catch {}
    const iv = setInterval(() => {
      if (!w.__hyd && Object.keys(document).some(k => k.startsWith("_reactListening"))) w.__hyd = performance.now();
      if (!w.__flsGone && w.__hyd && !document.documentElement.hasAttribute("data-fls")) w.__flsGone = performance.now();
      if (w.__flsGone && w.__hyd && performance.now() > 20000) clearInterval(iv);
    }, 5);
  }, [o.theme, !!o.skip]);
  await ctx.route("**/api/auth/me", async route => {
    try {
      if (o.meDelay) await new Promise(r => setTimeout(r, o.meDelay));
      const res = await route.fetch();
      const json = await res.json();
      if (json?.terms) json.terms.acceptedVersion = json.terms.version;
      if (json?.org) json.org.logoUrl = o.logo ? CREST : null;
      await route.fulfill({ response: res, json });
    } catch { /* context closed mid-flight */ }
  });
  return ctx;
}

function watch(p: Page, tag: string) {
  p.on("pageerror", e => errs.push(`${tag}: ${e}`));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|401/.test(m.text())) errs.push(`${tag}: ${m.text()}`); });
}

/** Screenshot every `step` ms until the splash is gone (plus one after). */
async function strip(p: Page, tag: string, step = 250, max = 14000) {
  await p.waitForFunction(() => document.documentElement.hasAttribute("data-fls"), null, { timeout: 120_000, polling: 10 });
  const t0 = Date.now(); let i = 0;
  for (;;) {
    const up = await p.evaluate(() => document.documentElement.hasAttribute("data-fls")).catch(() => true);
    const t = Date.now() - t0;
    await p.screenshot({ path: `${out}/${tag}-${String(i++).padStart(2, "0")}-${t}ms.png` });
    if (!up || t > max) break;
    await p.waitForTimeout(step);
  }
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${tag}-zz-after.png` });
}

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  orgId = org.id;
  adminId = (await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } })).brotherId;
  await prisma.$disconnect();
  const b = await chromium.launch();
  const want = (c: string) => only.length === 0 || only.includes(c);

  // warm the dev server so compile time doesn't dominate the first strip
  { const c = await ctxFor(b, { w: 1440, h: 900, theme: "ivory", skip: true }); const p = await c.newPage();
    await p.goto(`${BASE}/org/${SLUG}`); await p.waitForSelector(".sb-org", { timeout: 180_000 }); await p.waitForTimeout(3000); await c.close(); }

  const strips: [string, Opts][] = [
    ["desk-day-initials", { w: 1440, h: 900, theme: "ivory" }],
    ["desk-night-logo", { w: 1440, h: 900, theme: "dusk", logo: true }],
    ["phone-day-logo", { w: 390, h: 844, theme: "ivory", logo: true }],
    ["phone-night-initials", { w: 390, h: 844, theme: "dusk" }],
    ["desk-slow", { w: 1440, h: 900, theme: "ivory", meDelay: 5000 }],
    ["desk-reduce", { w: 1440, h: 900, theme: "ivory", reduce: true }],
  ];
  for (const [tag, o] of strips) {
    if (!want(tag)) continue;
    const c = await ctxFor(b, o); const p = await c.newPage(); watch(p, tag);
    await p.goto(`${BASE}/org/${SLUG}`, { waitUntil: "commit" });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    await strip(p, tag, tag === "desk-slow" ? 500 : 200);
    console.log(tag, await p.evaluate(() => ({ hyd: Math.round((window as never as { __hyd: number }).__hyd), gone: Math.round((window as never as { __flsGone: number }).__flsGone) })));
    if (tag === "desk-day-initials" && want("cached")) {
      // cached: same tab, reload
      await p.reload({ waitUntil: "commit" });
      console.log("cached attr", await p.evaluate(() => document.documentElement.getAttribute("data-fls")));
      await strip(p, "desk-cached", 200);
    }
    if (tag === "desk-day-initials" && want("clientnav")) {
      // client navigation: sidebar link to Timeline and back. The splash must never appear.
      let seen = false;
      const poll = setInterval(async () => { try { if (await p.evaluate(() => { const f = document.getElementById("fls"); return !!f && getComputedStyle(f).display !== "none"; })) seen = true; } catch {} }, 30);
      await p.locator(".sb a[href$='/timeline'], .sb [href$='/timeline']").first().click();
      await p.waitForURL(/timeline/); await p.waitForTimeout(1500);
      await p.locator(".sb a[href$='/org/" + SLUG + "'], .sb [href$='/org/" + SLUG + "']").first().click().catch(() => {});
      await p.waitForTimeout(1500);
      // a fresh mount of the [slug] layout from outside it: /help → /org/<slug> by router push
      await p.goto(`${BASE}/help`); await p.waitForTimeout(1500);
      const pushed = await p.evaluate(s => { const n = (window as never as { next?: { router?: { push: (u: string) => void } } }).next; if (!n?.router) return false; n.router.push(`/org/${s}`); return true; }, SLUG);
      await p.waitForURL(new RegExp(`/org/${SLUG}$`), { timeout: 60_000 }).catch(() => {});
      await p.waitForTimeout(2500);
      clearInterval(poll);
      console.log("clientnav: splash seen =", seen, "| router.push available =", pushed, "| attr =", await p.evaluate(() => document.documentElement.getAttribute("data-fls")));
      await p.screenshot({ path: `${out}/clientnav-after-push.png` });
    }
    await c.close();
  }

  if (want("skip")) {
    const c = await ctxFor(b, { w: 1440, h: 900, theme: "ivory", skip: true }); const p = await c.newPage(); watch(p, "skip");
    await p.goto(`${BASE}/org/${SLUG}`, { waitUntil: "commit" });
    await p.waitForTimeout(400);
    console.log("org-switch skip: attr =", await p.evaluate(() => document.documentElement.getAttribute("data-fls")),
      "| fls in DOM =", await p.evaluate(() => !!document.getElementById("fls")));
    await p.waitForSelector(".sb-org"); await p.waitForTimeout(800);
    console.log("org-switch skip after hydrate: fls in DOM =", await p.evaluate(() => !!document.getElementById("fls")));
    await c.close();
  }

  if (want("timing")) {
    // alternate splash / no splash; fresh context each so neither is "cached"
    const rows: Record<string, number[][]> = { splash: [], none: [] };
    for (let i = 0; i < Number(process.env.N ?? 5); i++) {
      for (const mode of ["splash", "none"] as const) {
        const c = await ctxFor(b, { w: 1440, h: 900, theme: "ivory", skip: mode === "none" }); const p = await c.newPage();
        await p.goto(`${BASE}/org/${SLUG}`);
        await p.waitForFunction(() => (window as never as { __flsGone?: number }).__flsGone, null, { timeout: 60_000 });
        // wait for /me, then for the /api fan-out to go quiet for 1.5s
        await p.waitForFunction(() => performance.getEntriesByType("resource").some(e => e.name.endsWith("/api/auth/me")), null, { timeout: 60_000 });
        for (let last = -1, quiet = 0; quiet < 6; ) {
          const n = await p.evaluate(() => performance.getEntriesByType("resource").filter(e => e.name.includes("/api/")).length);
          quiet = n === last ? quiet + 1 : 0; last = n; await p.waitForTimeout(250);
        }
        const r = await p.evaluate(() => {
          const w = window as never as { __hyd: number; __flsGone: number; __lt: number };
          const api = performance.getEntriesByType("resource").filter(e => e.name.includes("/api/")) as PerformanceResourceTiming[];
          const me = api.find(e => e.name.endsWith("/api/auth/me"));
          const initial = api.filter(e => e.startTime < (me?.responseEnd ?? 0) + 50);
          const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
          const L = performance.getEntriesByName("fls:loaded")[0]?.startTime ?? NaN, G = performance.getEntriesByName("fls:gone")[0]?.startTime ?? NaN;
          return [nav.domContentLoadedEventEnd, w.__hyd, me?.responseEnd ?? -1, Math.max(...initial.map(e => e.responseEnd)), w.__flsGone, w.__lt, 0, L, G - L];
        });
        rows[mode]!.push(r.map(Math.round));
        await c.close();
      }
    }
    const med = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    // what the user can see: the data, once it's in and nothing covers it
    for (const m of ["splash", "none"]) rows[m]!.forEach(r => { r[6] = Math.max(r[3]!, r[4]!); });
    const cols = ["DCL", "hydrated", "/me done", "fan-out done", "paper gone", "blocking ms", "data visible", "hasLoaded", "paper after hasLoaded"];
    for (const mode of ["splash", "none"]) {
      console.log(mode.padEnd(7), cols.map((c, j) => `${c} ${med(rows[mode]!.map(r => r[j]!))}`).join(" | "));
      console.log("        raw", JSON.stringify(rows[mode]));
    }
  }

  console.log(errs.length ? `ERRORS:\n${errs.join("\n")}` : "no console errors");
  await b.close();
}
main().catch(e => { console.error(e); process.exit(1); });
