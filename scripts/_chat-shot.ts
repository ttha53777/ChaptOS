// Read-only screenshot driver for the Ask Chapt widget: stubs the /api/ai/chat
// SSE stream (no LLM call) and the proposal endpoint (no DB write).
// tsx --env-file=.env.local scripts/_chat-shot.ts   (THEME=dusk AES=ledger OUT=…)
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
const BASE = "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/chat";
const THEME = process.env.THEME ?? "ivory";
const AES = process.env.AES ?? "paper";
const W = Number(process.env.W ?? 1280);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });

const frame = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
const perm = { name: "MANAGE_TREASURY", label: "Manage treasury", canApprove: true };
const STREAM = [
  frame("step", { id: "0", verb: "Reading the dues ledger", source: "Treasury" }),
  frame("step_start", { id: "0" }),
  frame("step_done", { id: "0", finding: "14 owe · $1,840" }),
  frame("step", { id: "1", verb: "Checking who paid this week", source: "Roster" }),
  frame("step_start", { id: "1" }),
  frame("step_done", { id: "1", finding: "3 paid" }),
  frame("answer", {
    verdict: "Fourteen brothers still owe *$1,840* in dues — Marcus is the largest at $240.",
    rows: [
      { kind: "person", title: "Marcus Bell", subtitle: "Pledge class '24", value: "$240" },
      { kind: "person", title: "Andre Whitfield", subtitle: "Treasurer", value: "$180" },
      { kind: "money", title: "Spring dues", subtitle: "Due Oct 12", value: "$1,840" },
    ],
    follows: [{ label: "Remind them", ask: "Draft a reminder" }],
    sources: ["Treasury", "Roster"],
  }),
  frame("proposal", {
    action: "propose_add_deadline", endpoint: "/api/__paperstub", method: "POST",
    payload: { title: "Pay spring dues", dueDate: "2026-10-12" }, summary: "Add a deadline",
    display: { kind: "deadline", title: "Add a deadline", rows: [
      { k: "Title", v: "Pay spring dues", em: true }, { k: "Due", v: "Mon, Oct 12" }, { k: "Notes", v: "Reminder for the 14 who still owe." },
    ] },
    perm, sig: null, iat: Date.now(),
  }),
  frame("proposal", {
    action: "propose_record_payment", endpoint: "/api/__paperstub", method: "POST",
    payload: { amount: 240 }, summary: "Record a payment",
    display: { kind: "payment", title: "Record Marcus's $240", rows: [
      { k: "Member", v: "Marcus Bell", em: true }, { k: "Amount", v: "$240.00" },
    ] },
    perm: { name: "MANAGE_DUES", label: "Manage dues", canApprove: false, holders: { roleTitles: ["Treasurer"], memberName: "Andre Whitfield" } },
    sig: null, iat: Date.now(),
  }),
  frame("done", {}),
].join("");

(async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: 900 } });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  await ctx.addInitScript(([aes, theme]) => {
    try { localStorage.setItem("chaptos:aesthetic:v1", aes); localStorage.setItem("chaptos:theme:v1", theme); } catch {}
  }, [AES, THEME]);
  const p = await ctx.newPage();
  await p.route("**/api/ai/chat", r => r.request().method() === "GET"
    ? r.fulfill({ json: { enabled: true } })
    : r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: STREAM }));
  await p.route("**/api/__paperstub", r => r.fulfill({ json: { ok: true } }));
  await p.goto(`${BASE}/${SLUG}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await p.waitForSelector(".chat-launcher", { timeout: 90000 });
  await p.waitForTimeout(1500);
  const shot = async (n: string) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
  await p.click(".chat-launcher");
  await p.waitForSelector(".cs-spot");
  await shot("01-home");
  await p.fill(".cs-dock textarea", "Who still owes dues?");
  await p.keyboard.press("Enter");
  await p.waitForSelector(".writ", { timeout: 20000 });
  await p.waitForTimeout(1500);
  await shot("02-answer");
  await p.evaluate(() => document.querySelector(".writ")?.scrollIntoView({ block: "start" }));
  await shot("03-writ");
  await p.locator(".writ .wv.val").first().click();
  await shot("04-edit");
  await p.keyboard.press("Escape");
  await p.locator(".writ [data-w=ratify]").first().click();
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector(".writ")?.scrollIntoView({ block: "start" }));
  await shot("05-approved");
  await p.locator(".writ [data-w=decline]").last().click();
  await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelectorAll(".writ")[1]?.scrollIntoView({ block: "center" }));
  await shot("06-dismissed");
  await b.close();
})();
