import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 1900 }, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('file://' + process.cwd() + '/Widget Reimagining.html');
await p.waitForTimeout(400);
await p.screenshot({ path: 'reimagine-full.png', fullPage: true });
// detail crop of panels 1-2
await p.screenshot({ path: 'reimagine-top.png', clip: { x: 40, y: 150, width: 1120, height: 700 } });
console.log('pageerrors:', errs.length, errs);
await b.close();
