import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await p.goto("https://chaptos.com/", { waitUntil: "networkidle" });
const r = await p.evaluate(() => {
  const out = [];
  for (const id of ["day","modules","setup","price","start","pain"]) {
    const s = document.getElementById(id); if (!s) continue;
    s.querySelectorAll("*").forEach(e => {
      const cs = getComputedStyle(e), bb = e.getBoundingClientRect();
      if (cs.boxShadow !== "none" && bb.width > 200 && bb.height > 80) out.push(`${id} | ${e.tagName}.${[...e.classList].join(".")} | ${Math.round(bb.width)}x${Math.round(bb.height)} | ${e.textContent.trim().slice(0,50).replace(/\s+/g," ")}`);
    });
  }
  return out;
});
console.log(r.join("\n"));
await b.close();
