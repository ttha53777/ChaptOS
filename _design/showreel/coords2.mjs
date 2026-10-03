import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto("https://chaptos.com/", { waitUntil: "networkidle" }); await p.waitForTimeout(4000);
console.log(JSON.stringify(await p.evaluate(() => {
  const card = document.querySelector(".hero__card"), R = card.getBoundingClientRect(), cs = getComputedStyle(card);
  const rel = s => [...card.querySelectorAll(s)].map(e => { const r = e.getBoundingClientRect(); return [s, +(r.left-R.left).toFixed(1), +(r.top-R.top).toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)]; });
  const body = getComputedStyle(card.querySelector(".hero__cardbody"));
  return { style: { bg: cs.backgroundColor, border: cs.border, radius: cs.borderRadius, shadow: cs.boxShadow, bodyBg: body.backgroundColor }, parts: [...rel(".hero__cardbar"), ...rel(".ui-brief"), ...rel(".meas"), ...rel(".att")],
    btn: (() => { const e = document.querySelector(".hero .btn--lg"), c = getComputedStyle(e); return [c.backgroundColor, c.boxShadow, c.borderRadius, c.fontSize, c.fontWeight]; })(),
    lpbg: getComputedStyle(document.querySelector(".lp") || document.body).backgroundImage.slice(0, 300) };
}), null, 1));
await b.close();
