import { chromium } from 'playwright';

const FILE = 'file:///Users/thalhat/figurints/_design/Live%20Event%20Check-In.html';
const OUT = process.argv[2] || '/private/tmp/claude-501/-Users-thalhat-figurints/c2bf798b-dc38-4e01-94f2-763f03d18b78/scratchpad';

const browser = await chromium.launch();

for (const width of [1440, 1180, 900]) {
  const page = await browser.newPage({ viewportSize: { width, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(FILE, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}' });
  await page.waitForTimeout(400);

  for (const [key, name] of [['1', 'live'], ['2', 'done'], ['3', 'closing']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    // Just the band, which is what we're redesigning.
    const band = await page.$('#live');
    await band.screenshot({ path: `${OUT}/band-${name}-${width}.png` });
  }

  await page.keyboard.press('1');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/page-live-${width}.png` });

  // ivory theme, live band
  await page.click('#themeBtn');
  await page.waitForTimeout(250);
  const band = await page.$('#live');
  await band.screenshot({ path: `${OUT}/band-ivory-${width}.png` });

  // horizontal overflow check
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${width}px  h-overflow=${overflow}`);

  await page.close();
}

await browser.close();
