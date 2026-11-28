// Read-only check of the Ask Chapt mark (docs/ask-chapt-mark-plan.md) in the
// real app. No model calls: /api/ai/chat is stubbed IN THE PAGE with a slowed
// SSE stream (window.fetch override), and every other non-GET /api call is
// aborted (the dev DB is prod).
//
// For each turn variant it records the header mark's data-state at every
// change and checks: the walk, no remount (same <svg> node), renders ≈ state
// changes (not deltas), long-animation-frames during the turn. Then it
// screenshots every state (motion + reduced motion, ivory + dusk), the
// launchers, and the phone sheet header.
//
// tsx --env-file=.env.local scripts/_askmark-shot.ts     OUT=dir  SHOTS=0 to skip screenshots
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, devices, webkit, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/askmark";
const SHOTS = process.env.SHOTS !== "0";
mkdirSync(OUT, { recursive: true });

type Ev = [ms: number, event: string, data: unknown];
const ANSWER = {
  verdict: "Nine brothers owe *$1,240*, and four of them are past the October 1 deadline.",
  rows: [
    { kind: "person", title: "Marcus Hale", subtitle: "Overdue · 28 days", value: "$320", ask: "Tell me about Marcus Hale" },
    { kind: "money", title: "Fall dues", subtitle: "Due Oct 1", value: "$1,240" },
  ],
  follows: [{ label: "Who's on a payment plan?", ask: "Who's on a payment plan?" }],
  sources: ["Dues"],
};
const head: Ev[] = [
  [150, "step", { id: "0", verb: "Reading the dues ledger", source: "Dues" }],
  [100, "step_start", { id: "0" }],
  [1200, "step_done", { id: "0", finding: "9 of 52 owe" }],
];
// A quick composing → tool call → composing flip: the face must not twitch.
const flip: Ev[] = [
  [300, "composing", {}],
  [150, "step", { id: "1", verb: "Checking the deadline", source: "Dues" }],
  [150, "composing", {}],
];
// 24 headline deltas — renders must not follow these.
const drafts: Ev[] = Array.from({ length: 24 }, (_, i) => [60, "verdict_draft", { verdict: ANSWER.verdict.slice(0, 20 + i * 3) }] as Ev);
const VARIANTS: Record<string, { stream: Ev[]; expect: string[] }> = {
  answer: {
    stream: [...head, ...flip, ...drafts, [900, "answer", ANSWER], [200, "done", {}]],
    expect: ["listening", "thinking", "answering", "done", "idle"],
  },
  decline: {
    stream: [...head, [400, "composing", {}], [900, "answer", { verdict: "I only read your chapter's records.", rows: [], follows: [], sources: [], shape: { type: "decline", scope: "I only read your records in ChaptOS." } }], [200, "done", {}]],
    expect: ["listening", "thinking", "answering", "unsure"],
  },
  // A long writing phase, to film the pencil (PENCIL=1).
  pencil: {
    stream: [...head, [300, "composing", {}], ...Array.from({ length: 40 }, (_, i) => [100, "verdict_draft", { verdict: ANSWER.verdict.slice(0, 10 + i * 2) }] as Ev), [300, "answer", ANSWER], [200, "done", {}]],
    expect: ["listening", "thinking", "answering", "done", "idle"],
  },
  timeout: {
    stream: [...head, [900, "notice", { kind: "timeout" }], [100, "text", { delta: "That took too long." }], [100, "done", {}]],
    expect: ["listening", "thinking", "offline"],
  },
};

// Runs in the page (a string: tsx would wrap a named closure in __name()).
const INIT = (variant: string, theme: string) => `(function(){
  try { localStorage.setItem("chaptos:theme:v1", ${JSON.stringify(theme)}); localStorage.setItem("chaptos_chat_seen_v1", "1"); } catch (e) {}
  var STREAM = ${JSON.stringify(VARIANTS[variant]?.stream ?? [])};
  var real = window.fetch.bind(window);
  window.__marks = []; window.__events = [];
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : input.url;
    var method = (init && init.method) || (typeof input === "string" ? "GET" : input.method) || "GET";
    if (url.indexOf("/api/ai/chat") !== -1 && url.indexOf("/api/ai/chat/") === -1) {
      if (method === "GET") return Promise.resolve(new Response(JSON.stringify({ enabled: true }), { headers: { "content-type": "application/json" } }));
      var enc = new TextEncoder();
      var body = new ReadableStream({ start: function (c) {
        var i = 0;
        (function next() {
          if (i >= STREAM.length) { c.close(); return; }
          var e = STREAM[i++];
          setTimeout(function () {
            window.__events.push([performance.now(), e[1]]);
            c.enqueue(enc.encode("event: " + e[1] + "\\ndata: " + JSON.stringify(e[2]) + "\\n\\n")); next();
          }, e[0]);
        })();
      } });
      return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
    }
    return real(input, init);
  };
  window.__loaf = [];
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { window.__loaf.push(Math.round(e.duration)); }); }).observe({ type: "long-animation-frame", buffered: false }); } catch (e) {}
})();`;

async function login(ctx: BrowserContext, brotherId: number, orgId: number) {
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(brotherId), url: BASE },
    { name: "active_org_id", value: String(orgId), url: BASE },
  ]);
}

async function open(ctx: BrowserContext, variant: string, theme = "ivory"): Promise<Page> {
  await ctx.addInitScript(INIT(variant, theme));
  const p = await ctx.newPage();
  await p.route(u => u.pathname.startsWith("/api/"), async r => {
    if (r.request().method() !== "GET") return r.abort();
    for (let i = 0; ; i++) {
      const res = await r.fetch({ timeout: 60000 }).catch(() => null);
      if (res && (res.status() < 500 || i === 5)) return r.fulfill({ response: res });
      if (!res && i === 5) return r.abort();
      await new Promise(z => setTimeout(z, 800));
    }
  });
  await p.goto(`${BASE}/org/${SLUG}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal,.ui-modal{display:none!important}" }).catch(() => {});
  await p.waitForSelector(".chat-launcher .cmk", { timeout: 120000 });
  await p.waitForFunction(() => !document.querySelector(".fls-splash"), null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  return p;
}

async function startClean(p: Page) {
  await p.locator(".chat-launcher").click({ force: true });
  await p.waitForSelector(".cs-spot textarea");
  // A fresh thread, so the walk starts from idle.
  const newq = p.locator(".cs-bar .newq");
  if (await newq.count()) await newq.click();
  await p.waitForTimeout(700);
}

async function walk(b: Browser, variant: string, ids: { brotherId: number; orgId: number }) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await login(ctx, ids.brotherId, ids.orgId);
  const p = await open(ctx, variant);
  await startClean(p);
  await p.evaluate(() => {
    const svg = document.querySelector(".cs-mark svg") as SVGSVGElement & { __tag?: number; __renders?: number };
    svg.__tag = 1;
    const w = window as unknown as { __marks: Array<[number, string]>; __r0: number };
    w.__r0 = svg.__renders ?? 0;
    w.__marks.push([performance.now(), svg.getAttribute("data-state") ?? "?"]);
    new MutationObserver(() => w.__marks.push([performance.now(), svg.getAttribute("data-state") ?? "?"])).observe(svg, { attributes: true, attributeFilter: ["data-state"] });
  });
  await p.locator(".cs-spot textarea").pressSequentially("Who still owes dues?", { delay: 30 });
  await p.waitForTimeout(800);
  await p.evaluate(() => { (window as unknown as { __loaf: number[] }).__loaf.length = 0; });
  await p.keyboard.press("Enter");
  if (variant === "pencil") {
    // Film the pencil at header size and at stage size (the keyframes are in
    // grid units, so the tip must stay on the line at any size).
    await p.waitForSelector('.cs-mark svg[data-state="answering"]', { timeout: 20000 });
    await p.waitForTimeout(300);
    for (const size of [30, 160]) {
      await p.evaluate(px => { const svg = document.querySelector(".cs-mark svg") as SVGSVGElement; svg.style.width = svg.style.height = px + "px"; const m = svg.parentElement as HTMLElement; m.style.width = m.style.height = px + "px"; }, size);
      for (let i = 0; i < 8; i++) {
        const bb = (await p.locator(".cs-mark svg").boundingBox())!;
        const pad = size / 4;
        await p.screenshot({ path: `${OUT}/pencil-${size}-${i}.png`, clip: { x: bb.x - pad, y: bb.y - pad, width: bb.width + 2 * pad, height: bb.height + 2 * pad } });
        await p.waitForTimeout(230);
      }
    }
    await p.evaluate(() => { const svg = document.querySelector(".cs-mark svg") as SVGSVGElement; svg.style.width = svg.style.height = ""; (svg.parentElement as HTMLElement).style.cssText = ""; });
  }
  // The turn, plus the done hold and a margin.
  await p.waitForFunction(() => (window as unknown as { __events: Array<[number, string]> }).__events.some(e => e[1] === "done"), null, { timeout: 30000 });
  await p.waitForTimeout(3200);
  const r = await p.evaluate(() => {
    const svg = document.querySelector(".cs-mark svg") as (SVGSVGElement & { __tag?: number; __renders?: number }) | null;
    const w = window as unknown as { __marks: Array<[number, string]>; __events: Array<[number, string]>; __loaf: number[]; __r0: number };
    const t0 = w.__marks[0][0];
    return {
      marks: w.__marks.map(([t, s]) => `${s}@${Math.round(t - t0)}`),
      states: w.__marks.map(m => m[1]),
      events: w.__events.length,
      sameNode: svg?.__tag === 1,
      renders: (svg?.__renders ?? 0) - w.__r0,
      loaf: w.__loaf,
    };
  });
  const seq = r.states.filter((s, i) => i === 0 || s !== r.states[i - 1]);
  const want = ["idle", ...VARIANTS[variant].expect];
  const ok = JSON.stringify(seq) === JSON.stringify(want);
  console.log(`\n[${variant}] ${ok ? "PASS" : "FAIL"} walk ${seq.join(" → ")}${ok ? "" : `  (want ${want.join(" → ")})`}`);
  console.log(`  timeline ${r.marks.join("  ")}`);
  console.log(`  same <svg> node: ${r.sameNode}   mark renders: ${r.renders} for ${seq.length - 1} state changes over ${r.events} stream events`);
  console.log(`  long-animation-frames during turn: ${r.loaf.length}${r.loaf.length ? ` (${r.loaf.join(", ")}ms)` : ""}`);
  await ctx.close();
  return ok && r.sameNode;
}

const STATES = ["idle", "hover", "listening", "thinking", "answering", "done", "unsure", "offline"];

/** Every face in the real header: force data-state (React won't re-render the memoized mark). */
async function gallery(b: Browser, ids: { brotherId: number; orgId: number }, theme: string, reduced: boolean) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3, reducedMotion: reduced ? "reduce" : "no-preference" });
  await login(ctx, ids.brotherId, ids.orgId);
  const p = await open(ctx, "answer", theme);
  const tag = `${theme}-${reduced ? "still" : "motion"}`;
  const lb = (await p.locator(".chat-launcher").boundingBox())!;
  await p.screenshot({ path: `${OUT}/${tag}-launcher.png`, clip: { x: lb.x - 16, y: lb.y - 16, width: lb.width + 32, height: lb.height + 32 } });
  await p.locator(".chat-launcher").hover();
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/${tag}-launcher-hover.png`, clip: { x: lb.x - 16, y: lb.y - 20, width: lb.width + 32, height: lb.height + 36 } });
  await startClean(p);
  // A thread scene so the bar shows its title.
  await p.locator(".cs-spot textarea").fill("Who still owes dues?");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => (window as unknown as { __events: Array<[number, string]> }).__events.some(e => e[1] === "done"), null, { timeout: 30000 });
  await p.waitForTimeout(3000);
  await p.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  const bar = (await p.locator(".cs-bar").boundingBox())!;
  for (const s of STATES) {
    await p.evaluate(st => document.querySelector(".cs-mark svg")!.setAttribute("data-state", st), s);
    // Mid-loop for the moving states (the pencil starts only on a real state
    // change, so a forced answering shows the pencil at rest).
    await p.waitForTimeout(s === "thinking" ? 650 : 900);
    await p.screenshot({ path: `${OUT}/${tag}-${s}.png`, clip: { x: bar.x, y: bar.y, width: 220, height: bar.height } });
  }
  await ctx.close();
}

async function phone(b: Browser, ids: { brotherId: number; orgId: number }, device = "iPhone SE (3rd gen)") {
  const ctx = await b.newContext({ ...devices[device] });
  await login(ctx, ids.brotherId, ids.orgId);
  const p = await open(ctx, "answer");
  const vp = p.viewportSize()!;
  await p.screenshot({ path: `${OUT}/phone${device.includes("3rd") ? "" : "-320"}-launcher.png`, clip: { x: vp.width - 110, y: vp.height - 200, width: 110, height: 200 } });
  await p.locator(".chat-launcher").click({ force: true });
  await p.waitForSelector(".cs-spot textarea");
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/phone${device.includes("3rd") ? "" : "-320"}-header-landing.png`, clip: { x: 0, y: 0, width: vp.width, height: 90 } });
  await p.locator(".cs-spot textarea").fill("Who still owes dues?");
  await p.locator(".cs-spot .send").click();
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${OUT}/phone${device.includes("3rd") ? "" : "-320"}-header-thinking.png`, clip: { x: 0, y: 0, width: vp.width, height: 90 } });
  await p.waitForFunction(() => (window as unknown as { __events: Array<[number, string]> }).__events.some(e => e[1] === "done"), null, { timeout: 30000 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/phone${device.includes("3rd") ? "" : "-320"}-header-thread.png`, clip: { x: 0, y: 0, width: vp.width, height: 90 } });
  const fit = await p.evaluate(() => {
    const bar = document.querySelector(".cs-bar")!;
    const t = document.querySelector(".cs-bar .title") as HTMLElement;
    return { overflow: bar.scrollWidth > bar.clientWidth, title: t.offsetWidth, lines: Math.round(t.offsetHeight / parseFloat(getComputedStyle(t).lineHeight || "20")) };
  });
  console.log(`\n[${device} ${vp.width}px] header overflow: ${fit.overflow}  title width: ${fit.title}px, ${fit.lines} line(s)`);
  await ctx.close();
}

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const ids = { brotherId: admin.brotherId, orgId: org.id };

  const cb = await chromium.launch();
  let allOk = true;
  for (const v of (process.env.VARIANTS ?? "answer,decline,timeout").split(",").filter(Boolean)) allOk = (await walk(cb, v, ids)) && allOk;
  if (SHOTS) {
    if (process.env.GALLERY !== "0") {
      await gallery(cb, ids, "ivory", false);
      await gallery(cb, ids, "dusk", false);
      await gallery(cb, ids, "ivory", true);
    }
    const wb = await webkit.launch();
    await phone(wb, ids);
    await phone(wb, ids, "iPhone SE");
    await wb.close();
  }
  await cb.close();
  console.log(allOk ? "\nALL WALKS PASS" : "\nSOME WALKS FAILED");
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
