// Read-only screenshots of the "door" screens (paper-doors.css) in a given look.
// URLS="login=/login,join=/join/nope" AUTH=0 OUT=… tsx --env-file=.env.local scripts/_doors-shot.ts
// AUTH=1 signs in as an admin of ORG (default lpe). SEM=first|expired stubs GET /api/semesters so the
// SemesterGate shows without touching the DB; every other semesters call is refused.
// URL "wall" is replaced by an org slug the admin doesn't belong to (NeedsInvite).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
const BASE = "http://localhost:3000";
const OUT = process.env.OUT ?? "_screenshots/doors";
const THEME = process.env.THEME ?? "ivory";
const AES = process.env.AES ?? "paper";
const W = Number(process.env.W ?? 1440), H = Number(process.env.H ?? 900);
const AUTH = process.env.AUTH === "1";
const SEM = process.env.SEM ?? "";
const URLS = (process.env.URLS ?? "").split(",").filter(Boolean).map(s => s.split("="));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
(async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: process.env.ORG ?? "lpe" }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  const other = await prisma.organization.findFirst({ where: { memberships: { none: { brotherId: m.brotherId } } }, select: { slug: true } });
  await prisma.$disconnect();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  if (AUTH) await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  await ctx.addInitScript(([aes, theme]) => {
    try { localStorage.setItem("chaptos:aesthetic:v1", aes); localStorage.setItem("chaptos:theme:v1", theme); } catch {}
  }, [AES, THEME]);
  const p = await ctx.newPage();
  if (SEM) await p.route("**/api/semesters**", r => {
    if (r.request().method() !== "GET") return r.fulfill({ status: 503, json: { error: "stubbed — read-only shot" } });
    return r.fulfill({ json: SEM === "first" ? [] : [{ id: 1, label: "Spring 2026", startDate: "2026-01-12", endDate: "2026-05-10", isActive: true }] });
  });
  for (const [name, raw] of URLS) {
    const path = raw === "wall" ? `/${other?.slug}` : raw;
    await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    const wait = process.env.WAIT ?? (SEM ? ".sg" : ".auth-col");
    try { await p.waitForSelector(wait, { timeout: 90000 }); } catch { console.log("no", wait, "at", p.url()); }
    await p.waitForTimeout(1800);
    if (process.env.CLICK) { await p.locator(process.env.CLICK).first().click().catch(e => console.log("click fail", String(e).slice(0, 120))); await p.waitForTimeout(700); }
    await p.screenshot({ path: `${OUT}/${name}.png` });
    console.log("shot", name, p.url());
  }
  await b.close();
})();
