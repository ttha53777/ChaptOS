import type { z } from "zod";
import type { RequestContext } from "@/lib/context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { createCredential, decryptCredential } from "@/lib/calendar-feed/credentials";
import { feedOrigin, feedRolloutAllowed } from "@/lib/calendar-feed/config";
import { feedReadiness } from "@/lib/calendar-feed/validation";
import { upcomingPreview } from "@/lib/calendar-feed/preview";
import { legacySchedule, validDate } from "@/lib/calendar-feed/schedule";
import type { manageCalendarFeedInput } from "@/lib/validation/calendar-feed";

// Deployment prerequisites stay with operators; this only reports whether they're met.
function serverConfigured(): boolean {
  if (!/^[a-f\d]{64}$/i.test(process.env.CALENDAR_FEED_KEY ?? "")) return false;
  try { feedOrigin(); return true; } catch { return false; }
}

/**
 * What a member may know about publishing. `unknown` covers "no work row" and
 * "never published": missing health data must never read as up to date. While
 * work is pending or retrying the feed answers 503, so calendar apps keep the
 * last copy they fetched; `updatedAt` is when that copy was published.
 */
function memberStatus(work: { version: number; appliedVersion: number; processedAt: Date | null; failedAt: Date | null } | null) {
  const updatedAt = work?.appliedVersion ? work.processedAt : null;
  const state = !work || !updatedAt ? "unknown"
    : work.failedAt ? "retrying"
    : work.version !== work.appliedVersion ? "publishing"
    : "current";
  return { state, updatedAt } as const;
}

/** Cheap "can members subscribe right now?" for the dashboard invite. Skips the
 *  readiness audit that the full admin view runs. */
export async function calendarFeedLive(ctx: RequestContext) {
  const subscription = await ctx.db.calendarSubscription.find();
  return { live: Boolean(feedRolloutAllowed(ctx.orgId) && subscription?.enabled && subscription.tokenCiphertext) };
}

/** `memberView` skips the admin-only readiness audit (the slow part) even for admins. */
export async function getCalendarSubscription(ctx: RequestContext, { memberView = false }: { memberView?: boolean } = {}) {
  const [subscription, organization, work] = await Promise.all([ctx.db.calendarSubscription.find(), ctx.db.organization.findFirst({ select: { name: true, timeZone: true } }), ctx.db.calendarFeedWork.find()]);
  const admin = ctx.isOrgAdmin || ctx.isPlatformAdmin;
  const allowed = feedRolloutAllowed(ctx.orgId);
  const url = allowed && subscription?.enabled && subscription.tokenCiphertext
    ? `${feedOrigin()}/api/calendar/feeds/${subscription.publicId}/${decryptCredential(subscription.publicId, subscription.tokenCiphertext)}.ics` : null;
  const timeZone = organization?.timeZone ?? null;
  // Only preview what a subscriber can actually fetch right now.
  const preview = url ? upcomingPreview(await ctx.db.calendarFeedItem.list(), timeZone) : [];
  const base = { enabled: subscription?.enabled ?? false, available: allowed, url, orgName: organization?.name ?? "", preview, timeZone, admin, validated: Boolean(subscription?.validatedAt), status: memberStatus(work), generation: subscription?.generation ?? 0 };
  if (!admin || memberView) return base;
  const readiness = await feedReadiness(ctx.db);
  return {
    ...base,
    issues: readiness.issues,
    validating: Boolean(subscription?.validationRequestedAt),
    // The pending check also turns the calendar on when it passes.
    turningOn: Boolean(subscription?.validationRequestedAt && subscription.enableOnValidation),
    configured: serverConfigured(),
    // A missing link isn't the admin's problem: the check creates it.
    problem: readiness.dataProblem,
    health: { pending: !work || work.version !== work.appliedVersion, failedAt: work?.failedAt ?? null, processedAt: work?.processedAt ?? null, failures: work?.failures ?? 0 },
  };
}

export async function manageCalendarSubscription(ctx: RequestContext, input: z.infer<typeof manageCalendarFeedInput>) {
  if (!ctx.isOrgAdmin && !ctx.isPlatformAdmin) throw new ForbiddenError();
  if (input.action === "link") return linkToTimeline(ctx, input.id);
  if (input.action === "timeZone") {
    // Events with a saved schedule carry their own zone, but a typed time
    // ("7:00 PM") is read in the org's zone, so republish those.
    await ctx.db.organization.update({ where: { id: ctx.orgId }, data: { timeZone: input.timeZone } });
    await ctx.db.calendarFeedWork.enqueue();
  } else {
    const sub = await ctx.db.calendarSubscription.find();
    if (!sub) throw new ValidationError("Calendar subscription migration has not been applied");
    // Also cancels a pending turn-on, so the check can't switch it back on.
    if (input.action === "disable") await ctx.db.calendarSubscription.update({ enabled: false, enableOnValidation: false });
    if (input.action === "turnOn") await turnOn(ctx, sub, input.timeZone);
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

/**
 * Settings' one button: save the zone if it came along, then go live. With a
 * passing check on file and nothing left to publish it's immediate; otherwise
 * it requests a check (creating the link if needed) that the worker settles,
 * turning the calendar on if it passes. The admin doesn't have to come back.
 */
async function turnOn(ctx: RequestContext, sub: { publicId: string; validatedAt: Date | null }, timeZone?: string) {
  if (!feedRolloutAllowed(ctx.orgId)) throw new ValidationError("Calendar subscriptions are awaiting rollout validation");
  if (timeZone) await ctx.db.organization.update({ where: { id: ctx.orgId }, data: { timeZone } });
  const readiness = await feedReadiness(ctx.db);
  if (readiness.dataProblem) throw new ValidationError(readiness.dataProblem);
  const work = await ctx.db.calendarFeedWork.find();
  const settled = work?.processedAt && work.version === work.appliedVersion && !work.failedAt;
  if (sub.validatedAt && readiness.provisioned && settled) {
    await ctx.db.calendarSubscription.update({ enabled: true });
    return;
  }
  if (!readiness.provisioned) {
    if (!serverConfigured()) throw new ValidationError("Calendar subscriptions aren't set up on this server yet. Ask your ChaptOS administrator.");
    await ctx.db.calendarSubscription.update({ ...createCredential(sub.publicId), generation: { increment: 1 } });
  }
  await ctx.db.calendarSubscription.update({ validationRequestedAt: new Date(), enableOnValidation: true });
  await ctx.db.calendarFeedWork.enqueue();
}

/**
 * Readiness repair for one service project with no timeline entry, the same
 * rule as `calendar:feeds backfill` (see docs/calendar-subscriptions-rollout.md):
 * create an all-day entry only when no existing event could already be it, and
 * copy no notes. Parties are never synthesized: their attendance may belong to
 * an existing event. Re-saving the project doesn't do this; only create does.
 */
async function linkToTimeline(ctx: RequestContext, id: number) {
  const created = await ctx.db.$transaction(async tx => {
    const service = await tx.serviceEvent.findFirst({ where: { id, organizationId: ctx.orgId }, select: { title: true, date: true, location: true, calendarEventId: true } });
    if (!service) throw new NotFoundError("Service event");
    if (service.calendarEventId != null && await tx.calendarEvent.count({ where: { id: service.calendarEventId, organizationId: ctx.orgId } })) return null;
    if (!validDate(service.date)) throw new ValidationError("This service project's date isn't a real date. Fix it on the Service page first.");
    // Any potential existing match needs a person to decide. Never guess which
    // identity owns attendance, or create a probable duplicate.
    const candidates = await tx.calendarEvent.count({ where: { organizationId: ctx.orgId, OR: [{ title: service.title }, { date: service.date, category: "service" }] } });
    if (candidates) throw new ValidationError(`The timeline already has an event named "${service.title}" or a service event on ${service.date}, so this can't be added automatically. Open Service to check which one it is.`);
    const event = await tx.calendarEvent.create({ data: { organizationId: ctx.orgId, title: service.title, date: service.date, category: "service", location: service.location, mandatory: false, schedule: legacySchedule(service.date, null).schedule! } });
    await tx.serviceEvent.update({ where: { id, organizationId: ctx.orgId }, data: { calendarEventId: event.id } });
    return event;
  });
  if (created) await emit(ctx, "calendar.created", { type: "CalendarEvent", id: created.id }, { title: created.title, date: created.date, category: created.category });
}
