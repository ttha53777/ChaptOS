// Read-only: the dashboard "Up next" card. The dev DB is prod, so the calendar
// and the live check-in are answered here, and every non-GET /api call is
// aborted before it reaches the server.
// tsx --env-file=.env.local scripts/_upnext-shot.ts   (BASE=… SLUG=… OUT=… ONLY=a,b)
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium, type Page, type Route } from "playwright";
import { mkdirSync } from "node:fs";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "lpe";
const OUT = process.env.OUT ?? "_screenshots/upnext";
const ONLY = process.env.ONLY?.split(",");
mkdirSync(OUT, { recursive: true });

const pad = (n: number) => String(n).padStart(2, "0");
const day = (d: number) => { const t = new Date(Date.now() + d * 86400e3); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
/** A timed schedule starting `mins` from now, `len` minutes long. */
const inMins = (mins: number, len = 90) => {
  const s = new Date(Date.now() + mins * 60e3), e = new Date(s.getTime() + len * 60e3);
  return { kind: "timed", start: s.toISOString(), end: e.toISOString(), timeZone: zone };
};

const ev = (id: number, over: Record<string, unknown>) => ({
  id, title: `Event ${id}`, date: day(1), time: null, schedule: null, category: "chapter", mandatory: false, location: null,
  description: null, notesSeed: null, details: [], partyEventId: null, programmingEventId: null, notesInitialized: false, ...over,
});

const AGENDA = "## Roll call & last week's minutes\n\n## Treasurer: dues standing\n\n## Homecoming float sign-ups\n\n## Formal venue vote\n\n## New business";
const LATER = [
  ev(9102, { title: "Formal planning", date: day(6), time: "6:00 PM", category: "social", location: "Chapter room" }),
  ev(9103, { title: "Chapter meeting", date: day(9), time: "7:00 PM", category: "chapter" }),
  ev(9104, { title: "Rush info night", date: day(11), time: "8:00 PM", category: "program" }),
];
const PAST = ev(9100, { title: "Chapter meeting", date: day(-6), time: "7:00 PM" });

const CHAPTER = ev(9101, {
  title: "Chapter meeting", date: day(2), time: "7:00 PM", category: "chapter", mandatory: true, location: "Sigma Hall 204", notesSeed: AGENDA,
  details: [{ id: "d", type: "dress", pick: "Business casual", note: "" }, { id: "g", type: "guests", mode: "members", plus: 1 }],
});
const PARTY = ev(9101, {
  title: "Haunted House Halloween Social", date: day(3), time: "9:00 PM", category: "party", location: "The Lodge, 412 Elm St",
  details: [
    { id: "d", type: "dress", pick: "Theme", note: "Haunted" }, { id: "g", type: "guests", mode: "plus", plus: 1 },
    { id: "k", type: "capacity", cap: 120 },
    { id: "s", type: "supplies", items: [{ id: "a", item: "Cups", who: null }, { id: "b", item: "Ice", who: null }, { id: "c", item: "Lights", who: null }, { id: "e", item: "Speaker", who: 1 }] },
  ],
});
const BARE = ev(9101, { title: "Study hours", date: day(2), time: "6:00 PM", category: "social", location: "Main Library, 3rd floor" });
// Later today, but never past midnight (that would be tomorrow's date).
const toMidnight = (new Date(new Date().setHours(24, 0, 0, 0)).getTime() - Date.now()) / 60e3;
const TODAY = ev(9101, { ...CHAPTER, date: day(0), time: null, schedule: inMins(Math.max(5, Math.min(220, Math.floor(toMidnight) - 100)), 60) });
const FAR = ev(9101, { ...CHAPTER, date: day(15) });

const live = (over: Record<string, unknown> = {}) => ({
  event: { id: TODAY.id, title: TODAY.title, date: TODAY.date, time: null, schedule: TODAY.schedule, location: TODAY.location, mandatory: true },
  state: "open", openedAt: new Date(Date.now() - 4 * 60e3).toISOString(), closedAt: null, closedByName: null, msRemaining: 20 * 60e3,
  presentCount: 23, eligibleCount: 52, me: { checkedIn: false, checkedInAt: null, excuse: null }, ...over,
});
const LIVE = live();
/** What the server answers a fresh open with. */
const OPENED = () => live({ openedAt: new Date().toISOString(), presentCount: 0 });

type Scene = {
  name: string; width: number; events: unknown[]; rail?: boolean; live?: boolean | "closed"; member?: boolean; theme?: "ivory" | "dusk"; slowCalendar?: boolean;
  /** Tap Open check-in on the ticket; the stubbed server says yes ("ok") or 500s ("fail"). */
  open?: "ok" | "fail";
  reduce?: boolean;
  /** Screenshot the live band rather than the card. */
  band?: boolean;
};

async function guard(p: Page, s: Scene) {
  let opened = false;
  await p.route(u => u.pathname.startsWith("/api/"), async (r: Route) => {
    const req = r.request(), path = new URL(req.url()).pathname;
    if (req.method() === "POST" && path === `/api/attendance/${TODAY.id}/window` && s.open) {
      if (s.open === "fail") return r.fulfill({ status: 500, json: { error: "stubbed failure" } });
      opened = true;
      await new Promise(z => setTimeout(z, 300));
      return r.fulfill({ json: OPENED() });
    }
    // the activity line opening check-in logs: answered here, never written
    if (req.method() === "POST" && path === "/api/activity") return r.fulfill({ json: { id: 0, ...req.postDataJSON(), createdAt: new Date().toISOString() } });
    if (req.method() !== "GET") return r.abort();
    const fetchOk = async () => { for (let i = 0; ; i++) { const res = await r.fetch({ timeout: 60000 }).catch(() => null); if (res && (res.status() < 500 || i === 5)) return res; if (!res && i === 5) throw new Error("fetch kept failing"); await new Promise(z => setTimeout(z, 800)); } };
    if (path === "/api/calendar") {
      if (s.slowCalendar) await new Promise(z => setTimeout(z, 25000));
      return r.fulfill({ json: s.events });
    }
    if (path === "/api/attendance/live") {
      return r.fulfill({ json: opened ? OPENED() : s.live === "closed" ? live({ state: "closed", closedAt: new Date().toISOString(), closedByName: "Maya Patel", msRemaining: 0 }) : s.live ? LIVE : null });
    }
    if (path === "/api/auth/me") {
      const res = await fetchOk(); const j = await res.json();
      if (j.org) j.org.dashboardLayout = s.rail
        ? { top: [], main: ["needs", "week"], rail: ["next", "activity"], hidden: [], numbers: null }
        : { top: [], main: ["next", "needs", "week"], rail: ["activity", "docs"], hidden: [], numbers: null };
      return r.fulfill({ response: res, json: j });
    }
    return r.fulfill({ response: await fetchOk() });
  });
}

/**
 * Tap Open check-in and watch: frames of the flight, frame pacing, then where
 * everything ended up. "ok" must land a band and move Up next on; "fail" must
 * roll back with nothing left behind; reduced motion must skip the flight.
 */
async function fly(p: Page, s: Scene, errors: string[]) {
  const btn = p.locator("section.un .un-cd .un-btn");
  if (!(await btn.count())) { errors.push(`${s.name}: no Open check-in button`); return; }
  await btn.scrollIntoViewIfNeeded();
  // the band lands near the top: start from a scroll where both are on screen
  await p.evaluate(() => { const t = document.querySelector("section.un")!.getBoundingClientRect().top; window.scrollBy(0, Math.max(0, t - 560)); });
  await p.waitForTimeout(300);
  // A string, not a function: tsx wraps named inner functions in a __name
  // helper that doesn't exist in the page.
  await p.evaluate(`(() => {
    window.__frames = []; window.__flying = 0; window.__fl = [];
    const t0 = performance.now();
    document.addEventListener("click", () => { window.__click = performance.now(); }, { capture: true, once: true });
    const tick = t => { window.__frames.push(t); const f = !!document.querySelector(".un-flying"); window.__fl.push(f); if (f) window.__flying++; if (t - t0 < 1600) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
  await btn.click();
  // NOSHOTS=1 measures pacing alone: a screenshot mid-flight stalls a frame.
  if (process.env.NOSHOTS) await p.waitForTimeout(800);
  else for (const t of [120, 330, 560, 800]) {
    await p.waitForTimeout(t === 120 ? 120 : t === 330 ? 210 : t === 560 ? 230 : 240);
    await p.screenshot({ path: `${OUT}/${s.name}-${t}.png` });
  }
  await p.waitForTimeout(1600);
  const r = await p.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __flying: number; __fl: boolean[]; __click: number };
    const d = w.__frames.slice(1).map((t, i) => t - w.__frames[i]);
    const slowAt = d.map((x, i) => x > 34 ? `${Math.round(w.__frames[i + 1] - w.__click)}ms after tap (${Math.round(x)}ms, ${w.__fl[i] ? "mid-flight" : w.__fl[i + 1] ? "flight start" : "not flying"})` : null).filter(Boolean);
    const band = document.querySelector("section.live") as HTMLElement | null;
    return {
      frames: d.length, worst: Math.round(Math.max(0, ...d)), slow: d.filter(x => x > 34).length, slowAt, flyingFrames: w.__flying,
      left: document.querySelectorAll(".un-flying").length,
      band: band && { landed: band.classList.contains("landed"), flown: band.classList.contains("flown"), opacity: band.style.opacity, stub: !!band.querySelector(".live-stub") },
      upNext: document.querySelector("section.un .un-title")?.textContent,
      banner: /Could not open check-in|stubbed failure/.test(document.body.innerText),
    };
  });
  console.log(s.name, "flight", JSON.stringify(r));
  if (r.left) errors.push(`${s.name}: ${r.left} flying copies left on the page`);
  if (s.open === "fail") {
    if (r.band) errors.push(`${s.name}: band still up after a failed open`);
    if (r.upNext !== "Chapter meeting") errors.push(`${s.name}: Up next didn't come back (${r.upNext})`);
    if (!r.banner) errors.push(`${s.name}: no error shown`);
    return;
  }
  if (!r.band) { errors.push(`${s.name}: no band after opening`); return; }
  if (r.band.opacity) errors.push(`${s.name}: band left at opacity ${r.band.opacity}`);
  if (r.upNext !== "Formal planning") errors.push(`${s.name}: Up next didn't move on (${r.upNext})`);
  if (s.reduce) {
    if (r.flyingFrames || r.band.flown) errors.push(`${s.name}: flew despite reduced motion`);
  } else {
    if (!r.flyingFrames || !r.band.landed) errors.push(`${s.name}: never flew (${r.flyingFrames} frames, landed ${r.band.landed})`);
  }
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

  const scenes: Scene[] = [
    { name: "main-chapter", width: 1440, events: [PAST, CHAPTER, ...LATER] },
    { name: "main-party", width: 1440, events: [PAST, PARTY, ...LATER] },
    { name: "main-bare", width: 1440, events: [PAST, BARE, ...LATER] },
    { name: "main-far", width: 1440, events: [PAST, FAR] },
    { name: "main-today", width: 1440, events: [PAST, TODAY, ...LATER] },
    { name: "main-today-member", width: 1440, events: [PAST, TODAY, ...LATER], member: true },
    { name: "main-live", width: 1440, events: [PAST, TODAY, ...LATER], live: true },
    { name: "main-empty", width: 1440, events: [PAST] },
    { name: "main-empty-member", width: 1440, events: [PAST], member: true },
    { name: "main-loading", width: 1440, events: [], slowCalendar: true },
    { name: "main-ivory", width: 1440, events: [PAST, PARTY, ...LATER], theme: "ivory" },
    { name: "main-1100", width: 1100, events: [PAST, CHAPTER, ...LATER] },
    { name: "rail-chapter", width: 1440, events: [PAST, CHAPTER, ...LATER], rail: true },
    { name: "rail-today", width: 1440, events: [PAST, TODAY, ...LATER], rail: true },
    { name: "phone", width: 390, events: [PAST, PARTY, ...LATER] },
    // the live band, wearing the ticket stub
    { name: "band", width: 1440, events: [PAST, TODAY, ...LATER], live: true, band: true },
    { name: "band-member", width: 1440, events: [PAST, TODAY, ...LATER], live: true, band: true, member: true },
    { name: "band-closed", width: 1440, events: [PAST, TODAY, ...LATER], live: "closed", band: true },
    { name: "band-ivory", width: 1440, events: [PAST, TODAY, ...LATER], live: true, band: true, theme: "ivory" },
    { name: "band-phone", width: 390, events: [PAST, TODAY, ...LATER], live: true, band: true },
    // opening check-in from the ticket: the flight
    { name: "fly-main", width: 1440, events: [PAST, TODAY, ...LATER], open: "ok" },
    { name: "fly-rail", width: 1440, events: [PAST, TODAY, ...LATER], open: "ok", rail: true },
    { name: "fly-ivory", width: 1440, events: [PAST, TODAY, ...LATER], open: "ok", theme: "ivory" },
    { name: "fly-phone", width: 390, events: [PAST, TODAY, ...LATER], open: "ok" },
    { name: "fly-fail", width: 1440, events: [PAST, TODAY, ...LATER], open: "fail" },
    { name: "fly-reduced", width: 1440, events: [PAST, TODAY, ...LATER], open: "ok", reduce: true },
  ];

  const b = await chromium.launch();
  const errors: string[] = [];
  for (const s of scenes) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const ctx = await b.newContext({ viewport: { width: s.width, height: 1000 }, reducedMotion: s.reduce ? "reduce" : "no-preference" });
    await ctx.addCookies([
      { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(s.member ? member.brotherId : admin.brotherId), url: BASE },
      { name: "active_org_id", value: String(org.id), url: BASE },
    ]);
    await ctx.addInitScript(t => { try { localStorage.setItem("chaptos:theme:v1", t); } catch { /* */ } }, s.theme ?? "dusk");
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push(`${s.name}: ${String(e).slice(0, 300)}`));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) errors.push(`${s.name}: console ${m.text().slice(0, 200)}`); });
    await guard(p, s);
    // A cold dev server can take a while on /api/auth/me; the card renders from
    // the calendar alone, so wait for the user (layout, permissions, live poll).
    const me = p.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/me", { timeout: 180000 });
    await p.goto(`${BASE}/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await me.catch(() => errors.push(`${s.name}: /api/auth/me never answered`));
    await p.addStyleTag({ content: "nextjs-portal{display:none!important} *{scroll-behavior:auto!important}" }).catch(() => {});
    const want = s.slowCalendar ? "section.un .un-skel" : "section.un :is(.un-tix, .un-blank)";
    for (let tries = 0; ; tries++) {
      const ok = await p.waitForSelector(want, { timeout: 40000 }).then(() => true, () => false);
      if (ok) break;
      if (tries === 3) { await p.screenshot({ path: `${OUT}/${s.name}-FAIL.png` }); errors.push(`${s.name}: card never loaded`); break; }
      await p.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
    }
    await p.waitForTimeout(1200);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) errors.push(`${s.name}: horizontal overflow ${overflow}px`);
    // nothing in the card may spill out of its own box
    const spill = await p.evaluate(() => {
      const card = document.querySelector("section.un")!.getBoundingClientRect();
      return [...document.querySelectorAll("section.un *")].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && getComputedStyle(el).visibility !== "hidden" && (r.right > card.right + 1 || r.left < card.left - 1 || r.bottom > card.bottom + 1);
      }).map(el => el.className.toString()).slice(0, 5);
    });
    if (spill.length) errors.push(`${s.name}: spills out of the card: ${spill.join(", ")}`);
    const info = await p.evaluate(() => ({
      title: document.querySelector("section.un .un-title")?.textContent,
      minis: document.querySelectorAll("section.un .un-mini").length,
      checkin: !!document.querySelector("section.un .un-cd .un-btn"),
      band: !!document.querySelector("section.live"),
    }));
    if (s.open) await fly(p, s, errors);
    if (s.band) {
      const band = p.locator("section.live");
      if (!(await band.count())) errors.push(`${s.name}: no band`);
      else {
        const stub = await p.evaluate(() => {
          const st = document.querySelector("section.live .live-stub") as HTMLElement | null;
          return st && { visible: st.offsetWidth > 0, text: st.innerText.replace(/\s+/g, " "), bg: getComputedStyle(st).backgroundColor };
        });
        console.log(s.name, "stub", JSON.stringify(stub));
        if (!stub?.visible) errors.push(`${s.name}: band has no visible stub`);
        await band.scrollIntoViewIfNeeded();
        await band.screenshot({ path: `${OUT}/${s.name}.png` });
      }
    } else {
      const card = p.locator("section.un");
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: `${OUT}/${s.name}.png` });
    }
    console.log(s.name, JSON.stringify(info));
    await p.unrouteAll({ behavior: "ignoreErrors" });
    await ctx.close();
  }
  await b.close();
  console.log(errors.length ? errors.join("\n") : "no errors");
})();
