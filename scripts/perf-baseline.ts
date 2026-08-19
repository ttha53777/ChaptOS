/**
 * Phase 0 baseline capture — measures what each hot endpoint actually costs
 * before any remediation work starts.
 *
 * Why this exists: every impact estimate in the performance plan is reasoned
 * from code plus the ~400ms-vs-~100ms figure recorded in lib/db/tenant.ts:93.
 * That number justified raising the transaction timeout to 15s; it should not
 * also be the sole justification for a refactor touching 314 call sites. This
 * replaces the estimate with a measurement, per endpoint, on real data.
 *
 * What it reports, per endpoint:
 *   - wall-clock p50/p95 over N samples
 *   - scoped `run()` calls issued (one per logical query)
 *   - BEGIN count — i.e. transactions, the number batching must reduce
 *   - begins-per-call — ~1.00 today; the headline ratio to drive down
 *
 * Hits the API directly rather than driving a browser, so the numbers are
 * server time and don't include React render or asset loading.
 *
 * Prereqs (same as npm run screenshot):
 *   - DEV_AUTH_BYPASS=1 and DEV_AUTH_BYPASS_SECRET in .env.local
 *   - dev server running with instrumentation on:
 *       PERF_INSTRUMENT=1 npm run dev
 *
 * Usage:
 *   npx tsx scripts/perf-baseline.ts
 *   npx tsx scripts/perf-baseline.ts --samples 10
 *   npx tsx scripts/perf-baseline.ts --json > _temp/baseline.json
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";
import { ACTIVE_ORG_COOKIE, ORG_SLUG_HEADER } from "../lib/auth/require-user";

const BASE_URL = process.env.PERF_BASE_URL ?? "http://localhost:3000";
const ORG_SLUG = process.env.PERF_ORG_SLUG ?? "lpe";

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const SAMPLES = (() => {
  const i = args.indexOf("--samples");
  return i >= 0 && args[i + 1] ? Math.max(1, Number(args[i + 1])) : 5;
})();
/** Discarded before measuring so first-hit route compilation isn't counted. */
const WARMUP = 2;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/**
 * The endpoints worth a baseline, and why each is here.
 * `brothers` is first because ChapterContext's ALWAYS_SECTIONS loads it on
 * every single page, so its cost is paid app-wide rather than per-page.
 */
const ENDPOINTS: { path: string; note: string }[] = [
  { path: "/api/brothers",        note: "ALWAYS_SECTIONS — on every page load" },
  { path: "/api/auth/me",         note: "session + permissions, 7-way Promise.all" },
  { path: "/api/treasury",        note: "full-table scan, reduces in JS" },
  { path: "/api/transactions",    note: "unbounded findMany + event join" },
  { path: "/api/calendar",        note: "dashboard + timeline + chapter" },
  { path: "/api/activity",        note: "bounded take:20 — control case" },
  { path: "/api/tasks",           note: "tasks page bootstrap" },
  { path: "/api/polls?assignee=me", note: "dashboard widget" },
];

interface PerfSnapshot {
  run:  { calls: number; totalMs: number; maxMs: number; errors: number; wrapped: boolean; p50: number; p95: number; p99: number; avgMs: number };
  wire: { begin: number; commit: number; setLocal: number; other: number };
  beginsPerCall: number;
}

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function pct(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}

async function main() {
  if (process.env.DEV_AUTH_BYPASS !== "1") fail("DEV_AUTH_BYPASS=1 must be set in .env.local.");
  if (!process.env.DEV_AUTH_BYPASS_SECRET) fail("DEV_AUTH_BYPASS_SECRET must be set in .env.local.");

  const org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG }, select: { id: true, name: true } });
  if (!org) fail(`No organization with slug "${ORG_SLUG}".`);

  const membership = await prisma.membership.findFirst({
    where: { organizationId: org.id, isOrgAdmin: true },
    select: { brother: { select: { id: true, name: true } } },
  });
  const brother = membership?.brother;
  if (!brother) fail(`No org-admin member in "${ORG_SLUG}".`);

  // Roster size is the scaling factor behind most of the findings, so report it
  // alongside the timings — 12 members and 120 members are different stories.
  const rosterSize = await prisma.membership.count({ where: { organizationId: org.id } });
  const txCount = await prisma.transaction.count({ where: { organizationId: org.id, deletedAt: null } });

  const cookie = [
    `${DEV_IMPERSONATE_COOKIE}=${signImpersonation(brother.id)}`,
    `${ACTIVE_ORG_COOKIE}=${org.id}`,
  ].join("; ");
  const headers = { cookie, [ORG_SLUG_HEADER]: ORG_SLUG };

  // Confirm instrumentation is actually live before measuring anything —
  // otherwise every run/BEGIN count below would silently read as zero.
  const probe = await fetch(`${BASE_URL}/api/admin/perf`, { headers }).catch(() => null);
  if (!probe || !probe.ok) {
    fail(
      `Instrumentation endpoint unavailable at ${BASE_URL}/api/admin/perf.\n` +
      `  Start the dev server with:  PERF_INSTRUMENT=1 npm run dev`
    );
  }

  if (!JSON_OUT) {
    console.log(`\nPhase 0 baseline — ${org.name} (${ORG_SLUG})`);
    console.log(`  roster: ${rosterSize} members · transactions: ${txCount}`);
    console.log(`  as: ${brother.name} (org admin) · ${SAMPLES} samples + ${WARMUP} warmup\n`);
  }

  const results: Record<string, unknown>[] = [];

  for (const { path, note } of ENDPOINTS) {
    for (let i = 0; i < WARMUP; i++) {
      await fetch(`${BASE_URL}${path}`, { headers }).catch(() => null);
    }

    // Reset AFTER warmup so route-compilation queries aren't attributed.
    await fetch(`${BASE_URL}/api/admin/perf`, { method: "POST", headers });

    const times: number[] = [];
    let status = 0;
    let bytes = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      const res = await fetch(`${BASE_URL}${path}`, { headers }).catch(() => null);
      const body = res ? await res.text() : "";
      times.push(performance.now() - t0);
      status = res?.status ?? 0;
      bytes = body.length;
    }

    const snap = (await (await fetch(`${BASE_URL}/api/admin/perf`, { headers })).json()) as PerfSnapshot;
    const sorted = [...times].sort((a, b) => a - b);

    // Counters are cumulative across the SAMPLES requests; divide to get per-request.
    const callsPerReq  = snap.run.calls / SAMPLES;
    const beginsPerReq = snap.wire.begin / SAMPLES;

    results.push({
      path, note, status,
      p50: Number(pct(sorted, 0.5).toFixed(1)),
      p95: Number(pct(sorted, 0.95).toFixed(1)),
      scopedCalls: Number(callsPerReq.toFixed(1)),
      begins: Number(beginsPerReq.toFixed(1)),
      dbMsPerReq: Number((snap.run.totalMs / SAMPLES).toFixed(1)),
      payloadKB: Number((bytes / 1024).toFixed(1)),
    });

    if (!JSON_OUT) {
      const r = results[results.length - 1]! as Record<string, number | string>;
      const flag = status !== 200 ? `  [HTTP ${status}]` : "";
      console.log(`${String(path).padEnd(26)} p50 ${String(r.p50).padStart(7)}ms   p95 ${String(r.p95).padStart(7)}ms`);
      console.log(`${" ".repeat(26)} db ${String(r.dbMsPerReq).padStart(8)}ms   ${String(r.scopedCalls).padStart(4)} queries · ${String(r.begins).padStart(4)} BEGIN · ${r.payloadKB}KB${flag}`);
      console.log(`${" ".repeat(26)} ${note}\n`);
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({
      org: ORG_SLUG, rosterSize, txCount, samples: SAMPLES,
      capturedAt: new Date().toISOString(), results,
    }, null, 2));
  } else {
    const totalDb = results.reduce((s, r) => s + (r.dbMsPerReq as number), 0);
    const totalBegins = results.reduce((s, r) => s + (r.begins as number), 0);
    const totalCalls = results.reduce((s, r) => s + (r.scopedCalls as number), 0);
    console.log("─".repeat(72));
    console.log(`Across ${ENDPOINTS.length} endpoints: ${totalCalls.toFixed(0)} scoped queries · ${totalBegins.toFixed(0)} transactions · ${totalDb.toFixed(0)}ms in the DB layer`);
    console.log(`Begins per query: ${totalCalls === 0 ? "n/a" : (totalBegins / totalCalls).toFixed(2)}  (1.00 = one transaction per query — the tax to remove)\n`);
  }

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
