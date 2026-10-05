// Scratch: drive add / mark posted / month-add / delete with every write stubbed (no DB writes).
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
const BASE = "http://localhost:3000", OUT = process.env.OUT!;
(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "lpe" }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } }); await prisma.$disconnect();
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE }, { name: "active_org_id", value: String(org.id), url: BASE }]);
  await ctx.addInitScript(() => { localStorage.setItem("chaptos:aesthetic:v1", "paper"); localStorage.setItem("chaptos:theme:v1", "ivory"); });
  const p = await ctx.newPage(); await p.clock.setFixedTime(new Date("2026-10-14T17:00:00Z"));
  p.on("pageerror", e => { if (!/Hydration/.test(e.message)) console.log("PAGEERROR", e.message); });
  let posts = [{ id: 1, title: "Existing story", type: "Story", dueDate: "2026-10-20", status: "open", postedDate: null, calendarEventId: null }];
  let next = 50;
  await p.route("**/api/instagram**", async r => {
    const req = r.request(), method = req.method(), id = Number(req.url().split("/").pop());
    if (method === "GET") return r.fulfill({ json: posts });
    if (method === "POST") { const d = req.postDataJSON(); const s = { id: next++, status: "open", postedDate: null, ...d }; posts = [...posts, s]; return r.fulfill({ json: s }); }
    if (method === "PATCH") { const d = req.postDataJSON(); const cur = posts.find(x => x.id === id)!; const s = { ...cur, ...d, ...(d.status === "posted" ? { postedDate: "2026-10-14" } : {}) }; posts = posts.map(x => x.id === id ? s : x); return r.fulfill({ json: s }); }
    if (method === "DELETE") { posts = posts.filter(x => x.id !== id); return r.fulfill({ json: { ok: true } }); }
  });
  await p.route("**/api/calendar", r => r.fulfill({ json: [] }));
  await p.goto(`${BASE}/lpe/instagram`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await p.waitForSelector(".igp-measures", { timeout: 90_000 });
  await p.evaluate(() => { document.documentElement.dataset.theme = "ivory"; document.documentElement.dataset.aesthetic = "paper"; });
  const toast = async () => (await p.locator("[role=status], [data-sonner-toast], .toast").allInnerTexts().catch(() => [])).join(" | ");
  // 1. add from lanes
  await p.locator(".igp-head-actions .igp-btn").click();
  console.log("focused in sheet:", await p.evaluate(() => (document.activeElement as HTMLElement)?.getAttribute("placeholder")));
  await p.keyboard.type("Formal countdown");
  await p.locator(".igp-sheet .igp-types label").nth(1).click();
  await p.locator(".igp-sheet button:has-text('Add post')").click(); await p.waitForTimeout(400);
  console.log("after add — sheet open:", await p.locator(".igp-sheet").count(), "fresh rows:", await p.locator(".igp-row.fresh").allInnerTexts(), "toast:", await toast());
  await p.screenshot({ path: `${OUT}/flow-added.png` });
  // 2. mark posted from the rail
  await p.locator(".igp-row-open", { hasText: "Existing story" }).click(); await p.waitForTimeout(300);
  await p.locator(".igp-rail-f .igp-btn", { hasText: "Mark posted" }).click(); await p.waitForTimeout(120);
  console.log("confetti bits:", await p.locator(".igp-bit").count());
  await p.waitForTimeout(400);
  console.log("stamp:", await p.locator(".igp-stamp").getAttribute("class"), "toast:", await toast());
  await p.screenshot({ path: `${OUT}/flow-posted.png` });
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  console.log("rail closed:", await p.locator("dialog.igp-rail").count());
  // 3. add from month view → stays on month, jumps to its month
  await p.locator(".igp-tabs button").nth(1).click();
  await p.locator(".igp-head-actions .igp-btn").click(); await p.keyboard.type("November recap");
  await p.locator(".igp-sheet input[type=date]").fill("2026-11-20");
  await p.locator(".igp-sheet button:has-text('Add post')").click(); await p.waitForTimeout(400);
  console.log("month view:", await p.locator("#igp-month h2").innerText(), "has mark:", await p.locator(".igp-mk", { hasText: "November recap" }).count());
  // 4. delete via row
  await p.locator(".igp-tabs button").nth(0).click(); await p.waitForTimeout(200);
  const row = p.locator(".igp-row", { hasText: "Formal countdown" }); await row.hover();
  await row.locator(".igp-iconbtn.del").click(); await p.waitForTimeout(300);
  console.log("delete sheet focus:", await p.evaluate(() => document.activeElement?.textContent));
  await p.screenshot({ path: `${OUT}/flow-delete.png` });
  await p.locator(".igp-sheet .igp-btn.danger").click(); await p.waitForTimeout(400);
  console.log("deleted:", await p.locator(".igp-row", { hasText: "Formal countdown" }).count() === 0, "toast:", await toast());
  // 5. search no-match
  await p.locator(".igp-search input").fill("zzz"); await p.waitForTimeout(200);
  await p.screenshot({ path: `${OUT}/flow-nomatch.png` });
  await b.close();
})();
