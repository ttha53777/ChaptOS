// Fundraisers round trip against the ISOLATED server (:3100, throwaway Postgres).
// SEED='<json from _fz-seed>' OUT=<dir> tsx --env-file=.env.local scripts/_fz-roundtrip.ts
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
import type { Fundraiser } from "../lib/api-types/fundraisers";

const BASE = "http://localhost:3100", SLUG = "ok-test";
const OUT = process.env.OUT!;
const SEED = JSON.parse(process.env.SEED!) as { orgId: number; ids: Record<string, number>; fundraisers: Record<string, { id: number; calendarEventId: number }> };
const THALHA = SEED.ids["Thalha Thabish"], DEV = SEED.ids["Dev Okafor"], LEO = SEED.ids["Leo Park"];
const COOKIE = SEED.fundraisers["Cookie sale"];
let step = 0;
const fails: string[] = [];
function check(ok: boolean, what: string) { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) fails.push(what); }

async function ctxAs(b: Browser, id: number, width = 1440, theme: "ivory" | "dusk" = "ivory") {
  const ctx = await b.newContext({ viewport: { width, height: 1000 } });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(id), url: BASE },
    { name: "active_org_id", value: String(SEED.orgId), url: BASE },
  ]);
  await ctx.addInitScript(t => { try { localStorage.setItem("chaptos:theme:v1", t); } catch {} }, theme);
  return ctx;
}
const api = async <T>(ctx: BrowserContext, path: string): Promise<T> => {
  const r = await ctx.request.get(`${BASE}${path}`, { headers: { "x-org-slug": SLUG } });
  if (!r.ok()) throw new Error(`${path} ${r.status()} ${await r.text()}`);
  return r.json() as Promise<T>;
};
async function shot(p: Page, name: string, full = false) { await p.waitForTimeout(1100); await p.screenshot({ path: `${OUT}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: full }); }
async function go(p: Page, path: string, sel: string) {
  await p.goto(`${BASE}/${SLUG}${path}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important} *{scroll-behavior:auto!important}" }).catch(() => {});
  await p.waitForSelector(sel, { timeout: 180000 });
}
const text = async (p: Page, sel: string) => (await p.locator(sel).first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();

(async () => {
  const b = await chromium.launch();
  const errors: string[] = [];
  const watch = (p: Page) => {
    p.on("pageerror", e => errors.push(String(e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|favicon|realtime|websocket|hydrat/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
  };

  // ── Officer (org admin) ────────────────────────────────────────────────
  const ctx = await ctxAs(b, THALHA);
  const p = await ctx.newPage(); watch(p);

  await go(p, "", "main");
  const plate = await p.locator("text=Count up Cookie sale").first().waitFor({ timeout: 90000 }).then(() => true, () => false);
  check(plate, "dashboard plate lists the uncounted Cookie sale");
  const me = await api<{ org: { fundraisersToWrap: { name: string }[] } }>(ctx, "/api/auth/me");
  check(me.org.fundraisersToWrap.some(f => f.name === "Cookie sale"), "/me ships Cookie sale as a fundraiser to wrap");

  await go(p, "/fundraisers", ".fz-brief");
  const head = await text(p, ".fz-greet");
  // 580-42 + 505-118 + 462-66 + 43-57 = 538 + 387 + 396 - 14 = 1307
  await p.waitForTimeout(1200);
  check(/1,307/.test(await text(p, ".fz-greet")), `term total reads $1,307 (got "${head}")`);
  check(await p.locator(".fz-hero").count() === 1, "one ready-to-wrap hero (Cookie sale)");
  check(await p.locator(".fz-card.wrapped").count() === 4, "four wrapped cards");
  check(/SHORT/.test(await p.locator(".fz-card.wrapped .fz-ptag.loss").first().innerHTML().catch(() => "")), "the raffle's tag reads SHORT");
  await shot(p, "index", true);

  // New fundraiser → lands on its shopping list.
  await p.getByRole("button", { name: "New fundraiser" }).click();
  await p.waitForSelector(".fz-dialog[open]");
  await p.fill(".fz-nf-name", "Spring bake sale");
  check(/Bake sale/.test(await text(p, ".fz-nf-kind")), "the name guesses Bake sale");
  await p.fill(".fz-dialog input[type=date]", "2026-11-05");
  await p.fill(".fz-dialog input[aria-label=Starts]", "11:00");
  await p.fill(".fz-dialog input[aria-label=Ends]", "14:00");
  await p.fill(".fz-dialog input[placeholder='Add a place']", "Library steps");
  await p.fill(".fz-dialog input[placeholder='No goal']", "200");
  await shot(p, "composer");
  await p.getByRole("button", { name: "Start the shopping list" }).click();
  await p.waitForURL(/\/fundraisers\/\d+/, { timeout: 60000 });
  await p.waitForSelector(".fz-pad");
  const newId = Number(p.url().match(/fundraisers\/(\d+)/)![1]);
  check(/11 AM – 2 PM/.test(await text(p, ".fz-dhead")), `hours chip reads 11 AM – 2 PM (got "${await text(p, ".fz-dhead .meta")}")`);

  await p.locator(".fz-sugg button", { hasText: "Flour & sugar" }).click();
  await p.locator(".fz-it:not(.add)", { hasText: "" }).first().waitFor();
  await p.waitForFunction(() => document.querySelectorAll(".fz-lines .fz-it:not(.add)").length === 1);
  await p.fill(".fz-it.add input[aria-label='New supply']", "Napkins");
  await p.fill(".fz-it.add input[aria-label=Cost]", "4");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.querySelectorAll(".fz-lines .fz-it:not(.add)").length === 2);
  check((await text(p, ".fz-pad-total .fz-mono")) === "$22", `list totals $22 (got ${await text(p, ".fz-pad-total .fz-mono")})`);
  const napCost = p.locator(".fz-lines .fz-it:not(.add)").nth(1).locator(".cost input");
  await napCost.fill("5.50");
  check((await text(p, ".fz-pad-total .fz-mono")) === "$23.50", "total moves while typing");
  await Promise.all([
    p.waitForResponse(r => r.request().method() === "PATCH" && /\/supplies\/\d+/.test(r.url()), { timeout: 60000 }),
    napCost.press("Enter"),
  ]);
  const saved = await api<Fundraiser>(ctx, `/api/fundraisers/${newId}`);
  check(saved.spent === 23.5 && saved.supplies[1].cost === 5.5, `inline cost edit saved (spent ${saved.spent})`);
  await shot(p, "shopping-list");
  await p.locator(".fz-lines .fz-it:not(.add)").nth(1).hover();
  await p.getByRole("button", { name: "Remove Napkins" }).click();
  await p.waitForFunction(() => document.querySelectorAll(".fz-lines .fz-it:not(.add)").length === 1);
  check((await api<Fundraiser>(ctx, `/api/fundraisers/${newId}`)).supplies.length === 1, "remove saved");

  // Timeline knows it.
  await go(p, `/timeline?event=${saved.calendarEventId}`, "main");
  const tl = await p.locator("text=Open in Fundraisers").first().waitFor({ timeout: 90000 }).then(() => true, () => false);
  check(tl, "Timeline event offers Open in Fundraisers");
  if (tl) await shot(p, "timeline");

  // Wrap up the Cookie sale: jar fills live, stamp slams.
  await go(p, `/fundraisers/${COOKIE.id}?wrap=1`, ".fz-jarcard");
  await p.fill(".fz-inp", "229");
  check(/\$183 made/.test(await text(p, ".fz-math")), `math says $183 made (got "${await text(p, ".fz-math")}")`);
  await shot(p, "jar-live");
  await p.getByRole("button", { name: "Wrap it up" }).click();
  await p.waitForSelector(".fz-jarcard.won");
  check(/WRAPPED/.test(await p.locator(".fz-jar .stamp").innerHTML()), "WRAPPED stamp on the jar");
  check(/Goal was \$200\. \$17 short of it/.test(await text(p, ".fz-goalbar")), "goal line: $17 short of the $200 goal");
  await shot(p, "wrapped");
  const w = await api<Fundraiser>(ctx, `/api/fundraisers/${COOKIE.id}`);
  check(w.cameIn === 229 && w.made === 183, `server has came in 229 / made 183 (got ${w.cameIn}/${w.made})`);
  check((await p.locator(".fz-it .x").count()) === 0 && (await p.locator(".fz-it.add").count()) === 0, "list locked after wrap");

  // Reopen prefills; a short re-wrap stamps SHORT.
  await p.getByRole("button", { name: "Reopen" }).click();
  await p.waitForSelector(".fz-inp");
  check((await p.inputValue(".fz-inp")) === "229", "reopen prefills the old total");
  await p.fill(".fz-inp", "30");
  await p.keyboard.press("Enter");
  await p.waitForSelector(".fz-jarcard.lost");
  check(/SHORT/.test(await p.locator(".fz-jar .stamp").innerHTML()), "SHORT stamp when supplies beat the take");
  await shot(p, "short");

  // ── Philanthropy chair (role bit only, not admin) can edit ──────────────
  const dctx = await ctxAs(b, DEV);
  const dp = await dctx.newPage(); watch(dp);
  await go(dp, `/fundraisers/${newId}`, ".fz-pad");
  check(await dp.locator(".fz-it.add").count() === 1, "MANAGE_FUNDRAISING role can edit the list");

  // ── Plain member: read-only ──────────────────────────────────────────────
  const lctx = await ctxAs(b, LEO);
  const lp = await lctx.newPage(); watch(lp);
  await go(lp, "/fundraisers", ".fz-brief");
  check(await lp.getByRole("button", { name: "New fundraiser" }).count() === 0, "member sees no New button");
  await go(lp, `/fundraisers/${newId}`, ".fz-pad");
  check(await lp.locator(".fz-it.add").count() === 0 && await lp.locator(".fz-inp").count() === 0, "member can't edit the list or wrap");
  check(/Waiting for an officer/.test(await text(lp, ".fz-jarcard")), "member sees the waiting line");
  const forbidden = await lctx.request.post(`${BASE}/api/fundraisers/${newId}/supplies`, { headers: { "x-org-slug": SLUG, "Content-Type": "application/json" }, data: { name: "Sneaky", cost: 1 } });
  check(forbidden.status() === 403, `member POST is 403 (got ${forbidden.status()})`);

  // ── Night + phone ────────────────────────────────────────────────────────
  const nctx = await ctxAs(b, THALHA, 1440, "dusk");
  const np = await nctx.newPage(); watch(np);
  await go(np, "/fundraisers", ".fz-brief"); await shot(np, "index-dusk", true);
  await go(np, `/fundraisers/${SEED.fundraisers["Boba sale"].id}`, ".fz-jarcard"); await shot(np, "detail-dusk", true);
  for (const width of [720, 390]) {
    const mctx = await ctxAs(b, THALHA, width);
    const mp = await mctx.newPage(); watch(mp);
    await go(mp, "/fundraisers", ".fz-brief");
    const overflow = await mp.evaluate(() => { const m = document.querySelector(".fz-main")!; return m.scrollWidth - m.clientWidth; });
    check(overflow <= 0, `no horizontal overflow at ${width} (index, ${overflow}px)`);
    await shot(mp, `index-${width}`, true);
    await go(mp, `/fundraisers/${SEED.fundraisers["Halloween bake sale"].id}`, ".fz-pad");
    const o2 = await mp.evaluate(() => { const m = document.querySelector(".fz-main")!; return m.scrollWidth - m.clientWidth; });
    check(o2 <= 0, `no horizontal overflow at ${width} (detail, ${o2}px)`);
    await shot(mp, `detail-${width}`, true);
    if (width === 390) {
      await go(mp, "/fundraisers", ".fz-brief");
      await mp.getByRole("button", { name: "New fundraiser" }).click();
      await mp.waitForSelector(".fz-dialog[open]");
      await mp.fill(".fz-nf-name", "Car wash"); await mp.fill(".fz-dialog input[aria-label=Starts]", "10:00");
      await shot(mp, "composer-390");
    }
    await mctx.close();
  }

  check(errors.length === 0, `no page errors (${errors.length})`);
  if (errors.length) console.log(errors.join("\n"));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
