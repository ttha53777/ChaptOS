// node sheet.mjs <frames-dir> <out.png> [cols] — tiles frames with t / beat labels
import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
const [dir, out, cols = 8] = process.argv.slice(2);
const D = resolve(dir);
const fs = readdirSync(D).filter(f => f.endsWith(".png")).sort();
const cells = fs.map(f => { const t = parseFloat(f.slice(1)); return `<figure><img src="file://${D}/${f}"><figcaption>${t.toFixed(2)}s · beat ${Math.floor(t * 2) + 1}</figcaption></figure>`; }).join("");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: cols * 250, height: 600 } });
await p.goto("file:///dev/null");
await p.setContent(`<style>body{margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px;font:600 13px system-ui;color:#ddd}figure{margin:0}img{width:100%;display:block;outline:1px solid #444}figcaption{padding:3px 2px}</style>${cells}`);
await p.waitForTimeout(500);
await p.screenshot({ path: out, fullPage: true });
await b.close();
