// Checks that Ask Chapt threads in localStorage are per person per org, that
// another person's thread is erased on mount, and that sign-out clears them.
// Read-only: the chat stream is stubbed, nothing is written to the DB.
// tsx --env-file=.env.local scripts/_chat-scope-shot.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
const BASE = "http://localhost:3000";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });

const frame = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
const STREAM = [
  frame("answer", { verdict: "SCOPE-CHECK answer.", rows: [], follows: [], sources: ["Roster"] }),
  frame("done", {}),
].join("");

let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok) failures++; };
const keys = (p: Page) => p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("chaptos_")).sort());

(async () => {
  // A belongs to two orgs; B shares A's first org.
  const multi = await prisma.membership.groupBy({ by: ["brotherId"], _count: { _all: true }, having: { brotherId: { _count: { gt: 1 } } } });
  if (!multi.length) throw new Error("no multi-org member in dev DB");
  const aId = multi[0].brotherId;
  const aOrgs = await prisma.membership.findMany({ where: { brotherId: aId }, select: { organization: { select: { id: true, slug: true } } }, take: 2 });
  const [o1, o2] = aOrgs.map(m => m.organization);
  const b = await prisma.membership.findFirstOrThrow({ where: { organizationId: o1.id, brotherId: { not: aId }, brother: { isGhost: false } }, select: { brotherId: true } });
  const bId = b.brotherId;
  await prisma.$disconnect();
  console.log(`A=${aId} in ${o1.slug},${o2.slug}; B=${bId} in ${o1.slug}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const as = (id: number, orgId: number) => ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(id), url: BASE },
    { name: "active_org_id", value: String(orgId), url: BASE },
  ]);
  const p = await ctx.newPage();
  await p.route("**/api/ai/chat", r => r.request().method() === "GET"
    ? r.fulfill({ json: { enabled: true } })
    : r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: STREAM }));
  const open = async (slug: string) => {
    await p.goto(`${BASE}/${slug}`, { waitUntil: "domcontentloaded" });
    await p.addStyleTag({ content: "nextjs-portal,.ui-modal{display:none!important}" }).catch(() => {});
    try { await p.waitForSelector(".chat-launcher", { timeout: 60000 }); }
    catch (e) { await p.screenshot({ path: "_screenshots/chat-scope-fail.png" }); console.log("url", p.url()); throw e; }
    await p.waitForTimeout(1200);
  };
  const ask = async () => {
    await p.click(".chat-launcher");
    await p.waitForSelector(".cs-dock textarea");
    await p.fill(".cs-dock textarea", "Who still owes dues?");
    await p.keyboard.press("Enter");
    await p.waitForFunction(() => document.body.innerText.includes("SCOPE-CHECK"), null, { timeout: 20000 });
    await p.waitForTimeout(500);
    await p.keyboard.press("Escape");
  };
  const shows = async () => {
    await p.click(".chat-launcher");
    await p.waitForSelector(".cs-dock textarea");
    await p.waitForTimeout(600);
    const has = await p.evaluate(() => document.body.innerText.includes("SCOPE-CHECK"));
    await p.keyboard.press("Escape");
    return has;
  };
  const aKey1 = `chaptos_chat_v3:${aId}:${o1.slug}`;
  const aKey2 = `chaptos_chat_v3:${aId}:${o2.slug}`;
  const bKey1 = `chaptos_chat_v3:${bId}:${o1.slug}`;

  // 1. Leftovers from before the fix, and from someone else, go on mount.
  await as(aId, o1.id);
  await open(o1.slug);
  await p.evaluate(() => {
    localStorage.setItem("chaptos_chat_v2", "[{\"role\":\"user\",\"content\":\"old\"}]");
    localStorage.setItem("chaptos_chat_v3:999999:other", "[{\"role\":\"user\",\"content\":\"theirs\"}]");
  });
  await open(o1.slug);
  let k = await keys(p);
  check(!k.includes("chaptos_chat_v2"), "unscoped v2 thread erased on mount");
  check(!k.includes("chaptos_chat_v3:999999:other"), "another person's thread erased on mount");

  // 2. A's thread lands under A+org1 and survives a reload.
  await ask();
  k = await keys(p);
  check(k.includes(aKey1), `thread stored under ${aKey1}`);
  await open(o1.slug);
  check(await shows(), "A's thread survives a reload");

  // 3. Same person, other org: empty thread, org1's kept.
  await as(aId, o2.id);
  await open(o2.slug);
  check(!(await shows()), `A sees no ${o1.slug} thread in ${o2.slug}`);
  await ask();
  k = await keys(p);
  check(k.includes(aKey1) && k.includes(aKey2), "A keeps one thread per org");

  // 4. Different person on the same browser: A's threads are gone.
  await as(bId, o1.id);
  await open(o1.slug);
  check(!(await shows()), "B does not see A's thread");
  k = await keys(p);
  check(!k.some(x => x.startsWith(`chaptos_chat_v3:${aId}:`)), "A's threads erased when B mounts");

  // 5. Sign-out clears every thread, digest and last-org key.
  await ask();
  await p.evaluate(() => {
    localStorage.setItem("chaptos_digest_narration:test", "Marcus is at risk");
    localStorage.setItem("chaptos_last_org", "x");
  });
  check((await keys(p)).includes(bKey1), `B's thread stored under ${bKey1}`);
  await p.click(".sb-me");
  await p.getByRole("menuitem", { name: "Sign out" }).click();
  await p.waitForURL(/\/login/, { timeout: 30000 });
  k = await keys(p);
  check(!k.some(x => x.startsWith("chaptos_chat_v") || x.startsWith("chaptos_digest_narration:") || x === "chaptos_last_org"),
    `sign-out leaves no personal keys (left: ${k.join(", ") || "none"})`);

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
})();
