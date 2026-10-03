import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto("https://chaptos.com/", { waitUntil: "networkidle" }); await p.waitForTimeout(3000);
console.log(JSON.stringify(await p.evaluate(() => {
  const root = document.querySelectorAll("#day figure.shot")[3];
  // undo dial scaling for measurement
  for (let a = root; a; a = a.parentElement) if (getComputedStyle(a).transform !== "none") a.style.transform = "none";
  const R = root.getBoundingClientRect(); const out = [];
  root.querySelectorAll("*").forEach(e => { const r = e.getBoundingClientRect(); if (e.children.length <= 2 && r.width > 30 && r.width < 160 && r.height < 50 && r.height > 18 && r.top - R.top < 160) out.push([e.className, e.textContent.trim().slice(0, 12), +(r.left - R.left).toFixed(0), +(r.top - R.top).toFixed(0), +r.width.toFixed(0), +r.height.toFixed(0)]); });
  const bub = getComputedStyle(document.querySelector(".bubble--me")).backgroundColor;
  const led = getComputedStyle(document.querySelector(".ledger")).backgroundColor;
  const acard = getComputedStyle(document.querySelector(".acard")).backgroundColor;
  return { R: [R.width, R.height], chips: out, bub, led, acard };
})));
await b.close();
