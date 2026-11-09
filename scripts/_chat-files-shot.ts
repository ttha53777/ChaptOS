// Ask Chapt attachments UI: paperclip, tray states, the request body, citation
// chips and the excerpt sheet — desktop and phone, in the paper aesthetic (the
// only one users get) in both its themes.
// Read-only: every /api/ai/* call is stubbed, so nothing reaches the model or
// the DB. tsx --env-file=.env.local scripts/_chat-files-shot.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page, type BrowserContext } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = "http://localhost:3000";
const OUT = "_screenshots";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
const frame = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;

const PDF_ID = "11111111-1111-4111-8111-111111111111";
const XLS_ID = "22222222-2222-4222-8222-222222222222";
const info = (id: string, name: string, kind: string, unitCount: number, unitNoun: string, truncated = false) =>
  ({ id, name, kind, sizeBytes: 48211, unitCount, unitNoun, truncated, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() });

const STREAM = [
  frame("open", {}),
  frame("step", { id: "pre:0", verb: "Reading the file", source: "File · Constitution.pdf" }),
  frame("step_done", { id: "pre:0", finding: "Constitution.pdf · 6 parts" }),
  frame("step", { id: "0:0", verb: "Calculating from the file", source: "Files" }),
  frame("step_start", { id: "0:0" }),
  frame("step_done", { id: "0:0", finding: "7 rows" }),
  frame("answer", {
    verdict: "Officers are elected each *April* by secret ballot; the budget totals $1,988.15.",
    citations: [{ attachmentId: PDF_ID, name: "Constitution.pdf", kind: "pdf", unit: "p3", locator: "p. 3" }],
    rows: [
      { kind: "generic", title: "Elections", subtitle: "Each April by secret ballot; a simple majority of members present wins, with a runoff between the top two.", citations: [{ attachmentId: PDF_ID, name: "Constitution.pdf", kind: "pdf", unit: "p3", locator: "p. 3" }] },
      { kind: "money", title: "Social spending", value: "$1,550.50", subtitle: "Formal venue, DJ, less a $100 refund", citations: [{ attachmentId: XLS_ID, name: "Spring budget.xlsx", kind: "xlsx", unit: "sh1!B3:C8", locator: "Events!B3:C8" }] },
      { kind: "generic", title: "Bogus citation is dropped by the client", citations: [{ nope: true }] },
    ],
    follows: [{ label: "Dues rules", ask: "What does it say about dues?" }],
    sources: ["File · Constitution.pdf", "File · Spring budget.xlsx"],
  }),
  frame("done", {}),
].join("");

let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok) failures++; };

async function stub(p: Page, opts: { files: boolean; bodies: unknown[] }) {
  await p.route("**/api/ai/chat", async r => {
    if (r.request().method() === "GET") {
      return r.fulfill({ json: opts.files ? { enabled: true, files: true, fileLimits: { maxBytes: 4194304, maxFiles: 5, extensions: [".pdf", ".docx", ".xlsx", ".csv", ".txt", ".md"] } } : { enabled: true } });
    }
    opts.bodies.push(JSON.parse(r.request().postData() ?? "{}"));
    return r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: STREAM });
  });
  await p.route("**/api/ai/attachments**", async r => {
    const req = r.request();
    const url = req.url();
    if (url.includes("/units/")) {
      return r.fulfill({ json: url.includes(XLS_ID)
        ? { label: "Events!B3:C8", text: null, grid: [["Category", "Amount"], ["Social", 1200.5], ["Social", 450], ["Service", 85.25], ["Recruitment", 310.1], ["Recruitment", 42.3], ["Social", -100]] }
        : { label: "Page 3", text: "Article III — Officers and Elections\nThe officers are the President, Vice President, Treasurer and Secretary. Officers are elected each April by secret ballot. A candidate needs a simple majority of members present; if no candidate has a majority, a runoff is held between the top two at the same meeting.", grid: null } });
    }
    if (req.method() === "GET") return r.fulfill({ json: [] });
    if (req.method() === "DELETE") return r.fulfill({ json: { ok: true, removed: 2 } });
    const body = req.postDataBuffer()?.toString("latin1") ?? "";
    await new Promise(res => setTimeout(res, 900));
    if (body.includes("minutes.doc")) {
      return r.fulfill({ status: 400, json: { error: "Old .doc / .xls files aren't supported. Save it as .docx / .xlsx and try again.", code: "VALIDATION", details: { code: "LEGACY_FORMAT" } } });
    }
    if (body.includes("budget.xlsx")) return r.fulfill({ status: 201, json: info(XLS_ID, "Spring budget.xlsx", "xlsx", 2, "sheet") });
    return r.fulfill({ status: 201, json: info(PDF_ID, "Constitution.pdf", "pdf", 68, "page", true) });
  });
}

async function openOrg(p: Page, slug: string) {
  await p.goto(`${BASE}/org/${slug}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal,.ui-modal{display:none!important}" }).catch(() => {});
  await p.waitForSelector(".chat-launcher", { timeout: 90000 });
  await p.waitForTimeout(1000);
}

async function run(ctx: BrowserContext, slug: string, phone: boolean, theme: "ivory" | "dusk", tag: string) {
  const p = await ctx.newPage();
  const bodies: unknown[] = [];
  await stub(p, { files: true, bodies });
  await openOrg(p, slug);
  await p.evaluate(t => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("chaptos_chat")) localStorage.removeItem(k);
    document.documentElement.setAttribute("data-aesthetic", "paper");
    document.documentElement.setAttribute("data-theme", t);
  }, theme);
  await p.click(".chat-launcher");
  await p.waitForSelector(".cs-dock .clip", { timeout: 15000 });
  await p.setInputFiles(".cs-dock input[type=file]", [
    { name: "constitution.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fake") },
    { name: "budget.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("PK fake") },
    { name: "minutes.doc", mimeType: "application/msword", buffer: Buffer.from("old") },
  ]);
  await p.waitForTimeout(250);
  if (tag === "desktop-ivory") {
    check(await p.isDisabled(".cs-dock .send"), "send is disabled while files upload");
    await p.screenshot({ path: `${OUT}/chat-files-${tag}-uploading.png` });
  }
  await p.waitForSelector(".att-chip.is-ready >> nth=1", { timeout: 15000 });
  await p.waitForSelector(".att-chip.is-failed", { timeout: 15000 });
  const tray = await p.locator(".att-tray").innerText();
  if (tag === "desktop-ivory") {
    check(tray.includes("first 68 pages"), "a truncated file reads 'first 68 pages'");
    check(tray.includes("2 sheets"), "a workbook reads '2 sheets'");
    check(tray.includes("Old .doc"), "a failed chip shows the server's reason");
  }
  await p.screenshot({ path: `${OUT}/chat-files-${tag}-tray.png` });

  await p.fill(".cs-dock textarea", "When are elections, and what did we budget for social?");
  await p.keyboard.press("Enter");
  await p.waitForSelector(".verdict-cites .cite-chip", { timeout: 20000 });
  await p.waitForTimeout(700);
  if (tag === "desktop-ivory") {
    const body = bodies[0] as { attachmentIds?: string[]; messages?: { content: string }[] };
    check(JSON.stringify(body.attachmentIds) === JSON.stringify([PDF_ID, XLS_ID]), "the question carries both ready files' ids (not the failed one)");
    check(body.messages?.at(-1)?.content === "When are elections, and what did we budget for social?\n(attached: Constitution.pdf, Spring budget.xlsx)", "the question goes out as typed, plus the line naming its files");
    check((await p.locator(".msg.user .msg-files").innerText()).includes("Constitution.pdf"), "the user bubble names the files it carried");
    check(await p.locator(".row-cites .cite-chip").count() === 2, "two cited rows show chips; the malformed citation is dropped");
  }
  await p.screenshot({ path: `${OUT}/chat-files-${tag}-answer.png` });

  await p.locator(".row-cites .cite-chip").nth(phone ? 0 : 1).click();
  await p.waitForSelector(phone ? ".cs-excerpt .ex-text" : ".cs-excerpt .ex-grid td", { timeout: 15000 });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/chat-files-${tag}-excerpt.png` });
  await p.click(".cs-excerpt .peek-back");

  if (tag === "desktop-ivory") {
    // A follow-up re-sends the files without naming them again in the bubble.
    await p.fill(".cs-dock textarea", "And dues?");
    await p.keyboard.press("Enter");
    await p.waitForFunction(() => document.querySelectorAll(".msg.user").length === 2);
    await p.waitForTimeout(800);
    const second = bodies[1] as { attachmentIds?: string[]; messages?: { role: string; content: string }[] };
    check(second.attachmentIds?.length === 2, "a follow-up still sends both files");
    check(!!second.messages?.some(m => m.role === "user" && m.content.includes("(attached: Constitution.pdf, Spring budget.xlsx)")), "history tells later turns which files were attached");
    check(await p.locator(".msg.user .msg-files").count() === 1, "only the first message names the files");
    // Remove one, then ← New clears the tray.
    await p.locator(".att-chip.is-failed .att-x").click();
    await p.locator(".att-chip", { hasText: "Spring budget" }).locator(".att-x").click();
    check(await p.locator(".att-chip").count() === 1, "removing chips leaves one file");
    await p.click(".newq");
    check(await p.locator(".att-chip").count() === 0, "← New empties the tray");
  }
  await p.close();
}

(async () => {
  const m = await prisma.membership.findFirstOrThrow({ where: { brother: { isGhost: false } }, select: { brotherId: true, organization: { select: { id: true, slug: true } } } });
  await prisma.$disconnect();
  const browser = await chromium.launch();
  const cookies = (c: BrowserContext) => c.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE },
    { name: "active_org_id", value: String(m.organization.id), url: BASE },
  ]);

  // Flag off: the composer is exactly as before.
  const offCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await cookies(offCtx);
  const off = await offCtx.newPage();
  await stub(off, { files: false, bodies: [] });
  await openOrg(off, m.organization.slug);
  await off.click(".chat-launcher");
  await off.waitForSelector(".cs-dock textarea");
  check(await off.locator(".cs-dock .clip").count() === 0, "no paperclip when attachments are off");
  check(await off.locator(".att-tray").count() === 0, "no tray when attachments are off");
  await offCtx.close();

  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await cookies(desk);
  await run(desk, m.organization.slug, false, "ivory", "desktop-ivory");
  await run(desk, m.organization.slug, false, "dusk", "desktop-dusk");
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await cookies(phone);
  await run(phone, m.organization.slug, true, "ivory", "phone-ivory");
  await run(phone, m.organization.slug, true, "dusk", "phone-dusk");
  await browser.close();
  console.log(failures ? `${failures} check(s) failed` : "all checks passed");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
