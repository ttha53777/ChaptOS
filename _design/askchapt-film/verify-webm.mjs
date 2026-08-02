/**
 * Plays the exported WebM back in Chromium and samples frames, so what gets
 * checked is the delivered file — not the HTML that produced it.
 * Confirms: real duration, a black (not white) head, and that the tail holds
 * the final frame instead of looping back to scene 1.
 */
import pkg from '/Users/thalhat/figurints/node_modules/playwright/index.js';
const { chromium } = pkg;
import fs from 'node:fs';

const DIR = '/Users/thalhat/figurints/_design/askchapt-film';
const TMP = `${DIR}/.verify.html`;
fs.writeFileSync(TMP, `<body style="margin:0;background:#000;overflow:hidden">
<video id="v" src="ask-the-chapter.webm" style="width:1920px;height:1080px;display:block"></video>`);
fs.mkdirSync(`${DIR}/webmchk`, { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await p.goto(`file://${TMP}`);
await p.waitForFunction(() => {
  const v = document.getElementById('v');
  return v && v.readyState >= 2 && isFinite(v.duration) && v.duration > 0;
}, null, { timeout: 30000 });

const dur = await p.evaluate(() => document.getElementById('v').duration);
console.log('duration:', dur.toFixed(2), 's');

for (const t of [0.15, 1.6, 2.6, 7.0, 11.4, 15.0, dur - 0.12]) {
  await p.evaluate(tt => new Promise(r => {
    const v = document.getElementById('v');
    v.onseeked = () => r();
    v.currentTime = tt;
  }), Math.max(0, t));
  await p.waitForTimeout(180);
  await p.screenshot({ path: `${DIR}/webmchk/v${t.toFixed(2)}.png` });
}

await b.close();
fs.rmSync(TMP, { force: true });
console.log('frames → webmchk/');
