import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
await p.goto("https://chaptos.com/", { waitUntil: "networkidle" });
await p.addStyleTag({ content: "html{scroll-behavior:auto!important}" });
const info = await p.evaluate(() => {
  const secs = [...document.querySelectorAll("section, header, footer")].map(s => ({ tag: s.tagName, id: s.id, cls: s.className, y: Math.round(s.getBoundingClientRect().top + scrollY), h: Math.round(s.offsetHeight) }));
  const cs = getComputedStyle(document.querySelector(".lp") || document.body);
  const vars = {}; for (const v of ["--paper","--ink","--card","--line","--lilac","--lilac-ink","--peach","--peach-ink","--butter","--mint","--mint-ink","--sky","--rose","--display","--sans","--mono","--btn-shadow"]) vars[v] = cs.getPropertyValue(v).trim();
  const brand = document.querySelector(".brand")?.outerHTML;
  const fonts = [...document.fonts].filter(f=>f.status==="loaded").map(f => f.family + " " + f.weight + " " + f.style);
  const fontUrls = performance.getEntriesByType("resource").filter(r => /woff2/.test(r.name)).map(r => r.name);
  return { secs, vars, brand, fonts: [...new Set(fonts)], fontUrls, H: document.documentElement.scrollHeight, bodyBg: getComputedStyle(document.body).backgroundColor };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
