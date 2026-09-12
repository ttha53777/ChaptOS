/** Real editor/browser test with an explicitly simulated Realtime transport.
 * Database merging and tenant isolation are tested separately in Vitest.
 * This does NOT replace staging tests against Supabase channel authorization.
 */
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import * as Y from "yjs";

async function main() {
const temp = await mkdtemp(join(tmpdir(), "figurints-notes-browser-"));
const root = process.cwd();
const fakeClient = `export const createClient = () => ({
  auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  realtime: { async setAuth() {} },
  removeChannel(channel) { channel.close(); },
  channel(name) {
    const bus = new BroadcastChannel(name); let handler;
    bus.onmessage = e => { if (!window.notesOffline) handler?.({payload:e.data}); };
    return { on(_type,_filter,fn) { handler=fn; return this; },
      subscribe(fn) { setTimeout(()=>fn('SUBSCRIBED'),0); return this; },
      async send(message) { if (!window.notesOffline) bus.postMessage(message.payload); return 'ok'; },
      close() { bus.close(); } };
  }
});`;
await writeFile(join(temp, "supabase.ts"), fakeClient);
await build({ stdin: { contents: `
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Editor from '${root}/app/components/meeting-notes/CollaborativeNotesEditor';
import { NotesCollaborators } from '${root}/app/components/meeting-notes/NotesCollaborators';
function App() { const ref=useRef(null); const [peers,setPeers]=useState([]); return <main>
  <header><h1>Chapter meeting</h1><NotesCollaborators peers={peers}/></header>
  <Editor ref={ref} eventId={1} slug="notes" onSaved={()=>{}} onState={()=>{}} onPeers={setPeers}/>
  <button id="flush" onClick={()=>ref.current.flush().catch(()=>{})}>Save now</button>
</main>; }
createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: "tsx" },
  bundle: true, outfile: join(temp, "main.js"), jsx: "automatic", platform: "browser", format: "iife",
  alias: { "@": root, "@/lib/supabase/client": join(temp, "supabase.ts") },
  define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '"https://notes-test.invalid"' },
});
const server = createServer(async (req, res) => {
  const resource = req.url?.split("?")[0];
  if (resource === "/main.js" || resource === "/main.css") {
    res.setHeader("Content-Type", resource.endsWith("css") ? "text/css" : "text/javascript");
    res.end(await readFile(join(temp, resource.slice(1)))); return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/main.css"><style>body{background:#0f0d0a;color:#ece7dd;font-family:system-ui}main{max-width:740px;margin:40px auto;padding:20px}header{display:flex;justify-content:space-between}button{cursor:pointer}</style></head><body><div id="root"></div><script src="/main.js"></script></body></html>');
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
console.log("Launching browser");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
context.setDefaultTimeout(12000);
const canonical = new Y.Doc(); canonical.getText("notes").insert(0, "Minutes\n");
let seq = 0;
const errors: string[] = [];
const bytes = () => Buffer.from(Y.encodeStateAsUpdate(canonical)).toString("base64");
const snapshot = () => ({ id:1, organizationId:1, notesDoc:bytes(), notesDocSeq:seq, notesContentRevision:seq,
  notesSummaryRevision:null, notesProtocolVersion:1, notesUpdatedAt:null, description:canonical.getText("notes").toString() });
try {
  const pages = await Promise.all(Array.from({ length: 10 }, () => context.newPage()));
  for (const [index, page] of pages.entries()) {
    page.on("pageerror", error => { errors.push(error.message); console.log("Browser error:",error.message); });
    await page.route("**/api/calendar/1/notes**", async route => {
      if (await page.evaluate(() => (window as unknown as { notesOffline: boolean }).notesOffline)) { await route.abort(); return; }
      const req = route.request();
      if (req.method() === "PATCH") {
        const input = req.postDataJSON(); const before = bytes();
        Y.applyUpdate(canonical, Buffer.from(input.notesDoc, "base64"));
        if (bytes() !== before) seq++;
        await route.fulfill({ json: { ...snapshot(), generation:input.generation } });
      } else if (req.url().endsWith("/session")) {
        await route.fulfill({ json: { ...snapshot(), topic:"notes:test", realtime:true, actor:{ id:index+1, authUserId:`actor-${index+1}`, name:index===0?"Rob Chen":index===1?"Sam Patel":`Officer ${index+1}` } } });
      } else await route.fulfill({ json: snapshot() });
    });
    console.log("Opening editor",index);
    await page.goto(`http://127.0.0.1:${port}/?actor=${index}`);
    await page.locator('.cm-content[contenteditable="true"]').waitFor();
  }
  console.log("Ten editors mounted");
  const [a,b] = pages;
  const editor = (page: typeof a) => page.locator('.cm-content[contenteditable="true"]');
  await editor(a).click(); await a.keyboard.press("ControlOrMeta+End"); await a.keyboard.type("Decision approved. ");
  await editor(b).click(); await b.keyboard.press("ControlOrMeta+End"); await b.keyboard.type("Action assigned. ");
  await a.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('Action assigned.'));
  await b.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('Decision approved.'));
  console.log("Documents converged");
  await a.locator('.notes-people summary').waitFor();
  await a.locator('.cm-ySelectionCaret').first().waitFor();
  await a.locator('#flush').click(); await b.locator('#flush').click();
  await a.waitForFunction(() => document.querySelector('.notes-status')?.textContent?.trim() === 'Saved');
  assert(canonical.getText('notes').toString().includes('Action assigned.'));
  assert(canonical.getText('notes').toString().includes('Decision approved.'));
  await editor(a).click(); await a.keyboard.press("ControlOrMeta+z");
  await a.waitForFunction(() => !document.querySelector('.cm-content')?.textContent?.includes('Decision approved.'));
  assert((await editor(a).textContent())?.includes('Action assigned.'));
  await a.keyboard.press("ControlOrMeta+Shift+z");
  await a.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('Decision approved.'));
  console.log('Undo/redo passed');
  // Force HTTP and simulated broadcast offline; reconnect without further typing.
  await a.evaluate(() => { (window as unknown as { notesOffline:boolean }).notesOffline=true; window.dispatchEvent(new Event('offline')); });
  await editor(a).click(); await a.keyboard.press("ControlOrMeta+End"); await a.keyboard.type("Recovered offline. ");
  await a.locator('#flush').click();
  await a.waitForFunction(() => document.querySelector('.notes-status')?.textContent?.includes('Failed to fetch'));
  await a.evaluate(() => { (window as unknown as { notesOffline:boolean }).notesOffline=false; window.dispatchEvent(new Event('online')); });
  console.log('Restored connectivity');
  await b.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('Recovered offline.'));
  await a.locator('#flush').click();
  await a.waitForFunction(() => document.querySelector('.notes-status')?.textContent?.trim() === 'Saved');
  console.log("Offline recovery passed");
  await a.reload(); await editor(a).waitFor();
  assert((await editor(a).textContent())?.includes('Recovered offline.'));
  await a.setViewportSize({ width:375, height:812 });
  assert(await a.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.equal(errors.length, 0, errors.join('\n'));
  const screenshot = resolve('_screenshots/collaborative-notes-mobile.png');
  await a.screenshot({ path:screenshot, fullPage:true });
  await Promise.all(pages.map(async (page, index) => {
    await editor(page).click(); await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(` [Officer-${index+1}] `);
  }));
  await Promise.all(pages.map(page => page.waitForFunction(() => {
    const text = document.querySelector('.cm-content')?.textContent ?? '';
    return Array.from({length:10}, (_,i) => `[Officer-${i+1}]`).every(marker => text.includes(marker));
  }, undefined, { timeout:20000 })));
  await Promise.all(pages.map(page => page.locator('#flush').click()));
  await a.waitForFunction(() => document.querySelector('.notes-status')?.textContent?.trim() === 'Saved');
  for (let i=1;i<=10;i++) assert(canonical.getText('notes').toString().includes(`[Officer-${i}]`));
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: ten-editor convergence, remote caret/presence, local undo/redo, offline retry, reload, mobile width.');
  console.log(`Screenshot: ${screenshot}`);
} catch (error) {
  for (const p of context.pages()) console.log('Page state:', await p.locator('main').innerText().catch(()=>''));
  throw error;
} finally {
  await browser.close(); canonical.destroy(); server.close(); await rm(temp,{ recursive:true,force:true });
}

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
