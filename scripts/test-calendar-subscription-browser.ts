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
export async function requestJson(url,opts){
 if(opts?.method==='PATCH'){ const body=JSON.parse(opts.body);window.actions.push(body.action);if(body.action==='disable')state={...state,enabled:false,url:null};if(body.action==='rotate')state={...state,url:'https://example.invalid/replacement.ics',generation:state.generation+1};return {ok:true}; }
 return {...state};
}`);
  await build({ stdin: { contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {CalendarSubscription} from '${root}/app/components/timeline/CalendarSubscription';
import {CalendarEventForm} from '${root}/app/components/timeline/CalendarEventForm';
window.actions=[];window.submitted=null;
createRoot(document.getElementById('root')).render(<main><CalendarSubscription/><CalendarSubscription settings/><CalendarEventForm submitLabel="Save schedule" categoryOptions={[{slug:'chapter',label:'Chapter',mandatoryDefault:true}]} onSubmit={draft=>{window.submitted=draft;}}/></main>);
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
    // Desktop (Windows): Google is preselected and only its steps show.
    const trigger = page.getByRole("button", { name: "Add to my calendar", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("URL of calendar").waitFor();
    const text = await dialog.innerText();
    assert.match(text, /Alpha Test/);
    assert.match(text, /Chapter meeting[\s\S]*Deadline: Dues[\s\S]*Retreat/);
    assert.match(text, /Due Thu, Oct 8/);
    assert.match(text, /Sat, Oct 10 – Sun, Oct 11/);
    assert.match(text, /Not included: notes/);
    // Publishing status, and the troubleshooting panel stays shut while current.
    assert.match(text, /Calendar updated by ChaptOS · 3 min ago/);
    assert.equal(await dialog.locator("details", { hasText: "Calendar not updating?" }).evaluate(el => (el as HTMLDetailsElement).open), false);
    await dialog.getByText("Calendar not updating?").click();
    assert.match(await dialog.innerText(), /No: the latest changes were published 3 min ago/);
    assert.match(await dialog.innerText(), /imported a one-time copy/);
    assert.equal(await dialog.getByRole("radio", { name: "Google Calendar" }).isChecked(), true);
    assert.match(text, /From URL/);
    assert.doesNotMatch(text, /iCloud/);
    assert.match(text, /Anyone with this link can see your organization's published schedule\. Keep it private\./);
    // Clipboard refused: say so and leave the link selected for a manual copy.
    await dialog.getByRole("button", { name: "Copy", exact: true }).click();
    assert.match(await dialog.getByRole("alert").innerText(), /Couldn't copy automatically/);
    assert.equal(await page.evaluate(() => { const el = document.activeElement as HTMLInputElement; return el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0); }), "https://example.invalid/api/calendar/feeds/test/disposable-test-token.ics");
    // Keyboard: arrow keys move between providers.
    await dialog.getByRole("radio", { name: "Google Calendar" }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await dialog.getByRole("radio", { name: "Apple Calendar" }).isChecked(), true);
    assert.match(await dialog.getByRole("link", { name: "Open in Apple Calendar" }).getAttribute("href") ?? "", /^webcal:\/\/example\.invalid\//);
    assert.match(await dialog.innerText(), /iCloud/);
    assert.match(await dialog.innerText(), /Open this on your iPhone, iPad or Mac/);
    assert.doesNotMatch(await dialog.innerText(), /From URL/);
    // Self-reported only; never claims a connection.
    await dialog.getByRole("button", { name: "I've added it" }).click();
    assert.match(await dialog.innerText(), /You marked this as added/);
    assert.doesNotMatch(await dialog.innerText(), /Connected/i);
    await dialog.getByText("About this link").click();
    assert.match(await dialog.innerText(), /Removing a member does not revoke/);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);

    // iPhone: Apple preselected; Google hands off to a computer without the feed secret.
    const phone = await browser.newPage({ viewport: { width: 375, height: 740 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
    phone.on("pageerror", error => errors.push(error.message));
    await phone.goto(page.url());
    await phone.getByRole("button", { name: "Add to my calendar", exact: true }).first().click();
    const sheet = phone.getByRole("dialog");
    await sheet.getByText("Choose iCloud", { exact: false }).waitFor();
    assert.equal(await sheet.getByRole("radio", { name: "Apple Calendar" }).isChecked(), true);
    assert.doesNotMatch(await sheet.innerText(), /Open this on your iPhone/);
    await sheet.getByRole("radio", { name: "Google Calendar" }).check();
    assert.match(await sheet.innerText(), /only adds subscriptions in a computer browser/);
    const handoff = await sheet.getByLabel("Link to open on your computer").inputValue();
    assert.match(handoff, /^http:\/\/127\.0\.0\.1:\d+\/alpha\/timeline\?subscribe=google$/);
    assert.doesNotMatch(handoff, /token|feeds/);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await sheet.getByRole("button", { name: /I'm on a computer/ }).click();
    assert.match(await sheet.innerText(), /URL of calendar/);
    await phone.close();

    // Readiness checklist: every step done in this state, check can be re-run.
    await page.getByRole("button", { name: "Run the check again" }).click();
    await page.waitForFunction(() => (window as unknown as { actions: string[] }).actions.includes("validate"));
    // Advanced: regeneration needs an explicit confirmation.
    await page.getByText("Advanced", { exact: true }).click();
    await page.getByRole("button", { name: "Regenerate URL", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => (window as unknown as { actions: string[] }).actions), ["validate"]);
    await page.getByRole("button", { name: "Regenerate and revoke old URL" }).click();
    await page.waitForFunction(() => (window as unknown as { actions: string[] }).actions.includes("rotate"));
    // The member who added the old link is told it was replaced, and can re-add.
    await trigger.click();
    await dialog.getByText("replaced this calendar link").waitFor();
    assert.match(await dialog.innerText(), /Yes: the link you added was replaced/);
    await dialog.getByRole("button", { name: "I've added it" }).click();
    assert.doesNotMatch(await dialog.innerText(), /replaced this calendar link/);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Disable subscription" }).click();
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
    assert.deepEqual(errors, []);
    console.log("Calendar browser checks passed: publishing status + troubleshooting, replaced-link and paused notices, provider chooser (UA preselect, keyboard switch), preview, privacy note, clipboard fallback, self-reported confirmation, focus restoration, iPhone Google handoff without secret, webcal, readiness check, rotation confirmation, disable, all-day fixer prefill, timed default, DST gap and repeated hour, narrow viewport.");
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(temp, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
