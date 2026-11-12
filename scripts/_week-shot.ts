// Read-only check for the Ask Chapt week answer (chat/shapes/Week.tsx): feeds
// three synthetic weeks (full / light / clear), dated around today, through a
// stubbed /api/ai/chat stream into the real widget, and screenshots each. Also
// runs the real weekOf() once against dev data to prove the reads work.
// No LLM call, no writes. tsx --env-file=.env.local scripts/_week-shot.ts
// (THEME=ivory|dusk W=1280|390 OUT=… WEEK=2026-05-25 BASE=http://localhost:3100)
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
import { db } from "../lib/db";
import { weekOf } from "../lib/ai-shapes";
import { isoWeekBounds } from "../lib/dates";
import type { WeekItem, WeekShape } from "../lib/api-types";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/week";
const THEME = process.env.THEME ?? "ivory";
const W = Number(process.env.W ?? 1280);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
const frame = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;

(async () => {
  mkdirSync(OUT, { recursive: true });
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const admin = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id, isOrgAdmin: true }, select: { brotherId: true } });
  await prisma.$disconnect();

  const real = await weekOf(process.env.WEEK ?? "2026-05-25", db(org.id), { actorId: admin.brotherId });
  const rs = real.shape as WeekShape;
  console.log("real week:", rs.items.map(i => `${i.date} ${i.title} [${i.place ?? "-"}${i.mandatory ? " M" : ""}${i.mine ? " mine" : ""}${i.attended != null ? ` att=${i.attended}` : ""}]`), "after:", rs.after?.title, rs.after?.date);

  const start = isoWeekBounds(new Date()).start;
  const day = (n: number) => { const [y, m, d] = start.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const todayIdx = (new Date().getDay() + 6) % 7;
  const cat = (slug: string, label: string) => ({ slug, label, color: null, colorDark: null });
  let id = 900000;
  const ev = (n: number, time: string | null, title: string, c: [string, string], x: Partial<WeekItem> = {}): WeekItem =>
    ({ ref: { type: "event", id: id++ }, kind: "event", date: day(n), time, title, cat: cat(...c), place: null, mandatory: false, mine: false, attended: null, ...x });
  const due = (n: number, title: string, mine = false): WeekItem =>
    ({ ref: { type: "task", id: id++ }, kind: "deadline", date: day(n), time: null, title, cat: null, place: null, mandatory: false, mine, attended: null });
  const t = todayIdx;
  const full: WeekItem[] = [
    ev(Math.max(0, t - 2), "7:00 PM", "Chapter meeting", ["chapter", "Chapter"], { place: "Chapter room", mandatory: true, attended: true }),
    due(t, "Send formal venue deposit", true),
    ev(t, "11:30 PM", "Exec meeting", ["chapter", "Chapter"], { place: "Library, 2nd floor" }),
    ev(Math.min(6, t + 1), "7:00 PM", "Info night with a title long enough to wrap on a phone", ["program", "Programming"], { place: "Union 204" }),
    due(Math.min(6, t + 1), "Formal RSVPs close"),
    ev(Math.min(6, t + 2), "9:00 PM", "Mixer w/ ΑΦ", ["party", "Party"], { place: "Chapter house" }),
    ev(Math.min(6, t + 2), "8:00 AM", "Philanthropy 5K", ["service", "Service"], { place: "Lakeshore path", mandatory: true }),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const after = ev(7, "7:00 PM", "Chapter meeting", ["chapter", "Chapter"], { place: "Chapter room", mandatory: true });
  const answer = (verdict: string, items: WeekItem[], withAfter: boolean) => frame("step", { id: "0", verb: "Scanning the calendar", source: "Events" }) + frame("step_start", { id: "0" }) + frame("step_done", { id: "0", finding: "this week" }) +
    frame("answer", {
      verdict, follows: [{ label: "What about next week?", ask: "What about next week?" }], sources: ["Timeline", "Tasks"],
      rows: items.map(it => ({ kind: it.kind === "deadline" ? "task" : "event", title: it.title, ref: it.ref })),
      shape: { type: "week", start, items, after: withAfter ? after : null } satisfies WeekShape,
    });
  const STREAMS: Record<string, string> = {
    full: answer("*Six things* left this week.", full, false),
    light: answer("A light one. Just *Exec meeting tonight*.", [full[2]], true),
    clear: answer("*Nothing* on this week.", [], true),
  };

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: W < 600 ? 844 : 1000 }, deviceScaleFactor: W < 600 ? 2 : 1, hasTouch: W < 600, isMobile: W < 600 });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(admin.brotherId), url: BASE },
    { name: "active_org_id", value: String(org.id), url: BASE },
  ]);
  await ctx.addInitScript(theme => {
    try { localStorage.setItem("chaptos:theme:v1", theme); localStorage.removeItem("chaptos_chat_v2"); } catch {}
  }, THEME);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", e => { errors.push(String(e)); console.log("PAGEERROR", String(e).slice(0, 400)); });
  p.on("console", m => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300)); });
  await p.route("**/api/auth/me", async r => {
    const res = await r.fetch();
    const j = await res.json() as { terms?: { version: string; acceptedVersion: string | null } };
    if (j.terms) j.terms.acceptedVersion = j.terms.version;
    return r.fulfill({ response: res, json: j });
  });
  await p.route("**/api/ai/chat", r => {
    if (r.request().method() === "GET") return r.fulfill({ json: { enabled: true } });
    const body = JSON.parse(r.request().postData() ?? "{}") as { messages?: Array<{ content: string }> };
    const q = (body.messages?.at(-1)?.content ?? "").toLowerCase();
    const key = Object.keys(STREAMS).find(k => q.startsWith(k)) ?? "full";
    return r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: frame("open", {}) + STREAMS[key] + frame("done", {}) });
  });
  await p.goto(`${BASE}/org/${SLUG}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await p.waitForSelector(".chat-launcher", { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.click(".chat-launcher");
  await p.waitForSelector(".cs-spot");

  // Short answers first, as plain viewport shots; the long one last, unclipped.
  const ORDER = ["light", "clear", "full"];
  for (const k of ORDER) {
    await p.fill(".cs-dock textarea", `${k} week: what do I have this week?`);
    await p.keyboard.press("Enter");
    await p.waitForFunction(n => document.querySelectorAll(".shp-wk").length === n, ORDER.indexOf(k) + 1, { timeout: 20000 }).catch(() => console.log("MISSING", k));
    await p.waitForTimeout(2000);
    const sheet = p.locator(".shp-wk").last();
    await sheet.scrollIntoViewIfNeeded();
    console.log(k, "sheet overflow:", await sheet.evaluate(el => el.scrollWidth - el.clientWidth), "strip cells:", await sheet.locator(".wkp-d").count());
    if (k !== "full") {
      await sheet.evaluate(el => el.closest(".answer, .msg")?.scrollIntoView({ block: "start" }));
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${OUT}/${k}-${THEME}-${W}.png` });
      continue;
    }
    // The spotlight scrolls; grow it so one shot holds the whole answer.
    await p.addStyleTag({ content: ".cs-spot{max-height:none!important;height:auto!important} .cs-overlay{position:absolute!important;height:auto!important;min-height:100%;align-items:flex-start!important} .cs-body{overflow:visible!important;max-height:none!important}" });
    await p.waitForTimeout(200);
    await sheet.screenshot({ path: `${OUT}/${k}-${THEME}-${W}.png` });
  }
  await p.locator(".shp-wk").last().locator(".wkp-d").nth(Math.min(6, todayIdx + 1)).dispatchEvent("click");
  console.log("picked:", await p.locator(".shp-wk").last().locator(".wkp-d.on").count(), "flash:", await p.locator(".wkp-day.flash").count());
  console.log("page overflow:", await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), "errors", errors);
  await b.close();
  process.exit(0);
})();
