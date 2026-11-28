// Read-only check for the APP's Ask Chapt anchoring (mobile/src/app/ask.tsx): a long
// answer stops with its headline at the top, "More below" reads on. Drives the dev web
// preview on :8799 (mobile: node scripts/app-web.mjs --build); Playwright answers /api
// itself — GETs read from :3000, writes are refused, the chat stream is stubbed.
//   npx tsx --env-file=.env.local scripts/_app-anchor-shot.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = "http://localhost:8799", API = "http://localhost:3000";
const OUT = "_screenshots/anchor";
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
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: process.env.SLUG ?? "lpe" }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const cookie = `${DEV_IMPERSONATE_COOKIE}=${signImpersonation(admin.brotherId)}; active_org_id=${org.id}`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: "light" });
  await ctx.addCookies([{ name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(admin.brotherId), url: BASE }]);
  const p = await ctx.newPage();
  p.on("pageerror", e => console.log("PAGEERROR", String(e).slice(0, 300)));
  await p.route(u => u.pathname.startsWith("/api/"), async r => {
    const req = r.request(), url = new URL(req.url());
    if (url.pathname === "/api/ai/chat") {
      if (req.method() === "GET") return r.fulfill({ json: { enabled: true } });
      const q = (JSON.parse(req.postData() ?? "{}").messages?.at(-1)?.content ?? "") as string;
      const a = answer(q.startsWith("short"));
      return r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" },
        body: frame("open", {}) + frame("step", { id: "s1", verb: "Reading dues", source: "Dues" }) + frame("step_start", { id: "s1" }) + frame("step_done", { id: "s1", finding: "14 open" }) + frame("verdict_draft", { verdict: a.verdict }) + frame("answer", a) + frame("done", {}) });
    }
    if (req.method() !== "GET") return r.fulfill({ json: {} }); // never write to the shared DB
    const res = await r.fetch({ url: API + url.pathname + url.search, headers: { ...req.headers(), cookie, origin: API } });
    if (url.pathname === "/api/auth/me") {
      const j = await res.json() as { terms?: { version: string; acceptedVersion: string | null } };
      if (j.terms) j.terms.acceptedVersion = j.terms.version;
      return r.fulfill({ response: res, json: j });
    }
    return r.fulfill({ response: res });
  });
  // A cold load of /ask lands on Home (the modal needs the tabs under it): boot, then open it.
  await p.goto(BASE + "/", { waitUntil: "load" });
  await p.getByText("Good morning", { exact: false }).or(p.getByText("Good afternoon", { exact: false })).or(p.getByText("Good evening", { exact: false })).first().waitFor({ timeout: 60000 });
  await p.evaluate(() => { history.pushState({}, "", "/ask"); dispatchEvent(new PopStateEvent("popstate")); });
  await p.waitForTimeout(1500);
  if (!(await p.getByRole("textbox", { name: "Ask Chapt" }).count())) {
    await p.goto(BASE + "/ask", { waitUntil: "load" }); // client router may accept it once warm
  }
  const box = p.getByRole("textbox", { name: "Ask Chapt" });
  await box.waitFor({ timeout: 60000 }).catch(async () => { await p.screenshot({ path: `${OUT}/app-boot.png` }); console.log((await p.innerText("body")).slice(0, 400)); throw new Error("no composer"); });
  await p.waitForTimeout(1500);
  const state = (head: string) => p.evaluate(h => {
    const el = [...document.querySelectorAll("div")].reverse().find(d => d.textContent?.trim().startsWith(h) && d.children.length < 6);
    const r = el?.getBoundingClientRect();
    return { headlineTop: r ? Math.round(r.top) : null, pill: [...document.querySelectorAll("[role=button]")].map(x => x.getAttribute("aria-label")).find(l => l === "More below" || l === "Latest answer") ?? null };
  }, head);
  let n = 0;
  for (const [q, head] of [["short: who owes?", "$120 is owed"], ["long: who owes dues?", "14 members"], ["long: and again?", "14 members"]]) {
    await box.fill(q);
    await p.getByLabel("Ask", { exact: true }).click();
    n++;
    await p.waitForTimeout(3000);
    console.log(q, JSON.stringify(await state(head)));
    await p.screenshot({ path: `${OUT}/app-${n}.png` });
  }
  const pill = p.getByLabel("More below", { exact: true });
  if (await pill.count()) {
    await pill.click(); await p.waitForTimeout(1200);
    console.log("after More below", JSON.stringify(await state("14 members")));
    await p.screenshot({ path: `${OUT}/app-4-more.png` });
  }
  await b.close();
})();
