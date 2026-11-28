// Read-only check of the streamed verdict draft in the Ask Chapt widget.
// Stubs window.fetch for POST /api/ai/chat with a TIMED SSE stream (route.fulfill
// delivers the body in one go, which would skip the draft state entirely), so
// the client's real parsing + rendering runs with no LLM call.
//
//   tsx --env-file=.env.local scripts/_verdict-draft-shot.ts   (SLUG=… OUT=…)
//
// Scenario A — draft, then the same verdict confirmed: the draft shows muted
//   under the working line while rows are pending, then settles in place
//   (no second word-by-word entrance).
// Scenario B — draft, sent back (verdict_drop), another round, a different
//   verdict: the draft disappears and the final verdict enters normally.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/verdict-draft";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });

type Frame = [delayMs: number, event: string, data: unknown];
const ROWS = [
  { kind: "person", title: "Marcus Bell", subtitle: "Pledge class '24", value: "$240" },
  { kind: "person", title: "Andre Whitfield", subtitle: "Treasurer", value: "$180" },
];
const V1 = "Two brothers still owe *$420* in dues.";
const V2 = "Two brothers owe *$420*; Marcus is the largest at $240.";
const SCENARIOS: Record<string, Frame[]> = {
  A: [
    [100, "step", { id: "0:0", verb: "Reading the dues ledger", source: "Treasury" }],
    [100, "step_start", { id: "0:0" }],
    [400, "step_done", { id: "0:0", finding: "2 owe · $420" }],
    [200, "composing", {}],
    [500, "verdict_draft", { verdict: V1 }],
    [3000, "answer", { verdict: V1, rows: ROWS, follows: [], sources: ["Treasury"] }],
    [50, "done", {}],
  ],
  B: [
    [100, "step", { id: "0:0", verb: "Reading the dues ledger", source: "Treasury" }],
    [100, "step_start", { id: "0:0" }],
    [400, "step_done", { id: "0:0", finding: "2 owe · $420" }],
    [200, "composing", {}],
    [500, "verdict_draft", { verdict: "Three brothers still owe *$600* in dues." }],
    [2500, "composing", {}],
    [10, "verdict_drop", {}],
    [2500, "verdict_draft", { verdict: V2 }],
    [600, "answer", { verdict: V2, rows: ROWS, follows: [], sources: ["Treasury"] }],
    [50, "done", {}],
  ],
};

let failures = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };

async function state(p: Page) {
  return p.evaluate(() => {
    const last = [...document.querySelectorAll(".msg.ai")].at(-1);
    const draft = last?.querySelector(".answer.draft .verdict") as HTMLElement | null;
    const final = last?.querySelector(".answer:not(.draft) .verdict") as HTMLElement | null;
    return {
      draft: draft?.innerText ?? null,
      draftOpacity: draft ? getComputedStyle(draft).opacity : null,
      skeleton: !!last?.querySelector(".wl-skel"),
      final: final?.innerText ?? null,
      settled: !!final?.classList.contains("settle"),
      wordAnimated: !!final?.querySelector(".vw"),
      rows: last?.querySelectorAll(".answer:not(.draft) .row, .answer:not(.draft) [class*=row]").length ?? 0,
    };
  });
}

(async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  await ctx.addInitScript((scenarios: Record<string, Frame[]>) => {
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/api/ai/chat")) return real(input, init);
      if ((init?.method ?? "GET").toUpperCase() === "GET") return Promise.resolve(Response.json({ enabled: true }));
      const which = (window as unknown as { __scenario?: string }).__scenario ?? "A";
      const frames = scenarios[which];
      const enc = new TextEncoder();
      const body = new ReadableStream({
        async start(c) {
          c.enqueue(enc.encode("event: open\ndata: {}\n\n"));
          for (const [ms, ev, data] of frames) {
            await new Promise(r => setTimeout(r, ms));
            c.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`));
          }
          c.close();
        },
      });
      return Promise.resolve(new Response(body, { headers: { "content-type": "text/event-stream" } }));
    };
  }, SCENARIOS);

  const p = await ctx.newPage();
  await p.goto(`${BASE}/org/${SLUG}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal,.ui-modal{display:none!important}" }).catch(() => {});
  await p.waitForSelector(".chat-launcher", { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.click(".chat-launcher");
  // The composer sits in the welcome's dock until the first question, then the thread's.
  const COMPOSER = ".cs-dock textarea, .brief-dock textarea";
  await p.waitForSelector(COMPOSER);

  const ask = async (scenario: string, q: string) => {
    await p.evaluate(s => { (window as unknown as { __scenario?: string }).__scenario = s; }, scenario);
    await p.fill(COMPOSER, q);
    await p.keyboard.press("Enter");
  };

  // ── A ──
  await ask("A", "Who still owes dues?");
  await p.waitForSelector(".answer.draft .verdict", { timeout: 15000 });
  await p.waitForTimeout(600);
  let s = await state(p);
  await p.screenshot({ path: `${OUT}/A1-draft.png` });
  check(s.draft === V1.replace(/\*/g, ""), `A: draft shows the verdict (${JSON.stringify(s.draft)})`);
  check(Number(s.draftOpacity) < 0.7, `A: draft is muted (opacity ${s.draftOpacity})`);
  check(s.skeleton, "A: rows placeholder still under the draft");
  check(s.final === null, "A: no final answer yet");
  await p.waitForFunction(() => !document.querySelector(".msg.ai:last-of-type .answer.draft") && !!document.querySelector(".verdict.settle"), null, { timeout: 15000 });
  await p.waitForTimeout(800);
  s = await state(p);
  await p.screenshot({ path: `${OUT}/A2-settled.png` });
  check(s.draft === null, "A: draft gone once the answer lands");
  check(s.final === V1.replace(/\*/g, ""), "A: final verdict matches");
  check(s.settled && !s.wordAnimated, "A: confirmed verdict settles in place (no second entrance)");
  check(!s.skeleton, "A: placeholder gone");

  // ── B ──
  await ask("B", "Who owes the most?");
  await p.waitForFunction(() => [...document.querySelectorAll(".msg.ai")].at(-1)?.querySelector(".answer.draft"), null, { timeout: 15000 });
  await p.waitForTimeout(400);
  s = await state(p);
  await p.screenshot({ path: `${OUT}/B1-first-draft.png` });
  check(s.draft === "Three brothers still owe $600 in dues.", "B: first draft shown");
  await p.waitForFunction(() => !([...document.querySelectorAll(".msg.ai")].at(-1)?.querySelector(".answer.draft")), null, { timeout: 15000 });
  s = await state(p);
  await p.screenshot({ path: `${OUT}/B2-dropped.png` });
  check(s.draft === null && s.final === null && s.skeleton, "B: dropped draft leaves only the placeholder");
  await p.waitForFunction(() => [...document.querySelectorAll(".msg.ai")].at(-1)?.querySelector(".answer.draft"), null, { timeout: 15000 });
  s = await state(p);
  check(s.draft === V2.replace(/\*/g, ""), "B: second draft replaces it");
  await p.waitForFunction(() => !!([...document.querySelectorAll(".msg.ai")].at(-1)?.querySelector(".answer:not(.draft) .verdict")), null, { timeout: 15000 });
  await p.waitForTimeout(800);
  s = await state(p);
  await p.screenshot({ path: `${OUT}/B3-final.png` });
  check(s.final === V2.replace(/\*/g, "") && s.settled, "B: final verdict matches the second draft and settles");

  await b.close();
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
})();
