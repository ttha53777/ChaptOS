// Phase 0 of docs/mobile-web-parity-plan.md: the web phone render of every org page,
// captured as the golden reference the app is compared against.
//
//   tsx --env-file=.env.local scripts/_parity-capture.ts      (ONLY=page,page  VIEWER=admin|member  THEME=night|day  ORG=busy|dayone  SCENE=full,add)
//
// Runs ONLY against the isolated :3100 server and the throwaway :54331 database (see the
// isolated-dev-server memory): it refuses anything else, and aborts every non-GET /api call
// so a stray click can't write even there.
//
// Output: _design/parity/web/<page>/<org>-<viewer>-<theme>[-<scene>].png (gitignored PNGs)
//   * "full" scenes use a 390×3200 viewport so the whole page renders in one frame
//     (pages scroll inside <main>, so Playwright's fullPage can't see past the fold)
//   * sheet scenes use 390×844, the device the app is built for
import { chromium, devices, webkit, type Page, type Route } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = "http://localhost:3100";
const DB = "postgresql://figurints_test@localhost:54331/figurints_dev";
const ENGINE = process.env.ENGINE ?? "webkit";
const OUT = "_design/parity/web";
const pick = (k: string) => process.env[k]?.split(",");
const ONLY = pick("ONLY"), VIEWERS = pick("VIEWER"), THEMES = pick("THEME"), ORGS = pick("ORG"), SCENES = pick("SCENE");

type Viewer = "admin" | "member";
type Theme = "night" | "day";
type OrgKey = "busy" | "dayone";
type Scene = { name: string; tall?: boolean; act?: (p: Page) => Promise<void>; adminOnly?: boolean };
type PageSpec = { id: string; path: string; ready: string; scenes: Scene[]; adminOnly?: boolean };

const wait = (ms: number) => (p: Page) => p.waitForTimeout(ms);
const tap = (sel: string, settle = 900) => async (p: Page) => {
  const el = p.locator(sel).first();
  if (!(await el.count())) throw new Error(`missing ${sel}`);
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.click();
  await p.waitForTimeout(settle);
};
const full: Scene = { name: "full", tall: true };
const fold: Scene = { name: "fold" };

const PAGES: PageSpec[] = [
  {
    id: "dashboard", path: "", ready: ".dash", scenes: [
      full, fold,
      { name: "sheet-treasury", act: tap('.dw[data-w="treasury"] .dw-glance') },
      { name: "sheet-members", act: tap('.dw[data-w="members"] .dw-glance') },
      { name: "sheet-activity", act: tap('.dw[data-w="activity"] .dw-glance') },
      { name: "sheet-docs", act: tap('.dw[data-w="docs"] .dw-glance') },
      { name: "create", act: tap(".mtb-create") },
      { name: "more", act: tap('.mtb-tab[aria-label^="More pages"]') },
    ],
  },
  { id: "timeline", path: "/timeline", ready: ".mtb", scenes: [full, fold] },
  { id: "members", path: "/brothers", ready: ".mtb", scenes: [full, fold] },
  { id: "chapter", path: "/chapter", ready: ".mtb", scenes: [full, fold,
    // The minutes sheet (phone): the newest past meeting with minutes, then its other tabs.
    { name: "minutes", act: tap(".led-row:not(.missing)", 1400) },
    { name: "minutes-sum", act: async p => { await tap(".led-row:not(.missing)", 1400)(p); await tap('.mt-chrome .mt-tabs [role="tab"]:nth-child(2)')(p); } },
    { name: "minutes-att", act: async p => { await tap(".led-row:not(.missing)", 1400)(p); await tap('.mt-chrome .mt-tabs [role="tab"]:nth-child(3)', 1400)(p); } },
    { name: "minutes-none", act: tap(".led-row.missing", 1400) },
  ] },
  { id: "tasks", path: "/tasks", ready: ".mtb", scenes: [full, fold,
    // Scoped to the page's own controls so they can't hit a sheet's chips.
    { name: "mine", tall: true, act: tap('.tks-ctl .tks-seg button:nth-child(2)') },
    { name: "done", tall: true, act: tap(".tks-col-side .tks-done-bar") },
    { name: "spot", act: tap(".tks-pile.over .tks-t", 1400) },
    { name: "spot-each", act: async p => { await p.locator(".tks-t", { hasText: "Sign the risk waiver" }).first().click(); await p.waitForTimeout(1400); } },
    { name: "spot-hist", act: async p => { await tap(".tks-pile.up .tks-t", 1400)(p); await tap(".tks-spot .hist-d summary")(p); await p.locator(".tks-spot .sp-scroll").evaluate(e => e.scrollTo(0, e.scrollHeight)); await p.waitForTimeout(400); } },
    { name: "ballot", act: tap(".tks-col-side .tks-vote-h .q", 1200) },
    { name: "new-task", act: tap(".tks-head-btns .tks-btn:not(.soft)", 1200) },
    { name: "new-task-roles", act: async p => { await tap(".tks-head-btns .tks-btn:not(.soft)", 1200)(p); await tap('.tsh-modes .mode[data-m="roles"]')(p); } },
    { name: "new-task-all", act: async p => { await tap(".tks-head-btns .tks-btn:not(.soft)", 1200)(p); await tap('.tsh-modes .mode[data-m="all"]')(p); } },
    { name: "new-poll", act: tap(".tks-head-btns .tks-btn.soft", 1200) },
  ] },
  { id: "docs", path: "/docs", ready: ".mtb", scenes: [full, fold,
    // GET only: the forms open but never submit.
    { name: "add", adminOnly: true, act: tap(".dx-actions .dx-add:not(.ghost)", 1200) },
    { name: "folder", adminOnly: true, act: tap(".dx-actions .dx-add.ghost", 1200) },
    { name: "menu", act: tap(".dx-row:not(.ghost-add) .dx-menu-btn") },
    { name: "pin-menu", act: tap(".dx-pinned-card .dx-menu-btn") },
    { name: "edit", adminOnly: true, act: async p => { await tap(".dx-row:not(.ghost-add) .dx-menu-btn")(p); await tap('.dx-menu button:has-text("Edit")', 1200)(p); } },
    { name: "move", adminOnly: true, act: async p => { await tap(".dx-row:not(.ghost-add) .dx-menu-btn")(p); await tap('.dx-menu button:has-text("Move to folder")', 1200)(p); } },
    { name: "delete", adminOnly: true, act: async p => { await tap(".dx-row:not(.ghost-add) .dx-menu-btn")(p); await tap('.dx-menu button.del', 1200)(p); } },
    { name: "folder-menu", adminOnly: true, act: tap(".dx-sec-head .dx-menu-btn") },
    { name: "folder-delete", adminOnly: true, act: async p => { await tap(".dx-sec-head .dx-menu-btn")(p); await tap('.dx-menu button.del', 1200)(p); } },
    { name: "rename", adminOnly: true, act: async p => { await tap(".dx-sec-head .dx-menu-btn")(p); await tap('.dx-menu button:has-text("Rename")', 1200)(p); } },
    { name: "filter", tall: true, act: tap(".dx-seg button:nth-child(5)") },
    { name: "filter-none", tall: true, act: tap(".dx-seg button:nth-child(2)") },
    { name: "nomatch", tall: true, act: async p => { await p.locator(".dx-search input").fill("zzzz"); await p.waitForTimeout(600); } },
    { name: "collapsed", tall: true, act: tap(".dx-section .dx-sec-head") },
  ] },
  { id: "media", path: "/media", ready: ".mtb", scenes: [full, fold,
    { name: "add", adminOnly: true, act: tap(".igp-head-actions .igp-btn", 1200) },
    { name: "detail", act: tap(".igp-row-open", 1400) },
    { name: "detail-posted", act: tap(".igp-ln-posted .igp-row-open", 1400) },
    { name: "edit", adminOnly: true, act: async p => { await tap(".igp-row-open", 1400)(p); await tap(".igp-rail-f .igp-btn.ghost", 1200)(p); } },
    { name: "delete", adminOnly: true, act: async p => { await tap(".igp-row-open", 1400)(p); await tap(".igp-rail-f .igp-btn.del", 1200)(p); } },
    { name: "month", tall: true, act: tap(".igp-tabs button:nth-child(2)", 1200) },
    { name: "nomatch", tall: true, act: async p => { await p.locator(".igp-search input").fill("zzzz"); await p.waitForTimeout(600); } },
    { name: "idea", adminOnly: true, act: tap(".igp-ideas .chips button", 1200) },
  ] },
  { id: "programming", path: "/events", ready: ".mtb", scenes: [full] },
  { id: "service", path: "/service", ready: ".mtb", scenes: [full] },
  { id: "parties", path: "/parties", ready: ".mtb", scenes: [full] },
  { id: "fundraisers", path: "/fundraisers", ready: ".mtb", scenes: [full] },
  // The page as it opens (day one has no tabs: the open-books question or the member lock),
  // and its two forms.
  { id: "treasury", path: "/treasury", ready: ".mtb", scenes: [
    full, fold,
    { name: "log", act: tap(".dash-treasury .tr-head-actions .tr-add:not(.tr-add-reimb)", 1200) },
    { name: "reimb", act: tap(".dash-treasury .tr-add-reimb", 1200) },
  ] },
  ...["Overview", "Transactions", "Dues", "Reports", "Reimbursements"].map((t): PageSpec => {
    const open = async (p: Page) => { const b = p.locator(`[data-tab="${t}"]`).first(); if (await b.count()) { await b.click(); await p.waitForTimeout(1500); } else throw new Error(`no ${t} tab`); };
    const then = (name: string, sel: string, tall = false): Scene => ({ name, tall, act: async p => { await open(p); await tap(sel, 1200)(p); } });
    const extra: Scene[] = t === "Reimbursements" ? [
      then("approve", ".tr-reimb-act-approve"), then("decline", ".tr-reimb-act-reject"), then("resolved", ".tr-reimb-archive-toggle", true),
    ] : t === "Dues" ? [
      then("drawer", ".du-tag"), then("handout", ".du-cta .du-btn:not(.du-ghost)"), then("edit-charge", ".du-stub-more"),
    ] : [];
    return { id: `treasury-${t.toLowerCase()}`, path: "/treasury", ready: ".mtb", scenes: [{ name: "full", tall: true, act: open }, ...extra] };
  }),
  ...["identity", "accounts", "invitations", "roles", "member-fields", "thresholds", "semesters", "custom-metrics", "event-types", "event-fields", "calendar", "opening-balance", "money-categories", "workflows", "activity-log"]
    .map((s): PageSpec => ({ id: `settings-${s}`, path: `/settings?section=${s}`, ready: ".mtb", scenes: [full], adminOnly: true })),
];

async function guard(p: Page) {
  await p.route(u => u.pathname.startsWith("/api/"), async (r: Route) => {
    if (r.request().method() !== "GET") return r.abort();
    for (let i = 0; ; i++) {
      const res = await r.fetch({ timeout: 60000 }).catch(() => null);
      if (res && (res.status() < 500 || i === 4)) return r.fulfill({ response: res });
      if (!res && i === 4) return r.abort();
      await new Promise(z => setTimeout(z, 800));
    }
  });
}

(async () => {
  // Refuse unless :3100 really is on the throwaway DB (the restart trap: a bare
  // `next dev` in the worktree silently talks to the shared database).
  const cfg = await fetch(`${BASE}/api/mobile/config`).catch(() => null);
  if (!cfg?.ok) throw new Error(":3100 isn't up");
  const db = new pg.Client({ connectionString: DB });
  await db.connect();
  const q = async (sql: string, a: unknown[] = []) => (await db.query(sql, a)).rows;
  const orgs = await q(`select id, slug from "Organization" where slug in ('ok-today','dl-today')`);
  const busy = orgs.find(o => o.slug === "ok-today"), dayone = orgs.find(o => o.slug === "dl-today");
  if (!busy || !dayone) throw new Error("seed missing: run scripts/_today-seed.ts");
  const adminOf = async (org: number) => (await q(`select "brotherId" from "Membership" where "organizationId"=$1 and "isOrgAdmin" and "archivedAt" is null order by "brotherId" limit 1`, [org]))[0]?.brotherId as number | undefined;
  const memberOf = async (org: number) => (await q(
    `select m."brotherId" from "Membership" m where m."organizationId"=$1 and not m."isOrgAdmin" and m."archivedAt" is null
       and not exists (select 1 from "BrotherRole" r join "Role" ro on ro.id=r."roleId" where r."brotherId"=m."brotherId" and ro."organizationId"=$1)
     order by m."brotherId" desc limit 1`, [org]))[0]?.brotherId as number | undefined;
  const who: Record<OrgKey, { org: { id: number; slug: string }; admin?: number; member?: number }> = {
    busy: { org: busy, admin: await adminOf(busy.id), member: await memberOf(busy.id) },
    dayone: { org: dayone, admin: await adminOf(dayone.id), member: await memberOf(dayone.id) },
  };
  await db.end();
  console.log(JSON.stringify(who));

  const engine = ENGINE === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  const log: string[] = [];
  const index: Record<string, string[]> = {};

  for (const orgKey of ["busy", "dayone"] as OrgKey[]) {
    if (ORGS && !ORGS.includes(orgKey)) continue;
    for (const viewer of ["admin", "member"] as Viewer[]) {
      if (VIEWERS && !VIEWERS.includes(viewer)) continue;
      const brother = who[orgKey][viewer];
      if (!brother) { log.push(`${orgKey}/${viewer}: nobody to be`); continue; }
      for (const theme of ["night", "day"] as Theme[]) {
        if (THEMES && !THEMES.includes(theme)) continue;
        for (const spec of PAGES) {
          if (ONLY && !ONLY.some(o => spec.id === o || spec.id.startsWith(`${o}-`))) continue;
          if (spec.adminOnly && viewer !== "admin") continue;
          // Day one + night is enough for the empty states; skip their day captures of settings.
          if (orgKey === "dayone" && theme === "day" && spec.id.startsWith("settings-")) continue;
          mkdirSync(`${OUT}/${spec.id}`, { recursive: true });
          for (const scene of spec.scenes) {
            if (scene.adminOnly && viewer !== "admin") continue;
            if (SCENES && !SCENES.includes(scene.name)) continue;
            const file = `${OUT}/${spec.id}/${orgKey}-${viewer}-${theme}-${scene.name}.png`;
            const ctx = await browser.newContext({
              ...devices["iPhone 14"],
              viewport: { width: 390, height: scene.tall ? 3200 : 844 },
            } as Parameters<typeof browser.newContext>[0]);
            await ctx.addCookies([
              { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(brother), url: BASE },
              { name: "active_org_id", value: String(who[orgKey].org.id), url: BASE },
            ]);
            await ctx.addInitScript(t => {
              try {
                localStorage.setItem("chaptos:theme:v1", t);
                // The calendar invite card and first-visit nudges would cover the page.
                localStorage.setItem("chaptos:first-load-splash:v1", "1");
              } catch { /* private mode */ }
            }, theme === "day" ? "ivory" : "dusk");
            const p = await ctx.newPage();
            p.on("pageerror", e => log.push(`${file}: pageerror ${String(e).slice(0, 200)}`));
            await guard(p);
            try {
              await p.goto(`${BASE}/org/${who[orgKey].org.slug}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
              await p.addStyleTag({ content: "nextjs-portal{display:none!important} *{scroll-behavior:auto!important; caret-color: transparent !important}" }).catch(() => {});
              let ok = false;
              for (let t = 0; t < 3 && !ok; t++) {
                ok = await p.waitForSelector(spec.ready, { timeout: 45000 }).then(() => true, () => false);
                if (!ok) await p.reload({ waitUntil: "domcontentloaded" });
              }
              if (!ok) throw new Error("never loaded");
              // Let every fetch settle: no skeletons in a reference.
              await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
              await p.waitForTimeout(2500);
              if (scene.act) await scene.act(p);
              await p.waitForTimeout(600);
              await p.screenshot({ path: file });
              (index[spec.id] ??= []).push(file.split("/").pop()!);
              process.stdout.write(".");
            } catch (e) {
              log.push(`${file}: ${(e as Error).message.split("\n")[0]}`);
              process.stdout.write("x");
            }
            await p.unrouteAll({ behavior: "ignoreErrors" });
            await ctx.close();
          }
        }
      }
    }
  }
  await browser.close();
  // Merge into the existing index: a filtered run (ONLY=…) must not drop other pages' entries.
  let prev: { index?: Record<string, string[]> } = {};
  try { prev = JSON.parse(readFileSync(`${OUT}/index.json`, "utf8")); } catch { /* first run */ }
  const merged = { ...(prev.index ?? {}) };
  for (const [k, v] of Object.entries(index)) merged[k] = [...new Set([...(ONLY ? (merged[k] ?? []) : []), ...v])].sort();
  writeFileSync(`${OUT}/index.json`, JSON.stringify({ capturedAt: new Date().toISOString(), who, index: merged, problems: log }, null, 2));
  console.log(`\n${log.length ? log.join("\n") : "no problems"}`);
})();
