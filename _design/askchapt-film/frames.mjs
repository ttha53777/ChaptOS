import pkg from '/Users/thalhat/figurints/node_modules/playwright/index.js';
const { chromium } = pkg;

const url = 'file:///Users/thalhat/figurints/_design/askchapt-film/Ask%20the%20Chapter%20Film.html';
const out = '/Users/thalhat/figurints/_design/askchapt-film/frames';

const TIMES = process.argv[2]
  ? process.argv[2].split(',').map(Number)
  : [0.0, 1.2, 2.3, 3.0, 4.4, 5.6, 6.6, 7.7, 8.9, 9.9, 10.9, 11.7, 12.6, 13.4, 14.2, 15.3, 16.4];

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
await p.evaluate(() => {
  document.getElementById('pp').click();          // pause before seeking
  document.getElementById('chrome').style.display = 'none';
});
await p.waitForTimeout(500);

for (const t of TIMES) {
  await p.evaluate(tt => { window.__seek(tt); }, t);
  await p.waitForTimeout(160);
  await p.screenshot({ path: `${out}/t${t.toFixed(2)}.png` });
}

console.log(errs.length ? errs.join('\n') : 'no console/page errors');
await b.close();
