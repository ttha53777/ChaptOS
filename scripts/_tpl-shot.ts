// Read-only screenshots of /[slug]/chapter/templates. The templates API is
// stubbed with the mock's four agendas (writes answer from memory), because the
// dev DB is prod. STUB=0 hits the real GET instead (still no writes).
// THEME=dusk|ivory AES=paper|ledger W=1440 EMPTY=1 OUT=… tsx --env-file=.env.local scripts/_tpl-shot.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/templates";
const THEME = process.env.THEME ?? "ivory";
const AES = process.env.AES ?? "paper";
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);
const STUB = process.env.STUB !== "0";
const EMPTY = process.env.EMPTY === "1";

const by = { id: 1, name: "Jamie Sullivan" };
const at = (d: string) => new Date(`2026-${d}T15:00:00Z`).toISOString();
const FIXTURES = [
  { id: 901, name: "Weekly chapter meeting", description: "The standing agenda, from roll call to adjournment.", category: "meetings", isDefault: true, uses: 14, createdAt: at("09-01"), updatedAt: at("10-05"), updatedBy: by,
    body: "## Roll call\nDate: {{meeting_date}} · {{meeting_time}} · Location: {{location}}\nPresent / Absent / Excused:\n\n## Officer reports\nPresident · Treasurer · Secretary · Committee chairs\n\n## Old business\nReview action items from the previous meeting.\n\n## New business\nDiscussion items, motions, and votes.\n\n## Action items\n[ ] Task — owner — due date\n\n## Adjournment\nNext meeting / time adjourned:" },
  { id: 902, name: "Executive board check-in", description: "A little structure for the decisions that move us forward.", category: "leadership", isDefault: false, uses: 6, createdAt: at("09-02"), updatedAt: at("10-02"), updatedBy: { id: 2, name: "Marcus Reyes" },
    body: "## Opening\n{{meeting_title}} · {{meeting_date}}\n\n## Officer updates\nWins, blockers, and support needed.\n\n## Decisions to make\nProposal / discussion / decision\n\n## Budget & priorities\n• Upcoming spending\n• Chapter priorities\n\n## Before we meet again\n[ ] Action — owner — due date" },
  { id: 903, name: "Committee working session", description: "Keep projects, people, and next steps on the same page.", category: "committees", isDefault: false, uses: 3, createdAt: at("09-03"), updatedAt: at("09-28"), updatedBy: null,
    body: "## Session details\n{{meeting_title}} · {{meeting_date}}\nLocation: {{location}}\n\n## What we’re working toward\nGoal for this session:\n\n## Project updates\nProgress / blockers / help needed\n\n## Working notes\nIdeas and decisions:\n\n## Next steps\n[ ] Task — owner — due date" },
  { id: 904, name: "Chapter town hall", description: "Space for open questions and a clear record of answers.", category: "meetings", isDefault: false, uses: 0, createdAt: at("09-04"), updatedAt: at("09-24"), updatedBy: by,
    body: "## Welcome\n{{meeting_title}} · {{meeting_date}}\n\n## Chapter updates\nAnnouncements and upcoming dates.\n\n## Open floor\nQuestion / discussion / response\n\n## Follow-ups\n[ ] Question to follow up — owner\n\n## Closing\nWhat we heard and what happens next." },
];

async function stub(p: Page) {
  let rows = EMPTY ? [] : structuredClone(FIXTURES);
  const archived = new Map<number, (typeof FIXTURES)[number]>();
  await p.route("**/api/calendar/agenda-templates**", async route => {
    const req = route.request();
    const id = Number(new URL(req.url()).pathname.split("/").pop());
    if (req.method() === "GET") return route.fulfill({ json: rows });
    const body = req.postDataJSON?.() ?? {};
    if (req.method() === "POST") {
      const row = { id: 950 + rows.length, uses: 0, isDefault: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: by, description: "", ...body };
      rows = [row, ...rows];
      return route.fulfill({ status: 201, json: row });
    }
    if (req.method() === "DELETE") { const i = rows.findIndex(r => r.id === id); const was = rows[i]; rows.splice(i, 1); archived.set(id, { ...was, isDefault: false }); return route.fulfill({ json: { id, wasDefault: !!was?.isDefault } }); }
    if (body.archived === false && archived.has(id)) { rows.push(archived.get(id)!); archived.delete(id); }
    const i = rows.findIndex(r => r.id === id);
    if (body.isDefault) rows.forEach(r => { r.isDefault = false; });
    const { expectedUpdatedAt: _e, archived: _a, ...patch } = body;
    rows[i] = { ...rows[i], ...patch, updatedAt: new Date().toISOString() };
    return route.fulfill({ json: rows[i] });
  });
}

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
  p.on("console", msg => { if (msg.type() === "error") errors.push(msg.text().slice(0, 200)); });
  if (STUB) await stub(p);
  else p.on("response", r => { if (r.url().includes("agenda-templates")) console.log("real GET", r.status()); });
  await p.goto(`${BASE}/${SLUG}/chapter/templates`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important} *{scroll-behavior:auto!important}" }).catch(() => {});
  await p.waitForSelector(".at-shelf, .at-error, .at-desk-empty", { timeout: 90000 });
  await p.waitForTimeout(1500);
  const shot = async (name: string, full = false) => { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log("shot", name); };
  const scrollTo = (sel: string) => p.evaluate(s => document.querySelector(s)?.scrollIntoView({ block: "start" }), sel);

  await shot("01-library");
  // Horizontal overflow check: nothing may be wider than the viewport.
  const over = await p.evaluate(() => [...document.querySelectorAll(".dash-templates *")].filter(el => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest(".at-shelf")).map(el => el.className).slice(0, 5));
  if (over.length) console.log("OVERFLOW", over);
  if (!EMPTY) {
    await scrollTo(".at-desk"); await p.waitForTimeout(300); await shot("02-desk");
    await p.getByRole("button", { name: /^Filled for/ }).click(); await p.waitForTimeout(300); await shot("03-filled");
    await p.locator(".at-sheet", { hasText: "Executive board" }).click(); await p.waitForTimeout(400); await scrollTo(".at-desk"); await shot("04-select-exec");
    await p.getByRole("button", { name: "Make default" }).click(); await p.waitForTimeout(600); await shot("05-made-default");
    await p.getByRole("button", { name: "Edit" }).click(); await p.waitForSelector(".at-pad-text"); await p.waitForTimeout(400); await shot("06-editor");
    await p.locator(".at-pad-text").press("End");
    await p.locator(".at-pad-text").fill(`${FIXTURES[1].body}\n{{room}}`); await p.waitForTimeout(300);
    await p.getByRole("tab", { name: "Preview" }).click(); await p.waitForTimeout(300); await shot("07-preview-bad-field");
    await p.keyboard.press(process.platform === "darwin" ? "Meta+s" : "Control+s"); await p.waitForTimeout(500); await shot("08-save-blocked");
    await p.getByRole("button", { name: "Cancel" }).first().click(); await p.waitForTimeout(400); await shot("09-discard-confirm");
    await p.getByRole("button", { name: "Discard" }).click(); await p.waitForTimeout(400);
    await p.getByRole("button", { name: "Delete" }).click(); await p.waitForTimeout(300); await shot("10-delete-confirm");
    await p.getByRole("button", { name: "Delete", exact: true }).last().click(); await p.waitForTimeout(600); await shot("11-deleted-toast");
    await p.getByRole("button", { name: "Undo" }).click(); await p.waitForTimeout(700); await shot("12-undone");
  } else {
    await p.locator(".at-sheet.starter").first().click(); await p.waitForSelector(".at-pad-text"); await p.waitForTimeout(400); await shot("02-starter-editor");
  }
  console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no page errors");
  await b.close();
})();
