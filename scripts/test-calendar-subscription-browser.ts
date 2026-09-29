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
let state={enabled:true,available:true,url:'https://example.invalid/api/calendar/feeds/test/disposable-test-token.ics',timeZone:'America/New_York',admin:true,validated:true,validating:false,configured:true,problem:null,issues:[{kind:'time-unconfirmed',source:'calendar',id:7,title:'Chapter meeting',issue:'x',blocking:false,date:'2026-10-05',time:'7-9pm'}],health:{pending:false,failedAt:null,processedAt:'2026-09-29',failures:0}};
export async function requestJson(url,opts){
 if(opts?.method==='PATCH'){ const body=JSON.parse(opts.body);window.actions.push(body.action);if(body.action==='disable')state={...state,enabled:false,url:null};if(body.action==='rotate')state={...state,url:'https://example.invalid/replacement.ics'};return {ok:true}; }
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
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    await page.getByRole("button", { name: "Subscribe", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /refresh schedule/);
    assert.match(await dialog.innerText(), /Removing a member does not revoke/);
    assert.match(await dialog.getByRole("link", { name: "Open in Apple Calendar" }).getAttribute("href") ?? "", /^webcal:/);
    await page.keyboard.press("Escape");
    // Readiness checklist: every step done in this state, check can be re-run.
    await page.getByRole("button", { name: "Run the check again" }).click();
    await page.waitForFunction(() => (window as unknown as { actions: string[] }).actions.includes("validate"));
    // Advanced: regeneration needs an explicit confirmation.
    await page.getByText("Advanced", { exact: true }).click();
    await page.getByRole("button", { name: "Regenerate URL", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => (window as unknown as { actions: string[] }).actions), ["validate"]);
    await page.getByRole("button", { name: "Regenerate and revoke old URL" }).click();
    await page.waitForFunction(() => (window as unknown as { actions: string[] }).actions.includes("rotate"));
    await page.getByRole("button", { name: "Disable subscription" }).click();
    await page.waitForFunction(() => (window as unknown as { actions: string[] }).actions.includes("disable"));
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
    console.log("Calendar browser checks passed: dialog, privacy copy, webcal, readiness check, rotation confirmation, disable, all-day fixer prefill, timed default, DST gap and repeated hour, narrow viewport.");
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(temp, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
