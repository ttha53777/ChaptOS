import pkg from '/Users/thalhat/figurints/node_modules/playwright/index.js';
const { chromium } = pkg;
const url = 'file:///Users/thalhat/figurints/_design/Ask%20Chapt%20Redesign%20v2.html';
const out = '/Users/thalhat/figurints/_design/ask-chapt';
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(700);

for (const s of ['closed', 'empty', 'think', 'answer', 'writ', 'threads']) {
  await p.evaluate(id => window.__mock.goto(id), s);
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/v2-${s}.png` });
}

// Ratify via the visible button
await p.evaluate(() => window.__mock.goto('writ'));
await p.waitForTimeout(800);
await p.click('#ratifyBtn');
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/v2-writ-ratified.png` });

// Decline via the visible button
await p.evaluate(() => window.__mock.goto('writ'));
await p.waitForTimeout(800);
await p.click('#declineBtn');
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/v2-writ-declined.png` });

// The "Record a payment" pill in the answer scene drafts the proposal
await p.evaluate(() => window.__mock.goto('answer'));
await p.waitForTimeout(800);
await p.click('#payBtn');
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/v2-pay-to-writ.png` });

// Keyboard selection moves down the records
await p.evaluate(() => window.__mock.goto('answer'));
await p.waitForTimeout(900);
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/v2-nav.png` });

// Typing a follow-up in the composer, then submitting
await p.click('#cinput');
await p.keyboard.type('What did we spend on Events?');
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/v2-typing.png` });
await p.keyboard.press('Enter');
await p.waitForTimeout(1000);
await p.screenshot({ path: `${out}/v2-thinking-after-submit.png` });
await p.waitForTimeout(1000);
await p.screenshot({ path: `${out}/v2-answer-after-submit.png` });

console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
await b.close();
