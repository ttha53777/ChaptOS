// Read-only driver for Ask Chapt dictation: replaces the browser's
// SpeechRecognition with a fake the script drives, and stubs the /api/ai/chat
// SSE stream (no LLM call). Asserts the composer behaviour, then screenshots.
// tsx --env-file=.env.local scripts/_dictation-shot.ts   (OUT=…)
import { mkdirSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/dictation";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });

const frame = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
const STREAM = [frame("answer", { verdict: "Fourteen brothers still owe *$1,840*.", rows: [], follows: [], sources: ["Treasury"] }), frame("done", {})].join("");

function check(ok: boolean, what: string) {
  console.log(ok ? "ok  " : "FAIL", what);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  // A string, not a function: tsx wraps classes in a __name() helper the page doesn't have.
  await ctx.addInitScript(`
    try { localStorage.setItem("chaptos:aesthetic:v1", "paper"); localStorage.setItem("chaptos:theme:v1", "ivory"); } catch {}
    // The fake recogniser: window.__rec is the live instance, __hear() speaks to it.
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      constructor() { this.onresult = this.onerror = this.onend = null; }
      start() { window.__rec = this; }
      stop() { if (this.onend) this.onend(); }
      abort() { window.__recAborted = true; if (this.onend) this.onend(); }
    };
    window.__hear = (...parts) => window.__rec && window.__rec.onresult && window.__rec.onresult({ results: parts.map(t => [{ transcript: t }]) });
    window.__recError = error => { const r = window.__rec; if (r.onerror) r.onerror({ error }); if (r.onend) r.onend(); };
  `);
  // The impersonated admin may not have accepted the current terms — skip the wall.
  await ctx.route("**/api/auth/me", async route => {
    const res = await route.fetch();
    const json = await res.json();
    if (json?.terms) json.terms.acceptedVersion = json.terms.version;
    return route.fulfill({ response: res, json });
  });
  const p = await ctx.newPage();
  await p.route("**/api/ai/chat", r => r.request().method() === "GET"
    ? r.fulfill({ json: { enabled: true } })
    : r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: STREAM }));
  const res = await p.goto(`${BASE}/org/${SLUG}`, { waitUntil: "domcontentloaded" });
  console.log("Permissions-Policy:", res?.headers()["permissions-policy"]);
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await p.waitForSelector(".chat-launcher", { timeout: 90000 });
  await p.waitForTimeout(1500);
  const shot = async (n: string) => { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
  const ta = p.locator(".cs-dock textarea");
  const mic = p.locator(".cs-dock .composer .mic");

  await p.click(".chat-launcher");
  await p.waitForSelector(".cs-spot");
  check(await mic.count() === 1, "mic button renders when the browser supports dictation");
  await shot("01-idle");

  // Typed text is kept; words arrive live and revise.
  await ta.fill("Hey,");
  await mic.click();
  check(await mic.getAttribute("aria-pressed") === "true", "button is pressed while listening");
  await p.evaluate(() => (window as any).__hear("who still"));
  await p.waitForTimeout(150);
  check(await ta.inputValue() === "Hey, who still", "interim words append to typed text");
  await shot("02-listening");
  await p.evaluate(() => (window as any).__hear("who still owes dues"));
  await p.waitForTimeout(150);
  check(await ta.inputValue() === "Hey, who still owes dues", "a later result revises, not duplicates");

  // Typing takes the composer back.
  await ta.pressSequentially("?");
  check(await mic.getAttribute("aria-pressed") === "false", "typing stops dictation");
  check(await ta.inputValue() === "Hey, who still owes dues?", "typed character lands after the heard text");

  // A blocked microphone says so.
  await mic.click();
  await p.evaluate(() => (window as any).__recError("not-allowed"));
  await p.waitForTimeout(150);
  check(await p.locator(".cs-dock .mic-note").count() === 1, "blocked mic shows a note");
  await shot("03-blocked");

  // Sending cancels: a late word can't refill the cleared composer.
  await mic.click();
  check(await p.locator(".cs-dock .mic-note").count() === 0, "note clears on the next start");
  check(await ta.evaluate(el => el === document.activeElement), "focus returns to the field after pressing the mic");
  await p.keyboard.press("Enter");
  await p.waitForSelector(".msg.user");
  check(await p.evaluate(() => (window as any).__recAborted === true), "send aborts the recogniser");
  check(await p.evaluate(() => (window as any).__rec.onresult === null), "send detaches the result handler");
  check(await ta.inputValue() === "", "composer is empty after send");
  await p.waitForTimeout(800);
  await shot("04-sent");

  // No SpeechRecognition (Firefox) → no button.
  const p2 = await ctx.newPage();
  await p2.addInitScript("delete window.webkitSpeechRecognition; delete window.SpeechRecognition;");
  await p2.route("**/api/ai/chat", r => r.fulfill({ json: { enabled: true } }));
  await p2.goto(`${BASE}/org/${SLUG}`, { waitUntil: "domcontentloaded" });
  await p2.waitForSelector(".chat-launcher", { timeout: 90000 });
  await p2.waitForTimeout(1500);
  await p2.click(".chat-launcher");
  await p2.waitForSelector(".cs-spot");
  await p2.waitForTimeout(400);
  check(await p2.locator(".cs-dock .composer .mic").count() === 0, "no mic button without SpeechRecognition");
  await b.close();
})();
