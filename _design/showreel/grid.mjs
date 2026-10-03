// node grid.mjs out.png cols file1 file2 … — labelled image grid for eyeballing
import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
import { resolve, basename } from "node:path";
const [out, cols, ...files] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +cols * 360, height: 600 } });
await p.goto("file:///dev/null");
await p.setContent(`<style>body{margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px;font:600 12px system-ui;color:#ddd}img{width:100%;display:block}</style>${files.map(f => `<figure style="margin:0"><img src="file://${resolve(f)}"><figcaption>${basename(f)}</figcaption></figure>`).join("")}`);
await p.waitForTimeout(600); await p.screenshot({ path: out, fullPage: true }); await b.close();
