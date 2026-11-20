/**
 * Bearer-only smoke test: calls every entry in the lib/api-types route map the
 * way the native app does (Authorization: Bearer, x-org-slug, x-app-version,
 * and no cookies at all) and fails if any of them doesn't recognise the caller.
 *
 *   SMOKE_BEARER=<supabase access token> SMOKE_ORG=<slug> npx tsx scripts/mobile-bearer-smoke.ts
 *
 * Env:
 *   SMOKE_BASE_URL  default http://localhost:3100 (the isolated dev server)
 *   SMOKE_BEARER    a signed-in member's Supabase access token (required)
 *   SMOKE_ORG       the org slug to send as x-org-slug (required)
 *   SMOKE_WRITES=1  also probe the non-GET entries
 *
 * Reads are real calls. Write probes send deliberately invalid input (an empty
 * body, an id that can't exist) so they stop at validation or a 404, AFTER the
 * caller is identified. That proves the bearer got through without changing
 * anything. Even so they run only against an isolated server: dev and prod
 * share one database, so the script refuses SMOKE_WRITES on :3000 or a
 * public host.
 *
 * Pass = not 401, not the proxy's cross-origin 403, not 426, and (for reads)
 * a JSON body. A 403 "Forbidden" is a permission answer, so the bearer
 * worked; it is reported, not failed. Every route-map entry must have a probe
 * below, so a new entry without one fails the run.
 */
import { readRouteMap, type RouteEntry } from "../tests/contracts/route-map";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const BEARER = process.env.SMOKE_BEARER ?? "";
const ORG = process.env.SMOKE_ORG ?? "";
const WRITES = process.env.SMOKE_WRITES === "1";
const APP_VERSION = "0.1.0";
/** Fits Postgres int4 and passes every id parser, but no row has it. */
const NONE = 2147480000;

if (!BEARER || !ORG) {
  console.error("Set SMOKE_BEARER (a member's Supabase access token) and SMOKE_ORG (their org slug).");
  process.exit(2);
}
if (WRITES) {
  const url = new URL(BASE);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(url.hostname);
  if (!local || url.port === "3000" || url.port === "") {
    console.error(`Refusing SMOKE_WRITES against ${BASE}: writes go only to the isolated server (e.g. :3100), never the shared DB.`);
    process.exit(2);
  }
}

type Ids = { me: number; event: number; task: number; serviceEvent: number; fundraiser: number };

interface Probe {
  path: (ids: Ids) => string;
  body?: unknown;
  /** Send a body that is not JSON / not multipart (for upload routes). */
  rawBody?: string;
  accept?: string;
  /** A redirect is a fine answer (the receipt 302s to a signed URL). */
  allowRedirect?: boolean;
}

const today = new Date().toLocaleDateString("en-CA");

/** One per route-map entry, keyed "METHOD /path". */
const PROBES: Record<string, Probe> = {
  "GET /api/mobile/config":                    { path: () => "/api/mobile/config" },
  "GET /api/auth/me":                          { path: () => "/api/auth/me" },
  "POST /api/auth/terms":                      { path: () => "/api/auth/terms", body: {} },
  "POST /api/auth/avatar":                     { path: () => "/api/auth/avatar", rawBody: "not a form" },
  "GET /api/auth/invite-status":               { path: () => "/api/auth/invite-status?token=smoke-not-a-real-token" },
  "POST /api/auth/request-join":               { path: () => "/api/auth/request-join", body: {} },
  "GET /api/auth/join-status":                 { path: () => `/api/auth/join-status?slug=${encodeURIComponent(ORG)}` },
  "GET /api/auth/join-requests":               { path: () => "/api/auth/join-requests" },
  "GET /api/auth/account":                     { path: () => "/api/auth/account" },
  "DELETE /api/auth/account":                  { path: () => "/api/auth/account", body: {} },
  "GET /api/brothers":                         { path: () => "/api/brothers" },
  "GET /api/brothers/[id]/profile":            { path: i => `/api/brothers/${i.me}/profile` },
  "PATCH /api/brothers/[id]":                  { path: i => `/api/brothers/${i.me}`, body: { name: "" } },
  "GET /api/join-requests":                    { path: () => "/api/join-requests?page=1" },
  "POST /api/join-requests/[id]/approve":      { path: () => `/api/join-requests/${NONE}/approve`, body: {} },
  "POST /api/join-requests/[id]/reject":       { path: () => `/api/join-requests/${NONE}/reject` },
  "POST /api/orgs/leave":                      { path: () => "/api/orgs/leave", body: {} },
  "GET /api/home":                             { path: () => `/api/home?today=${today}` },
  "GET /api/dashboard":                        { path: () => `/api/dashboard?today=${today}` },
  "GET /api/calendar":                         { path: () => "/api/calendar" },
  "GET /api/calendar/event-types":             { path: () => "/api/calendar/event-types" },
  "PATCH /api/calendar/[id]/details":          { path: () => `/api/calendar/${NONE}/details`, body: {} },
  "GET /api/calendar/[id]/summary":            { path: i => `/api/calendar/${i.event}/summary` },
  "PATCH /api/calendar/[id]/action-items":     { path: () => `/api/calendar/${NONE}/action-items`, body: {} },
  "GET /api/calendar/subscription":            { path: () => "/api/calendar/subscription?view=member" },
  "POST /api/calendar":                        { path: () => "/api/calendar", body: {} },
  "PATCH /api/calendar/[id]":                  { path: () => `/api/calendar/${NONE}`, body: {} },
  "DELETE /api/calendar/[id]":                 { path: () => `/api/calendar/${NONE}` },
  "GET /api/calendar/[id]/delete-preview":     { path: () => `/api/calendar/${NONE}/delete-preview` },
  "GET /api/calendar/agenda-templates":        { path: () => "/api/calendar/agenda-templates" },
  "GET /api/programming":                      { path: () => "/api/programming" },
  "POST /api/programming":                     { path: () => "/api/programming", body: {} },
  "PATCH /api/programming/[id]":               { path: () => `/api/programming/${NONE}`, body: {} },
  "DELETE /api/programming/[id]":              { path: () => `/api/programming/${NONE}` },
  "PATCH /api/programming/[id]/stage":         { path: () => `/api/programming/${NONE}/stage`, body: {} },
  "GET /api/programming/[id]/docs":            { path: () => `/api/programming/${NONE}/docs` },
  "POST /api/programming/[id]/docs":           { path: () => `/api/programming/${NONE}/docs`, body: {} },
  "DELETE /api/programming/[id]/docs/[docId]": { path: () => `/api/programming/${NONE}/docs/${NONE}` },
  "GET /api/parties":                         { path: () => "/api/parties" },
  "POST /api/parties":                        { path: () => "/api/parties", body: {} },
  "PATCH /api/parties/[id]":                  { path: () => `/api/parties/${NONE}`, body: {} },
  "DELETE /api/parties/[id]":                 { path: () => `/api/parties/${NONE}` },
  "GET /api/parties/attendance-summary":      { path: () => "/api/parties/attendance-summary" },
  "GET /api/instagram":                       { path: () => "/api/instagram" },
  "POST /api/instagram":                      { path: () => "/api/instagram", body: {} },
  "PATCH /api/instagram/[id]":                { path: () => `/api/instagram/${NONE}`, body: {} },
  "DELETE /api/instagram/[id]":               { path: () => `/api/instagram/${NONE}` },
  "GET /api/roles":                            { path: () => "/api/roles" },
  "POST /api/ai/summarize-meeting":            { path: () => "/api/ai/summarize-meeting", body: { id: NONE } },
  "GET /api/attendance/live":                  { path: () => "/api/attendance/live" },
  "POST /api/attendance/[eventId]/check-in":   { path: () => `/api/attendance/${NONE}/check-in` },
  "GET /api/attendance/mine":                  { path: () => "/api/attendance/mine" },
  "GET /api/attendance/[eventId]":             { path: i => `/api/attendance/${i.event}` },
  "GET /api/attendance/summary":               { path: () => "/api/attendance/summary?category=chapter" },
  "POST /api/attendance":                      { path: () => "/api/attendance", body: {} },
  "POST /api/attendance/[eventId]/window":     { path: () => `/api/attendance/${NONE}/window`, body: {} },
  "GET /api/excuses/mine":                     { path: () => "/api/excuses/mine" },
  "POST /api/excuses":                         { path: () => "/api/excuses", body: {} },
  "GET /api/excuses":                          { path: () => "/api/excuses?status=pending" },
  "PATCH /api/excuses/[id]":                   { path: () => `/api/excuses/${NONE}`, body: {} },
  "GET /api/tasks":                            { path: () => "/api/tasks" },
  "GET /api/tasks/[id]":                       { path: i => `/api/tasks/${i.task}` },
  "PATCH /api/tasks/[id]":                     { path: () => `/api/tasks/${NONE}`, body: {} },
  "POST /api/tasks":                           { path: () => "/api/tasks", body: {} },
  "DELETE /api/tasks/[id]":                    { path: () => `/api/tasks/${NONE}` },
  "GET /api/polls":                            { path: () => "/api/polls" },
  "POST /api/polls/[id]/vote":                 { path: () => `/api/polls/${NONE}/vote`, body: {} },
  "POST /api/polls":                           { path: () => "/api/polls", body: {} },
  "PATCH /api/polls/[id]":                     { path: () => `/api/polls/${NONE}`, body: {} },
  "DELETE /api/polls/[id]":                    { path: () => `/api/polls/${NONE}` },
  "GET /api/service-events":                   { path: () => "/api/service-events" },
  "GET /api/service-participation":            { path: () => "/api/service-participation" },
  "GET /api/service-events/[id]/participation":   { path: i => `/api/service-events/${i.serviceEvent}/participation` },
  "POST /api/service-events/[id]/participation/me": { path: () => `/api/service-events/${NONE}/participation/me`, body: { hours: -1 } },
  "GET /api/fundraisers":                      { path: () => "/api/fundraisers" },
  "GET /api/fundraisers/[id]":                 { path: i => `/api/fundraisers/${i.fundraiser}` },
  "GET /api/docs":                             { path: () => "/api/docs" },
  "GET /api/docs/folders":                     { path: () => "/api/docs/folders" },
  "POST /api/docs":                            { path: () => "/api/docs", body: {} },
  "PATCH /api/docs/[id]":                      { path: () => `/api/docs/${NONE}`, body: {} },
  "DELETE /api/docs/[id]":                     { path: () => `/api/docs/${NONE}` },
  "PATCH /api/docs/[id]/move":                 { path: () => `/api/docs/${NONE}/move`, body: { folderId: null } },
  "PATCH /api/docs/[id]/pin":                  { path: () => `/api/docs/${NONE}/pin`, body: { pinned: true } },
  "POST /api/docs/refresh-metadata":           { path: () => "/api/docs/refresh-metadata", body: { id: NONE } },
  "POST /api/docs/folders":                    { path: () => "/api/docs/folders", body: {} },
  "PATCH /api/docs/folders/[id]":              { path: () => `/api/docs/folders/${NONE}`, body: {} },
  "DELETE /api/docs/folders/[id]":             { path: () => `/api/docs/folders/${NONE}` },
  "PATCH /api/docs/folders/[id]/pin":          { path: () => `/api/docs/folders/${NONE}/pin`, body: { pinned: true } },
  "GET /api/activity":                         { path: () => "/api/activity" },
  "GET /api/announcement":                     { path: () => "/api/announcement" },
  "PUT /api/announcement":                     { path: () => "/api/announcement", body: {} },
  "POST /api/ai/chat":                         { path: () => "/api/ai/chat", body: {} },
  "GET /api/ai/chat":                          { path: () => "/api/ai/chat" },
  "GET /api/ai/peek":                          { path: () => `/api/ai/peek?type=member&id=${NONE}` },
  "POST /api/ai/attachments":                  { path: () => "/api/ai/attachments", rawBody: "not a form" },
  "GET /api/ai/attachments":                   { path: () => "/api/ai/attachments?threadId=smoke-thread" },
  "DELETE /api/ai/attachments/[id]":           { path: () => `/api/ai/attachments/${NONE}` },
  "GET /api/ai/attachments/[id]/units/[ref]":  { path: () => `/api/ai/attachments/${NONE}/units/p1` },
  "GET /api/treasury":                         { path: () => "/api/treasury" },
  "GET /api/transactions":                     { path: () => "/api/transactions" },
  "POST /api/transactions":                    { path: () => "/api/transactions", body: {} },
  "PATCH /api/transactions/[id]":              { path: () => `/api/transactions/${NONE}`, body: {} },
  "DELETE /api/transactions/[id]":             { path: () => `/api/transactions/${NONE}` },
  "GET /api/treasury/categories":             { path: () => "/api/treasury/categories" },
  "PATCH /api/treasury/settings":             { path: () => "/api/treasury/settings", body: {} },
  "GET /api/transactions/export":              { path: () => "/api/transactions/export" },
  "GET /api/semesters":                        { path: () => "/api/semesters" },
  "GET /api/reimbursements":                   { path: () => "/api/reimbursements" },
  "POST /api/reimbursements":                  { path: () => "/api/reimbursements", body: {} },
  "PATCH /api/reimbursements/[id]":            { path: () => `/api/reimbursements/${NONE}`, body: {} },
  "POST /api/reimbursements/[id]/receipt":     { path: () => `/api/reimbursements/${NONE}/receipt`, rawBody: "not a form" },
  "GET /api/reimbursements/[id]/receipt":      { path: () => `/api/reimbursements/${NONE}/receipt`, accept: "application/json", allowRedirect: true },
  "GET /api/dues":                             { path: () => "/api/dues" },
  "GET /api/dues/members/[brotherId]":         { path: i => `/api/dues/members/${i.me}` },
  "POST /api/dues/charges/preview":            { path: () => "/api/dues/charges/preview", body: {} },
  "POST /api/dues/charges":                    { path: () => "/api/dues/charges", body: {} },
  "POST /api/dues/waivers":                    { path: () => "/api/dues/waivers", body: {} },
};

async function call(method: string, path: string, probe: Partial<Probe> = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${BEARER}`,
    "x-org-slug": ORG,
    "x-app-version": APP_VERSION,
    Accept: probe.accept ?? "application/json",
  };
  let body: string | undefined;
  if (probe.rawBody !== undefined) { body = probe.rawBody; headers["Content-Type"] = "text/plain"; }
  else if (probe.body !== undefined) { body = JSON.stringify(probe.body); headers["Content-Type"] = "application/json"; }
  // Node's fetch keeps no cookie jar, so nothing but the bearer identifies us.
  const res = await fetch(BASE + path, { method, headers, body, redirect: "manual" });
  const text = await res.text();
  let json: unknown = undefined;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

const firstId = (v: unknown): number => (Array.isArray(v) && typeof v[0]?.id === "number" ? v[0].id : NONE);

async function main() {
  const routes = readRouteMap();
  const missing = routes.filter(r => !PROBES[`${r.method} ${r.path}`]);
  if (missing.length) {
    console.error("Route-map entries with no probe (add one to PROBES):\n" + missing.map(r => `  ${r.method} ${r.path}`).join("\n"));
    process.exit(1);
  }

  const me = await call("GET", "/api/auth/me");
  if (me.status !== 200) {
    console.error(`GET /api/auth/me answered ${me.status}: ${me.text.slice(0, 200)}\nIs the token fresh (they last an hour) and the slug one of this account's orgs?`);
    process.exit(1);
  }
  const [calendar, tasks, serviceEvents, fundraisers] = await Promise.all(
    ["/api/calendar", "/api/tasks", "/api/service-events", "/api/fundraisers"].map(p => call("GET", p)),
  );
  const ids: Ids = {
    me: (me.json as { id: number }).id,
    event: firstId(calendar?.json), task: firstId(tasks?.json),
    serviceEvent: firstId(serviceEvents?.json), fundraiser: firstId(fundraisers?.json),
  };

  let failed = 0;
  const rows: string[] = [];
  for (const r of routes as RouteEntry[]) {
    const key = `${r.method} ${r.path}`;
    const probe = PROBES[key]!;
    if (r.method !== "GET" && !WRITES) { rows.push(`SKIP  ---  ${key}  (set SMOKE_WRITES=1 on the isolated server)`); continue; }
    const res = await call(r.method, probe.path(ids), probe);
    const error = (res.json as { error?: string } | null)?.error ?? "";
    const why =
      res.status === 401 ? "bearer not recognised"
      : res.status === 403 && /cross-origin/i.test(error) ? "CSRF guard rejected a cookieless client"
      : res.status === 426 ? "426: this script's x-app-version is below MOBILE_MIN_VERSION"
      : r.method === "GET" && res.json === undefined && !(probe.allowRedirect && res.status >= 300 && res.status < 400) ? "not JSON"
      : null;
    if (why) failed++;
    rows.push(`${why ? "FAIL" : "ok  "}  ${res.status}  ${key}${why ? `  ← ${why}` : res.status >= 400 ? `  (${error.slice(0, 60)})` : ""}`);
  }
  console.log(rows.join("\n"));
  console.log(`\n${routes.length} entries, ${failed} failed${WRITES ? "" : ", writes skipped"}. Base ${BASE}, org ${ORG}.`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
