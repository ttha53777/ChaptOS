/**
 * The DB-backed half of lib/event-details.ts: saving the blank detail set an
 * event type opens new events with ("Start every Social event with these").
 *
 * Split out because lib/event-details.ts is imported by the event form and the
 * timeline rail and must stay free of the Prisma runtime (same split as
 * lib/event-fields.ts / -db.ts). Both the calendar and the service-event create
 * paths call this, so it lives here rather than in either service.
 *
 * Gated by the caller's MANAGE_EVENTS rather than the org-admin gate that guards
 * the rest of CalendarEventType: by the event-field service's argument, the
 * officer shaping tonight's event is the one who knows what the next one needs.
 * It only ever touches this one column.
 */
import { Prisma } from "@/app/generated/prisma/client";
import { toTemplate, type EventDetail } from "@/lib/event-details";

export async function rememberDetailTemplate(
  tx: Prisma.TransactionClient,
  orgId: number,
  category: string,
  details: EventDetail[],
  remember: boolean,
): Promise<void> {
  // Explicit organizationId: the tx client is raw, no scoped wrapper.
  await tx.calendarEventType.updateMany({
    where: { organizationId: orgId, slug: category },
    data:  { detailTemplate: remember && details.length ? toTemplate(details) : Prisma.DbNull },
  });
}
