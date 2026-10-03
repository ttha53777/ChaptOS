import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const OUT = "/Users/thalhat/figurints/assets";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
await p.goto("https://chaptos.com/", { waitUntil: "networkidle" });
await p.addStyleTag({ content: "html{scroll-behavior:auto!important}" });
// font-face rules + brand svg
const meta = await p.evaluate(() => {
  const faces = [];
  for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) if (r.constructor.name === "CSSFontFaceRule") faces.push(r.cssText); } catch {} }
  return { faces, mark: document.querySelector(".nav .brand svg")?.outerHTML || document.querySelector(".brand svg").outerHTML };
});
writeFileSync(`${OUT}/fonts/font-faces.css`, meta.faces.join("\n"));
writeFileSync(`${OUT}/brand/chaptos-mark.svg`, meta.mark.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"'));
await p.waitForTimeout(3500);
const H = await p.evaluate(() => document.documentElement.scrollHeight);
let i = 0;
for (let y = 0; y < H; y += 600) {
  await p.evaluate(y => scrollTo(0, y), y);
  await p.waitForTimeout(1300);
  await p.screenshot({ path: `${OUT}/shots/scroll-${String(i++).padStart(2,"0")}-y${y}.png` });
}
console.log("shots", i);
await b.close();
