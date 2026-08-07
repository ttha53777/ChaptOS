import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.route("**/api/ai/interview", (r, q) => q.method() === "GET"
  ? r.fulfill({ json: { enabled: false } }) : r.fulfill({ json: { enabled: false, result: null } }));
for (const name of ["ΣΦΕ", "Σigma Φi", "!!! ???", "🎉🎉", "   ", "The Really Long Named Society of Extremely Verbose Undergraduate Persons at State"]) {
  await page.goto("http://localhost:3000/create", { waitUntil: "networkidle" });
  await sleep(500);
  await page.fill(".name-input", name);
  await sleep(400);
  const st = await page.evaluate(() => ({
    slugline: document.querySelector(".slugline")?.innerText.replace(/\s+/g," ").trim(),
    ctaDisabled: !!document.querySelector(".cta[disabled]"),
    monogram: document.querySelector(".mark, .orgmark, .idrow")?.innerText.replace(/\s+/g," ").trim().slice(0,40),
  }));
  console.log(JSON.stringify(name), "→", JSON.stringify(st));
}
await b.close();
