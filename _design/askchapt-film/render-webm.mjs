/**
 * "Ask the Chapter" film → 1920×1080 WebM, no ffmpeg required.
 *
 * Playwright's recordVideo writes from context creation, and without ffmpeg we
 * can't trim that head. So instead of trimming we hide it: the page boots with
 * window.__hold set, holds a fully-painted BLACK frame 0 while fonts settle,
 * and only then does __start() release playback. The recorder's pre-roll and
 * the film's opening fade-from-black are the same colour, so the join is
 * invisible.
 *
 * __recording = true also forces loop off, so the tail holds the final frame
 * instead of snapping back to scene 1.
 */
import pkg from '/Users/thalhat/figurints/node_modules/playwright/index.js';
const { chromium } = pkg;
import fs from 'node:fs';
import path from 'node:path';

const DIR  = '/Users/thalhat/figurints/_design/askchapt-film';
const URL  = 'file:///Users/thalhat/figurints/_design/askchapt-film/Ask%20the%20Chapter%20Film.html';
const DUR  = 16.6;
const SIZE = { width: 1920, height: 1080 };
const OUT  = path.join(DIR, 'ask-the-chapter.webm');
const TMP  = path.join(DIR, '.rec-' + Date.now() + '-' + process.pid);

const HIDE_CHROME = `.progress,.counter,.phases,.replay,.masthead,.footer,
  .no-record,[data-role="chrome"]{display:none !important}`;

const browser = await chromium.launch();

// ── phase 1 · warmup (throwaway, no recording) — pulls fonts into the profile
{
  const ctx = await browser.newContext({ viewport: SIZE });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  await p.waitForTimeout(1200);
  await ctx.close();
}

// ── phase 2 · record (fresh context)
const ctx = await browser.newContext({
  viewport: SIZE,
  recordVideo: { dir: TMP, size: SIZE },
});
await ctx.addInitScript(() => {
  window.__recording = true;   // kills loop; tail holds the last frame
  window.__hold = true;        // don't auto-play — wait for __start()
});

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

await page.goto(URL, { waitUntil: 'load' });   // fonts are inlined — no network to idle on
await page.addStyleTag({ content: HIDE_CHROME });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(220);             // settle on the black frame 0

await page.evaluate(() => window.__start());
await page.waitForTimeout(DUR * 1000 + 160); // +buffer holds the final frame

await page.close();
await ctx.close();
await browser.close();

// ── collect
const file = fs.readdirSync(TMP).find(f => f.endsWith('.webm'));
if (!file) { console.error('no webm produced'); process.exit(1); }
fs.renameSync(path.join(TMP, file), OUT);
fs.rmSync(TMP, { recursive: true, force: true });

const mb = (fs.statSync(OUT).size / 1048576).toFixed(2);
console.log(`${OUT}  ${mb} MB`);
console.log(errs.length ? errs.join('\n') : 'no console/page errors');
