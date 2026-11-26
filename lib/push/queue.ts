/**
 * Turning an event into queued pushes. Handlers call queuePush() with a
 * recipient list; this drops the actor, applies each member's preference,
 * writes the outbox rows (idempotent on dedupeKey) and schedules a send for
 * after the response. Everything here is org-scoped through ctx.db.
 */
import { after } from "next/server";
import type { RequestContext } from "@/lib/context";
import { logError } from "@/lib/observability";
import type { PushCategory, PushMessageCategory } from "@/lib/state/push";
import { categoryDefault } from "./categories";
import { PUSH_TTL_MS, pushEnabled } from "./config";
import type { PushCopy } from "./copy";
import { flushPush } from "./sender";

export interface QueuePushSpec {
  category: PushMessageCategory;
  recipients: Iterable<number>;
  /** Unique per (push, recipient) — the brotherId is appended. */
  dedupeKey: string;
  copy: PushCopy;
  /** App path under the org, e.g. "checkin" or "tasks/12". */
  path: string;
  /** Send even to the actor (only "You're in", where the actor is the officer anyway). */
  includeActor?: boolean;
}

/** Drop members who switched this category off. No row means the default. */
export async function withPreference(ctx: RequestContext, ids: number[], category: PushCategory): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await ctx.db.notificationPreference.forBrothers(ids);
  const choice = new Map(rows.filter(r => r.category === category).map(r => [r.brotherId, r.enabled]));
  const dflt = categoryDefault(category);
  return ids.filter(id => choice.get(id) ?? dflt);
}

/** chaptos://org/<slug>/<path>. The app maps it to a screen and switches org first. */
export function pushUrl(slug: string, path: string): string {
  return `chaptos://org/${encodeURIComponent(slug)}/${path}`;
}

export async function queuePush(ctx: RequestContext, spec: QueuePushSpec): Promise<number> {
  if (!pushEnabled()) return 0;
  let ids = [...new Set(spec.recipients)].filter(id => Number.isInteger(id) && id > 0);
  if (!spec.includeActor) ids = ids.filter(id => id !== ctx.actorId);
  if (spec.category !== "membership") ids = await withPreference(ctx, ids, spec.category);
  if (ids.length === 0) return 0;

  const org = await ctx.db.organization.findUnique({ where: { id: ctx.orgId }, select: { slug: true } });
  if (!org) return 0;
  const url = pushUrl(org.slug, spec.path);
  const expiresAt = new Date(Date.now() + PUSH_TTL_MS[spec.category]);
  const queued = await ctx.db.pushMessage.enqueue(ids.map(brotherId => ({
    brotherId, category: spec.category, dedupeKey: `${spec.dedupeKey}:${brotherId}`,
    title: spec.copy.title, body: spec.copy.body, url, expiresAt,
  })));
  if (queued > 0) scheduleFlush();
  return queued;
}

/**
 * Send after the response (next/server after()), so a big roster never holds a
 * request or the 3s handler budget. Outside a request (the admission-delivery
 * script, tests) after() throws, and the send runs inline instead.
 */
let testScheduler: (() => void) | null = null;
/** Tests replace the scheduler so a background send never races their assertions. */
export function _setFlushSchedulerForTest(fn: (() => void) | null): void { testScheduler = fn; }

export function scheduleFlush(): void {
  if (testScheduler) return testScheduler();
  const run = () => flushPush().catch(e => logError(e, { route: "push/flush", method: "AFTER" }));
  try {
    after(run);
  } catch {
    void run();
  }
}
