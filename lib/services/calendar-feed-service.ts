import type { FeedContext } from "@/lib/auth/calendar-feed";
import { DomainError, NotFoundError } from "@/lib/errors";
import { feedOrigin, feedRolloutAllowed } from "@/lib/calendar-feed/config";
import { renderCalendar } from "@/lib/calendar-feed/render";

export async function readCalendarFeed(ctx: FeedContext) {
  const { subscription, work, organization, items } = await ctx.db.read();
  // Recheck in the same consistent snapshot as content, before ETag handling.
  if (!subscription?.enabled || !subscription.validatedAt || subscription.generation !== ctx.generation || subscription.tokenDigest !== ctx.tokenDigest || !feedRolloutAllowed(ctx.orgId)) throw new NotFoundError("Calendar feed");
  if (!work?.processedAt || work.version !== work.appliedVersion || work.failedAt) throw new DomainError("INTERNAL", "Calendar feed is updating; retry later", 503);
  return renderCalendar(organization.name, organization.slug, items, feedOrigin());
}
