/** Real browser checks of the subscription and schedule components with a mocked API.
 * Live provider compatibility is a separate gated rollout requirement. */
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

async function main() {
  const temp = await mkdtemp(join(tmpdir(), "calendar-ui-"));
  const root = process.cwd();
  await writeFile(join(temp, "api.ts"), `
export const apiErrorMessage=(e,fallback)=>e.message||fallback;
let state={enabled:true,available:true,url:'https://example.invalid/api/calendar/feeds/test/disposable-test-token.ics',orgName:'Alpha Test',preview:[{title:'Chapter meeting',location:'',deadline:false,timeUnconfirmed:false,schedule:{kind:'timed',start:'2026-10-06T23:00:00Z',end:'2026-10-07T01:00:00Z',timeZone:'America/New_York'}},{title:'Deadline: Dues',location:'',deadline:true,timeUnconfirmed:false,schedule:{kind:'allDay',start:'2026-10-08',end:'2026-10-09'}},{title:'Retreat',location:'',deadline:false,timeUnconfirmed:false,schedule:{kind:'allDay',start:'2026-10-10',end:'2026-10-12'}}],timeZone:'America/New_York',admin:true,validated:true,validating:false,configured:true,problem:null,issues:[{kind:'time-unconfirmed',source:'calendar',id:7,title:'Chapter meeting',issue:'x',blocking:false,date:'2026-10-05',time:'7-9pm'}],health:{pending:false,failedAt:null,processedAt:'2026-09-29',failures:0},status:{state:'current',updatedAt:new Date(Date.now()-180000).toISOString()},generation:0};
// ?setup: a first-time admin. No saved zone, one legacy deadline and one unlinked service project.
if(location.search==='?setup')state={...state,enabled:false,url:null,timeZone:null,validated:false,health:{pending:true,failedAt:null,processedAt:null,failures:0},issues:[{kind:'legacy-deadline',source:'calendar',id:9,title:'Old dues deadline',issue:'x',blocking:true},{kind:'unlinked-service',source:'service',id:3,title:'Food bank',issue:'x',blocking:true}]};
let settleOnNextLoad=false;
export async function requestJson(url,opts){
 if(opts?.method==='DELETE'){ window.actions.push('delete:'+url);state={...state,issues:state.issues.filter(i=>!url.endsWith('/'+i.id))};return null; }
 if(opts?.method==='PATCH'){ const body=JSON.parse(opts.body);window.actions.push(body.action);window.bodies=[...(window.bodies||[]),body];if(body.action==='disable')state={...state,enabled:false,url:null};if(body.action==='rotate')state={...state,url:'https://example.invalid/replacement.ics',generation:state.generation+1};
  if(body.action==='link')state={...state,issues:state.issues.filter(i=>!(i.source===body.source&&i.id===body.id))};
  // The worker settles on a later load, as the real poll would see it.
  if(body.action==='turnOn'){state={...state,timeZone:body.timeZone??state.timeZone,validating:true,turningOn:true};settleOnNextLoad=true;}
  return {ok:true}; }
 if(url.includes('summary=1')) return {live:Boolean(state.url)};
 if(settleOnNextLoad&&window.actions.length&&window.settle){settleOnNextLoad=false;state={...state,validating:false,turningOn:false,validated:true,enabled:true,url:'https://example.invalid/api/calendar/feeds/test/disposable-test-token.ics',health:{pending:false,failedAt:null,processedAt:new Date().toISOString(),failures:0}};}
 if(url.includes('summary=1')) return {live:Boolean(state.url)};
 return {...state};
}`);
  await build({ stdin: { contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {CalendarSubscription} from '${root}/app/components/timeline/CalendarSubscription';
import {CalendarEventForm} from '${root}/app/components/timeline/CalendarEventForm';
import {CalendarInviteCard, AddThisEvent} from '${root}/app/components/timeline/CalendarInvite';
import '${root}/app/components/dashboard/dashboard-ledger.css';
import '${root}/app/components/dashboard/timeline-ledger.css';
import '${root}/app/[slug]/settings/settings-ledger.css';
window.actions=[];window.submitted=null;window.subscribed=0;
// ?a3: the dashboard invite, the event sheet's one-off links and the admin message, inside the real .dash styles.
createRoot(document.getElementById('root')).render(location.search==='?setup'
 ? <div className="dash" data-dashboard-theme="dusk"><main><style>{'.dash p,.dash h3{margin:0}'}</style><div className="set-section"><CalendarSubscription settings/></div></main></div>
 : location.search==='?a3'
 ? <div className="dash" data-dashboard-theme="dusk"><main><style>{'.dash p,.dash h3{margin:0}'}</style><CalendarInviteCard/><div className="ev" style={{margin:'24px 0',maxWidth:338}}><AddThisEvent eventId={42} onSubscribe={()=>{window.subscribed++;}}/></div><div className="set-section"><CalendarSubscription settings/></div></main></div>
 : <main><CalendarSubscription/><CalendarSubscription settings/><CalendarEventForm submitLabel="Save schedule" categoryOptions={[{slug:'chapter',label:'Chapter',mandatoryDefault:true}]} onSubmit={draft=>{window.submitted=draft;}}/></main>);
`, resolveDir: root, loader: "tsx" }, bundle: true, outfile: join(temp, "main.js"), jsx: "automatic", platform: "browser", format: "iife", alias: { "@": root }, plugins: [{ name: "mock-api", setup(builder) { builder.onResolve({ filter: /lib\/api$/ }, () => ({ path: join(temp, "api.ts") })); } }], define: { "process.env.NODE_ENV": '"development"' } });
  const server = createServer(async (req, res) => {
    if (req.url === "/main.js" || req.url === "/main.css") { res.setHeader("Content-Type", req.url.endsWith("css") ? "text/css" : "text/javascript"); res.end(await readFile(join(temp, req.url.slice(1)))); return; }
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/main.css"><style>body{font-family:system-ui;background:#161310;color:#ece7dd}main{max-width:640px;margin:auto;padding:20px}button,input,select{font:inherit}section{margin-bottom:30px}button{cursor:pointer}label{display:block}</style></head><body><div id="root"></div><script src="/main.js"></script></body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" });
  // Simulate a clipboard the browser refuses, to exercise the manual-copy fallback.
  await page.addInitScript('Object.defineProperty(navigator, "clipboard", { value: { writeText: function () { return Promise.reject(new Error("denied")); } } });');
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/alpha`);
    // Desktop (Windows): Google is preselected; one big button, everything else folded away.
    const trigger = page.getByRole("button", { name: "Add to my calendar", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    const google = dialog.getByRole("link", { name: "Add to Google Calendar" });
    await google.waitFor();
    await page.waitForFunction(() => document.querySelector(".cal-cta")?.getAttribute("href")?.startsWith("https://calendar.google.com"));
    // One-click Google: the add-by-URL screen, prefilled with the webcal form of the feed.
    const googleHref = new URL(await google.getAttribute("href") ?? "");
    assert.equal(googleHref.origin + googleHref.pathname, "https://calendar.google.com/calendar/r");
    assert.equal(googleHref.searchParams.get("cid"), "webcal://example.invalid/api/calendar/feeds/test/disposable-test-token.ics");
    assert.equal(await google.getAttribute("target"), "_blank");
    assert.equal(await google.getAttribute("referrerpolicy"), "no-referrer");
    if (process.env.A3_SHOTS) await dialog.screenshot({ path: join(process.env.A3_SHOTS, "dialog-900.png") });
    const text = await dialog.innerText();
    assert.match(text, /Alpha Test/);
    assert.equal(await dialog.getByRole("radio", { name: "Google Calendar" }).isChecked(), true);
    assert.doesNotMatch(text, /iCloud/);
    // The copy-and-paste fallback, troubleshooting and status sit behind one closed disclosure.
    assert.equal(await dialog.getByText("Or add it by link").isVisible(), false);
    await dialog.getByText("Having trouble?").click();
    await dialog.getByText("Or add it by link").waitFor();
    const trouble = await dialog.innerText();
    assert.match(trouble, /From URL/);
    assert.match(trouble, /Keep this link private/);
    assert.match(trouble, /one-time copy/);
    assert.match(trouble, /Calendar updated by ChaptOS · 3 min ago/);
    // Clipboard refused: say so and leave the link selected for a manual copy.
    await dialog.getByRole("button", { name: "Copy", exact: true }).click();
    assert.match(await dialog.getByRole("alert").innerText(), /Couldn't copy automatically/);
    assert.equal(await page.evaluate(() => { const el = document.activeElement as HTMLInputElement; return el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0); }), "https://example.invalid/api/calendar/feeds/test/disposable-test-token.ics");
    // Keyboard: arrow keys move between providers.
    await dialog.getByRole("radio", { name: "Google Calendar" }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await dialog.getByRole("radio", { name: "Apple Calendar" }).isChecked(), true);
    const apple = dialog.getByRole("link", { name: "Open in Apple Calendar" });
    assert.match(await apple.getAttribute("href") ?? "", /^webcal:\/\/example\.invalid\//);
    assert.match(await dialog.innerText(), /Open this page on your iPhone, iPad or Mac/);
    assert.doesNotMatch(await dialog.innerText(), /From URL/);
    // Pressing the button is the (self-reported) record; never claims a connection.
    await apple.evaluate(el => el.addEventListener("click", e => e.preventDefault()));
    await apple.click();
    assert.match(await dialog.innerText(), /Added/);
    assert.doesNotMatch(await dialog.innerText(), /Connected/i);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    // Reopening is instant: the cached answer renders the live button on first paint.
    await trigger.click();
    assert.match(await dialog.locator(".cal-cta").getAttribute("href") ?? "", /^(webcal|https):/);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    // iPhone: Apple preselected; Google hands off to a computer without the feed secret.
    const phone = await browser.newPage({ viewport: { width: 375, height: 740 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
    phone.on("pageerror", error => errors.push(error.message));
    await phone.goto(page.url());
    await phone.getByRole("button", { name: "Add to my calendar", exact: true }).first().click();
    const sheet = phone.getByRole("dialog");
    await sheet.getByText("pick iCloud", { exact: false }).waitFor();
    if (process.env.A3_SHOTS) await phone.screenshot({ path: join(process.env.A3_SHOTS, "dialog-375.png") });
    assert.equal(await sheet.getByRole("radio", { name: "Apple Calendar" }).isChecked(), true);
    assert.doesNotMatch(await sheet.innerText(), /Open this page on your iPhone/);
    await sheet.getByRole("radio", { name: "Google Calendar" }).check();
    assert.match(await sheet.innerText(), /Google only adds calendars from a computer/);
    const handoff = await sheet.getByLabel("Link to open on your computer").inputValue();
    assert.match(handoff, /^http:\/\/127\.0\.0\.1:\d+\/alpha\/timeline\?subscribe=google$/);
    assert.doesNotMatch(handoff, /token|feeds/);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.equal(await sheet.getByRole("link", { name: "Add to Google Calendar" }).count(), 0);
    await sheet.getByRole("button", { name: /I'm on a computer/ }).click();
    await sheet.getByRole("link", { name: "Add to Google Calendar" }).waitFor();
    await phone.close();
    await phone.close();

    // Live: no setup steps left, just the zone and the Advanced controls.
    assert.match(await page.getByRole("status").filter({ hasText: "On for members" }).innerText(), /On for members/);
    assert.equal(await page.getByRole("button", { name: "Turn on for members" }).count(), 0);
    // Advanced: regeneration needs an explicit confirmation.
    await page.getByText("Advanced", { exact: true }).click();
    await page.getByRole("button", { name: "Regenerate URL", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => (window as unknown as { actions: string[] }).actions), []);
    await page.getByRole("button", { name: "Regenerate and revoke old URL" }).click();
    await page.waitForFunction(() => (window as unknown as { actions: string[] }).actions.includes("rotate"));
    // The member who added the old link is told it was replaced, and can re-add.
    await trigger.click();
    await dialog.getByText("This calendar link was replaced").waitFor();
    const readd = dialog.locator(".cal-cta");
    await readd.evaluate(el => el.addEventListener("click", e => e.preventDefault()));
    await readd.click();
    assert.doesNotMatch(await dialog.innerText(), /This calendar link was replaced/);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Turn off for members" }).click();
    await page.waitForFunction(() => (window as unknown as { actions: string[] }).actions.includes("disable"));
    await trigger.click();
    await dialog.getByText("paused calendar updates").waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    // All-day fixer prefills the times the text clearly states.
    await page.getByRole("button", { name: "Set time" }).click();
    const fixer = page.locator("li", { hasText: "Chapter meeting" });
    assert.equal(await fixer.getByLabel("Starts", { exact: true }).inputValue(), "19:00");
    assert.equal(await fixer.getByLabel("Ends", { exact: true }).inputValue(), "21:00");

    // New events default to a real start/end in the organization's zone.
    const form = page.locator("form.cef");
    await form.getByLabel("Title", { exact: true }).fill("DST test");
    assert.match(await form.innerText(), /Times in New York/);
    await form.getByLabel("Date", { exact: true }).fill("2026-03-08");
    await form.getByLabel("Starts", { exact: true }).fill("02:30");
    await form.getByLabel("Ends", { exact: true }).fill("04:00");
    await page.getByRole("button", { name: "Save schedule" }).click();
    assert.match(await form.getByRole("alert").last().innerText(), /doesn't exist on this date/);
    assert.equal(await page.evaluate(() => (window as unknown as { submitted: unknown }).submitted), null);
    // A repeated hour asks which one instead of failing.
    await form.getByLabel("Date", { exact: true }).fill("2026-11-01");
    await form.getByLabel("Starts", { exact: true }).fill("01:30");
    await form.getByLabel("Ends", { exact: true }).fill("02:30");
    await form.getByLabel(/The first time \(EDT\)/).check();
    await page.getByRole("button", { name: "Save schedule" }).click();
    const submitted = await page.evaluate(() => (window as unknown as { submitted: { schedule: unknown; time: string } }).submitted);
    assert.deepEqual(submitted.schedule, { kind: "timed", start: "2026-11-01T05:30:00Z", end: "2026-11-01T07:30:00Z", timeZone: "America/New_York" });
    assert.equal(submitted.time, "01:30");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);

    // ── A3 ────────────────────────────────────────────────────────────────
    const origin = new URL(page.url()).origin;
    for (const width of [900, 375]) {
      const a3 = await browser.newPage({ viewport: { width, height: 900 }, userAgent: width < 400 ? "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" : undefined });
      a3.on("pageerror", error => errors.push(error.message));
      await a3.goto(`${origin}/alpha?a3`);
      // Dashboard invite: shown while live and not yet added or dismissed.
      const invite = a3.getByRole("region", { name: "Get chapter events in your own calendar" });
      await invite.waitFor();
      await a3.screenshot({ path: join(temp, `a3-${width}.png`), fullPage: true });
      if (process.env.A3_SHOTS) await writeFile(join(process.env.A3_SHOTS, `a3-${width}.png`), await readFile(join(temp, `a3-${width}.png`)));
      // Event sheet: both one-off links, scoped to the org, with the "won't update" note.
      assert.equal(await a3.getByRole("link", { name: "Google Calendar" }).getAttribute("href"), "/api/calendar/42/export?to=google&org=alpha");
      assert.equal(await a3.getByRole("link", { name: "Google Calendar" }).getAttribute("target"), "_blank");
      assert.equal(await a3.getByRole("link", { name: /Apple/ }).getAttribute("href"), "/api/calendar/42/export?to=ics&org=alpha");
      assert.notEqual(await a3.getByRole("link", { name: /Apple/ }).getAttribute("download"), null);
      assert.match(await a3.locator(".cal-one").innerText(), /won't change if this event does/);
      await a3.getByRole("button", { name: "Get every event, kept up to date" }).click();
      assert.equal(await a3.evaluate(() => (window as unknown as { subscribed: number }).subscribed), 1);
      // Admin message: the setup link, never the feed secret.
      const message = await a3.locator(".cal-tell-msg").innerText();
      assert.match(message, new RegExp(`^Alpha Test's calendar is now in ChaptOS\\..*${origin.replace(/[.:/]/g, "\\$&")}/alpha/timeline\\?subscribe=1$`));
      assert.doesNotMatch(message, /token|feeds|\.ics/);
      await a3.getByRole("button", { name: "Copy message" }).click();
      assert.match(await a3.getByRole("alert").last().innerText(), /message is selected/);
      assert.equal(await a3.evaluate(() => window.getSelection()?.toString()), message);
      assert.equal(await a3.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      if (width === 900) {
        // "Not now" is remembered in this browser.
        await invite.getByRole("button", { name: "Not now" }).click();
        await invite.waitFor({ state: "detached" });
        await a3.reload();
        await a3.locator(".cal-tell-msg").waitFor();
        assert.equal(await invite.count(), 0);
      } else {
        // Marking it added from the card's dialog retires the card.
        await invite.getByRole("button", { name: "Add to my calendar" }).click();
        const sheet = a3.getByRole("dialog");
        // Android: Google starts on the computer handoff.
        await sheet.getByRole("button", { name: /I'm on a computer/ }).click();
        const cta = sheet.getByRole("link", { name: "Add to Google Calendar" });
        await a3.waitForFunction(() => document.querySelector(".cal-cta")?.getAttribute("aria-disabled") === "false");
        await cta.evaluate(el => el.addEventListener("click", e => e.preventDefault()));
        await cta.click();
        await a3.keyboard.press("Escape");
        await invite.waitFor({ state: "detached" });
      }
      await a3.close();
    }
    // Feed off: no invite at all.
    await page.goto(`${origin}/alpha?a3`);
    await page.locator(".cal-tell-msg, .sc-note").first().waitFor();
    assert.equal(await page.locator(".cal-invite").count(), 0);

    // ── First-time setup from Settings, at desktop and phone widths ─────────
    for (const width of [900, 375]) {
      const setup = await browser.newPage({ viewport: { width, height: 900 }, timezoneId: "America/Chicago" });
      setup.on("pageerror", error => errors.push(error.message));
      await setup.goto(`${origin}/alpha?setup`);
      const turnOn = setup.getByRole("button", { name: "Turn on for members" });
      await turnOn.waitFor();
      // The zone is prefilled from this device, not asked for as a separate step.
      assert.match(await setup.locator(".cal-check").innerText(), /Chicago[\s\S]*America\/Chicago[\s\S]*from this device/);
      // Blocked until both items are fixed here, without leaving the page.
      assert.equal(await turnOn.isDisabled(), true);
      assert.match(await setup.locator(".set-section").innerText(), /Fix the 2 items above first/);
      await setup.screenshot({ path: join(temp, `setup-${width}.png`), fullPage: true });
      if (process.env.A3_SHOTS) await writeFile(join(process.env.A3_SHOTS, `setup-${width}.png`), await readFile(join(temp, `setup-${width}.png`)));
      const legacy = setup.locator("li", { hasText: "Old dues deadline" });
      await legacy.getByRole("button", { name: "Delete" }).click();
      await legacy.getByRole("button", { name: "Delete entry" }).click();
      await legacy.waitFor({ state: "detached" });
      await setup.locator("li", { hasText: "Food bank" }).getByRole("button", { name: "Add to timeline" }).click();
      await setup.getByText("Food bank").waitFor({ state: "detached" });
      assert.equal(await setup.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      // One click: saves the zone and turns on once the worker's check passes.
      await turnOn.click();
      await setup.getByText("switches on by itself").waitFor();
      const w = setup as unknown as { evaluate: typeof setup.evaluate };
      assert.deepEqual(await w.evaluate(() => (window as unknown as { actions: string[] }).actions), ["delete:/api/calendar/9", "link", "turnOn"]);
      assert.deepEqual(await w.evaluate(() => (window as unknown as { bodies: unknown[] }).bodies), [{ action: "link", source: "service", id: 3 }, { action: "turnOn", timeZone: "America/Chicago" }]);
      await setup.evaluate(() => { (window as unknown as { settle: boolean }).settle = true; });
      await setup.getByText("On for members").waitFor({ timeout: 10_000 });
      await setup.locator(".cal-tell-msg").waitFor();
      await setup.close();
    }

    assert.deepEqual(errors, []);
    console.log("Calendar browser checks passed: one-button dialog with folded troubleshooting + publishing status, cached instant reopen, replaced-link and paused notices, provider chooser (UA preselect, keyboard switch), privacy note, clipboard fallback, press-to-record confirmation, focus restoration, one-click Google + copy fallback, iPhone Google handoff without secret, webcal, one-click turn-on with device zone + in-place fixes at 900 and 375px, rotation confirmation, turn off, all-day fixer prefill, timed default, DST gap and repeated hour, narrow viewport; A3 dashboard invite (dismiss, added, feed off), event-sheet one-off links, admin message without secret at 900 and 375px.");
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(temp, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
