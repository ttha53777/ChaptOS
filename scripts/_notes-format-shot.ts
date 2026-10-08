// Read-only: how agenda/minutes text renders — the Templates desk, the shared
// minutes editor (CodeMirror) and the read-only minutes — using the real
// "##Prez:" style a chapter typed. Every API write is aborted; the chapter list,
// templates and the notes session are stubbed (the dev DB is prod).
// THEME=ivory AES=paper OUT=… tsx --env-file=.env.local scripts/_notes-format-shot.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
import { seedNotes } from "../lib/collaboration/notes-document";

const BASE = "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/notes-format";
const THEME = process.env.THEME ?? "ivory";
const AES = process.env.AES ?? "paper";

const AGENDA = "##Prez:\n\n\n##VPI:\n\n\n##VPE:\n\n\n##Secretary:\n\n\n##Treasurer:\n\n\n##Rush Chairs:\n";
const NOTES = "##Prez:\n- Retreat is **Oct 24**, sign up by Friday\n[x] Book the lodge\n\n##VPI:\n[ ] Dev to send the budget by Oct 10\n\n##VPE:\n\n\n##Secretary:\nMinutes from last week approved.\n\n##Treasurer:\n* Dues: 41 of 52 paid\n\n##Rush Chairs:\n";
const ID = 999001;

const meeting = (shared: boolean) => ({
  id: ID, organizationId: 0, title: "10/19 Meeting", date: "2026-10-05", time: "7:00 PM", schedule: null, category: "chapter", mandatory: true,
  location: "Chapter Room", description: NOTES, notesSeed: AGENDA, agendaTemplateId: 1, notesSummary: null, notesSummaryData: null,
  notesSummaryAt: null, notesUpdatedAt: new Date().toISOString(), notesDocSeq: 1, notesContentRevision: 2, notesSummaryRevision: null,
  notesProtocolVersion: 1, owner: "", status: "Upcoming", notesInitialized: true, notesCollaborationEnabled: shared, programmingEventId: null, partyEventId: null,
});

async function stub(p: Page, shared: boolean) {
  await p.route(u => u.pathname.startsWith("/api/"), async r => {
    const req = r.request(), url = new URL(req.url()), path = url.pathname;
    if (path === "/api/calendar" && req.method() === "GET" && url.searchParams.get("category") === "chapter") return r.fulfill({ json: [meeting(shared)] });
    if (path === `/api/calendar/${ID}/notes/session`) {
      return r.fulfill({ json: {
        notesInitialized: true, id: ID, organizationId: 0, notesDoc: Buffer.from(seedNotes(NOTES)).toString("base64"), notesDocSeq: 1,
        notesContentRevision: 2, notesSummaryRevision: null, notesProtocolVersion: 1, notesUpdatedAt: null, description: NOTES,
        topic: "stub", realtime: false, actor: { id: 1, authUserId: "stub", name: "Stub" },
      } });
    }
    if (path.startsWith(`/api/calendar/${ID}`)) return r.fulfill({ json: { unchanged: true, notesDocSeq: 1 } });
    if (path === "/api/calendar/agenda-templates") {
      return r.fulfill({ json: [{ id: 1, name: "CHAPTER MEETING", description: "", category: "meetings", body: AGENDA, isDefault: true, uses: 1,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: null }] });
    }
    if (req.method() === "GET" || req.method() === "HEAD") return r.continue();
    return r.abort();
  });
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
(async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();
  const b = await chromium.launch();
  const errors: string[] = [];
  for (const [name, path, shared] of [["templates", "/chapter/templates", true], ["editor", "/chapter", true], ["readonly", "/chapter", false]] as const) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([
      { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(m.brotherId), url: BASE },
      { name: "active_org_id", value: String(org.id), url: BASE },
    ]);
    await ctx.addInitScript(([aes, theme]) => {
      try { localStorage.setItem("chaptos:aesthetic:v1", aes); localStorage.setItem("chaptos:theme:v1", theme); } catch {}
    }, [AES, THEME]);
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push(`${name}: ${String(e).slice(0, 200)}`));
    await stub(p, shared);
    await p.goto(`${BASE}/${SLUG}${path}`, { waitUntil: "domcontentloaded" });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    if (name === "templates") {
      await p.waitForSelector(".at-desk", { timeout: 90000 });
      await p.evaluate(() => document.querySelector(".at-desk")?.scrollIntoView({ block: "start" }));
    } else {
      await p.waitForSelector(".led-row", { timeout: 90000 });
      await p.locator(".led-row").first().click();
      await p.waitForSelector(name === "editor" ? ".cm-content" : ".mt-pad-read", { timeout: 30000 });
    }
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}/${name}.png` });
    console.log("shot", name);
    await ctx.close();
  }
  console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no page errors");
  await b.close();
})();
