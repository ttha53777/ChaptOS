/**
 * The DB-backed half of the event-field registry: loading an org's live field
 * definitions so `sanitizeFieldValues` has something to sanitize against.
 *
 * Split from lib/event-fields.ts because that module is reachable from the events
 * page and must stay free of @/lib/db and @/lib/errors — importing either there
 * pulls the Prisma runtime into the browser and 500s the dev server while tsc and
 * vitest stay green. Everything here is server-only. Same split, same reason, as
 * lib/transaction-categories.ts / -db.ts.
 */

import type { db } from "@/lib/db";
import { isFieldKind, type EventFieldDef } from "@/lib/event-fields";

/** Org-scoped data accessor (same shape as ctx.db) — matches lib/dues.ts. */
type Scoped = ReturnType<typeof db>;

/**
 * This org's optional field definitions, in display order.
 *
 * Returns DISABLED rows too. The caller decides: `sanitizeFieldValues` filters on
 * `enabled` itself (so a disabled field's answers stay on disk but never reach a
 * response), while the settings surface and the create-time duplicate guard need
 * to see every row — a disabled "Budget" is still a slug nothing else may claim.
 *
 * `kind` is narrowed here rather than trusted: it is a String column with a CHECK
 * constraint, and the constraint is the guarantee, but a row written before a
 * future kind is retired should degrade to text rather than crash the page.
 */
export async function loadEventFieldDefs(scoped: Scoped): Promise<EventFieldDef[]> {
  const rows = await scoped.eventFieldDefinition.findMany({
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    select:  {
      slug: true, label: true, kind: true, enabled: true, builtin: true, displayOrder: true,
    },
  }) as { slug: string; label: string; kind: string; enabled: boolean; builtin: boolean; displayOrder: number }[];

  return rows.map(r => ({
    slug:         r.slug,
    label:        r.label,
    kind:         isFieldKind(r.kind) ? r.kind : "text",
    enabled:      r.enabled,
    builtin:      r.builtin,
    displayOrder: r.displayOrder,
  }));
}
