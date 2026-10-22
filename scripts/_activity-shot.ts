// Read-only: the dashboard Activity spotlight. The dev DB is prod, so every
// non-GET /api call is aborted here and never reaches the server.
// tsx --env-file=.env.local scripts/_activity-shot.ts   (BASE=… SLUG=… OUT=… ONLY=a,b)
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page, type Route } from "playwright";
import { mkdirSync } from "node:fs";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/activity";
const ONLY = process.env.ONLY?.split(",");
mkdirSync(OUT, { recursive: true });

type Scene = { name: string; width: number; height?: number; look: "paper" | "ledger"; theme: "dusk" | "ivory"; fail?: boolean; act?: (p: Page) => Promise<void> };

async function guard(p: Page, s: Scene) {
  await p.route(u => u.pathname.startsWith("/api/"), async (r: Route) => {
    const req = r.request(), url = new URL(req.url());
    if (req.method() !== "GET") return r.abort();
    if (s.fail && url.pathname === "/api/activity" && url.searchParams.get("limit") === "100") return r.fulfill({ status: 500, json: { error: "boom" } });
    for (let i = 0; ; i++) {
      const res = await r.fetch({ timeout: 60000 }).catch(() => null);
      if (res && (res.status() < 500 || i === 5)) return r.fulfill({ response: res });
      if (!res && i === 5) return r.abort();
      await new Promise(z => setTimeout(z, 800));
    }
  });
}

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();

  const click = (sel: string) => async (p: Page) => { await p.click(sel); await p.waitForTimeout(500); };
  const scenes: Scene[] = [
    { name: "paper-day", width: 1440, look: "paper", theme: "ivory" },
    { name: "paper-row", width: 1440, look: "paper", theme: "ivory", act: click(".asp-row:nth-child(2) .asp-row-btn") },
    { name: "paper-night-term", width: 1440, look: "paper", theme: "dusk", act: async p => { await p.click(".asp-seg button:nth-child(3)"); await p.waitForSelector(".asp-rail:not(.stale)", { timeout: 60000 }); await p.waitForTimeout(400); } },
    { name: "paper-cat", width: 1440, look: "paper", theme: "ivory", act: click(".asp-cats .asp-cat:nth-child(2)") },
    { name: "paper-search-none", width: 1440, look: "paper", theme: "ivory", act: async p => { await p.fill(".asp-search input", "zzzqqq"); await p.waitForTimeout(300); } },
    { name: "who", width: 1280, height: 800, look: "paper", theme: "ivory", act: click(".asp-who .asp-cat:nth-child(4)") },
    { name: "error", width: 1440, look: "paper", theme: "ivory", fail: true },
    { name: "phone", width: 390, height: 844, look: "paper", theme: "ivory" },
  ];

  const b = await chromium.launch();
  const errors: string[] = [];
  for (const s of scenes) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const ctx = await b.newContext({ viewport: { width: s.width, height: s.height ?? 900 } });
    await ctx.addCookies([
      { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(admin.brotherId), url: BASE },
      { name: "active_org_id", value: String(org.id), url: BASE },
    ]);
    await ctx.addInitScript(([look, theme]) => {
      try { localStorage.setItem("chaptos:aesthetic:v1", look); localStorage.setItem("chaptos:theme:v1", theme); } catch { /* ignore */ }
    }, [s.look, s.theme]);
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push(`${s.name}: ${String(e).slice(0, 300)}`));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) errors.push(`${s.name} console: ${m.text().slice(0, 200)}`); });
    await guard(p, s);
    await p.goto(`${BASE}/${SLUG}`, { waitUntil: "domcontentloaded" });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    const card = 'section.card[aria-label="Activity"][role="button"]';
    for (let tries = 0; ; tries++) {
      const ok = await p.waitForSelector(card, { timeout: 45000 }).then(() => true, () => false);
      if (ok) break;
      if (tries === 3) { await p.screenshot({ path: `${OUT}/${s.name}-FAIL.png` }); throw new Error(`${s.name}: activity card never loaded`); }
      await p.reload({ waitUntil: "domcontentloaded" });
    }
    await p.waitForTimeout(800);
    await p.locator(card).scrollIntoViewIfNeeded();
    await p.click(card);
    await p.waitForSelector(".asp-overlay .asp", { timeout: 10000 });
    await p.waitForSelector(s.fail ? ".asp-calm" : ".asp-row, .asp-calm", { timeout: 45000 });
    await p.waitForTimeout(700);
    if (s.act) await s.act(p);
    await p.waitForTimeout(400);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) errors.push(`${s.name}: horizontal overflow ${overflow}px`);
    const size = await p.evaluate(() => { const r = document.querySelector(".asp")!.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; });
    console.log(s.name, size);
    await p.screenshot({ path: `${OUT}/${s.name}.png` });
    if (s.name === "paper-day") {
      // Esc closes and the card is back.
      await p.keyboard.press("Escape");
      await p.waitForSelector(".asp-overlay", { state: "detached", timeout: 3000 }).catch(() => errors.push("Esc did not close"));
    }
    await ctx.close();
  }
  await b.close();
  console.log(errors.length ? errors.join("\n") : "no errors");
})();
