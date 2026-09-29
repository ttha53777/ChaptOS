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
let state={enabled:true,available:true,url:'https://example.invalid/api/calendar/feeds/test/disposable-test-token.ics',timeZone:'America/New_York',admin:true,validated:true,issues:[],health:{pending:false,failedAt:null,processedAt:'2026-09-29',failures:0}};
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
    await page.getByRole("button", { name: "Regenerate URL", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => (window as unknown as { actions: string[] }).actions), []);
    await page.getByRole("button", { name: "Regenerate and revoke old URL" }).click();
    await page.waitForFunction(() => (window as unknown as { actions: string[] }).actions.includes("rotate"));
    await page.getByRole("button", { name: "Disable subscription" }).click();
    await page.waitForFunction(() => (window as unknown as { actions: string[] }).actions.includes("disable"));
    await page.getByLabel("Title", { exact: true }).fill("DST test");
    await page.getByLabel("Schedule", { exact: true }).selectOption("timed");
    await page.getByLabel("IANA time zone").fill("America/New_York");
    await page.getByLabel("Starts", { exact: true }).fill("2026-03-08T02:30");
    await page.getByLabel("Ends", { exact: true }).fill("2026-03-08T04:00");
    await page.getByRole("button", { name: "Save schedule" }).click();
    assert.match(await page.getByRole("alert").innerText(), /skipped time/);
    assert.equal(await page.evaluate(() => (window as unknown as { submitted: unknown }).submitted), null);
    await page.getByLabel("Starts", { exact: true }).fill("2026-11-01T01:30");
    await page.getByLabel("Ends", { exact: true }).fill("2026-11-01T02:30");
    await page.getByText("Repeated daylight-saving times", { exact: true }).click();
    await page.getByLabel("Start offset", { exact: true }).fill("-04:00");
    await page.getByRole("button", { name: "Save schedule" }).click();
    const submitted = await page.evaluate(() => (window as unknown as { submitted: { schedule: unknown } }).submitted);
    assert.deepEqual(submitted.schedule, { kind: "timed", start: "2026-11-01T05:30:00Z", end: "2026-11-01T07:30:00Z", timeZone: "America/New_York" });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.deepEqual(errors, []);
    console.log("Calendar browser checks passed: dialog, privacy copy, webcal, rotation confirmation, disable, DST validation, narrow viewport.");
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(temp, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
