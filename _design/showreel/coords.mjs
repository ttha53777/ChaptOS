import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto("https://chaptos.com/", { waitUntil: "networkidle" }); await p.waitForTimeout(3500);
// for each crop root: root rect, and rects of descendants whose own text matches
const jobs = {
  "ask-draft": [".draft", 0, ["Send to 4 members", "Edit"]],
  "ask-answer": [".acard", 0, ["Maya R.", "Dev O.", "Jordan T.", "$1,480"]],
  "ask-q1": [".bubble--me", 0, ["who still owes"]],
  "ask-checking": [".ledger", 0, ["Read 52", "Matched 6", "Applied your", "Dues ledger"]],
  "day-0": ["#day figure.shot", 0, ["Needs attention", "Submit the fall budget", "Maya Rivera", "Reimbursement", "Jordan Tao", "Mark done"]],
  "day-3": ["#day figure.shot", 3, ["Taking roll", "Approve", "Jordan T. filed", "47/52"]],
  "hero-card": [".hero__card", 0, ["Mark done", "Review"]],
  "btn-setup": [".hero .btn--lg", 0, []],
};
const out = {};
for (const [name, [sel, idx, texts]] of Object.entries(jobs)) {
  out[name] = await p.evaluate(({ sel, idx, texts }) => {
    const root = document.querySelectorAll(sel)[idx]; const R = root.getBoundingClientRect();
    const res = { w: R.width, h: R.height, items: {} };
    for (const t of texts) {
      const el = [...root.querySelectorAll("*")].filter(e => e.textContent.trim().startsWith(t)).pop();
      if (!el) { res.items[t] = null; continue; }
      // climb to a block-ish ancestor for rows/buttons
      const r = el.getBoundingClientRect();
      res.items[t] = { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height, tag: el.tagName + "." + el.className };
    }
    return res;
  }, { sel, idx, texts });
}
writeFileSync("/Users/thalhat/figurints/_design/showreel/coords.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
