import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto("https://chaptos.com/", { waitUntil: "networkidle" }); await p.waitForTimeout(3000);
for (const [sel, idx, y] of [[".hero h1",0,0],[".bubble--bot",0,3300],["#day figure.shot",2,6300],[".done__ic",0,5700]]) {
  await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(1200);
  console.log(sel, JSON.stringify(await p.evaluate(({sel,idx}) => { const out=[]; let e=document.querySelectorAll(sel)[idx]; for (let k=0;e&&k<5;k++,e=e.parentElement){const c=getComputedStyle(e); out.push([e.className, c.opacity,c.visibility,c.display,c.clipPath,c.transform.slice(0,30),c.color, e.getBoundingClientRect().height|0]);} return out; },{sel,idx})));
}
await b.close();
