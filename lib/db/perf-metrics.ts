/**
 * Phase 0 performance instrumentation for the RLS transaction wrapper.
 *
 * Every scoped delegate call in lib/db/tenant.ts goes through `run()`, which
 * under RLS_SET_ORG_ID=1 opens its own interactive transaction:
 * BEGIN + SET LOCAL + <query> + COMMIT — four wire round-trips for one logical
 * query. tenant.ts:93-101 measures that at ~400ms wrapped vs ~100ms bare and
 * cites production incidents on /api/brothers at 7s, 10.8s and 16.1s.
 *
 * This module counts those wrapped calls and their wall-clock cost so the
 * remediation plan can be driven by measurement rather than by that comment.
 *
 * OFF unless PERF_INSTRUMENT=1. When off, `record` is a no-op and `active()`
 * is false, so the hot path pays one boolean check and nothing else — this must
 * never become a production cost of its own.
 *
 * Counters are per-process and cumulative. On serverless each instance keeps
 * its own; that is fine for a local baseline, which is what Phase 0 needs.
 */

import { createRequire } from "node:module";

const ENABLED = process.env.PERF_INSTRUMENT === "1";

export interface RunStats {
  /** Wrapped `run()` calls — one per logical scoped query. */
  calls:    number;
  /** Total wall-clock ms spent inside those calls. */
  totalMs:  number;
  /** Slowest single call, ms. */
  maxMs:    number;
  /** Calls that threw (timeouts, expired commits, real errors). */
  errors:   number;
  /** True when the calls above were transaction-wrapped (RLS_SET_ORG_ID=1). */
  wrapped:  boolean;
}

const stats: RunStats = { calls: 0, totalMs: 0, maxMs: 0, errors: 0, wrapped: false };

/** Every observed duration, kept only so the reporter can compute percentiles. */
const samples: number[] = [];
/** Bound the array so a long-lived dev server can't grow it without limit. */
const MAX_SAMPLES = 50_000;

export function active(): boolean {
  return ENABLED;
}

export function setWrapped(wrapped: boolean): void {
  if (ENABLED) stats.wrapped = wrapped;
}

export function record(ms: number, ok: boolean): void {
  if (!ENABLED) return;
  stats.calls   += 1;
  stats.totalMs += ms;
  if (ms > stats.maxMs) stats.maxMs = ms;
  if (!ok) stats.errors += 1;
  if (samples.length < MAX_SAMPLES) samples.push(ms);
}

export function snapshot(): RunStats & { p50: number; p95: number; p99: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
  return { ...stats, p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

export function reset(): void {
  stats.calls = 0;
  stats.totalMs = 0;
  stats.maxMs = 0;
  stats.errors = 0;
  samples.length = 0;
}

// ---------------------------------------------------------------------------
// Wire-level statement counter
// ---------------------------------------------------------------------------

/**
 * Counts raw SQL statements as they leave the pg driver, bucketed by verb.
 *
 * The `run()` timer above says how long a scoped call took; this says how many
 * wire statements it cost. The BEGIN count is the number that matters for the
 * remediation plan: it is exactly the transaction count, so "did batching
 * actually reduce round-trips?" becomes an assertion rather than an argument.
 * It is also the regression guard — a later refactor that silently reverts to
 * one transaction per query shows up here immediately.
 */
export interface WireStats {
  begin:  number;
  commit: number;
  setLocal: number;
  other:  number;
}

const wire: WireStats = { begin: 0, commit: 0, setLocal: 0, other: 0 };

export function recordStatement(sql: string): void {
  if (!ENABLED) return;
  const head = sql.trimStart().slice(0, 24).toUpperCase();
  if (head.startsWith("BEGIN")) wire.begin += 1;
  else if (head.startsWith("COMMIT")) wire.commit += 1;
  else if (head.startsWith("SET LOCAL APP.ORG_ID")) wire.setLocal += 1;
  else wire.other += 1;
}

export function wireSnapshot(): WireStats {
  return { ...wire };
}

export function resetWire(): void {
  wire.begin = 0;
  wire.commit = 0;
  wire.setLocal = 0;
  wire.other = 0;
}

function sqlOf(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg && typeof arg === "object" && "text" in arg) {
    return String((arg as { text: unknown }).text);
  }
  return "";
}

type Queryable = { query: (...args: never[]) => unknown };

/**
 * Wrap one pg client/pool/prototype's `query` so each statement is counted once.
 * Marks what it wraps, so repeated calls (and pool + prototype both being
 * patched) never double-count a single statement.
 */
function patchQuery(target: Queryable): void {
  const marked = target as Queryable & { __perfPatched?: boolean };
  if (marked.__perfPatched) return;
  marked.__perfPatched = true;

  const original = target.query;
  target.query = function (this: unknown, ...args: never[]) {
    const sql = sqlOf(args[0]);
    if (sql) recordStatement(sql);
    // .apply(this) — NOT a bound copy. On a prototype patch `this` is the
    // individual client the driver is using; binding here would send every
    // client's statements through whichever object was patched first.
    return (original as (...a: never[]) => unknown).apply(this, args);
  } as Queryable["query"];
}

/**
 * Counts statements at the pg layer, by patching `Client.prototype.query`.
 *
 * Patching pool/client INSTANCES does not work here, and the reason is worth
 * recording. @prisma/adapter-pg's startTransaction does `this.client.connect()`
 * and issues BEGIN / SET LOCAL / <query> / COMMIT on that checked-out client
 * (dist/index.js:720,731) — so none of it passes through `pool.query`. Four
 * instance-level patch points were tried and all missed: `pool.query`,
 * `pool.on("connect")`, `pool.on("acquire")`, and wrapping `pool.connect()`.
 *
 * The prototype is the one place every client necessarily shares, whoever
 * constructs it and whenever. `Client.prototype.query` is an own property of
 * the prototype, so a single patch here observes every statement from every
 * pool in the process, with no ordering constraint relative to pool creation.
 *
 * Idempotent, and a no-op unless PERF_INSTRUMENT=1 — the production driver is
 * never touched.
 */
export function instrumentPg(): void {
  if (!ENABLED) return;
  // `createRequire`, not a bare `require`: this module is loaded as ESM (both by
  // Next and by tsx), where `require` is not defined. A bare call throws
  // ReferenceError — and an earlier version of this function swallowed that in
  // an empty catch, which is precisely how the counter came to report a
  // confident, permanent zero. Resolving `pg` through the CJS require cache also
  // guarantees we patch the SAME module object @prisma/adapter-pg holds
  // (dist/index.js:39 `require("pg")`), which is the whole point.
  try {
    const require_ = createRequire(import.meta.url);
    const pg = require_("pg") as { Client?: { prototype: Queryable } };
    const proto = pg.Client?.prototype;
    if (!proto) throw new Error("pg.Client.prototype not found");
    patchQuery(proto);
  } catch (e) {
    // Never break a boot over instrumentation — but never fail silently either.
    // A zero BEGIN count must mean "no transactions", not "the probe missed".
    console.warn("[perf] pg instrumentation failed; wire counts will read 0:", e);
  }
}

/**
 * Retained for the call site in lib/prisma.ts. The pool instance itself is no
 * longer the useful patch point (see instrumentPg above), but patching it costs
 * nothing and still catches direct one-shot `pool.query` calls such as the
 * pre-warm SELECT and the on-connect org_id reset.
 */
export function instrumentPool(pool: Queryable): void {
  if (!ENABLED) return;
  instrumentPg();
  patchQuery(pool);
}
