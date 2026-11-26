/**
 * Draining the push outbox. A trusted worker: it runs after a response
 * (scheduleFlush), from the daily sweep (/api/cron/push), and from the flush
 * script. It reads across orgs and must read the global PushDevice table, so it
 * runs as prismaPrivileged — every row it touches was written org-scoped by a
 * handler, and it only ever delivers a row to the devices of that row's own
 * recipient.
 *
 *   1. drop pushes past their expiresAt (a late check-in buzz is worse than none)
 *   2. claim pending rows with a lease (concurrent flushes never double-send)
 *   3. send to every device of each recipient, 100 per Expo request
 *   4. prune tokens Expo calls DeviceNotRegistered, from tickets now and from
 *      receipts ~15 min later
 */
import { prismaPrivileged } from "@/lib/prisma-privileged"; // lint-direct-prisma:ignore global PushDevice table / cross-org outbox drain, see the file header
import { logError } from "@/lib/observability";
import { PushMessageStatus } from "@/lib/state/push";
import { PUSH_MAX_ATTEMPTS, RECEIPT_DELAY_MS, pushEnabled } from "./config";
import { withOrg } from "./copy";
import { forAccounts, prune } from "./devices";
import { RECEIPT_BATCH, SEND_BATCH, expoReceipts, expoSend, type ExpoMessage } from "./expo";

const LEASE_MS = 60_000;
const KEEP_DAYS = 30;

/** What a sent row remembers about each ticket, so a receipt can name its token. */
type TicketRef = { id: string; token: string };

export interface FlushResult { sent: number; dropped: number; failed: number; pruned: number; receipts: number }

export async function flushPush(limit = 500): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, dropped: 0, failed: 0, pruned: 0, receipts: 0 };
  if (!pushEnabled()) return result;
  const p = prismaPrivileged;
  const now = new Date();

  result.dropped += (await p.pushMessage.updateMany({
    where: { status: PushMessageStatus.Pending, expiresAt: { lte: now } },
    data:  { status: PushMessageStatus.Dropped, error: "expired", leaseUntil: null },
  })).count;

  // Claim. The lease value doubles as this flush's claim token.
  const candidates = await p.pushMessage.findMany({
    where: { status: PushMessageStatus.Pending, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    orderBy: { id: "asc" }, take: limit, select: { id: true },
  });
  if (candidates.length > 0) {
    const lease = new Date(now.getTime() + LEASE_MS + Math.floor(Math.random() * 1000));
    await p.pushMessage.updateMany({
      where: { id: { in: candidates.map(c => c.id) }, status: PushMessageStatus.Pending, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
      data:  { leaseUntil: lease, attempts: { increment: 1 } },
    });
    const rows = await p.pushMessage.findMany({ where: { leaseUntil: lease, status: PushMessageStatus.Pending }, orderBy: { id: "asc" } });
    if (rows.length > 0) await deliver(rows, lease, result);
  }

  await checkReceipts(result);
  await p.pushMessage.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - KEEP_DAYS * 86_400_000) } } });
  return result;
}

type Row = Awaited<ReturnType<typeof prismaPrivileged.pushMessage.findMany>>[number];

async function deliver(rows: Row[], lease: Date, result: FlushResult) {
  const p = prismaPrivileged;
  const brotherIds = [...new Set(rows.map(r => r.brotherId))];
  const orgIds = [...new Set(rows.map(r => r.organizationId))];
  const [brothers, orgs, memberships] = await Promise.all([
    p.brother.findMany({ where: { id: { in: brotherIds } }, select: { id: true, authUserId: true } }),
    p.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, slug: true } }),
    p.membership.groupBy({ by: ["brotherId"], where: { brotherId: { in: brotherIds } }, _count: { _all: true } }),
  ]);
  const account = new Map(brothers.map(b => [b.id, b.authUserId]));
  const org = new Map(orgs.map(o => [o.id, o]));
  const multiOrg = new Set(memberships.filter(m => m._count._all > 1).map(m => m.brotherId));
  const devices = await forAccounts([...new Set(brothers.map(b => b.authUserId).filter((a): a is string => !!a))]);
  const byAccount = new Map<string, string[]>();
  for (const d of devices) byAccount.set(d.authUserId, [...(byAccount.get(d.authUserId) ?? []), d.token]);

  // One Expo message per (row, device).
  const out: { rowId: number; msg: ExpoMessage }[] = [];
  const noDevice: number[] = [];
  for (const r of rows) {
    const tokens = byAccount.get(account.get(r.brotherId) ?? "") ?? [];
    const o = org.get(r.organizationId);
    if (tokens.length === 0 || !o) { noDevice.push(r.id); continue; }
    const ttl = Math.max(60, Math.floor((r.expiresAt.getTime() - Date.now()) / 1000));
    for (const to of tokens) out.push({ rowId: r.id, msg: {
      to, title: withOrg(r.title, o.name, multiOrg.has(r.brotherId)), body: r.body,
      data: { url: r.url, orgSlug: o.slug, category: r.category },
      sound: "default", channelId: r.category === "membership" ? "default" : r.category,
      priority: r.category === "checkin" ? "high" : "default", ttl,
    } });
  }
  if (noDevice.length) {
    result.dropped += (await p.pushMessage.updateMany({ where: { id: { in: noDevice }, leaseUntil: lease }, data: { status: PushMessageStatus.Dropped, error: "no device", leaseUntil: null } })).count;
  }

  const tickets = new Map<number, TicketRef[]>();
  const failedRows = new Map<number, string>();
  const dead: string[] = [];
  for (let i = 0; i < out.length; i += SEND_BATCH) {
    const batch = out.slice(i, i + SEND_BATCH);
    try {
      const res = await expoSend(batch.map(b => b.msg));
      res.forEach((t, j) => {
        const { rowId, msg } = batch[j]!;
        if (t.status === "ok") tickets.set(rowId, [...(tickets.get(rowId) ?? []), { id: t.id, token: msg.to }]);
        else if (t.details?.error === "DeviceNotRegistered") dead.push(msg.to);
        else failedRows.set(rowId, t.message);
      });
    } catch (e) {
      logError(e, { route: "push/flush", method: "SEND", extra: { rows: batch.length } });
      for (const b of batch) failedRows.set(b.rowId, e instanceof Error ? e.message : String(e));
    }
  }
  if (dead.length) result.pruned += await prune(dead);

  const sentAt = new Date();
  const delivered = rows.filter(r => !noDevice.includes(r.id));
  for (const r of delivered) {
    const refs = tickets.get(r.id);
    if (refs?.length) {
      await p.pushMessage.updateMany({ where: { id: r.id, leaseUntil: lease }, data: { status: PushMessageStatus.Sent, sentAt, ticketIds: refs, leaseUntil: null, error: null } });
      result.sent++;
    } else if (failedRows.has(r.id) && r.attempts < PUSH_MAX_ATTEMPTS) {
      // Retry later: the lease simply runs out. Backoff grows with attempts.
      await p.pushMessage.updateMany({ where: { id: r.id, leaseUntil: lease }, data: { leaseUntil: new Date(Date.now() + 30_000 * 2 ** r.attempts), error: failedRows.get(r.id) } });
    } else if (failedRows.has(r.id)) {
      await p.pushMessage.updateMany({ where: { id: r.id, leaseUntil: lease }, data: { status: PushMessageStatus.Failed, leaseUntil: null, error: failedRows.get(r.id) } });
      result.failed++;
    } else {
      // Every device it went to was dead (and is now pruned).
      await p.pushMessage.updateMany({ where: { id: r.id, leaseUntil: lease }, data: { status: PushMessageStatus.Dropped, leaseUntil: null, error: "device not registered" } });
      result.dropped++;
    }
  }
}

/** Receipts for sends at least RECEIPT_DELAY_MS old; DeviceNotRegistered prunes the token. */
export async function checkReceipts(result: FlushResult, now = new Date()) {
  const p = prismaPrivileged;
  const rows = await p.pushMessage.findMany({
    where: { status: PushMessageStatus.Sent, receiptsCheckedAt: null, sentAt: { lte: new Date(now.getTime() - RECEIPT_DELAY_MS) } },
    orderBy: { id: "asc" }, take: 300, select: { id: true, ticketIds: true, sentAt: true },
  });
  if (rows.length === 0) return;
  const refs = rows.flatMap(r => (Array.isArray(r.ticketIds) ? r.ticketIds as TicketRef[] : []));
  const receipts: Record<string, Awaited<ReturnType<typeof expoReceipts>>[string]> = {};
  try {
    for (let i = 0; i < refs.length; i += RECEIPT_BATCH) Object.assign(receipts, await expoReceipts(refs.slice(i, i + RECEIPT_BATCH).map(r => r.id)));
  } catch (e) {
    logError(e, { route: "push/flush", method: "RECEIPTS" });
    return;
  }
  const dead = refs.filter(r => { const x = receipts[r.id]; return x?.status === "error" && x.details?.error === "DeviceNotRegistered"; }).map(r => r.token);
  if (dead.length) result.pruned += await prune(dead);
  // A receipt Expo hasn't produced yet is retried next time, until a day has passed.
  const stale = new Date(now.getTime() - 86_400_000);
  const done = rows.filter(r => {
    const ids = (Array.isArray(r.ticketIds) ? r.ticketIds as TicketRef[] : []).map(t => t.id);
    return ids.every(id => receipts[id]) || (r.sentAt && r.sentAt < stale);
  }).map(r => r.id);
  if (done.length) await p.pushMessage.updateMany({ where: { id: { in: done } }, data: { receiptsCheckedAt: now } });
  result.receipts += done.length;
}
