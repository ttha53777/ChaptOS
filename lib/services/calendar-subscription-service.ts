import type { z } from "zod";
import type { RequestContext } from "@/lib/context";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { createCredential, decryptCredential } from "@/lib/calendar-feed/credentials";
import { feedOrigin, feedRolloutAllowed } from "@/lib/calendar-feed/config";
import { feedReadiness } from "@/lib/calendar-feed/validation";
import type { manageCalendarFeedInput } from "@/lib/validation/calendar-feed";

// Deployment prerequisites stay with operators; this only reports whether they're met.
function serverConfigured(): boolean {
  if (!/^[a-f\d]{64}$/i.test(process.env.CALENDAR_FEED_KEY ?? "")) return false;
  try { feedOrigin(); return true; } catch { return false; }
}

export async function getCalendarSubscription(ctx: RequestContext) {
  const [subscription, organization, work] = await Promise.all([ctx.db.calendarSubscription.find(), ctx.db.organization.findFirst({ select: { timeZone: true } }), ctx.db.calendarFeedWork.find()]);
  const admin = ctx.isOrgAdmin || ctx.isPlatformAdmin;
  const allowed = feedRolloutAllowed(ctx.orgId);
  const url = allowed && subscription?.enabled && subscription.tokenCiphertext
    ? `${feedOrigin()}/api/calendar/feeds/${subscription.publicId}/${decryptCredential(subscription.publicId, subscription.tokenCiphertext)}.ics` : null;
  const base = { enabled: subscription?.enabled ?? false, available: allowed, url, timeZone: organization?.timeZone ?? null, admin, validated: Boolean(subscription?.validatedAt) };
  if (!admin) return base;
  const readiness = await feedReadiness(ctx.db);
  return {
    ...base,
    issues: readiness.issues,
    validating: Boolean(subscription?.validationRequestedAt),
    configured: serverConfigured(),
    // A missing link isn't the admin's problem: the check creates it.
    problem: readiness.dataProblem,
    health: { pending: !work || work.version !== work.appliedVersion, failedAt: work?.failedAt ?? null, processedAt: work?.processedAt ?? null, failures: work?.failures ?? 0 },
  };
}

export async function manageCalendarSubscription(ctx: RequestContext, input: z.infer<typeof manageCalendarFeedInput>) {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) throw new ForbiddenError();
  if (input.action === "timeZone") {
    // The zone is only the default for newly entered times: every published
    // timed event carries its own zone and absolute instants, so the feed's
    // content doesn't change and there is nothing to pause or re-validate.
    await ctx.db.organization.update({ where: { id: ctx.orgId }, data: { timeZone: input.timeZone } });
  } else {
    const sub = await ctx.db.calendarSubscription.find();
    if (!sub) throw new ValidationError("Calendar subscription migration has not been applied");
    if (input.action === "disable") await ctx.db.calendarSubscription.update({ enabled: false });
    if (input.action === "rotate") await ctx.db.calendarSubscription.update({ ...createCredential(sub.publicId), generation: { increment: 1 } });
    if (input.action === "validate") {
      const readiness = await feedReadiness(ctx.db);
      if (readiness.dataProblem) throw new ValidationError(readiness.dataProblem);
      if (!readiness.provisioned) {
        if (!serverConfigured()) throw new ValidationError("Calendar subscriptions aren't set up on this server yet. Ask your ChaptOS administrator.");
        await ctx.db.calendarSubscription.update({ ...createCredential(sub.publicId), generation: { increment: 1 } });
      }
      // The worker runs a full projection, then settles this request. Enqueue so
      // an idle org still gets that pass; the check never runs inside a request.
      await ctx.db.calendarSubscription.update({ validationRequestedAt: new Date() });
      await ctx.db.calendarFeedWork.enqueue();
    }
    if (input.action === "enable") {
      if (!feedRolloutAllowed(ctx.orgId)) throw new ValidationError("Calendar subscriptions are awaiting rollout validation");
      const readiness = await feedReadiness(ctx.db);
      if (readiness.problem) throw new ValidationError(readiness.problem);
      if (!sub.validatedAt) throw new ValidationError("Run the publication check before turning subscriptions on");
      const work = await ctx.db.calendarFeedWork.find();
      if (!work?.processedAt || work.version !== work.appliedVersion || work.failedAt) throw new ValidationError("Calendar updates are still publishing; try again in a minute");
      await ctx.db.calendarSubscription.update({ enabled: true });
    }
  }
  // Never include credential, URL or ciphertext in an event.
  await emit(ctx, "org.config.updated", { type: "Organization", id: ctx.orgId }, { calendarSubscriptionAction: input.action });
}
