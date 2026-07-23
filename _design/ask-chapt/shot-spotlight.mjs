import pkg from '/Users/thalhat/figurints/node_modules/playwright/index.js';
const { chromium } = pkg;
const url = 'file:///Users/thalhat/figurints/_design/Ask%20Chapt%20Spotlight%20v2.html';
const out = '/Users/thalhat/figurints/_design/ask-chapt';
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(700);

const scenes = ['closed', 'briefing', 'thinking', 'answer', 'convo', 'proposal', 'approvals', 'nomatch'];

// Dusk (default) — every scene.
await p.evaluate(() => window.__mock.theme('dusk'));
for (const s of scenes) {
  await p.evaluate(id => window.__mock.goto(id), s);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/sp-${s}.png` });
}

// Inline proposal → ratify (happy path, green audit stamp + verdict rewrite).
await p.evaluate(() => window.__mock.goto('proposal'));
await p.waitForTimeout(400);
await p.click('[data-w="ratify"]');
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/sp-proposal-ratified.png` });

// Approvals → expand a "needs you" row and ratify it (count decrements).
await p.evaluate(() => window.__mock.goto('approvals'));
await p.waitForTimeout(400);
await p.click('.appr[data-appr="a1"] .appr-row');
await p.waitForTimeout(350);
await p.screenshot({ path: `${out}/sp-approvals-expanded.png` });
await p.click('.appr[data-appr="a1"] [data-w="ratify"]');
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/sp-approvals-ratified.png` });

// Approvals → the gated (Treasurer-only) item shows the lock/withdraw state.
await p.evaluate(() => window.__mock.goto('approvals'));
await p.waitForTimeout(300);
await p.click('.appr[data-appr="a3"] .appr-row');
await p.waitForTimeout(350);
await p.screenshot({ path: `${out}/sp-approvals-gated.png` });

// Live: type a question and submit → thinking → answer.
await p.evaluate(() => window.__mock.goto('briefing'));
await p.waitForTimeout(300);
await p.click('#input');
await p.keyboard.type("Who missed the last two meetings?");
await p.waitForTimeout(200);
await p.screenshot({ path: `${out}/sp-typing.png` });
await p.keyboard.press('Enter');
// Thinking: wait for the deliberation trail to advance (step 1 ticks done,
// step 2 slides in) so we capture the live "it's really reading" state.
await p.waitForSelector('.thread .trail .step.done', { timeout: 3000 });
await p.waitForTimeout(120);
await p.screenshot({ path: `${out}/sp-live-thinking.png` });
// Answer: wait for the verdict to render, then let the row stagger settle.
await p.waitForSelector('.thread .verdict', { timeout: 3000 });
await p.waitForTimeout(450);
await p.screenshot({ path: `${out}/sp-live-answer.png` });

// Ivory theme — the key scenes.
await p.evaluate(() => window.__mock.theme('ivory'));
await p.waitForTimeout(300);
for (const s of ['briefing', 'answer', 'proposal', 'approvals']) {
  await p.evaluate(id => window.__mock.goto(id), s);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/sp-ivory-${s}.png` });
}

console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
await b.close();
