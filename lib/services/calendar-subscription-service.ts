import type { z } from "zod";
import type { RequestContext } from "@/lib/context";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { createCredential, decryptCredential } from "@/lib/calendar-feed/credentials";
import { feedOrigin, feedRolloutAllowed } from "@/lib/calendar-feed/config";
import { auditCalendarFeed } from "@/lib/calendar-feed/audit";
import type { manageCalendarFeedInput } from "@/lib/validation/calendar-feed";

export async function getCalendarSubscription(ctx: RequestContext) {
  const [subscription, organization, work] = await Promise.all([ctx.db.calendarSubscription.find(), ctx.db.organization.findFirst({ select: { timeZone: true } }), ctx.db.calendarFeedWork.find()]);
  const admin = ctx.isOrgAdmin || ctx.isPlatformAdmin;
  const allowed = feedRolloutAllowed(ctx.orgId);
  const url = allowed && subscription?.enabled && subscription.tokenCiphertext
    ? `${feedOrigin()}/api/calendar/feeds/${subscription.publicId}/${decryptCredential(subscription.publicId, subscription.tokenCiphertext)}.ics` : null;
  return { enabled: subscription?.enabled ?? false, available: allowed, url, timeZone: organization?.timeZone ?? null, admin, validated: Boolean(subscription?.validatedAt), ...(admin ? { issues: await auditCalendarFeed(ctx.db), health: { pending: !work || work.version !== work.appliedVersion, failedAt: work?.failedAt ?? null, processedAt: work?.processedAt ?? null, failures: work?.failures ?? 0 } } : {}) };
}
export async function manageCalendarSubscription(ctx: RequestContext, input: z.infer<typeof manageCalendarFeedInput>) {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) throw new ForbiddenError();
  if (input.action === "timeZone") {
    await ctx.db.$transaction(async tx => {
      await tx.organization.update({ where: { id: ctx.orgId }, data: { timeZone: input.timeZone } });
      // Existing absolute instants keep their source zone. Re-audit before enable.
      await tx.calendarSubscription.update({ where: { organizationId: ctx.orgId }, data: { validatedAt: null, enabled: false } });
    });
  } else {
    const sub = await ctx.db.calendarSubscription.find();
    if (!sub) throw new ValidationError("Calendar subscription migration has not been applied");
    if (input.action === "disable") await ctx.db.calendarSubscription.update({ enabled: false });
    if (input.action === "rotate") await ctx.db.calendarSubscription.update({ ...createCredential(sub.publicId), generation: { increment: 1 } });
    if (input.action === "enable") {
      if (!feedRolloutAllowed(ctx.orgId)) throw new ValidationError("Calendar subscriptions are awaiting rollout validation");
      const organization = await ctx.db.organization.findFirst({ select: { timeZone: true } });
      if (!organization?.timeZone || !sub.validatedAt || !sub.tokenCiphertext) throw new ValidationError("Confirm the time zone and complete the calendar feed audit before enabling");
      const issues = await auditCalendarFeed(ctx.db);
      if (issues.some(i => i.blocking)) throw new ValidationError("Resolve the blocking calendar cleanup items before enabling");
      const work = await ctx.db.calendarFeedWork.find();
      if (!work?.processedAt || work.version !== work.appliedVersion || work.failedAt) throw new ValidationError("Calendar projection is not ready; wait for the worker");
      await ctx.db.calendarSubscription.update({ enabled: true });
    }
  }
  // Never include credential, URL or ciphertext in an event.
  await emit(ctx, "org.config.updated", { type: "Organization", id: ctx.orgId }, { calendarSubscriptionAction: input.action });
}
