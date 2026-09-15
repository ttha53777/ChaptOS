/** Real components in Chromium with simulated API and OAuth boundaries.
 * Service concurrency/RLS tests exercise the database separately.
 */
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

async function main() {
  const temp = await mkdtemp(join(tmpdir(), "figurints-invites-browser-"));
  const root = process.cwd();
  const artifacts = process.env.INVITE_SCREENSHOT_DIR ?? join(temp, "screenshots");
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(temp, "context.ts"), `const setCount = n => window.pendingCount = n; export const useChapter = () => ({ can: () => true, currentUser: {org:{slug:'alpha',vocabularyOverrides:{}}}, setPendingJoinRequestCountLocal: setCount });`);
  await writeFile(join(temp, "navigation.ts"), `export const usePathname = () => window.location.pathname;`);
  await writeFile(join(temp, "link.tsx"), `import React from 'react'; export default function Link(p) { return <a {...p}/>; }`);
  await writeFile(join(temp, "supabase.ts"), `export const createClient = () => ({auth:{async signInWithOAuth(options){window.oauthOptions = options; return {error:null};}}});`);
  await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {JoinClient} from '${root}/app/join/[token]/JoinClient';
    import {JoinRequestsPanel} from '${root}/app/components/dashboard/JoinRequestsPanel';
    import {InvitationsSection} from '${root}/app/[slug]/settings/sections/InvitationsSection';
    const params = new URLSearchParams(location.search); const mode=params.get('view');
    const status = m => { document.getElementById('notice').textContent = m; };
    createRoot(document.getElementById('root')).render(mode === 'queue'
      ? <main className="dash" data-dashboard-theme="dusk"><JoinRequestsPanel memberWord="member" maxRank={100} onApproved={()=>{}} onSeatWall={()=>{}} onError={status} onStatus={status}/></main>
      : mode === 'links' ? <main className="set-page"><div className="dash" data-dashboard-theme="dusk"><section className="set-section"><InvitationsSection onStatus={status} onError={status}/></section></div></main>
      : <JoinClient token="valid-token" valid={true} reason={null} orgName="Alpha" orgLogoUrl={null}/>);
  `, resolveDir: root, loader: "tsx" }, bundle: true, nodePaths: [join(root, "node_modules")], outfile: join(temp, "main.js"), jsx: "automatic", platform: "browser", format: "iife",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "test-boundaries", setup(b) {
      b.onResolve({ filter: /ChapterContext$/ }, () => ({ path: join(temp, "context.ts") }));
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(temp, "navigation.ts") }));
      b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(temp, "link.tsx") }));
      b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(temp, "supabase.ts") }));
    } }], alias: { "@": root },
  });
  const css = await postcss([tailwind({ base: root })]).process(await readFile("app/globals.css", "utf8"), { from: resolve("app/globals.css") });
  await writeFile(join(temp, "main.css"), css.css + await readFile("app/components/dashboard/dashboard-ledger.css", "utf8") + await readFile("app/components/dashboard/brotherhood-ledger.css", "utf8") + await readFile("app/[slug]/settings/settings-ledger.css", "utf8"));
  const server = createServer(async (req, res) => {
    if (req.url === "/main.js" || req.url === "/main.css") {
      res.setHeader("Content-Type", req.url.endsWith("css") ? "text/css" : "text/javascript");
      res.end(await readFile(join(temp, req.url.slice(1)))); return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/main.css"><style>main{max-width:900px;margin:24px auto;padding:16px}#notice{padding:8px}</style></head><body><div id="notice" role="status"></div><div id="root"></div><script src="/main.js"></script></body></html>');
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  const org = { name: "Alpha", slug: "alpha", logoUrl: null };
  const account = { name: "Google name", email: "person@example.com", avatarUrl: null };
  let state = "pending", ownCalls = 0, rateLimited = false, queueFails = true, rolesFail = true, approved = false;
  const invite = { id: 1, token: "test-created-token", label: "Fall recruitment", status: "active", maxUses: 25, redemptionCount: 12, pendingCount: 8, availableUses: 5, createdByName: "Officer", expiresAt: null, revokedAt: null, createdAt: new Date().toISOString() };
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const send = (body: unknown, status = 200, headers = {}) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers });
    if (url.pathname === "/api/auth/invite-status") return send({ valid: true, state, org, account, submittedName: "Chosen name" });
    if (url.pathname === "/api/auth/join-status") {
      ownCalls++;
      if (rateLimited) return send({ error: "Slow down" }, 429, { "Retry-After": "30" });
      return send({ state, orgSlug: "alpha", account, submittedName: "Chosen name" });
    }
    if (url.pathname === "/api/auth/request-join") { state = "pending"; return send({ state, orgSlug: "alpha" }); }
    if (url.pathname === "/api/join-requests") {
      if (queueFails) return send({ error: "Unavailable" }, 500);
      return send({ rows: approved ? [] : [{ id: 1, name: "Jordan Lee", email: "jordan@example.com", avatarUrl: null, createdAt: new Date().toISOString(), inviteLabel: "Fall recruitment", inviteId: 1 }], total: approved ? 0 : 1, pendingTotal: approved ? 0 : 1, nextCursor: null, seats: { allowed: true } });
    }
    if (url.pathname === "/api/roles") return rolesFail ? send({}, 500) : send([{ id: 1, name: "Member", rank: 1 }]);
    if (url.pathname.endsWith("/approve")) { approved = true; return send({ brotherId: 2 }); }
    if (url.pathname === "/api/invites") return send(route.request().method() === "POST" ? invite : [invite]);
    return send({});
  });
  try {
    await page.clock.install();
    await page.goto(`${base}/join/valid-token`);
    await page.getByText("Chosen name", { exact: true }).waitFor();
    rateLimited = true;
    await page.getByRole("button", { name: "Check status", exact: true }).click();
    await page.getByText("Connection interrupted — retrying.").waitFor();
    assert.equal(await page.locator("#join-name").count(), 0, "a failed poll must never reveal the form");
    const afterFailure = ownCalls;
    await page.getByRole("button", { name: "Check status", exact: true }).click();
    await page.clock.runFor(1000);
    assert.equal(ownCalls, afterFailure, "manual retry must honor Retry-After");
    await page.screenshot({ path: join(artifacts, "waiting-recovery-mobile.png"), fullPage: true });
    rateLimited = false; state = "already_member";
    await page.clock.runFor(31_000);
    await page.waitForURL("**/alpha?toast=welcome");

    // Replacement-link ready state, editable name, then the actual request CTA.
    state = "ready";
    await page.goto(`${base}/join/replacement`);
    await page.locator("#join-name").fill("Requested name");
    await page.getByRole("button", { name: /Request to join/ }).click();
    await page.getByText("Pending review", { exact: false }).waitFor();
    assert.equal(await page.locator("#join-name").count(), 0);

    state = "guest";
    await page.goto(`${base}/join/oauth`);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    const oauth = await page.evaluate(() => (window as unknown as { oauthOptions: { options: { redirectTo: string } } }).oauthOptions);
    assert.equal(new URL(oauth.options.redirectTo).searchParams.get("next"), "/join/valid-token");

    await page.goto(`${base}/alpha/brothers?view=queue`);
    await page.getByText("Couldn't load join requests. Try again.").waitFor();
    queueFails = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("button", { name: "Review", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText(/Couldn't load roles/).waitFor();
    rolesFail = false;
    await dialog.getByRole("button", { name: "Retry", exact: true }).click();
    await dialog.getByRole("option", { name: "Member", exact: true }).waitFor({ state: "attached" });
    await page.keyboard.press("Tab");
    assert(await dialog.evaluate(el => el.contains(document.activeElement)), "keyboard focus remains in the review dialog");
    await page.screenshot({ path: join(artifacts, "review-mobile.png"), fullPage: true });
    await dialog.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByText("Jordan Lee is now on the roster.").waitFor();
    await page.waitForFunction(() => (window as unknown as { pendingCount: number }).pendingCount === 0);

    await page.goto(`${base}/alpha/settings?view=links`);
    await page.getByText(/12 admitted · 8 waiting/).waitFor();
    await page.getByRole("button", { name: "Create invite link", exact: true }).click();
    await page.getByLabel("Invite link", { exact: true }).waitFor();
    await page.evaluate("Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard blocked'); } } })");
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await page.getByText("Couldn't copy to clipboard").waitFor();
    assert.match(await page.getByLabel("Invite link", { exact: true }).inputValue(), /test-created-token$/);
    await page.screenshot({ path: join(artifacts, "share-mobile.png"), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal mobile overflow");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, scenarios: ["poll recovery and Retry-After", "approval redirect", "replacement submit", "OAuth return URL", "queue retry", "role retry and keyboard focus", "approval and badge update", "share and clipboard fallback", "mobile overflow"], artifacts }));
  } catch (e) {
    console.error(JSON.stringify({ errors, text: await page.locator("body").innerText() }));
    await page.screenshot({ path: join(artifacts, "failure.png"), fullPage: true });
    throw e;
  } finally {
    await browser.close(); server.close();
    // Keep screenshots available for visual verification; remove only bundle files.
    await rm(join(temp, "main.js"), { force: true });
  }
}
main().catch(e => { console.error(e); process.exit(1); });
