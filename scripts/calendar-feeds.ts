/** Operator-only runner. No URLs, bearer tokens, or source notes in output. */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { prismaPrivileged } = await import("../lib/prisma-privileged");
  const { db } = await import("../lib/db");
  const { createCredential } = await import("../lib/calendar-feed/credentials");
  const { auditCalendarFeed } = await import("../lib/calendar-feed/audit");
  const { refreshCalendarFeed } = await import("../lib/calendar-feed/worker");
  const { feedReadiness } = await import("../lib/calendar-feed/validation");
  const { legacySchedule, scheduleSchema, validDate, validZone } = await import("../lib/calendar-feed/schedule");
  const args = process.argv.slice(2);
  const command = args[0] ?? "audit";
  if (!["audit", "provision", "backfill", "validate", "worker"].includes(command)) throw new Error("Use audit|provision|backfill|validate|worker [--org=ID] [--watch]");
  const orgArg = args.find(v => v.startsWith("--org="))?.slice(6);
  if (orgArg && (!/^\d+$/.test(orgArg) || Number(orgArg) < 1)) throw new Error("Invalid org ID");
  do {
    // Cross-org operator inventory only; all schedule access below uses db(orgId).
    const orgs = await prismaPrivileged.organization.findMany({ where: orgArg ? { id: Number(orgArg) } : {}, select: { id: true } });
    for (const { id: orgId } of orgs) {
      const scoped = db(orgId);
      try {
        const org = await scoped.organization.findFirst({ select: { timeZone: true } });
        const subscription = await scoped.calendarSubscription.find();
        if (!subscription) throw new Error("Apply calendar migration first");
        if (command === "provision" && !subscription.tokenCiphertext) await scoped.calendarSubscription.update({ ...createCredential(subscription.publicId), generation: { increment: 1 } });
        if (command === "backfill") {
          if (!org?.timeZone || !validZone(org.timeZone)) throw new Error("An officer must confirm the organization time zone first");
          await scoped.$transaction(async tx => {
            // Date-only rows are unambiguous; free text times remain a cleanup
            // item because their end was never captured. Do not invent one.
            const rows = await tx.calendarEvent.findMany({ where: { organizationId: orgId }, select: { id: true, date: true, time: true, schedule: true } });
            for (const row of rows) if (!row.time?.trim() && !scheduleSchema.safeParse(row.schedule).success) {
              const { schedule } = legacySchedule(row.date, null);
              if (schedule) await tx.calendarEvent.update({ where: { id: row.id, organizationId: orgId }, data: { schedule } });
            }
            const unlinked = await tx.serviceEvent.findMany({ where: { organizationId: orgId, calendarEventId: null } });
            for (const service of unlinked) {
              if (!validDate(service.date)) continue;
              // Any potential existing match requires manual review. Never guess
              // which identity owns attendance or create a probable duplicate.
              const candidates = await tx.calendarEvent.count({ where: { organizationId: orgId, OR: [{ title: service.title }, { date: service.date, category: "service" }] } });
              if (candidates) continue;
              const event = await tx.calendarEvent.create({ data: { organizationId: orgId, title: service.title, date: service.date, category: "service", location: service.location, mandatory: false, schedule: legacySchedule(service.date, null).schedule! } });
              await tx.serviceEvent.update({ where: { id: service.id, organizationId: orgId }, data: { calendarEventId: event.id } });
            }
          }, { timeout: 60_000 });
        }
        if (command === "worker") {
          const work = await scoped.calendarFeedWork.find();
          const retryDelay = Math.min(300_000, 1000 * 2 ** Math.min(work?.failures ?? 0, 8));
          if (work?.failedAt && Date.now() - work.failedAt.getTime() < retryDelay) continue;
          // Reconcile daily even if no work is pending (also purges expired
          // canceled content while retaining permanent identities).
          await refreshCalendarFeed(orgId, !work?.processedAt || Date.now() - work.processedAt.getTime() > 86400_000);
          const after = await scoped.calendarFeedWork.find();
          console.log(JSON.stringify({ orgId, pending: after?.version !== after?.appliedVersion, failures: after?.failures, lagMs: after && after.version !== after.appliedVersion ? Date.now() - after.enqueuedAt.getTime() : 0 }));
          continue;
        }
        const issues = await auditCalendarFeed(scoped);
        if (command === "validate") {
          // Same path as Settings → "Check publication": request, then a full
          // projection that settles the request.
          if ((await feedReadiness(scoped)).problem) throw new Error("Confirm zone, provision credentials, and resolve blocking audit items first");
          await scoped.calendarSubscription.update({ validationRequestedAt: new Date() });
          await scoped.calendarFeedWork.enqueue();
          await refreshCalendarFeed(orgId, true);
          if (!(await scoped.calendarSubscription.find())?.validatedAt) throw new Error("Validation did not pass");
        }
        console.log(JSON.stringify({ orgId, command, issues }));
      } catch {
        // Generic message only; DB exceptions can contain source fields.
        console.error(JSON.stringify({ orgId, command, error: "Calendar operation failed; inspect audit, zone, provisioning and worker health" }));
        if (!args.includes("--watch")) process.exitCode = 1;
      }
    }
    if (!args.includes("--watch")) break;
    await new Promise(resolve => setTimeout(resolve, 30_000));
  } while (true);
  await prismaPrivileged.$disconnect();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
}
void main().catch(() => { console.error("Calendar command failed"); process.exitCode = 1; });
