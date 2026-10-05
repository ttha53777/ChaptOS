// Scratch: computed-style diff of mock (.ig-*) vs real (.igp-*) Instagram page. Read-only.
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
const BASE = "http://localhost:3000", SLUG = "lpe";
const state = process.argv[2] ?? "page"; // page | rail | posted | month | create | day | edit
const theme = process.argv[3] ?? "ivory";
const MAP: [string, string][] = JSON.parse(process.env.MAP ?? "null") ?? ({
  page: [[".tl-brief .kick", ".igp-kick"], [".tl-brief .kick .chip", ".igp-kick .chip"], [".tl-brief .greet", ".igp-brief h1"], [".tl-brief .greet .hi", ".igp-hi"], [".tl-brief .digest", ".igp-digest"], [".tl-brief .digest .aichip", ".igp-aichip"], [".tl-brief .digest > span:last-child", ".igp-digest p"],
    [".tl-acts .btn", ".igp-head-actions .igp-btn"], [".tl-acts .askbar", ".igp-ask"], [".tl-acts .askbar kbd", ".igp-ask kbd"], [".meas-row", ".igp-measures"], [".meas", ".igp-measure"], [".meas-l", ".igp-measure .k"], [".meas-l svg", ".igp-measure .k svg"], [".meas-v", ".igp-measure .v"], [".meas-v small", ".igp-measure .v small"], [".meas-d", ".igp-measure .note"],
    [".ig-tools", ".igp-tools"], [".ig-tools .search", ".igp-search"], [".ig-tools .search input", ".igp-search input"], [".ig-tools .tabs", ".igp-tabs"], [".ig-tools .tabs button[aria-selected=true]", ".igp-tabs button[aria-pressed=true]"], [".ig-tools .tabs button[aria-selected=false]", ".igp-tabs button[aria-pressed=false]"], [".ig-leg", ".igp-leg"], [".ig-leg span", ".igp-leg span"],
    [".ig-lh", ".igp-lh"], [".ig-lh h2", ".igp-lh h2"], [".ig-lh .sub", ".igp-lh .sub"], [".ig-lh .cnt", ".igp-lh .cnt"], [".ig-lh .dot", ".igp-lh .dot"], [".ig-list", ".igp-list"],
    [".ig-row", ".igp-row"], [".ig-row .t", ".igp-row .t"], [".ig-row .m", ".igp-row .m"], [".ig-row .m > span:nth-child(2)", ".igp-row .m > span:nth-child(2)"], [".ig-row .ig-chip", ".igp-row .igp-chip"], [".ig-row .ig-ev", ".igp-row .igp-ev"], [".ig-row .ig-ev svg", ".igp-row .igp-ev svg"], [".ig-row .ig-due", ".igp-row .igp-due"], [".ig-row .ig-snap", ".igp-row .igp-snap"], [".ig-row .sn", ".igp-row .sn"], [".ig-row .ig-acts", ".igp-row .igp-acts"], [".ig-row .ig-acts .iconbtn", ".igp-row .igp-acts .igp-iconbtn"]],
  day: [[".ig-empty", ".igp-empty"], [".ig-empty .art", ".igp-empty .art"], [".ig-empty .art .ig-snap", ".igp-empty .art .igp-snap"], [".ig-empty h3", ".igp-empty h3"], [".ig-empty > p", ".igp-empty > p"], [".ig-empty .actions", ".igp-empty .igp-actions"], [".ig-empty .actions .btn", ".igp-empty .igp-actions .igp-btn"], [".ig-ideas", ".igp-ideas"], [".ig-ideas .k", ".igp-ideas .k"], [".ig-ideas .chips", ".igp-ideas .chips"], [".ig-ideas .chips button", ".igp-ideas .chips button"], [".ig-ideas .chips button i", ".igp-ideas .chips button i"], [".tl-brief .digest", ".igp-digest"], [".tl-brief .digest > span:last-child", ".igp-digest p"]],
  rail: [[".ig-rail", ".igp-rail"], [".ig-rail-h", ".igp-rail-h"], [".ig-rail-h p", ".igp-rail-h p"], [".ig-rail-h .iconbtn", ".igp-rail-h .igp-iconbtn"], [".ig-rail-b", ".igp-rail-b"], [".ig-rail .stage", ".igp-rail .stage"], [".ig-rail .tape", ".igp-rail .tape"], [".ig-rail .ig-snap", ".igp-rail .igp-snap"], [".ig-rail .ig-chip", ".igp-rail .igp-chip"], [".ig-rail-b h2", ".igp-rail-b h2"], [".ig-rail-b .ig-due", ".igp-rail-b .igp-due"], [".ig-dl", ".igp-dl"], [".ig-dl > div", ".igp-dl > div"], [".ig-dl dt", ".igp-dl dt"], [".ig-dl dd", ".igp-dl dd"], [".ig-date", ".igp-date"], [".ig-evlink", ".igp-evlink"], [".ig-stamp", ".igp-stamp"], [".ig-rail-f", ".igp-rail-f"], [".ig-rail-f .btn:not(.btn--ghost):not(.del)", ".igp-rail-f .igp-btn:not(.ghost):not(.del)"], [".ig-rail-f .btn--ghost", ".igp-rail-f .igp-btn.ghost"], [".ig-rail-f .del", ".igp-rail-f .del"], [".ig-shade", "dialog.igp-rail::backdrop"]],
  month: [[".ig-mh", ".igp-mh"], [".ig-mh h2", ".igp-mh h2"], [".ig-mh h2 em", ".igp-mh h2 em"], [".ig-mh .note", ".igp-mh .note"], [".ig-mh .iconbtn", ".igp-mh .igp-iconbtn"], [".ig-cal", ".igp-cal"], [".ig-cal .dow", ".igp-cal .dow"], [".ig-cell:not(.blank)", ".igp-cell:not(.blank)"], [".ig-cell.blank", ".igp-cell.blank"], [".ig-cell.today", ".igp-cell.today"], [".ig-cell.today .dn", ".igp-cell.today .dn"], [".ig-cell .dn", ".igp-cell .dn"], [".ig-cell.gap", ".igp-cell.gap"], [".ig-mk:not(.ev):not(.done)", ".igp-mk:not(.ev):not(.done)"], [".ig-mk.done", ".igp-mk.done"], [".ig-mk.ev", ".igp-mk.ev"], [".ig-mk i", ".igp-mk i"]],
} as Record<string, [string, string][]>)[state === "posted" ? "rail" : state];
const PROPS = ["font-family", "font-size", "font-weight", "font-style", "letter-spacing", "line-height", "text-transform", "color", "background-color", "background-image", "border-top", "border-left", "border-bottom", "border-radius", "box-shadow", "padding", "margin", "width", "height", "gap", "display", "opacity", "transform", "text-decoration-line", "font-variant-numeric", "font-feature-settings", "outline", "max-width", "grid-template-columns", "inset", "position", "top", "right", "bottom", "left"];
const GRAB = `(([map, props]) => map.map(([m, r]) => { function pick(sel) { var pe = sel.match(/::(backdrop|before|after)$/); var el = document.querySelector(pe ? sel.replace(/::\\w+$/, "") : sel); if (!el) return null; var cs = getComputedStyle(el, pe ? "::" + pe[1] : undefined); var o = {}; for (var p of props) o[p] = cs.getPropertyValue(p); return o; } return [pick(m), pick(r)]; }))`;
const grab = (page: Page): Promise<[Record<string, string> | null, Record<string, string> | null][]> => page.evaluate(`${GRAB}(${JSON.stringify([MAP, PROPS])})`);
const norm = (p: string, v: string) => p.startsWith("border-") && p !== "border-radius" && v.startsWith("0px") ? "0" : /^(width|height|margin|inset|top|right|bottom|left)$/.test(p) && /^-?[\d.]+px$/.test(v) ? String(Math.round(parseFloat(v) / 4)) : p === "font-family" ? v.split(",")[0].replace(/"/g, "").replace(/^__?/, "").replace(/_[0-9a-f]+$/,"").replace(/ Fallback.*/,"").trim() : v;
async function main() {
  const browser = await chromium.launch();
  const TODAY = state === "day" ? "2026-09-01" : "2026-10-14";
  // mock
  const mctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await mctx.addInitScript(([th]) => { try { if (th === "dusk") localStorage.setItem("paper-mock-theme", "dark"); } catch {} }, [theme]);
  const mp = await mctx.newPage(); await mp.goto("file:///Users/thalhat/figurints/_design/Dashboard%20Paper%20Mock.html#instagram"); await mp.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" }); await mp.waitForTimeout(800);
  // real
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } }); await prisma.$disconnect();
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await rctx.addCookies([{ name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE }, { name: "active_org_id", value: String(org.id), url: BASE }]);
  const rp = await rctx.newPage(); await rp.clock.setFixedTime(new Date(`${TODAY}T17:00:00Z`));
  const posts = state === "day" ? [] : [{ id: 7, title: "Alumni mixer save-the-date", type: "Story", dueDate: "2026-10-09", status: "open", postedDate: null, calendarEventId: 6 }, { id: 9, title: "Chapter tonight", type: "Story", dueDate: "2026-10-14", status: "open", postedDate: null, calendarEventId: 5 }, { id: 15, title: "Formal", type: "Reel", dueDate: "2026-10-17", status: "open", postedDate: null, calendarEventId: null },
    { id: 6, title: "Homecoming tailgate recap", type: "Carousel", dueDate: "2026-10-11", status: "posted", postedDate: "2026-10-12", calendarEventId: 4 }, { id: 4, title: "Meet the exec board", type: "Carousel", dueDate: "2026-10-01", status: "posted", postedDate: "2026-10-01", calendarEventId: null }];
  await rp.route("**/api/instagram**", r => r.fulfill({ json: posts }));
  await rp.route("**/api/calendar", r => r.fulfill({ json: [{ id: 4, date: "2026-10-10", title: "Homecoming tailgate", category: "social" }, { id: 5, date: "2026-10-14", title: "Chapter meeting", category: "chapter" }, { id: 6, date: "2026-10-16", title: "Alumni mixer", category: "social" }] }));
  await rp.route("**/api/auth/me", async r => { const res = await r.fetch(); const j = await res.json(); if (j.org) j.org.instagramHandle = "oozmakappa"; await r.fulfill({ response: res, json: j }); });
  await rp.goto(`${BASE}/${SLUG}/instagram`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const sel = state === "day" ? ".igp-empty" : ".igp-measures";
  await rp.waitForSelector(sel, { timeout: 30_000 }).catch(async () => { await rp.screenshot({ path: "/Users/thalhat/.claude/jobs/53f5c12c/tmp/ig/difffail.png" }); await rp.reload({ waitUntil: "domcontentloaded" }); await rp.waitForSelector(sel, { timeout: 60_000 }); });
  await rp.evaluate(([th]) => { document.documentElement.dataset.theme = th; document.documentElement.dataset.aesthetic = "paper"; }, [theme]);
  await rp.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" }); await rp.waitForTimeout(500);
  if (state === "day") { await mp.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Day one")?.click()); await mp.waitForTimeout(400); }
  if (state === "rail") { await mp.locator(".ig-row.ln-overdue").first().click(); await rp.locator(".igp-ln-overdue .igp-row-open").first().click(); }
  if (state === "posted") { await mp.locator(".ig-row.ln-posted").first().click(); await rp.locator(".igp-ln-posted .igp-row-open").first().click(); }
  if (state === "month") { await mp.locator('[data-ig="view:month"]').click(); await rp.locator(".igp-tabs button").nth(1).click(); }
  await mp.waitForTimeout(500); await rp.waitForTimeout(500);
  const [a, b] = [await grab(mp), await grab(rp)];
  MAP.forEach(([ms, rs], i) => {
    const [x] = a[i], [, y] = b[i];
    if (!x || !y) { console.log(`?? ${ms} ${x ? "" : "(mock missing)"} ↔ ${rs} ${y ? "" : "(real missing)"}`); return; }
    const d = PROPS.filter(p => norm(p, x[p]) !== norm(p, y[p]));
    if (d.length) console.log(`\n${ms}  ↔  ${rs}\n` + d.map(p => `   ${p}: ${x[p]}  |  ${y[p]}`).join("\n"));
  });
  await browser.close();
}
main();
