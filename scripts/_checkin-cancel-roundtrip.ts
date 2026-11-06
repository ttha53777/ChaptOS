// Check-in cancel round trip against the ISOLATED server (:3100, throwaway Postgres).
// TEST_DATABASE_URL=…54333/figurints_e2e OUT=<dir> tsx --env-file=.env.local scripts/_checkin-cancel-roundtrip.ts
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
import { testPrisma } from "../tests/setup/prisma";

const BASE = "http://localhost:3100", SLUG = "ok-test", ORG = 1;
const MAYA = 1, JORDAN = 3, AISHA = 12;     // officer, two members
const MEETING = 1, WRONG = 2;
const OUT = process.env.OUT!;
if (!process.env.TEST_DATABASE_URL?.includes("54333/figurints_e2e")) throw new Error("refusing: not the throwaway DB");

let step = 0;
const fails: string[] = [];
function check(ok: boolean, what: string) { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) fails.push(what); }

async function ctxAs(b: Browser, id: number, width: number, height = 1000) {
  const ctx = await b.newContext({ viewport: { width, height }, hasTouch: width < 600, isMobile: width < 600 });
  await ctx.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(id), url: BASE },
    { name: "active_org_id", value: String(ORG), url: BASE },
  ]);
  return ctx;
}
type Live = { state: string; cancelledAt: string | null; presentCount: number; eligibleCount: number; event: { id: number }; me: { checkedIn: boolean } } | null;
const live = async (ctx: BrowserContext): Promise<Live> => (await ctx.request.get(`${BASE}/api/attendance/live`)).json();
const win = (ctx: BrowserContext, id: number, action: string) =>
  ctx.request.post(`${BASE}/api/attendance/${id}/window`, { data: { action } });
const checkIn = (ctx: BrowserContext, id: number) => ctx.request.post(`${BASE}/api/attendance/${id}/check-in`);
const rows = (eventId: number) => testPrisma.attendanceRecord.findMany({ where: { calendarEventId: eventId } });

async function shot(p: Page, name: string, full = false) {
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: full });
}
async function dash(p: Page) {
  await p.goto(`${BASE}/org/${SLUG}`, { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important} *{scroll-behavior:auto!important}" }).catch(() => {});
  await p.waitForSelector(".dash", { timeout: 180000 });
}
async function band(p: Page) {
  const b = p.locator("section.live");
  await b.waitFor({ timeout: 30000 });
  await b.scrollIntoViewIfNeeded();
  return b;
}

(async () => {
  const b = await chromium.launch();
  const errors: string[] = [];
  const watch = (p: Page, who: string) => {
    p.on("pageerror", e => errors.push(`${who}: ${String(e).slice(0, 300)}`));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|favicon|realtime|websocket|hydrat/i.test(m.text())) errors.push(`${who}: ${m.text().slice(0, 200)}`); });
  };

  const off = await ctxAs(b, MAYA, 1440);
  const jor = await ctxAs(b, JORDAN, 1440);
  const op = await off.newPage(); watch(op, "officer");
  const jp = await jor.newPage(); watch(jp, "member");

  // ── A. Wrong event on desktop: 1 of 14 checked in ──
  check((await win(off, WRONG, "open")).ok(), "officer opens check-in on the wrong event");
  check((await checkIn(jor, WRONG)).ok(), "Jordan checks in");
  const blocked = await win(off, MEETING, "open");
  check(blocked.status() === 409 && (await blocked.text()).includes("Philanthropy Planning"), "a second window is refused, naming the open one");

  await dash(op);
  let bd = await band(op);
  check(await bd.getByRole("button", { name: "End check-in…" }).isVisible(), "band offers End check-in… (not a one-tap close)");
  check(!(await bd.getByRole("button", { name: /Close & record attendance/ }).count()), "the old one-tap close is gone");
  await shot(op, "desk-open");

  await bd.getByRole("button", { name: "End check-in…" }).click();
  const fork = op.locator(".lce-fork");
  await fork.waitFor();
  check((await fork.locator("h3").innerText()).includes("Did Philanthropy Planning happen?"), "fork asks whether the event happened");
  check(await fork.locator(".lce-slip.record .lce-dots i").count() === 14, "record preview has one dot per eligible member (14)");
  check(await fork.locator(".lce-slip.record .lce-dots i.a").count() === 13, "record preview: 13 would be marked absent");
  check(await fork.locator(".lce-slip.cancel").evaluate(e => e.classList.contains("suggest")), "1/14 here: the cancel answer is outlined as likely");
  check((await bd.locator(".live-kicker").innerText()).toLowerCase().includes("ending check-in"), "kicker reads Ending check-in while deciding");
  await shot(op, "desk-fork");

  await fork.getByRole("button", { name: "Keep it open" }).click();
  await fork.waitFor({ state: "detached" });
  check((await live(off))?.state === "open", "Keep it open leaves the window open");
  await bd.getByRole("button", { name: "End check-in…" }).click();
  await op.keyboard.press("Escape");
  await fork.waitFor({ state: "detached" });
  check(true, "Escape closes the fork");

  await bd.getByRole("button", { name: "End check-in…" }).click();
  await fork.getByRole("button", { name: "Cancel check-in" }).click();
  await op.locator("section.live.void").waitFor();
  bd = await band(op);
  check(await op.locator(".lce-void-stamp").isVisible(), "VOID stamp on the stub");
  check((await bd.locator(".live-count .k").innerText()).includes("not counted"), "tally reads not counted");
  check(await bd.getByRole("button", { name: "Undo" }).isVisible(), "inline Undo while the countdown runs");
  check(await bd.getByRole("button", { name: "Open the right event" }).isVisible(), "primary action becomes Open the right event");
  let l = await live(off);
  check(!!l?.cancelledAt && l.state === "closed" && l.presentCount === 1, "server: closed, cancelled, 1 check-in thrown out");
  check((await rows(WRONG)).length === 0, "DB: no attendance rows for the cancelled event");
  await shot(op, "desk-void");

  // the member, in the same moment
  await dash(jp);
  const mb = await band(jp);
  check((await mb.innerText()).includes("Not counted"), "member sees Not counted");
  check(!(await mb.getByRole("button", { name: /Undo|Open the right event/ }).count()), "member gets no officer actions");
  await shot(jp, "desk-member-void");

  await bd.getByRole("button", { name: "Undo" }).click();
  await op.locator("section.live:not(.void)").waitFor();
  l = await live(off);
  check(l?.state === "open" && !l.cancelledAt && l.presentCount === 1, "undo: open again with Jordan's check-in back");
  check((await rows(WRONG)).map(r => r.brotherId).join() === String(JORDAN), "DB: Jordan's row restored");

  // record this time
  bd = await band(op);
  await bd.getByRole("button", { name: "End check-in…" }).click();
  await fork.getByRole("button", { name: "Close & record" }).click();
  await op.locator('section.live[data-state="closed"]:not(.void)').waitFor();
  l = await live(off);
  check(l?.state === "closed" && !l.cancelledAt, "record path closes normally");
  check((await rows(WRONG)).filter(r => !r.attended).length === 13, "DB: 13 absences written");
  await shot(op, "desk-recorded");

  // ── B. Phone: the bottom sheet and the snackbar ──
  check((await win(off, MEETING, "open")).ok(), "officer opens the meeting (the old window is closed)");
  await checkIn(jor, MEETING);
  const aisha = await ctxAs(b, AISHA, 1440);
  await checkIn(aisha, MEETING);
  const phone = await ctxAs(b, MAYA, 390, 844);
  const pp = await phone.newPage(); watch(pp, "phone");
  await dash(pp);
  bd = await band(pp);
  await shot(pp, "phone-open");
  await bd.getByRole("button", { name: "End check-in…" }).click();
  const sheet = pp.locator(".lce-psheet");
  await sheet.waitFor();
  check(!(await pp.locator(".lce-fork").count()), "phone uses the sheet, not the in-band fork");
  await pp.waitForTimeout(600);
  const inView = async (name: string) => {
    const box = await sheet.getByRole("button", { name }).boundingBox();
    return !!box && box.y >= 0 && box.y + box.height <= 844;
  };
  check(await inView("Close & record") && await inView("Cancel check-in"), "both answers are on screen at once");
  check(!(await pp.locator(".lce-slip.cancel.suggest").count()), "2/14 here: no 'likely' hint");
  await shot(pp, "phone-sheet");
  // scrim tap backs out
  await pp.mouse.click(195, 20);
  await sheet.waitFor({ state: "detached" });
  check(true, "tapping the scrim backs out");

  await bd.getByRole("button", { name: "End check-in…" }).click();
  await sheet.getByRole("button", { name: "Cancel check-in" }).click();
  const snack = pp.locator(".lce-snack");
  await snack.waitFor();
  const sb = await snack.boundingBox();
  const tab = await pp.locator(".mtb").boundingBox().catch(() => null);
  check(!!sb && (!tab || sb.y + sb.height <= tab.y), "undo snackbar sits above the tab bar");
  check((await snack.innerText()).includes("2 check-ins thrown out"), "snackbar counts the thrown-out check-ins");
  check(!(await pp.locator(".lce-undo-row").count()), "no duplicate inline undo on a phone");
  await shot(pp, "phone-snack");

  // the member after the undo window: band gone
  await pp.waitForTimeout(11000);
  check(!(await snack.count()), "snackbar leaves after 10s");
  check(await pp.locator("section.live.void").isVisible(), "officer's void band stays (Open the right event)");
  await dash(jp);
  check(!(await jp.locator("section.live").count()), "member: band is gone once the undo window passes");
  check((await rows(MEETING)).length === 0, "DB: still nothing recorded for the meeting");
  await shot(pp, "phone-after-undo-window");

  await pp.locator("section.live").getByRole("button", { name: "Open the right event" }).click();
  await pp.waitForSelector(".ci-pick", { timeout: 15000 });
  check(true, "Open the right event opens the event picker");
  await shot(pp, "phone-picker");

  // ── C. About to expire: the nudge offers the way out ──
  check((await win(off, MEETING, "open")).ok(), "reopening the cancelled event via open starts clean");
  const ev = await testPrisma.calendarEvent.findUniqueOrThrow({ where: { id: MEETING } });
  check(ev.checkInCancelledAt === null && ev.checkInCancelledRecords === null, "DB: cancel snapshot dropped on a fresh open");
  await testPrisma.calendarEvent.update({ where: { id: MEETING }, data: { checkInOpenedAt: new Date(Date.now() - 56 * 60_000) } });
  await dash(op);
  bd = await band(op);
  const nudge = bd.locator(".live-nudge");
  check((await nudge.innerText()).includes("Wrong event?"), "closing nudge offers Cancel it instead");
  await shot(op, "desk-closing");
  await nudge.getByRole("button", { name: "Cancel it instead" }).click();
  await op.locator(".lce-fork").waitFor();
  check(true, "Cancel it instead opens the fork");

  // ── D. Day theme (ivory), fork open — everything above ran in the dusk default ──
  const night = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await night.addCookies([
    { name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(MAYA), url: BASE },
    { name: "active_org_id", value: String(ORG), url: BASE },
  ]);
  const np = await night.newPage(); watch(np, "night");
  await np.addInitScript(() => { try { localStorage.setItem("chaptos:theme:v1", "ivory"); } catch {} });
  await dash(np);
  bd = await band(np);
  await bd.getByRole("button", { name: "End check-in…" }).click();
  await np.locator(".lce-fork").waitFor();
  await shot(np, "day-fork");

  check(errors.length === 0, `no page errors (${errors.length})`);
  errors.forEach(e => console.log("  ", e));
  console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASS");
  await b.close();
  await testPrisma.$disconnect();
})().catch(async e => { console.error(e); await testPrisma.$disconnect(); process.exit(1); });
