// Screenshots the new task/poll sheets and the filing flight on /tasks, with
// every /api/tasks and /api/polls request (reads AND writes) answered here, so
// nothing touches the shared dev/prod DB.
// OUT=… W=1440 H=900 THEME=ivory tsx --env-file=.env.local scripts/_task-sheets-shot.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/task-sheets";
const THEME = process.env.THEME ?? "ivory";
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });

const iso = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
function task(id: number, title: string, dueDate: string | null, over: Record<string, unknown> = {}) {
  return {
    id, title, dueDate, dueTime: null, status: "open", notes: null, createdById: null, completedById: null, completedAt: null,
    createdAt: new Date().toISOString(), assignments: [], everyone: "each", doneCount: 3, memberCount: 12, ...over,
  };
}
const TASKS = [
  task(1, "Send October minutes", iso(-3), { everyone: "any", doneCount: null, memberCount: null }),
  task(2, "Sign up for a service shift", iso(3)),
  task(3, "Confirm the DJ for formal", iso(5), { everyone: "any", doneCount: null, memberCount: null, dueTime: "18:00" }),
  task(4, "Pay fall dues", iso(15)),
  task(5, "Update the bylaws doc", null, { everyone: "any", doneCount: null, memberCount: null }),
];
const POLLS = [{
  id: 1, question: "Where should we hold spring formal?", closeDate: iso(4), status: "open", createdById: null, closedById: null, closedAt: null,
  createdAt: new Date().toISOString(), options: [{ id: 1, label: "The house", position: 0, voteCount: null }, { id: 2, label: "Lakeside", position: 1, voteCount: null }],
  assignments: [], everyone: true, totalVotes: 4, assigneeCount: 12, myVoteOptionId: null, sealed: true,
}];

async function stub(p: Page, posted: unknown[]) {
  let next = 100;
  await p.route(/\/api\/(tasks|polls)(\/|\?|$)/, async r => {
    const req = r.request(), url = new URL(req.url()), m = req.method();
    const isPoll = url.pathname.startsWith("/api/polls");
    if (m === "GET") {
      if (/\/api\/tasks\/\d+$/.test(url.pathname)) return r.fulfill({ json: { id: Number(url.pathname.split("/").pop()), parts: null, history: [] } });
      return r.fulfill({ json: isPoll ? POLLS : TASKS });
    }
    const body = req.postDataJSON() ?? {};
    posted.push({ m, path: url.pathname, body });
    await new Promise(res => setTimeout(res, 500)); // a realistic round trip
    if (isPoll) return r.fulfill({ json: { ...POLLS[0], id: next++, question: body.question, closeDate: body.closeDate ?? null, totalVotes: 0,
      options: (body.options ?? []).map((label: string, i: number) => ({ id: 50 + i, label, position: i, voteCount: null })) } });
    return r.fulfill({ json: task(next++, body.title, body.dueDate ?? null, {
      dueTime: body.dueTime ?? null, notes: body.notes ?? null, everyone: body.everyone ?? null,
      doneCount: body.everyone === "each" ? 0 : null, memberCount: body.everyone === "each" ? 12 : null,
    }) });
  });
}

(async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  await ctx.addInitScript(([theme]) => { try { localStorage.setItem("chaptos:aesthetic:v1", "paper"); localStorage.setItem("chaptos:theme:v1", theme); } catch { /* */ } }, [THEME]);
  const p = await ctx.newPage();
  const errs: string[] = [], posted: unknown[] = [];
  p.on("pageerror", e => errs.push(String(e)));
  await stub(p, posted);
  await p.goto(`${BASE}/org/${SLUG}/tasks`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important} .ui-modal:has(.tg){display:none!important}" }).catch(() => {});
  await p.waitForSelector(".tks-pile", { timeout: 120000 });
  await p.waitForTimeout(2500);
  const shot = async (n: string) => { await p.waitForTimeout(450); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
  const sheet = (n: string) => p.screenshot({ path: `${OUT}/${n}.png` }).then(() => console.log("shot", n));

  // ── task sheet
  await p.locator("button:has-text('New task'), button:has-text('Add task')").first().click();
  await p.waitForSelector(".tsh", { timeout: 20000 });
  await p.waitForTimeout(700);
  await sheet("t1-default");
  await p.fill("#tsh-title", "Book the room for chapter");
  await p.locator('.tsh .mode[data-m="roles"]').click(); await p.waitForTimeout(300);
  await p.locator(".tsh .tag").nth(0).click().catch(() => {}); await p.locator(".tsh .tag").nth(1).click().catch(() => {});
  await p.waitForTimeout(400); await sheet("t2-roles");
  await p.locator('.tsh .mode[data-m="people"]').click(); await p.waitForTimeout(300);
  for (const i of [1, 2, 3]) await p.locator(".tsh .face").nth(i).click().catch(() => {});
  await p.waitForTimeout(400); await sheet("t3-people");
  await p.locator('.tsh .mode[data-m="all"]').click(); await p.waitForTimeout(500); await sheet("t4-each");
  await p.locator(".tsh .sw").click(); await p.waitForTimeout(700); await sheet("t5-any");
  await p.locator(".tsh .sw").click();
  await p.fill('.tsh input[type="time"]', "17:30");
  await p.locator(".tsh .addnote").click(); await p.fill("#tsh-note", "Room 204 in the union. Key at the front desk.");
  await p.waitForTimeout(400); await sheet("t6-filled");
  const ow = await p.evaluate(() => [document.documentElement.scrollWidth - innerWidth, (() => { const f = document.querySelector(".tsh") as HTMLElement; return f.scrollWidth - f.clientWidth; })()]);
  if (ow[0] > 0 || ow[1] > 0) errs.push(`overflow ${ow}`);

  // ── submit → flight frames
  await p.locator(".tsh button[type=submit]").click();
  const t0 = Date.now();
  for (const at of [700, 950, 1200, 1450, 1800, 2600]) { await p.waitForTimeout(Math.max(0, at - (Date.now() - t0))); await p.screenshot({ path: `${OUT}/f-${at}.png` }); }
  console.log("flight frames");
  const landed = await p.locator(".tks-tk", { hasText: "Book the room for chapter" }).count();
  if (!landed) errs.push("new row not in list");
  const rowText = await p.locator(".tks-tk", { hasText: "Book the room for chapter" }).first().innerText().catch(() => "");
  if (!/5:30 PM/.test(rowText)) errs.push("row missing time: " + rowText.replace(/\s+/g, " "));

  // ── poll sheet
  await p.locator("button:has-text('New poll')").first().click().catch(() => errs.push("no New poll button"));
  await p.waitForSelector(".tsh.poll", { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(700);
  if (await p.locator(".tsh.poll").count()) {
    await p.fill("#tsh-q", "Where should we hold spring formal?");
    await p.locator(".tsh.poll .popt input").nth(0).fill("The house");
    await p.locator(".tsh.poll .popt input").nth(1).fill("Lakeside pavilion");
    await p.waitForTimeout(400); await p.locator(".tsh.poll").screenshot({ path: `${OUT}/p1.png` });
    await p.locator(".tsh.poll button[type=submit]").click();
    await p.waitForTimeout(1500);
  }
  await shot("z-after");
  console.log("POSTED", JSON.stringify(posted));
  console.log(errs.length ? "ERRS\n" + errs.join("\n") : "clean");
  await b.close();
})();
