// PATCH /api/calendar/[id]/details body: claim or unclaim a "who's bringing what" item
// (officers may also tick a checklist item). Defined beside the details model it acts on
// (lib/event-details.ts, zod only); re-exported here so the native app can type its
// request from lib/validation without pulling the calendar schemas (Temporal) along.
export { detailActionInput } from "@/lib/event-details";
export type { DetailAction } from "@/lib/event-details";
