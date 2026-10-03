// Drives the REAL app (local demo DB, never prod) as the demo president and
// captures dashboard + Ask Chapt states. Run: npx tsx --env-file=.env.local _design/showreel/app-capture.ts <mode>
import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../../lib/auth/dev-bypass";

const BASE = "http://localhost:3000";
const OUT = "/Users/thalhat/figurints/assets/app";
mkdirSync(OUT, { recursive: true });
const mode = process.argv[2] || "look";

export async function open(w = 1440, h = 900, dsf = 2) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(1), url: BASE },
    { name: "active_org_id", value: "1", url: BASE },
  ]);
  await ctx.addInitScript(() => { try { localStorage.setItem("chaptos:theme:v1", "ivory"); } catch {} });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log("pageerror", String(e).slice(0, 200)));
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.append(s)); });
  return { b, page };
}

const DEMO_ANSWER = [
  ["step", { id: "s1", verb: "Read the dues ledger", source: "Dues ledger" }],
  ["step", { id: "s2", verb: "Checked the roster", source: "Roster" }],
  ["step_start", { id: "s1" }], ["step_done", { id: "s1", finding: "3 open balances · Fall '26" }],
  ["step_start", { id: "s2" }], ["step_done", { id: "s2", finding: "10 members · 7 paid in full" }],
  ["composing", {}],
  ["answer", {
    verdict: "*$300* is still out across 3 members — Sam owes half of it.",
    rows: [
      { kind: "person", title: "Sam Wells", subtitle: "Fall '26 dues · no payment yet", value: "$150", ask: "Show Sam Wells' dues" },
      { kind: "person", title: "Jordan Tao", subtitle: "Fall '26 dues · partial", value: "$75", ask: "Show Jordan Tao's dues" },
      { kind: "person", title: "Rosa Lin", subtitle: "Fall '26 dues · partial", value: "$75", ask: "Show Rosa Lin's dues" },
    ],
    follows: [{ label: "Draft a reminder", ask: "Draft a kind reminder to the 3 members who owe" }, { label: "Who paid this week?", ask: "Who paid dues this week?" }],
    sources: ["Dues ledger", "Roster"],
  }],
  ["done", {}],
];
async function stubChat(page: Page) {
  await page.route("**/api/ai/chat**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true }) });
    return route.continue({ url: "http://localhost:3999/sse" });
  });
}
const RECT_SEL = { spot: ".cs-spot", bar: ".cs-bar", launcher: ".chat-launcher", thread: ".cs-thread", peek: ".cs-peek" } as const;
async function rects(page: Page) {
  return page.evaluate(sel => Object.fromEntries(Object.entries(sel).map(([k, s]) => { const e = document.querySelector(s); if (!e) return [k, null]; const r = e.getBoundingClientRect(); return [k, r.width ? [r.x, r.y, r.width, r.height].map(v => +v.toFixed(1)) : null]; })), RECT_SEL);
}
async function seq(page: Page, dir: string, n: number, gap: number, log: unknown[], tag: string) {
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    const f = `${tag}-${String(log.length).padStart(3, "0")}.jpg`;
    await page.screenshot({ path: `${dir}/${f}`, type: "jpeg", quality: 92 });
    log.push({ f, t: Date.now(), r: await rects(page) });
    if (gap) await page.waitForTimeout(gap);
  }
}

// paced SSE so the real ledger animates pending → active → done on camera
const PACE = [0, 0.1, 0.35, 1.25, 1.4, 2.3, 2.5, 3.3, 3.4];
function sseServer() {
  return createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream", "access-control-allow-origin": "*" });
    DEMO_ANSWER.forEach(([e, d], i) => setTimeout(() => { res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`); if (i === DEMO_ANSWER.length - 1) res.end(); }, PACE[i] * 1000));
  }).listen(3999);
}

// rect of the smallest card-ish ancestor of an element containing `text`
async function cardRect(page: Page, text: string, minW = 200, maxH = 2000) {
  return page.evaluate(({ text, minW, maxH }) => {
    const all = [...document.querySelectorAll("body *")].filter(e => e.children.length === 0 && (e.textContent || "").trim().startsWith(text));
    for (const leaf of all) {
      for (let a: Element | null = leaf; a; a = a.parentElement) {
        const r = a.getBoundingClientRect();
        if (r.width >= minW && r.height <= maxH && r.height > 30) { const cs = getComputedStyle(a); if (cs.borderRadius !== "0px" || cs.backgroundColor !== "rgba(0, 0, 0, 0)" || minW > 900) return [r.x, r.y, r.width, r.height].map(v => +v.toFixed(1)); }
      }
    }
    return null;
  }, { text, minW, maxH });
}

async function main() {
if (mode === "dash") {
  const { b, page } = await open(1440, 900, 3);
  await page.goto(BASE + "/lpe", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(3000);
  const dir = `${OUT}/dash`; mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/dashboard.png` });
  const R: Record<string, unknown> = {};
  R.thisWeek = await cardRect(page, "This week", 300, 600);
  R.budgetRow = await cardRect(page, "Submit the fall budget", 300, 140);
  R.mixerRow = await cardRect(page, "Alumni Mixer", 300, 120);
  R.greeting = await cardRect(page, "Good morning", 300, 200);
  R.stats = await cardRect(page, "ATTENDANCE", 1000, 200);
  R.needs = await cardRect(page, "Needs attention", 600, 300);
  R.launcher = await page.evaluate(() => { const r = document.querySelector(".chat-launcher")!.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  R.ring = await page.evaluate(() => { const e = [...document.querySelectorAll("svg")].find(s => s.getBoundingClientRect().width > 120 && s.getBoundingClientRect().x > 1100); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  writeFileSync(`${dir}/rects.json`, JSON.stringify(R, null, 1));
  console.log(R);
  await b.close();
}
if (mode === "task") {
  const { b, page } = await open(1440, 900, 3);
  await page.goto(BASE + "/lpe/tasks", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(3000);
  const dir = `${OUT}/task`; mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/tasks.png` });
  const row = await cardRect(page, "Submit the fall budget", 900, 160);
  const circle = await page.evaluate(() => { const leaf = [...document.querySelectorAll("body *")].find(e => e.children.length === 0 && (e.textContent || "").trim().startsWith("Submit the fall budget"))!; let a: Element | null = leaf; for (; a; a = a.parentElement) { const btn = a.querySelector("button, [role=checkbox], input[type=checkbox]"); if (btn) { const r = btn.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; } } return null; });
  console.log({ row, circle });
  const log: unknown[] = [];
  const clip = { x: row![0] - 30, y: row![1] - 30, width: row![2] + 60, height: row![3] + 60 };
  const shot = async (tag: string) => { const f = `${tag}-${String(log.length).padStart(3, "0")}.png`; await page.screenshot({ path: `${dir}/${f}`, clip }); log.push({ f, t: Date.now() }); };
  await shot("before");
  await page.mouse.move(circle![0] + circle![2] / 2, circle![1] + circle![3] / 2); await page.waitForTimeout(250); await shot("hover");
  await page.mouse.click(circle![0] + circle![2] / 2, circle![1] + circle![3] / 2);
  for (let i = 0; i < 24; i++) { await shot("done"); await page.waitForTimeout(40); }
  writeFileSync(`${dir}/log.json`, JSON.stringify({ row, circle, clip, log }, null, 1));
  await b.close();
}

if (mode === "ask") {
  const srv = sseServer();
  const { b, page } = await open(1440, 900, 2);
  await stubChat(page);
  await page.goto(BASE + "/lpe", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector(".chat-launcher", { timeout: 60000 });
  await page.waitForTimeout(2500);
  const dir = `${OUT}/ask`, log: unknown[] = [];
  await seq(page, dir, 1, 0, log, "idle");
  await page.click(".chat-launcher");
  await seq(page, dir, 14, 30, log, "open");
  await page.getByPlaceholder(/Ask the chapter/).click();
  const q = "who still owes dues, and how bad is it?";
  for (let i = 0; i < q.length; i++) { await page.keyboard.type(q[i]); if (i % 4 === 3 || i === q.length - 1) await seq(page, dir, 1, 0, log, "type"); }
  await page.keyboard.press("Enter");
  await seq(page, dir, 60, 60, log, "think");
  await page.waitForTimeout(800);
  await seq(page, dir, 1, 0, log, "answer");
  writeFileSync(`${dir}/log.json`, JSON.stringify(log, null, 1));
  console.log("ask frames", log.length);
  await b.close(); srv.close();
}

if (mode === "look") {
  const { b, page } = await open();
  for (const r of process.argv.slice(3).length ? process.argv.slice(3) : ["/lpe"]) {
    await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/look${r.replace(/\//g, "_")}.png` });
    console.log("shot", r, await page.title());
  }
  await b.close();
}
}
main().catch(e => { console.error(e); process.exit(1); });
