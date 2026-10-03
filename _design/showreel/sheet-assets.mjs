import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
import { readdirSync } from "node:fs";
const dir = "/Users/thalhat/figurints/assets/ui";
const fs = readdirSync(dir).filter(f => f.endsWith(".png")).sort();
const html = `<body style="margin:0;background:#d8c8a8;display:grid;grid-template-columns:repeat(6,300px);gap:6px;padding:6px;font:12px sans-serif">${fs.map(f => `<div style="height:240px;display:flex;flex-direction:column"><b>${f}</b><img src="file://${dir}/${f}" style="flex:1;min-height:0;object-fit:contain;width:100%"></div>`).join("")}</body>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1842, height: 800 } });
await p.goto("file:///dev/null"); await p.setContent(html); await p.waitForTimeout(800);
await p.screenshot({ path: process.argv[2], fullPage: true }); await b.close();
