import { chromium } from 'playwright';
const FILE = 'file:///Users/thalhat/figurints/_design/Live%20Event%20Check-In.html';
const OUT = '/private/tmp/claude-501/-Users-thalhat-figurints/c2bf798b-dc38-4e01-94f2-763f03d18b78/scratchpad';

const browser = await chromium.launch();
for (const width of [1040, 860, 620]) {
  const page = await browser.newPage({ viewportSize: { width, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(FILE, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await page.waitForTimeout(300);

  // clip to the band within the real viewport, so the media query actually applies
  const box = await (await page.$('#live')).boundingBox();
  await page.screenshot({ path: `${OUT}/narrow-${width}.png`,
    clip: { x: box.x, y: box.y, width: box.width, height: box.height } });

  const geo = await page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { t: Math.round(b.top), l: Math.round(b.left), w: Math.round(b.width) }; };
    return {
      count: r(document.querySelector('#bodyOpen .live-count')),
      btn:   r(document.querySelector('#bodyOpen .live-btn')),
      alt:   r(document.querySelector('#bodyOpen .live-alt')),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log(width, JSON.stringify(geo));
  await page.close();
}
await browser.close();
