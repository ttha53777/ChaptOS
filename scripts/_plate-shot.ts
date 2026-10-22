// Read-only: the dashboard "On your plate" card. The dev DB is prod, so every
// non-GET /api call is answered here and never reaches the server. Seeds a vote
// and a reimbursement so every row kind shows.
// tsx --env-file=.env.local scripts/_plate-shot.ts   (BASE=… SLUG=… OUT=… ONLY=a,b)
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page, type Route } from "playwright";
import { mkdirSync } from "node:fs";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/plate";
const ONLY = process.env.ONLY?.split(",");
mkdirSync(OUT, { recursive: true });

const iso = (d: number) => new Date(Date.now() + d * 86400e3).toISOString().slice(0, 10);
const POLL = {
  id: 99001, question: "Philanthropy partner for spring?", closeDate: iso(2), status: "open", createdById: null, closedById: null, closedAt: null,
  createdAt: iso(-3), totalVotes: 4, assigneeCount: 20, myVoteOptionId: null, sealed: true, assignments: [],
  options: [["Habitat for Humanity", 0], ["Local food bank", 1], ["Children's hospital", 2]].map(([label, position], i) => ({ id: 99100 + i, label, position, voteCount: null })),
};
const REIMB = (selfId: number) => [
  { id: 99201, brotherId: selfId, brother: { id: selfId, name: "Maya Patel", avatarUrl: null }, amount: 96, date: iso(-4), description: "Mixer decorations", status: "pending", createdAt: iso(-4), updatedAt: iso(-4) },
  { id: 99202, brotherId: selfId, brother: { id: selfId, name: "Theo Grant", avatarUrl: null }, amount: 70, date: iso(-6), description: "Gas, retreat drive", status: "pending", createdAt: iso(-6), updatedAt: iso(-6) },
];

type Scene = { name: string; width: number; member?: boolean; rail?: boolean; act?: (p: Page) => Promise<void> };

async function guard(p: Page, s: Scene, selfId: number) {
  let tasks: Record<string, unknown>[] = [];
  await p.route(u => u.pathname.startsWith("/api/"), async (r: Route) => {
    const req = r.request(), url = new URL(req.url()), path = url.pathname;
    if (req.method() === "PATCH" && /^\/api\/tasks\/\d+$/.test(path)) {
      const id = Number(path.split("/").pop()), t = tasks.find(x => x.id === id);
      return r.fulfill({ json: { ...t, ...req.postDataJSON() } });
    }
    if (req.method() === "POST" && path === `/api/polls/${POLL.id}/vote`) return r.fulfill({ json: { ...POLL, myVoteOptionId: req.postDataJSON().optionId, sealed: false } });
    if (req.method() === "PATCH" && path.startsWith("/api/reimbursements/")) {
      const id = Number(path.split("/").pop());
      return r.fulfill({ json: { ...REIMB(selfId).find(x => x.id === id), ...req.postDataJSON() } });
    }
    if (req.method() !== "GET") return r.abort();
    // Retry a flaked GET here, so the page never sees the 500.
    const fetchOk = async () => { for (let i = 0; ; i++) { const res = await r.fetch(); if (res.status() < 500 || i === 5) return res; await new Promise(z => setTimeout(z, 800)); } };
    if (path === "/api/polls" && url.searchParams.get("assignee") === "me") return r.fulfill({ json: [POLL] });
    if (path === "/api/reimbursements" && !s.member) return r.fulfill({ json: REIMB(selfId) });
    if (path === "/api/tasks") { const res = await fetchOk(); tasks = await res.json(); return r.fulfill({ response: res, json: tasks }); }
    if (s.rail && path === "/api/auth/me") {
      const res = await fetchOk(); const j = await res.json();
      if (j.org) j.org.dashboardLayout = { main: ["week", "members"], rail: ["needs", "treasury", "activity"], hidden: [], numbers: null };
      return r.fulfill({ response: res, json: j });
    }
    const res = await fetchOk();
    return r.fulfill({ response: res });
  });
}

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  const member = await prisma.membership.findFirstOrThrow({
    where: { organizationId: org.id, isOrgAdmin: false, archivedAt: null, brother: { authUserId: { not: null }, roles: { none: { organizationId: org.id } } } },
    select: { brotherId: true },
  });
  await prisma.$disconnect();

  const open = (kind: string) => async (p: Page) => {
    await p.evaluate(k => {
      const it = [...document.querySelectorAll(".pl-it")].find(e => e.querySelector(".pl-tile use")?.getAttribute("href") === k);
      (it?.querySelector(".pl-r > .btn") as HTMLButtonElement | null)?.click();
    }, `#pp-${kind}`);
  };
  const scenes: Scene[] = [
    { name: "main", width: 1440 },
    { name: "main-vote", width: 1440, act: async p => { await open("chat")(p); await p.waitForTimeout(150); await p.evaluate(() => (document.querySelector(".pl-opt") as HTMLButtonElement).click()); } },
    { name: "main-reimb", width: 1440, act: open("receipt") },
    { name: "main-done", width: 1440, act: async p => {
      await open("box")(p); await p.waitForTimeout(900);
      await p.evaluate(() => (document.querySelector(".pl-done > button") as HTMLButtonElement)?.click());
    } },
    { name: "rail", width: 1440, rail: true },
    { name: "phone", width: 390 },
    { name: "member", width: 1440, member: true },
    { name: "member-rail", width: 1440, member: true, rail: true },
  ];

  const b = await chromium.launch();
  const errors: string[] = [];
  for (const s of scenes) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const who = s.member ? member.brotherId : admin.brotherId;
    const ctx = await b.newContext({ viewport: { width: s.width, height: 1000 } });
    await ctx.addCookies([
      { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(who), url: BASE },
      { name: "active_org_id", value: String(org.id), url: BASE },
    ]);
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push(`${s.name}: ${String(e).slice(0, 300)}`));
    await guard(p, s, who);
    await p.goto(`${BASE}/${SLUG}`, { waitUntil: "domcontentloaded" });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important} *{scroll-behavior:auto!important}" }).catch(() => {});
    // The shared DB's pool flakes /api/auth/me ("Unable to start a transaction"); reload and retry.
    for (let tries = 0; ; tries++) {
      const ok = await p.waitForSelector(".pl .pl-lanes, .pl .pl-clear, .pl .pl-hello", { timeout: 40000 }).then(() => true, () => false);
      if (ok) break;
      if (tries === 4) { await p.screenshot({ path: `${OUT}/${s.name}-FAIL.png` }); throw new Error(`${s.name}: plate never loaded`); }
      await p.reload({ waitUntil: "domcontentloaded" });
    }
    await p.waitForTimeout(1200);
    if (s.act) await s.act(p);
    await p.waitForTimeout(500);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) errors.push(`${s.name}: horizontal overflow ${overflow}px`);
    const card = p.locator("section.pl");
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `${OUT}/${s.name}.png` });
    console.log(s.name, "ok");
    await p.unrouteAll({ behavior: "ignoreErrors" });
    await ctx.close();
  }
  await b.close();
  console.log(errors.length ? errors.join("\n") : "no errors");
})();
