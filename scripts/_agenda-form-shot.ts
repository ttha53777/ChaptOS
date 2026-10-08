// Read-only: Add meeting's Agenda row. Templates are stubbed, and POST
// /api/calendar is intercepted (never reaches the server — the dev DB is prod)
// so we can check what the form sends.
// THEME=ivory AES=paper W=1440 OUT=… tsx --env-file=.env.local scripts/_agenda-form-shot.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/agenda-form";
const THEME = process.env.THEME ?? "ivory";
const AES = process.env.AES ?? "paper";
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);

const t = (id: number, name: string, isDefault: boolean, description: string, body: string) =>
  ({ id, name, description, category: "meetings", body, isDefault, uses: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: null });
const TEMPLATES = [
  t(901, "Weekly chapter meeting", true, "The standing agenda, from roll call to adjournment.", "## Roll call\n{{meeting_date}} · {{meeting_time}} · {{location}}\n\n## Officer reports\n\n## New business\n\n## Action items\n[ ] Task — owner — due date"),
  t(902, "Executive board check-in", false, "A little structure for the decisions that move us forward.", "## Opening\n{{meeting_title}} · {{meeting_date}}\n\n## Decisions to make\n\n## Before we meet again\n[ ] Action — owner — due date"),
];

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
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
  await ctx.addInitScript(([aes, theme]) => {
    try { localStorage.setItem("chaptos:aesthetic:v1", aes); localStorage.setItem("chaptos:theme:v1", theme); } catch {}
  }, [AES, THEME]);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", e => errors.push(String(e)));
  await p.route("**/api/calendar/agenda-templates**", r => r.fulfill({ json: TEMPLATES }));
  let sent: Record<string, unknown> | null = null;
  // Every write to the API is answered here or refused — none reaches the shared DB.
  await p.route(u => u.pathname.startsWith("/api/"), async r => {
    const method = r.request().method();
    if (method === "GET" || method === "HEAD") return r.continue();
    if (new URL(r.request().url()).pathname !== "/api/calendar" || method !== "POST") return r.abort();
    sent = r.request().postDataJSON();
    // Never forwarded. Answer like the server would for a templated meeting.
    return r.fulfill({ status: 201, json: { id: 999999, ...sent, time: "7:00 PM", description: "## Opening\n(stub)", notesSeed: "## Opening\n(stub)", agendaTemplateId: sent?.agendaTemplateId ?? null, notesContentRevision: 0 } });
  });
  const shot = async (name: string) => { await p.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot", name); };

  await p.goto(`${BASE}/${SLUG}/chapter?add=1&template=902`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await p.waitForSelector("#meeting-agenda", { timeout: 90000 });
  await p.waitForTimeout(800);
  const read = () => p.evaluate(() => ({
    title: (document.querySelector("#meeting-title") as HTMLInputElement).value,
    agenda: (document.querySelector("#meeting-agenda") as HTMLSelectElement).selectedOptions[0]?.textContent,
    url: location.search,
  }));
  console.log("opened from template link:", JSON.stringify(await read()));
  await shot("01-from-template-link");

  await p.selectOption("#meeting-agenda", "");
  console.log("after Blank:", JSON.stringify(await read()));
  await shot("02-blank");

  await p.selectOption("#meeting-agenda", "901");
  await p.fill("#meeting-title", "Week 6 chapter");
  await p.selectOption("#meeting-agenda", "902");
  console.log("typed title then switched:", JSON.stringify(await read()));

  await p.waitForFunction(() => !document.body.innerText.includes("Loading time zone"), null, { timeout: 30000 }).catch(() => console.log("zone never loaded"));
  await p.locator(".cef-foot button[type=submit]").click();
  await p.waitForTimeout(1200);
  console.log("POST body agendaTemplateId:", sent ? (sent as Record<string, unknown>).agendaTemplateId : "NOT SENT", "description:", JSON.stringify(sent && (sent as Record<string, unknown>).description));
  await shot("03-after-add");
  console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no page errors");
  await b.close();
})();
