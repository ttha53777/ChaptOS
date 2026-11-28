// Read-only check for Ask Chapt answer anchoring (ChatWidget pinThread): a long
// answer must stop with its headline at the top of the thread, not drop the
// reader at the end of the rows; the "More below" tab reads on. Stubbed SSE, no
// LLM, no writes.  tsx --env-file=.env.local scripts/_anchor-shot.ts  (W=390 phone)
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = "_screenshots/anchor";
const W = Number(process.env.W ?? 1280);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
const frame = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
const names = ["Arijit Das", "Noah Kim", "Bryan Lee", "Elvin De La Cruz", "Jacob Hwang", "Rinchen Sherpalama", "Issac Chong", "Nathaniel Baccaray", "Marcus Webb", "Owen Park", "Leo Tran", "Sam Ortiz", "Dev Patel", "Kai Mori"];
const answer = (short: boolean) => ({
  verdict: short ? "*$120* is owed, all by Noah Kim." : "*14 members* still owe dues — *$2,310* in total.",
  rows: (short ? names.slice(0, 1) : names).map((n, i) => ({ kind: "person", title: n, subtitle: "Owes dues", value: `$${120 + i * 15}`, ref: { type: "member", id: 9000 + i } })),
  follows: [{ label: "Remind them", ask: "Remind them" }], sources: ["Dues"],
});

(async () => {
  mkdirSync(OUT, { recursive: true });
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: W < 600 ? 844 : 900 }, deviceScaleFactor: 2, hasTouch: W < 600, isMobile: W < 600 });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(admin.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  const p = await ctx.newPage();
  p.on("pageerror", e => console.log("PAGEERROR", String(e).slice(0, 400)));
  await p.route("**/api/auth/me", async r => {
    const res = await r.fetch();
    const j = await res.json() as { terms?: { version: string; acceptedVersion: string | null } };
    if (j.terms) j.terms.acceptedVersion = j.terms.version;
    return r.fulfill({ response: res, json: j });
  });
  await p.route("**/api/ai/chat", async r => {
    if (r.request().method() === "GET") return r.fulfill({ json: { enabled: true } });
    const q = (JSON.parse(r.request().postData() ?? "{}").messages?.at(-1)?.content ?? "") as string;
    const a = answer(q.startsWith("short"));
    return r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" },
      body: frame("open", {}) + frame("step", { id: "s1", verb: "Reading dues", source: "Dues" }) + frame("step_start", { id: "s1" }) + frame("step_done", { id: "s1", finding: "14 open" }) + frame("verdict_draft", { verdict: a.verdict }) + frame("answer", a) + frame("done", {}) });
  });
  await p.goto(`${BASE}/org/${SLUG}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await p.waitForSelector(".chat-launcher", { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.click(".chat-launcher");
  await p.waitForSelector(".cs-spot");
  const state = () => p.evaluate(() => {
    const t = document.querySelector<HTMLElement>(".cs-thread")!;
    const ai = [...t.querySelectorAll<HTMLElement>(":scope > .msg.ai")].at(-1)!;
    const v = ai.querySelector<HTMLElement>(".verdict, .answer h3, .answer") ?? ai;
    const tr = t.getBoundingClientRect(), vr = v.getBoundingClientRect();
    return { headlineFromTop: Math.round(vr.top - tr.top), headlineVisible: vr.top >= tr.top - 1 && vr.top < tr.bottom,
      restBelow: Math.round(t.scrollHeight - t.clientHeight - t.scrollTop), pill: document.querySelector(".cs-below")?.textContent ?? null };
  });
  let n = 0;
  for (const q of ["short: who owes?", "long: who owes dues?", "long: and again?"]) {
    await p.fill(".cs-spot textarea:visible", q);
    await p.keyboard.press("Enter");
    n++;
    await p.waitForFunction(c => document.querySelectorAll(".cs-thread > .msg.ai .reslist, .cs-thread > .msg.ai .res").length >= 1 && document.querySelectorAll(".cs-thread > .msg.ai").length >= c, n, { timeout: 20000 });
    await p.waitForTimeout(1500);
    console.log(q, JSON.stringify(await state()));
    await p.screenshot({ path: `${OUT}/${n}-${W}.png` });
  }
  if (await p.locator(".cs-below").count()) {
    await p.click(".cs-below");
    await p.waitForTimeout(1000);
    console.log("after More below", JSON.stringify(await state()));
    await p.screenshot({ path: `${OUT}/4-more-${W}.png` });
    await p.locator(".cs-thread").evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll")); });
    await p.waitForTimeout(400);
    console.log("scrolled to top", JSON.stringify(await state()));
    await p.screenshot({ path: `${OUT}/5-history-${W}.png` });
  }
  await b.close();
})();
